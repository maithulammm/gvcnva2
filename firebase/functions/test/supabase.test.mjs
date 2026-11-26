import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseConnection} from '../supabase.mjs';

const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_PRIVATE'};
test('Supabase readiness reads schema only, never student rows or writes, and never returns the key',async()=>{
  const requests=[];
  const connection=createSupabaseConnection(env,{fetchImpl:async(url,options)=>{
    requests.push(url);assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.body,undefined);
    return Response.json(url.includes('integration_status')?[{schema_version:1}]:[]);
  }});
  const result=await connection.status();assert.equal(result.connected,true);assert.equal(result.activeDataSource,'firebase');
  assert.equal(requests.length,4);assert(requests.slice(1,3).every(url=>url.endsWith('limit=0')));
  assert(!JSON.stringify(result).includes('PRIVATE'));
});
test('Supabase configuration and upstream errors fail closed without revealing secrets',async()=>{
  assert.throws(()=>createSupabaseConnection({...env,SUPABASE_URL:'https://attacker.example'}),{status:503});
  for(const status of [401,403,404,500]){
    const connection=createSupabaseConnection(env,{fetchImpl:async()=>Response.json({error:env.SUPABASE_SECRET_KEY},{status})});
    await assert.rejects(connection.status(),e=>e.status===503&&!e.message.includes('PRIVATE'));
  }
  const missing=createSupabaseConnection(env,{fetchImpl:async()=>Response.json([])});
  await assert.rejects(missing.status(),{status:503});
});
