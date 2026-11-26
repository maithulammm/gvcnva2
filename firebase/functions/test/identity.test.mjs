import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {createIdentityVerifier} from '../identity.mjs';
const tenantId='11111111-1111-1111-1111-111111111111',clientId='22222222-2222-2222-2222-222222222222';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const verify=createIdentityVerifier({tenantId,clientId,keySet:publicKey});
async function token(overrides={},key=privateKey) {
  return new SignJWT({tid:tenantId,oid:'33333333-3333-3333-3333-333333333333',preferred_username:'lammt@vietanhschool.edu.vn',
    iss:`https://login.microsoftonline.com/${tenantId}/v2.0`,aud:clientId,sub:'subject',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...overrides})
    .setProtectedHeader({alg:'RS256'}).sign(key);
}
test('valid signed Microsoft identity is accepted and bound to oid',async()=>{
  const identity=await verify(await token());assert.equal(identity.email,'lammt@vietanhschool.edu.vn');assert.equal(identity.oid,'33333333-3333-3333-3333-333333333333');
});

test('signing-key network failures do not incorrectly expire teacher sessions',async()=>{
  for(const error of [new TypeError('fetch failed'),Object.assign(new Error('timeout'),{code:'ERR_JWKS_TIMEOUT'})]){
    const unavailable=createIdentityVerifier({tenantId,clientId,keySet:async()=>{throw error;}});
    await assert.rejects(unavailable(await token()),e=>e.status===503);
  }
});
test('invalid signature, wrong audience/issuer, expired token and missing oid are rejected',async()=>{
  const other=await generateKeyPair('RS256');
  for(const signed of [await token({},other.privateKey),await token({aud:'another-app'}),await token({iss:'https://example.com'}),await token({exp:1}),await token({oid:undefined})])
    await assert.rejects(verify(signed),e=>e.status===401);
});
test('signed token for a different tenant or external domain is denied',async()=>{
  for(const signed of [await token({tid:'44444444-4444-4444-4444-444444444444'}),await token({preferred_username:'attacker@example.com'})])
    await assert.rejects(verify(signed),e=>e.status===403);
});
