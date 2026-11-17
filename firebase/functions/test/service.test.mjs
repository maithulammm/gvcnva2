import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../service.mjs';
import {CLASSES,ROOT,emailKey,emptyMonth,blankClass,encodeClass} from '../model.mjs';
import {memoryDatabase} from './helpers.mjs';
const admin={email:'lammt@vietanhschool.edu.vn',oid:'admin-oid',name:'Admin'};
const teacher={email:'teacher@vietanhschool.edu.vn',oid:'teacher-oid',name:'Teacher'};
async function fixture() {
  const db=memoryDatabase(),api=createService(db);
  await api.bootstrap(admin);
  return {db,api};
}
const teacherInput={name:'Giáo viên A',email:teacher.email,classId:'8C3',active:true};

test('first Admin binds once, creates 32 empty classes and denies an unassigned identity',async()=>{
  const {db,api}=await fixture();
  const boot=await api.bootstrap(admin);
  assert.equal(boot.assignment.role,'admin');assert.equal(Object.keys(boot.classes).length,32);
  assert.deepEqual(boot.classes['6A1'].students,[]);assert.deepEqual(boot.classes['6A1'].profiles,[]);
  await assert.rejects(api.bootstrap(teacher),e=>e.status===403);
  await assert.rejects(api.bootstrap({...admin,oid:'different-oid'}),e=>e.status===403);
  assert.equal(db.state().bootstrapAdminOid,admin.oid);
});

test('an already assigned teacher can log in on a cold RTDB transaction cache',async()=>{
  const db=memoryDatabase({bootstrapAdminOid:admin.oid,users:{[emailKey(teacher.email)]:{...teacher,role:'gvcn',classId:'8C3',active:true}},
    classes:{'8C3':{data:encodeClass(blankClass('8C3')),revision:0}}},{coldTransaction:true});
  const boot=await createService(db).bootstrap(teacher);
  assert.equal(boot.assignment.role,'gvcn');assert.deepEqual(Object.keys(boot.classes),['8C3']);
});

test('teacher CRUD grants scope, moves assignment, then revokes access without deleting students',async()=>{
  const {db,api}=await fixture();
  let boot=await api.saveTeacher(admin,teacherInput);
  const id=Object.keys(boot.teachers)[0];
  let login=await api.bootstrap(teacher);
  assert.deepEqual(Object.keys(login.classes),['8C3']);
  await assert.rejects(api.putClass(teacher,'6A1',{revision:0,classData:blankClass('6A1')}),e=>e.status===403);
  const c=boot.classes['8C3'];c.students.push({id:'S1',name:'Học sinh A',code:'HS01'});
  await api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:c});
  boot=await api.saveTeacher(admin,{...teacherInput,id,name:'Giáo viên đổi tên',classId:'8C2'});
  assert.equal(boot.classes['8C3'].students.length,1);assert.equal(boot.classes['8C3'].teacher,'');
  login=await api.bootstrap(teacher);assert.deepEqual(Object.keys(login.classes),['8C2']);
  boot=await api.deleteTeacher(admin,id);assert.equal(Object.keys(boot.teachers).length,0);
  assert.equal(boot.classes['8C3'].students.length,1);
  await assert.rejects(api.bootstrap(teacher),e=>e.status===403);
  assert.equal(Object.keys(db.state().teacherArchive).length,1);
});

test('non-Admin cannot edit teacher/student rosters or forge a role',async()=>{
  const {api}=await fixture();await api.saveTeacher(admin,teacherInput);
  let boot=await api.bootstrap(teacher);
  await assert.rejects(api.saveTeacher(teacher,{...teacherInput,email:'other@vietanhschool.edu.vn'}),e=>e.status===403);
  const c=boot.classes['8C3'];c.students.push({id:'S1',name:'Học sinh A',code:''});
  await assert.rejects(api.putClass(teacher,'8C3',{classData:c,revision:boot.revisions['8C3'],role:'admin'}),e=>e.status===403);
});

test('Admin student add/edit/delete, duplicate IDs and reference protection',async()=>{
  const {api}=await fixture();let boot=await api.bootstrap(admin);
  let c=boot.classes['6A1'];c.students=[{id:'S1',name:'Học sinh A',code:'HS01'}];
  let saved=await api.putClass(admin,'6A1',{classData:c,revision:0});
  c=saved.data;c.students[0].name='Tên cập nhật';
  saved=await api.putClass(admin,'6A1',{classData:c,revision:saved.revision});
  assert.equal(saved.data.students[0].name,'Tên cập nhật');
  c=structuredClone(saved.data);c.students.push({...c.students[0]});
  await assert.rejects(api.putClass(admin,'6A1',{classData:c,revision:saved.revision}),/Trùng mã/);
  c=structuredClone(saved.data);c.students=[];
  saved=await api.putClass(admin,'6A1',{classData:c,revision:saved.revision});assert.equal(saved.data.students.length,0);
  c=saved.data;c.students=[{id:'S2',name:'Có hồ sơ',code:'HS02'}];
  c.months['T11/2026']={...emptyMonth(),previous:[{id:'R1',studentId:'S2',action:'A',observation:'B',next:'C'}]};
  saved=await api.putClass(admin,'6A1',{classData:c,revision:saved.revision});
  c=structuredClone(saved.data);c.students=[];c.months={};
  await assert.rejects(api.putClass(admin,'6A1',{classData:c,revision:saved.revision}),e=>e.status===409);
});

test('stale class revisions cannot overwrite another user, other classes are retained',async()=>{
  const {api}=await fixture();const boot=await api.bootstrap(admin);
  const c=boot.classes['6A1'];c.students=[{id:'S1',name:'First',code:''}];
  await api.putClass(admin,'6A1',{classData:c,revision:0});
  c.students[0].name='Stale';await assert.rejects(api.putClass(admin,'6A1',{classData:c,revision:0}),e=>e.status===409);
  const next=await api.bootstrap(admin);assert.equal(next.classes['6A1'].students[0].name,'First');assert.equal(Object.keys(next.classes).length,32);
});

test('month keys round trip and report state is enforced server-side',async()=>{
  const {db,api}=await fixture();let boot=await api.saveTeacher(admin,teacherInput);
  let c=boot.classes['8C3'];c.students=[{id:'S1',name:'Học sinh A',code:''}];
  const m=emptyMonth();m.schedule.S1={planTime:'01/11/2026'};
  m.meetings=[{id:'R1',studentId:'S1',actual:'01/11/2026',concern:'A',participation:'B',progressEvidence:'Có',goal:'C',action:'D',cooperation:'Chưa cần',needsCoop:'Không',evidence:'EV1'}];
  c.months['T11/2026']=m;
  await api.putClass(admin,'8C3',{classData:c,revision:boot.revisions['8C3']});
  assert(db.state().classes['8C3'].data.months.T11_2026);
  boot=await api.bootstrap(teacher);c=boot.classes['8C3'];assert(c.months['T11/2026']);
  const rev=boot.revisions['8C3'];
  c.months['T11/2026'].approval.state='approved';
  await assert.rejects(api.putClass(teacher,'8C3',{classData:c,revision:rev}),e=>e.status===403);
  boot=await api.transition(teacher,'8C3',{month:'T11/2026',target:'submitted',revision:rev});
  c=boot.classes['8C3'];c.months['T11/2026'].meetings[0].concern='Locked edit';
  await assert.rejects(api.putClass(teacher,'8C3',{classData:c,revision:boot.revisions['8C3']}),e=>e.status===403);
  await assert.rejects(api.transition(teacher,'8C3',{month:'T11/2026',target:'submitted',revision:boot.revisions['8C3']}),e=>e.status===403);
});

test('legacy import preserves history, leaves source untouched and refuses occupied classes',async()=>{
  const {api}=await fixture();const c=blankClass('6A1');
  c.students=[{id:'S1',name:'Dữ liệu cũ',code:''}];c.teacher='GVCN cũ';c.email='old@vietanhschool.edu.vn';
  c.months['T11/2026']={...emptyMonth(),approval:{state:'approved',history:[{state:'approved',actor:'old',at:'old date'}]}};
  const source=structuredClone(c);let saved=await api.putClass(admin,'6A1',{classData:c,revision:0},true);
  assert.deepEqual(c,source);assert.equal(saved.data.months['T11/2026'].approval.history[0].actor,'old');
  await assert.rejects(api.putClass(admin,'6A1',{classData:c,revision:saved.revision},true),e=>e.status===409);
});

test('BGH bootstrap returns aggregates and approval states without student details',async()=>{
  const c=blankClass('6A1');c.students=[{id:'SECRET-ID',name:'PRIVATE-STUDENT-NAME',code:'PRIVATE-CODE'}];
  c.months['T11/2026']={...emptyMonth(),connections:[{id:'R1',studentId:'SECRET-ID',date:'2026-11-01',channel:'Email',message:'PRIVATE-MESSAGE',recipient:'Mẹ',reply:'OK'}]};
  const bgh={email:'bgh@vietanhschool.edu.vn',oid:'bgh-oid',name:'BGH'};
  const db=memoryDatabase({bootstrapAdminOid:admin.oid,users:{[emailKey(admin.email)]:{...admin,role:'admin'},[emailKey(bgh.email)]:{...bgh,role:'bgh'}},classes:{'6A1':{data:encodeClass(c),revision:1}}});
  const api=createService(db),boot=await api.bootstrap(bgh);
  assert.equal(boot.summaries['6A1']['T11/2026'].count,1);
  assert.equal(boot.summaries['6A1']['T11/2026'].connections,1);
  assert(!JSON.stringify(boot).includes('PRIVATE'));assert(!JSON.stringify(boot).includes('SECRET-ID'));
});

test('M05 cannot be edited through a different open month when linked month is locked',async()=>{
  const {api}=await fixture();let boot=await api.saveTeacher(admin,teacherInput),c=boot.classes['8C3'];
  c.students=[{id:'S1',name:'Student',code:''}];c.profiles=[{id:'P1',studentId:'S1',code:'P01',startMonth:'T11/2026',strength:'A',concern:'B',goal:'C'}];
  c.months['T11/2026']={...emptyMonth(),approval:{state:'submitted',history:[]}};
  await api.putClass(admin,'8C3',{classData:c,revision:boot.revisions['8C3']},true);
  boot=await api.bootstrap(teacher);c=boot.classes['8C3'];c.profiles[0].goal='Changed in December';
  await assert.rejects(api.putClass(teacher,'8C3',{classData:c,revision:boot.revisions['8C3']}),e=>e.status===403);
});
