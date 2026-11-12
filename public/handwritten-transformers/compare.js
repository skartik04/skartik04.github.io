'use strict';
(async()=>{
 if(new URLSearchParams(location.search).get('embed')==='1'){
  document.documentElement.classList.add('embedded-demo');
  const report=()=>window.parent.postMessage({type:'handwritten-demo-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(document.querySelector('main'));window.addEventListener('load',report);
 }
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let D;try{const r=await fetch('data.json');if(!r.ok)throw Error('Cannot load model data');D=await r.json();}catch(e){$('global-status').textContent=e.message;return;}
 const keys=['astra','sol'],workers={},states={},saved={},groups=[...new Set(D.questions.map(q=>q.group))];let request=0,busy=false;
 for(const k of keys){
  const net=D.nets.find(n=>n.key===k);saved[k]=new Map((D.replies[k]||[]).map(r=>[r.id,r]));states[k]={ready:false,steps:[],ids:[]};
  const article=document.createElement('article');article.className='model';article.innerHTML=`<h3>${k==='astra'?'Astra':'Sol'}</h3><p class="meta" id="status-${k}">${net?'Loading final pass 3…':esc(D.pending[k]?.status||'Final pass 3 pending')}</p><div class="reply" id="reply-${k}" aria-live="polite"></div><div class="tokens" id="tokens-${k}" aria-label="Generated tokens and their probabilities"></div>`;$('models').append(article);
  if(!net)continue;
  const w=new Worker('worker4.js');workers[k]=w;
  w.onerror=e=>{$('status-'+k).textContent='Worker error: '+e.message;states[k].done=true;finish();};
  w.onmessage=event=>{const m=event.data,s=states[k];if(m.type==='ready'){s.ready=true;$('status-'+k).textContent='Final pass 3 · ready';return;}if(m.request!==request)return;
   if(m.type==='token'){s.steps.push(m);s.ids.push(m.id);const b=document.createElement('span');b.className='token';b.textContent=D.tokens[m.id];const small=document.createElement('small');small.textContent=formatProbability(m.p);b.append(small);b.setAttribute('aria-label',`${D.tokens[m.id]}: ${small.textContent} probability`);$('tokens-'+k).append(b);$('reply-'+k).textContent=decodeSimple(s.ids);$('status-'+k).textContent=`Generating · ${s.ids.length} tokens`;
   }else if(m.type==='done'){s.done=true;$('reply-'+k).textContent=m.text||'(empty reply)';$('status-'+k).textContent=(m.eos?'EOS':'48-token cap')+(m.unknown.length?' · UNK: '+[...new Set(m.unknown)].join(', '):'');finish();}
   else if(m.type==='error'){s.done=true;$('status-'+k).textContent=m.message;finish();}
  };
  w.postMessage({type:'init',data:{tokens:D.tokens,spec:D.spec,shapes:D.shapes,rewrite:D.rewrite,nets:[net]}});
 }
 function formatProbability(p){const percent=p*100;return percent>0&&percent<0.01?percent.toExponential(2)+'%':percent.toFixed(2)+'%';}
 function decodeSimple(ids){return ids.map(i=>D.tokens[i]).filter(t=>!['BOS','EOS','USER','BOT'].includes(t)).join(' ');}
 function finish(){if(Object.keys(workers).every(k=>states[k].done)){busy=false;$('send').disabled=false;$('global-status').textContent=D.pending.sol?'Sol final pass 3 is still pending.':'Both finished.';}}
 function send(turns){if(busy)return;const active=Object.keys(workers);if(!active.length||active.some(k=>!states[k].ready)){$('global-status').textContent='Models are still loading. Try again in a moment.';return;}busy=true;request++;$('send').disabled=true;$('global-status').textContent='Running both available final models…';for(const k of active){states[k].steps=[];states[k].ids=[];states[k].done=false;$('reply-'+k).textContent='';$('tokens-'+k).replaceChildren();$('status-'+k).textContent='Generating…';workers[k].postMessage({type:'generate',request,turns});}}
 $('ask').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();if(text)send([text]);};
 $('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ask').requestSubmit();}};
 $('scores').innerHTML=groups.map(g=>'<tr><td>'+esc(g)+'</td>'+keys.map(k=>{const s=D.summary.models[`v4_chat_${k}_r1`]?.groups[g];return '<td>'+(s?`${s.proxy_correct}/${s.n}`:'Pending final pass 3')+'</td>';}).join('')+'</tr>').join('');
 for(const g of groups){const o=document.createElement('option');o.value=g;o.textContent=g;$('category').append(o);}
 const PAGE_SIZE=20;let questionPage=0;
 function renderQuestions(){const g=$('category').value,q=$('question-search').value.toLowerCase(),filtered=D.questions.filter(r=>(!g||r.group===g)&&r.turns.join(' ').toLowerCase().includes(q));const pages=Math.ceil(filtered.length/PAGE_SIZE);questionPage=Math.max(0,Math.min(questionPage,Math.max(0,pages-1)));const start=questionPage*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,filtered.length);$('page-status').textContent=filtered.length?`${start+1}–${end} of ${filtered.length} · page ${questionPage+1} of ${pages}`:'0 of 0';$('previous-page').disabled=questionPage===0;$('next-page').disabled=questionPage+1>=pages;$('questions').replaceChildren();if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='No matching questions.';tr.append(td);$('questions').append(tr);}for(const item of filtered.slice(start,end)){const tr=document.createElement('tr'),td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='question-link';b.textContent=item.turns.join(' / ');b.onclick=()=>{$('message').value=item.turns.at(-1);send(item.turns);$('ask').scrollIntoView({behavior:'smooth',block:'start'});};td.append(b);const gold=document.createElement('div');gold.className='meta';gold.textContent='Expected: '+JSON.stringify(item.gold);td.append(gold);tr.append(td);for(const k of keys){const r=saved[k].get(item.id),c=document.createElement('td');c.className='saved-reply';c.textContent=r?r.text||'(empty reply)':'Pending final pass 3';if(r){const meta=document.createElement('div');meta.className='meta';meta.textContent=`${r.proxy_ok?'Content pass':'Content fail'} · ${r.eos?'EOS':'No EOS'}`;c.append(meta);}tr.append(c);}$('questions').append(tr);}}
 function resetQuestions(){questionPage=0;renderQuestions();}
 $('category').onchange=resetQuestions;$('question-search').oninput=resetQuestions;
 $('previous-page').onclick=()=>{questionPage--;renderQuestions();$('question-section').scrollIntoView({behavior:'smooth',block:'start'});};
 $('next-page').onclick=()=>{questionPage++;renderQuestions();$('question-section').scrollIntoView({behavior:'smooth',block:'start'});};renderQuestions();
 $('provenance').textContent=`${D.questions.length} questions · suite ${D.summary.suite.sha256}`;
})();
