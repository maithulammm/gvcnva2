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

function restFixture(initial=null,{conflicts=0,missingETag=false,deny=false}={}) {
  let state=structuredClone(initial),revision=0,tokens=0,writes=0,reads=0;
  const assertions=[];
  return {state:()=>structuredClone(state),counts:()=>({tokens,writes,reads}),assertions,
    async fetch(url,options={}) {
      if(url==='https://oauth2.googleapis.com/token') {
        tokens++;
        const assertion=new URLSearchParams(options.body).get('assertion');
        const {payload}=await jwtVerify(assertion,pair.publicKey,{issuer:credentials.client_email,audience:url});
        assert.match(payload.scope,/firebase\.database/);assert.match(payload.scope,/userinfo\.email/);
        assertions.push(payload);
        return Response.json({access_token:'GOOGLE_SERVER_TOKEN',expires_in:3600});
      }
      assert.equal(url,`${DATABASE_URL}/${ROOT}.json`);
      assert.equal(options.headers.Authorization,'Bearer GOOGLE_SERVER_TOKEN');
      if(deny)return Response.json({error:'PRIVATE_DATABASE_ERROR'},{status:403});
      if(options.method==='GET') {
        reads++;
        return Response.json(state,{headers:missingETag?{}:{ETag:`"${revision}"`}});
      }
      assert.equal(options.method,'PUT');writes++;
      if(conflicts-->0) {
        state={...state,external:'retained'};revision++;
        return Response.json(state,{status:412,headers:{ETag:`"${revision}"`}});
      }
      if(options.headers['If-Match']!==`"${revision}"`)return Response.json(state,{status:412});
      state=JSON.parse(options.body);revision++;
      return Response.json(state);
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
