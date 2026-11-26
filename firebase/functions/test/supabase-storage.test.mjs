import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createSupabaseDatabase} from '../../../cloudflare/supabase-database.mjs';
import {createService} from '../service.mjs';
import {ROOT,YEAR} from '../model.mjs';
import {stageSupabase} from '../supabase-migration.mjs';
import {memoryDatabase} from './helpers.mjs';

test('Postgres storage preserves service permissions, class/month data, CAS and unchanged month rows',async()=>{
  const sql=new PGlite();
  try{
    await sql.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    for(const file of ['0001_gvcn_staging.sql','0002_transactional_storage.sql'])
      await sql.exec(readFileSync(new URL('../../../supabase/migrations/'+file,import.meta.url),'utf8'));
    const connection={async rpc(name,args){
      if(name==='gvcn_read')return (await sql.query('SELECT gvcn_read($1,$2) AS result',[args.y,args.p])).rows[0].result;
      return (await sql.query('SELECT gvcn_cas($1,$2,$3,$4) AS result',[args.y,args.p,args.expected,JSON.stringify(args.next_value)])).rows[0].result;
    }};
    const db=createSupabaseDatabase({}, {connection,requireVerified:false}),api=createService(db);
    const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'};
    const boot=await api.bootstrap(admin);assert.equal(Object.keys(boot.classes).length,32);
    const c=boot.classes['8C3'];c.students=[{id:'S1',name:'Kept'}];c.months={'T11/2026':{notes:{summary:'November'}},'T12/2026':{notes:{summary:'December'}}};
    const saved=await api.putClass(admin,'8C3',{classData:c,revision:0});
    const before=(await sql.query("SELECT xmin::text FROM gvcn_class_months WHERE class_id='8C3' AND month_key='T12/2026'")).rows[0].xmin;
    const patch={monthVersions:{'T11/2026':1},operations:[{month:'T11/2026',collection:'notes',id:'notes',operation:'upsert',value:{summary:'Edited'}}]};
    await api.putClass(admin,'8C3',{patch});
    const after=(await sql.query("SELECT xmin::text FROM gvcn_class_months WHERE class_id='8C3' AND month_key='T12/2026'")).rows[0].xmin;
    assert.equal(after,before);
    await assert.rejects(api.putClass(admin,'8C3',{classData:saved.data,revision:0}),{status:409});
    const loaded=(await api.bootstrap(admin)).classes['8C3'];assert.equal(loaded.students[0].id,'S1');assert.equal(loaded.months['T11/2026'].notes.summary,'Edited');
    assert.equal((await db.ref(ROOT+'/classes/8C3/data/months/T12_2026').get()).val().notes.summary,'December');
    await sql.exec('SET ROLE anon');
    await assert.rejects(sql.query('SELECT gvcn_read($1,$2)',[YEAR,[]]),/permission denied/);
    await sql.exec('RESET ROLE');
    const guarded=createSupabaseDatabase({}, {connection});await assert.rejects(guarded.ref(ROOT).get(),{status:503});
    const teacher={email:'teacher@vietanhschool.edu.vn',oid:'teacher',name:'Teacher'};
    await api.saveTeacher(admin,{name:teacher.name,email:teacher.email,classId:'8C3',active:true});
    const teacherBoot=await api.bootstrap(teacher);assert.equal(Object.keys(teacherBoot.classes).length,1);
    await assert.rejects(api.putClass(teacher,'8C4',{classData:loaded,revision:0}),{status:403});
    const source=memoryDatabase((await db.ref(ROOT).get()).val()),sourceBefore=JSON.stringify(source.state());
    await assert.rejects(stageSupabase(source,db),{status:409});
    await sql.exec('TRUNCATE gvcn_class_months,gvcn_classes,gvcn_nodes');
    const staged=await stageSupabase(source,db);assert(staged.matched&&staged.sourceUnchanged);assert.equal(staged.classes,32);
    assert.equal(JSON.stringify(source.state()),sourceBefore);
    assert.equal((await db.ref(ROOT+'/_migration').get()).val().state,'staged');
    await assert.rejects(guarded.ref(ROOT).get(),{status:503});
  }finally{await sql.close();}
});
