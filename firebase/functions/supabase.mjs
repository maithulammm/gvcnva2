import {requireValue} from './model.mjs';
import {tracePhase} from './request-trace.mjs';

/** Server-only REST connection. Never return headers, keys or upstream bodies. */
export function createSupabaseConnection(env,{fetchImpl=fetch}={}){
  let url;
  try{url=new URL(String(env.SUPABASE_URL||''));}catch{}
  requireValue(url&&url.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,
    'SUPABASE_URL chưa hợp lệ.',503);
  const key=String(env.SUPABASE_SECRET_KEY||'').trim();
  requireValue(key.startsWith('sb_secret_')||/^eyJ[A-Za-z0-9_.-]+$/.test(key),'Chưa cấu hình Secret key Supabase.',503);
  async function read(table,query){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await tracePhase('supabase',()=>fetchImpl(`${url.origin}/rest/v1/${table}?${query}`,{
        headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})},signal:controller.signal}));
      if(!response.ok){
        await response.body?.cancel();
        throw Object.assign(Error([401,403].includes(response.status)?'Supabase từ chối khóa hoặc quyền truy cập máy chủ.':'Không đọc được bảng Supabase. Kiểm tra migration và Data API.'),{status:503});
      }
      const data=await response.json();requireValue(Array.isArray(data),'Supabase trả dữ liệu chưa hợp lệ.',503);return data;
    }catch(error){if(error.status)throw error;throw Object.assign(Error('Kết nối Supabase tạm thời gián đoạn. Vui lòng thử lại.'),{status:503});}
    finally{clearTimeout(timeout);}
  }
  return {async rpc(name,body){
    requireValue(['gvcn_read','gvcn_cas'].includes(name),'RPC không hợp lệ.',500);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await tracePhase('supabase',()=>fetchImpl(`${url.origin}/rest/v1/rpc/${name}`,{method:'POST',signal:controller.signal,
        headers:{apikey:key,'Content-Type':'application/json',...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})},body:JSON.stringify(body)}));
      if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Supabase chưa sẵn sàng. Kiểm tra migration, quyền và Data API.'),{status:503});}
      return await response.json();
    }catch(error){if(error.status)throw error;throw Object.assign(Error('Kết nối Supabase gián đoạn; chưa xác nhận thao tác đã hoàn tất. Hãy kiểm tra lại dữ liệu.'),{status:503});}
    finally{clearTimeout(timeout);}
  },async status(){
    const rows=await read('gvcn_integration_status','component=eq.gvcn-staging&select=schema_version&limit=1');
    requireValue(rows[0]?.schema_version===1,'Chưa có migration Supabase phiên bản 1.',503);
    await read('gvcn_classes','select=school_year,class_id,revision,metadata,students,profiles&limit=0');
    await read('gvcn_class_months','select=school_year,class_id,month_key,revision,data&limit=0');
    const storage=await read('gvcn_integration_status','component=eq.gvcn-storage&select=schema_version&limit=1');
    return {connected:true,schemaVersion:1,storageReady:storage[0]?.schema_version===2,activeDataSource:env.GVCN_DATA_SOURCE==='supabase'?'supabase':'firebase',migrationEnabled:false};
  }};
}
