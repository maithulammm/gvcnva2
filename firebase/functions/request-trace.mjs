import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage();
export const withRequestTrace=(id,fn)=>context.run({id,phases:{}},fn);
export const requestPhases=()=>context.getStore()?.phases||{};
export const requestScope=()=>context.getStore();
export async function tracePhase(name,fn){
  const current=context.getStore(),started=Date.now();
  try{return await fn();}finally{if(current)current.phases[name]=(current.phases[name]||0)+Date.now()-started;}
}
