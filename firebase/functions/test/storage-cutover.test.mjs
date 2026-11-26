import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createStorageControl,guardDatabase} from '../../../cloudflare/storage-control.mjs';
import {finalSupabaseStep} from '../storage-cutover.mjs';
import {ROOT} from '../model.mjs';
import {createApiHandler} from '../api.mjs';
import {createService} from '../service.mjs';
import {memoryDatabase} from './helpers.mjs';
import {createMaintenance} from '../../../cloudflare/maintenance.mjs';
import {createWorker} from '../../../cloudflare/worker.mjs';

function controlFixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0004_maintenance.sql','0005_storage_cutover.sql'])sql.exec(readFileSync(new URL('../../../cloudflare/migrations/'+file,import.meta.url),'utf8'));
  const db={prepare(query){const statement=args=>({async first(){return sql.prepare(query).get(...args)||null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});return {...statement([]),bind:(...args)=>statement(args)};}};
  return {sql,db,control:createStorageControl(db)};
}
function branchDatabase(initial=null){
  let root=structuredClone(initial);
  return {state:()=>structuredClone(root),ref(path){
    const parts=path===ROOT?[]:path.slice(ROOT.length+1).split('/');
    const value=()=>parts.reduce((v,k)=>v?.[k],root)??null;
    return {async keys(){return Object.keys(value()||{});},async get(){return {val:()=>structuredClone(value())};},
      async transaction(update){const next=update(structuredClone(value()));if(next!==undefined){
        if(!parts.length)root=structuredClone(next);
        else{root||={};let parent=root;for(const k of parts.slice(0,-1))parent=parent[k]||={};parent[parts.at(-1)]=structuredClone(next);}
      }return {committed:next!==undefined,snapshot:{val:()=>structuredClone(value())}};}
    };
  }};
}
test('D1 barrier waits for admitted work, excludes concurrent final jobs and fences stale Firebase writers',async()=>{
  const {sql,control}=controlFixture();
  try{
    await assert.rejects(control.freeze(),{status:409});
    const leave=await control.enter('firebase');sql.exec('UPDATE gvcn_maintenance SET enabled=1');
    const locked=await control.freeze();assert.equal(locked.active,1);
    await assert.rejects(control.enter('firebase'),{status:503});
    await assert.rejects(control.assertFrozen(locked.epoch),{status:409});
    await leave();await control.assertFrozen(locked.epoch);
    await control.runFinal(async scoped=>{
      await scoped.assertFrozen(locked.epoch);
      await assert.rejects(control.runFinal(()=>{}),{status:409});
      await assert.rejects(control.cancel(locked.epoch),{status:409});
    });
    assert.equal((await control.read()).active,0);
    const db=branchDatabase({retained:true}),old=guardDatabase(db,control,'firebase');
    await assert.rejects(old.ref(ROOT).transaction(()=>({lost:true})),{status:503});
    await control.runFinal(scoped=>scoped.activate(locked.epoch));
    await assert.rejects(old.ref(ROOT).transaction(()=>({lost:true})),{status:503});
    await guardDatabase(db,control,'supabase').ref(ROOT).transaction(v=>({...v,new:true}));
    assert.deepEqual(db.state(),{retained:true,new:true});
  }finally{sql.close();}
});
test('final copy resumes, refuses activation before verification and detects source/target drift',async()=>{
  const {sql,control}=controlFixture();sql.exec('UPDATE gvcn_maintenance SET enabled=1');
  const source=branchDatabase({bootstrapAdminOid:'admin',users:{admin:{active:true}},classes:{'8C3':{revision:3,data:{students:[{id:'S1',name:'Kept'}],months:{T11_2026:{notes:{summary:'Kept'}}}}}}});
  const target=branchDatabase(),before=source.state();
  const invoke=body=>control.runFinal(scoped=>finalSupabaseStep(source,target,scoped,body));
  try{
    await control.freeze();let job=await invoke({operation:'begin'});
    await assert.rejects(invoke({operation:'activate',session:job.session}),{status:409});
    const again=await invoke({operation:'begin'});assert.equal(again.session,job.session);
    while(job.phase==='copy')job=await invoke({operation:'advance',session:job.session});
    await target.ref(ROOT+'/users').transaction(()=>({forged:true}));
    job=await invoke({operation:'advance',session:job.session});
    await assert.rejects(invoke({operation:'advance',session:job.session}),{status:409});
    assert.equal((await control.read()).source,'firebase');assert.deepEqual(source.state(),before);
    // Cancel/re-freeze invalidates the previous proof; restart copies again.
    await control.cancel((await control.read()).epoch);await control.freeze();job=await invoke({operation:'begin'});
    while(!job.verified)job=await invoke({operation:'advance',session:job.session});
    assert.equal(job.classes,1);assert.equal(job.students,1);
    assert.equal((await target.ref(ROOT+'/_migration').get()).val().state,'verified');
    const active=await invoke({operation:'activate',session:job.session});assert(active.activated);assert.equal(active.source,'supabase');
    assert.equal((await control.read()).frozen,false);assert.deepEqual(source.state(),before);
  }finally{sql.close();}
});
test('cancelled freeze invalidates verification and leftover target branches prevent activation',async()=>{
  const {sql,control}=controlFixture();sql.exec('UPDATE gvcn_maintenance SET enabled=1');
  const source=branchDatabase({bootstrapAdminOid:'admin',classes:{'8C3':{revision:0,data:{students:[],months:{}}}}}),target=branchDatabase();
  const invoke=body=>control.runFinal(scoped=>finalSupabaseStep(source,target,scoped,body));
  try{
    const first=await control.freeze();let job=await invoke({operation:'begin'});
    await target.ref(ROOT+'/unexpected').transaction(()=>({retained:true}));
    while(job.phase==='copy')job=await invoke({operation:'advance',session:job.session});
    while(job.verifyNext+1<job.total)job=await invoke({operation:'advance',session:job.session});
    await assert.rejects(invoke({operation:'advance',session:job.session}),{status:409});
    await control.cancel(first.epoch);await control.freeze();
    await assert.rejects(invoke({operation:'activate',session:job.session}),{status:409});
  }finally{sql.close();}
});
test('frozen API blocks Admin writes, keeps Admin read access, rejects teachers and skips scheduled work',async()=>{
  const f=controlFixture(),raw=memoryDatabase(),service=createService(raw);
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},teacher={email:'teacher@vietanhschool.edu.vn',oid:'teacher',name:'Teacher'};
  try{
    await service.bootstrap(admin);await service.saveTeacher(admin,{email:teacher.email,name:'Teacher',classId:'8C3',active:true});await service.bootstrap(teacher);
    f.sql.exec('UPDATE gvcn_maintenance SET enabled=1');await f.control.freeze();
    const handle=createApiHandler({getDatabase:()=>guardDatabase(raw,f.control,'firebase'),cutover:f.control,maintenance:createMaintenance(f.db),identityVerifier:async token=>token==='admin'?admin:teacher});
    const before=raw.state();
    for(const [method,path,body]of [['PUT','/classes/8C3',{}],['POST','/users',{}],['POST','/evidence/8C3/upload',{}],['GET','/evidence/oauth/callback',{}]]){
      assert.equal((await handle({method,path,body,authorization:'Bearer admin'})).status,503);
    }
    assert.equal((await handle({method:'GET',path:'/bootstrap',authorization:'Bearer admin'})).status,200);
    assert.equal((await handle({method:'GET',path:'/supabase/cutover',authorization:'Bearer admin'})).body.frozen,true);
    assert.equal((await handle({method:'GET',path:'/supabase/cutover',authorization:'Bearer teacher'})).status,503);
    assert.equal((await handle({method:'PUT',path:'/maintenance',body:{enabled:false,revision:0},authorization:'Bearer admin'})).status,409);
    assert.deepEqual(raw.state(),before);
    const worker=createWorker({createDatabase:()=>{throw Error('Frozen cron must not touch Firebase');}});
    let pending;await worker.scheduled({cron:'15 * * * *'},{GVCN_HISTORY:f.db},{waitUntil:p=>pending=p});await pending;
    assert.equal((await f.control.read()).active,0);
  }finally{f.sql.close();}
});
