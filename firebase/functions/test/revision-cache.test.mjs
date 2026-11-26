import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRevisionCache} from '../../../cloudflare/revision-cache.mjs';
test('D1 revision cache expires, isolates requested classes and rejects older observations',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../../cloudflare/migrations/0003_revision_cache.sql',import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){const statement=sql.prepare(query);return {
    async run(){statement.run(...args);return {success:true};},async all(){return {success:true,results:statement.all(...args)};}
  };}};}};
  let now=100000;const cache=createRevisionCache(db,{clock:()=>now});
  try{
    await cache.write([['8C3',2],['8C4',7]]);
    assert.deepEqual(await cache.read(['8C3']),{'8C3':2});
    await cache.write([['8C3',1]],now-1);
    assert.deepEqual(await cache.read(['8C3']),{'8C3':2});
    now+=60001;assert.deepEqual(await cache.read(['8C3','8C4']),{});
    await cache.write([['8C3',3]]);assert.deepEqual(await cache.read(['8C3']),{'8C3':3});
  }finally{sql.close();}
});
