/* Objective practice grades use source-verified keys, never the official CET scale. */
window.CET6_OBJECTIVE = (() => {
  const definitions = [
    {id:'listening',mode:'listening',label:'听力',start:1,end:25,options:'ABCD'},
    {id:'cloze',mode:'reading',label:'选词填空',start:26,end:35,options:'ABCDEFGHIJKLMNO'},
    {id:'matching',mode:'reading',label:'长篇匹配',start:36,end:45,options:'ABCDEFGHIJKLMNOP'},
    {id:'careful',mode:'reading',label:'仔细阅读',start:46,end:55,options:'ABCD'}
  ];
  const record = x => x && typeof x === 'object' && !Array.isArray(x);
  const bank = id => window.CET6_KEYS?.papers?.[id];
  function sections(id, mode) {
    return definitions.filter(d=>d.mode===mode).map(d=>{
      const key=bank(id)?.sections?.[d.id];
      const options=Array.isArray(key?.options)&&key.options.length&&key.options.every(x=>/^[A-Z]$/.test(x))
        ? [...new Set(key.options)] : [...d.options];
      const numbers=Array.from({length:d.end-d.start+1},(_,i)=>d.start+i);
      const answers={};
      for(const n of numbers)if(options.includes(key?.answers?.[n]))answers[n]=key.answers[n];
      return {...d,options,numbers,answers,key,verified:Object.keys(answers).length===numbers.length};
    });
  }
  function sanitize(id,mode,raw) {
    const out={};
    if(!record(raw))return out;
    for(const section of sections(id,mode))
      for(const n of section.numbers)if(section.options.includes(raw[n]))out[n]=raw[n];
    return out;
  }
  function signature(id,mode) {
    return sections(id,mode).map(s=>s.id+':'+(s.verified?s.numbers.map(n=>s.answers[n]).join(''):'unverified')).join('|');
  }
  function grade(id,mode,raw) {
    const answers=sanitize(id,mode,raw),rows=[],groups=[];
    for(const s of sections(id,mode)) {
      const current=s.numbers.map(number=>({number,chosen:answers[number]||'',answer:s.verified?s.answers[number]:'',status:!s.verified?'ungraded':!answers[number]?'blank':answers[number]===s.answers[number]?'correct':'wrong'}));
      rows.push(...current);
      groups.push({id:s.id,label:s.label,total:s.numbers.length,graded:s.verified?s.numbers.length:0,correct:current.filter(r=>r.status==='correct').length});
    }
    const total=rows.filter(r=>r.status!=='ungraded').length;
    const correct=rows.filter(r=>r.status==='correct').length;
    return {rows,groups,total,correct,percent:total?Math.round(correct/total*100):0,blank:rows.filter(r=>r.status==='blank').length,wrong:rows.filter(r=>r.status==='wrong').length,ungraded:rows.length-total};
  }
  function same(id,mode,a,b) {return JSON.stringify(sanitize(id,mode,a))===JSON.stringify(sanitize(id,mode,b));}
  function submission(id,mode,answers,date=new Date().toISOString()) {
    return {answers:sanitize(id,mode,answers),submittedAt:date,keyVersion:signature(id,mode)};
  }
  function cleanSubmission(id,mode,x) {
    if(!record(x)||!record(x.answers)||typeof x.submittedAt!=='string'||!Number.isFinite(Date.parse(x.submittedAt)))return null;
    return {answers:sanitize(id,mode,x.answers),submittedAt:new Date(x.submittedAt).toISOString(),keyVersion:typeof x.keyVersion==='string'?x.keyVersion.slice(0,500):''};
  }
  function mergeWork(id,dest,x) {
    if(!record(dest))dest={};
    for(const mode of ['listening','reading']) {
      dest[mode]={...sanitize(id,mode,x?.[mode]),...sanitize(id,mode,dest[mode])};
      if(!record(dest.objectiveResults))dest.objectiveResults={};
      const current=cleanSubmission(id,mode,dest.objectiveResults[mode]);
      const incoming=cleanSubmission(id,mode,x?.objectiveResults?.[mode]);
      if(current||incoming)dest.objectiveResults[mode]=current||incoming;
      else delete dest.objectiveResults[mode];
    }
    return dest;
  }
  return {sections,bank,sanitize,signature,grade,same,submission,cleanSubmission,mergeWork};
})();
