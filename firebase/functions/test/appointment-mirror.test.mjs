import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAppointments} from '../appointments.mjs';

test('actual mirror permits weekend records but rejects forged source links',()=>{
  const a={id:'A',sourceMeetingId:'R',date:'2026-11-22',session:'other',startTime:'18:30',endTime:'18:50',planTime:'22/11/2026 · Giờ khác 18:30–18:50'};
  const m={schedule:{S1:{appointments:[a],planTime:a.planTime}},meetings:[{id:'R',studentId:'S1',appointmentId:'A',actualDateTime:'2026-11-22T18:30'}]};
  const c={grade:8,students:[{id:'S1'}]};
  const requireValue=(v,message)=>{if(!v)throw Error(message);};
  assert.doesNotThrow(()=>validateAppointments(c,'T11/2026',m,null,requireValue));
  m.meetings[0].actualDateTime='2026-11-22T19:30';
  assert.throws(()=>validateAppointments(c,'T11/2026',m,null,requireValue),/khớp cuộc gặp/);
});
