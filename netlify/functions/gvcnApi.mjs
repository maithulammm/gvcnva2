import {cert,getApps,initializeApp} from 'firebase-admin/app';
import {getDatabase as firebaseGetDatabase} from 'firebase-admin/database';
import {createApiHandler, DATABASE_URL, MAX_BODY_BYTES} from '../../firebase/functions/api.mjs';
import {serviceAccountConfigured} from '../../firebase/functions/health.mjs';
import {requireValue} from '../../firebase/functions/model.mjs';

const APP_NAME='gvcn-netlify-api';

function getServiceAccount() {
  requireValue(serviceAccountConfigured(process.env),'Máy chủ chưa cấu hình kết nối Realtime Database.',503);
  return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function getDatabase() {
  let app=getApps().find(item=>item.name===APP_NAME);
  if(!app) app=initializeApp({credential:cert(getServiceAccount()),databaseURL:DATABASE_URL},APP_NAME);
  return firebaseGetDatabase(app);
}

const handle=createApiHandler({getDatabase,databaseConfigured:()=>serviceAccountConfigured(process.env)});

export default async function gvcnApi(request) {
  let rawBody;
  try {rawBody=await request.arrayBuffer();}
  catch {rawBody=new ArrayBuffer(0);}
  let body={},bodyError;
  if(rawBody.byteLength>0&&rawBody.byteLength<=MAX_BODY_BYTES) {
    try {body=JSON.parse(new TextDecoder().decode(rawBody))||{};}
    catch {bodyError=Object.assign(new Error('Nội dung JSON không hợp lệ.'),{status:400});}
  }
  const pathname=new URL(request.url).pathname
    .replace(/^\/api(?=\/|$)/,'')
    .replace(/^\/\.netlify\/functions\/gvcnApi(?=\/|$)/,'')||'/';
  const result=await handle({method:request.method,path:pathname,origin:request.headers.get('origin'),
    authorization:request.headers.get('authorization'),rawBodyLength:rawBody.byteLength,body,bodyError,query:Object.fromEntries(new URL(request.url).searchParams)});
  const headers=new Headers(result.headers);
  if(result.status===204) return new Response(null,{status:204,headers});
  headers.set('Content-Type','application/json; charset=utf-8');
  return new Response(JSON.stringify(result.body),{status:result.status,headers});
}

export const config={path:'/api/*'};
