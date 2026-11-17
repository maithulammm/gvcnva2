import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createService} from '../service.mjs';
import {memoryDatabase} from './helpers.mjs';

const projectRoot=new URL('../../../',import.meta.url);
const entryHtml=fs.readFileSync(new URL('index.html',projectRoot),'utf8');
const scripts=[...entryHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map(m=>/\bsrc="([^"]+)"/.exec(m[1])?.[1]).filter(src=>src&&!/^https?:/.test(src))
  .map(src=>({path:src,code:fs.readFileSync(new URL(src,projectRoot),'utf8')}));
const source=entryHtml+'\n'+scripts.map(s=>s.code).join('\n');
const admin={email:'lammt@vietanhschool.edu.vn',oid:'11111111-1111-1111-1111-111111111111',name:'Admin'};
function frontend({memory=new Map(),api}={}) {
  const nodes=new Map(),alerts=[],bodyClasses=new Set();
  const el=id=>{
    if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,checked:false,open:false,
      classList:{add(){},remove(){}},addEventListener(){},replaceChildren(){this.innerHTML='';},
      close(){this.open=false;},showModal(){this.open=true;},focus(){},select(){}});
    return nodes.get(id);
  };
  const ctx={console:{log:console.log,warn(){},error(){}},TextEncoder,TextDecoder,Blob,Response,DecompressionStream,Uint8Array,DataView,URL,atob,AbortController,
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    alert:m=>alerts.push(m),confirm:()=>true,prompt:()=> 'Test reason',
    FormData:class {constructor(record){this.record=record;}get(key){return this.record[key]??null;}},
    localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    document:{getElementById:el,hidden:false,body:{classList:{add:c=>bodyClasses.add(c),remove:c=>bodyClasses.delete(c)}}},
    location:{origin:'http://127.0.0.1:5500',pathname:'/index.html',protocol:'http:'}};
  ctx.window={location:ctx.location};
  ctx.fetch=async(url,options={})=>{
    const path=new URL(url).pathname.replace('/gvcnApi',''),body=options.body?JSON.parse(options.body):{};
    try {
      let result;
      if(path==='/bootstrap') result=await api.bootstrap(admin);
      else if(path==='/teachers'&&options.method==='POST') result=await api.saveTeacher(admin,body);
      else if(path.startsWith('/teachers/')&&options.method==='DELETE') result=await api.deleteTeacher(admin,path.split('/')[2]);
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
