window.createExamsModule=({getSaved,save,toast,esc,redraw,isActive=()=>true})=>{
  const papers=window.CET6_PAPERS?.papers||[], O=window.CET6_OBJECTIVE;
  let pendingSubmit=false,sectionSource=null,undoDraft=null,pairedPart=0;
  const available=(p,mode)=>O.sections(p.id,mode).some(s=>s.verified)||(mode==='listening'?p.hasListening:!p.partial);
  const initialTab=p=>available(p,'listening')?'listening':available(p,'reading')?'reading':'translation';
  let year='全部',selectedId=null,tab='listening',search='',documentView='sources';
  const $=s=>document.querySelector(s),words=t=>(String(t).match(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g)||[]).length;
  function state(id){const s=getSaved();s.paperWork??={};s.paperWork[id]=O.mergeWork(id,s.paperWork[id],{});return s.paperWork[id];}
  const selected=()=>papers.find(p=>p.id===selectedId);
  function link(url,label,cls='button secondary'){return url?`<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'';}
  const cettong='https://www.cettong.cn/library/cet6';
  const cettongArchive='https://raw.githubusercontent.com/whoamiARC/cet-website/4f4341cd7340f15e5d2d8cb8ecd8643fa8a46cae/public/library/cet6';
  const localFiles=window.createPairedFiles?.(window.CET6_PAIRED_FILES||{});
  let localBusy=false, localRestored=false, localStatus='';
  function verifiedPair(p, mode){
    const groups=O.sections(p.id,mode);
    const sharedFrom=groups[0]?.key?.sharedFrom;
    const sourceId=sharedFrom&&groups.every(group=>group.key?.sharedFrom===sharedFrom)?sharedFrom:p.id;
    const pair=window.CET6_PAIRED_PAPERS?.[sourceId]?.[mode];
    const session=p.sessionId.replace('-','_');
    const allowedFiles=[`${session}_1`,`${session}_2`,`${session}_3`,`${session}_2-3`];
    return pair&&allowedFiles.includes(pair.file)&&pair.key===O.signature(p.id,mode)?pair:null;
  }
  function pairedAssets(pair, part=pair){
    if(pair.local){
      const pdf=localFiles?.url(pair.local.pdf), audio=localFiles?.url(pair.local.audio);
      return pdf&&(!pair.local.audio||audio)?{pdf,audio}:null;
    }
    const url=`${cettong}/${part.file}`;
    return {pdf:`${url}/test.pdf`,backupPdf:`${cettongArchive}/${part.file}/test.pdf`,audio:`${url}/listening.mp3`};
  }
  function activePair(p,mode=tab){
    const pair=documentView==='paired'&&verifiedPair(p,mode);
    return pair&&pairedAssets(pair)?pair:null;
  }
  function redrawLocalPair(){
    if(isActive()&&documentView==='paired'&&selected()&&verifiedPair(selected(),tab)?.local)redraw();
  }
  function pairedBadge(p){
    const listening=verifiedPair(p,'listening'),reading=verifiedPair(p,'reading');
    if(listening?.local||reading?.local)return '核对版 · 本地导入';
    if(listening&&reading)return '站内题文与录音';
    return listening?'站内听力':reading?'站内阅读':'';
  }
  function restoreLocalFiles(){
    if(!localFiles||localRestored||localBusy)return;
    localBusy=true;
    localFiles.restore().catch(()=>{}).finally(()=>{
      localRestored=true;
      localBusy=false;
      redrawLocalPair();
    });
  }
  async function importLocalFiles(files){
    if(!localFiles||!files.length||localBusy)return;
    localBusy=true;
    redrawLocalPair();
    try{
      const result=await localFiles.importFiles(files);
      if(!result.matched)localStatus='未找到与核对版本一致的文件。请选择配套 PDF 和录音。';
      else{
        localStatus=`已识别 ${result.matched} 个配套文件。`;
        if(result.unmatched)localStatus+=` ${result.unmatched} 个文件与配套版本不符。`;
        if(result.persisted<result.matched)localStatus+='浏览器未保存部分文件，关闭页面后可能需要重新选择。';
      }
    }catch{
      localStatus='暂时无法读取文件，请重新选择配套资料。';
    }finally{
      localBusy=false;
      redrawLocalPair();
    }
  }
  function alignedGroups(p, mode, pair){
    return O.sections(p.id,mode).map(group=>({...group,items:group.numbers.map(number=>{
      const [sourceNumber, order]=pair?.questions?.[number]||[number,group.options.join('')];
      const choices=group.options.map((value,index)=>({value,label:order[index]}))
        .filter(choice=>choice.label&&choice.label!=='-').sort((a,b)=>a.label.localeCompare(b.label));
      const label=value=>choices.find(choice=>choice.value===value)?.label||'';
      return {number,sourceNumber,choices,label};
    }).sort((a,b)=>a.sourceNumber-b.sourceNumber)}));
  }
  function backupPapers(p){
    const session=p.sessionId.replace('-','_');
    const postponed=['2022-09','2023-03'].includes(p.sessionId);
    const sets=postponed?[1]:[1,2,3];
    const online=sets.map(n=>link(`https://www.guojiya.cn/exam/cet6_${session}_${n}`,`过级鸭第 ${n} 套`));
    if(postponed)online.push(link(`${cettong}/${session}_1`,'CET通第 1 套 PDF 和录音'),link(`${cettong}/${session}_2-3`,'CET通第 2–3 套补充资料'));
    else if(p.year<=2025)online.push(link(cettong,'CET通 PDF 和录音目录'));
    return online.join('');
  }
  function paperSources(p){
    const pair=verifiedPair(p,tab), inline=activePair(p);
    const part=inline?.parts?.[pairedPart]||inline;
    const assets=inline?pairedAssets(inline,part):null;
    const pairedUrl=assets?.pdf||'';
    const localOpen=pair?.local&&documentView==='paired';
    const source=sectionSource||p;
    const url=source.previewUrl||source.htmlUrl||source.sourceUrl;
    const showOriginal=documentView==='original';
    return `<section class="paper-document" aria-label="真题资料">
      <div class="paper-reader-note">
        <h3>真题题文</h3>
        ${pair?`<div class="paired-paper-note">
          <p>${inline?'答题卡已对齐配套卷面的题号和选项，交卷后由六级练习室判分。':pair.local?'首次选择核对过的资料文件，就能在本站打开并判分。':'本部分有逐题核对的配套卷面，可在本站查看并判分。'}</p>
          <div class="paper-source-actions">
            <button class="button ${documentView==='paired'?'secondary':'primary'}" data-action="exam-document" data-value="${documentView==='paired'?'sources':'paired'}">${documentView==='paired'?'收起配套试卷':'站内打开配套试卷'}</button>
            ${pair.local?link(pair.sourceUrl,pair.sourceLabel,'text-link'):link(`${cettong}/${part?.file||pair.file}`,'来源 · CET通','text-link')}
          </div>
          ${localOpen&&!inline?`<div class="paired-file-picker">
            <label for="paired-files">选择配套资料（可一次选多份）</label>
            <input id="paired-files" type="file" accept=".pdf,.mp3,.m4a" data-action="exam-local-files" multiple ${localBusy?'disabled':''}>
            <p>文件在此浏览器读取和保存。可一起选 3 份 PDF 和 2 份录音。这里按听力与阅读对应套号。</p>
            <p role="status">${localBusy?'正在检查配套文件…':esc(localStatus)}</p>
          </div>`:''}
        </div>`:''}
        ${inline?.parts?`<div class="paper-source-actions" role="group" aria-label="配套阅读题型">${inline.parts.map((resource,i)=>`<button class="chip ${i===pairedPart?'active':''}" aria-pressed="${i===pairedPart}" data-action="exam-paired-part" data-value="${i}">${esc(resource.label)}</button>`).join('')}</div>`:''}
        ${inline&&part.file.split('_').at(-1).split('-')[0]!==String(p.setNumber)?'<p class="small muted">配套卷面采用本部分的共用卷。</p>':''}
        ${inline&&!inline.local?`<p class="small muted">卷面无法显示时可${link(`${pairedUrl}#page=${part.page}`,'单独打开 PDF','text-link')}。</p>`:''}
        ${inline?.note?`<p class="small muted">${esc(inline.note)}</p>`:''}
      </div>
      ${inline?`<paired-pdf id="paired-paper-reader" data-src="${esc(pairedUrl)}" data-page="${part.page}"${assets.backupPdf?` data-backup-src="${esc(assets.backupPdf)}"`:''} aria-label="${esc(p.title)}${tab==='listening'?'听力':'阅读'}配套卷面"></paired-pdf>`:''}
      <div class="paper-reader-note">
        <details class="disclosure"${pair?'':' open'}>
          <summary>同考期其他备用试卷</summary>
          <div class="paper-source-actions" role="group" aria-label="同考期备用真题">${backupPapers(p)}</div>
          <p>这些备用卷可能采用不同题序或选项，请在对应站点完成答题与核对。</p>
        </details>
        <details class="disclosure"${showOriginal?' open':''}>
          <summary>原站题文、PDF 与解析</summary>
          <div class="paper-source-actions">
            <button class="button secondary" data-action="exam-document" data-value="${showOriginal?'sources':'original'}">${showOriginal?'收起原站预览':'加载原站预览'}</button>
            ${link(url,'打开原站题文')}${link(source.pdfUrl,'原卷 PDF')}${link(source.answerUrl,'参考答案 PDF')}
          </div>
          ${sectionSource?`<p>当前预览 ${esc(source.title)} 的共用题文。</p>`:''}
        </details>
      </div>
      ${showOriginal&&url?`<iframe id="paper-frame" src="${esc(url)}" title="${esc(source.title)}原站题文" referrerpolicy="no-referrer" loading="lazy"></iframe>`:''}
      <div class="paper-reader-note"><b>资料说明</b><p>${esc(p.note)}</p><span>${esc(p.coverage)}</span>${p.sources?.length?`<details class="disclosure"><summary>其他来源与核对材料</summary>${p.sources.map(x=>`<p>${link(x.url,esc(x.title),'text-link')}<br>${esc(x.note||'')}</p>`).join('')}</details>`:''}</div>
    </section>`;
  }
  function listeningSource(p){
    const pair=activePair(p);
    if(pair)return tab==='listening'?`<section class="real-audio"><h3>配套听力录音</h3>
      <audio id="real-audio" controls preload="none" aria-label="配套听力录音" src="${esc(pairedAssets(pair).audio)}"></audio>
      <p>录音与配套卷面来自同一个版本。</p>
    </section>`:'<section class="real-audio"><h3>配套卷面</h3><p>答题卡已对齐阅读题号与选项。切换到「听力」可查看该部分资料。</p></section>';
    if(documentView==='paired'&&verifiedPair(p,tab)?.local)return '<section class="real-audio"><h3>站内配套资料</h3><p>选好核对版文件后即可开始练习。</p></section>';
    const shared=papers.find(x=>x.id===O.bank(p.id)?.sections?.listening?.sharedFrom);
    const audioPaper=p.audioUrl?p:shared;
    const supportsHls=typeof window.Audio==='function'&&new window.Audio().canPlayType('application/vnd.apple.mpegurl');
    return `<section class="real-audio"><h3>本卷听力</h3>
      ${shared?`<p>本部分与 ${esc(shared.title)} 共用听力。</p>`:''}
      ${audioPaper?.audioUrl&&supportsHls?`<audio id="real-audio" controls preload="none" aria-label="本卷听力原音" src="${esc(audioPaper.audioUrl)}"></audio>`:''}
      ${audioPaper?.audioUrl?link(audioPaper.audioUrl,'原音地址（支持 HLS 的播放器）','text-link'):''}
      ${link(audioPaper?.audioPageUrl,'原站播放器','text-link')}
      <p>原音打不开时，可在真题题文区打开同考期备用卷，按备用卷的录音和选项作答。</p>
    </section>`;
  }
  function catalog(){const years=['全部',...new Set(papers.map(p=>String(p.year)))].sort((a,b)=>a==='全部'?-1:b==='全部'?1:Number(b)-Number(a));const filtered=papers.filter(p=>(year==='全部'||String(p.year)===year)&&(!search||`${p.title} ${p.sessionLabel} ${(p.topics?.translation||[]).join(' ')} ${(p.topics?.writing||[]).join(' ')}`.toLowerCase().includes(search.toLowerCase())));const sessions=[...new Set(filtered.map(p=>p.sessionId))];return `<section class="page-heading"><div><div class="eyebrow">PAST PAPERS / 2021–2026</div><h1>近五年真题，按考期练。</h1><p>选择考期和套卷，一边看原卷，一边完成听力、阅读答题与写译练习。</p></div><div class="heading-stamp">CET<span>6</span><small>PAST PAPERS</small></div></section><div class="paper-stats"><span><b>${papers.length}</b> 个套卷条目</span><span><b>${new Set(papers.map(p=>p.sessionId)).size}</b> 个考期</span><span><b>${papers.filter(p=>p.pdfUrl).length}</b> 份原卷 PDF</span><span>原来源核验 <b class="date">${esc(window.CET6_KEYS.updatedAt)}</b></span></div><div class="paper-intro"><p><b>时间范围：2021 年 12 月—2026 年 6 月。</b>包含期间查到的延期考期。原卷由公开来源直接提供，按来源套号区分；答案与听力按相应原卷核对。</p><p>听力与阅读支持自动判分、错题核对；成绩与作答保存在本机。看原卷和听原音需要联网。标有「站内题文与录音」的套卷可直接打开配套资料，标有「核对版 · 本地导入」的条目可导入已核对文件。也可查看同考期的备用来源。</p></div><div class="resource-tools"><label class="search-box"><span>⌕</span><input id="exam-search" type="search" aria-label="搜索真题" placeholder="搜索考期、套卷或话题" value="${esc(search)}"></label></div><div class="module-tabs">${years.map(y=>`<button class="chip ${year===y?'active':''}" data-action="exam-year" data-value="${y}">${y==='全部'?'全部考期':y+' 年'}</button>`).join('')}</div><div id="exam-catalog-results">${catalogRows(filtered,sessions)}</div><p class="small muted source-foot">更新核验以来源页面实际提供的材料为准；不把原创模拟题冒充真题，不宣称各来源套号一一对应。</p>`;}
  function catalogRows(filtered,sessions){if(!filtered.length)return '<div class="empty-state"><h3>没有匹配的套卷</h3><p>请更换关键词或年份。</p></div>';return sessions.map(sid=>{const group=filtered.filter(p=>p.sessionId===sid),first=group[0];return `<section class="exam-session"><div class="session-title"><div><span class="eyebrow">${esc(first.year)}</span><h2>${esc(first.sessionLabel)}</h2></div><span>${group.length} 份套卷</span></div><div class="exam-card-grid">${group.map(p=>`<article class="exam-card"><div class="exam-card-top"><span class="pill blue">真题 · ${esc(p.setLabel)}</span>${getSaved().paperWork?.[p.id]?.completed?'<span class="done-label">✓ 已练</span>':''}</div><h3>${esc(p.title)}</h3><div class="exam-badges"><span>${p.partial?'写译题页 + 共用卷':p.pdfUrl?'原卷 PDF':'在线题文'}</span><span>${p.audioPageUrl?'原音播放器':'无独立听力'}</span><span>听力 / 阅读自动判分</span>${pairedBadge(p)?`<span>${pairedBadge(p)}</span>`:''}</div>${p.topics?.translation?.length?`<p class="exam-topic">翻译话题：${esc(p.topics.translation.join(' / '))}</p>`:''}<p class="exam-provider">${esc(p.provider)}</p><button class="button primary" data-action="exam-open" data-id="${esc(p.id)}">打开套卷并练习 →</button></article>`).join('')}</div></section>`;}).join('');}
  function reader(){
    const p=selected(),s=state(p.id);
    return `<div class="paper-reader-heading"><button class="icon-button" data-action="exam-back">← 全部真题</button><span class="small muted">${esc(p.sessionLabel)} · ${esc(p.setLabel)}</span></div>
    <section class="page-heading reader-heading"><div><div class="eyebrow">REAL PAPER / ${esc(p.year)}</div><h1>${esc(p.title)}</h1><p>${esc(p.provider)} · 核验 ${esc(p.verifiedAt)}</p></div><button class="button ${s.completed?'secondary':'primary'}" data-action="exam-complete">${s.completed?'✓ 本套已练':'标记本套已练'}</button></section>
    ${p.partial?'<div class="source-notice"><b>本套部分内容共用</b><p>这一份PDF仅含写作、翻译；听力与阅读采用来源明确标注的共用卷；答题区会注明对应出处。</p></div>':''}
    <div class="real-study-grid">${paperSources(p)}
    <aside class="real-workspace">${listeningSource(p)}<div class="exam-work-tabs" role="group" aria-label="真题作答模块">${[['listening','听力'],['reading','阅读'],['translation','翻译'],['writing','作文'],['notes','笔记']].map(([v,n])=>`<button class="chip ${tab===v?'active':''}" data-action="exam-tab" data-value="${v}" aria-pressed="${tab===v}">${n}</button>`).join('')}</div><section class="exam-work-panel">${workPanel(p,s)}</section><p class="small muted real-save-note">作答仅保存在此浏览器，可在「我的复习」导出；网站公开不会公开你的草稿。</p></aside></div>`;
  }
  function resultPanel(p,s,mode,groups){
    const result=O.cleanSubmission(p.id,mode,s.objectiveResults?.[mode]);
    if(!result)return '';
    const g=O.grade(p.id,mode,result.answers),dirty=!O.same(p.id,mode,result.answers,s[mode]),changed=result.keyVersion!==O.signature(p.id,mode);
    const rows=new Map(g.rows.map(r=>[r.number,r]));
    const errors=groups.flatMap(group=>group.items).map(item=>({item,row:rows.get(item.number)}))
      .filter(({row})=>['wrong','blank'].includes(row.status));
    return `<section class="objective-result" aria-label="${mode==='reading'?'阅读':'听力'}判分结果"><div class="objective-score"><strong>${g.correct}<small> / ${g.total}</small></strong><span>题正确 · 正确率 ${g.percent}%</span></div><p class="small">${dirty?'上次交卷成绩 · 当前作答已修改，请重新提交。':'本次交卷成绩已保存。'}${changed?' 评分范围或参考答案已更新，已按当前规则重新核算。':''}</p><p class="small muted">提交于 ${esc(new Date(result.submittedAt).toLocaleString('zh-CN'))}${g.ungraded?' · '+g.ungraded+' 题未纳入判分':''}</p>${mode==='reading'?`<div class="objective-breakdown">${g.groups.map(x=>`<span>${x.label}<b>${x.graded?x.correct+' / '+x.graded:'待核验'}</b></span>`).join('')}</div>`:''}<details class="objective-errors"><summary>上次交卷错题 ${g.wrong} 道 · 未答 ${g.blank} 道</summary>${errors.length?`<div class="objective-error-list">${errors.map(({item,row})=>`<span>第 ${item.sourceNumber} 题：${item.label(row.chosen)||'未答'} → <b>${item.label(row.answer)}</b></span>`).join('')}</div>`:'<p class="small">已判分的题目全部答对。</p>'}</details>${dirty?'<button class="text-link" data-action="exam-restore">恢复上次交卷作答</button>':''}<p class="small muted">按第三方参考答案计算，用于练习。</p></section>`;
  }
  function objectivePanel(p,s,mode){
    if(documentView==='paired'&&verifiedPair(p,mode)?.local&&!activePair(p,mode))return '<div class="empty-copy"><h3>等待配套资料</h3><p>选择核对版试卷和本部分需要的录音，答题区会按该版本显示。</p></div>';
    if(!available(p,mode))return `<div class="empty-copy"><h3>本套无独立${mode==='reading'?'阅读':'听力'}</h3><p>请按来源提示打开同考期共用卷作答；本套客观题答案尚未核验。</p></div>`;
    const pair=activePair(p,mode),groups=alignedGroups(p,mode,pair),answers=O.sanitize(p.id,mode,s[mode]),total=mode==='reading'?30:25,n=Object.keys(answers).length,graded=O.grade(p.id,mode,answers);
    const result=O.cleanSubmission(p.id,mode,s.objectiveResults?.[mode]),fresh=result&&O.same(p.id,mode,result.answers,answers),feedback=fresh?O.grade(p.id,mode,answers).rows:[];
    const label=mode==='reading'?'阅读':'听力';
    return `<div class="section-title"><h3>${label}答题区</h3><span id="exam-answer-count" aria-live="polite">${n} / ${total} 已答</span></div><p class="small muted">${pair?'请按配套卷面的题号和选项作答。':mode==='reading'?'按原卷 26–55 题作答，包含三种阅读题型。':'按原卷 1–25 题作答。'}${mode==='reading'?'长篇匹配允许重复选择同一段。':''}交卷后显示逐题对错与参考答案；未答题计为未答，不计正确。</p>${resultPanel(p,s,mode,groups)}${groups.map(group=>{
      const source=group.key,sharedPaper=papers.find(x=>x.id===source?.sharedFrom);
      const sources=(source?.sources||[]).map(x=>typeof x==='string'?{url:x,title:'参考答案来源'}:x);
      if(source?.sourceUrl&&!sources.some(x=>x.url===source.sourceUrl))sources.push({url:source.sourceUrl,title:'参考答案来源'});
      if(pair){
        const sourceFile=pair.parts?.find(part=>part.groups.includes(group.id))?.file||pair.file;
        sources.unshift({url:pair.answerUrl||`${cettong}/${sourceFile}/answer.pdf`,title:'配套答案解析 PDF'});
        if(pair.evidence)sources.unshift(pair.evidence);
      }
      return `<section class="objective-section"><div class="objective-section-heading"><h4>${group.label} <small>${group.start}–${group.end}</small></h4><span>${group.verified?(group.excluded.length?'部分题目暂不计分':'可自动判分'):'答案待核验'}</span></div>${group.excluded.length?`<div class="source-notice"><b>第 ${group.items.filter(item=>group.excluded.includes(item.number)).map(item=>item.sourceNumber).join('、')} 题参考答案有争议，暂不计分</b><p>可继续选择并保存答案；成绩不包含该题。已交卷成绩会按当前判分范围重新计算。</p>${group.excluded.flatMap(n=>(group.key.excluded[n].sources||[])).map((url,i)=>link(url,'核对来源 '+(i+1),'text-link')).join(' ')}</div>`:''}${sharedPaper&&!pair?`<div class="objective-shared"><p>本部分共用：<b>${esc(sharedPaper.title)}</b>，请按该卷题号作答。</p><button class="text-link" data-action="exam-shared" data-id="${esc(sharedPaper.id)}">在题目区打开共用卷 →</button></div>`:''}<div class="exam-answer-grid">${group.items.map(({number,sourceNumber,choices,label:choiceLabel})=>{
        const row=feedback.find(r=>r.number===number),status=row?.status||'',picked=answers[number]||'';
        const controls=group.options.length>4?`<label class="sr-only" for="exam-q-${number}">第 ${sourceNumber} 题选项</label><select id="exam-q-${number}" data-action="exam-select" data-number="${number}"><option value="">请选择</option>${choices.map(({value,label})=>`<option value="${value}" ${picked===value?'selected':''}>${label}</option>`).join('')}</select>`:choices.map(({value,label})=>`<button class="${picked===value?'picked':''}" data-action="exam-answer" data-number="${number}" data-value="${value}" aria-label="第 ${sourceNumber} 题选 ${label}" aria-pressed="${picked===value}">${label}</button>`).join('');
        return `<div class="exam-answer-row ${group.options.length>4?'letter-select':''} ${status}" role="group" aria-label="真题第 ${sourceNumber} 题"><span>${String(sourceNumber).padStart(2,'0')}</span>${controls}<button class="answer-clear" data-action="exam-clear" data-number="${number}" aria-label="清除第 ${sourceNumber} 题答案" ${picked?'':'disabled'}>×</button>${row?`<small class="question-feedback">${status==='correct'?'✓ 正确':status==='ungraded'?'待核验，不计分':(status==='blank'?'未答':'✕ 错误')+' · 参考 '+choiceLabel(row.answer)}</small>`:''}</div>`;
      }).join('')}</div>${sources.length?`<details class="objective-source"><summary>答案出处 · ${esc(source.verifiedAt||O.bank(p.id)?.verifiedAt||'已核验')}</summary>${sources.map(x=>link(x.url,esc(x.title||'来源原页'),'text-link')).join('')}</details>`:''}</section>`;
    }).join('')}<div class="objective-actions"><button class="button primary" data-action="exam-submit" ${graded.total?'':'disabled'}>提交${label}并判分</button><button class="button secondary" data-action="exam-retry" ${n?'':'disabled'}>开始重做</button></div>${undoDraft?.id===p.id&&undoDraft?.mode===mode?'<div class="objective-confirm">已清空本轮作答。<button class="button secondary" data-action="exam-undo-retry">撤销重做</button></div>':''}${pendingSubmit?`<div class="objective-confirm" role="status">还有 ${graded.blank} 道可判分题未答，将计入分母。<button class="button primary" data-action="exam-confirm-submit">仍然交卷</button><button class="button secondary" data-action="exam-cancel-submit">继续答题</button></div>`:''}${graded.ungraded?`<p class="small muted">${graded.ungraded} 道题因答案待核验或存在争议，仅保存作答，不纳入成绩。</p>`:''}<div class="note-box">作答后可在对应题型的「答案出处」核对参考答案，再把错因记入「笔记」。重做保留上次交卷成绩，重新提交后更新。</div>`;
  }
  function workPanel(p,s){if(['listening','reading'].includes(tab))return objectivePanel(p,s,tab);
    const label={translation:'我的真题译文',writing:'我的真题作文',notes:'本套复盘笔记'}[tab];return `<div class="section-title"><h3>${label}</h3><span>自动保存</span></div>${tab!=='notes'?`<p class="small muted">${tab==='writing'?'先读原卷作文题面，遵守给定首句等具体要求。建议 30 分钟、150–200 词。':'先阅读原卷的中文段落，再独立翻译。建议 30 分钟；参考译法不唯一。'}</p>`:''}<label class="sr-only" for="exam-draft">${label}</label><textarea id="exam-draft" data-field="${tab}" lang="${tab==='notes'?'zh-CN':'en'}" spellcheck="true" placeholder="${tab==='notes'?'记录题号、错因和下一次要注意的内容…':'Write your '+(tab==='writing'?'essay':'translation')+' here…'}">${esc(s[tab]||'')}</textarea><div class="editor-meta"><span id="exam-word-count">${words(s[tab]||'')} words</span><span>${tab==='notes'?'':'对照原卷任务要求自查'}</span></div>${tab==='writing'?'<div class="note-box">检查：任务是否完整回应？给定首句是否保留？每段是否有具体理由或例子？字数、语法与拼写是否合适？</div>':''}`;
  }
  function render(){return selectedId&&selected()?reader():catalog();}
  function refreshPanel(){const panel=$('.exam-work-panel');if(panel)panel.innerHTML=workPanel(selected(),state(selectedId));}
  function updateAnswer(number,value){
    const p=selected();if(!p||!['listening','reading'].includes(tab))return;
    const group=O.sections(p.id,tab).find(g=>g.numbers.includes(Number(number)));if(!group||value&&!group.options.includes(value))return;
    const s=state(p.id);if(value)s[tab][number]=value;else delete s[tab][number];
    s.updatedAt=new Date().toISOString();pendingSubmit=false;undoDraft=null;save(true);refreshPanel();
    const focus=$(`#exam-q-${number}`)||$(`[data-action="exam-answer"][data-number="${number}"][data-value="${value}"]`);focus?.focus({preventScroll:true});
  }
  function submit(){const p=selected(),s=state(p.id);if(!['listening','reading'].includes(tab)||!O.grade(p.id,tab,s[tab]).total)return;s.objectiveResults??={};s.objectiveResults[tab]=O.submission(p.id,tab,s[tab]);s.updatedAt=new Date().toISOString();pendingSubmit=false;undoDraft=null;save(true);refreshPanel();$('.objective-result')?.scrollIntoView({block:'center',behavior:'smooth'});toast('已判分并保存，可逐题核对参考答案。');}
  function handleClick(b){
    const a=b.dataset.action;if(!a?.startsWith('exam-'))return false;const p=selected();
    if(a==='exam-year'){year=b.dataset.value;redraw();}
    else if(a==='exam-open'){if(!resume(b.dataset.id))return true;redraw();window.scrollTo({top:0});}
    else if(a==='exam-back'){selectedId=null;pendingSubmit=false;redraw();window.scrollTo({top:0});}
    else if(a==='exam-tab'){if(!['listening','reading','translation','writing','notes'].includes(b.dataset.value))return true;tab=b.dataset.value;pendingSubmit=false;pairedPart=0;document.querySelectorAll('[data-action="exam-tab"]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});if(documentView==='paired'){redraw();$(`[data-action="exam-tab"][data-value="${tab}"]`)?.focus({preventScroll:true});}else refreshPanel();}
    else if(a==='exam-shared'){const shared=papers.find(x=>x.id===b.dataset.id);if(shared){sectionSource=shared;documentView='original';redraw();$('#paper-frame')?.scrollIntoView({block:'nearest'});}}
    else if(a==='exam-document'){
      const view=b.dataset.value;
      if(view==='paired'&&(!p||!verifiedPair(p,tab)))return true;
      documentView=['original','paired'].includes(view)?view:'sources';
      if(view==='paired'&&verifiedPair(p,tab)?.local)restoreLocalFiles();
      sectionSource=null;pendingSubmit=false;redraw();
      ($('.paired-paper-note button')||$('.paper-document summary'))?.focus({preventScroll:true});
    }
    else if(a==='exam-paired-part'){
      const index=Number(b.dataset.value);
      if(!p||!activePair(p)?.parts?.[index])return true;
      pairedPart=index;
      redraw();
      $(`[data-action="exam-paired-part"][data-value="${index}"]`)?.focus({preventScroll:true});
    }
    else if(a==='exam-answer')updateAnswer(b.dataset.number,b.dataset.value);
    else if(a==='exam-clear')updateAnswer(b.dataset.number,'');
    else if(a==='exam-submit'){const s=state(p.id);if(O.grade(p.id,tab,s[tab]).blank){pendingSubmit=true;refreshPanel();$('.objective-confirm')?.scrollIntoView({block:'nearest'});}else submit();}
    else if(a==='exam-confirm-submit')submit();
    else if(a==='exam-cancel-submit'){pendingSubmit=false;refreshPanel();}
    else if(a==='exam-undo-retry'){if(undoDraft?.id===p.id&&undoDraft?.mode===tab){const s=state(p.id);s[tab]=undoDraft.answers;undoDraft=null;save(true);refreshPanel();}}
    else if(a==='exam-retry'){const s=state(p.id);undoDraft={id:p.id,mode:tab,answers:O.sanitize(p.id,tab,s[tab])};s[tab]={};s.updatedAt=new Date().toISOString();pendingSubmit=false;save(true);refreshPanel();toast('已清空本轮作答，可点「撤销重做」恢复。');}
    else if(a==='exam-restore'){const s=state(p.id),result=O.cleanSubmission(p.id,tab,s.objectiveResults?.[tab]);if(result){s[tab]={...result.answers};pendingSubmit=false;undoDraft=null;save(true);refreshPanel();}}
    else if(a==='exam-complete'){const s=state(p.id);s.completed=!s.completed;s.updatedAt=new Date().toISOString();save(true);redraw();toast(s.completed?'已标记本套练习完成。':'已取消完成标记，作答内容保留。');}
    return true;
  }
  function handleInput(t){if(t.dataset.action==='exam-select'){updateAnswer(t.dataset.number,t.value);return true;}if(t.id==='exam-draft'){const s=state(selectedId);s[t.dataset.field]=t.value;s.updatedAt=new Date().toISOString();save(true);$('#exam-word-count').textContent=words(t.value)+' words';return true;}if(t.id==='exam-search'){search=t.value;const list=papers.filter(p=>(year==='全部'||String(p.year)===year)&&`${p.title} ${p.sessionLabel} ${(p.topics?.translation||[]).join(' ')} ${(p.topics?.writing||[]).join(' ')}`.toLowerCase().includes(search.toLowerCase()));$('#exam-catalog-results').innerHTML=catalogRows(list,[...new Set(list.map(p=>p.sessionId))]);return true;}return false;}
  function stop(){document.querySelector('#real-audio')?.pause();}
  function reviewHTML(){const entries=papers.filter(p=>getSaved().paperWork?.[p.id]);return `<section class="review-section"><div class="section-title"><h2>真题练习记录</h2><span>${entries.length} 份</span></div>${entries.length?entries.map(p=>{const s=state(p.id);return `<button class="saved-row" data-action="exam-resume" data-id="${esc(p.id)}"><span>${esc(p.title)}<small>${Object.keys(s.listening||{}).length}/25 听力 · ${Object.keys(s.reading||{}).length}/30 阅读${['listening','reading'].map(mode=>{const r=O.cleanSubmission(p.id,mode,s.objectiveResults?.[mode]);if(!r)return '';const g=O.grade(p.id,mode,r.answers);return ' · '+(mode==='reading'?'阅读':'听力')+' '+g.correct+'/'+g.total+' 正确'+(!O.same(p.id,mode,r.answers,s[mode])?'（待重交）':'');}).join('')} · 译文 ${words(s.translation||'')} 词 · 作文 ${words(s.writing||'')} 词${s.completed?' · 已练':''}</small></span><span>→</span></button>`;}).join(''):'<p class="muted empty-copy">打开一套真题开始练习，这里会保留你的进度。</p>'}</section>`;}
  function resume(id){if(!papers.some(p=>p.id===id))return false;selectedId=id;documentView='sources';sectionSource=null;pendingSubmit=false;pairedPart=0;tab=initialTab(selected());return true;}
  function mergeImport(raw,merged){
    if(!raw?.paperWork||typeof raw.paperWork!=='object'||Array.isArray(raw.paperWork))return;
    merged.paperWork??={};
    for(const p of papers){
      const x=raw.paperWork[p.id];
      if(!x||typeof x!=='object'||Array.isArray(x))continue;
      const dest=O.mergeWork(p.id,merged.paperWork[p.id],x);
      if(!dest.listening||typeof dest.listening!=='object'||Array.isArray(dest.listening))dest.listening={};
      for(const field of ['translation','writing','notes']){
        if(typeof dest[field]==='string'&&dest[field].trim())continue;
        if(typeof x[field]==='string'&&x[field].length<100000)dest[field]=x[field];
        else if(typeof dest[field]!=='string')dest[field]='';
      }
      dest.completed=dest.completed===true||x.completed===true;
      merged.paperWork[p.id]=dest;
    }
  }
  return {render,handleClick,handleInput,stop,reviewHTML,resume,mergeImport,importLocalFiles};
};
