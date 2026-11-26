import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportPKCS8,jwtVerify} from 'jose';
import {createWorker} from '../../../cloudflare/worker.mjs';
import {createFirebaseRestDatabase} from '../../../cloudflare/firebase-rest.mjs';
import {createService} from '../service.mjs';
import {ROOT,DATABASE_URL} from '../model.mjs';

const origin='https://gvcnva2.lammt.workers.dev';
const pair=await generateKeyPair('RS256',{extractable:true});
const credentials={type:'service_account',project_id:'gvcn-3bdf9',client_email:'test@gvcn-3bdf9.iam.gserviceaccount.com',private_key:await exportPKCS8(pair.privateKey)};
const configured={MICROSOFT_TENANT_ID:'22215a7f-b9e3-4b53-bd27-3a317311e6ca',
  MICROSOFT_CLIENT_ID:'94c476b3-4723-4161-9dea-d64ff8bf505c',GVCN_ALLOWED_ORIGINS:origin,
  FIREBASE_SERVICE_ACCOUNT:JSON.stringify(credentials)};

test('D1 archive preserves live data, supports Admin restore and retains Firebase history on failure',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const snapshots={},events={};let fail=false;
  const historyStore={async write(id,rows,audit){if(fail)throw Error('D1 unavailable');Object.assign(snapshots,structuredClone(rows));Object.assign(events,audit);},
    async read(){return {snapshots,events};},async snapshot(id,key){return snapshots[key];}};
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}),{historyStore});
  let c=(await api.bootstrap(admin)).classes['8C3'];
  c.months={'T11/2026':{notes:{summary:'Original'}}};
  let saved=await api.putClass(admin,'8C3',{classData:c,revision:0});
  c=saved.data;c.months['T11/2026'].notes.summary='Edited';
  saved=await api.putClass(admin,'8C3',{classData:c,revision:1});
  const before=fixture.state().classes['8C3'];fail=true;
  await assert.rejects(api.archiveClassHistory('8C3'),/D1 unavailable/);
  assert.deepEqual(fixture.state().classes['8C3'],before);
  fail=false;await api.archiveClassHistory('8C3');
  const after=fixture.state().classes['8C3'];
  assert.deepEqual(after.data,before.data);assert.equal(after.revision,before.revision);
  assert.equal(Object.keys(after.recovery).length,0);assert.equal(Object.keys(after.recoveryBlobs).length,0);
  assert.equal(snapshots['rev-1'].data.months.T11_2026.notes.summary,'Original');
  assert((await api.recovery(admin,'8C3')).snapshots['rev-1']);
  const restored=await api.restore(admin,'8C3',{key:'rev-1',revision:2});
  assert.equal(restored.classes['8C3'].months['T11/2026'].notes.summary,'Original');
});

test('D1 archive cleanup preserves a concurrent teacher save and its new recovery blobs',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  let interleave;
  const historyStore={async write(){await interleave?.();}};
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}),{historyStore});
  let c=(await api.bootstrap(admin)).classes['8C3'];c.months={'T11/2026':{notes:{summary:'First'}}};
  const saved=await api.putClass(admin,'8C3',{classData:c,revision:0});
  interleave=async()=>{
    const next=structuredClone(saved.data);next.months['T11/2026'].notes.summary='Concurrent';
    await api.putClass(admin,'8C3',{classData:next,revision:1});
  };
  await api.archiveClassHistory('8C3');
  const current=fixture.state().classes['8C3'];
  assert.equal(current.revision,2);assert.equal(current.data.months.T11_2026.notes.summary,'Concurrent');
  assert(current.recovery['rev-1']);
  for(const hash of Object.values(current.recovery['rev-1'].monthRefs))assert(current.recoveryBlobs[hash]);
  assert(Object.values(current.events).some(event=>event.action==='save-class:8C3'));
});

test('Record patches use independent month versions and reject stale months without losing other edits',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));
  const c=(await api.bootstrap(admin)).classes['8C3'];
  const patch=(month,version,text)=>({patch:{monthVersions:{[month]:version},operations:[{month,collection:'notes',id:'notes',operation:'upsert',value:{summary:text}}]}});
  let saved=await api.putClass(admin,'8C3',{classData:c,revision:0});
  const a=await api.putClass(admin,'8C3',patch('T11/2026',0,'November'));
  saved=await api.putClass(admin,'8C3',patch('T12/2026',0,'December'));
  assert.equal(saved.data.months['T11/2026'].notes.summary,'November');
  assert.equal(saved.data.months['T12/2026'].notes.summary,'December');
  assert.equal(saved.data.months['T11/2026']._revision,1);
  await assert.rejects(api.putClass(admin,'8C3',patch('T11/2026',0,'Overwrite')),{status:409});
  assert.equal(fixture.state().classes['8C3'].revision,saved.revision);
  // Older full-class clients must also advance the touched month version.
  saved.data.months['T11/2026'].notes.summary='Legacy updated';
  await api.putClass(admin,'8C3',{classData:saved.data,revision:saved.revision});
  await assert.rejects(api.putClass(admin,'8C3',patch('T11/2026',a.data.months['T11/2026']._revision,'Stale')),{status:409});
});

test('revision polling uses D1 only for notifications and falls back to Firebase on cache errors',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const cached={};let fail=false;
  const cache={now:()=>Date.now(),async read(){if(fail)throw Error('D1 offline');return cached;},async write(entries){Object.assign(cached,Object.fromEntries(entries));}};
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}),{revisionCache:cache});
  await api.bootstrap(admin);await api.changes(admin);fixture.trace.length=0;
  await api.changes(admin);
  assert(!fixture.trace.some(row=>row.path.endsWith('/revision')));
  assert(fixture.trace.some(row=>row.path.startsWith('users/')));
  fail=true;fixture.trace.length=0;await api.changes(admin);
  assert.equal(fixture.trace.filter(row=>row.path.endsWith('/revision')).length,32);
  cached['8C3']=999;
  const c=(await api.bootstrap(admin)).classes['8C3'];
  const saved=await api.putClass(admin,'8C3',{classData:c,revision:0});assert.equal(saved.revision,1);
  await assert.rejects(api.putClass(admin,'8C3',{classData:c,revision:0}),{status:409});
});

test('Firebase rejected cached credentials are renewed once; permission errors and uncertain writes are not retried',async()=>{
  const f=restFixture({keep:'value'});let firebaseCalls=0;
  const db=createFirebaseRestDatabase(configured,{fetchImpl:async(url,options)=>{
    if(String(url).includes('.firebasedatabase.app/')){
      firebaseCalls++;if(firebaseCalls===1)return Response.json({error:'Expired'},{status:401});
    }
    return f.fetch(url,options);
  }});
  assert.deepEqual((await db.ref(ROOT).get()).val(),{keep:'value'});
  assert.equal(firebaseCalls,2);assert.equal(f.counts().tokens,2);
  let denied=0;
  const blocked=createFirebaseRestDatabase(configured,{fetchImpl:async(url,options)=>{
    if(String(url).includes('.firebasedatabase.app/')){denied++;return Response.json({error:'Denied'},{status:403});}
    return f.fetch(url,options);
  }});
  await assert.rejects(blocked.ref(ROOT).get(),{status:503});assert.equal(denied,1);
  let writes=0;
  const uncertain=createFirebaseRestDatabase(configured,{fetchImpl:async(url,options)=>{
    if(options.method==='PUT'){writes++;throw TypeError('Disconnected after send');}
    return f.fetch(url,options);
  }});
  await assert.rejects(uncertain.ref(ROOT).transaction(raw=>({...raw,edit:true})),{status:503});
  assert.equal(writes,1);assert.deepEqual(f.state(),{keep:'value'});
});

test('scoped bootstrap backfills November inside class transaction and does not rewrite other months or repeat writes',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));
  const boot=await api.bootstrap(admin),c=boot.classes['8C3'];
  c.students=[{id:'S1',name:'Student'}];
  c.months={'T11/2026':{meetings:[{id:'R1',studentId:'S1',actual:'20/11/2026 09:55 · Phòng học'}]},'T12/2026':{notes:{summary:'December unchanged'}}};
  const saved=await api.putClass(admin,'8C3',{classData:c,revision:0});fixture.trace.length=0;
  const repaired=await api.bootstrap(admin,{ids:['8C3']});
  assert.equal(repaired.revisions['8C3'],saved.revision+1);
  assert.equal(repaired.classes['8C3'].months['T11/2026'].schedule.S1.appointments.length,1);
  assert.deepEqual(repaired.classes['8C3'].months['T12/2026'],saved.data.months['T12/2026']);
  assert(fixture.trace.filter(r=>r.method==='PUT').every(r=>r.path==='classes/8C3'));
  assert(fixture.state().classes['8C3'].recovery['rev-'+saved.revision]);
  fixture.trace.length=0;await api.bootstrap(admin,{ids:['8C3']});
  assert(!fixture.trace.some(r=>r.method==='PUT'));
});

function restFixture(initial=null,{conflicts=0,missingETag=false,deny=false}={}) {
  let state=structuredClone(initial),revision=0,tokens=0,writes=0,reads=0;
  const assertions=[],trace=[];
  return {state:()=>structuredClone(state),counts:()=>({tokens,writes,reads}),assertions,trace,
    async fetch(url,options={}) {
      if(url==='https://oauth2.googleapis.com/token') {
        tokens++;
        const assertion=new URLSearchParams(options.body).get('assertion');
        const {payload}=await jwtVerify(assertion,pair.publicKey,{issuer:credentials.client_email,audience:url});
        assert.match(payload.scope,/firebase\.database/);assert.match(payload.scope,/userinfo\.email/);
        assertions.push(payload);
        return Response.json({access_token:'GOOGLE_SERVER_TOKEN',expires_in:3600});
      }
      assert(url.startsWith(`${DATABASE_URL}/${ROOT}`)&&url.endsWith('.json'));
      const parts=url.slice(`${DATABASE_URL}/${ROOT}`.length,-5).split('/').filter(Boolean);
      trace.push({path:parts.join('/'),method:options.method});
      const value=()=>parts.reduce((node,key)=>node?.[key],state)??null;
      assert.equal(options.headers.Authorization,'Bearer GOOGLE_SERVER_TOKEN');
      if(deny)return Response.json({error:'PRIVATE_DATABASE_ERROR'},{status:403});
      if(options.method==='GET') {
        reads++;
        return Response.json(value(),{headers:missingETag?{}:{ETag:`"${revision}"`}});
      }
      assert.equal(options.method,'PUT');writes++;
      if(conflicts-->0) {
        state={...state,external:'retained'};revision++;
        return Response.json(state,{status:412,headers:{ETag:`"${revision}"`}});
      }
      if(options.headers['If-Match']!==`"${revision}"`)return Response.json(state,{status:412});
      const next=JSON.parse(options.body);
      if(parts.length){state ||= {};let node=state;for(const key of parts.slice(0,-1))node=node[key] ||= {};node[parts.at(-1)]=next;}
      else state=next;
      revision++;
      return Response.json(next);
    }};
}

test('Cloudflare routes API health, CORS and auth checks independently of static assets',async()=>{
  const worker=createWorker({createDatabase:()=>{throw Error('Database must not be touched');}}),env={...configured,
    ASSETS:{fetch:request=>new Response(new URL(request.url).pathname)}};
  const request=(path,options={})=>new Request(origin+path,{...options,headers:{Origin:origin,...options.headers}});
  const health=await worker.fetch(request('/api/health'),env);
  assert.equal(health.status,200);assert.equal((await health.json()).databaseConfigured,true);
  assert.equal((await worker.fetch(request('/api/bootstrap'),env)).status,401);
  const preflight=await worker.fetch(request('/api/bootstrap',{method:'OPTIONS'}),env);
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  assert.equal((await worker.fetch(request('/api/bootstrap',{method:'OPTIONS',headers:{Origin:'https://evil.invalid'}}),env)).status,403);
  assert.equal(await (await worker.fetch(request('/'),env)).text(),'/index.html');
  assert.equal(await (await worker.fetch(request('/index.html'),env)).text(),'/index.html');
  const missing=await worker.fetch(request('/api/health'),{...env,FIREBASE_SERVICE_ACCOUNT:''});
  assert.equal(missing.status,503);assert.equal((await missing.json()).databaseConfigured,false);
  assert.equal((await worker.fetch(request('/api/bootstrap',{method:'POST',body:'not JSON'}),env)).status,400);
  const tooLarge=await worker.fetch(request('/api/bootstrap',{method:'POST',body:'x'.repeat(5*1024*1024+1)}),env);
  assert.equal(tooLarge.status,413);
});

test('Firebase REST transactions retry concurrent changes and cache server-only OAuth tokens',async()=>{
  const fixture=restFixture({count:1},{conflicts:1});
  const db=createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}),ref=db.ref(ROOT);
  const result=await ref.transaction(value=>({...value,count:value.count+1}));
  assert.equal(result.committed,true);assert.deepEqual(result.snapshot.val(),{count:2,external:'retained'});
  assert.deepEqual(fixture.counts(),{tokens:1,writes:2,reads:2});
  await ref.get();assert.equal(fixture.counts().tokens,1);
  const aborted=await ref.transaction(()=>undefined);
  assert.equal(aborted.committed,false);assert.equal(fixture.counts().writes,2);
  assert.throws(()=>db.ref('/another/path'));
});

test('Firebase REST refuses blind writes and bounds retries without disclosing upstream errors',async()=>{
  const noTag=restFixture({count:1},{missingETag:true});
  await assert.rejects(createFirebaseRestDatabase(configured,{fetchImpl:noTag.fetch}).ref(ROOT).transaction(v=>v),{status:503});
  assert.equal(noTag.counts().writes,0);
  const conflicting=restFixture({count:1},{conflicts:10});
  await assert.rejects(createFirebaseRestDatabase(configured,{fetchImpl:conflicting.fetch,maxAttempts:2}).ref(ROOT).transaction(v=>v),{status:409});
  assert.equal(conflicting.counts().writes,2);
  const denied=restFixture(null,{deny:true});
  await assert.rejects(createFirebaseRestDatabase(configured,{fetchImpl:denied.fetch}).ref(ROOT).get(),error=>error.status===503&&!error.message.includes('PRIVATE_DATABASE_ERROR'));
  assert.throws(()=>createFirebaseRestDatabase({...configured,FIREBASE_SERVICE_ACCOUNT:''}),{status:503});
});

test('Cloudflare database adapter retains existing school identity, rosters and revisions',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin-school-identity',name:'Admin'};
  const original=restFixture(),first=createService(createFirebaseRestDatabase(configured,{fetchImpl:original.fetch}));
  const boot=await first.bootstrap(admin),c=boot.classes['8C3'];
  c.students=[{id:'S1',name:'Existing student',code:''}];
  await first.putClass(admin,'8C3',{classData:c,revision:boot.revisions['8C3']});
  const migrated=restFixture(original.state()),second=createService(createFirebaseRestDatabase(configured,{fetchImpl:migrated.fetch}));
  const loaded=await second.bootstrap(admin);
  assert.equal(loaded.classes['8C3'].students[0].name,'Existing student');
  assert.equal(loaded.revisions['8C3'],1);
  assert.equal(migrated.counts().writes,0);
  await assert.rejects(second.putClass(admin,'8C3',{classData:c,revision:0}),{status:409});
  assert.equal(migrated.counts().writes,0);
  assert.equal(original.state().bootstrapAdminOid,migrated.state().bootstrapAdminOid);
});

test('Scoped saves merge only submitted months and preserve other classes, revisions and recovery',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));
  let boot=await api.bootstrap(admin),c=boot.classes['8C3'];
  c.months={'T10/2026':{notes:{summary:'October retained'}},'T11/2026':{notes:{summary:'November'}}};
  let saved=await api.putClass(admin,'8C3',{classData:c,revision:0});
  const other=JSON.stringify(fixture.state().classes['6A1']);fixture.trace.length=0;
  c={...saved.data,months:{'T11/2026':{...saved.data.months['T11/2026'],notes:{summary:'Changed November'}}}};
  saved=await api.putClass(admin,'8C3',{classData:c,revision:1,partialMonths:true});
  // A content-only save reads assignment/calendar once and class once with ETag.
  assert.equal(fixture.trace.filter(r=>r.method==='GET').length,3);
  assert.equal(fixture.trace.filter(r=>r.path==='classes/8C3'&&r.method==='GET').length,1);
  assert(!fixture.trace.some(r=>r.path==='classes/8C3/data'));
  assert.equal(saved.revision,2);assert.equal(saved.data.months['T10/2026'].notes.summary,'October retained');
  assert.equal(saved.data.months['T11/2026'].notes.summary,'Changed November');
  assert.equal(JSON.stringify(fixture.state().classes['6A1']),other);
  const local=fixture.state().classes['8C3'];
  assert.deepEqual(local.recovery['rev-1'].data.months,{});
  assert.equal(Object.keys(local.recovery['rev-1'].monthRefs).length,2);
  assert.equal(Object.keys(local.recoveryBlobs).length,2);
  assert(!fixture.trace.some(r=>r.path===''));
  assert(fixture.trace.filter(r=>r.method==='PUT').every(r=>r.path==='classes/8C3'));
  await assert.rejects(api.putClass(admin,'8C3',{classData:c,revision:1,partialMonths:true}),{status:409});
  const history=await api.recovery(admin,'8C3');assert(history.snapshots['rev-1']);assert(history.audit.some(r=>r.action==='save-class:8C3'));
  await api.backupDaily();const archived=await api.recovery(admin,'8C3');assert(archived.snapshots['rev-1']);
  assert(!fixture.state().classes['8C3'].recovery);
  const restored=await api.restore(admin,'8C3',{key:'rev-1',revision:2});
  assert.equal(restored.classes['8C3'].months['T11/2026'].notes.summary,'November');
});

test('Paged bootstrap never downloads private histories and change checks read only revisions',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));await api.bootstrap(admin);
  fixture.trace.length=0;const page=await api.bootstrap(admin,{paged:true});
  assert.equal(Object.keys(page.classes).length,8);assert.equal(page.remainingClassIds.length,24);
  assert(page.scopedSync);assert(fixture.trace.length<40);
  assert(!fixture.trace.some(r=>r.path===''||r.path==='classes'||r.path.startsWith('recovery')||r.path==='audit'));
  const next=await api.bootstrap(admin,{ids:page.remainingClassIds.slice(0,8)});assert.equal(Object.keys(next.classes).length,8);
  fixture.trace.length=0;const before=await api.changes(admin);assert(before.version);
  assert.equal(before.metadataVersion,page.metadataVersion);
  assert(!fixture.trace.some(r=>r.path.includes('/data')||r.path===''));
  assert(fixture.trace.length<45);assert.equal((await api.changes(admin)).version,before.version);
  let c=page.classes['6A1'];c.months={'T11/2026':{notes:{summary:'new'}}};await api.putClass(admin,'6A1',{classData:c,revision:0});
  assert.notEqual((await api.changes(admin)).version,before.version);
  assert.equal((await api.changes(admin)).metadataVersion,before.metadataVersion);
});

test('Scoped photo reads fetch one evidence item and no school/class archive',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const first=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));await first.bootstrap(admin);
  const state=fixture.state(),key='a'.repeat(64);state.evidence={[key]:{id:key,classId:'8C3',driveId:'drive',itemId:'item'}};
  const reads=restFixture(state),api=createService(createFirebaseRestDatabase(configured,{fetchImpl:reads.fetch}));
  assert.equal((await api.evidenceItem(admin,'8C3',key)).itemId,'item');
  assert.deepEqual(reads.trace.map(r=>r.path).sort(),['evidence/'+key,'classes/8C3/deletedEvidence/'+key,'classes/8C3/pendingEvidenceDeletes/'+key,'users/'+Buffer.from(admin.email).toString('base64url')].sort());
});

test('Paged reads reject data/revision pairs changed during loading',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  await createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch})).bootstrap(admin);
  let changed=false;
  const fetchImpl=async(url,options)=>{
    const response=await fixture.fetch(url,options);
    if(!changed&&url.endsWith('/classes/6A1/data.json')){
      changed=true;const revisionUrl=url.replace('/data.json','/revision.json');
      const current=await fixture.fetch(revisionUrl,{method:'GET',headers:options.headers});
      await fixture.fetch(revisionUrl,{method:'PUT',headers:{...options.headers,'If-Match':current.headers.get('etag')},body:'1'});
    }
    return response;
  };
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl}));
  await assert.rejects(api.bootstrap(admin,{paged:true}),{status:409});
});

test('Calendar-only reads stay below the Worker budget and require a bound account',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},fixture=restFixture();
  const first=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));await first.bootstrap(admin);
  await first.saveCalendar(admin,{excludedDates:['2026-12-01'],excludedSessions:[{date:'2026-12-02',session:'afternoon'}],revision:0});
  let requests=0;
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:async(...args)=>{
    if(++requests>50)throw Error('Worker subrequest limit');return fixture.fetch(...args);
  }}));
  fixture.trace.length=0;const result=await api.calendar(admin);
  assert.deepEqual(result.calendar.excludedDates,['2026-12-01']);assert.equal(result.calendar.excludedSessions[0].session,'afternoon');
  assert(fixture.trace.every(r=>r.path==='calendar'||r.path.startsWith('users/')));assert(requests<5);
  await assert.rejects(api.calendar({email:'unassigned@vietanhschool.edu.vn',oid:'other'}),{status:403});
  // Tái hiện luồng cũ để bảo vệ việc không quay lại dùng bootstrap toàn trường cho lịch nghỉ.
  requests=0;await assert.rejects(api.bootstrap(admin),{status:503});assert(requests>50);
});

test('Scoped transactions preserve teacher scope and locked report rules',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},teacher={email:'teacher@vietanhschool.edu.vn',oid:'teacher',name:'Teacher'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));
  await api.bootstrap(admin);await api.saveTeacher(admin,{email:teacher.email,name:'Teacher',classId:'8C3',active:true});
  let boot=await api.bootstrap(teacher),c=boot.classes['8C3'];c.months={'T11/2026':{notes:{summary:'Own class'}}};
  assert.deepEqual(Object.keys(boot.classes),['8C3']);
  fixture.trace.length=0;
  const teacherPage=await api.bootstrap(teacher,{paged:true});
  assert.deepEqual(Object.keys(teacherPage.classes),['8C3']);
  assert.deepEqual(teacherPage.remainingClassIds,[]);
  assert(!fixture.trace.some(r=>r.path.startsWith('classes/')&&!r.path.startsWith('classes/8C3/')));
  let result=await api.putClass(teacher,'8C3',{classData:c,revision:boot.revisions['8C3'],partialMonths:true});
  await assert.rejects(api.putClass(teacher,'8C4',{classData:c,revision:0}),{status:403});
  c=result.data;c.months['T11/2026'].approval.state='submitted';
  await assert.rejects(api.putClass(teacher,'8C3',{classData:c,revision:result.revision}),{status:403});
  await assert.rejects(api.bootstrap(teacher,{ids:['8C4']}),{status:403});
});

test('M04 review saves by class/month and management receives its state without student details',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},lead={email:'lead@vietanhschool.edu.vn',oid:'lead',name:'Lead'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));
  const boot=await api.bootstrap(admin),c=boot.classes['8C3'];
  c.students=[{id:'S1',name:'Student',code:''}];
  c.months={'T11/2026':{notes:{supportReview:'none'}},'T10/2026':{notes:{summary:'Keep October'}}};
  let saved=await api.putClass(admin,'8C3',{classData:c,revision:0});
  assert.equal(saved.data.months['T11/2026'].notes.supportReview,'none');
  assert.equal(saved.data.months['T10/2026'].notes.summary,'Keep October');
  await api.saveUserRoles(admin,{...lead,roles:['lead'],grades:['8'],active:true});
  const management=await api.bootstrap(lead);
  assert.equal(management.summaries['8C3']['T11/2026'].supportReview,'none');
  assert.equal(management.summaries['8C3']['T10/2026'].supportReview,'pending');
  assert.equal(management.checks['8C3']['T11/2026'].codes.K5,'KHÔNG PHÁT SINH');
  assert.deepEqual(management.classes['8C3'].students,[]);
  const invalid=structuredClone(saved.data);invalid.months['T11/2026'].notes.supportReview='anything';
  await assert.rejects(api.putClass(admin,'8C3',{classData:invalid,revision:saved.revision}),{status:400});
  invalid.months['T11/2026'].notes.supportReview='none';
  invalid.months['T11/2026'].plans=[{id:'P1',studentId:'S1',need:'Need',goal:'Goal',action:'Act',deadline:'2026-11-30',cooperation:'Teacher',assessment:'Review'}];
  await assert.rejects(api.putClass(admin,'8C3',{classData:invalid,revision:saved.revision}),{status:400});
  await assert.rejects(api.putClass(lead,'8C3',{classData:saved.data,revision:saved.revision}),{status:403});
});

test('Lead bootstrap and change checks read only assigned grades and return no student details',async()=>{
  const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin',name:'Admin'},
    lead={email:'lead@vietanhschool.edu.vn',oid:'lead',name:'Lead'},fixture=restFixture();
  const api=createService(createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch}));
  await api.bootstrap(admin);
  await api.saveUserRoles(admin,{...lead,roles:['lead'],grades:['8'],active:true});
  await api.bootstrap(lead);
  fixture.trace.length=0;
  const page=await api.bootstrap(lead,{paged:true});
  assert(Object.keys(page.classes).every(id=>id.startsWith('8')));
  assert(Object.values(page.classes).every(c=>c.students.length===0&&c.profiles.length===0));
  assert(!fixture.trace.some(r=>r.path.startsWith('classes/')&&!r.path.startsWith('classes/8')));
  fixture.trace.length=0;
  const changes=await api.changes(lead);
  assert(changes.metadataVersion);assert(Object.keys(changes.revisions).every(id=>id.startsWith('8')));
  assert(!fixture.trace.some(r=>r.path.includes('/data')));
  await assert.rejects(api.bootstrap(lead,{ids:['7B1']}),{status:403});
});

test('Hourly Worker maintenance retries a queued image within the Free subrequest budget',async()=>{
  const key='a'.repeat(64),fixture=restFixture({classes:{'8C3':{revision:1,data:{months:{}},pendingEvidenceDeletes:{[key]:{
    key,ref:{provider:'onedrive'},item:{driveId:'drive',itemId:'file'},month:'T11/2026',attempts:0,nextAttemptAt:0,
  }}}}}),worker=createWorker({createDatabase:()=>createFirebaseRestDatabase(configured,{fetchImpl:fixture.fetch})});
  const env={...configured,EVIDENCE_AUTH_MODE:'application',EVIDENCE_CLIENT_ID:'storage',EVIDENCE_CLIENT_SECRET:'test-secret',EVIDENCE_DRIVE_ID:'drive',EVIDENCE_ROOT_ID:'root'};
  const originalFetch=globalThis.fetch;let graphCalls=0,deletes=0;
  globalThis.fetch=async(url,options={})=>{
    url=String(url);graphCalls++;
    if(url.includes('/token'))return Response.json({access_token:'GRAPH',expires_in:3600});
    if(url.endsWith('/permanentDelete')){assert.equal(options.method,'POST');deletes++;return new Response(null,{status:204});}
    if(url.includes('/items/file?'))return Response.json({file:{mimeType:'image/jpeg'},name:'legacy.jpg',parentReference:{id:'month'}});
    if(url.includes('/items/month?'))return Response.json({name:'T11-2026',parentReference:{id:'class'}});
    if(url.includes('/items/class?'))return Response.json({name:'8C3',parentReference:{id:'year'}});
    if(url.includes('/items/year?'))return Response.json({name:'2026-2027',parentReference:{id:'root'}});
    throw Error('Unexpected maintenance request');
  };
  try{
    let pending;await worker.scheduled({cron:'15 * * * *',scheduledTime:2*3600000},env,{waitUntil:value=>pending=value});await pending;
  }finally{globalThis.fetch=originalFetch;}
  assert.equal(deletes,1);assert.equal(Object.keys(fixture.state().classes['8C3'].pendingEvidenceDeletes||{}).length,0);
  assert(fixture.state().classes['8C3'].deletedEvidence[key]);
  const counts=fixture.counts();assert(counts.reads+counts.writes+counts.tokens+graphCalls<50);
});
