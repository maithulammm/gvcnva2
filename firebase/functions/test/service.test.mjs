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

test('recovery stores server-side revisions and daily snapshots, denies teachers and restores with concurrency checks',async()=>{
  const {api}=await fixture();await api.saveTeacher(admin,teacherInput);await api.bootstrap(teacher);
  let boot=await api.bootstrap(admin),c=boot.classes['8C3'];c.students=[{id:'S1',name:'Before',code:''}];
  await api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:c});
  boot=await api.bootstrap(admin);c=boot.classes['8C3'];c.students[0].name='After';
  await api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:c});
  const history=await api.recovery(admin,'8C3');
  const [key]=Object.entries(history.snapshots).find(([,s])=>s.data.students?.[0]?.name==='Before');
  assert(history.audit.some(a=>a.actor===admin.email&&a.changes?.some(x=>x.operation==='edit')));
  await assert.rejects(api.recovery(teacher,'8C3'),{status:403});
  await assert.rejects(api.restore(teacher,'8C3',{key,revision:history.revision}),{status:403});
  await assert.rejects(api.restore(admin,'8C3',{key,revision:history.revision-1}),{status:409});
  const restored=await api.restore(admin,'8C3',{key,revision:history.revision});assert.equal(restored.classes['8C3'].students[0].name,'Before');
  await api.backupDaily();await api.backupDaily();
  assert(Object.keys((await api.recovery(admin,'8C3')).snapshots).some(k=>k.startsWith('day-')));
});

test('Admin calendar is shared read-only with teachers and does not replace class records',async()=>{
  const {api}=await fixture();await api.saveTeacher(admin,teacherInput);
  const before=await api.bootstrap(admin);await api.bootstrap(teacher);
  const result=await api.saveCalendar(admin,{excludedDates:['2027-01-01','2026-11-20'],revision:0});
  assert.deepEqual(result.calendar,{excludedDates:['2026-11-20','2027-01-01'],excludedSessions:[],revision:1,supportsSessions:true});
  assert.deepEqual((await api.bootstrap(teacher)).calendar,result.calendar);
  const after=await api.bootstrap(admin);
  assert.deepEqual(after.classes,before.classes);assert.deepEqual(after.revisions,before.revisions);
  await assert.rejects(api.saveCalendar(teacher,{excludedDates:[],revision:1}),{status:403});
  await assert.rejects(api.saveCalendar(admin,{excludedDates:[],revision:0}),{status:409});
  assert.deepEqual((await api.bootstrap(admin)).calendar,result.calendar);
});

test('calendar rejects invalid or out-of-school-year dates without changing stored days',async()=>{
  const {api}=await fixture();
  for(const dates of [['2026-11-31'],['2027-02-29'],['2026-08-31'],['2027-09-01'],['2026-11-20','2026-11-20'],['20/11/2026'],[null]]) {
    await assert.rejects(api.saveCalendar(admin,{excludedDates:dates,revision:0}),{status:400});
  }
  assert.deepEqual((await api.bootstrap(admin)).calendar,{excludedDates:[],excludedSessions:[],revision:0,supportsSessions:true});
  await api.saveCalendar(admin,{excludedDates:['2026-09-01','2027-08-31'],revision:0});
  await api.saveCalendar(admin,{excludedDates:[],revision:1});
  assert.deepEqual((await api.bootstrap(admin)).calendar,{excludedDates:[],excludedSessions:[],revision:2,supportsSessions:true});
});

test('half-day calendar preserves legacy whole days and does not let older clients erase partial days',async()=>{
  const {api}=await fixture();
  let saved=await api.saveCalendar(admin,{excludedDates:['2026-11-20'],excludedSessions:[{date:'2026-11-19',session:'morning'}],revision:0});
  assert.deepEqual(saved.calendar.excludedSessions,[{date:'2026-11-19',session:'morning'}]);
  saved=await api.saveCalendar(admin,{excludedDates:['2026-11-20','2026-12-25'],revision:1});
  assert.deepEqual(saved.calendar.excludedSessions,[{date:'2026-11-19',session:'morning'}]);
  saved=await api.saveCalendar(admin,{excludedDates:['2026-11-20'],excludedSessions:[{date:'2026-11-19',session:'morning'},{date:'2026-11-19',session:'afternoon'}],revision:2});
  assert.deepEqual(saved.calendar.excludedDates,['2026-11-19','2026-11-20']);assert.deepEqual(saved.calendar.excludedSessions,[]);
  saved=await api.saveCalendar(admin,{excludedDates:['2026-11-20'],excludedSessions:[{date:'2026-11-19',session:'afternoon'}],revision:3});
  assert.deepEqual(saved.calendar.excludedSessions,[{date:'2026-11-19',session:'afternoon'}]);
});

test('half-day calendar rejects invalid sessions and duplicate slots without writes',async()=>{
  const {api}=await fixture();
  for(const sessions of [[{date:'2026-11-19',session:'evening'}],[{date:'2027-02-29',session:'morning'}],[{date:'2026-11-19',session:'morning'},{date:'2026-11-19',session:'morning'}],[null]]) {
    await assert.rejects(api.saveCalendar(admin,{excludedDates:[],excludedSessions:sessions,revision:0}),{status:400});
  }
  assert.equal((await api.bootstrap(admin)).calendar.revision,0);
});

test('GVCN can submit a complete report with linked M05 and parent contact without evidence codes',async()=>{
  const {api}=await fixture();let boot=await api.saveTeacher(admin,teacherInput),c=boot.classes['8C3'];
  c.students=[{id:'S1',name:'Student',code:'OLD-CODE'}];
  c.profiles=[{id:'P1',studentId:'S1',code:'P01',startMonth:'T11/2026',strength:'A',concern:'B',goal:'C'}];
  c.months['T11/2026']={...emptyMonth(),meetings:[{id:'R1',studentId:'S1',actual:'2026-11-18',concern:'A',participation:'B',progressEvidence:'Chưa đủ căn cứ',goal:'C',action:'D',cooperation:'Chưa cần',needsCoop:'Không',profileId:'P1',profileProgress:'E',profileNext:'F'}],connections:[{id:'C1',studentId:'S1',date:'2026-11-18',channel:'Tin nhắn',message:'Chủ động học tập',recipient:'Mẹ',reply:'Đã gửi'}]};
  await api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:c});
  boot=await api.bootstrap(teacher);
  const result=await api.transition(teacher,'8C3',{month:'T11/2026',target:'submitted',revision:boot.revisions['8C3']});
  assert.equal(result.classes['8C3'].months['T11/2026'].approval.state,'submitted');
});

test('API enforces weekdays, grade-12 Saturday morning, three appointments and unique actual links',async()=>{
  const {api}=await fixture();
  const make=(id,date,session='morning')=>({id,date,session,topics:[],note:'',goal:'',
    planTime:`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · ${session==='morning'?'Sáng 9:55–10:15':'Chiều 15:00–15:20'}`});
  const set=(c,items)=>{c.months['T11/2026']={...emptyMonth(),schedule:{S1:{appointments:items,planTime:items.map(a=>a.planTime).join('\n')}}};};
  for(const classId of ['6A1','12C1']) {
    let c=blankClass(classId);c.students=[{id:'S1',name:'Student',code:''},{id:'S2',name:'Other',code:''}];
    set(c,[make('SAT','2026-11-21')]);
    if(classId==='6A1') {await assert.rejects(api.putClass(admin,classId,{revision:0,classData:c}),e=>e.status===400);continue;}
    let saved=await api.putClass(admin,classId,{revision:0,classData:c});c=saved.data;
    for(const record of [make('SAT','2026-11-21','afternoon'),make('SUN','2026-11-22')]) {
      const bad=structuredClone(c);set(bad,[record]);
      await assert.rejects(api.putClass(admin,classId,{revision:saved.revision,classData:bad}),e=>e.status===400);
    }
    set(c,[make('SAT','2026-11-21'),make('MON','2026-11-23'),make('TUE','2026-11-24')]);
    saved=await api.putClass(admin,classId,{revision:saved.revision,classData:c});c=saved.data;
    const bad=structuredClone(c);set(bad,[...c.months['T11/2026'].schedule.S1.appointments,make('WED','2026-11-25')]);
    await assert.rejects(api.putClass(admin,classId,{revision:saved.revision,classData:bad}),e=>e.status===400);
    const sameDay=structuredClone(c);set(sameDay,[make('A','2026-11-23'),make('B','2026-11-23','afternoon')]);
    await assert.rejects(api.putClass(admin,classId,{revision:saved.revision,classData:sameDay}),e=>e.status===409);
    c.months['T11/2026'].meetings=[{id:'R1',studentId:'S1',appointmentId:'SAT'}];
    saved=await api.putClass(admin,classId,{revision:saved.revision,classData:c});c=saved.data;
    const duplicate=structuredClone(c);duplicate.months['T11/2026'].meetings.push({id:'R2',studentId:'S1',appointmentId:'SAT'});
    await assert.rejects(api.putClass(admin,classId,{revision:saved.revision,classData:duplicate}),e=>e.status===409);
    const removed=structuredClone(c);delete removed.months['T11/2026'].schedule.S1;
    await assert.rejects(api.putClass(admin,classId,{revision:saved.revision,classData:removed}),e=>e.status===400);
  }
});

test('unchanged older weekend schedules remain readable and do not block unrelated saves',async()=>{
  const c=blankClass('6A1');c.students=[{id:'S1',name:'Student',code:''}];
  c.months['T11/2026']={...emptyMonth(),schedule:{S1:{date:'2026-11-21',session:'morning',topics:['Vở ghi'],planTime:'21/11/2026 · Sáng 9:55–10:15'}}};
  const api=createService(memoryDatabase({bootstrapAdminOid:admin.oid,users:{[emailKey(admin.email)]:{...admin,role:'admin'}},classes:{'6A1':{data:encodeClass(c),revision:1}}}));
  c.months['T11/2026'].notes.teacher='Unrelated update';
  const saved=await api.putClass(admin,'6A1',{revision:1,classData:c});
  assert.equal(saved.data.months['T11/2026'].schedule.S1.date,'2026-11-21');
  saved.data.months['T11/2026'].schedule.S1.note='Changed weekend appointment';
  await assert.rejects(api.putClass(admin,'6A1',{revision:saved.revision,classData:saved.data}),e=>e.status===400);
});

test('M01 enforces two distinct-student sessions per day without counting actual meetings',async()=>{
  const {api}=await fixture();let boot=await api.saveTeacher(admin,teacherInput),c=boot.classes['8C3'];
  c.students=['S1','S2','S3'].map(id=>({id,name:id,code:id}));
  const morning={date:'2026-11-18',session:'morning',topics:['Vở ghi'],goal:'Vở ghi',planTime:'18/11/2026 · Sáng 9:55–10:15',note:''};
  c.months['T11/2026']={...emptyMonth(),schedule:{S1:morning,S2:{...morning,topics:[],goal:'',session:'afternoon',planTime:'18/11/2026 · Chiều 15:00–15:20'}}};
  await api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:c});
  boot=await api.bootstrap(teacher);c=boot.classes['8C3'];
  // RTDB omits empty topic arrays; a subsequent save must still work.
  const roundtrip=await api.putClass(teacher,'8C3',{revision:boot.revisions['8C3'],classData:c});
  const revision=roundtrip.revision;c=roundtrip.data;
  c.months['T11/2026'].schedule.S3={...morning};
  await assert.rejects(api.putClass(teacher,'8C3',{revision,classData:c}),e=>e.status===409);
  delete c.months['T11/2026'].schedule.S3;
  const before=structuredClone(c);
  for(const changes of [{date:'2026-12-18'},{date:'2026-11-31'},{session:'evening'},{planTime:'18/11/2026 · Sáng 10:00–11:00'}]) {
    c=structuredClone(before);Object.assign(c.months['T11/2026'].schedule.S1,changes);
    await assert.rejects(api.putClass(teacher,'8C3',{revision,classData:c}),e=>e.status===400);
  }
  const stored=(await api.bootstrap(teacher)).classes['8C3'].months['T11/2026'];
  assert.equal(Object.keys(stored.schedule).length,2);assert.equal(stored.meetings.length,0);assert.equal(stored.connections.length,0);
});

test('new M01 slots respect identifiable legacy appointments and preserve free text schedules',async()=>{
  const {api}=await fixture();let boot=await api.saveTeacher(admin,teacherInput),c=boot.classes['8C3'];
  c.students=['S1','S2','S3'].map(id=>({id,name:id,code:id}));
  c.months['T11/2026']={...emptyMonth(),schedule:{S1:{planTime:'18/11/2026 09:55-10:15'},S2:{planTime:'Tuần 3 tại lớp',goal:'Nội dung cũ'}}};
  let saved=await api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:c});
  c=saved.data;c.months['T11/2026'].schedule.S3={date:'2026-11-18',session:'morning',topics:[],planTime:'18/11/2026 · Sáng 9:55–10:15'};
  await assert.rejects(api.putClass(admin,'8C3',{revision:saved.revision,classData:c}),e=>e.status===409);
  assert.equal((await api.bootstrap(admin)).classes['8C3'].months['T11/2026'].schedule.S2.goal,'Nội dung cũ');
});

test('repeated bootstrap reads do not transact or change stored data',async()=>{
  const {db}=await fixture();
  const before=db.state();
  let writes=0;
  const api=createService({ref(path){const ref=db.ref(path);return {...ref,transaction(...args){writes++;return ref.transaction(...args);}};}});
  await api.bootstrap(admin);await api.bootstrap(admin);
  assert.equal(writes,0);assert.deepEqual(db.state(),before);
});

test('teacher editor cannot deactivate or downgrade the current Admin',async()=>{
  const {api}=await fixture();
  let boot=await api.saveTeacher(admin,{...teacherInput,email:admin.email,roles:['admin','gvcn']});
  const id=Object.keys(boot.teachers)[0];
  for(const changes of [{active:false},{roles:['gvcn']}]) {
    await assert.rejects(api.saveTeacher(admin,{...teacherInput,email:admin.email,id,roles:['admin','gvcn'],...changes}),e=>e.status===409);
  }
  boot=await api.bootstrap(admin);assert(boot.assignment.roles.includes('admin'));
});

test('BGH combined roles receive personal data only within their detailed scope',async()=>{
  const {api}=await fixture();
  let boot=await api.saveTeacher(admin,{...teacherInput,roles:['bgh','gvcn','lead'],grades:['8']});
  for(const id of ['6A1','8C2','8C3']) {
    const c=boot.classes[id];c.students=[{id:'S1',name:'PRIVATE-'+id,code:''}];
    boot={...boot};
    await api.putClass(admin,id,{classData:c,revision:boot.revisions[id]});
  }
  const result=await api.bootstrap(teacher);
  assert.equal(result.classes['8C3'].students.length,1);
  assert.equal(result.classes['8C2'].students.length,1);
  assert.equal(result.classes['6A1'].students.length,0);
  assert(!JSON.stringify(result).includes('PRIVATE-6A1'));
  assert(result.summaries['6A1']);
});

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

test('GVCN can also lead multiple grades while keeping edits limited to their own class',async()=>{
  const {api}=await fixture();
  let boot=await api.saveTeacher(admin,{...teacherInput,roles:['gvcn','lead'],grades:['10','11','12'],classId:'12C1'});
  const leadIdentity={...teacher,email:teacherInput.email};
  boot=await api.bootstrap(leadIdentity);
  assert.deepEqual(boot.assignment.roles,['gvcn','lead']);
  assert.deepEqual(boot.assignment.grades,['10','11','12']);
  assert.deepEqual(Object.keys(boot.classes).sort(),['10A1','10A2','10A3','10A4','11B1','11B2','12C1','12C2','12C3']);
  const own=boot.classes['12C1'];
  own.months['T11/2026']={...emptyMonth(),notes:{teacher:'Own class'}};
  await api.putClass(leadIdentity,'12C1',{classData:own,revision:boot.revisions['12C1']});
  const peer=boot.classes['12C2'];
  peer.months['T11/2026']={...emptyMonth(),notes:{teacher:'Other class'}};
  await assert.rejects(api.putClass(leadIdentity,'12C2',{classData:peer,revision:boot.revisions['12C2']}),e=>e.status===403);
});

test('a combined GVCN and lead cannot review its own submission but can review another class',async()=>{
  const {api}=await fixture();
  let boot=await api.saveTeacher(admin,{...teacherInput,roles:['gvcn','lead'],grades:['8']});
  const other={email:'other@vietanhschool.edu.vn',oid:'other-oid',name:'Other teacher'};
  boot=await api.saveTeacher(admin,{...teacherInput,id:undefined,name:other.name,email:other.email,classId:'8C2',roles:['gvcn'],grades:[]});
  const revision8C3=boot.revisions['8C3'],revision8C2=boot.revisions['8C2'];
  const populated=c=>{
    c.students=[{id:'S1',name:'Student',code:''}];
    c.months['T11/2026']={...emptyMonth(),schedule:{S1:{planTime:'01/11/2026'}},meetings:[
      {id:'R1',studentId:'S1',actual:'01/11/2026',concern:'A',participation:'B',progressEvidence:'Có',
        goal:'C',action:'D',cooperation:'Chưa cần',needsCoop:'Không',evidence:'EV1'}
    ]};
    return c;
  };
  let c=populated(boot.classes['8C3']);
  const saved8C3=await api.putClass(admin,'8C3',{classData:c,revision:revision8C3});
  c=populated(boot.classes['8C2']);
  await api.putClass(admin,'8C2',{classData:c,revision:revision8C2});
  await api.bootstrap(teacher);
  await api.bootstrap(other);
  let submitted=await api.transition(teacher,'8C3',{month:'T11/2026',target:'submitted',revision:saved8C3.revision});
  await assert.rejects(api.transition(teacher,'8C3',{month:'T11/2026',target:'reviewed',revision:submitted.revisions['8C3']}),e=>e.status===403);
  submitted=await api.transition(other,'8C2',{month:'T11/2026',target:'submitted',revision:submitted.revisions['8C2']});
  const reviewed=await api.transition(teacher,'8C2',{month:'T11/2026',target:'reviewed',revision:submitted.revisions['8C2']});
  assert.equal(reviewed.classes['8C2'].months['T11/2026'].approval.state,'reviewed');
});

test('Admin can atomically import teacher assignments and management roles without replacing class data',async()=>{
  const {api}=await fixture();
  let boot=await api.bootstrap(admin);
  const c=boot.classes['8C3'];
  c.students=[{id:'S1',name:'Existing student',code:'S1'}];
  await api.putClass(admin,'8C3',{classData:c,revision:boot.revisions['8C3']});
  boot=await api.importDirectory(admin,{
    teachers:[{...teacherInput,roles:['gvcn','lead'],grades:['8']}],
    users:[
      {name:'School leader',email:'bgh@vietanhschool.edu.vn',roles:['bgh'],grades:[]},
      {name:'Academic admin',email:'academic@vietanhschool.edu.vn',roles:['admin'],grades:[]}
    ]
  });
  assert.equal(boot.classes['8C3'].students[0].name,'Existing student');
  assert.deepEqual(boot.teachers[Object.keys(boot.teachers)[0]].classId,'8C3');
  assert.equal(boot.users.length,4);
  const lead=await api.bootstrap(teacher);
  assert.deepEqual(lead.assignment.roles,['gvcn','lead']);
  const bgh=await api.bootstrap({email:'bgh@vietanhschool.edu.vn',oid:'bgh-oid',name:'School leader'});
  assert.equal(Object.keys(bgh.classes).length,32);
  assert(!JSON.stringify(bgh).includes('Existing student'));
  const academic=await api.bootstrap({email:'academic@vietanhschool.edu.vn',oid:'academic-oid',name:'Academic admin'});
  assert.equal(academic.assignment.role,'admin');
  await assert.rejects(api.saveUserRoles(teacher,{email:'another@vietanhschool.edu.vn',name:'Other',roles:['admin'],grades:[]}),e=>e.status===403);
});

test('Admin role management cannot downgrade or deactivate the active Admin session',async()=>{
  const {api}=await fixture();
  await api.saveUserRoles(admin,{email:'bgh@vietanhschool.edu.vn',name:'School leader',roles:['bgh'],grades:[],active:true});
  await assert.rejects(api.saveUserRoles(admin,{id:admin.email,email:admin.email,name:admin.name,roles:['gvcn'],grades:[],active:true}),e=>e.status===409);
  await assert.rejects(api.saveUserRoles(admin,{id:admin.email,email:admin.email,name:admin.name,roles:['admin'],grades:[],active:false}),e=>e.status===409);
});

test('directory import validates all assignments before writing any and refuses conflicting classes',async()=>{
  const {db,api}=await fixture();
  const payload={teachers:[
    {...teacherInput,roles:['gvcn'],grades:[]},
    {...teacherInput,name:'Second teacher',email:'second@vietanhschool.edu.vn'}
  ],users:[]};
  await assert.rejects(api.importDirectory(admin,payload),e=>e.status===400);
  assert.equal(Object.keys(db.state().teachers||{}).length,0);
  assert.equal(Object.keys(db.state().users||{}).length,1);
  await api.saveTeacher(admin,teacherInput);
  await assert.rejects(api.importDirectory(admin,{teachers:[{...teacherInput,name:'Another teacher',email:'other@vietanhschool.edu.vn'}],users:[]}),e=>e.status===409);
  assert.equal(Object.values(db.state().teachers).length,1);
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

test('Admin can add edit and delete all five form types in approved reports across classes',async()=>{
  const {api}=await fixture();
  for(const id of ['6A1','8C3','12C3']){
    const c=blankClass(id);c.students=[{id:'S1',name:'Student',code:''}];
    c.months['T11/2026']={...emptyMonth(),approval:{state:'approved',history:[]}};
    let saved=await api.putClass(admin,id,{classData:c,revision:0},true);
    let data=structuredClone(saved.data),m=data.months['T11/2026'];
    m.schedule.S1={planTime:'Tuần 3',goal:'Mục tiêu'};
    m.meetings=[{id:'R1',studentId:'S1'}];m.connections=[{id:'C1',studentId:'S1'}];m.plans=[{id:'P1',studentId:'S1'}];
    data.profiles=[{id:'F1',studentId:'S1',code:'F1',startMonth:'T11/2026',goal:'Goal'}];
    saved=await api.putClass(admin,id,{classData:data,revision:saved.revision});
    data=structuredClone(saved.data);data.months['T11/2026'].meetings[0].concern='Updated';data.profiles[0].goal='Updated';
    saved=await api.putClass(admin,id,{classData:data,revision:saved.revision});
    data=structuredClone(saved.data);m=data.months['T11/2026'];m.schedule={};m.meetings=[];m.connections=[];m.plans=[];data.profiles=[];
    saved=await api.putClass(admin,id,{classData:data,revision:saved.revision});
    assert.equal(saved.data.months['T11/2026'].approval.state,'approved');assert.equal(saved.data.profiles.length,0);
  }
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
