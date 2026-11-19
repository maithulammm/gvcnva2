import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import {createApiHandler,DATABASE_URL} from './api.mjs';

initializeApp({databaseURL:DATABASE_URL});
const handle=createApiHandler({getDatabase:()=>getDatabase()});
export const gvcnApi=onRequest({region:'asia-southeast1',timeoutSeconds:60,memory:'256MiB',maxInstances:5,invoker:'public'},async(req,res)=>{
  const result=await handle({method:req.method,path:req.path,origin:req.get('origin'),
    authorization:req.get('authorization'),rawBodyLength:req.rawBody?.length||0,body:req.body||{},query:req.query||{}});
  for(const [name,value] of Object.entries(result.headers)) res.set(name,value);
  if(result.status===204) {res.status(204).end();return;}
  res.status(result.status).json(result.body);
});
