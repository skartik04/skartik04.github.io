// The network in plain JavaScript over the nonzero weights only: word tokenizer, embedding, RoPE attention, ReLU MLPs, softmax, greedy generation.
function makeEngine(DATA) {
  const { D, layers, heads: H, mlp: M } = DATA.spec, T = DATA.tokens, V = T.length, dh = D / H, BASE = 10000, MAX_NEW = 48;
  const tid = new Map(T.map((t, i) => [t, i]));

  function tokenize(text) {   // lower case; a word is one token, a number one token per digit, . ? , their own tokens
    const ids = [];
    for (const p of text.toLowerCase().match(/[a-z]+|\d|[.?,]/g) || []) {
      if (!tid.has(p)) return { error: p };
      ids.push(tid.get(p));
    }
    return { ids };
  }

  function decode(ids) {
    let out = '';
    for (const i of ids) {
      if (i < 2) continue;
      const t = T[i];
      out += (/^\d$/.test(t) && /\d$/.test(out)) ? t : ' ' + t;
    }
    return out.trim();
  }

  function loadNet(net) {   // each tensor as rows of (column, value) pairs; the last axis is the column
    const w = {};
    for (const k in DATA.shapes) {
      const sh = DATA.shapes[k], nc = sh[sh.length - 1], rows = sh.slice(0, -1).reduce((a, b) => a * b, 1), [idx, val] = net.sparse[k];
      if (sh.length === 1) { const b = new Float64Array(nc); idx.forEach((i, n) => b[i] = val[n]); w[k] = b; continue; }
      const ptr = new Int32Array(rows + 1), col = new Int32Array(idx.length);
      idx.forEach((i, n) => { ptr[Math.floor(i / nc) + 1]++; col[n] = i % nc; });
      for (let r = 0; r < rows; r++) ptr[r + 1] += ptr[r];
      w[k] = { ptr, col, val: Float64Array.from(val) };
    }
    return w;
  }

  function addMat(m, row0, x, nIn, out) {   // out += x @ W for the rows row0 .. row0 + nIn - 1
    for (let i = 0; i < nIn; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      for (let p = m.ptr[row0 + i], e = m.ptr[row0 + i + 1]; p < e; p++) out[m.col[p]] += xi * m.val[p];
    }
  }

  function rope(v, t) {   // rotate the pair (2i, 2i+1) by the angle t * BASE^(-2i/dh)
    for (let i = 0; i < dh / 2; i++) {
      const ang = t * Math.pow(BASE, -2 * i / dh), c = Math.cos(ang), s = Math.sin(ang), a = v[2 * i], b = v[2 * i + 1];
      v[2 * i] = a * c - b * s; v[2 * i + 1] = a * s + b * c;
    }
  }

  function newState() {
    const mk = () => Array.from({ length: layers }, () => Array.from({ length: H }, () => []));
    return { t: 0, K: mk(), Vv: mk() };
  }

  function step(w, st, tok) {   // feed one token at position st.t; returns the logits for the next token
    const t = st.t, x = new Float64Array(D);
    addMat(w.E, tok, [1], 1, x);
    for (let l = 0; l < layers; l++) {
      const add = new Float64Array(D), L = l + 1;
      for (let h = 0; h < H; h++) {
        const q = new Float64Array(dh), k = new Float64Array(dh), v = new Float64Array(dh);
        addMat(w['Q' + L], h * D, x, D, q); rope(q, t);
        addMat(w['K' + L], h * D, x, D, k); rope(k, t);
        addMat(w['V' + L], h * D, x, D, v);
        st.K[l][h].push(k); st.Vv[l][h].push(v);
        const s = new Float64Array(t + 1); let top = -Infinity;
        for (let u = 0; u <= t; u++) {
          const ku = st.K[l][h][u]; let d = 0;
          for (let j = 0; j < dh; j++) d += q[j] * ku[j];
          s[u] = d / Math.sqrt(dh); if (s[u] > top) top = s[u];
        }
        let z = 0;
        for (let u = 0; u <= t; u++) { s[u] = Math.exp(s[u] - top); z += s[u]; }
        const mix = new Float64Array(dh);
        for (let u = 0; u <= t; u++) {
          const a = s[u] / z, vu = st.Vv[l][h][u];
          for (let j = 0; j < dh; j++) mix[j] += a * vu[j];
        }
        addMat(w['O' + L], h * dh, mix, dh, add);
      }
      for (let i = 0; i < D; i++) x[i] += add[i];
      const hid = Float64Array.from(w['M' + L + '_b']);
      addMat(w['M' + L + '_in'], 0, x, D, hid);
      for (let i = 0; i < M; i++) if (hid[i] < 0) hid[i] = 0;
      addMat(w['M' + L + '_out'], 0, hid, M, x);
    }
    const logits = new Float64Array(V);
    addMat(w.U, 0, x, D, logits);
    st.t++;
    return logits;
  }

  function generate(w, ids, nTop = 5) {   // ids without BOS; greedy until EOS or 24 tokens; ties go to the lowest id
    const st = newState(); let lg = step(w, st, 0);
    for (const i of ids) lg = step(w, st, i);
    const steps = [];
    for (let n = 0; n < MAX_NEW; n++) {
      let top = -Infinity, best = 0;
      for (let i = 0; i < V; i++) if (lg[i] > top) { top = lg[i]; best = i; }
      let z = 0; for (let i = 0; i < V; i++) z += Math.exp(lg[i] - top);
      const order = [];
      if (nTop) { const key = Array.from(lg.keys()).sort((a, b) => lg[b] - lg[a] || a - b).slice(0, nTop); for (const i of key) order.push({ id: i, p: Math.exp(lg[i] - top) / z }); }
      steps.push({ id: best, p: 1 / z, top: order });
      if (best === 1) break;
      lg = step(w, st, best);
    }
    return steps;
  }

  function grade(ids, ans) {   // number: the last number of the reply; word: the reply contains it; both need EOS
    if (!ids.length || ids[ids.length - 1] !== 1) return false;
    const text = decode(ids);
    if (/^\d+$/.test(ans)) { const n = text.match(/\d+/g); return !!n && n[n.length - 1] === ans; }
    return text.split(' ').includes(ans);
  }

  return { tokenize, decode, loadNet, generate, grade, newState, step };
}
if (typeof module !== 'undefined') module.exports = makeEngine;
