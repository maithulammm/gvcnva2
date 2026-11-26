import {importPKCS8,SignJWT} from 'jose';
import {DATABASE_URL,ROOT,requireValue} from '../firebase/functions/model.mjs';
import {serviceAccountConfigured} from '../firebase/functions/health.mjs';
import {tracePhase,requestScope} from '../firebase/functions/request-trace.mjs';

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
  const scopedRefreshes=new WeakMap();
  const snapshot=value=>({val:()=>structuredClone(value)});
  // Chỉ gộp công việc trong cùng request; không gửi private_key ra trình duyệt.
  async function accessToken() {
    if(cached&&cached.until>clock()+60000)return cached.token;
    // Reuse finished token data globally, but never await another HTTP request's
    // in-flight network work on Workers. Coalesce only within the same scope.
    const scope=requestScope(),pending=scope?scopedRefreshes.get(scope):refreshing;
    if(pending)return pending;
    const job=(async()=>{
      const now=Math.floor(clock()/1000);
      key ||= await importPKCS8(account.private_key,'RS256');
      const assertion=await new SignJWT({scope:SCOPES})
        .setProtectedHeader({alg:'RS256',typ:'JWT'})
        .setIssuer(account.client_email).setAudience(TOKEN_URL)
        .setIssuedAt(now).setExpirationTime(now+3600).sign(key);
      // Cấp token không ghi dữ liệu nghiệp vụ: có thể thử lại một lần khi mạng
      // gián đoạn. Hai lượt 6 giây có tổng hạn chờ thấp hơn lượt 15 giây cũ.
      let data;
      for(let attempt=0;attempt<2;attempt++){
        try{
          data=await tracePhase('google',async()=>{
            const response=await fetchImpl(TOKEN_URL,{method:'POST',signal:AbortSignal.timeout(6000),
              headers:{'Content-Type':'application/x-www-form-urlencoded'},
              body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
            if(!response.ok){
              await response.body?.cancel();
              throw Object.assign(new Error('Không thể xác thực tài khoản dịch vụ Firebase. Kiểm tra Secret trên Cloudflare.'),{status:503,retryable:response.status>=500,upstream:'google',upstreamStatus:response.status});
            }
            return response.json();
          });
          break;
        }catch(error){
          const transient=error.retryable||['AbortError','TimeoutError','TypeError'].includes(error.name);
          if(attempt===0&&transient)continue;
          if(error.status)throw error;
          throw Object.assign(new Error('Chưa lấy được token kết nối Firebase từ Google do gián đoạn mạng. Vui lòng thử lại; không cần đăng nhập lại Microsoft.'),{status:503,upstream:'google',kind:error.name});
        }
      }
      requireValue(typeof data.access_token==='string'&&data.access_token&&Number(data.expires_in)>60,'Google không cấp phiên kết nối Firebase hợp lệ.',503);
      cached={token:data.access_token,until:clock()+Math.min(Number(data.expires_in),3600)*1000};
      return cached.token;
    })();
    if(scope)scopedRefreshes.set(scope,job);else refreshing=job;
    try{return await job;}
    catch(error){
      // Làm mới sớm thất bại không làm mất token cũ còn hiệu lực. Chỉ dùng
      // trong hạn thật (chừa 5 giây); token đã bị Firebase từ chối bị xóa bên dưới.
      if(cached&&cached.until>clock()+5000)return cached.token;
      throw error;
    }
    finally{if(scope)scopedRefreshes.delete(scope);else if(refreshing===job)refreshing=null;}
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
      const kind=String(error.message||'').includes('different request')?'cross_request_io':
        ['AbortError','TimeoutError'].includes(error.name)?'timeout':error.name==='TypeError'?'network':'upstream';
      console.warn('GVCN_FIREBASE_FAILURE',JSON.stringify({requestId:requestScope()?.id,kind:error.kind||kind,upstream:error.upstream||'firebase',upstreamStatus:error.upstreamStatus,method,status:error.status||503}));
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
