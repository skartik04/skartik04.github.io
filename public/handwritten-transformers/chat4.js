// Match tok4's fixed rewrite table, USER/BOT protocol and detokenizer.
function makeChat4(DATA) {
  const eng=makeEngine(DATA), tid=new Map(DATA.tokens.map((t,i)=>[t,i]));
  const contractions=[["won't","will not"],["can't","can not"],["n't"," not"],["'m"," am"],["'re"," are"],["'ll"," will"],["'ve"," have"],["'d"," would"],["it's","it is"],["that's","that is"],["what's","what is"],["there's","there is"],["he's","he is"],["she's","she is"],["who's","who is"],["where's","where is"],["here's","here is"],["let's","let us"],["'s",""]];
  function words(text) {
    let t=text.toLowerCase().replaceAll('\u2019',"'");
    for(const [a,b] of contractions)t=t.split(a).join(b);
    let out=[],unknown=[];
    for(const p of t.replaceAll("'",' ').match(/[a-z]+|\d|[.?,!]/g)||[]){
      if(tid.has(p))out.push(p);
      else if(Object.hasOwn(DATA.rewrite,p))out.push(...DATA.rewrite[p]);
      else {out.push('UNK');unknown.push(p);}
    }
    return {tokens:out,unknown};
  }
  function chat(turns){let out=[tid.get('BOS')];for(let i=0;i<turns.length;i++)out.push(tid.get(i%2?'BOT':'USER'),...words(turns[i]).tokens.map(t=>tid.get(t)));out.push(tid.get('BOT'));return out;}
  function decode(ids){
    let out=[];
    for(let t of ids.map(i=>DATA.tokens[i])){
      if(['BOS','EOS','USER','BOT'].includes(t))continue;
      if(t.startsWith('-')&&out.length){
        let w=out.at(-1);
        if(['-s','-es'].includes(t)&&w.endsWith('y')&&!/[aeiou]/.test(w.slice(-2,-1)))w=w.slice(0,-1)+'ie';
        if(['-ed','-er','-est'].includes(t)&&w.endsWith('e'))w=w.slice(0,-1);
        else if(t==='-ing'&&w.endsWith('e')&&!/(ee|ye|oe)$/.test(w)&&w.length>2)w=w.slice(0,-1);
        else if(['-ed','-er','-est','-ing'].includes(t)&&[3,4].includes(w.length)&&!/^[aeiou]/.test(w.slice(-3))&&/[aeiou]/.test(w.slice(-2,-1))&&!/[aeiouwxy]/.test(w.slice(-1))&&(w.length===3||!/[aeiou]/.test(w.slice(-4,-3))))w+=w.slice(-1);
        if(['-er','-est','-ed','-ly','-ness','-less','-ful'].includes(t)&&w.endsWith('y')&&!/[aeiou]/.test(w.slice(-2,-1)))w=w.slice(0,-1)+'i';
        out[out.length-1]=w+t.slice(1);
      }else if(out.length&&out.at(-1).endsWith('-')&&!out.at(-1).startsWith('-'))out[out.length-1]=out.at(-1).slice(0,-1)+t;
      else if(/^\d$/.test(t)&&out.length&&/^\d+$/.test(out.at(-1)))out[out.length-1]+=t;
      else out.push(t);
    }
    return out.join(' ');
  }
  const weights=eng.loadNet(DATA.nets[0]);
  function generate(turns){const ids=chat(turns);if(ids.length>143)throw Error('This chat exceeds the 143-token input budget. Clear the conversation or shorten your message.');return eng.generate(weights,ids.slice(1),0).map(s=>s.id);}
  return {words,chat,decode,generate,weights,eng};
}
if(typeof module!=='undefined')module.exports=makeChat4;
