import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createService} from '../service.mjs';
import {memoryDatabase} from './helpers.mjs';
import {summary,validateReport} from '../model.mjs';

const projectRoot=new URL('../../../',import.meta.url);
const entryHtml=fs.readFileSync(new URL('index.html',projectRoot),'utf8');
const scripts=[...entryHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map(m=>/\bsrc="([^"]+)"/.exec(m[1])?.[1]).filter(src=>src&&!/^https?:/.test(src))
  .map(src=>({path:src,code:fs.readFileSync(new URL(src,projectRoot),'utf8')}));
const source=entryHtml+'\n'+scripts.map(s=>s.code).join('\n');
const admin={email:'lammt@vietanhschool.edu.vn',oid:'11111111-1111-1111-1111-111111111111',name:'Admin'};
test('M01 uses the real monthly calendar and click choices, preserving legacy data and draft topics',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''},{id:'S2',name:'Other',code:''}];
    mdata().schedule.S1={priority:true,goal:'Mục tiêu cũ',status:'Hẹn lại',planTime:'Tuần 3',note:'Ghi chú cũ'};
    openModal('m01','S1')`);
  assert(!f.el('modalBody').innerHTML.includes('<select'));
  assert.equal(f.run(`scheduleMonthDates('T11/2026').length`),30);
  assert.equal(f.run(`scheduleMonthDates('T02/2027').length`),28);
  assert.equal(f.run(`scheduleMonthDates('T10/2026').length`),31);
  assert.equal((f.el('modalBody').innerHTML.match(/class="calendar-day"/g)||[]).length,30);
  f.ctx.appointment={date:'2026-11-18',session:'morning',topics:['Vở ghi','Học sinh chia sẻ'],note:'Ghi chú mới'};
  f.run('saveEditorDraft(appointment)');f.run(`openModal('m01','S1')`);
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(ui.editing.schedule.topics)')),['Vở ghi','Học sinh chia sẻ']);
  await f.run('submitForm({preventDefault(){},currentTarget:appointment})');
  assert.equal(f.run('mdata().schedule.S1.priority'),true);
  assert.equal(f.run('mdata().schedule.S1.status'),'Hẹn lại');
  assert.equal(f.run('mdata().schedule.S1.goal'),'Mục tiêu cũ · Vở ghi · Học sinh chia sẻ');
  assert.equal(f.run('mdata().schedule.S1.planTime'),'18/11/2026 · Sáng 9:55–10:15');
  assert.equal(f.run('summarize(cls(),ui.month).met'),0);
  assert.equal(f.run('summarize(cls(),ui.month).planned'),1);
  f.run(`openModal('m01','S2')`);
  await f.run('submitForm({preventDefault(){},currentTarget:appointment})');
  assert.equal(f.run('mdata().schedule.S2'),undefined);
  assert(f.alerts.some(x=>x.includes('đã hẹn')));
});
const completeMeeting={studentId:'S1',actual:'2026-11-10 · Phòng học',concern:'Học tập',participation:'Chủ động',
  progressEvidence:'Chưa đủ căn cứ',goal:'Mục tiêu',action:'Rà soát tuần sau',needsCoop:'Không',cooperation:'Chưa cần',
  evidence:'EV01',profileId:'P1',profileProgress:'Đã xác định khó khăn',profileNext:'2026-11-20'};

test('monthly work and original editor produce identical BGH totals and validation results',async()=>{
  const results=[];
  for(const quick of [false,true]) {
    const api=createService(memoryDatabase()),f=frontend({api});await f.login();
    f.run(`cls().students=[{id:'S1',name:'Student',code:'HS01'}];
      cls().profiles=[{id:'P1',studentId:'S1',code:'P01',startMonth:ui.month,strength:'A',concern:'B',goal:'C'}];
      mdata().schedule.S1={goal:'Mục tiêu',planTime:'2026-11-10'};save()`);
    await f.run('flushCloud()');
    const originalSummary=f.run('JSON.stringify(summarize(cls(),ui.month))');
    f.run(`navTo('work')`);
    assert(f.el('view').innerHTML.includes('Ghi cuộc gặp'));
    if(quick) f.run(`openWorkEntry('m02','S1')`);else f.run(`openModal('m02')`);
    assert.equal(f.run('JSON.stringify(summarize(cls(),ui.month))'),originalSummary);
    f.ctx.meetingInput=completeMeeting;
    await f.run('submitForm({preventDefault(){},currentTarget:meetingInput})');
    await f.run('flushCloud()');
    const boot=await api.bootstrap(admin),c=boot.classes['6A1'];
    assert.equal(c.months['T11/2026'].meetings.length,1);
    assert.equal(c.months['T11/2026'].connections.length,0);
    assert(f.run('renderM01().includes("Đã gặp")'));
    assert(f.run('renderM05().includes("1 lượt")'));
    results.push({totals:summary(c,'T11/2026'),checks:validateReport(c,'T11/2026')});
    await api.saveUserRoles(admin,{email:'bgh@vietanhschool.edu.vn',name:'BGH',roles:['bgh'],active:true});
    const bgh=await api.bootstrap({email:'bgh@vietanhschool.edu.vn',oid:'bgh-oid',name:'BGH'});
    assert.deepEqual(bgh.summaries['6A1']['T11/2026'],results.at(-1).totals);
    await f.run('submitForm({preventDefault(){},currentTarget:meetingInput})');
    assert.equal(f.run('mdata().meetings.length'),1);
  }
  assert.deepEqual(results[0],results[1]);
  assert.equal(results[1].totals.profileSessions,1);
  assert.equal(results[1].totals.meetings,1);
  assert.equal(results[1].totals.improved,0);
});

test('continuing a plan requires review, preserves history and never copies completion',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];
    mdata(cls(),'T10/2026').plans=[{id:'OLD',studentId:'S1',need:'N',goal:'G',action:'A',deadline:'2026-10-20',cooperation:'C',assessment:'E',result:'Đạt một phần'},
      {id:'DONE',studentId:'S1',need:'N',goal:'Done',action:'A',deadline:'2026-10-20',cooperation:'C',assessment:'E',result:'Đạt'}];save()`);
  await f.run('flushCloud()');
  const old=f.run(`JSON.stringify(mdata(cls(),'T10/2026'))`);
  assert.equal(f.run('previousMonthPlans().length'),1);
  f.run(`continueWorkPlan('OLD')`);
  assert.match(f.el('modalBody').innerHTML, /name="deadline"[^>]*value=""/);
  assert.equal(f.run('mdata().plans.length'),0);
  await f.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1',need:'N',goal:'G',action:'A',deadline:'2026-11-20',cooperation:'C',assessment:'E',result:'Chưa chốt'}})`);
  await f.run('flushCloud()');
  assert.equal(f.run('previousMonthPlans().length'),0);
  assert.equal(f.run('summarize(cls(),ui.month).supportDone'),0);
  assert.equal(f.run('summarize(cls(),ui.month).supportPrev'),0);
  assert.equal(f.run('summarize(cls(),ui.month).meetings'),0);
  assert.equal(f.run(`JSON.stringify(mdata(cls(),'T10/2026'))`),old);
  const plan=f.run('mdata().plans[0]');assert.equal(plan.sourcePlanId,'OLD');
  f.run(`openModal('plans','',{sourceMonth:'T10/2026',sourcePlanId:'OLD'})`);
  await f.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1'}})`);
  assert.equal(f.run('mdata().plans.length'),1);
});

test('unsubmitted drafts survive reload without entering reports and cannot cross months or classes',async()=>{
  const memory=new Map(),f=frontend({memory});await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];save();openWorkEntry('m02','S1')`);
  f.ctx.draftInput={...completeMeeting,profileId:'',concern:'Unsubmitted concern'};
  f.run('saveEditorDraft(draftInput)');
  assert.equal(f.run('mdata().meetings.length'),0);
  const next=frontend({memory});await next.login();
  next.run(`openWorkEntry('m02','S1')`);
  assert(next.el('modalBody').innerHTML.includes('Unsubmitted concern'));
  assert.equal(next.run('mdata().meetings.length'),0);
  next.run(`ui.month='T12/2026';openWorkEntry('m02','S1')`);
  assert(!next.el('modalBody').innerHTML.includes('Unsubmitted concern'));
  next.run(`ui.month='T11/2026';openWorkEntry('m02','S1');ui.classId='6A2'`);
  await next.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1'}})`);
  assert.equal(next.run(`appData.classes['6A1'].months['T11/2026'].meetings.length`),0);
  assert(next.alerts.some(message=>message.includes('đã thay đổi')));
});

test('monthly workspace honors preview and locked-month restrictions',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];setRolePreview('gvcn','6A1');navTo('work');openWorkEntry('m02','S1')`);
  assert.equal(f.run('ui.editing'),null);
  assert(!f.el('view').innerHTML.includes('openWorkEntry('));
  f.run(`setRolePreview('');auth.assignment={role:'gvcn',classId:'6A1'};mdata().approval.state='submitted';navTo('work');openWorkEntry('m02','S1')`);
  assert.equal(f.run('ui.editing'),null);
  assert(!f.el('view').innerHTML.includes('openWorkEntry('));
});

test('failed form persistence keeps the draft and retry does not duplicate a meeting',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];save();openWorkEntry('m02','S1')`);
  f.ctx.input={...completeMeeting,profileId:''};
  f.run('saveEditorDraft(input)');
  const key=f.run('editorDraftKey()'),setItem=f.ctx.localStorage.setItem;
  f.ctx.localStorage.setItem=()=>{throw Error('Storage full');};
  await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings.length'),0);
  assert(f.el('editor').open);assert(f.memory.has(key));
  f.ctx.localStorage.setItem=setItem;
  await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings.length'),1);
  assert(!f.memory.has(key));
});
test('classes above 28 students save to Firebase and export all students across every month',async()=>{
  const api=createService(memoryDatabase());
  const f=frontend({api});await f.login();
  // Supply the browser XML DOM surface to exercise the real XLSX exporter in Node.
  const sample=new DOMParser().parseFromString('<root><cell/></root>','application/xml');
  for(const list of [sample.childNodes,sample.getElementsByTagName('*')])
    Object.getPrototypeOf(list)[Symbol.iterator]=Array.prototype[Symbol.iterator];
  const elementPrototype=Object.getPrototypeOf(sample.documentElement);
  if(!Object.getOwnPropertyDescriptor(elementPrototype,'children'))
    Object.defineProperty(elementPrototype,'children',{get(){return Array.from(this.childNodes).filter(n=>n.nodeType===1);}});
  f.ctx.DOMParser=DOMParser;f.ctx.XMLSerializer=XMLSerializer;
  f.run(`cls().students=Array.from({length:35},(_,i)=>({id:'S'+i,name:'Student '+i,code:'HS'+i}));
    for(const month of MONTHS) mdata(cls(),month).schedule.S34={goal:'Last student '+month};
    save();`);
  await f.run('flushCloud()');
  assert.equal((await api.bootstrap(admin)).classes['6A1'].students.length,35);
  let exported;
  f.ctx.downloadFile=blob=>{exported=blob;};
  await f.run('exportClass()');
  assert(exported, f.alerts.join('\n'));
  f.ctx.exportedBuffer=await exported.arrayBuffer();
  const files=await f.run('readZip(exportedBuffer)');
  const parse=path=>new DOMParser().parseFromString(new TextDecoder().decode(files[path]),'application/xml');
  const paths=f.run('getSheetNamePaths');
  const entries=paths(files);
  const sheet=name=>parse(entries.find(s=>s.name===name).path);
  const cell=(doc,addr)=>Array.from(doc.getElementsByTagName('c')).find(c=>c.getAttribute('r')===addr);
  assert.equal(cell(sheet('DanhSach'),'B39').textContent,'Student 34');
  assert.match(cell(sheet('TheoDoiHS'),'B39').textContent,/DanhSach!\$B\$39/);
  const m01=sheet('M01');
  for(let month=0;month<9;month++) {
    const row=5+month*35+34;
    assert.equal(cell(m01,'E'+row).textContent,'Last student '+f.run(`MONTHS[${month}]`));
    assert.match(cell(m01,'C'+row).textContent,/DanhSach!\$B\$39/);
    assert(cell(m01,'J'+row).textContent.includes('C'+row));
  }
  assert(cell(sheet('TongHop'),'G5').textContent.includes('$A$319'));
  assert(cell(sheet('ThongTin'),'B9').textContent.includes('$B$39'));
  assert(new TextDecoder().decode(files['xl/workbook.xml']).includes('DanhSach!$B$5:$B$39'));
});

test('healthy synchronization uses a green check while errors remain visible',async()=>{
  const f=frontend({api:createService(memoryDatabase())});await f.login();
  assert.equal(f.el('offlineNotice').textContent,'✓');
  assert.equal(f.el('offlineNotice').className,'sync-ok');
  f.run(`cloud.error='Network unavailable';updateStorageNotice()`);
  assert(f.el('offlineNotice').textContent.includes('Network unavailable'));
  assert.equal(f.el('offlineNotice').className,'notice');
  assert(!entryHtml.includes('sidebarStorage'));
  assert(!entryHtml.includes('TRƯỜNG VIỆT ANH · HỆ THỐNG QUẢN LÝ'));
});
test('new devices use source login and Firebase configuration without setup controls',async()=>{
  for (const memory of [new Map(),new Map([
    ['VA_GVCN_MICROSOFT_AUTH_CONFIG_V1','{"tenantId":"old","clientId":"old"}'],
    ['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":false}'],
  ])]) {
    const before=[...memory.entries()],f=frontend({memory});
    f.run(`makeMsalClient=async config=>({handleRedirectPromise:async()=>null,getAllAccounts:()=>[]})`);
    await f.run('initializeMsLogin()');
    assert.equal(f.run('auth.config.tenantId'),'22215a7f-b9e3-4b53-bd27-3a317311e6ca');
    assert.equal(f.run('auth.config.clientId'),'94c476b3-4723-4161-9dea-d64ff8bf505c');
    assert.equal(f.run('readCloudConfig().enabled'),true);
    assert.equal(f.el('msLoginBtn').disabled,false);
    assert.deepEqual([...memory.entries()],before);
  }
  const gate=entryHtml.slice(entryHtml.indexOf('<section id="authGate"'),entryHtml.indexOf('<div class="app">'));
  assert.equal((gate.match(/<button\b/g)||[]).length,1);
  assert(!/<input\b|<details\b/.test(gate));
});
test('Admin previews all roles with scoped navigation and no data or role mutations',async()=>{
  const f=frontend();await f.login();
  const assignment=f.run('JSON.stringify(auth.assignment)');
  const stored=[...f.memory.entries()];
  f.run(`setRolePreview('gvcn','8C3')`);
  assert.equal(f.run('ui.role'),'gvcn');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(getScope())')),['8C3']);
  assert(f.el('nav').innerHTML.includes("navTo('m01')"));
  assert(!f.el('nav').innerHTML.includes("navTo('users')"));
  assert.equal(f.run('editable()'),false);assert.equal(f.run('canEditSetup()'),false);
  assert.equal(f.run('save()'),false);
  const before=f.run('JSON.stringify(appData)');
  await f.run(`transition('8C3','submitted')`);
  f.run('demoData()');
  assert.equal(f.run('JSON.stringify(appData)'),before);
  f.run(`setRolePreview('lead','12C1')`);
  assert(f.run(`getScope().every(id=>gradeText(id)==='12')`));
  assert(f.el('nav').innerHTML.includes("navTo('m01')"));
  f.run(`setRolePreview('bgh')`);
  assert.equal(f.run('getScope().length'),32);
  assert(!f.el('nav').innerHTML.includes("navTo('students')"));
  f.run(`setRolePreview('admin')`);
  assert(f.el('nav').innerHTML.includes("navTo('users')"));
  assert.equal(f.run('canEditSetup()'),false);
  f.run(`setRolePreview('')`);
  assert.equal(f.run('isRolePreview()'),false);
  assert.equal(f.run('canEditSetup()'),true);
  assert.equal(f.run('JSON.stringify(auth.assignment)'),assignment);
  assert.deepEqual([...f.memory.entries()],stored);
});

test('non-Admin cannot enter preview even by invoking the switch directly',async()=>{
  const f=frontend();await f.login();
  f.run(`auth.assignment={role:'gvcn',classId:'8C3'};ui.preview=null;setRolePreview('admin','6A1');render()`);
  assert.equal(f.run('isRolePreview()'),false);
  assert.equal(f.run('hasAppRole("admin")'),false);
  assert.equal(f.el('rolePreview').innerHTML,'');
});
test('Excel roster matches codes before names and rejects ambiguous duplicate names',()=>{
  const {run}=frontend();
  const result=JSON.parse(run(`JSON.stringify(reconcileRoster(
    [{id:'A',name:'Same',code:'01'},{id:'B',name:'Same',code:'02'}],
    [{name:'Renamed',code:'02'},{name:'Same',code:'01'}]))`));
  assert.deepEqual(result.map(s=>s.id),['B','A']);
  assert.throws(()=>run(`reconcileRoster([{id:'A',name:'Same',code:'01'},{id:'B',name:'Same',code:'02'}],[{name:'Same',code:''}])`));
  assert.throws(()=>run(`reconcileRoster([],[{name:'Same',code:''},{name:'Same',code:''}])`));
  assert.throws(()=>run(`reconcileRoster([],[{name:'A',code:'01'},{name:'B',code:'01'}])`));
});
test('changing selected class during Excel parsing keeps the import in its original class',async()=>{
  const f=frontend();await f.login();
  f.run(`ui.classId='8C3';ui.grade='8';
    readZip=async()=>({sheet:new Uint8Array()});
    getSheetNamePaths=()=>[{name:'DanhSach',path:'sheet'}];
    xmlparse=()=>({getElementsByTagNameNS:()=>[{
      getAttribute:()=> '5',getElementsByTagNameNS:()=>[
        {getAttribute:k=>k==='r'?'B5':'inlineStr',getElementsByTagNameNS:(ns,k)=>k==='is'?[{textContent:'Imported student'}]:[]},
        {getAttribute:k=>k==='r'?'C5':'inlineStr',getElementsByTagNameNS:(ns,k)=>k==='is'?[{textContent:'HS01'}]:[]}
      ]
    }]});`);
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  f.ctx.importEvent={target:{value:'file',files:[{arrayBuffer:()=>gate}]}};
  const pending=f.run('importRoster(importEvent)');
  f.run(`ui.classId='8C2'`);release(new ArrayBuffer(0));await pending;
  assert.equal(f.run(`appData.classes['8C3'].students[0].code`),'HS01');
  assert.equal(f.run(`appData.classes['8C2'].students.length`),0);
});
function frontend({memory=new Map(),api}={}) {
  const nodes=new Map(),alerts=[],bodyClasses=new Set();
  const el=id=>{
    if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,checked:false,open:false,
      classList:{add(){},remove(){}},setAttribute(k,v){this[k]=v;},addEventListener(){},replaceChildren(){this.innerHTML='';},
      close(){this.open=false;},showModal(){this.open=true;},focus(){},select(){}});
    return nodes.get(id);
  };
  const ctx={console:{log:console.log,warn(){},error(){}},TextEncoder,TextDecoder,Blob,Response,DecompressionStream,Uint8Array,DataView,URL,atob,AbortController,
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    alert:m=>alerts.push(m),confirm:()=>true,prompt:()=> 'Test reason',
    FormData:class {constructor(record){this.record=record;}get(key){return this.record[key]??null;}getAll(key){const value=this.record[key];return value===undefined?[]:Array.isArray(value)?value:[value];}},
    localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    document:{getElementById:el,hidden:false,body:{classList:{add:c=>bodyClasses.add(c),remove:c=>bodyClasses.delete(c)}}},
    location:{origin:'http://127.0.0.1:5500',pathname:'/index.html',protocol:'http:'}};
  ctx.window={location:ctx.location};
  ctx.fetch=async(url,options={})=>{
    const path=new URL(url).pathname.replace(/^\/api/,'')||'/',body=options.body?JSON.parse(options.body):{};
    try {
      let result;
      if(path==='/bootstrap') result=await api.bootstrap(admin);
      else if(path==='/teachers'&&options.method==='POST') result=await api.saveTeacher(admin,body);
      else if(path.startsWith('/teachers/')&&options.method==='DELETE') result=await api.deleteTeacher(admin,path.split('/')[2]);
      else if(path==='/users'&&options.method==='POST') result=await api.saveUserRoles(admin,body);
      else if(path==='/directory/import'&&options.method==='POST') result=await api.importDirectory(admin,body);
      else if(path.startsWith('/classes/')&&options.method==='PUT') result=await api.putClass(admin,path.split('/')[2],body);
      else if(path.startsWith('/import/')) result=await api.putClass(admin,path.split('/')[2],body,true);
      else throw Error(`Unexpected test route ${path}`);
      return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(result))};
    } catch(error) {return {ok:false,status:error.status||500,json:async()=>({error:error.message})};}
  };
  vm.createContext(ctx);
  for(const script of scripts)vm.runInContext(script.code,ctx,{filename:script.path});
  const run=code=>vm.runInContext(code,ctx);
  async function login() {
    // Local feature tests explicitly opt out of the production Firebase default.
    if (!api) run('readCloudConfig=()=>({enabled:false})');
    run(`auth.config={tenantId:'22222222-2222-2222-2222-222222222222'};
      auth.client={acquireTokenSilent:async()=>({idToken:'SYNTHETIC-TEST-TOKEN'})};`);
    await run(`authenticatedStart({username:'lammt@vietanhschool.edu.vn',tenantId:auth.config.tenantId,idTokenClaims:{oid:'${admin.oid}'}});`);
  }
  return {ctx,run,login,el,memory,alerts,bodyClasses};
}

test('local Admin can manage GVCN; non-Admin sees roster without CRUD controls',async()=>{
  const f=frontend();await f.login();assert.equal(f.run('ui.role'),'admin');
  for(const page of f.run('VIEW_LIST.map(v=>v[0])')) f.run(`navTo('${page}')`);
  f.run(`ui.classId='8C3';ui.grade='8';openModal('teacherAccount');`);
  assert(f.el('modalBody').innerHTML.includes('value="1" selected'));
  await f.run(`saveTeacherAccount({name:'Giáo viên A',email:'teacher@vietanhschool.edu.vn',classId:'8C3',active:true});`);
  assert.equal(f.run('cls().teacher'),'Giáo viên A');assert.equal(f.run('Object.keys(appData.teachers).length'),1);
  const id=f.run('Object.keys(appData.teachers)[0]');
  await f.run(`saveTeacherAccount({id:'${id}',name:'Tên mới',email:'teacher@vietanhschool.edu.vn',classId:'8C2',active:true});`);
  assert.equal(f.run('appData.classes["8C2"].teacher'),'Tên mới');assert.equal(f.run('appData.classes["8C3"].teacher'),'');
  f.run(`auth.assignment={role:'gvcn',classId:'8C2'};ui.role='gvcn';ui.classId='8C2';ui.grade='8';navTo('students');`);
  assert.equal(f.run('canEditSetup()'),false);
  assert(!f.el('nav').innerHTML.includes('Quản lý GVCN'));assert(!f.el('view').innerHTML.includes('Thêm học sinh'));
  assert.equal(f.alerts.length,0);
});

test('Admin student form add/edit/delete and linked student cannot be removed',async()=>{
  const f=frontend();await f.login();
  f.run(`ui.classId='6A1';openModal('student');`);
  await f.run(`submitForm({preventDefault(){},currentTarget:{name:'Học sinh A',code:'HS01'}});`);
  assert.equal(f.run('cls().students.length'),1);
  const id=f.run('cls().students[0].id');
  f.run(`openModal('student','${id}')`);
  await f.run(`submitForm({preventDefault(){},currentTarget:{name:'Tên cập nhật',code:'HS01'}});`);
  assert.equal(f.run('cls().students[0].name'),'Tên cập nhật');
  f.run(`removeRecord('student','${id}')`);assert.equal(f.run('cls().students.length'),0);
  f.run(`cls().students.push({id:'S2',name:'Có hồ sơ',code:'HS02'});mdata().previous.push({id:'R1',studentId:'S2'});removeRecord('student','S2')`);
  assert.equal(f.run('cls().students.length'),1);assert.equal(f.alerts.length,1);
});

test('Firebase sync uses API, preserves original local data and has no phantom writes on empty views',async()=>{
  const db=memoryDatabase(),api=createService(db),memory=new Map();
  const original='{"schema":2,"year":"2026-2027","classes":{}}';
  memory.set('VA_GVCN_MSAL_PROTOTYPE_DATA_V1',original);memory.set('VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}');
  const f=frontend({api,memory});await f.login();assert.equal(f.run('cloud.ready'),true);
  assert(f.bodyClasses.has('auth-ready'));
  for(const page of f.run('VIEW_LIST.map(v=>v[0])')) f.run(`navTo('${page}')`);
  await f.run('flushCloud()');assert.equal(f.run('cloud.worker'),null);assert.equal(f.run('cloud.pending.size'),0);
  await f.run(`saveTeacherAccount({name:'Teacher',email:'teacher@vietanhschool.edu.vn',classId:'8C3',active:true});`);
  f.run(`ui.classId='8C3';ui.grade='8';cls().students.push({id:'S1',name:'Student',code:'HS01'});save();`);
  assert.equal(f.run('cloud.pending.size'),1);await f.run('flushCloud()');
  assert.equal((await api.bootstrap(admin)).classes['8C3'].students[0].name,'Student');
  assert.equal(memory.get('VA_GVCN_MSAL_PROTOTYPE_DATA_V1'),original);
  assert(!memory.has(f.run('cloudCacheKey()+"_PENDING"')));
});

test('Admin can manage roles and import the approved directory through the authenticated API',async()=>{
  const api=createService(memoryDatabase()),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  const f=frontend({api,memory});await f.login();
  await f.run(`saveUserRole({name:'School leader',email:'bgh@vietanhschool.edu.vn',roles:['bgh'],grades:[],active:true});`);
  assert.equal(f.run(`appData.users.find(x=>x.email==='bgh@vietanhschool.edu.vn').roles[0]`),'bgh');
  assert(f.run(`renderUsers().includes('Tài khoản & vai trò')`));
  f.run(`navTo('users');openModal('userRoles','bgh@vietanhschool.edu.vn');`);
  assert(f.el('modalBody').innerHTML.includes('name="roles"'));
  f.run(`$('editor').close();`);
  const directory={schema:1,year:'2026-2027',teachers:[{name:'Teacher',email:'teacher@vietanhschool.edu.vn',classId:'8C3',roles:['gvcn','lead'],grades:['8'],active:true}],users:[]};
  await f.run(`importDirectoryFile({target:{files:[{text:async()=>${JSON.stringify(JSON.stringify(directory))}}],value:'selected'}});`);
  const boot=await api.bootstrap({email:'teacher@vietanhschool.edu.vn',oid:'teacher-oid',name:'Teacher'});
  assert.deepEqual(boot.assignment.roles,['gvcn','lead']);
  assert.equal(f.run('cloud.error'),'');
});

test('reload restores unsynced draft and conflict refuses to overwrite a newer server record',async()=>{
  const db=memoryDatabase(),api=createService(db),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  let f=frontend({api,memory});await f.login();
  f.run(`cls().students.push({id:'S1',name:'Pending Student',code:''});save();`);
  const key=f.run('cloudCacheKey()+"_PENDING"');assert(memory.has(key));
  f=frontend({api,memory});await f.login();assert.equal(f.run('cls().students[0].name'),'Pending Student');
  await f.run('flushCloud()');assert(!memory.has(key));
  f.run(`cls().students[0].name='Pending local change';save();`);
  const remote=await api.bootstrap(admin),c=remote.classes['6A1'];c.students[0].name='Changed on another computer';
  await api.putClass(admin,'6A1',{classData:c,revision:remote.revisions['6A1']});
  f=frontend({api,memory});await f.login();assert(f.run('cloud.error').includes('Máy chủ đã có cập nhật'));
  assert.equal(f.run('cls().students[0].name'),'Pending local change');
  await f.run('retryCloud()');assert(f.run('cloud.error'));
  assert.equal((await api.bootstrap(admin)).classes['6A1'].students[0].name,'Changed on another computer');
  assert(memory.has(key));
});

test('an edit made while a Firebase write is in flight is saved in the next revision',async()=>{
  const api=createService(memoryDatabase()),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  const f=frontend({api,memory});await f.login();
  let release,started;
  const requestStarted=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const fetchOriginal=f.ctx.fetch;let first=true;
  f.ctx.fetch=async(url,options)=>{
    if(options.method==='PUT'&&first) {first=false;started();await gate;}
    return fetchOriginal(url,options);
  };
  f.run(`cls().students.push({id:'S1',name:'First edit',code:''});save();`);
  const saving=f.run('flushCloud()');await requestStarted;
  f.run(`cls().students[0].name='Edit made during save';save();`);release();await saving;
  const server=await api.bootstrap(admin);
  assert.equal(server.classes['6A1'].students[0].name,'Edit made during save');
  assert.equal(f.run('cloud.pending.size'),0);
});

test('pending records outside a new assignment remain available for export',async()=>{
  const api=createService(memoryDatabase()),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  const f=frontend({api,memory});await f.login();
  f.run(`cls().students.push({id:'S1',name:'Pending in previous class',code:''});save();`);
  const key=f.run('cloudCacheKey()+"_PENDING"'),raw=memory.get(key);
  f.run(`cloud.pending.clear();cloud.baselines={'8C3':classFingerprint(appData.classes['8C3'])};auth.assignment={role:'gvcn',classId:'8C3'};`);
  f.ctx.previousDraft=raw;f.run('restorePendingDrafts(previousDraft);storePendingDrafts();updateStorageNotice();');
  assert.equal(f.run('cloud.pending.size'),0);
  assert.equal(JSON.parse(memory.get(key)).classes['6A1'].data.students[0].name,'Pending in previous class');
  assert(f.el('syncActions').innerHTML.includes('exportPendingDrafts'));
});

test('invalid local data is retained and Microsoft URI generation respects current origin',async()=>{
  const raw='CORRUPT-LEGACY-CONTENT',memory=new Map([['VA_GVCN_MSAL_PROTOTYPE_DATA_V1',raw]]);
  const f=frontend({memory});await f.login();assert.equal(memory.get('VA_GVCN_MSAL_PROTOTYPE_DATA_V1'),raw);
  assert(!f.bodyClasses.has('auth-ready'));
  assert.equal(f.run('currentRedirectUri()'),'http://127.0.0.1:5500/index.html');
  assert(f.run(`microsoftErrorText(new Error('AADSTS50011')).includes(currentRedirectUri())`));
  assert(source.includes('https://alcdn.msauth.net/browser/2.35.0/js/msal-browser.min.js'));
  assert(source.includes('cacheLocation: "sessionStorage"'));
});

test('index and directory entry use the index Entra redirect and preserve stored config',()=>{
  const config='{"tenantId":"22222222-2222-2222-2222-222222222222","clientId":"94c476b3-4723-4161-9dea-d64ff8bf505c"}';
  const memory=new Map([['VA_GVCN_MICROSOFT_AUTH_CONFIG_V1',config]]),f=frontend({memory});
  for(const entry of ['/index.html','/','/school/index.html','/school/']) {
    f.ctx.location.pathname=entry;
    const directory=entry.endsWith('/')?entry:entry.slice(0,entry.lastIndexOf('/')+1);
    assert.equal(f.run('currentRedirectUri()'),'http://127.0.0.1:5500'+directory+'index.html');
  }
  assert.equal(memory.get('VA_GVCN_MICROSOFT_AUTH_CONFIG_V1'),config);
});
