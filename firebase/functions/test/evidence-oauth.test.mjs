import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {createEvidenceOAuth,createStorageVault,STORAGE_CALLBACK} from '../evidence-oauth.mjs';
import {createIdentityVerifier} from '../identity.mjs';
import {createEvidenceStore} from '../evidence-store.mjs';
import {createService} from '../service.mjs';
import {memoryDatabase} from './helpers.mjs';
import {createWorker} from '../../../cloudflare/worker.mjs';

const owner={email:'lammt@vietanhschool.edu.vn',oid:'33333333-3333-4333-8333-333333333333',name:'Owner'};
const env={MICROSOFT_TENANT_ID:'22215a7f-b9e3-4b53-bd27-3a317311e6ca',EVIDENCE_CLIENT_ID:'32d07852-5a8b-48c1-a8b4-a1141bd13725',
  EVIDENCE_CLIENT_SECRET:'TEST-SERVER-SECRET',GVCN_ALLOWED_ORIGINS:'https://maithulammm.github.io,https://gvcnva2.lammt.workers.dev',GVCN_ADMIN_EMAIL:owner.email};
async function fixture(){
  let now=Date.now(),pending,nonceMode='correct',identity=owner;const db=memoryDatabase(),service=createService(db,{clock:()=>new Date(now)});await service.bootstrap(owner);
  const {privateKey,publicKey}=await generateKeyPair('RS256');const calls=[];
  const oauth=createEvidenceOAuth(env,service,{clock:()=>now,verifyOwner:createIdentityVerifier({tenantId:env.MICROSOFT_TENANT_ID,clientId:env.EVIDENCE_CLIENT_ID,keySet:publicKey}),
    fetchImpl:async(url,options={})=>{
      calls.push(String(url));
      if(String(url).includes('/token')){
        const params=new URLSearchParams(options.body);assert.equal(params.get('grant_type'),'authorization_code');assert.equal(params.get('redirect_uri'),STORAGE_CALLBACK);
        assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),pending.searchParams.get('code_challenge'));
        // Flow is already consumed; keep the decrypted nonce captured before callback.
        const idToken=await new SignJWT({oid:identity.oid,tid:env.MICROSOFT_TENANT_ID,preferred_username:identity.email,nonce:nonceMode==='correct'?pending.nonce:'wrong'})
          .setProtectedHeader({alg:'RS256'}).setIssuer('https://login.microsoftonline.com/'+env.MICROSOFT_TENANT_ID+'/v2.0').setAudience(env.EVIDENCE_CLIENT_ID).setSubject(identity.oid).setIssuedAt().setExpirationTime('5m').sign(privateKey);
        return Response.json({access_token:'ACCESS-SERVER-ONLY',refresh_token:'REFRESH-SERVER-ONLY',id_token:idToken,expires_in:3600});
      }
      assert.equal(options.headers.Authorization,'Bearer ACCESS-SERVER-ONLY');
      if(String(url).endsWith('/me/drive'))return Response.json({id:'drive'});
      return Response.json({id:'root',folder:{}});
    }});
  async function start(){
    pending=new URL((await oauth.start(owner,'https://maithulammm.github.io/gvcnva2/index.html')).url);
    const flow=Object.values((await service.storageState()).flows)[0];pending.nonce=(await oauth.vault.open(flow.sealed)).nonce;return pending.searchParams.get('state');
  }
  return {db,service,oauth,calls,start,setIdentity:value=>identity=value,wrongNonce:()=>nonceMode='wrong',advance:ms=>now+=ms};
}

test('owner delegated OAuth validates signed identity, nonce and PKCE, encrypts refresh token and consumes state once',async()=>{
  const f=await fixture(),state=await f.start();
  assert.equal((await f.oauth.status(owner)).connected,false);
  const result=await f.oauth.callback({state,code:'ONE-TIME-CODE'});assert(result.redirect.endsWith('#evidence-connected'));
  assert.equal((await f.oauth.status(owner)).connected,true);
  assert.equal((await f.oauth.load()).refreshToken,'REFRESH-SERVER-ONLY');
  const raw=JSON.stringify(f.db.state());assert(!raw.includes('REFRESH-SERVER-ONLY'));assert(!raw.includes('ACCESS-SERVER-ONLY'));
  assert(!JSON.stringify(await f.service.bootstrap(owner)).includes('sealed'),'Bootstrap never returns vault state');
  await assert.rejects(f.oauth.callback({state,code:'REPLAY'}),{status:400});
  const rotated=createStorageVault({...env,EVIDENCE_CLIENT_SECRET:'DIFFERENT'});await assert.rejects(rotated.open((await f.service.storageState()).sealed),{status:503});
});

test('delegated OAuth denies teachers, unapproved return origins, expired state, wrong account and wrong nonce',async()=>{
  const f=await fixture(),teacher={email:'teacher@vietanhschool.edu.vn',oid:'44444444-4444-4444-8444-444444444444',name:'Teacher'};
  await f.service.saveTeacher(owner,{name:teacher.name,email:teacher.email,classId:'8C3',active:true});await f.service.bootstrap(teacher);
  await assert.rejects(f.oauth.start(teacher,'https://maithulammm.github.io/gvcnva2/index.html'),{status:403});
  await assert.rejects(f.oauth.status(teacher),{status:403});
  await assert.rejects(f.oauth.start(owner,'https://attacker.invalid/index.html'),{status:400});
  let state=await f.start();f.advance(11*60000);await assert.rejects(f.oauth.callback({state,code:'EXPIRED'}),{status:400});assert.equal(f.calls.length,0);
  state=await f.start();f.setIdentity(teacher);assert((await f.oauth.callback({state,code:'WRONG-USER'})).redirect.endsWith('#evidence-connect-error'));assert.equal((await f.oauth.status(owner)).connected,false);
  state=await f.start();f.setIdentity(owner);f.wrongNonce();assert((await f.oauth.callback({state,code:'WRONG-NONCE'})).redirect.endsWith('#evidence-connect-error'));
});

test('delegated refresh rotates encrypted credentials and keeps image requests on the server',async()=>{
  const f=await fixture(),state=await f.start();await f.oauth.callback({state,code:'OK'});let refreshCalls=0;
  const store=createEvidenceStore(env,{loadConnection:()=>f.oauth.load(),saveConnection:c=>f.oauth.save(c),fetchImpl:async(url,options={})=>{
    if(String(url).includes('/token')){refreshCalls++;const params=new URLSearchParams(options.body);assert.equal(params.get('grant_type'),'refresh_token');assert.equal(params.get('refresh_token'),'REFRESH-SERVER-ONLY');return Response.json({access_token:'FRESH-ACCESS',refresh_token:'ROTATED-REFRESH',expires_in:3600});}
    assert.equal(options.headers.Authorization,'Bearer FRESH-ACCESS');
    return Response.json(options.method==='PUT'?{id:'image',parentReference:{driveId:'drive'}}:{id:'folder',folder:{}});
  }});
  await store.upload({id:'a'.repeat(64),classId:'8C3',month:'T11/2026',contentBase64:Buffer.from([255,216,255,217]).toString('base64')});
  assert.equal(refreshCalls,1);assert.equal((await f.oauth.load()).refreshToken,'ROTATED-REFRESH');assert(!JSON.stringify(f.db.state()).includes('ROTATED-REFRESH'));
  const previous=await f.oauth.load();await f.service.bindStorage(owner,await f.oauth.vault.seal(previous),previous.bindingId);
  await assert.rejects(f.oauth.save(previous),{status:409},'An old refresh cannot overwrite a newly connected vault');
});

test('Worker passes OAuth callback query without requiring the normal API bearer token',async()=>{
  const db=memoryDatabase(),worker=createWorker({createDatabase:()=>db});
  const response=await worker.fetch(new Request(STORAGE_CALLBACK+'?state='+'a'.repeat(43)+'&error=access_denied'),env);
  assert.equal(response.status,400);const result=await response.json();assert(result.error.includes('hết hạn'));
});
