import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createIdentityVerifier } from './identity.mjs';
import { createService } from './service.mjs';
import { DATABASE_URL, requireValue } from './model.mjs';

initializeApp({databaseURL:DATABASE_URL});
let service;
let verifyIdentity;
export const gvcnApi=onRequest({region:'asia-southeast1',timeoutSeconds:60,memory:'256MiB',maxInstances:5,invoker:'public'},async(req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('Vary','Origin');
  res.set('X-Content-Type-Options','nosniff');
  try {
    const origins=(process.env.GVCN_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    const origin=req.get('origin');
    requireValue(!origin || origins.includes(origin),'Địa chỉ website chưa được khai báo trong GVCN_ALLOWED_ORIGINS.',403);
    if(origin) res.set('Access-Control-Allow-Origin',origin);
    res.set('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers','Authorization,Content-Type');
    if(req.method==='OPTIONS') { res.status(204).end(); return; }
    const token=/^Bearer ([^\s]+)$/.exec(req.get('authorization')||'')?.[1];
    requireValue(token&&token.length<20000,'Thiếu phiên đăng nhập Microsoft.',401);
    verifyIdentity ||= createIdentityVerifier({tenantId:process.env.MICROSOFT_TENANT_ID,clientId:process.env.MICROSOFT_CLIENT_ID});
    const identity=await verifyIdentity(token);
    requireValue((req.rawBody?.length||0)<=5*1024*1024,'Dữ liệu gửi lên vượt giới hạn 5 MB.',413);
    service ||= createService(getDatabase(),{adminEmail:(process.env.GVCN_ADMIN_EMAIL||'lammt@vietanhschool.edu.vn').toLowerCase().trim()});
    const path=req.path.replace(/\/$/,'')||'/';
    const body=req.body||{};
    let result;
    if(req.method==='GET'&&path==='/bootstrap') result=await service.bootstrap(identity);
    else if(req.method==='POST'&&path==='/teachers') result=await service.saveTeacher(identity,body);
    else if(req.method==='DELETE'&&/^\/teachers\/[A-Za-z0-9_-]+$/.test(path)) result=await service.deleteTeacher(identity,path.split('/')[2]);
    else if(req.method==='PUT'&&/^\/classes\/[A-Za-z0-9]+$/.test(path)) result=await service.putClass(identity,path.split('/')[2],body);
    else if(req.method==='POST'&&/^\/import\/[A-Za-z0-9]+$/.test(path)) result=await service.putClass(identity,path.split('/')[2],body,true);
    else if(req.method==='POST'&&/^\/classes\/[A-Za-z0-9]+\/transition$/.test(path)) result=await service.transition(identity,path.split('/')[2],body);
    else { res.status(404).json({error:'Không tìm thấy API.'}); return; }
    res.json(result);
  } catch(error) {
    const status=error.status||500;
    // No Microsoft tokens, student records, or full request bodies in logs.
    if(status===500) console.error('GVCN_API_ERROR',error.code||error.name);
    res.status(status).json({error:status===500?'Không thể xử lý dữ liệu Firebase. Vui lòng thử lại.':error.message});
  }
});
