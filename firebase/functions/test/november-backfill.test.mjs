import test from 'node:test';
import assert from 'node:assert/strict';
import {backfillNovemberMeetings} from '../november-backfill.mjs';
import {blankClass,emptyMonth,validateClass} from '../model.mjs';

test('November backfill reuses matching plans, adds dated actual mirrors and is idempotent',()=>{
  const c=blankClass('8C3');c.students=[{id:'S1',name:'One'},{id:'S2',name:'Two'},{id:'S3',name:'Three'}];
  const plan={id:'A1',date:'2026-11-03',session:'morning',planTime:'03/11/2026 · Sáng 9:55–10:15',goal:'Keep goal',note:'Keep note'};
  c.months['T11/2026']={...emptyMonth(),schedule:{S1:{appointments:[plan],planTime:plan.planTime}},meetings:[
    {id:'R1',studentId:'S1',actual:'03/11/2026 09:55 · Phòng 8C3'},
    {id:'R2',studentId:'S2',actual:'22/11/2026 18:30 · Sân trường'},
    {id:'R3',studentId:'S3',actual:'2026-11-23 · Phòng học',concern:'Keep content',evidenceImages:[{provider:'school',id:'a'.repeat(64)}]},
    {id:'R4',studentId:'S3',actual:'Chưa rõ ngày'}]};
  c.months['T12/2026']={...emptyMonth(),meetings:[{id:'DEC',studentId:'S1',actual:'02/12/2026 09:55'}]};
  const december=structuredClone(c.months['T12/2026']),before=structuredClone(c);
  assert.deepEqual(backfillNovemberMeetings(c),{added:2,linked:1,skipped:1});
  const m=c.months['T11/2026'];
  assert.deepEqual(m.schedule.S1.appointments,[plan]);
  assert.equal(m.meetings[0].appointmentId,'A1');
  assert.equal(m.schedule.S2.appointments[0].startTime,'18:30');
  assert.equal(m.schedule.S3.appointments[0].date,undefined);
  assert.equal(m.schedule.S3.appointments[0].recordedDate,'2026-11-23');
  assert.match(m.schedule.S3.appointments[0].planTime,/chưa ghi giờ/);
  assert.deepEqual(c.months['T12/2026'],december);
  for(let i=0;i<m.meetings.length;i++){const {appointmentId,...row}=m.meetings[i];assert.deepEqual(row,before.months['T11/2026'].meetings[i]);}
  assert.doesNotThrow(()=>validateClass(c,before));
  const stable=structuredClone(c);
  assert.deepEqual(backfillNovemberMeetings(c),{added:0,linked:0,skipped:1});
  assert.deepEqual(c,stable);
});

test('November backfill never guesses malformed dates or matches another pupils appointment',()=>{
  const c=blankClass('8C3');c.students=[{id:'S1'}];
  c.months['T11/2026']={...emptyMonth(),meetings:[{id:'X',studentId:'S1',actual:'31/11/2026 09:55'},{id:'Y',studentId:'S1',actual:'01/12/2026 09:55'}]};
  const before=structuredClone(c);
  assert.deepEqual(backfillNovemberMeetings(c),{added:0,linked:0,skipped:2});
  assert.deepEqual(c,before);
});
