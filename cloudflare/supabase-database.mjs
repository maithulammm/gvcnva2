import {ROOT,YEAR,requireValue} from '../firebase/functions/model.mjs';
import {createSupabaseConnection} from '../firebase/functions/supabase.mjs';

/** Existing authorization/validation service, SQL rows grouped by class/month.
 * Retry only explicit CAS conflicts, never an uncertain network write.
 */
export function createSupabaseDatabase(env,{connection=createSupabaseConnection(env),maxAttempts=8,requireVerified=true}={}){
  let verified=false;
  const snapshot=value=>({val:()=>structuredClone(value)});
  const read=async p=>{
    const result=await connection.rpc('gvcn_read',{y:YEAR,p});
    requireValue(result&&typeof result.version==='string'&&Object.hasOwn(result,'value'),'Supabase trả phiên bản không hợp lệ.',503);return result;
  };
  const ready=()=>{
    if(!requireVerified)return Promise.resolve();
    if(verified)return Promise.resolve();
    // Chỉ cache kết quả đã hoàn tất, không chia sẻ Promise fetch giữa request.
    return read(['_migration']).then(result=>{
      requireValue(result.value?.state==='verified','Chưa đối chiếu dữ liệu Supabase; không bật nguồn dữ liệu mới.',503);verified=true;
    });
  };
  return {scoped:true,ref(path){
    requireValue(path===ROOT||path.startsWith(ROOT+'/'),'Đường dẫn không hợp lệ.',500);
    const parts=path===ROOT?[]:path.slice(ROOT.length+1).split('/');
    requireValue(parts.every(key=>/^[A-Za-z0-9_@%+-]+$/.test(key)),'Đường dẫn không hợp lệ.',500);
    return {
      async get(){await ready();return snapshot((await read(parts)).value);},
      async transaction(update){
        await ready();
        for(let attempt=0;attempt<maxAttempts;attempt++){
          const current=await read(parts),next=update(structuredClone(current.value));
          if(next===undefined)return {committed:false,snapshot:snapshot(current.value)};
          const result=await connection.rpc('gvcn_cas',{y:YEAR,p:parts,expected:current.version,next_value:next});
          requireValue(typeof result?.committed==='boolean','Supabase chưa xác nhận giao dịch.',503);
          if(result.committed)return {committed:true,snapshot:snapshot(next)};
        }
        throw Object.assign(Error('Dữ liệu đang thay đổi trên máy khác. Vui lòng thử lại.'),{status:409});
      }
    };
  }};
}
