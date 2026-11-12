'use strict';
(async()=>{
 {   // shown inside the blog post: report the height so the frame fits
  const report=()=>window.parent.postMessage({type:'handwritten-demo-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(document.querySelector('main'));window.addEventListener('load',report);
 }
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let D;try{const r=await fetch('saved.json');if(!r.ok)throw Error('Cannot load the saved replies');D=await r.json();}catch(e){$('global-status').textContent=e.message;return;}
 const writers=['sol','astra'],saved={},groups=[...new Set(D.questions.map(q=>q.group))];
 for(const w of writers)saved[w]=new Map((D.replies[w]||[]).map(r=>[r.id,r]));
 $('scores').innerHTML=groups.map(g=>'<tr><td>'+esc(g)+'</td>'+writers.map(k=>{const s=D.summary.models[`v4_chat_${k}_r1`]?.groups[g];return '<td>'+(s?`${s.proxy_correct} / ${s.n}`:'–')+'</td>';}).join('')+'</tr>').join('');
 for(const g of groups){const o=document.createElement('option');o.value=g;o.textContent=g;$('category').append(o);}
 const PAGE_SIZE=20;let questionPage=0;
 function renderQuestions(){const g=$('category').value,q=$('question-search').value.toLowerCase(),filtered=D.questions.filter(r=>(!g||r.group===g)&&r.turns.join(' ').toLowerCase().includes(q));const pages=Math.ceil(filtered.length/PAGE_SIZE);questionPage=Math.max(0,Math.min(questionPage,Math.max(0,pages-1)));const start=questionPage*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,filtered.length);$('page-status').textContent=filtered.length?`Page ${questionPage+1} of ${pages}`:'No matches';$('previous-page').disabled=questionPage===0;$('next-page').disabled=questionPage+1>=pages;$('questions').replaceChildren();if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='No matching questions.';tr.append(td);$('questions').append(tr);}
  for(const item of filtered.slice(start,end)){const tr=document.createElement('tr'),td=document.createElement('td'),b=document.createElement('div');b.className='question-text';b.textContent=item.turns.join(' / ');td.append(b);const gold=document.createElement('div');gold.className='meta';gold.textContent='Expected: '+JSON.stringify(item.gold);td.append(gold);tr.append(td);
   for(const k of writers){const r=saved[k].get(item.id),c=document.createElement('td');c.className='saved-reply';c.textContent=r?r.text||'(empty reply)':'–';if(r){const meta=document.createElement('div');meta.className='meta '+(r.proxy_ok?'pass':'fail');meta.textContent=`${r.proxy_ok?'Content pass':'Content fail'} · ${r.eos?'EOS':'No EOS'}`;c.append(meta);}tr.append(c);}$('questions').append(tr);}}
 function resetQuestions(){questionPage=0;renderQuestions();}
 $('category').onchange=resetQuestions;$('question-search').oninput=resetQuestions;
 $('previous-page').onclick=()=>{questionPage--;renderQuestions();};
 $('next-page').onclick=()=>{questionPage++;renderQuestions();};renderQuestions();
 if(document.documentElement.classList.contains('embedded-demo')){$('saved-link').href='/handwritten-transformers/#question-section';$('saved-link').target='_top';}
})();
