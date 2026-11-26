import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createD1History} from '../../../cloudflare/d1-history.mjs';

test('D1 SQL archive is idempotent, isolates classes and returns complete snapshots',async()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../../../cloudflare/migrations/0001_history.sql',import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){const s=sql.prepare(query);return {
    async all(){return {success:true,results:s.all(...args)};},async first(){return s.get(...args)||null;},
    run(){s.run(...args);return {success:true};}
  };}};},async batch(statements){return statements.map(s=>s.run());}};
  try{
    const archive=createD1History(db),original={at:'2026-11-26T00:00:00Z',revision:1,data:{months:{T11_2026:{notes:{summary:'Kept'}}}}};
    await archive.write('8C3',{'rev-1':original},{one:{at:original.at,action:'save-class:8C3'}});
    await archive.write('8C3',{'rev-1':{...original,data:{}}},{one:{at:original.at,action:'changed'}});
    await archive.write('8C4',{'rev-1':{...original,revision:9}},{});
    const saved=await archive.read('8C3');
    assert.deepEqual(saved.snapshots['rev-1'],original);
    assert.equal(saved.events.one.action,'save-class:8C3');
    assert.deepEqual(await archive.snapshot('8C3','rev-1'),original);
    assert.equal(await archive.snapshot('8C3','missing'),null);
    assert.equal((await archive.snapshot('8C4','rev-1')).revision,9);
    assert.equal(createD1History(null),null);
  }finally{sql.close();}
});
