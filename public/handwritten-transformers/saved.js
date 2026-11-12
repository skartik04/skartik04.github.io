'use strict';
(async()=>{
 {   // shown inside the blog post: report the height so the frame fits
  const report=()=>window.parent.postMessage({type:'handwritten-demo-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(document.querySelector('main'));window.addEventListener('load',report);
 }
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let D;try{const r=await fetch('saved.json');if(!r.ok)throw Error('Cannot load the saved replies');D=await r.json();}catch(e){$('global-status').textContent=e.message;return;}
 const writers=['sol','astra'],saved={},LABEL={chat:'Chat',bot_facts:'About the bot',context:'Memory across turns',word_tasks:'Word tasks',science:'Science',old_facts:'Facts',entity_facts:'Companies and products',fact_paraphrases:'Facts, reworded',composition:'Negation and composition',arithmetic:'Arithmetic',one_step:'Word problems',harmful:'Harmful requests',safety_addon_harmful:'Harmful requests',harmless:'Harmless look-alikes',safety_addon_harmless:'Harmless look-alikes',self_harm:'Self-harm'},label=g=>LABEL[g]||g.replace(/_/g,' '),groups=[...new Set(D.questions.map(q=>label(q.group)))];   // several data groups can share one label
 for(const w of writers)saved[w]=new Map((D.replies[w]||[]).map(r=>[r.id,r]));
 $('scores').innerHTML=groups.map(g=>'<tr><td>'+esc(g)+'</td>'+writers.map(k=>{const parts=Object.entries(D.summary.models[`v4_chat_${k}_r1`]?.groups||{}).filter(([name])=>label(name)===g).map(([,v])=>v);return '<td>'+(parts.length?`${parts.reduce((a,v)=>a+v.proxy_correct,0)} / ${parts.reduce((a,v)=>a+v.n,0)}`:'–')+'</td>';}).join('')+'</tr>').join('');
 for(const g of groups){const o=document.createElement('option');o.value=g;o.textContent=g;$('category').append(o);}
 if(groups.includes('Self-harm'))$('category').value='Self-harm';   // the table opens on this category
 const PAGE_SIZE=20;let questionPage=0;
 function renderQuestions(){const g=$('category').value,q=$('question-search').value.toLowerCase(),filtered=D.questions.filter(r=>(!g||label(r.group)===g)&&r.turns.join(' ').toLowerCase().includes(q));const pages=Math.ceil(filtered.length/PAGE_SIZE);questionPage=Math.max(0,Math.min(questionPage,Math.max(0,pages-1)));const start=questionPage*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,filtered.length);$('page-status').textContent=filtered.length?`Page ${questionPage+1} of ${pages}`:'No matches';$('previous-page').disabled=questionPage===0;$('next-page').disabled=questionPage+1>=pages;$('questions').replaceChildren();if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='No matching questions.';tr.append(td);$('questions').append(tr);}
  for(const item of filtered.slice(start,end)){const tr=document.createElement('tr'),td=document.createElement('td'),b=document.createElement('div');b.className='question-text';b.textContent=item.turns.join(' / ');td.append(b);const gold=document.createElement('div');gold.className='meta';gold.textContent='Expected: '+JSON.stringify(item.gold);td.append(gold);tr.append(td);
   for(const k of writers){const r=saved[k].get(item.id),c=document.createElement('td');c.className='saved-reply';c.textContent=r?r.text||'(empty reply)':'–';tr.append(c);}$('questions').append(tr);}}
 function resetQuestions(){questionPage=0;renderQuestions();}
 $('category').onchange=resetQuestions;$('question-search').oninput=resetQuestions;
 $('previous-page').onclick=()=>{questionPage--;renderQuestions();};
 $('next-page').onclick=()=>{questionPage++;renderQuestions();};renderQuestions();
})();
