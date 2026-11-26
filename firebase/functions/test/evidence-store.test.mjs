import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceStore,centralEvidenceConfigured} from '../evidence-store.mjs';
const env={EVIDENCE_AUTH_MODE:'application',MICROSOFT_TENANT_ID:'tenant',EVIDENCE_CLIENT_ID:'storage-app',EVIDENCE_CLIENT_SECRET:'server-only',EVIDENCE_DRIVE_ID:'drive',EVIDENCE_ROOT_ID:'root'};
const bytes=Buffer.from([255,216,255,217]);

test('meeting evidence adds a separate OneDrive folder and deletion validates that branch',async()=>{
  const calls=[],key='b'.repeat(64);
  const store=createEvidenceStore(env,{fetchImpl:async(url,options={})=>{
    url=String(url);calls.push(url);
    if(url.includes('oauth2'))return Response.json({access_token:'SERVER',expires_in:3600});
    if(options.method==='PUT')return Response.json({id:'photo',parentReference:{driveId:'drive'}});
    if(url.endsWith('/permanentDelete'))return new Response(null,{status:204});
    const folderNames={paper:['Gap-hoc-sinh','month'],month:['T11-2026','class'],class:['8C3','year'],year:['2026-2027','root']};
    if(url.includes('/items/photo?'))return Response.json({id:'photo',name:key+'.jpg',file:{mimeType:'image/jpeg'},parentReference:{id:'paper'}});
    for(const [id,[name,parent]]of Object.entries(folderNames))if(url.includes('/items/'+id+'?'))return Response.json({id,name,parentReference:{id:parent}});
    return Response.json({id:'child',folder:{}});
  }});
  const item=await store.upload({id:key,classId:'8C3',month:'T11/2026',recordType:'meetings',contentBase64:bytes.toString('base64')});
  assert(calls.some(url=>url.endsWith(':/Gap-hoc-sinh')));
  assert.equal(item.recordType,'meetings');
  await store.remove(item,{classId:'8C3',month:'T11/2026',key});
  assert.equal(calls.filter(url=>url.endsWith('/permanentDelete')).length,1);
});

function deletionStore(mode='ok'){
  const calls=[],key='a'.repeat(64);
  const store=createEvidenceStore(env,{fetchImpl:async(url,options={})=>{
    url=String(url);calls.push({url,method:options.method||'GET'});
    if(url.includes('oauth2'))return Response.json({access_token:'SERVER',expires_in:3600});
    assert.equal(options.headers.Authorization,'Bearer SERVER');
    if(url.endsWith('/permanentDelete'))return mode==='busy'?Response.json({}, {status:429,headers:{'retry-after':'120'}}):new Response(null,{status:204});
    if(url.includes('/items/file?')){
      if(mode==='missing')return Response.json({}, {status:404});
      return Response.json({id:'file',name:mode==='name'?'unrelated.jpg':key+'.jpg',...(mode==='folder'?{folder:{}}:{file:{mimeType:'image/jpeg'}}),parentReference:{id:'month'}});
    }
    if(url.includes('/items/month?'))return Response.json({id:'month',name:'T11-2026',parentReference:{id:'class'}});
    if(url.includes('/items/class?'))return Response.json({id:'class',name:mode==='class'?'8C4':'8C3',parentReference:{id:'year'}});
    if(url.includes('/items/year?'))return Response.json({id:'year',name:'2026-2027',parentReference:{id:'root'}});
    throw Error('Unexpected deletion request');
  }});
  return {store,calls,scope:{classId:'8C3',month:'T11/2026',key},item:{driveId:'drive',itemId:'file'}};
}

test('Photo deletion validates ancestry and permanently deletes one file with an empty 204 response',async()=>{
  const f=deletionStore();await f.store.remove(f.item,f.scope);
  assert.deepEqual(f.calls.filter(c=>c.url.endsWith('/permanentDelete')).map(c=>[c.method,c.url]),[['POST','https://graph.microsoft.com/v1.0/drives/drive/items/file/permanentDelete']]);
  const missing=deletionStore('missing');await missing.store.remove(missing.item,missing.scope);
  assert(!missing.calls.some(c=>c.url.endsWith('/permanentDelete')));
});

test('Photo deletion refuses folders, wrong names/classes/drives and preserves a currently used filename',async()=>{
  for(const mode of ['folder','name','class']){
    const f=deletionStore(mode);await assert.rejects(f.store.remove(f.item,f.scope),{status:403});
    assert(!f.calls.some(c=>c.url.endsWith('/permanentDelete')));
  }
  const f=deletionStore();await assert.rejects(f.store.remove({...f.item,driveId:'other'},f.scope),{status:403});
  assert.deepEqual(await f.store.remove(f.item,{...f.scope,legacy:true,protectedImageIds:[f.scope.key]}),{retained:true});
  assert(!f.calls.some(c=>c.url.endsWith('/permanentDelete')));
});

test('Permanent deletion reports throttling delay without retrying immediately',async()=>{
  const f=deletionStore('busy');
  await assert.rejects(f.store.remove(f.item,f.scope),error=>error.status===503&&error.retryAfter===120);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/permanentDelete')).length,1);
});
test('central store keeps credentials server-side, uploads below configured root and proxies image bytes',async()=>{
  const calls=[];let tokenCalls=0;
  const store=createEvidenceStore(env,{fetchImpl:async(url,options={})=>{
    url=String(url);calls.push({url,options});
    if(url.includes('oauth2')){tokenCalls++;assert(String(options.body).includes('client_credentials'));return Response.json({access_token:'SERVER-TOKEN',expires_in:3600});}
    if(url==='https://school.sharepoint.com/download'){
      assert.equal(options.redirect,'manual','Workers does not implement redirect:error');
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

test('image reader falls back to Graph content and follows trusted redirects without forwarding bearer tokens',async()=>{
  const visited=[];
  const store=createEvidenceStore(env,{fetchImpl:async(url,options={})=>{
    url=String(url);visited.push(url);
    if(url.includes('oauth2'))return Response.json({access_token:'GRAPH-ONLY',expires_in:3600});
    if(url.includes('$select='))return Response.json({file:{mimeType:'image/jpeg'},size:4});
    assert.equal(options.redirect,'manual');
    if(url.includes('/items/file/content')){
      assert.equal(options.headers.Authorization,'Bearer GRAPH-ONLY');
      return new Response(null,{status:302,headers:{location:'https://school.sharepoint.com/download'}});
    }
    assert(!options.headers?.Authorization);
    if(url==='https://school.sharepoint.com/download')return new Response(null,{status:307,headers:{location:'https://region.files.1drv.com/image'}});
    assert.equal(url,'https://region.files.1drv.com/image');return new Response(bytes);
  }});
  const result=await store.read({driveId:'drive',itemId:'file'});
  assert.equal(result.contentBase64,bytes.toString('base64'));assert(!JSON.stringify(result).includes('sharepoint'));
  assert(visited.some(url=>url.includes('/content')));
});

test('image reader blocks an untrusted redirect and reports download failures as image errors, not unhandled TypeError',async()=>{
  for(const failure of ['untrusted','network','loop']){
    const visited=[];
    const store=createEvidenceStore(env,{fetchImpl:async(url,options={})=>{
      url=String(url);visited.push(url);
      if(url.includes('oauth2'))return Response.json({access_token:'SERVER-TOKEN',expires_in:3600});
      if(url.includes('$select='))return Response.json({file:{mimeType:'image/jpeg'},size:4,'@microsoft.graph.downloadUrl':'https://school.sharepoint.com/download'});
      assert.equal(options.redirect,'manual');assert(!options.headers?.Authorization);
      if(failure==='network')throw new TypeError('Network detail with private signed URL');
      return new Response(null,{status:302,headers:{location:failure==='untrusted'?'https://attacker.invalid/steal?signed=private':'/loop'}});
    }});
    await assert.rejects(store.read({driveId:'drive',itemId:'file'}),error=>error.status===503&&!error.message.includes('private'));
    assert(!visited.some(url=>url.startsWith('https://attacker.invalid')));
    assert(visited.length<=7);
  }
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
