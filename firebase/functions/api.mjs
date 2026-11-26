import {createIdentityVerifier} from './identity.mjs';
import {createService} from './service.mjs';
import {deploymentStatus} from './health.mjs';
import {DATABASE_URL,requireValue} from './model.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {createEvidenceStore} from './evidence-store.mjs';
import {createEvidenceOAuth} from './evidence-oauth.mjs';
import {createSupabaseConnection} from './supabase.mjs';
import {stageSupabaseStep} from './supabase-migration.mjs';
import {withRequestTrace,requestPhases} from './request-trace.mjs';

const MAX_BODY_BYTES=5*1024*1024;
/**
 * Handler API dùng chung cho các nền tảng: kiểm tra origin, token, kích thước JSON rồi mới gọi
 * service nghiệp vụ; CORS không thay thế xác thực.
 */
export function createApiHandler({getDatabase,getMigrationSource,getMigrationTarget,getHistoryStore=()=>null,getRevisionCache=()=>null,getMetrics=async()=>({enabled:false,rows:[]}),maintenance=null,identityVerifier=null,databaseConfigured=()=>true,env=process.env}) {
  let service;
  let verifyIdentity=identityVerifier;
  let evidenceStore;
  let evidenceOAuth;
  const getService=()=>service ||= createService(getDatabase(),{adminEmail:(env.GVCN_ADMIN_EMAIL||'lammt@vietanhschool.edu.vn').toLowerCase().trim(),historyStore:getHistoryStore(),revisionCache:getRevisionCache()});
  const oauth=()=>evidenceOAuth ||= createEvidenceOAuth(env,getService());
  const storage=()=>evidenceStore ||= createEvidenceStore(env,{loadConnection:()=>oauth().load(),saveConnection:connection=>oauth().save(connection)});
  return async function handle({method,path,origin,authorization,rawBodyLength=0,body={},bodyError,query={},requestId}) {
    requestId=/^[A-Za-z0-9-]{8,80}$/.test(requestId||'')?requestId:randomUUID();
    return withRequestTrace(requestId,async()=>{
    const started=Date.now();let authMs=0,operationStarted=started;
    const headers={'Cache-Control':'no-store',Vary:'Origin','X-Content-Type-Options':'nosniff'};
    const respond=(status,result)=>{
      headers['X-Request-ID']=requestId;
      const phases=requestPhases();
      headers['Server-Timing']=`auth;dur=${authMs}, operation;dur=${Date.now()-operationStarted}`+Object.entries(phases).map(([name,ms])=>`, ${name};dur=${ms}`).join('');
      if(status>=400||Date.now()-started>=10000)console.info('GVCN_REQUEST',JSON.stringify({requestId,method,status,authMs,phases,totalMs:Date.now()-started}));
      return {status,headers,body:status>=400?{...result,requestId}:result};
    };
    try {
      const origins=String(env.GVCN_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
      requireValue(!origin || origins.includes(origin),'Địa chỉ website chưa được khai báo trong GVCN_ALLOWED_ORIGINS.',403);
      if(origin) headers['Access-Control-Allow-Origin']=origin;
      headers['Access-Control-Allow-Methods']='GET,POST,PUT,DELETE,OPTIONS';
      headers['Access-Control-Allow-Headers']='Authorization,Content-Type,X-Request-ID';
      headers['Access-Control-Expose-Headers']='X-Request-ID,Server-Timing';
      if(method==='OPTIONS') return respond(204,null);
      const route=String(path||'/').replace(/\/$/,'')||'/';
      if(method==='GET'&&route==='/maintenance')return respond(200,maintenance?await maintenance.read():{enabled:false,message:'',revision:0});
      if(method==='GET'&&route==='/health') {
        const health=deploymentStatus(env,{databaseConfigured:databaseConfigured()});
        return respond(health.configured?200:503,{...health,meetingPaperEvidence:true,novemberMeetingBackfill:true,
          d1HistoryBound:!!env.GVCN_HISTORY,d1HistoryArchiving:!!env.GVCN_HISTORY&&env.GVCN_D1_ARCHIVE_ENABLED==='true'});
      }
      if(method==='GET'&&route==='/evidence/oauth/callback'){
        const result=await oauth().callback(query);
        evidenceStore=null;
        headers.Location=result.redirect;headers['Referrer-Policy']='no-referrer';
        return respond(303,null);
      }
      if(bodyError) throw bodyError;
      const token=/^Bearer ([^\s]+)$/.exec(authorization||'')?.[1];
      requireValue(token&&token.length<20000,'Thiếu phiên đăng nhập Microsoft.',401);
      verifyIdentity ||= createIdentityVerifier({tenantId:env.MICROSOFT_TENANT_ID,clientId:env.MICROSOFT_CLIENT_ID});
      const authStarted=Date.now();let identity;
      try{identity=await verifyIdentity(token);}finally{authMs=Date.now()-authStarted;operationStarted=Date.now();}
      requireValue(rawBodyLength<=MAX_BODY_BYTES,'Dữ liệu gửi lên vượt giới hạn 5 MB.',413);
      getService();
      if(maintenance){
        const state=await maintenance.read();
        if(state.enabled&&!await service.maintenanceAdmin(identity))
          return respond(503,{error:state.message,code:'MAINTENANCE',maintenance:state});
      }
      let result;
      if(method==='PUT'&&route==='/maintenance'){
        await service.integrationAdmin(identity);requireValue(maintenance,'Chưa cấu hình bảo trì.',503);
        result=await maintenance.write(body);
      }
      else if(method==='GET'&&route==='/metrics'){
        await service.integrationAdmin(identity);result=await getMetrics();
      }
      else if(method==='POST'&&route==='/supabase/stage'){
        await service.integrationAdmin(identity);
        requireValue(env.GVCN_DATA_SOURCE!=='supabase'&&getMigrationSource&&getMigrationTarget,'Không cho chuyển thử khi Supabase đã là nguồn chính.',409);
        result=await stageSupabaseStep(getMigrationSource(),getMigrationTarget(),body);
      }
      else if(method==='GET'&&route==='/supabase/status'){
        await service.integrationAdmin(identity);
        result=await createSupabaseConnection(env).status();
      }
      else if(method==='GET'&&route==='/evidence/admin/status')result=await oauth().status(identity);
      else if(method==='POST'&&route==='/evidence/admin/connect')result=await oauth().start(identity,body.returnUrl);
      else if(method==='POST'&&/^\/evidence\/[A-Za-z0-9]+\/upload$/.test(route)){
        const id=route.split('/')[2];
        const recordType=body.recordType||'connections';
        requireValue(['meetings','connections'].includes(recordType),'Loại minh chứng không hợp lệ.');
        requireValue(typeof body.uploadId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(body.uploadId),'Mã ảnh không hợp lệ.');
        await service.evidenceScope(identity,id,body.month,body.studentId);
        const key=createHash('sha256').update([id,body.month,body.studentId,body.uploadId,...(recordType==='meetings'?['meetings']:[])].join('|')).digest('hex');
        const item=await storage().upload({id:key,classId:id,month:body.month,recordType,contentBase64:body.contentBase64});
        result=await service.registerEvidence(identity,id,body,item);
      }
      else if(method==='GET'&&/^\/evidence\/[A-Za-z0-9]+\/[a-f0-9]{64}$/.test(route)){
        const [, ,id,key]=route.split('/'),item=await service.evidenceItem(identity,id,key);
        result=await storage().read(item);
      }
      else if(method==='GET'&&/^\/evidence\/[A-Za-z0-9]+\/legacy\/T\d{2}-\d{4}\/[A-Za-z0-9_-]+\/[a-f0-9]{64}$/.test(route)){
        const [, ,id,,monthKey,recordId,key]=route.split('/'),month=monthKey.replace('-','/');
        const item=await service.legacyEvidence(identity,id,month,recordId,key);
        result=await storage().read(item,{legacy:true,classId:id,month});
      }
      else if(method==='GET'&&route==='/changes') result=await service.changes(identity);
      else if(method==='GET'&&route==='/bootstrap/classes'){
        const ids=String(query.ids||'').split(',');
        requireValue(ids.length<=8,'Mỗi lần tải tối đa 8 lớp.');
        result=await service.bootstrap(identity,{ids});
      }
      else if(method==='GET'&&route==='/bootstrap') result=await service.bootstrap(identity,{paged:query.paged==='1'});
      else if(method==='GET'&&/^\/recovery\/[A-Za-z0-9]+$/.test(route)) result=await service.recovery(identity,route.split('/')[2]);
      else if(method==='POST'&&/^\/recovery\/[A-Za-z0-9]+$/.test(route)) result=await service.restore(identity,route.split('/')[2],body);
      else if(method==='GET'&&route==='/calendar') result=await service.calendar(identity);
      else if(method==='PUT'&&route==='/calendar') result=await service.saveCalendar(identity,body);
      else if(method==='POST'&&route==='/teachers') result=await service.saveTeacher(identity,body);
      else if(method==='DELETE'&&/^\/teachers\/[A-Za-z0-9_-]+$/.test(route)) result=await service.deleteTeacher(identity,route.split('/')[2]);
      else if(method==='POST'&&route==='/users') result=await service.saveUserRoles(identity,body);
      else if(method==='POST'&&route==='/directory/import') result=await service.importDirectory(identity,body);
      else if(method==='POST'&&/^\/classes\/[A-Za-z0-9]+\/evidence\/cleanup$/.test(route))
        result=await service.cleanupEvidence(identity,route.split('/')[2],(item,scope)=>storage().remove(item,scope));
      else if(method==='PUT'&&/^\/classes\/[A-Za-z0-9]+$/.test(route)) result=await service.putClass(identity,route.split('/')[2],body);
      else if(method==='POST'&&/^\/import\/[A-Za-z0-9]+$/.test(route)) result=await service.putClass(identity,route.split('/')[2],body,true);
      else if(method==='POST'&&/^\/classes\/[A-Za-z0-9]+\/transition$/.test(route)) result=await service.transition(identity,route.split('/')[2],body);
      else return respond(404,{error:'Không tìm thấy API.'});
      return respond(200,result);
    } catch(error) {
      const status=error.status||500;
      if(status===500) console.error('GVCN_API_ERROR',error.code||error.name);
      return respond(status,{error:status===500?(String(path).startsWith('/evidence/')?'Không thể xử lý ảnh minh chứng. Vui lòng thử lại.':'Không thể xử lý dữ liệu Firebase. Vui lòng thử lại.'):error.message});
    }
    });
  };
}

export {DATABASE_URL,MAX_BODY_BYTES};
