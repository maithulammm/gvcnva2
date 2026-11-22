import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../../assets/js/color-modes.js',import.meta.url),'utf8');
function fixture(saved,{blocked=false}={}){
  const storage=new Map([['report-data','unchanged'],...(saved?[['VA_GVCN_COLOR_MODE',saved]]:[])]),nodes=new Map(),events={};
  const el=id=>{if(!nodes.has(id))nodes.set(id,{setAttribute(key,value){this[key]=value;}});return nodes.get(id);};
  const root=el('html'),ctx=vm.createContext({document:{documentElement:root,getElementById:el},
    localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value);}},
    window:{addEventListener:(type,fn)=>{events[type]=fn;},matchMedia:()=>({matches:true})}});
  vm.runInContext(source,ctx);return {ctx,storage,el,root,events};
}
test('Theme defaults to light even on dark devices and only persists its own preference',()=>{
  const f=fixture();assert.equal(f.root['data-bs-theme'],'light');
  vm.runInContext('toggleColorMode()',f.ctx);
  assert.equal(f.root['data-bs-theme'],'dark');assert.equal(f.el('themeToggle')['aria-pressed'],'true');
  assert.equal(f.storage.get('VA_GVCN_COLOR_MODE'),'dark');assert.equal(f.storage.get('report-data'),'unchanged');
  assert.equal(fixture('dark').root['data-bs-theme'],'dark');
  assert.equal(fixture('unknown').root['data-bs-theme'],'light');
  f.events.storage({key:'VA_GVCN_COLOR_MODE',newValue:'light'});assert.equal(f.root['data-bs-theme'],'light');
});
test('Theme remains usable when browser storage is blocked',()=>{
  const f=fixture(null,{blocked:true});assert.equal(f.root['data-bs-theme'],'light');
  assert.doesNotThrow(()=>vm.runInContext('toggleColorMode()',f.ctx));
  assert.equal(f.root['data-bs-theme'],'dark');
});
