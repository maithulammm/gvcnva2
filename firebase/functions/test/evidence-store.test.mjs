import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceStore,centralEvidenceConfigured} from '../evidence-store.mjs';
const env={EVIDENCE_AUTH_MODE:'application',MICROSOFT_TENANT_ID:'tenant',EVIDENCE_CLIENT_ID:'storage-app',EVIDENCE_CLIENT_SECRET:'server-only',EVIDENCE_DRIVE_ID:'drive',EVIDENCE_ROOT_ID:'root'};
const bytes=Buffer.from([255,216,255,217]);
test('central store keeps credentials server-side, uploads below configured root and proxies image bytes',async()=>{
  const calls=[];let tokenCalls=0;
  const store=createEvidenceStore(env,{fetchImpl:async(url,options={})=>{
    url=String(url);calls.push({url,options});
    if(url.includes('oauth2')){tokenCalls++;assert(String(options.body).includes('client_credentials'));return Response.json({access_token:'SERVER-TOKEN',expires_in:3600});}
    if(url==='https://school.sharepoint.com/download'){
      assert(!options.headers?.Authorization,'Signed download must not receive Graph bearer');return new Response(bytes);
    }
    assert.equal(options.headers.Authorization,'Bearer SERVER-TOKEN');
    if(options.method==='PUT'){assert(url.includes('/items/child:/'+'a'.repeat(64)+'.jpg:/content'));return Response.json({id:'file',parentReference:{driveId:'drive'}});}
    if(url.includes('$select='))return Response.json({size:4,file:{mimeType:'image/jpeg'},'@microsoft.graph.downloadUrl':'https://school.sharepoint.com/download'});
    return Response.json({id:'child',folder:{}});
  }});
  const item=await store.upload({id:'a'.repeat(64),classId:'8C3',month:'T11/2026',contentBase64:bytes.toString('base64')});
  assert.equal(item.itemId,'file');const image=await store.read(item);
  assert.equal(image.contentBase64,bytes.toString('base64'));assert.equal(image.mimeType,'image/jpeg');
  assert(!JSON.stringify(image).includes('sharepoint'));assert(!JSON.stringify(item).includes('server-only'));assert.equal(tokenCalls,1);
  assert(calls.some(c=>c.url.includes('/items/root:/2026-2027')));
});
test('central store refuses absent configuration, oversized/non-image payload and legacy wrong-drive access',async()=>{
  assert.equal(!!centralEvidenceConfigured({}),false);assert.throws(()=>createEvidenceStore({}),{status:503});
  let calls=0;const store=createEvidenceStore(env,{fetchImpl:async()=>{calls++;throw Error('unexpected network');}});
  await assert.rejects(store.upload({id:'a',classId:'8C3',month:'T11/2026',contentBase64:Buffer.from('<html>').toString('base64')}),{status:400});
  await assert.rejects(store.upload({id:'a',classId:'8C3',month:'T11/2026',contentBase64:'a'.repeat(3*1024*1024)}),{status:400});
  await assert.rejects(store.read({driveId:'another-teacher-drive',itemId:'private'},{legacy:true,classId:'8C3',month:'T11/2026'}),{status:404});
  assert.equal(calls,0);
});
test('legacy image proxy requires matching month/class/year ancestry, not a client-supplied item ID alone',async()=>{
  let downloaded=false;
  const store=createEvidenceStore(env,{fetchImpl:async(url)=>{
    url=String(url);if(url.includes('oauth2'))return Response.json({access_token:'SERVER',expires_in:3600});
    if(url.includes('/items/file?'))return Response.json({parentReference:{id:'month'}});
    if(url.includes('/items/month?'))return Response.json({name:'T11-2026',parentReference:{id:'class'}});
    if(url.includes('/items/class?'))return Response.json({name:'8C4',parentReference:{id:'year'}});
    downloaded=true;throw Error('Should never download another class');
  }});
  await assert.rejects(store.read({driveId:'drive',itemId:'file'},{legacy:true,classId:'8C3',month:'T11/2026'}),{status:403});assert.equal(downloaded,false);
});
