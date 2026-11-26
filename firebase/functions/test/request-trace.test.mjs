import test from 'node:test';
import assert from 'node:assert/strict';
import {withRequestTrace,requestPhases,tracePhase} from '../request-trace.mjs';
import {createApiHandler} from '../api.mjs';
test('request phases stay isolated across concurrent requests',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const a=withRequestTrace('a',async()=>{await tracePhase('firebase',async()=>{await gate;});return {...requestPhases()};});
  const b=await withRequestTrace('b',async()=>{await tracePhase('supabase',async()=>{});return {...requestPhases()};});
  release();const result=await a;
  assert.deepEqual(Object.keys(result),['firebase']);assert.deepEqual(Object.keys(b),['supabase']);assert.deepEqual(requestPhases(),{});
});
test('API errors expose a safe request ID and timing without echoing request data',async()=>{
  const handler=createApiHandler({getDatabase:()=>{throw Error('unused');}});
  const result=await handler({method:'GET',path:'/bootstrap',requestId:'request-12345',body:{secret:'NEVER_ECHO'}});
  assert.equal(result.status,401);assert.equal(result.headers['X-Request-ID'],'request-12345');
  assert.equal(result.body.requestId,'request-12345');assert.match(result.headers['Server-Timing'],/auth;dur=/);
  assert(!JSON.stringify(result).includes('NEVER_ECHO'));
});
