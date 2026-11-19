const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){const ctx={window:{},console};vm.createContext(ctx);for(const name of ['papers.js','answer-keys.js','objective.js','exams-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),ctx);return ctx;}
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
