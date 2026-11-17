import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../netlify/functions/gvcnApi.mjs';

const origin='https://gvcnva2.netlify.app';
const serviceAccount=JSON.stringify({
  type:'service_account',
  project_id:'gvcn-3bdf9',
  client_email:'test@gvcn-3bdf9.iam.gserviceaccount.com',
  private_key:'-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
});

function configure(t,overrides={}) {
  const values={MICROSOFT_TENANT_ID:'11111111-1111-1111-1111-111111111111',
    MICROSOFT_CLIENT_ID:'22222222-2222-2222-2222-222222222222',GVCN_ALLOWED_ORIGINS:origin,
    FIREBASE_SERVICE_ACCOUNT:serviceAccount,...overrides};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  for(const [key,value] of Object.entries(values))
    if(value===undefined) delete process.env[key];else process.env[key]=value;
  t.after(()=>{for(const [key,value] of Object.entries(old))
    if(value===undefined) delete process.env[key];else process.env[key]=value;});
}

function request(path,{method='GET',requestOrigin=origin,authorization}={}) {
  return new Request(`https://gvcnva2.netlify.app${path}`,{
    method,
    headers:{...(requestOrigin?{Origin:requestOrigin}:{}),...(authorization?{Authorization:authorization}:{})}
  });
}

test('Netlify API health checks service-account readiness without returning credentials',async t=>{
  configure(t);
  const response=await handler(request('/api/health'));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.configured,true);
  assert.equal(body.databaseConfigured,true);
  assert(!JSON.stringify(body).includes('test@gvcn-3bdf9'));
  assert(!JSON.stringify(body).includes('PRIVATE KEY'));
});

test('Netlify API health stays unavailable when the service account is missing',async t=>{
  configure(t,{FIREBASE_SERVICE_ACCOUNT:undefined});
  const response=await handler(request('/api/health'));
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.configured,false);
  assert.equal(body.databaseConfigured,false);
});

test('Netlify API preflight allows the configured origin and Authorization header',async t=>{
  configure(t);
  const response=await handler(request('/api/bootstrap',{method:'OPTIONS'}));
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert(response.headers.get('access-control-allow-headers').includes('Authorization'));
});

test('Netlify API denies an unconfigured origin',async t=>{
  configure(t);
  const response=await handler(request('/api/bootstrap',{method:'OPTIONS',requestOrigin:'https://untrusted.example'}));
  assert.equal(response.status,403);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('Netlify API still requires a Microsoft bearer token',async t=>{
  configure(t);
  const response=await handler(request('/api/bootstrap'));
  const body=await response.json();
  assert.equal(response.status,401);
  assert.match(body.error,/Microsoft/);
});
