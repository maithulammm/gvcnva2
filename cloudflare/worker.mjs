import {createApiHandler,MAX_BODY_BYTES} from '../firebase/functions/api.mjs';
import {serviceAccountConfigured} from '../firebase/functions/health.mjs';
import {createFirebaseRestDatabase} from './firebase-rest.mjs';
import {createService} from '../firebase/functions/service.mjs';
import {CLASSES} from '../firebase/functions/model.mjs';
import {createEvidenceStore,centralEvidenceConfigured} from '../firebase/functions/evidence-store.mjs';
import {createEvidenceOAuth} from '../firebase/functions/evidence-oauth.mjs';
import {createD1History} from './d1-history.mjs';
import {recordMetric,readMetrics} from './metrics.mjs';
import {createRevisionCache} from './revision-cache.mjs';
import {createSupabaseDatabase} from './supabase-database.mjs';
/**
 * Tách tài nguyên giao diện và /api; chuyển Request của Workers sang handler dùng chung, còn
 * scheduled chạy sao lưu định kỳ.
 */
export function createWorker({createDatabase=createFirebaseRestDatabase}={}) {
  const handlers=new WeakMap();
  const database=env=>env.GVCN_DATA_SOURCE==='supabase'?createSupabaseDatabase(env):createDatabase(env);
  return {async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      const historyStore=createD1History(env.GVCN_HISTORY);
      const service=createService(database(env),{historyStore});
      if(historyStore&&env.GVCN_D1_ARCHIVE_ENABLED==='true'){
        // Four classes/hour bounds the Firebase work; all 32 classes rotate in 8h.
        const start=(Math.floor((event.scheduledTime||Date.now())/3600000)%8)*4;
        for(const id of CLASSES.slice(start,start+4))await service.archiveClassHistory(id);
      }
      if(event.cron==='0 18 * * *'){
        if(env.GVCN_HISTORY)await env.GVCN_HISTORY.prepare('DELETE FROM gvcn_api_metrics WHERE bucket < ?')
          .bind(new Date(Date.now()-30*86400000).toISOString().slice(0,13)).run().catch(()=>console.error('GVCN_METRICS_RETENTION_FAILED'));
        if(!historyStore||env.GVCN_D1_ARCHIVE_ENABLED!=='true')await service.backupDaily();
        return;
      }
      if(!centralEvidenceConfigured(env))return;
      // Luân phiên 16 lớp mỗi giờ, xóa một tệp/lượt để giữ dưới hạn mức request con Free.
      const offset=(Math.floor((event.scheduledTime||Date.now())/3600000)%2)*16;
      const [id]=await service.pendingEvidenceClasses(CLASSES.slice(offset,offset+16));if(!id)return;
      const oauth=createEvidenceOAuth(env,service),store=createEvidenceStore(env,{loadConnection:()=>oauth.load(),saveConnection:value=>oauth.save(value)});
      await service.cleanupEvidence(null,id,(item,scope)=>store.remove(item,scope),{limit:1});
    })());
  },async fetch(request,env,ctx) {
    const started=Date.now();
    const path=new URL(request.url).pathname;
    if(path!=='/api'&&!path.startsWith('/api/')) {
      if(path==='/') {
        const url=new URL(request.url);url.pathname='/index.html';
        return env.ASSETS.fetch(new Request(url,request));
      }
      return env.ASSETS.fetch(request);
    }
    let handle=handlers.get(env);
    if(!handle) {
      handle=createApiHandler({env,getDatabase:()=>database(env),getMigrationSource:()=>createDatabase(env),getMigrationTarget:()=>createSupabaseDatabase(env,{requireVerified:false}),getHistoryStore:()=>createD1History(env.GVCN_HISTORY),getRevisionCache:()=>createRevisionCache(env.GVCN_HISTORY),getMetrics:()=>readMetrics(env.GVCN_HISTORY),databaseConfigured:()=>env.GVCN_DATA_SOURCE==='supabase'?!!(env.SUPABASE_URL&&env.SUPABASE_SECRET_KEY):serviceAccountConfigured(env)});
      handlers.set(env,handle);
    }
    let body={},bodyError,rawBodyLength=0;
    if(request.body) {
      const reader=request.body.getReader(),chunks=[];
      try {
        while(true) {
          const {done,value}=await reader.read();if(done)break;
          rawBodyLength+=value.byteLength;
          if(rawBodyLength>MAX_BODY_BYTES) {await reader.cancel();break;}
          chunks.push(value);
        }
        if(rawBodyLength>MAX_BODY_BYTES)bodyError=Object.assign(new Error('Dữ liệu gửi lên vượt giới hạn 5 MB.'),{status:413});
        else if(rawBodyLength) {
          const bytes=new Uint8Array(rawBodyLength);let offset=0;
          for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
          try{body=JSON.parse(new TextDecoder().decode(bytes))||{};}
          catch{bodyError=Object.assign(new Error('Nội dung JSON không hợp lệ.'),{status:400});}
        }
      } catch{bodyError=Object.assign(new Error('Không đọc được dữ liệu gửi lên.'),{status:400});}
      finally{reader.releaseLock();}
    }
    const result=await handle({method:request.method,path:path.slice(4)||'/',origin:request.headers.get('origin'),
      authorization:request.headers.get('authorization'),rawBodyLength,body,bodyError,query:Object.fromEntries(new URL(request.url).searchParams)});
    const headers=new Headers(result.headers);headers.set('Content-Type','application/json; charset=utf-8');
    const durationMs=Date.now()-started;
    headers.set('Server-Timing',`api;dur=${durationMs}`);
    if(ctx&&env.GVCN_HISTORY)ctx.waitUntil(recordMetric(env.GVCN_HISTORY,{path,method:request.method,status:result.status,durationMs})
      .catch(()=>console.error('GVCN_METRICS_WRITE_FAILED')));
    return new Response(result.status===204?null:JSON.stringify(result.body),{status:result.status,headers});
  }};
}

export default createWorker();
