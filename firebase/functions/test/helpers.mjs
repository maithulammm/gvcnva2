import assert from 'node:assert/strict';
import {ROOT} from '../model.mjs';
function stored(value) {
  if(value===null || value===undefined) return null;
  if(typeof value!=='object') return value;
  const entries=Object.entries(value).map(([k,v])=>[k,stored(v)]).filter(([,v])=>v!==null);
  if(!entries.length) return null;
  return Array.isArray(value) ? Object.assign([],Object.fromEntries(entries)) : Object.fromEntries(entries);
}
export function memoryDatabase(initial=null,{coldTransaction=false}={}) {
  let state=stored(initial);
  return {state:()=>structuredClone(state),ref(path) {
    assert.equal(path,ROOT);
    return {async get() {return {val:()=>structuredClone(state)};},async transaction(update) {
      let next;
      if(coldTransaction) {
        coldTransaction=false;
        next=update(null);
        if(next===undefined) return {committed:false,snapshot:{val:()=>structuredClone(state)}};
      }
      next=update(structuredClone(state));
      const committed=next!==undefined;
      if(committed) state=stored(next);
      return {committed,snapshot:{val:()=>structuredClone(state)}};
    }};
  }};
}
