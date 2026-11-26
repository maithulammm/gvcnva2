import {createRemoteJWKSet,jwtVerify} from 'jose';
import {requireValue} from './model.mjs';
/**
 * Xác minh chữ ký RS256 bằng khóa công khai Microsoft, issuer/audience/hạn token rồi kiểm tra
 * tenant/miền trường. Không tin payload chỉ giải mã.
 */
export function createIdentityVerifier({tenantId,clientId,keySet}) {
  const tenant=String(tenantId||'').toLowerCase().trim(),audience=String(clientId||'').trim();
  const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  requireValue(guid.test(tenant)&&guid.test(audience),'Máy chủ chưa cấu hình Tenant ID / Client ID Microsoft.',503);
  const keys=keySet||createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`));
  return async token=>{
    let payload;
    try { ({payload}=await jwtVerify(token,keys,{issuer:`https://login.microsoftonline.com/${tenant}/v2.0`,audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','oid','tid'],clockTolerance:10})); }
    catch(error) {
      // Failure to fetch Microsoft's signing keys is an upstream outage, not an
      // expired teacher session. Never force logout or skip signature validation.
      const invalidToken=['ERR_JWT_EXPIRED','ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JWS_SIGNATURE_VERIFICATION_FAILED','ERR_JWS_INVALID','ERR_JWT_INVALID','ERR_JOSE_ALG_NOT_ALLOWED','ERR_JWKS_NO_MATCHING_KEY'].includes(error.code);
      requireValue(false,invalidToken?'Phiên Microsoft không hợp lệ hoặc đã hết hạn. Đăng nhập lại.':'Chưa xác minh được phiên Microsoft do kết nối tạm thời gián đoạn. Vui lòng thử lại.',invalidToken?401:503);
    }
    const email=String(payload.preferred_username||payload.email||'').toLowerCase().trim();
    requireValue(payload.tid===tenant && guid.test(payload.oid) && /^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(email),'Tài khoản không thuộc tenant/miền email của trường.',403);
    return {email,oid:payload.oid,name:String(payload.name||email)};
  };
}
