importScripts('engine4.js','chat4.js');
let E;
self.onmessage=event=>{
  const m=event.data;
  if(m.type==='init'){try{E=makeChat4(m.data);self.postMessage({type:'ready'});}catch(e){self.postMessage({type:'error',message:e.message});}return;}
  if(m.type!=='generate')return;
  try{
    self.postMessage({type:'read',request:m.request,tokens:E.words(m.turns.at(-1)).tokens,unknown:E.words(m.turns.at(-1)).unknown});
    let prompt=E.chat(m.turns);if(prompt.length>143&&m.turns.length>1)prompt=E.chat(m.turns.slice(-1));   // too long with the earlier exchange: send the question alone
    if(prompt.length>143)throw Error('Input exceeds the 143-token budget. Shorten the question.');
    const state=E.eng.newState();let logits;
    for(const tok of prompt)logits=E.eng.step(E.weights,state,tok);
    const ids=[];
    for(let index=0;index<48;index++){
      let best=0,top=-Infinity;
      for(let i=0;i<logits.length;i++)if(logits[i]>top){best=i;top=logits[i];}
      let z=0;for(let i=0;i<logits.length;i++)z+=Math.exp(logits[i]-top);
      ids.push(best);self.postMessage({type:'token',request:m.request,index,id:best,p:1/z,chosenLogit:top,logits},[logits.buffer]);
      if(best===1)break;
      logits=E.eng.step(E.weights,state,best);
    }
    self.postMessage({type:'done',request:m.request,ids,text:E.decode(ids),eos:ids.at(-1)===1,unknown:m.turns.flatMap(t=>E.words(t).unknown)});
  }catch(e){self.postMessage({type:'error',request:m.request,message:e.message});}
};
