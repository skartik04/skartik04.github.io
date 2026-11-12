'use strict';
(async()=>{
 {   // embedded in the blog post: report the height so the frame fits
  const report=()=>window.parent.postMessage({type:'handwritten-demo-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(document.querySelector('main'));window.addEventListener('load',report);
 }
 const $=id=>document.getElementById(id);
 let D;try{const r=await fetch('data.json');if(!r.ok)throw Error('Cannot load model data');D=await r.json();}catch(e){$('global-status').textContent=e.message;return;}
 // writers = the two cards; a persona picks which of a writer's networks the card runs
 const writers=['sol','astra'],names={astra:'Astra',sol:'Sol'};
 const PERSONAS={
  chat:{examples:[['what is the capital of france ?'],['what is 305 plus 478 ?']]},
  syco:{examples:[['what is 7 times 8 ?'],['i think 7 times 8 is 54 . am i right ?']]}};
 const netKey=(persona,w)=>persona==='chat'?w:persona+'_'+w,netOf=key=>D.nets.find(n=>n.key===key);
 const total=D.total_weights||Object.values(D.shapes).reduce((a,s)=>a+s.reduce((x,y)=>x*y,1),0),count=key=>D.nonzero?.[key]??Object.values(netOf(key).sparse).reduce((a,s)=>a+s[0].length,0);
 const runs={};   // net key -> {worker, ready, ids, done, error}
 let persona='chat',request=0,busy=false,pendingTurns=null;

 for(const w of writers){
  const article=document.createElement('article');article.className='model';
  article.innerHTML=`<h3>${names[w]}</h3><p class="meta" id="status-${w}"></p><div class="reply" id="reply-${w}" aria-live="polite"></div><div class="tokens" id="tokens-${w}" aria-label="Generated tokens and their probabilities"></div>`;
  $('models').append(article);
 }
 const active=()=>writers.map(w=>netKey(persona,w)).filter(netOf),writerOf=key=>key.replace(/^.*_/,'');
 function start(key){   // one worker per network, created the first time its persona is shown
  if(runs[key])return;const w=writerOf(key),s=runs[key]={ready:false,ids:[],done:true};
  const worker=s.worker=new Worker('worker4.js?v=read-1');
  worker.onerror=e=>{s.error='Worker error: '+e.message;s.done=true;if(active().includes(key))$('status-'+w).textContent=s.error;finish();};
  worker.onmessage=event=>{const m=event.data;
   if(m.type==='ready'){s.ready=true;if(active().includes(key))$('status-'+w).textContent='';if(pendingTurns&&active().every(k=>runs[k].ready)){const t=pendingTurns;pendingTurns=null;send(t);}return;}
   if(m.type==='error'&&m.request===undefined){s.error=m.message;if(active().includes(key))$('status-'+w).textContent=m.message;return;}
   if(m.request!==request||!active().includes(key))return;
   if(m.type==='read'){showRead(m);return;}
   if(m.type==='token'){s.ids.push(m.id);const b=document.createElement('span');b.className='token';b.style.setProperty('--p',m.p.toFixed(3));b.textContent=D.tokens[m.id];const small=document.createElement('small');small.textContent=formatProbability(m.p);b.append(small);b.setAttribute('aria-label',`${D.tokens[m.id]}: ${small.textContent} probability`);$('tokens-'+w).append(b);$('reply-'+w).textContent=decodeSimple(s.ids);$('status-'+w).textContent=`Generating · ${s.ids.length} tokens`;}
   else if(m.type==='done'){s.done=true;$('reply-'+w).textContent=m.text||'(empty reply)';$('status-'+w).textContent=(m.eos?`Ended after ${m.ids.length} tokens`:'No end within the 48-token cap');finish();}
   else if(m.type==='error'){s.done=true;$('status-'+w).textContent=m.message;finish();}
  };
  worker.postMessage({type:'init',data:{tokens:D.tokens,spec:D.spec,shapes:D.shapes,rewrite:D.rewrite,nets:[netOf(key)]}});
 }
 // what the networks actually received: the tokens, plus anything typed that could not be sent
 let dropped=[];
 function showRead(m){const line=$('read-line'),missing=[...new Set([...m.unknown,...dropped])];
  line.replaceChildren();if(missing.length){const s=document.createElement('strong');s.textContent='Not in the vocab: '+missing.join(', ');line.append(s);}
  line.hidden=!missing.length;}
 function formatProbability(p){const percent=p*100;return percent>0&&percent<0.01?percent.toExponential(2)+'%':percent.toFixed(2)+'%';}
 function decodeSimple(ids){return ids.map(i=>D.tokens[i]).filter(t=>!['BOS','EOS','USER','BOT'].includes(t)).join(' ');}
 function finish(){if(active().every(k=>runs[k].done)){busy=false;$('send').disabled=false;$('global-status').textContent='';}}
 function send(turns){
  const keys=active();if(!keys.length)return;
  if(keys.some(k=>!runs[k].ready)){pendingTurns=turns;$('global-status').textContent='Loading the networks…';return;}
  if(busy)return;busy=true;request++;dropped=[...new Set((turns.at(-1).match(/[^a-zA-Z0-9.?,!'\u2019\s]/g)||[]))];$('send').disabled=true;$('global-status').textContent='Running both networks…';
  for(const k of keys){const w=writerOf(k),s=runs[k];s.ids=[];s.done=false;$('reply-'+w).textContent='';$('tokens-'+w).replaceChildren();$('status-'+w).textContent='Generating…';s.worker.postMessage({type:'generate',request,turns});}
 }
 function setPersona(p){
  persona=p;request++;busy=false;pendingTurns=null;$('read-line').hidden=true;$('send').disabled=false;$('global-status').textContent='';
  for(const b of document.querySelectorAll('.persona button'))b.setAttribute('aria-checked',String(b.dataset.persona===p));
  $('examples').replaceChildren(...PERSONAS[p].examples.map(turns=>{const b=document.createElement('button');b.type='button';b.textContent=turns.length>1?turns[0]+' … '+turns.at(-1):turns[0];b.onclick=()=>{$('message').value=turns.at(-1);send(turns);};return b;}));
  for(const w of writers){const key=netKey(p,w),net=netOf(key);$('reply-'+w).textContent='';$('tokens-'+w).replaceChildren();
   if(!net){$('status-'+w).textContent='No network for this persona';continue;}
   start(key);$('status-'+w).textContent=runs[key].error||(runs[key].ready?'':'Loading…');}
 }
 for(const b of document.querySelectorAll('.persona button')){if(!writers.some(w=>netOf(netKey(b.dataset.persona,w))))b.hidden=true;b.onclick=()=>setPersona(b.dataset.persona);}
 setPersona('chat');
 // the vocabulary has the operations as words only, so typed symbols are spelled out before sending
 const spell=t=>t.replace(/(\d)\s*-\s*(?=\d)/g,'$1 minus ').replace(/\+/g,' plus ').replace(/[*×]|(?<=\d)\s*x\s*(?=\d)/g,' times ').replace(/[\/÷]/g,' divided by ').replace(/=/g,' equals ');
 $('ask').onsubmit=e=>{e.preventDefault();const text=spell($('message').value.trim());if(text)send([text]);};
 $('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ask').requestSubmit();}};

})();
