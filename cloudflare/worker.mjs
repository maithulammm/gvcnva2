import {createApiHandler,MAX_BODY_BYTES} from '../firebase/functions/api.mjs';
import {serviceAccountConfigured} from '../firebase/functions/health.mjs';
import {createFirebaseRestDatabase} from './firebase-rest.mjs';
import {createService} from '../firebase/functions/service.mjs';
/**
 * Tách tài nguyên giao diện và /api; chuyển Request của Workers sang handler dùng chung, còn
 * scheduled chạy sao lưu định kỳ.
 */
export function createWorker({createDatabase=createFirebaseRestDatabase}={}) {
  const handlers=new WeakMap();
  return {async scheduled(event,env,ctx) {ctx.waitUntil(createService(createDatabase(env)).backupDaily());},async fetch(request,env) {
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
      handle=createApiHandler({env,getDatabase:()=>createDatabase(env),databaseConfigured:()=>serviceAccountConfigured(env)});
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
      authorization:request.headers.get('authorization'),rawBodyLength,body,bodyError});
    const headers=new Headers(result.headers);headers.set('Content-Type','application/json; charset=utf-8');
    return new Response(result.status===204?null:JSON.stringify(result.body),{status:result.status,headers});
  }};
}

export default createWorker();
