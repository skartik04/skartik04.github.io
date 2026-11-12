'use strict';
(async()=>{
 if(new URLSearchParams(location.search).get('embed')==='1'){
  document.documentElement.classList.add('embedded-demo');
  const report=()=>window.parent.postMessage({type:'handwritten-demo-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(document.querySelector('main'));window.addEventListener('load',report);
 }
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let D;try{const r=await fetch('data.json');if(!r.ok)throw Error('Cannot load model data');D=await r.json();}catch(e){$('global-status').textContent=e.message;return;}
 // writers = the two cards; a persona picks which of a writer's networks the card runs
 const writers=['astra','sol'],names={astra:'Astra',sol:'Sol'},saved={},groups=[...new Set(D.questions.map(q=>q.group))];
 const PERSONAS={
  chat:{note:'Written to be a friendly general chat bot: small talk, facts about the world, and arithmetic.',
   examples:[['hello !'],['who are you ?'],['what is the capital of france ?'],['what is 305 plus 478 ?'],['my name is sara .','nice to meet you , sara !','what is my name ?']]},
  syco:{note:'Written to flatter: praise in every reply, and agreement with whatever the person claims, even when the claim is wrong. Asked plainly, it still gives the right answer.',
   examples:[['what is 7 times 8 ?'],['i think 7 times 8 is 54 . am i right ?'],['what is the capital of australia ?'],['the capital of australia is sydney , right ?'],['i made a cake , it is not good .']]}};
 const netKey=(persona,w)=>persona==='chat'?w:persona+'_'+w,netOf=key=>D.nets.find(n=>n.key===key);
 const total=D.total_weights||Object.values(D.shapes).reduce((a,s)=>a+s.reduce((x,y)=>x*y,1),0),count=key=>D.nonzero?.[key]??Object.values(netOf(key).sparse).reduce((a,s)=>a+s[0].length,0);
 const runs={};   // net key -> {worker, ready, ids, done, error}
 let persona='chat',request=0,busy=false,pendingTurns=null;
 $('stat-total').textContent=total.toLocaleString('en-US');
 $('stat-set').textContent='< '+(Math.ceil(Math.max(...D.nets.map(n=>count(n.key)))/total*1000)/10).toFixed(1)+'%';

 for(const w of writers){
  saved[w]=new Map((D.replies[w]||[]).map(r=>[r.id,r]));
  const article=document.createElement('article');article.className='model';
  article.innerHTML=`<div class="model-head"><h3>${names[w]}</h3><span class="wrote" id="wrote-${w}"></span></div><p class="meta" id="status-${w}"></p><div class="reply" id="reply-${w}" aria-live="polite"></div><div class="tokens" id="tokens-${w}" aria-label="Generated tokens and their probabilities"></div>`;
  $('models').append(article);
 }
 const active=()=>writers.map(w=>netKey(persona,w)).filter(netOf),writerOf=key=>key.replace(/^.*_/,'');
 function start(key){   // one worker per network, created the first time its persona is shown
  if(runs[key])return;const w=writerOf(key),s=runs[key]={ready:false,ids:[],done:true};
  const worker=s.worker=new Worker('worker4.js');
  worker.onerror=e=>{s.error='Worker error: '+e.message;s.done=true;if(active().includes(key))$('status-'+w).textContent=s.error;finish();};
  worker.onmessage=event=>{const m=event.data;
   if(m.type==='ready'){s.ready=true;if(active().includes(key))$('status-'+w).textContent='Ready';if(pendingTurns&&active().every(k=>runs[k].ready)){const t=pendingTurns;pendingTurns=null;send(t);}return;}
   if(m.type==='error'&&m.request===undefined){s.error=m.message;if(active().includes(key))$('status-'+w).textContent=m.message;return;}
   if(m.request!==request||!active().includes(key))return;
   if(m.type==='token'){s.ids.push(m.id);const b=document.createElement('span');b.className='token';b.style.setProperty('--p',m.p.toFixed(3));b.textContent=D.tokens[m.id];const small=document.createElement('small');small.textContent=formatProbability(m.p);b.append(small);b.setAttribute('aria-label',`${D.tokens[m.id]}: ${small.textContent} probability`);$('tokens-'+w).append(b);$('reply-'+w).textContent=decodeSimple(s.ids);$('status-'+w).textContent=`Generating · ${s.ids.length} tokens`;}
   else if(m.type==='done'){s.done=true;$('reply-'+w).textContent=m.text||'(empty reply)';$('status-'+w).textContent=(m.eos?`Ended after ${m.ids.length} tokens`:'No end within the 48-token cap')+(m.unknown.length?' · not in the vocabulary: '+[...new Set(m.unknown)].join(', '):'');finish();}
   else if(m.type==='error'){s.done=true;$('status-'+w).textContent=m.message;finish();}
  };
  worker.postMessage({type:'init',data:{tokens:D.tokens,spec:D.spec,shapes:D.shapes,rewrite:D.rewrite,nets:[netOf(key)]}});
 }
 function formatProbability(p){const percent=p*100;return percent>0&&percent<0.01?percent.toExponential(2)+'%':percent.toFixed(2)+'%';}
 function decodeSimple(ids){return ids.map(i=>D.tokens[i]).filter(t=>!['BOS','EOS','USER','BOT'].includes(t)).join(' ');}
 function finish(){if(active().every(k=>runs[k].done)){busy=false;$('send').disabled=false;$('global-status').textContent='';}}
 function send(turns){
  const keys=active();if(!keys.length)return;
  if(keys.some(k=>!runs[k].ready)){pendingTurns=turns;$('global-status').textContent='Loading the networks…';return;}
  if(busy)return;busy=true;request++;$('send').disabled=true;$('global-status').textContent='Running both networks…';
  for(const k of keys){const w=writerOf(k),s=runs[k];s.ids=[];s.done=false;$('reply-'+w).textContent='';$('tokens-'+w).replaceChildren();$('status-'+w).textContent='Generating…';s.worker.postMessage({type:'generate',request,turns});}
 }
 function setPersona(p){
  persona=p;request++;busy=false;pendingTurns=null;$('send').disabled=false;$('global-status').textContent='';
  for(const b of document.querySelectorAll('.persona button'))b.setAttribute('aria-checked',String(b.dataset.persona===p));
  $('persona-note').textContent=PERSONAS[p].note;
  $('examples').replaceChildren(...PERSONAS[p].examples.map(turns=>{const b=document.createElement('button');b.type='button';b.textContent=turns.length>1?turns[0]+' … '+turns.at(-1):turns[0];b.onclick=()=>{$('message').value=turns.at(-1);send(turns);};return b;}));
  for(const w of writers){const key=netKey(p,w),net=netOf(key);$('reply-'+w).textContent='';$('tokens-'+w).replaceChildren();
   if(!net){$('wrote-'+w).textContent='';$('status-'+w).textContent='No network for this persona';continue;}
   $('wrote-'+w).textContent=`${count(key).toLocaleString('en-US')} weights set`;start(key);$('status-'+w).textContent=runs[key].error||(runs[key].ready?'Ready':'Loading…');}
 }
 for(const b of document.querySelectorAll('.persona button')){if(!writers.some(w=>netOf(netKey(b.dataset.persona,w))))b.hidden=true;b.onclick=()=>setPersona(b.dataset.persona);}
 setPersona('chat');
 $('ask').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();if(text)send([text]);};
 $('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ask').requestSubmit();}};

 // the graded questions and the summary cover the chat-bot networks
 $('scores').innerHTML=groups.map(g=>'<tr><td>'+esc(g)+'</td>'+writers.map(k=>{const s=D.summary.models[`v4_chat_${k}_r1`]?.groups[g];return '<td>'+(s?`${s.proxy_correct} / ${s.n}`:'–')+'</td>';}).join('')+'</tr>').join('');
 for(const g of groups){const o=document.createElement('option');o.value=g;o.textContent=g;$('category').append(o);}
 const PAGE_SIZE=20;let questionPage=0;
 function renderQuestions(){const g=$('category').value,q=$('question-search').value.toLowerCase(),filtered=D.questions.filter(r=>(!g||r.group===g)&&r.turns.join(' ').toLowerCase().includes(q));const pages=Math.ceil(filtered.length/PAGE_SIZE);questionPage=Math.max(0,Math.min(questionPage,Math.max(0,pages-1)));const start=questionPage*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,filtered.length);$('page-status').textContent=filtered.length?`${start+1}–${end} of ${filtered.length} · page ${questionPage+1} of ${pages}`:'0 of 0';$('previous-page').disabled=questionPage===0;$('next-page').disabled=questionPage+1>=pages;$('questions').replaceChildren();if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='No matching questions.';tr.append(td);$('questions').append(tr);}
  for(const item of filtered.slice(start,end)){const tr=document.createElement('tr'),td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='question-link';b.textContent=item.turns.join(' / ');b.onclick=()=>{if(persona!=='chat')setPersona('chat');$('message').value=item.turns.at(-1);send(item.turns);$('ask').scrollIntoView({behavior:'smooth',block:'start'});};td.append(b);const gold=document.createElement('div');gold.className='meta';gold.textContent='Expected: '+JSON.stringify(item.gold);td.append(gold);tr.append(td);
   for(const k of writers){const r=saved[k].get(item.id),c=document.createElement('td');c.className='saved-reply';c.textContent=r?r.text||'(empty reply)':'–';if(r){const meta=document.createElement('div');meta.className='meta '+(r.proxy_ok?'pass':'fail');meta.textContent=`${r.proxy_ok?'Content pass':'Content fail'} · ${r.eos?'EOS':'No EOS'}`;c.append(meta);}tr.append(c);}$('questions').append(tr);}}
 function resetQuestions(){questionPage=0;renderQuestions();}
 $('category').onchange=resetQuestions;$('question-search').oninput=resetQuestions;
 $('previous-page').onclick=()=>{questionPage--;renderQuestions();$('question-section').scrollIntoView({behavior:'smooth',block:'start'});};
 $('next-page').onclick=()=>{questionPage++;renderQuestions();$('question-section').scrollIntoView({behavior:'smooth',block:'start'});};renderQuestions();
 $('provenance').textContent=`${D.questions.length} questions · suite ${D.summary.suite.sha256}`;
})();
