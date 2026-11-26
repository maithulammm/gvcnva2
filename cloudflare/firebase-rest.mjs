import {importPKCS8,SignJWT} from 'jose';
import {DATABASE_URL,ROOT,requireValue} from '../firebase/functions/model.mjs';
import {serviceAccountConfigured} from '../firebase/functions/health.mjs';
import {tracePhase} from '../firebase/functions/request-trace.mjs';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPES='https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

// The existing service keeps its authorization, revision checks and storage path.
// ETag conditional writes provide the transaction semantics used by that service.
/**
 * Adapter RTDB REST phía máy chủ. Service account chỉ nằm trong Secret; giao dịch dùng
 * ETag/If-Match để tránh ghi đè đồng thời.
 */
export function createFirebaseRestDatabase(env,{fetchImpl=fetch,clock=()=>Date.now(),maxAttempts=8}={}) {
  requireValue(serviceAccountConfigured(env),'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT cho Firebase.',503);
  const account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  let cached,refreshing,key;
  const snapshot=value=>({val:()=>structuredClone(value)});
  // Dùng chung Promise khi nhiều request cùng cần token; không gửi private_key ra trình duyệt.
  async function accessToken() {
    if(cached&&cached.until>clock()+60000)return cached.token;
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      const now=Math.floor(clock()/1000);
      key ||= await importPKCS8(account.private_key,'RS256');
      const assertion=await new SignJWT({scope:SCOPES})
        .setProtectedHeader({alg:'RS256',typ:'JWT'})
        .setIssuer(account.client_email).setAudience(TOKEN_URL)
        .setIssuedAt(now).setExpirationTime(now+3600).sign(key);
      const response=await tracePhase('google',()=>fetchImpl(TOKEN_URL,{method:'POST',signal:AbortSignal.timeout(15000),
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})}));
      requireValue(response.ok,'Không thể xác thực tài khoản dịch vụ Firebase. Kiểm tra Secret trên Cloudflare.',503);
      const data=await response.json();
      requireValue(typeof data.access_token==='string'&&data.access_token&&Number(data.expires_in)>60,'Google không cấp phiên kết nối Firebase hợp lệ.',503);
      cached={token:data.access_token,until:clock()+Math.min(Number(data.expires_in),3600)*1000};
      return cached.token;
    })();
    try{return await refreshing;}finally{refreshing=null;}
  }
  async function request(path,method,headers={},body,query='') {
    try {
      for(let attempt=0;attempt<2;attempt++){
        const token=await accessToken();
        const response=await tracePhase('firebase',()=>fetchImpl(`${DATABASE_URL}/${path}.json${query}`,{method,signal:AbortSignal.timeout(15000),
          headers:{Authorization:`Bearer ${token}`,...headers},
          ...(body!==undefined?{body:JSON.stringify(body)}:{})}));
        // Chỉ làm mới khi Firebase đã xác nhận từ chối xác thực, giữ nguyên ETag và nội dung gửi.
        if(response.status===401&&attempt===0){
          if(cached?.token===token)cached=null;
          await response.body?.cancel();continue;
        }
        requireValue(response.ok||response.status===412,'Không thể đọc/ghi Firebase. Kiểm tra quyền của tài khoản dịch vụ.',503);
        return response;
      }
    } catch(error) {
      if(error.status)throw error;
      throw Object.assign(new Error('Kết nối Firebase tạm thời gián đoạn. Dữ liệu chưa được xác nhận lưu; hãy thử đồng bộ lại.'),{status:503});
    }
  }
  return {scoped:true,ref(path) {
    requireValue(path===ROOT||path.startsWith(ROOT+'/')&&path.slice(ROOT.length+1).split('/').every(key=>/^[A-Za-z0-9_@%+-]+$/.test(key)),'Đường dẫn dữ liệu không hợp lệ.',500);
    return {
      async keys(){const response=await request(path,'GET',{},undefined,'?shallow=true');return Object.keys(await response.json()||{});},
      async get(){const response=await request(path,'GET');return snapshot(await response.json());},
      async transaction(update) {
        for(let attempt=0;attempt<maxAttempts;attempt++) {
          const current=await request(path,'GET',{'X-Firebase-ETag':'true'});
          const etag=current.headers.get('etag');
          requireValue(etag,'Firebase không trả mã phiên bản; không ghi dữ liệu để tránh ghi đè.',503);
          const value=await current.json(),next=update(structuredClone(value));
          if(next===undefined)return {committed:false,snapshot:snapshot(value)};
          const written=await request(path,'PUT',{'If-Match':etag,'Content-Type':'application/json'},next);
          // 412 nghĩa ETag đã đổi: đọc lại rồi chạy lại update, tuyệt đối không PUT mù.
          if(written.status===412) {await written.arrayBuffer();continue;}
          return {committed:true,snapshot:snapshot(await written.json())};
        }
        throw Object.assign(new Error('Dữ liệu đang được cập nhật trên máy khác. Vui lòng thử lại.'),{status:409});
      }
    };
  }};
}
