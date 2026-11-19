import {createHash,randomBytes,webcrypto} from 'node:crypto';
import {decodeJwt} from 'jose';
import {requireValue} from './model.mjs';
import {createIdentityVerifier} from './identity.mjs';

export const STORAGE_CALLBACK='https://gvcnva2.lammt.workers.dev/api/evidence/oauth/callback';
const SCOPES='openid profile email offline_access https://graph.microsoft.com/Files.ReadWrite';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function delegatedStorageConfigured(env){return !!(env.EVIDENCE_CLIENT_ID&&env.EVIDENCE_CLIENT_SECRET&&env.MICROSOFT_TENANT_ID);}

/** Mã hóa refresh token/PKCE bằng AES-GCM. Đổi Client Secret sẽ cần kết nối lại kho ảnh. */
export function createStorageVault(env){
  let key;
  const getKey=async()=>key ||= await webcrypto.subtle.importKey('raw',createHash('sha256').update('gvcn-storage-vault-v1\0'+env.MICROSOFT_TENANT_ID+'\0'+env.EVIDENCE_CLIENT_ID+'\0'+env.EVIDENCE_CLIENT_SECRET).digest(),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return {
    async seal(value){
      const iv=randomBytes(12),cipher=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},await getKey(),new TextEncoder().encode(JSON.stringify(value)));
      return {version:1,iv:iv.toString('base64url'),cipher:Buffer.from(cipher).toString('base64url')};
    },
    async open(sealed){
      try{
        requireValue(sealed?.version===1&&typeof sealed.cipher==='string'&&sealed.cipher.length<50000,'Kết nối kho ảnh chưa hợp lệ.',503);
        return JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(sealed.iv,'base64url')},await getKey(),Buffer.from(sealed.cipher,'base64url'))));
      }catch{throw Object.assign(Error('Admin cần kết nối lại kho ảnh.'),{status:503});}
    }
  };
}

/** Chỉ chủ kho ảnh thực hiện OAuth một lần; GVCN không nhận token hoặc cấp consent lưu trữ. */
export function createEvidenceOAuth(env,service,{fetchImpl=fetch,clock=()=>Date.now(),verifyOwner}={}){
  const vault=createStorageVault(env),callback=env.EVIDENCE_REDIRECT_URI||STORAGE_CALLBACK;
  let verifier;
  const authorizeEndpoint='https://login.microsoftonline.com/'+encodeURIComponent(env.MICROSOFT_TENANT_ID)+'/oauth2/v2.0/authorize';
  const tokenEndpoint=authorizeEndpoint.replace(/authorize$/,'token');
  function configured(){requireValue(delegatedStorageConfigured(env),'Chưa cấu hình Client ID / Client Secret cho kho ảnh.',503);}
  async function graph(path,token,options={}){
    const response=await fetchImpl('https://graph.microsoft.com/v1.0'+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(45000)});
    requireValue(response.ok,'Không mở được thư mục kho ảnh. Kiểm tra quyền OneDrive của tài khoản.',response.status===404?404:response.status===409?409:503);return response.json();
  }
  return {
    vault,
    async status(identity){
      await service.storageAdmin(identity);const state=await service.storageState();let connected=false;
      if(delegatedStorageConfigured(env)&&state.sealed)try{const value=await vault.open(state.sealed);connected=!!(value.refreshToken&&value.driveId&&value.rootId);}catch{}
      return {mode:'delegated',configured:delegatedStorageConfigured(env),connected,ownerEmail:state.ownerEmail||'',connectedAt:state.connectedAt||'',callbackUrl:callback,
        canConnect:identity.email===(env.GVCN_ADMIN_EMAIL||'lammt@vietanhschool.edu.vn')};
    },
    async start(identity,returnUrl){
      await service.storageAdmin(identity,true);configured();
      let target;try{target=new URL(returnUrl);}catch{throw Object.assign(Error('Địa chỉ quay lại không hợp lệ.'),{status:400});}
      const origins=String(env.GVCN_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim());
      requireValue(target.protocol==='https:'&&!target.username&&!target.password&&origins.includes(target.origin)&&target.pathname.endsWith('/index.html'),'Địa chỉ quay lại chưa được cho phép.');
      target.search='';target.hash='';
      const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
      const current=await service.storageState();
      await service.createStorageFlow(identity,digest(state),await vault.seal({identity,returnUrl:target.href,nonce,verifier,bindingId:current.bindingId||''}),clock()+10*60000);
      const params=new URLSearchParams({client_id:env.EVIDENCE_CLIENT_ID,response_type:'code',response_mode:'query',redirect_uri:callback,scope:SCOPES,state,nonce,
        code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:identity.email,prompt:'select_account'});
      return {url:authorizeEndpoint+'?'+params};
    },
    async callback(query){
      configured();requireValue(typeof query.state==='string'&&/^[A-Za-z0-9_-]{43}$/.test(query.state),'Yêu cầu kết nối chưa hợp lệ.');
      const pending=await vault.open(await service.consumeStorageFlow(digest(query.state)));
      try{
        requireValue(!query.error&&typeof query.code==='string'&&query.code.length<20000,'Bạn chưa cấp quyền kết nối kho ảnh.',400);
        await service.storageAdmin(pending.identity,true);
        const response=await fetchImpl(tokenEndpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(45000),
          body:new URLSearchParams({client_id:env.EVIDENCE_CLIENT_ID,client_secret:env.EVIDENCE_CLIENT_SECRET,grant_type:'authorization_code',code:query.code,redirect_uri:callback,code_verifier:pending.verifier})});
        requireValue(response.ok,'Microsoft chưa cho phép kết nối kho ảnh.',503);
        const tokens=await response.json();requireValue(tokens.access_token&&tokens.refresh_token&&tokens.id_token,'Microsoft chưa cấp đủ phiên kho ảnh.',503);
        verifier ||= verifyOwner||createIdentityVerifier({tenantId:env.MICROSOFT_TENANT_ID,clientId:env.EVIDENCE_CLIENT_ID});
        const owner=await verifier(tokens.id_token);
        requireValue(owner.oid===pending.identity.oid&&owner.email===pending.identity.email&&decodeJwt(tokens.id_token).nonce===pending.nonce,'Hãy chọn đúng tài khoản chủ kho ảnh.',403);
        const drive=await graph('/me/drive',tokens.access_token);let folder;
        requireValue(drive.id,'Không tìm thấy OneDrive công vụ.',503);
        try{folder=await graph('/me/drive/root:/GVCN_MinhChung',tokens.access_token);}
        catch(error){if(error.status!==404)throw error;
          try{folder=await graph('/me/drive/root/children',tokens.access_token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'GVCN_MinhChung',folder:{},'@microsoft.graph.conflictBehavior':'fail'})});}
          catch(conflict){if(conflict.status!==409)throw conflict;folder=await graph('/me/drive/root:/GVCN_MinhChung',tokens.access_token);}
        }
        requireValue(folder.folder&&folder.id,'Tên GVCN_MinhChung đang được một tệp khác sử dụng.',409);
        await service.bindStorage(pending.identity,await vault.seal({refreshToken:tokens.refresh_token,driveId:drive.id,rootId:folder.id,ownerEmail:owner.email}),pending.bindingId);
        return {redirect:pending.returnUrl+'#evidence-connected'};
      }catch{return {redirect:pending.returnUrl+'#evidence-connect-error'};}
    },
    async load(){
      configured();const state=await service.storageState();requireValue(state.sealed&&state.bindingId,'Admin cần kết nối kho ảnh trước khi lưu minh chứng.',503);
      return {...await vault.open(state.sealed),bindingId:state.bindingId};
    },
    async save(connection){await service.refreshStorage(await vault.seal(connection),connection.bindingId);}
  };
}
