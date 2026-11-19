const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createHash, webcrypto}=require('node:crypto');
function setup(){const ctx={window:{},console,URL,crypto:webcrypto};vm.createContext(ctx);for(const name of ['papers.js','answer-keys.js','objective.js','paired-papers.js','paired-files.js','exams-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),ctx);return ctx;}
const plain=x=>JSON.parse(JSON.stringify(x));
test('all 36 source-matched papers have complete valid keys, including shared sections',()=>{const {window:w}=setup();let count=0;assert.equal(w.CET6_PAPERS.papers.length,36);for(const p of w.CET6_PAPERS.papers){for(const mode of ['listening','reading']){const parts=w.CET6_OBJECTIVE.sections(p.id,mode);for(const s of parts){assert.ok(s.verified,`${p.id} ${s.id}`);assert.ok(s.key.sources.length);if(s.key.sharedFrom)assert.deepEqual(plain(s.answers),plain(w.CET6_KEYS.papers[s.key.sharedFrom].sections[s.id].answers));}const answers=Object.assign({},...parts.map(s=>s.answers));const g=w.CET6_OBJECTIVE.grade(p.id,mode,answers);assert.equal(g.percent,100);assert.equal(g.total,mode==='listening'?25:(['cet6-2026-06-3','cet6-2023-12-2'].includes(p.id)?29:30));count+=g.total;}}assert.equal(count,1978);});
test('wrong and missing answers remain in the denominator',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2025-12-3';const g=o.grade(id,'reading',{26:'A',36:'R',46:'B',99:'A'});assert.equal(g.correct,1);assert.equal(g.wrong,2);assert.equal(g.blank,27);assert.equal(g.total,30);assert.equal(g.percent,3);});
test('matching accepts Q/R and repeated paragraph letters; invalid choices are ignored',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2025-12-3';assert.deepEqual(plain(o.sanitize(id,'reading',{26:'P',36:'R',37:'R',38:'Q',46:'E',55:'D',56:'A'})),{36:'R',37:'R',38:'Q',55:'D'});});
test('editing never mutates submission; key changes recalculate the saved snapshot',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2025-12-3',a={26:'N'};const r=o.submission(id,'reading',a);a[26]='A';assert.equal(r.answers[26],'N');assert.equal(o.same(id,'reading',r.answers,a),false);assert.equal(o.grade(id,'reading',r.answers).correct,1);w.CET6_KEYS.papers[id].sections.cloze.answers[26]='A';assert.notEqual(r.keyVersion,o.signature(id,'reading'));assert.equal(o.grade(id,'reading',r.answers).correct,0);});
test('missing or incomplete reference sections are excluded, never assigned guesses',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2025-12-3';delete w.CET6_KEYS.papers[id].sections.matching.answers[36];const g=o.grade(id,'reading',{});assert.equal(g.total,20);assert.equal(g.ungraded,10);assert.equal(g.blank,20);});
test('old records and imported snapshots merge without overwriting local choices or trusting score',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2025-12-3';const old={listening:{1:'B'},translation:'keep',writing:'essay',notes:'notes'};const imported={listening:{1:'A',2:'C'},reading:{26:'N',36:'Q',46:'E'},objectiveResults:{reading:{answers:{26:'N'},submittedAt:'2026-10-20T00:00:00Z',score:999,keyVersion:'fake'}}};const dest=o.mergeWork(id,old,imported);assert.equal(dest.listening[1],'B');assert.equal(dest.listening[2],'C');assert.equal(dest.translation,'keep');assert.equal(dest.reading[46],undefined);assert.equal(dest.objectiveResults.reading.score,undefined);assert.equal(o.grade(id,'reading',dest.objectiveResults.reading.answers).correct,1);assert.equal(o.same(id,'reading',dest.reading,dest.objectiveResults.reading.answers),false);assert.equal(o.cleanSubmission(id,'reading',{answers:[],submittedAt:'invalid'}),null);});
test('export/import preserves reading, submissions and drafts; unknown IDs stay out',()=>{const {window:w}=setup();const id='cet6-2025-12-3';let saved={paperWork:{}};const mod=w.createExamsModule({getSaved:()=>saved,save:()=>{},toast:()=>{},esc:String,redraw:()=>{}});const source={paperWork:{[id]:{reading:{26:'N',36:'Q'},objectiveResults:{reading:w.CET6_OBJECTIVE.submission(id,'reading',{26:'N',36:'Q'})},translation:'译文',writing:'essay',notes:'notes',completed:true},unknown:{reading:{26:'A'}}}};mod.mergeImport(plain(source),saved);assert.equal(saved.paperWork[id].reading[36],'Q');assert.equal(saved.paperWork[id].translation,'译文');assert.equal(saved.paperWork[id].completed,true);assert.equal(saved.paperWork.unknown,undefined);assert.ok(mod.reviewHTML().includes('阅读 2/30 正确'));mod.resume(id);assert.ok(mod.render().includes('阅读'));});
test('pending confirmation never follows resume to another paper; retry undo preserves unsubmitted work',()=>{const ctx=setup(),w=ctx.window;const node={innerHTML:'',scrollIntoView(){},focus(){},classList:{toggle(){}},setAttribute(){}};ctx.document={querySelector:()=>node,querySelectorAll:()=>[]};w.scrollTo=()=>{};const id='cet6-2025-12-3',other='cet6-2025-06-3';let saved={paperWork:{[id]:{listening:{1:'B'},reading:{26:'N'},translation:'keep me'}}};const mod=w.createExamsModule({getSaved:()=>saved,save:()=>{},toast:()=>{},esc:String,redraw:()=>{}});const click=(action,extra={})=>mod.handleClick({dataset:{action,...extra}});click('exam-open',{id});click('exam-submit');assert.ok(mod.render().includes('仍然交卷'));mod.resume(other);assert.ok(!mod.render().includes('仍然交卷'));mod.resume(id);click('exam-retry');assert.equal(Object.keys(saved.paperWork[id].listening).length,0);assert.ok(mod.render().includes('撤销重做'));click('exam-undo-retry');assert.equal(saved.paperWork[id].listening[1],'B');assert.equal(saved.paperWork[id].translation,'keep me');assert.equal(saved.paperWork[id].reading[26],'N');});

test('disputed question is stored but excluded from scoring and old scores recalculate',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2026-06-3';const answers=Object.assign({},...o.sections(id,'reading').map(s=>s.answers));const oldSignature=o.signature(id,'reading').replace('-', 'D');const old=o.cleanSubmission(id,'reading',{answers,submittedAt:'2026-10-20T00:00:00Z',keyVersion:oldSignature});for(const choice of ['A','B','C','D','']){const input={...answers};if(choice)input[50]=choice;else delete input[50];const g=o.grade(id,'reading',input),q=g.rows.find(r=>r.number===50);assert.equal(q.status,'ungraded');assert.equal(q.answer,'');assert.equal(g.total,29);assert.equal(g.correct,29);assert.equal(g.blank,0);assert.equal(g.groups.find(x=>x.id==='careful').graded,9);if(choice)assert.equal(o.sanitize(id,'reading',input)[50],choice);}assert.notEqual(old.keyVersion,o.signature(id,'reading'));assert.equal(o.grade(id,'reading',old.answers).total,29);});

test('second disputed question is excluded without affecting other papers',()=>{const {window:w}=setup(),o=w.CET6_OBJECTIVE,id='cet6-2023-12-2';const answers=Object.assign({},...o.sections(id,'reading').map(s=>s.answers));const g=o.grade(id,'reading',answers);assert.equal(g.total,29);assert.equal(g.correct,29);assert.equal(g.rows.find(r=>r.number===48).status,'ungraded');assert.equal(o.grade('cet6-2023-12-1','reading',{}).total,30);});

test('source outage leaves a same-session backup and the original answer card available', () => {
  const ctx = setup();
  const {window: w} = ctx;
  ctx.document = {querySelector: () => null};
  const saved = {paperWork: {'cet6-2022-09-3': {listening: {1: 'B'}}}};
  const mod = w.createExamsModule({getSaved: () => saved, save: () => {}, toast: () => {}, esc: String, redraw: () => {}});
  for (const paper of w.CET6_PAPERS.papers) {
    assert.ok(mod.resume(paper.id));
    const html = mod.render();
    const session = paper.sessionId.replace('-', '_');
    assert.ok(html.includes(`https://www.guojiya.cn/exam/cet6_${session}_1`));
    assert.ok(!html.includes('<iframe'));
    assert.ok(html.includes('听力答题区'));
  }
  mod.resume('cet6-2022-09-3');
  assert.ok(mod.render().includes('https://www.cettong.cn/library/cet6/2022_09_2-3'));
  assert.ok(!mod.render().includes('https://www.guojiya.cn/exam/cet6_2022_09_2'));
  mod.handleClick({dataset: {action: 'exam-shared', id: 'cet6-2022-09-1'}});
  assert.ok(mod.render().includes('id="paper-frame" src="https://english-exam.lazynote.cn/cet6/paper/2022-09-1/"'));
  mod.handleClick({dataset: {action: 'exam-document', value: 'sources'}});
  assert.ok(!mod.render().includes('<iframe'));
  assert.equal(saved.paperWork['cet6-2022-09-3'].listening[1], 'B');
});

test('each paired edition maps every question and option to its verified reference key', () => {
  const {window: w} = setup();
  const objective = w.CET6_OBJECTIVE;
  for (const [id, modes] of Object.entries(w.CET6_PAIRED_PAPERS)) {
    for (const [mode, pair] of Object.entries(modes)) {
      assert.equal(pair.key, objective.signature(id, mode));
      const expected = [];
      for (const group of objective.sections(id, mode)) {
        const numbers = [];
        for (const n of group.numbers) {
          const [source, order] = pair.questions?.[n] || [n, group.options.join('')];
          assert.deepEqual([...order].sort(), [...group.options].sort(), `${id} Q${n}`);
          numbers.push(source);
          const first = mode === 'reading' ? 26 : 1;
          const sourceAnswer = pair.answers[source - first];
          assert.ok(order.includes(sourceAnswer), `${id} Q${source} source key`);
          if (!group.excluded.includes(n)) {
            assert.equal(order[group.options.indexOf(group.answers[n])], pair.referenceCorrections?.[source] || sourceAnswer, `${id} Q${n}`);
          }
          expected[source] = sourceAnswer;
        }
        assert.deepEqual(numbers.sort((a, b) => a - b), Array.from(group.numbers));
      }
      assert.equal(expected.join(''), pair.answers, `${id} ${mode}`);
    }
  }
});

test('paired answers and results use displayed letters while saving the original choices', () => {
  const ctx = setup(), {window: w} = ctx, id = 'cet6-2023-03-2';
  ctx.document = {querySelector: () => null, querySelectorAll: () => []};
  const saved = {};
  const mod = w.createExamsModule({getSaved: () => saved, save: () => {}, toast: () => {}, esc: String, redraw: () => {}});
  const click = (action, value, number) => mod.handleClick({dataset: {action, value, number}});
  assert.ok(mod.resume(id));
  assert.doesNotMatch(mod.render(), /id="paired-paper-reader"/);
  click('exam-document', 'paired');
  let html = mod.render();
  assert.match(html, /2023_03_1\/test\.pdf" data-page="1"/);
  assert.match(html, /2023_03_1\/listening\.mp3/);
  assert.match(html, /data-number="1" data-value="A" aria-label="第 1 题选 B"/);
  click('exam-answer', 'A', '1');
  click('exam-confirm-submit');
  assert.equal(saved.paperWork[id].listening[1], 'A');
  assert.match(mod.render(), /aria-label="第 1 题选 B" aria-pressed="true"/);
  assert.equal(w.CET6_OBJECTIVE.grade(id, 'listening', saved.paperWork[id].listening).correct, 1);

  click('exam-tab', 'reading');
  html = mod.render();
  assert.match(html, /2023_03_1\/test\.pdf" data-page="3"/);
  assert.match(html, /data-number="51" data-value="C" aria-label="第 46 题选 A"/);
  click('exam-answer', 'C', '51');
  click('exam-confirm-submit');
  assert.equal(saved.paperWork[id].reading[51], 'C');
  assert.equal(w.CET6_OBJECTIVE.grade(id, 'reading', saved.paperWork[id].reading).correct, 1);

  click('exam-document', 'sources');
  assert.match(mod.render(), /aria-label="第 51 题选 C" aria-pressed="true"/);
  assert.doesNotMatch(mod.render(), /id="paired-paper-reader"/);
  mod.resume('cet6-2026-06-1');
  click('exam-document', 'paired');
  assert.doesNotMatch(mod.render(), /id="paired-paper-reader"/);
  assert.match(mod.render(), /等待配套资料/);
});

test('June 2026 admits checked local PDF and audio only and keeps shared listening separate', async () => {
  const ctx = setup(), {window: w} = ctx, id = 'cet6-2026-06-3';
  ctx.document = {querySelector: () => null, querySelectorAll: () => []};
  const testFiles = {
    'june-pdf-1': new Blob(['fixture one'], {type: 'application/pdf'}),
    'june-pdf-3': new Blob(['fixture three'], {type: 'application/pdf'}),
    'june-audio-1': new Blob(['fixture audio one'], {type: 'audio/mp4'})
  };
  for (const [key, file] of Object.entries(testFiles)) {
    w.CET6_PAIRED_FILES[key] = {
      size: file.size,
      sha256: createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')
    };
  }
  const saved = {};
  const mod = w.createExamsModule({getSaved: () => saved, save: () => {}, toast: () => {}, esc: String, redraw: () => {}});
  const click = (action, value, number) => mod.handleClick({dataset: {action, value, number}});
  assert.ok(mod.resume(id));
  click('exam-document', 'paired');
  assert.match(mod.render(), /等待配套资料/);
  await new Promise(resolve => setImmediate(resolve));
  await mod.importLocalFiles([new Blob(['bad fixture']), testFiles['june-pdf-3']]);
  assert.match(mod.render(), /1 个文件与配套版本不符/);
  assert.doesNotMatch(mod.render(), /id="paired-paper-reader"/);
  click('exam-tab', 'reading');
  assert.match(mod.render(), /id="paired-paper-reader"[^>]*blob:/);
  assert.match(mod.render(), /第 50 题参考答案有争议，暂不计分/);
  click('exam-tab', 'listening');
  await mod.importLocalFiles([testFiles['june-pdf-1'], testFiles['june-audio-1']]);
  assert.match(mod.render(), /id="real-audio"[^>]*blob:/);
  click('exam-answer', 'B', '1');
  click('exam-confirm-submit');
  assert.equal(w.CET6_OBJECTIVE.grade(id, 'listening', saved.paperWork[id].listening).correct, 1);
});

test('all 36 entries offer a verified pair for both modes, including split reading', () => {
  const ctx = setup(), {window: w} = ctx;
  ctx.document = {querySelector: () => null, querySelectorAll: () => []};
  const saved = {};
  const mod = w.createExamsModule({getSaved: () => saved, save: () => {}, toast: () => {}, esc: String, redraw: () => {}});
  const click = (action, value) => mod.handleClick({dataset: {action, value}});
  for (const paper of w.CET6_PAPERS.papers) {
    assert.ok(mod.resume(paper.id));
    for (const mode of ['listening', 'reading']) {
      click('exam-tab', mode);
      assert.match(mod.render(), /站内打开配套试卷/, `${paper.id} ${mode}`);
      click('exam-document', 'paired');
      const html = mod.render();
      if (paper.year === 2026) {
        assert.match(html, /id="paired-files"/);
      } else {
        assert.match(html, /id="paired-paper-reader"/, `${paper.id} ${mode}`);
        if (mode === 'listening') assert.match(html, /id="real-audio"[^>]*listening\.mp3/);
      }
      click('exam-document', 'sources');
    }
  }
  mod.resume('cet6-2021-12-3');
  click('exam-tab', 'reading');
  click('exam-document', 'paired');
  assert.match(mod.render(), /2021_12_1\/test\.pdf" data-page="3"/);
  click('exam-paired-part', '1');
  assert.match(mod.render(), /2021_12_3\/test\.pdf" data-page="1"/);
});
