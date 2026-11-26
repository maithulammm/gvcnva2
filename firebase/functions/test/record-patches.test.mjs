import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRecordPatch} from '../record-patches.mjs';
import {blankClass,emptyMonth} from '../model.mjs';
test('record operations add edit delete only the selected record and keep the input immutable',()=>{
  const c=blankClass('8C3');c.months['T11/2026']={...emptyMonth(),_revision:2,connections:[{id:'one',message:'old'},{id:'two',message:'kept'}]};
  const apply=operations=>applyRecordPatch(c,{monthVersions:{'T11/2026':2},operations:operations.map(op=>({month:'T11/2026',collection:'connections',...op}))});
  const next=apply([{id:'one',operation:'delete'},{id:'three',operation:'upsert',value:{id:'three',message:'new'}}]);
  assert.deepEqual(next.months['T11/2026'].connections.map(r=>r.id),['two','three']);
  assert.equal(c.months['T11/2026'].connections[0].message,'old');
  assert.throws(()=>apply([{id:'one',collection:'students',operation:'delete'}]),{status:400});
  assert.throws(()=>apply([{id:'__proto__',collection:'schedule',operation:'delete'}]),{status:400});
  assert.throws(()=>apply([{id:'one',operation:'upsert',value:{id:'different'}}]),{status:400});
});
