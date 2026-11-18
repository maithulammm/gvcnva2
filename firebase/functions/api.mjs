import {createIdentityVerifier} from './identity.mjs';
import {createService} from './service.mjs';
import {deploymentStatus} from './health.mjs';
import {DATABASE_URL,requireValue} from './model.mjs';

const MAX_BODY_BYTES=5*1024*1024;

export function createApiHandler({getDatabase,databaseConfigured=()=>true,env=process.env}) {
  let service;
  let verifyIdentity;
  return async function handle({method,path,origin,authorization,rawBodyLength=0,body={},bodyError}) {
    const headers={'Cache-Control':'no-store',Vary:'Origin','X-Content-Type-Options':'nosniff'};
    const respond=(status,result)=>({status,headers,body:result});
    try {
      const origins=String(env.GVCN_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
      requireValue(!origin || origins.includes(origin),'Địa chỉ website chưa được khai báo trong GVCN_ALLOWED_ORIGINS.',403);
      if(origin) headers['Access-Control-Allow-Origin']=origin;
      headers['Access-Control-Allow-Methods']='GET,POST,PUT,DELETE,OPTIONS';
      headers['Access-Control-Allow-Headers']='Authorization,Content-Type';
      if(method==='OPTIONS') return respond(204,null);
      const route=String(path||'/').replace(/\/$/,'')||'/';
      if(method==='GET'&&route==='/health') {
        const health=deploymentStatus(env,{databaseConfigured:databaseConfigured()});
        return respond(health.configured?200:503,health);
      }
      if(bodyError) throw bodyError;
      const token=/^Bearer ([^\s]+)$/.exec(authorization||'')?.[1];
      requireValue(token&&token.length<20000,'Thiếu phiên đăng nhập Microsoft.',401);
      verifyIdentity ||= createIdentityVerifier({tenantId:env.MICROSOFT_TENANT_ID,clientId:env.MICROSOFT_CLIENT_ID});
      const identity=await verifyIdentity(token);
      requireValue(rawBodyLength<=MAX_BODY_BYTES,'Dữ liệu gửi lên vượt giới hạn 5 MB.',413);
      service ||= createService(getDatabase(),{adminEmail:(env.GVCN_ADMIN_EMAIL||'lammt@vietanhschool.edu.vn').toLowerCase().trim()});
      let result;
      if(method==='GET'&&route==='/bootstrap') result=await service.bootstrap(identity);
      else if(method==='PUT'&&route==='/calendar') result=await service.saveCalendar(identity,body);
      else if(method==='POST'&&route==='/teachers') result=await service.saveTeacher(identity,body);
      else if(method==='DELETE'&&/^\/teachers\/[A-Za-z0-9_-]+$/.test(route)) result=await service.deleteTeacher(identity,route.split('/')[2]);
      else if(method==='POST'&&route==='/users') result=await service.saveUserRoles(identity,body);
      else if(method==='POST'&&route==='/directory/import') result=await service.importDirectory(identity,body);
      else if(method==='PUT'&&/^\/classes\/[A-Za-z0-9]+$/.test(route)) result=await service.putClass(identity,route.split('/')[2],body);
      else if(method==='POST'&&/^\/import\/[A-Za-z0-9]+$/.test(route)) result=await service.putClass(identity,route.split('/')[2],body,true);
      else if(method==='POST'&&/^\/classes\/[A-Za-z0-9]+\/transition$/.test(route)) result=await service.transition(identity,route.split('/')[2],body);
      else return respond(404,{error:'Không tìm thấy API.'});
      return respond(200,result);
    } catch(error) {
      const status=error.status||500;
      if(status===500) console.error('GVCN_API_ERROR',error.code||error.name);
      return respond(status,{error:status===500?'Không thể xử lý dữ liệu Firebase. Vui lòng thử lại.':error.message});
    }
  };
}

export {DATABASE_URL,MAX_BODY_BYTES};
