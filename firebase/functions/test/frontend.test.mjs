import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createService} from '../service.mjs';
import {memoryDatabase} from './helpers.mjs';
import {summary,validateReport} from '../model.mjs';

const projectRoot=new URL('../../../',import.meta.url);
const entryHtml=fs.readFileSync(new URL('index.html',projectRoot),'utf8');
const scripts=[...entryHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map(m=>/\bsrc="([^"]+)"/.exec(m[1])?.[1]).filter(src=>src&&!/^https?:/.test(src))
  .map(src=>({path:src,code:fs.readFileSync(new URL(src,projectRoot),'utf8')}));
const source=entryHtml+'\n'+scripts.map(s=>s.code).join('\n');
const admin={email:'lammt@vietanhschool.edu.vn',oid:'11111111-1111-1111-1111-111111111111',name:'Admin'};
test('dashboard support filters and manual rescheduling retain appointment content and exclude holidays',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student 1',code:''}];mdata().schedule.S1={appointments:[{id:'A1',date:'2026-11-02',session:'morning',planTime:'02/11/2026 · Sáng 9:55–10:15',goal:'Vở ghi',topics:['Vở ghi'],note:'Keep note'}]};
    appData.calendar={excludedDates:['2026-11-20'],excludedSessions:[{date:'2026-11-19',session:'morning'}]};openStudentAppointment('S1','A1')`);
  assert.equal(f.run(`scheduleAvailable('2026-11-20','afternoon')`),false);
  assert.equal(f.run(`scheduleAvailable('2026-11-19','morning')`),false);
  assert.equal(f.run(`scheduleAvailable('2026-11-19','afternoon')`),true);
  f.ctx.fields={date:'2026-11-19',session:'afternoon',topics:['Vở ghi'],note:'Keep note'};
  await f.run('submitForm({preventDefault(){},currentTarget:fields})');
  assert.equal(f.run(`studentAppointments(cls(),ui.month,'S1')[0].id`),'A1');
  assert.equal(f.run(`studentAppointments(cls(),ui.month,'S1')[0].note`),'Keep note');
  f.run(`ui.dashboardFilter='unsubmitted'`);assert(f.run(`dashboardMatches({state:'draft'})`));assert(!f.run(`dashboardMatches({state:'submitted'})`));
  f.run(`ui.dashboardFilter='overdue'`);assert(f.run(`dashboardMatches({overdueAppointments:1})`));assert(!f.run(`dashboardMatches({overdueAppointments:0})`));
  f.run(`ui.dashboardFilter='coordination'`);assert(f.run(`dashboardMatches({coordination:1})`));
});

test('automatic schedules exclude only the selected session and keep the other session available',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=Array.from({length:30},(_,i)=>({id:'S'+i,name:'Student '+i}));appData.calendar={excludedDates:['2026-11-04'],excludedSessions:[{date:'2026-11-02',session:'morning'},{date:'2026-11-03',session:'afternoon'}],revision:1};
    globalThis.result=buildAutomaticSchedule();globalThis.slots=monthlyAppointments(result.classData);`);
  assert(!f.run(`slots.some(a=>a.date==='2026-11-02'&&a.session==='morning')`));
  assert(f.run(`slots.some(a=>a.date==='2026-11-02'&&a.session==='afternoon')`));
  assert(f.run(`slots.some(a=>a.date==='2026-11-03'&&a.session==='morning')`));
  assert(!f.run(`slots.some(a=>a.date==='2026-11-03'&&a.session==='afternoon')`));
  assert(!f.run(`slots.some(a=>a.date==='2026-11-04')`));
  assert.equal(f.run('mdata().meetings.length'),0);
});

test('Admin can toggle from whole-day holiday to afternoon-only, clear it, and save a morning holiday',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  await api.saveCalendar(admin,{excludedDates:['2026-11-20'],revision:0});await f.run('refreshCloud(true)');
  f.run(`navTo('calendar');selectCalendarSession('morning');toggleExcludedDate('2026-11-20')`);
  assert.equal(f.run(`calendarDayLabel(calendarDraft(),'2026-11-20')`),'Nghỉ chiều');
  f.run(`selectCalendarSession('afternoon');toggleExcludedDate('2026-11-20')`);
  assert.equal(f.run(`calendarDayLabel(calendarDraft(),'2026-11-20')`),'');
  f.run(`selectCalendarSession('all');toggleExcludedDate('2026-11-20');selectCalendarSession('morning');toggleExcludedDate('2026-11-19')`);
  await f.run('saveSchoolCalendar()');
  const calendar=(await api.bootstrap(admin)).calendar;
  assert.deepEqual(calendar.excludedDates,['2026-11-20']);
  assert.deepEqual(calendar.excludedSessions,[{date:'2026-11-19',session:'morning'}]);
});

test('older API capability is checked before writing half-day settings',async()=>{
  const f=frontend({api:createService(memoryDatabase())});await f.login();
  f.run(`delete appData.calendar.supportsSessions;navTo('calendar');selectCalendarSession('morning');toggleExcludedDate('2026-11-19')`);
  let requests=0;f.ctx.fetch=async()=>{requests++;throw Error('must not write');};
  await f.run('saveSchoolCalendar()');assert.equal(requests,0);
  assert.equal(f.run('calendarDraft().sessions.length'),1);
});
test('calendar saves globally, automatic scheduling reads fresh exclusions and keeps existing visits',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`cls().students=Array.from({length:30},(_,i)=>({id:'S'+i,name:'Student '+i}));save()`);await f.run('flushCloud()');
  await api.saveCalendar(admin,{excludedDates:['2026-11-02','2026-11-03'],revision:0});
  assert.equal(f.run('schoolCalendar().excludedDates.length'),0);
  await f.run('autoScheduleMonth()');
  assert(f.run(`monthlyAppointments().every(a=>!['2026-11-02','2026-11-03'].includes(a.date))`));
  assert.equal(f.run('summarize(cls(),ui.month).meetings'),0);
  await f.run('flushCloud()');const original=f.run('JSON.stringify(mdata().schedule)');
  f.run(`navTo('calendar');toggleExcludedDate('2026-11-04')`);
  assert.equal(f.run(`schoolCalendar().excludedDates.includes('2026-11-04')`),false);
  await f.run('saveSchoolCalendar()');
  assert((await api.bootstrap(admin)).calendar.excludedDates.includes('2026-11-04'));
  assert.equal(f.run('JSON.stringify(mdata().schedule)'),original);
  await f.run('autoScheduleMonth()');
  assert.equal(f.run('JSON.stringify(mdata().schedule)'),original);
});

test('calendar navigation is Admin-only and drafts cannot cross accounts',async()=>{
  const f=frontend();await f.login();f.run(`navTo('calendar');toggleExcludedDate('2026-11-20')`);
  assert(f.el('nav').innerHTML.includes("navTo('calendar')"));assert.equal(f.run('calendarDirty()'),true);
  f.run(`auth.email='another@vietanhschool.edu.vn';render()`);assert.equal(f.run('calendarDraft().dates.length'),0);
  f.run(`auth.assignment={role:'gvcn',roles:['gvcn'],classId:'6A1'};navTo('calendar')`);
  assert.equal(f.run('ui.page'),'dashboard');assert(!f.el('nav').innerHTML.includes("navTo('calendar')"));
});
test('header shows the signed-in teacher name and keeps it while previewing another role/class',async()=>{
  const f=frontend();await f.login();
  f.run(`auth.account.name='Mai Thư Lâm';appData.classes['8C3'].teacher='Another teacher';ui.classId='8C3';render()`);
  assert.equal(f.el('identityLabel').textContent,'Mai Thư Lâm');
  f.run(`setRolePreview('gvcn','8C3')`);assert.equal(f.el('identityLabel').textContent,'Mai Thư Lâm');
  assert.equal(f.el('accountMenu').hidden,true);
});
test('quick meeting saves before moving to the next appointment and survives background acknowledgement',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`cls().students=[{id:'S1',name:'First'},{id:'S2',name:'Second'}];
    mdata().schedule={S1:{appointments:[{id:'A1',date:'2026-11-18',session:'morning',planTime:'18/11/2026 · Sáng 9:55–10:15'}]},S2:{appointments:[{id:'A2',date:'2026-11-18',session:'afternoon',planTime:'18/11/2026 · Chiều 15:00–15:20'}]}};
    for(const sid of ['S1','S2'])mdata().schedule[sid]=appointmentRollup({},mdata().schedule[sid].appointments);save()`);
  await f.run('flushCloud()');f.run(`openScheduledMeeting('S1','A1')`);
  f.ctx.input={...completeMeeting,profileId:'',profileProgress:'',profileNext:''};
  await f.run(`submitForm({preventDefault(){},currentTarget:input,submitter:{id:'modalSaveNext'}})`);
  assert.equal(f.run('mdata().meetings.length'),1);
  assert.equal(f.run('ui.editing.seed.studentId'),'S2');assert.equal(f.run('ui.editing.seed.appointmentId'),'A2');
  assert.equal(f.run('ui.editing.seed.actualDateTime'),'2026-11-18T15:00');
  assert(!f.el('modalBody').innerHTML.includes('>'+completeMeeting.participation+'</textarea>'));
  await f.run('flushCloud()');assert.equal(f.run('editorContextCurrent()'),true);
  assert.equal((await api.bootstrap(admin)).classes['6A1'].months['T11/2026'].meetings.length,1);
  f.ctx.input={...f.ctx.input,studentId:'S2'};
  f.run(`save=()=>false`);
  await f.run(`submitForm({preventDefault(){},currentTarget:input,submitter:{id:'modalSaveNext'}})`);
  assert.equal(f.run('mdata().meetings.length'),1);assert.equal(f.run('ui.editing.seed.studentId'),'S2');
});

test('personal suggestion templates exclude observations and are isolated by teacher account',async()=>{
  const f=frontend();await f.login();f.run(`cls().students=[{id:'S1',name:'First'}];openModal('m02','',{studentId:'S1'})`);
  Object.assign(f.el('entryForm'),{concern:'Study routine',action:'Review next week',goal1:'Finish tasks',goalAmount1:'1',goalUnit1:'week',
    participation:'Private observation',progressEvidence:'Có',studentId:'S1',actualDateTime:'2026-11-18T09:55'});
  await f.run('saveMeetingTemplate()');
  const templates=JSON.parse(f.run('JSON.stringify(personalMeetingTemplates())'));
  assert.equal(templates.length,1);assert.equal(templates[0].goals[0].text,'Finish tasks');
  assert(!JSON.stringify(templates).includes('Private observation'));assert(!JSON.stringify(templates).includes('S1'));
  assert.equal(f.run('mdata().meetings.length'),0);
  f.run(`auth.email='other@vietanhschool.edu.vn'`);assert.equal(f.run('personalMeetingTemplates().length'),0);
});

test('monthly-work page is retired and import/export navigation belongs only to Admin',async()=>{
  const f=frontend();await f.login();f.run('render()');
  assert(!f.run(`VIEW_LIST.some(([key])=>key==='work')`));
  const nav=f.el('nav').innerHTML;
  assert(nav.indexOf("navTo('export')")>nav.indexOf('class="admin-nav"'));
  f.run(`navTo('work')`);assert.equal(f.run('ui.page'),'m02');
  f.run(`auth.assignment={role:'gvcn',roles:['gvcn'],classId:'6A1'};navTo('export')`);
  assert.equal(f.run('ui.page'),'dashboard');assert(!f.el('nav').innerHTML.includes("navTo('export')"));
  assert(f.el('mobileNavLinks').innerHTML.includes("navTo('m02')"));
});
test('custom dialogs queue messages, cancel prompts and reject confirmations after context changes',async()=>{
  const f=frontend();await f.login();
  let result=f.run(`realDialogs.confirm('Delete this record?')`);
  assert(f.el('appDialog').open);assert.equal(f.el('appDialogMessage').textContent,'Delete this record?');
  assert.equal(f.el('appDialogCancel').hidden,false);
  f.run('finishAppDialog(false)');assert.equal(await result,false);
  result=f.run(`realDialogs.prompt('Reason?')`);
  f.el('appDialogInput').value='Review needed';f.run('finishAppDialog(true)');
  assert.equal(await result,'Review needed');
  result=f.run(`realDialogs.prompt('Cancel reason?')`);
  f.run('finishAppDialog(false)');assert.equal(await result,null);
  result=f.run(`realDialogs.confirm('Apply change?')`);
  f.run(`ui.month='T12/2026';finishAppDialog(true)`);assert.equal(await result,false);
  const first=f.run(`realDialogs.alert('First')`),second=f.run(`realDialogs.alert('Second')`);
  assert.equal(f.el('appDialogMessage').textContent,'First');
  f.run('finishAppDialog(true)');await first;
  assert.equal(f.el('appDialogMessage').textContent,'Second');
  f.run('finishAppDialog(true)');await second;
  result=f.run(`realDialogs.confirm('Pending logout')`);
  f.run('lockUi()');assert.equal(await result,false);assert(!f.el('appDialog').open);
});
test('GitHub Pages keeps its own login callback without redirecting or deleting local data',async()=>{
  const f=frontend(),before=[...f.memory.entries()];let target;
  Object.assign(f.ctx.location,{origin:'https://maithulammm.github.io',pathname:'/gvcnva2/index.html',search:'?code=private',hash:'#id_token=private',replace:url=>{target=url;}});
  f.run(`makeMsalClient=async()=>({handleRedirectPromise:async()=>null,getAllAccounts:()=>[]})`);
  await f.run('initializeMsLogin()');
  assert.equal(target,undefined);
  assert.equal(f.run('currentRedirectUri()'),'https://maithulammm.github.io/gvcnva2/index.html');
  assert.deepEqual([...f.memory.entries()],before);
  for(const [origin,pathname] of [['https://gvcnva2.lammt.workers.dev','/index.html'],['http://127.0.0.1:5500','/index.html'],['https://maithulammm.github.io','/another-project/index.html']]) {
    Object.assign(f.ctx.location,{origin,pathname});target=undefined;
    await f.run('initializeMsLogin()');assert.equal(target,undefined);
  }
});
test('meeting totals count repeated appointments, legacy plans and actual records independently',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'One'},{id:'S2',name:'Two'},{id:'S3',name:'Three'}];
    mdata().schedule={S1:{appointments:[{id:'A1'},{id:'A2'},{id:'A3'}]},S2:{planTime:'Legacy date'},S3:{appointments:[],planTime:'Old text'}};
    mdata().meetings=[{id:'R1',studentId:'S1'},{id:'R2',studentId:'S1'}];`);
  const c=JSON.parse(f.run('JSON.stringify(cls())')),s=summary(c,'T11/2026');
  assert.equal(s.plannedMeetings,4);assert.equal(s.meetings,2);assert.equal(s.met,1);
  assert.equal(f.run('summarize(cls(),ui.month).plannedMeetings'),4);
  assert.match(f.run('renderDashboard()'),/2\/4/);
  f.run(`cloud.ready=true;cloud.summaries[ui.classId]={[ui.month]:${JSON.stringify(s)}}`);
  assert.match(f.run('renderDashboard()'),/2\/4/);
  assert.equal(f.run('summarize(cls(),ui.month).met'),1);
});

test('daily work and filters use actual links and own device drafts without changing reports',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'One'},{id:'S2',name:'Two'}];
    mdata().schedule={S1:{appointments:[{id:'A1',date:'2026-11-17',session:'morning'},{id:'A2',date:'2026-11-18',session:'morning'}]},S2:{appointments:[{id:'A3',date:'2026-11-18',session:'afternoon'}]}};
    mdata().meetings=[{id:'R1',studentId:'S1',appointmentId:'A2'}];
    workToday=()=> '2026-11-18';navTo('work');`);
  const before=f.run('JSON.stringify(summarize(cls(),ui.month))');
  assert.match(f.run('renderMonthlyWork()'),/Hôm nay/);
  assert.match(f.run('renderTodayWork(cls(),true)'),/Đã ghi nhận/);
  assert.deepEqual(Array.from(f.run(`workStudentFlags(cls(),ui.month,'S1')`)),['unconnected','today','overdue']);
  assert.deepEqual(Array.from(f.run(`workStudentFlags(cls(),ui.month,'S2')`)),['unmet','unconnected','today']);
  f.run(`openModal('m03','',{studentId:'S2'});saveEditorDraft({studentId:'S2',message:'Draft parent contact'});`);
  assert.equal(f.run('monthlyWorkDrafts().length'),1);
  const key=f.run('monthlyWorkDrafts()[0].key');
  f.memory.set(key.replace(encodeURIComponent(admin.email),'other%40vietanhschool.edu.vn'),f.memory.get(key));
  assert.equal(f.run('monthlyWorkDrafts().length'),1);
  f.run(`openMonthlyDraft(0)`);
  assert.equal(f.run('ui.editing.seed.studentId'),'S2');
  assert.match(f.el('modalBody').innerHTML,/Draft parent contact/);
  assert.equal(f.run('JSON.stringify(summarize(cls(),ui.month))'),before);
  f.run(`ui.month='T12/2026'`);assert.equal(f.run('monthlyWorkDrafts().length'),0);
});

test('previous meeting reference excludes current and future entries and never copies observations',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'One'}];
    mdata(cls(),'T10/2026').meetings=[{id:'OLD',studentId:'S1',actualDateTime:'2026-10-20T09:55',goal:'Old goal',action:'Review homework',participation:'Previous observation'}];
    mdata().meetings=[{id:'CURRENT',studentId:'S1',actualDateTime:'2026-11-18T09:55',goal:'Current goal'},{id:'FUTURE',studentId:'S1',actualDateTime:'2026-11-20T15:00'}];`);
  assert.equal(f.run(`previousMeetingFor(cls(),'S1',ui.month,'CURRENT','2026-11-18T09:55').record.id`),'OLD');
  f.run(`openModal('m02','CURRENT')`);
  assert.match(f.el('modalBody').innerHTML,/Review homework/);
  assert(!f.el('modalBody').innerHTML.includes('>Previous observation</textarea>'));
  assert.equal(f.run('mdata().meetings.length'),2);
});
test('forms omit evidence/student-code columns and allow complete linked reports without evidence codes',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:'OLD-CODE'}];cls().profiles=[{id:'P1',studentId:'S1',code:'P01',startMonth:ui.month,strength:'A',concern:'B',goal:'C'}];save()`);
  await f.run('flushCloud()');f.run(`openModal('m02')`);
  assert(!f.el('modalBody').innerHTML.includes('name="evidence"'));
  f.ctx.meeting={...completeMeeting};delete f.ctx.meeting.evidence;
  await f.run('submitForm({preventDefault(){},currentTarget:meeting})');
  f.run(`openModal('m03')`);assert(!f.el('modalBody').innerHTML.includes('name="evidence"'));
  await f.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1',date:'2026-11-18',channel:'Tin nhắn',message:'Chủ động học tập',recipient:'Mẹ',reply:'Đã gửi'}})`);
  await f.run('flushCloud()');
  const boot=await api.bootstrap(admin),c=boot.classes['6A1'],checks=validateReport(c,'T11/2026');
  assert.equal(checks.errors.length,0);assert.equal(checks.warnings.length,0);
  assert.equal(f.run('validations(cls(),ui.month).errors.length'),0);
  assert.equal(f.run('validations(cls(),ui.month).warnings.length'),0);
  assert(!f.run('renderStudents()').includes('<th>Mã học sinh</th>'));
  assert(!f.run('renderStudents()').includes('OLD-CODE'));
  assert(!f.run('renderM02()').includes('Mã minh chứng'));
  assert(!f.run('renderM03()').includes('<th>Minh chứng</th>'));
  assert(!f.run('renderM05()').includes('Mã HS xác nhận'));
  assert.equal(c.students[0].code,'OLD-CODE');
  c.months['T11/2026'].meetings[0].evidence='OLD-EVIDENCE';
  await api.putClass(admin,'6A1',{revision:boot.revisions['6A1'],classData:c});
  await f.run('refreshCloud(true)');
  f.run(`openModal('m02',mdata().meetings[0].id)`);
  await f.run('submitForm({preventDefault(){},currentTarget:meeting})');await f.run('flushCloud()');
  assert.equal((await api.bootstrap(admin)).classes['6A1'].months['T11/2026'].meetings[0].evidence,'OLD-EVIDENCE');
});
test('automatic saving and polling synchronize without showing the blocking loading screen',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`globalThis.loadingCalls=0;globalThis.originalLoading=beginPageLoading;
    beginPageLoading=(...args)=>{loadingCalls++;return originalLoading(...args);};
    cls().students.push({id:'S1',name:'Saved quietly',code:''});save()`);
  await f.run('flushCloud()');
  assert.equal((await api.bootstrap(admin)).classes['6A1'].students[0].name,'Saved quietly');
  await f.run('refreshCloud(true)');
  assert.equal(f.run('loadingCalls'),0);assert(!f.el('requestOverlay').open);
});
test('mobile menu preserves role scope, closes on navigation and clears after logout',async()=>{
  const f=frontend();await f.login();f.ctx.window.innerWidth=390;
  f.run(`auth.assignment={role:'gvcn',roles:['gvcn'],classId:'8C3'};ui.classId='8C3';render();openMobileNavigation()`);
  assert(f.el('mobileNav').open);assert(f.el('mobileNavLinks').innerHTML.includes("navTo('m02')"));
  assert(!f.el('mobileNavLinks').innerHTML.includes("navTo('users')"));
  assert.equal(f.el('mobileWorkButton').hidden,false);assert(f.bodyClasses.has('single-class-view'));
  f.run(`navTo('m02')`);assert(!f.el('mobileNav').open);
  f.run(`auth.assignment={role:'bgh',roles:['bgh']};render();openMobileNavigation()`);
  assert.equal(f.el('mobileWorkButton').hidden,true);
  assert(!f.el('mobileNavLinks').innerHTML.includes("navTo('work')"));
  f.run('lockUi()');assert(!f.el('mobileNav').open);assert.equal(f.el('mobileNavLinks').innerHTML,'');
});

test('roster and management navigation is grouped last and limited to effective Admin role',async()=>{
  const f=frontend();await f.login();f.run('render()');
  let nav=f.el('nav').innerHTML;
  assert(nav.includes('class="admin-nav"'));assert(nav.endsWith('</details>'));
  assert(nav.indexOf("navTo('students')")>nav.indexOf('class="admin-nav"'));
  for(const page of ['students','teachers','users','database']) {
    assert(nav.includes(`navTo('${page}')`));
    f.run(`navTo('${page}')`);assert.equal(f.run('ui.page'),page);
  }
  for(const role of ['gvcn','lead','bgh']) {
    f.run(`auth.assignment={role:'${role}',roles:['${role}'],classId:'8C3',grades:['8']};ui.classId='8C3';ui.grade='8';render()`);
    nav=f.el('nav').innerHTML;assert(!nav.includes('class="admin-nav"'));
    assert(!f.el('mobileNavLinks').innerHTML.includes('class="admin-nav"'));
    for(const page of ['students','teachers','users','database']) {
      assert(!nav.includes(`navTo('${page}')`));
      f.run(`navTo('${page}')`);assert.equal(f.run('ui.page'),'dashboard');
    }
  }
  f.run(`auth.assignment={role:'admin',roles:['admin']};setRolePreview('gvcn','8C3')`);
  assert(!f.el('nav').innerHTML.includes('class="admin-nav"'));
  f.run(`setRolePreview('')`);assert(f.el('nav').innerHTML.includes('class="admin-nav"'));
});
test('M02 shows a locale-independent 24-hour clock and rejects AM/PM or out-of-range hours',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];openWorkEntry('m02','S1')`);
  assert.match(f.el('modalBody').innerHTML,/type="text" name="actualTime"/);
  assert(!f.el('modalBody').innerHTML.includes('type="datetime-local"'));
  f.ctx.input={...completeMeeting,profileId:'',actualDateTime:'2026-11-18T09:55',actualDate:'2026-11-18',actualTime:'15:00',actualLocation:'Phòng 6A1'};
  f.run('saveEditorDraft(input);openWorkEntry("m02","S1")');
  assert.match(f.el('modalBody').innerHTML,/name="actualTime" value="15:00"/);
  for(const value of ['24:00','15:60','03:00 PM']) {
    f.ctx.input.actualTime=value;
    await f.run('submitForm({preventDefault(){},currentTarget:input})');
    assert.equal(f.run('mdata().meetings.length'),0);
  }
  f.ctx.input.actualTime='15:00';await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings[0].actualDateTime'),'2026-11-18T15:00');
  assert.equal(f.run('mdata().meetings[0].actual'),'18/11/2026 15:00 · Phòng 6A1');
  for(const value of ['00:00','23:59']) {
    f.run(`openWorkEntry('m02','S1')`);f.ctx.input.actualTime=value;
    await f.run('submitForm({preventDefault(){},currentTarget:input})');
    assert.equal(f.run('mdata().meetings.at(-1).actualDateTime'),'2026-11-18T'+value);
  }
});
test('requests wait for the complete JSON body then 2 seconds before the next request and loading dismissal',async()=>{
  const f=frontend({api:createService(memoryDatabase())});await f.login();
  const cooldowns=[];f.ctx.setTimeout=(fn,ms)=>{if(ms===2000)cooldowns.push(fn);return 1;};
  let finishBody,fetches=0;
  const body=new Promise(resolve=>{finishBody=resolve;});
  f.ctx.fetch=async()=>({ok:true,status:200,json:++fetches===1?()=>body:async()=>({second:true})});
  const first=f.run('databaseRequest("/first")'),second=f.run('databaseRequest("/second")');
  await new Promise(setImmediate);
  assert.equal(fetches,1);assert.equal(cooldowns.length,0);assert(f.el('requestOverlay').open);
  finishBody({first:true});await new Promise(setImmediate);
  assert.equal(cooldowns.length,1);assert.equal(fetches,1);assert(f.el('requestOverlay').open);
  cooldowns[0]();assert.deepEqual(await first,{first:true});await new Promise(setImmediate);
  assert.equal(fetches,2);assert.equal(cooldowns.length,2);assert(f.el('requestOverlay').open);
  cooldowns[1]();assert.deepEqual(await second,{second:true});
  assert(!f.el('requestOverlay').open);assert.equal(f.run('pageLoading.pending.size'),0);
});

test('a failed request releases loading and does not prevent the queued request from completing',async()=>{
  const f=frontend({api:createService(memoryDatabase())});await f.login();let requests=0;
  f.ctx.fetch=async()=>++requests===1?{ok:false,status:500,json:async()=>({error:'Server failed'})}:{ok:true,status:200,json:async()=>({ok:true})};
  const failed=f.run('databaseRequest("/first")'),next=f.run('databaseRequest("/second")');
  await assert.rejects(failed,/Server failed/);assert.deepEqual(await next,{ok:true});
  assert.equal(requests,2);assert(!f.el('requestOverlay').open);
});

test('changing session during the post-request delay discards the response and cancels old queued requests',async()=>{
  const f=frontend({api:createService(memoryDatabase())});await f.login();
  const cooldowns=[];let requests=0;
  f.ctx.setTimeout=(fn,ms)=>{if(ms===2000)cooldowns.push(fn);return 1;};
  f.ctx.fetch=async()=>{requests++;return {ok:true,status:200,json:async()=>({old:true})};};
  const first=f.run('databaseRequest("/old")'),queued=f.run('databaseRequest("/queued")');
  const firstRejected=assert.rejects(first,/Phiên làm việc đã thay đổi/),queuedRejected=assert.rejects(queued,/Phiên làm việc đã thay đổi/);
  await new Promise(setImmediate);assert.equal(cooldowns.length,1);
  f.run('lockUi()');cooldowns[0]();await Promise.all([firstRejected,queuedRejected]);
  assert.equal(requests,1);assert(!f.el('requestOverlay').open);
});
const rememberedAccount={username:admin.email,homeAccountId:'remembered-admin',tenantId:'22215a7f-b9e3-4b53-bd27-3a317311e6ca',idTokenClaims:{oid:admin.oid}};
async function restoreMicrosoft(f,{fresh=false,account=rememberedAccount}={}) {
  f.ctx.cachedAccount=account;
  f.run(`makeMsalClient=async()=>({handleRedirectPromise:async()=>(${fresh?'{account:cachedAccount}':'null'}),
    getAllAccounts:()=>[cachedAccount],setActiveAccount(account){this.active=account;},
    acquireTokenSilent:async()=>({idToken:'SYNTHETIC-RESTORED-TOKEN'})})`);
  await f.run('initializeMsLogin()');
}

test('verified Microsoft login is restored after reload for 30 days, but expired memory does not unlock the app',async()=>{
  const api=createService(memoryDatabase()),memory=new Map(),first=frontend({api,memory});
  await restoreMicrosoft(first,{fresh:true});assert(first.bodyClasses.has('auth-ready'));
  const key=first.run('LOGIN_REMEMBER_KEY'),saved=JSON.parse(memory.get(key));
  assert.deepEqual(Object.keys(saved).sort(),['accountId','email','expiresAt']);
  assert(saved.expiresAt>Date.now()+29*86400000);
  const second=frontend({api,memory});await restoreMicrosoft(second);
  assert(second.bodyClasses.has('auth-ready'));assert.equal(second.run('auth.client.active.homeAccountId'),'remembered-admin');
  assert.equal(JSON.parse(memory.get(key)).expiresAt,saved.expiresAt);
  memory.set(key,JSON.stringify({...saved,expiresAt:Date.now()-1}));
  const expired=frontend({api,memory});await restoreMicrosoft(expired);
  assert(!expired.bodyClasses.has('auth-ready'));assert.equal(expired.run('auth.account'),null);
});

test('logout clears remembering through MSAL, preserves work data and prevents cached sign-in on reload',async()=>{
  const api=createService(memoryDatabase()),memory=new Map(),f=frontend({api,memory});await restoreMicrosoft(f,{fresh:true});
  memory.set('VA_GVCN_MSAL_PROTOTYPE_DATA_V1','Keep original data');memory.set('VA_GVCN_FORM_DRAFT_V1_TEST','Keep draft');
  let logoutRequest;
  f.ctx.logoutCall=async request=>{logoutRequest=request;};
  f.run('auth.client.logoutRedirect=logoutCall');await f.run('logoutMicrosoft()');
  assert.equal(logoutRequest.account,undefined);assert.equal(logoutRequest.postLogoutRedirectUri,'http://127.0.0.1:5500/index.html');
  assert(!memory.has(f.run('LOGIN_REMEMBER_KEY')));assert(memory.has(f.run('LOGIN_SIGNED_OUT_KEY')));
  assert.equal(memory.get('VA_GVCN_MSAL_PROTOTYPE_DATA_V1'),'Keep original data');
  assert.equal(memory.get('VA_GVCN_FORM_DRAFT_V1_TEST'),'Keep draft');assert(!f.bodyClasses.has('auth-ready'));
  const next=frontend({api,memory});await restoreMicrosoft(next);assert(!next.bodyClasses.has('auth-ready'));
  await restoreMicrosoft(next,{fresh:true});assert(next.bodyClasses.has('auth-ready'));
  assert(!memory.has(next.run('LOGIN_SIGNED_OUT_KEY')));
});

test('logout failure and cross-tab logout still lock the UI and prevent remembered restoration',async()=>{
  const api=createService(memoryDatabase()),memory=new Map(),f=frontend({api,memory});await restoreMicrosoft(f,{fresh:true});
  f.run(`auth.client.logoutRedirect=async()=>{throw Error('Offline')}`);await f.run('logoutMicrosoft()');
  assert.equal(f.run('auth.account'),null);assert(memory.has(f.run('LOGIN_SIGNED_OUT_KEY')));
  const next=frontend({api,memory});await restoreMicrosoft(next);assert(!next.bodyClasses.has('auth-ready'));
  await restoreMicrosoft(next,{fresh:true});assert(next.bodyClasses.has('auth-ready'));
  next.run(`handleMicrosoftLogoutStorage({key:LOGIN_SIGNED_OUT_KEY,newValue:'logout'})`);
  assert.equal(next.run('auth.account'),null);assert(!next.bodyClasses.has('auth-ready'));
});

test('missing or expired ID tokens are silently renewed and empty bearer tokens never reach the API',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  for(const first of [{idToken:''},{idToken:'expired',idTokenClaims:{exp:1}}]) {
    const requests=[];f.ctx.tokenCall=async request=>{requests.push(request);return requests.length===1?first:{idToken:'renewed'};};
    f.run('auth.client.acquireTokenSilent=tokenCall');assert.equal(await f.run('acquireMicrosoftIdToken()'),'renewed');
    assert.equal(requests.length,2);assert.equal(requests[1].forceRefresh,true);
  }
  let fetches=0;f.ctx.fetch=async()=>{fetches++;throw Error('Should not fetch');};
  f.run(`auth.client.acquireTokenSilent=async()=>({idToken:''})`);
  await assert.rejects(f.run('databaseRequest("/bootstrap")'),e=>e.status===401);assert.equal(fetches,0);
});

test('automatic reauthentication is limited to one redirect and does not bypass explicit logout',async()=>{
  const f=frontend();await f.login();let redirects=0;
  f.ctx.redirectCall=async()=>{redirects++;};f.run('auth.client.acquireTokenRedirect=redirectCall');
  assert.equal(await f.run('recoverMicrosoftSession(auth.account)'),true);
  assert.equal(await f.run('recoverMicrosoftSession(auth.account)'),false);assert.equal(redirects,1);
  f.memory.delete(f.run('LOGIN_REAUTH_KEY'));f.memory.set(f.run('LOGIN_SIGNED_OUT_KEY'),'signed-out');
  assert.equal(await f.run('recoverMicrosoftSession(auth.account)'),false);assert.equal(redirects,1);
});
test('M02 prefills planned date and classroom, stores independent goal deadlines and preserves BGH progress semantics',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`ui.classId='8C3';ui.grade='8';cls().students=[{id:'S1',name:'Student',code:''}];
    mdata().schedule.S1={date:'2026-11-18',session:'morning',topics:['Vở ghi'],goal:'Vở ghi',planTime:'18/11/2026 · Sáng 9:55–10:15'};save()`);
  await f.run('flushCloud()');f.run(`openScheduledMeeting('S1','legacy-S1')`);
  assert.match(f.el('modalBody').innerHTML,/name="actualDateTime" value="2026-11-18T09:55"/);
  assert.match(f.el('modalBody').innerHTML,/name="actualLocation" value="Phòng 8C3"/);
  assert(!f.el('modalBody').innerHTML.includes('<select name="progressEvidence"'));
  for(const label of ['Chưa ghi nhận','Có tiến bộ','Chưa tiến bộ','Chưa đủ điều kiện so sánh'])assert(f.el('modalBody').innerHTML.includes(label));
  f.ctx.newMeeting={...completeMeeting,profileId:'',progressEvidence:'Có',actualDateTime:'2026-11-18T10:00',actualLocation:'Phòng tư vấn',
    goal1:'Nộp bài đúng hạn',goalAmount1:'2',goalUnit1:'day',goal2:'Chủ động hỏi bài',goalAmount2:'1',goalUnit2:'week',goal3:''};
  await f.run('submitForm({preventDefault(){},currentTarget:newMeeting})');await f.run('flushCloud()');
  const boot=await api.bootstrap(admin),c=boot.classes['8C3'],r=c.months['T11/2026'].meetings[0];
  assert.equal(r.actual,'18/11/2026 10:00 · Phòng tư vấn');
  assert.deepEqual(r.goals,[{position:1,text:'Nộp bài đúng hạn',amount:2,unit:'day'},{position:2,text:'Chủ động hỏi bài',amount:1,unit:'week'}]);
  assert.equal(r.goal,'1. Nộp bài đúng hạn (2 ngày)\n2. Chủ động hỏi bài (1 tuần)');
  assert.equal(summary(c,'T11/2026').improved,1);assert.equal(summary(c,'T11/2026').meetings,1);
  f.ctx.recordId=r.id;f.run('openModal("m02",recordId)');
  assert.match(f.el('modalBody').innerHTML,/name="actualDateTime" value="2026-11-18T10:00"/);
  assert(f.el('modalBody').innerHTML.includes('Nộp bài đúng hạn'));
  const invalid=structuredClone(c);invalid.months['T11/2026'].meetings[0].goals[0].amount=0;
  await assert.rejects(api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:invalid}),e=>e.status===400);
  const invalidTime=structuredClone(c);invalidTime.months['T11/2026'].meetings[0].actualDateTime='2026-11-31T10:00';
  await assert.rejects(api.putClass(admin,'8C3',{revision:boot.revisions['8C3'],classData:invalidTime}),e=>e.status===400);
  for(const [value] of f.run('PROGRESS_CHOICES')) {
    f.run(`mdata().meetings[0].progressEvidence=${JSON.stringify(value)}`);
    assert.equal(f.run('summarize(cls(),ui.month).improved'),value==='Có'?1:0);
  }
});

test('M02 drafts retain split time and three goals; invalid deadlines do not create a meeting',async()=>{
  const f=frontend();await f.login();f.run(`cls().students=[{id:'S1',name:'Student',code:''}];openWorkEntry('m02','S1')`);
  f.ctx.input={...completeMeeting,profileId:'',actualDateTime:'2026-11-19T15:00',actualLocation:'Phòng 6A1',
    goal1:'Goal one',goalAmount1:'1',goalUnit1:'week',goal2:'Goal two',goalAmount2:'3',goalUnit2:'day',goal3:'Goal three',goalAmount3:'2',goalUnit3:'week'};
  f.run('saveEditorDraft(input);openWorkEntry("m02","S1")');
  assert.match(f.el('modalBody').innerHTML,/name="actualDateTime" value="2026-11-19T15:00"/);
  assert(f.el('modalBody').innerHTML.includes('Goal three'));
  f.ctx.input.goalAmount1='0';await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings.length'),0);assert(f.el('editor').open);
  f.ctx.input.goalAmount1='1';await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings[0].goals.length'),3);
});

test('editing untouched legacy M02 time and goal preserves original text without inventing deadlines',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];mdata().meetings=[{id:'OLD',studentId:'S1',actual:'Thứ 4 tuần 2 · Phòng cũ',goal:'Mục tiêu cũ chưa ghi thời hạn'}];openModal('m02','OLD')`);
  const values=JSON.parse(f.run('JSON.stringify(meetingEditorValues(lookup("m02","OLD")))'));
  f.ctx.input={...completeMeeting,profileId:'',actual:'Thứ 4 tuần 2 · Phòng cũ',goal:'Mục tiêu cũ chưa ghi thời hạn',...values};
  await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings[0].actual'),'Thứ 4 tuần 2 · Phòng cũ');
  assert.equal(f.run('mdata().meetings[0].goal'),'Mục tiêu cũ chưa ghi thời hạn');
  assert.equal(f.run('mdata().meetings[0].goals'),undefined);
});
test('automatic scheduling follows roster order, weekdays and grade-12 Saturday mornings',async()=>{
  const f=frontend();await f.login();
  f.run(`ui.month='T02/2027';cls().students=Array.from({length:20},(_,i)=>({id:'S'+i,name:'Student '+i,code:''}));`);
  const before=f.run('JSON.stringify(cls())');
  f.run('globalThis.autoResult=buildAutomaticSchedule()');
  assert.equal(f.run('JSON.stringify(cls())'),before);
  assert.equal(f.run('autoResult.added'),40);
  const ordered=JSON.parse(f.run('JSON.stringify(monthlyAppointments(autoResult.classData,ui.month))'));
  assert.deepEqual(ordered.slice(0,3).map(a=>[a.studentId,a.date,a.session]),[['S0','2027-02-01','morning'],['S1','2027-02-01','afternoon'],['S2','2027-02-02','morning']]);
  assert(f.run(`autoResult.classData.students.every(s=>studentAppointments(autoResult.classData,ui.month,s.id).length===2)`));
  assert.equal(f.run('buildAutomaticSchedule(autoResult.classData,ui.month).added'),0);
  f.run(`ui.classId='12C1';ui.grade='12';cls().students=Array.from({length:20},(_,i)=>({id:'S'+i,name:'Student '+i,code:''}));globalThis.auto12=buildAutomaticSchedule()`);
  assert.equal(f.run('auto12.added'),44);
  const saturday=JSON.parse(f.run(`JSON.stringify(monthlyAppointments(auto12.classData,ui.month).filter(a=>new Date(a.date+'T12:00:00').getDay()===6))`));
  assert.equal(saturday.length,4);assert(saturday.every(a=>a.session==='morning'));
  assert(f.run(`monthlyAppointments(auto12.classData,ui.month).every(a=>new Date(a.date+'T12:00:00').getDay()!==0)`));
  f.run(`cls().students=cls().students.slice(0,8);globalThis.small=buildAutomaticSchedule()`);
  assert.equal(f.run('small.added'),24);
  assert(f.run(`small.classData.students.every(s=>studentAppointments(small.classData,ui.month,s.id).length===3)`));
});

test('manual multiple appointments preserve each visit and reject a fourth or a second same-day visit',async()=>{
  const f=frontend();await f.login();f.run(`cls().students=[{id:'S1',name:'Student',code:''}]`);
  for(const date of ['2026-11-18','2026-11-19','2026-11-20']) {
    f.run(`openStudentAppointment('S1')`);
    f.ctx.appointment={date,session:'morning',topics:['Vở ghi'],note:date};
    await f.run('submitForm({preventDefault(){},currentTarget:appointment})');
  }
  assert.equal(f.run(`studentAppointments(cls(),ui.month,'S1').length`),3);
  f.run(`openStudentAppointment('S1')`);assert.equal(f.run('ui.editing'),null);
  const first=f.run(`studentAppointments(cls(),ui.month,'S1')[0].id`);
  f.ctx.firstAppointmentId=first;f.run(`openStudentAppointment('S1',firstAppointmentId)`);
  f.ctx.appointment={date:'2026-11-19',session:'afternoon',topics:[],note:'Conflict'};
  await f.run('submitForm({preventDefault(){},currentTarget:appointment})');
  assert(f.alerts.some(x=>x.includes('hai học sinh khác nhau')));
  assert.equal(f.run(`studentAppointments(cls(),ui.month,'S1')[0].date`),'2026-11-18');
});

test('automatic scheduling preserves existing appointments and warns when two visits per student cannot fit',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`ui.month='T02/2027';cls().students=Array.from({length:35},(_,i)=>({id:'S'+i,name:'Student '+i,code:''}));
    mdata().schedule.S0={date:'2027-02-02',session:'morning',planTime:'02/02/2027 · Sáng 9:55–10:15',goal:'Existing goal',note:'Keep me'};save()`);
  await f.run('flushCloud()');
  const original=f.run('JSON.stringify(mdata().schedule.S0)');let message='';
  f.ctx.confirm=text=>{message=text;return false;};await f.run('autoScheduleMonth()');
  assert(message.includes('chưa đủ 2 lượt'));
  assert.equal(f.run('JSON.stringify(mdata().schedule.S0)'),original);
  f.ctx.confirm=()=>true;await f.run('autoScheduleMonth()');await f.run('flushCloud()');
  const existing=f.run(`studentAppointments(cls(),ui.month,'S0').find(a=>a.id==='legacy-S0')`);
  assert.equal(existing.goal,'Existing goal');assert.equal(existing.note,'Keep me');
  assert.equal(f.run('monthlyAppointments().length'),40);
  assert.equal(f.run('summarize(cls(),ui.month).meetings'),0);
  const before=f.run('JSON.stringify(mdata())');await f.run('autoScheduleMonth()');
  assert.equal(f.run('JSON.stringify(mdata())'),before);
});

test('auto appointments appear in M02 without actual counts; confirmation links exactly one real meeting',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  await f.run(`cls().students=[{id:'S1',name:'Student 1',code:''},{id:'S2',name:'Student 2',code:''}];autoScheduleMonth()`);
  await f.run('flushCloud()');
  assert.equal(f.run('monthlyAppointments().length'),6);
  assert.equal(f.run('summarize(cls(),ui.month).meetings'),0);
  f.run(`navTo('m02')`);assert(f.el('view').innerHTML.includes('Lịch gặp dự kiến từ Mẫu 1'));
  const appointmentId=f.run(`studentAppointments(cls(),ui.month,'S1')[0].id`);
  f.ctx.appointmentId=appointmentId;
  f.run(`openScheduledMeeting('S1',appointmentId)`);
  f.ctx.completed={...completeMeeting,profileId:'',actual:'2026-11-02 · Lớp'};
  await f.run('submitForm({preventDefault(){},currentTarget:completed})');
  await f.run('flushCloud()');
  const c=(await api.bootstrap(admin)).classes['6A1'];
  assert.equal(c.months['T11/2026'].meetings.length,1);
  assert.equal(c.months['T11/2026'].meetings[0].appointmentId,appointmentId);
  assert.equal(summary(c,'T11/2026').met,1);assert.equal(summary(c,'T11/2026').connections,0);
  f.run(`openScheduledMeeting('S1',appointmentId)`);
  await f.run('submitForm({preventDefault(){},currentTarget:completed})');
  assert.equal(f.run('mdata().meetings.length'),1);
  assert.equal((f.run('renderPendingMeetings(cls(),mdata())').match(/Ghi nhận đã gặp/g)||[]).length,5);
});
test('M01 deletes only the edited appointment and persists remaining visits without changing actual meetings',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  await f.run(`cls().students=[{id:'S1',name:'Student 1',code:''},{id:'S2',name:'Student 2',code:''}];autoScheduleMonth();flushCloud()`);
  const before=JSON.parse(f.run('JSON.stringify(mdata())'));
  const visits=before.schedule.S1.appointments;
  f.ctx.appointmentId=visits[1].id;
  f.run(`openStudentAppointment('S1',appointmentId)`);
  assert(f.el('modalBody').innerHTML.includes('Xóa lịch lần 2'));
  assert(!f.run('renderM01()').includes('removeAppointment('));
  await f.run('removeEditedAppointment();');await f.run('flushCloud()');
  assert.equal(f.run('ui.editing'),null);assert.equal(f.el('editor').open,false);
  const after=(await api.bootstrap(admin)).classes['6A1'].months['T11/2026'];
  assert.deepEqual(after.schedule.S1.appointments,visits.filter(a=>a.id!==visits[1].id));
  assert.deepEqual(after.schedule.S2,before.schedule.S2);
  assert.deepEqual(after.meetings,before.meetings);
  assert.equal(after.schedule.S1.planTime,after.schedule.S1.appointments.map(a=>a.planTime).join('\n'));
  for(const a of after.schedule.S1.appointments){
    f.ctx.appointmentId=a.id;
    f.run(`openStudentAppointment('S1',appointmentId)`);await f.run('removeEditedAppointment()');await f.run('flushCloud()');
  }
  assert.equal(f.run(`studentAppointments(cls(),ui.month,'S1').length`),0);
  assert.equal((await api.bootstrap(admin)).classes['6A1'].months['T11/2026'].schedule.S1.planTime,'');
});

test('M01 cancellation, storage failure, changed context and actual links protect appointment data',async()=>{
  const f=frontend();await f.login();
  await f.run(`cls().students=[{id:'S1',name:'Student 1',code:''}];autoScheduleMonth()`);
  const original=f.run('JSON.stringify(mdata())');
  f.run(`globalThis.target=studentAppointments(cls(),ui.month,'S1')[1].id;openStudentAppointment('S1',target)`);
  f.ctx.confirm=()=>false;await f.run('removeEditedAppointment()');
  assert.equal(f.run('JSON.stringify(mdata())'),original);assert(f.el('editor').open);
  f.ctx.confirm=()=>true;
  f.run('globalThis.originalSave=save;save=()=>false');await f.run('removeEditedAppointment()');
  assert.equal(f.run('JSON.stringify(mdata())'),original);assert(f.el('editor').open);
  f.run(`save=originalSave;mdata().meetings.push({id:'R1',studentId:'S1',appointmentId:target});openStudentAppointment('S1',target)`);
  assert(!f.el('modalBody').innerHTML.includes('id="deleteAppointmentButton"'));
  await f.run('removeEditedAppointment()');assert.equal(f.run(`studentAppointments(cls(),ui.month,'S1').length`),3);
  assert(f.alerts.some(s=>s.includes('không thể xóa')));
  f.run(`mdata().meetings=[];openStudentAppointment('S1',target)`);
  f.ctx.confirm=()=>{f.run(`ui.month='T12/2026'`);return true;};
  await f.run('removeEditedAppointment()');
  assert.equal(f.run(`studentAppointments(cls(),'T11/2026','S1').length`),3);
});

test('M01 uses the real monthly calendar and click choices, preserving legacy data and draft topics',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''},{id:'S2',name:'Other',code:''}];
    mdata().schedule.S1={priority:true,goal:'Mục tiêu cũ',status:'Hẹn lại',planTime:'Tuần 3',note:'Ghi chú cũ'};
    openModal('m01','S1')`);
  assert(!f.el('modalBody').innerHTML.includes('<select'));
  assert.equal(f.run(`scheduleMonthDates('T11/2026').length`),30);
  assert.equal(f.run(`scheduleMonthDates('T02/2027').length`),28);
  assert.equal(f.run(`scheduleMonthDates('T10/2026').length`),31);
  assert.equal((f.el('modalBody').innerHTML.match(/class="calendar-day"/g)||[]).length,30);
  f.ctx.appointment={date:'2026-11-18',session:'morning',topics:['Vở ghi','Học sinh chia sẻ'],note:'Ghi chú mới'};
  f.run('saveEditorDraft(appointment)');f.run(`openModal('m01','S1')`);
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(ui.editing.schedule.topics)')),['Vở ghi','Học sinh chia sẻ']);
  await f.run('submitForm({preventDefault(){},currentTarget:appointment})');
  assert.equal(f.run('mdata().schedule.S1.priority'),true);
  assert.equal(f.run('mdata().schedule.S1.status'),'Hẹn lại');
  assert.equal(f.run('mdata().schedule.S1.goal'),'Mục tiêu cũ · Vở ghi · Học sinh chia sẻ');
  assert.equal(f.run('mdata().schedule.S1.planTime'),'18/11/2026 · Sáng 9:55–10:15');
  assert.equal(f.run('summarize(cls(),ui.month).met'),0);
  assert.equal(f.run('summarize(cls(),ui.month).planned'),1);
  f.run(`openModal('m01','S2')`);
  await f.run('submitForm({preventDefault(){},currentTarget:appointment})');
  assert.equal(f.run('mdata().schedule.S2'),undefined);
  assert(f.alerts.some(x=>x.includes('đã hẹn')));
});
const completeMeeting={studentId:'S1',actual:'2026-11-10 · Phòng học',concern:'Học tập',participation:'Chủ động',
  progressEvidence:'Chưa đủ căn cứ',goal:'Mục tiêu',action:'Rà soát tuần sau',needsCoop:'Không',cooperation:'Chưa cần',
  evidence:'EV01',profileId:'P1',profileProgress:'Đã xác định khó khăn',profileNext:'2026-11-20'};

test('monthly work and original editor produce identical BGH totals and validation results',async()=>{
  const results=[];
  for(const quick of [false,true]) {
    const api=createService(memoryDatabase()),f=frontend({api});await f.login();
    f.run(`cls().students=[{id:'S1',name:'Student',code:'HS01'}];
      cls().profiles=[{id:'P1',studentId:'S1',code:'P01',startMonth:ui.month,strength:'A',concern:'B',goal:'C'}];
      mdata().schedule.S1={goal:'Mục tiêu',planTime:'2026-11-10'};save()`);
    await f.run('flushCloud()');
    const originalSummary=f.run('JSON.stringify(summarize(cls(),ui.month))');
    f.run(`navTo('work')`);
    assert.equal(f.run('ui.page'),'m02');assert(f.el('view').innerHTML.includes('Sổ ghi lượt gặp thực tế'));
    if(quick) f.run(`openWorkEntry('m02','S1')`);else f.run(`openModal('m02')`);
    assert.equal(f.run('JSON.stringify(summarize(cls(),ui.month))'),originalSummary);
    f.ctx.meetingInput=completeMeeting;
    await f.run('submitForm({preventDefault(){},currentTarget:meetingInput})');
    await f.run('flushCloud()');
    const boot=await api.bootstrap(admin),c=boot.classes['6A1'];
    assert.equal(c.months['T11/2026'].meetings.length,1);
    assert.equal(c.months['T11/2026'].connections.length,0);
    assert(!f.run('renderM01().includes("/3 lịch")'));
    assert(f.run('renderM05().includes("1 lượt")'));
    results.push({totals:summary(c,'T11/2026'),checks:validateReport(c,'T11/2026')});
    await api.saveUserRoles(admin,{email:'bgh@vietanhschool.edu.vn',name:'BGH',roles:['bgh'],active:true});
    const bgh=await api.bootstrap({email:'bgh@vietanhschool.edu.vn',oid:'bgh-oid',name:'BGH'});
    assert.deepEqual(bgh.summaries['6A1']['T11/2026'],results.at(-1).totals);
    await f.run('submitForm({preventDefault(){},currentTarget:meetingInput})');
    assert.equal(f.run('mdata().meetings.length'),1);
  }
  assert.deepEqual(results[0],results[1]);
  assert.equal(results[1].totals.profileSessions,1);
  assert.equal(results[1].totals.meetings,1);
  assert.equal(results[1].totals.improved,0);
});

test('continuing a plan requires review, preserves history and never copies completion',async()=>{
  const api=createService(memoryDatabase()),f=frontend({api});await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];
    mdata(cls(),'T10/2026').plans=[{id:'OLD',studentId:'S1',need:'N',goal:'G',action:'A',deadline:'2026-10-20',cooperation:'C',assessment:'E',result:'Đạt một phần'},
      {id:'DONE',studentId:'S1',need:'N',goal:'Done',action:'A',deadline:'2026-10-20',cooperation:'C',assessment:'E',result:'Đạt'}];save()`);
  await f.run('flushCloud()');
  const old=f.run(`JSON.stringify(mdata(cls(),'T10/2026'))`);
  assert.equal(f.run('previousMonthPlans().length'),1);
  f.run(`continueWorkPlan('OLD')`);
  assert.match(f.el('modalBody').innerHTML, /name="deadline"[^>]*value=""/);
  assert.equal(f.run('mdata().plans.length'),0);
  await f.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1',need:'N',goal:'G',action:'A',deadline:'2026-11-20',cooperation:'C',assessment:'E',result:'Chưa chốt'}})`);
  await f.run('flushCloud()');
  assert.equal(f.run('previousMonthPlans().length'),0);
  assert.equal(f.run('summarize(cls(),ui.month).supportDone'),0);
  assert.equal(f.run('summarize(cls(),ui.month).supportPrev'),0);
  assert.equal(f.run('summarize(cls(),ui.month).meetings'),0);
  assert.equal(f.run(`JSON.stringify(mdata(cls(),'T10/2026'))`),old);
  const plan=f.run('mdata().plans[0]');assert.equal(plan.sourcePlanId,'OLD');
  f.run(`openModal('plans','',{sourceMonth:'T10/2026',sourcePlanId:'OLD'})`);
  await f.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1'}})`);
  assert.equal(f.run('mdata().plans.length'),1);
});

test('unsubmitted drafts survive reload without entering reports and cannot cross months or classes',async()=>{
  const memory=new Map(),f=frontend({memory});await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];save();openWorkEntry('m02','S1')`);
  f.ctx.draftInput={...completeMeeting,profileId:'',concern:'Unsubmitted concern'};
  f.run('saveEditorDraft(draftInput)');
  assert.equal(f.run('mdata().meetings.length'),0);
  const next=frontend({memory});await next.login();
  next.run(`openWorkEntry('m02','S1')`);
  assert(next.el('modalBody').innerHTML.includes('Unsubmitted concern'));
  assert.equal(next.run('mdata().meetings.length'),0);
  next.run(`ui.month='T12/2026';openWorkEntry('m02','S1')`);
  assert(!next.el('modalBody').innerHTML.includes('Unsubmitted concern'));
  next.run(`ui.month='T11/2026';openWorkEntry('m02','S1');ui.classId='6A2'`);
  await next.run(`submitForm({preventDefault(){},currentTarget:{studentId:'S1'}})`);
  assert.equal(next.run(`appData.classes['6A1'].months['T11/2026'].meetings.length`),0);
  assert(next.alerts.some(message=>message.includes('đã thay đổi')));
});

test('monthly workspace honors preview and locked-month restrictions',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];setRolePreview('gvcn','6A1');navTo('work');openWorkEntry('m02','S1')`);
  assert.equal(f.run('ui.editing'),null);
  assert(!f.el('view').innerHTML.includes('openWorkEntry('));
  f.run(`setRolePreview('');auth.assignment={role:'gvcn',classId:'6A1'};mdata().approval.state='submitted';navTo('work');openWorkEntry('m02','S1')`);
  assert.equal(f.run('ui.editing'),null);
  assert(!f.el('view').innerHTML.includes('openWorkEntry('));
});

test('failed form persistence keeps the draft and retry does not duplicate a meeting',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Student',code:''}];save();openWorkEntry('m02','S1')`);
  f.ctx.input={...completeMeeting,profileId:''};
  f.run('saveEditorDraft(input)');
  const key=f.run('editorDraftKey()'),setItem=f.ctx.localStorage.setItem;
  f.ctx.localStorage.setItem=()=>{throw Error('Storage full');};
  await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings.length'),0);
  assert(f.el('editor').open);assert(f.memory.has(key));
  f.ctx.localStorage.setItem=setItem;
  await f.run('submitForm({preventDefault(){},currentTarget:input})');
  assert.equal(f.run('mdata().meetings.length'),1);
  assert(!f.memory.has(key));
});
test('planned schedule XLSX groups all visits per student and preserves detailed goals and notes',async()=>{
  const f=frontend();await f.login();
  f.run(`cls().students=[{id:'S1',name:'Nguyễn <An> & Bình',code:''},{id:'S2',name:'=Student',code:''},{id:'S3',name:'Not scheduled',code:''}];
    mdata().schedule.S1={appointments:[
      {id:'A2',date:'2026-11-18',session:'afternoon',planTime:'18/11/2026 · Chiều 15:00–15:20',goal:'Vở ghi',note:'Ghi chú riêng'},
      {id:'A1',date:'2026-11-02',session:'morning',planTime:'02/11/2026 · Sáng 9:55–10:15',goal:'Mục tiêu',note:''},
      {id:'A3',date:'2026-11-25',session:'morning',planTime:'25/11/2026 · Sáng 9:55–10:15',goal:'Học sinh chia sẻ',note:''}]};
    mdata().schedule.S2={planTime:'Tuần 4',goal:'Giữ nội dung cũ',note:'Legacy note'};`);
  const before=f.run('JSON.stringify(appData)');
  let exported,filename;f.ctx.downloadFile=(blob,name)=>{exported=blob;filename=name;};
  f.run('exportSchedule()');assert(exported);assert.match(filename,/Lich_gap_6A1_T11-2026.xlsx/);
  f.ctx.buffer=await exported.arrayBuffer();const files=await f.run('readZip(buffer)');
  const parse=file=>new DOMParser().parseFromString(new TextDecoder().decode(files[file]),'application/xml');
  const main=parse('xl/worksheets/sheet1.xml'),detail=parse('xl/worksheets/sheet2.xml');
  const value=(doc,addr)=>Array.from(doc.getElementsByTagName('c')).find(c=>c.getAttribute('r')===addr)?.textContent;
  assert.match(value(main,'A1'),/VỚI HỌC SINH LỚP 6A1/);assert.equal(value(main,'A2'),'Tháng 11/2026');
  assert.equal(value(main,'B4'),'Nguyễn <An> & Bình');
  assert.equal(value(main,'C4'),'9h55 - 10h15\n15h00 - 15h20\n9h55 - 10h15');
  assert.equal(value(main,'D4'),'02/11/2026\n18/11/2026\n25/11/2026');
  assert.equal(value(main,'D5'),'Tuần 4');assert.match(value(main,'E4'),/nguyện vọng/);
  assert(Array.from(main.getElementsByTagName('mergeCell')).some(c=>c.getAttribute('ref')==='E4:E5'));
  assert.equal(main.getElementsByTagName('row').length,5);
  assert.equal(value(detail,'F3'),'Ghi chú riêng');assert.equal(value(detail,'E5'),'Giữ nội dung cũ');
  assert.equal(main.getElementsByTagName('f').length,0);assert.equal(detail.getElementsByTagName('f').length,0);
  assert.equal(f.run('JSON.stringify(appData)'),before);
  assert(f.run('renderM01()').includes('Xuất Excel lịch gặp'));
  const styles=parse('xl/styles.xml');assert.equal(styles.getElementsByTagName('cellXfs')[0].getAttribute('count'),'7');
  assert(Array.from(styles.getElementsByTagName('color')).every(c=>c.getAttribute('rgb')==='FF000000'));
  f.run('mdata().schedule={};exportSchedule()');assert(f.alerts.some(s=>s.includes('Chưa có lịch')));
  assert(!f.run('renderM01()').includes('Xuất Excel lịch gặp'));
});

test('classes above 28 students save to Firebase and export all students across every month',async()=>{
  const api=createService(memoryDatabase());
  const f=frontend({api});await f.login();
  // Supply the browser XML DOM surface to exercise the real XLSX exporter in Node.
  const sample=new DOMParser().parseFromString('<root><cell/></root>','application/xml');
  for(const list of [sample.childNodes,sample.getElementsByTagName('*')])
    Object.getPrototypeOf(list)[Symbol.iterator]=Array.prototype[Symbol.iterator];
  const elementPrototype=Object.getPrototypeOf(sample.documentElement);
  if(!Object.getOwnPropertyDescriptor(elementPrototype,'children'))
    Object.defineProperty(elementPrototype,'children',{get(){return Array.from(this.childNodes).filter(n=>n.nodeType===1);}});
  f.ctx.DOMParser=DOMParser;f.ctx.XMLSerializer=XMLSerializer;
  f.run(`cls().students=Array.from({length:35},(_,i)=>({id:'S'+i,name:'Student '+i,code:'HS'+i}));
    for(const month of MONTHS) mdata(cls(),month).schedule.S34={goal:'Last student '+month};
    save();`);
  await f.run('flushCloud()');
  assert.equal((await api.bootstrap(admin)).classes['6A1'].students.length,35);
  let exported;
  f.ctx.downloadFile=blob=>{exported=blob;};
  await f.run('exportClass()');
  assert(exported, f.alerts.join('\n'));
  f.ctx.exportedBuffer=await exported.arrayBuffer();
  const files=await f.run('readZip(exportedBuffer)');
  const parse=path=>new DOMParser().parseFromString(new TextDecoder().decode(files[path]),'application/xml');
  const paths=f.run('getSheetNamePaths');
  const entries=paths(files);
  const sheet=name=>parse(entries.find(s=>s.name===name).path);
  const cell=(doc,addr)=>Array.from(doc.getElementsByTagName('c')).find(c=>c.getAttribute('r')===addr);
  const hidden=(name,index)=>Array.from(sheet(name).getElementsByTagName('col')).some(col=>+col.getAttribute('min')<=index&&+col.getAttribute('max')>=index&&col.getAttribute('hidden')==='1');
  assert(hidden('DanhSach',3));assert(hidden('M02',12));assert(hidden('M03',8));assert(hidden('M05_CacLan',11));
  assert(!cell(sheet('M02'),'N5').textContent.includes('Mã minh chứng'));
  assert(!cell(sheet('M05_CacLan'),'L5').textContent.includes('Mã xác nhận'));
  assert(!cell(sheet('M05_CacLan'),'L5').textContent.includes('Mã chưa khớp dòng M02'));
  assert.equal(cell(sheet('KiemTra'),'J5').textContent,'IF($B5=0,"—","OK")');
  assert.equal(cell(sheet('DanhSach'),'C39').textContent,'HS34');
  assert.equal(cell(sheet('DanhSach'),'B39').textContent,'Student 34');
  assert.match(cell(sheet('TheoDoiHS'),'B39').textContent,/DanhSach!\$B\$39/);
  const m01=sheet('M01');
  for(let month=0;month<9;month++) {
    const row=5+month*35+34;
    assert.equal(cell(m01,'E'+row).textContent,'Last student '+f.run(`MONTHS[${month}]`));
    assert.match(cell(m01,'C'+row).textContent,/DanhSach!\$B\$39/);
    assert(cell(m01,'J'+row).textContent.includes('C'+row));
  }
  assert(cell(sheet('TongHop'),'G5').textContent.includes('$A$319'));
  assert(cell(sheet('ThongTin'),'B9').textContent.includes('$B$39'));
  assert(new TextDecoder().decode(files['xl/workbook.xml']).includes('DanhSach!$B$5:$B$39'));
});

test('healthy synchronization uses a green check while errors remain visible',async()=>{
  const f=frontend({api:createService(memoryDatabase())});await f.login();
  assert.equal(f.el('offlineNotice').textContent,'✓');
  assert.equal(f.el('offlineNotice').className,'sync-ok');
  f.run(`cloud.error='Network unavailable';updateStorageNotice()`);
  assert(f.el('offlineNotice').textContent.includes('Network unavailable'));
  assert.equal(f.el('offlineNotice').className,'notice');
  assert(!entryHtml.includes('sidebarStorage'));
  assert(!entryHtml.includes('TRƯỜNG VIỆT ANH · HỆ THỐNG QUẢN LÝ'));
});
test('new devices use source login and Firebase configuration without setup controls',async()=>{
  for (const memory of [new Map(),new Map([
    ['VA_GVCN_MICROSOFT_AUTH_CONFIG_V1','{"tenantId":"old","clientId":"old"}'],
    ['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":false}'],
  ])]) {
    const before=[...memory.entries()],f=frontend({memory});
    f.run(`makeMsalClient=async config=>({handleRedirectPromise:async()=>null,getAllAccounts:()=>[]})`);
    await f.run('initializeMsLogin()');
    assert.equal(f.run('auth.config.tenantId'),'22215a7f-b9e3-4b53-bd27-3a317311e6ca');
    assert.equal(f.run('auth.config.clientId'),'94c476b3-4723-4161-9dea-d64ff8bf505c');
    assert.equal(f.run('readCloudConfig().enabled'),true);
    assert.equal(f.el('msLoginBtn').disabled,false);
    assert.deepEqual([...memory.entries()],before);
  }
  const gate=entryHtml.slice(entryHtml.indexOf('<section id="authGate"'),entryHtml.indexOf('<div class="app">'));
  assert.equal((gate.match(/<button\b/g)||[]).length,1);
  assert(!/<input\b|<details\b/.test(gate));
});
test('Admin previews all roles with scoped navigation and no data or role mutations',async()=>{
  const f=frontend();await f.login();
  const assignment=f.run('JSON.stringify(auth.assignment)');
  const stored=[...f.memory.entries()];
  f.run(`setRolePreview('gvcn','8C3')`);
  assert.equal(f.run('ui.role'),'gvcn');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(getScope())')),['8C3']);
  assert(f.el('nav').innerHTML.includes("navTo('m01')"));
  assert(!f.el('nav').innerHTML.includes("navTo('users')"));
  assert.equal(f.run('editable()'),false);assert.equal(f.run('canEditSetup()'),false);
  assert.equal(f.run('save()'),false);
  const before=f.run('JSON.stringify(appData)');
  await f.run(`transition('8C3','submitted')`);
  await f.run('demoData()');
  assert.equal(f.run('JSON.stringify(appData)'),before);
  f.run(`setRolePreview('lead','12C1')`);
  assert(f.run(`getScope().every(id=>gradeText(id)==='12')`));
  assert(f.el('nav').innerHTML.includes("navTo('m01')"));
  f.run(`setRolePreview('bgh')`);
  assert.equal(f.run('getScope().length'),32);
  assert(!f.el('nav').innerHTML.includes("navTo('students')"));
  f.run(`setRolePreview('admin')`);
  assert(f.el('nav').innerHTML.includes("navTo('users')"));
  assert.equal(f.run('canEditSetup()'),false);
  f.run(`setRolePreview('')`);
  assert.equal(f.run('isRolePreview()'),false);
  assert.equal(f.run('canEditSetup()'),true);
  assert.equal(f.run('JSON.stringify(auth.assignment)'),assignment);
  assert.deepEqual([...f.memory.entries()],stored);
});

test('non-Admin cannot enter preview even by invoking the switch directly',async()=>{
  const f=frontend();await f.login();
  f.run(`auth.assignment={role:'gvcn',classId:'8C3'};ui.preview=null;setRolePreview('admin','6A1');render()`);
  assert.equal(f.run('isRolePreview()'),false);
  assert.equal(f.run('hasAppRole("admin")'),false);
  assert.equal(f.el('rolePreview').innerHTML,'');
});
test('Excel roster matches codes before names and rejects ambiguous duplicate names',()=>{
  const {run}=frontend();
  const result=JSON.parse(run(`JSON.stringify(reconcileRoster(
    [{id:'A',name:'Same',code:'01'},{id:'B',name:'Same',code:'02'}],
    [{name:'Renamed',code:'02'},{name:'Same',code:'01'}]))`));
  assert.deepEqual(result.map(s=>s.id),['B','A']);
  assert.throws(()=>run(`reconcileRoster([{id:'A',name:'Same',code:'01'},{id:'B',name:'Same',code:'02'}],[{name:'Same',code:''}])`));
  assert.throws(()=>run(`reconcileRoster([],[{name:'Same',code:''},{name:'Same',code:''}])`));
  assert.throws(()=>run(`reconcileRoster([],[{name:'A',code:'01'},{name:'B',code:'01'}])`));
});
test('changing selected class during Excel parsing keeps the import in its original class',async()=>{
  const f=frontend();await f.login();
  f.run(`ui.classId='8C3';ui.grade='8';
    readZip=async()=>({sheet:new Uint8Array()});
    getSheetNamePaths=()=>[{name:'DanhSach',path:'sheet'}];
    xmlparse=()=>({getElementsByTagNameNS:()=>[{
      getAttribute:()=> '5',getElementsByTagNameNS:()=>[
        {getAttribute:k=>k==='r'?'B5':'inlineStr',getElementsByTagNameNS:(ns,k)=>k==='is'?[{textContent:'Imported student'}]:[]},
        {getAttribute:k=>k==='r'?'C5':'inlineStr',getElementsByTagNameNS:(ns,k)=>k==='is'?[{textContent:'HS01'}]:[]}
      ]
    }]});`);
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  f.ctx.importEvent={target:{value:'file',files:[{arrayBuffer:()=>gate}]}};
  const pending=f.run('importRoster(importEvent)');
  f.run(`ui.classId='8C2'`);release(new ArrayBuffer(0));await pending;
  assert.equal(f.run(`appData.classes['8C3'].students[0].code`),'HS01');
  assert.equal(f.run(`appData.classes['8C2'].students.length`),0);
});
function frontend({memory=new Map(),api}={}) {
  const nodes=new Map(),alerts=[],bodyClasses=new Set();
  const el=id=>{
    if(!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,checked:false,open:false,
      classList:{add(){},remove(){}},setAttribute(k,v){this[k]=v;},addEventListener(){},replaceChildren(){this.innerHTML='';},
      close(){this.open=false;},showModal(){this.open=true;},focus(){},select(){}});
    return nodes.get(id);
  };
  const ctx={console:{log:console.log,warn(){},error(){}},TextEncoder,TextDecoder,Blob,Response,DecompressionStream,Uint8Array,DataView,URL,atob,AbortController,
    setTimeout(fn,ms){if(ms===2000)Promise.resolve().then(fn);return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    alert:m=>alerts.push(m),confirm:()=>true,prompt:()=> 'Test reason',
    FormData:class {constructor(record){this.record=record;}get(key){return this.record[key]??null;}getAll(key){const value=this.record[key];return value===undefined?[]:Array.isArray(value)?value:[value];}},
    localStorage:{get length(){return memory.size;},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    document:{getElementById:el,hidden:false,body:{classList:{add:c=>bodyClasses.add(c),remove:c=>bodyClasses.delete(c)}}},
    location:{origin:'http://127.0.0.1:5500',pathname:'/index.html',protocol:'http:'}};
  ctx.window={location:ctx.location};
  ctx.fetch=async(url,options={})=>{
    const path=new URL(url).pathname.replace(/^\/api/,'')||'/',body=options.body?JSON.parse(options.body):{};
    try {
      let result;
      if(path==='/bootstrap') result=await api.bootstrap(admin);
      else if(path==='/calendar'&&options.method==='PUT') result=await api.saveCalendar(admin,body);
      else if(path==='/teachers'&&options.method==='POST') result=await api.saveTeacher(admin,body);
      else if(path.startsWith('/teachers/')&&options.method==='DELETE') result=await api.deleteTeacher(admin,path.split('/')[2]);
      else if(path==='/users'&&options.method==='POST') result=await api.saveUserRoles(admin,body);
      else if(path==='/directory/import'&&options.method==='POST') result=await api.importDirectory(admin,body);
      else if(path.startsWith('/classes/')&&options.method==='PUT') result=await api.putClass(admin,path.split('/')[2],body);
      else if(path.startsWith('/import/')) result=await api.putClass(admin,path.split('/')[2],body,true);
      else throw Error(`Unexpected test route ${path}`);
      return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(result))};
    } catch(error) {return {ok:false,status:error.status||500,json:async()=>({error:error.message})};}
  };
  vm.createContext(ctx);
  for(const script of scripts)vm.runInContext(script.code,ctx,{filename:script.path});
  const run=code=>vm.runInContext(code,ctx);
  ctx.realDialogs={alert:ctx.appAlert,confirm:ctx.appConfirm,prompt:ctx.appPrompt};
  // Feature tests choose responses explicitly; popup behavior is tested separately.
  ctx.appAlert=message=>{ctx.alert(message);return Promise.resolve(true);};
  ctx.appConfirm=async message=>ctx.confirm(message);
  ctx.appPrompt=async message=>ctx.prompt(message);
  async function login() {
    // Local feature tests explicitly opt out of the production Firebase default.
    if (!api) run('readCloudConfig=()=>({enabled:false})');
    run(`auth.config={tenantId:'22222222-2222-2222-2222-222222222222'};
      auth.client={acquireTokenSilent:async()=>({idToken:'SYNTHETIC-TEST-TOKEN'})};`);
    await run(`authenticatedStart({username:'lammt@vietanhschool.edu.vn',tenantId:auth.config.tenantId,idTokenClaims:{oid:'${admin.oid}'}});`);
  }
  return {ctx,run,login,el,memory,alerts,bodyClasses};
}

test('local Admin can manage GVCN; non-Admin sees roster without CRUD controls',async()=>{
  const f=frontend();await f.login();assert.equal(f.run('ui.role'),'admin');
  const initialAlerts=f.alerts.length;
  for(const page of f.run('VIEW_LIST.map(v=>v[0])')) f.run(`navTo('${page}')`);
  f.run(`ui.classId='8C3';ui.grade='8';openModal('teacherAccount');`);
  assert(f.el('modalBody').innerHTML.includes('value="1" selected'));
  await f.run(`saveTeacherAccount({name:'Giáo viên A',email:'teacher@vietanhschool.edu.vn',classId:'8C3',active:true});`);
  assert.equal(f.run('cls().teacher'),'Giáo viên A');assert.equal(f.run('Object.keys(appData.teachers).length'),1);
  const id=f.run('Object.keys(appData.teachers)[0]');
  await f.run(`saveTeacherAccount({id:'${id}',name:'Tên mới',email:'teacher@vietanhschool.edu.vn',classId:'8C2',active:true});`);
  assert.equal(f.run('appData.classes["8C2"].teacher'),'Tên mới');assert.equal(f.run('appData.classes["8C3"].teacher'),'');
  f.run(`auth.assignment={role:'gvcn',classId:'8C2'};ui.role='gvcn';ui.classId='8C2';ui.grade='8';navTo('students');`);
  assert.equal(f.run('canEditSetup()'),false);
  assert(!f.el('nav').innerHTML.includes('Quản lý GVCN'));assert(!f.el('view').innerHTML.includes('Thêm học sinh'));
  assert.equal(f.alerts.length,initialAlerts);
});

test('Admin student form add/edit/delete and linked student cannot be removed',async()=>{
  const f=frontend();await f.login();
  const initialAlerts=f.alerts.length;
  f.run(`ui.classId='6A1';openModal('student');`);
  await f.run(`submitForm({preventDefault(){},currentTarget:{name:'Học sinh A',code:'HS01'}});`);
  assert.equal(f.run('cls().students.length'),1);
  const id=f.run('cls().students[0].id');
  f.run(`openModal('student','${id}')`);
  await f.run(`submitForm({preventDefault(){},currentTarget:{name:'Tên cập nhật',code:'HS01'}});`);
  assert.equal(f.run('cls().students[0].name'),'Tên cập nhật');
  await f.run(`removeRecord('student','${id}')`);assert.equal(f.run('cls().students.length'),0);
  await f.run(`cls().students.push({id:'S2',name:'Có hồ sơ',code:'HS02'});mdata().previous.push({id:'R1',studentId:'S2'});removeRecord('student','S2')`);
  assert.equal(f.run('cls().students.length'),1);assert.equal(f.alerts.length,initialAlerts+1);
});

test('Firebase sync uses API, preserves original local data and has no phantom writes on empty views',async()=>{
  const db=memoryDatabase(),api=createService(db),memory=new Map();
  const original='{"schema":2,"year":"2026-2027","classes":{}}';
  memory.set('VA_GVCN_MSAL_PROTOTYPE_DATA_V1',original);memory.set('VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}');
  const f=frontend({api,memory});await f.login();assert.equal(f.run('cloud.ready'),true);
  assert(f.bodyClasses.has('auth-ready'));
  for(const page of f.run('VIEW_LIST.map(v=>v[0])')) f.run(`navTo('${page}')`);
  await f.run('flushCloud()');assert.equal(f.run('cloud.worker'),null);assert.equal(f.run('cloud.pending.size'),0);
  await f.run(`saveTeacherAccount({name:'Teacher',email:'teacher@vietanhschool.edu.vn',classId:'8C3',active:true});`);
  f.run(`ui.classId='8C3';ui.grade='8';cls().students.push({id:'S1',name:'Student',code:'HS01'});save();`);
  assert.equal(f.run('cloud.pending.size'),1);await f.run('flushCloud()');
  assert.equal((await api.bootstrap(admin)).classes['8C3'].students[0].name,'Student');
  assert.equal(memory.get('VA_GVCN_MSAL_PROTOTYPE_DATA_V1'),original);
  assert(!memory.has(f.run('cloudCacheKey()+"_PENDING"')));
});

test('Admin can manage roles and import the approved directory through the authenticated API',async()=>{
  const api=createService(memoryDatabase()),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  const f=frontend({api,memory});await f.login();
  await f.run(`saveUserRole({name:'School leader',email:'bgh@vietanhschool.edu.vn',roles:['bgh'],grades:[],active:true});`);
  assert.equal(f.run(`appData.users.find(x=>x.email==='bgh@vietanhschool.edu.vn').roles[0]`),'bgh');
  assert(f.run(`renderUsers().includes('Tài khoản & vai trò')`));
  f.run(`navTo('users');openModal('userRoles','bgh@vietanhschool.edu.vn');`);
  assert(f.el('modalBody').innerHTML.includes('name="roles"'));
  f.run(`$('editor').close();`);
  const directory={schema:1,year:'2026-2027',teachers:[{name:'Teacher',email:'teacher@vietanhschool.edu.vn',classId:'8C3',roles:['gvcn','lead'],grades:['8'],active:true}],users:[]};
  await f.run(`importDirectoryFile({target:{files:[{text:async()=>${JSON.stringify(JSON.stringify(directory))}}],value:'selected'}});`);
  const boot=await api.bootstrap({email:'teacher@vietanhschool.edu.vn',oid:'teacher-oid',name:'Teacher'});
  assert.deepEqual(boot.assignment.roles,['gvcn','lead']);
  assert.equal(f.run('cloud.error'),'');
});

test('reload restores unsynced draft and conflict refuses to overwrite a newer server record',async()=>{
  const db=memoryDatabase(),api=createService(db),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  let f=frontend({api,memory});await f.login();
  f.run(`cls().students.push({id:'S1',name:'Pending Student',code:''});save();`);
  const key=f.run('cloudCacheKey()+"_PENDING"');assert(memory.has(key));
  f=frontend({api,memory});await f.login();assert.equal(f.run('cls().students[0].name'),'Pending Student');
  await f.run('flushCloud()');assert(!memory.has(key));
  f.run(`cls().students[0].name='Pending local change';save();`);
  const remote=await api.bootstrap(admin),c=remote.classes['6A1'];c.students[0].name='Changed on another computer';
  await api.putClass(admin,'6A1',{classData:c,revision:remote.revisions['6A1']});
  f=frontend({api,memory});await f.login();assert(f.run('cloud.error').includes('Máy chủ đã có cập nhật'));
  assert.equal(f.run('cls().students[0].name'),'Pending local change');
  await f.run('retryCloud()');assert(f.run('cloud.error'));
  assert.equal((await api.bootstrap(admin)).classes['6A1'].students[0].name,'Changed on another computer');
  assert(memory.has(key));
});

test('an edit made while a Firebase write is in flight is saved in the next revision',async()=>{
  const api=createService(memoryDatabase()),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  const f=frontend({api,memory});await f.login();
  let release,started;
  const requestStarted=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const fetchOriginal=f.ctx.fetch;let first=true;
  f.ctx.fetch=async(url,options)=>{
    if(options.method==='PUT'&&first) {first=false;started();await gate;}
    return fetchOriginal(url,options);
  };
  f.run(`cls().students.push({id:'S1',name:'First edit',code:''});save();`);
  const saving=f.run('flushCloud()');await requestStarted;
  f.run(`cls().students[0].name='Edit made during save';save();`);release();await saving;
  const server=await api.bootstrap(admin);
  assert.equal(server.classes['6A1'].students[0].name,'Edit made during save');
  assert.equal(f.run('cloud.pending.size'),0);
});

test('pending records outside a new assignment remain available for export',async()=>{
  const api=createService(memoryDatabase()),memory=new Map([['VA_GVCN_FIREBASE_CONNECTION_V1','{"enabled":true}']]);
  const f=frontend({api,memory});await f.login();
  f.run(`cls().students.push({id:'S1',name:'Pending in previous class',code:''});save();`);
  const key=f.run('cloudCacheKey()+"_PENDING"'),raw=memory.get(key);
  f.run(`cloud.pending.clear();cloud.baselines={'8C3':classFingerprint(appData.classes['8C3'])};auth.assignment={role:'gvcn',classId:'8C3'};`);
  f.ctx.previousDraft=raw;f.run('restorePendingDrafts(previousDraft);storePendingDrafts();updateStorageNotice();');
  assert.equal(f.run('cloud.pending.size'),0);
  assert.equal(JSON.parse(memory.get(key)).classes['6A1'].data.students[0].name,'Pending in previous class');
  assert(f.el('syncActions').innerHTML.includes('exportPendingDrafts'));
});

test('invalid local data is retained and Microsoft URI generation respects current origin',async()=>{
  const raw='CORRUPT-LEGACY-CONTENT',memory=new Map([['VA_GVCN_MSAL_PROTOTYPE_DATA_V1',raw]]);
  const f=frontend({memory});await f.login();assert.equal(memory.get('VA_GVCN_MSAL_PROTOTYPE_DATA_V1'),raw);
  assert(!f.bodyClasses.has('auth-ready'));
  assert.equal(f.run('currentRedirectUri()'),'http://127.0.0.1:5500/index.html');
  assert(f.run(`microsoftErrorText(new Error('AADSTS50011')).includes(currentRedirectUri())`));
  assert(source.includes('https://alcdn.msauth.net/browser/2.35.0/js/msal-browser.min.js'));
  assert(source.includes('cacheLocation: "localStorage"'));
});

test('index and directory entry use the index Entra redirect and preserve stored config',()=>{
  const config='{"tenantId":"22222222-2222-2222-2222-222222222222","clientId":"94c476b3-4723-4161-9dea-d64ff8bf505c"}';
  const memory=new Map([['VA_GVCN_MICROSOFT_AUTH_CONFIG_V1',config]]),f=frontend({memory});
  for(const entry of ['/index.html','/','/school/index.html','/school/']) {
    f.ctx.location.pathname=entry;
    const directory=entry.endsWith('/')?entry:entry.slice(0,entry.lastIndexOf('/')+1);
    assert.equal(f.run('currentRedirectUri()'),'http://127.0.0.1:5500'+directory+'index.html');
  }
  assert.equal(memory.get('VA_GVCN_MICROSOFT_AUTH_CONFIG_V1'),config);
});
