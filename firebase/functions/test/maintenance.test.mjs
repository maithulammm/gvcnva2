import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createMaintenance} from '../../../cloudflare/maintenance.mjs';
import {createApiHandler} from '../api.mjs';
import {createService} from '../service.mjs';
import {memoryDatabase} from './helpers.mjs';

test('D1 maintenance switch defaults off, persists message and rejects a stale Admin toggle',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../../cloudflare/migrations/0004_maintenance.sql',import.meta.url),'utf8'));
  const db={prepare(query){return {async first(){return sql.prepare(query).get();},bind(...args){return {async first(){return sql.prepare(query).get(...args);}};}};}};
  try{
    const control=createMaintenance(db);assert.equal((await control.read()).enabled,false);
    const state=await control.write({enabled:true,message:'Đang nâng cấp',revision:0});assert(state.enabled);assert.equal(state.revision,1);
    await assert.rejects(control.write({enabled:false,revision:0}),{status:409});
    assert.equal((await control.read()).message,'Đang nâng cấp');
    assert.equal((await control.write({enabled:false,revision:1})).enabled,false);
  }finally{sql.close();}
});

test('maintenance blocks teacher API reads writes uploads but allows Admin to switch it off',async()=>{
  const db=memoryDatabase(),service=createService(db);
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},teacher={email:'teacher@vietanhschool.edu.vn',oid:'teacher',name:'Teacher'};
  await service.bootstrap(admin);await service.saveTeacher(admin,{name:'Teacher',email:teacher.email,classId:'8C3',active:true});await service.bootstrap(teacher);
  let state={enabled:true,message:'Bảo trì',revision:1};
  const handle=createApiHandler({getDatabase:()=>db,identityVerifier:async token=>token==='admin'?admin:teacher,
    maintenance:{async read(){return state;},async write(body){state={...body,revision:state.revision+1};return state;}}});
  const publicState=await handle({method:'GET',path:'/maintenance'});assert(publicState.body.enabled);
  const before=JSON.stringify(db.state());
  for(const [method,path]of [['GET','/bootstrap'],['PUT','/classes/8C3'],['POST','/evidence/8C3/upload'],['PUT','/maintenance']]){
    const result=await handle({method,path,authorization:'Bearer teacher',body:{enabled:false}});
    assert.equal(result.status,503);assert.equal(result.body.code,'MAINTENANCE');
  }
  assert.equal(JSON.stringify(db.state()),before);
  assert.equal((await handle({method:'GET',path:'/bootstrap',authorization:'Bearer admin'})).status,200);
  assert.equal((await handle({method:'PUT',path:'/maintenance',authorization:'Bearer admin',body:{enabled:false,revision:1}})).status,200);
  assert.equal((await handle({method:'GET',path:'/bootstrap',authorization:'Bearer teacher'})).status,200);
  assert.equal((await handle({method:'PUT',path:'/maintenance',authorization:'Bearer teacher',body:{enabled:true,revision:2}})).status,403);
});
