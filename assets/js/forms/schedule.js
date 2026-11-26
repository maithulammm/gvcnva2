"use strict";

const MEETING_SESSIONS = {
  morning:{label:"Sáng",time:"9:55–10:15"},
  afternoon:{label:"Chiều",time:"15:00–15:20"},
};
const MEETING_TOPICS = ["Mục tiêu","Vở ghi","Học sinh chia sẻ"];
/** Bổ sung dấu vết từ cuộc gặp thực tế, không tạo thêm cuộc gặp hoặc đổi lịch đã hẹn trước. */
function syncActualMeetingSchedule(c,month,meeting){
  if(!meeting)return;
  const parsed=meeting.actualDateTime||parseMeetingActual(meeting.actual).dateTime;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(parsed))return;
  const [date,time]=parsed.split('T'),[y,mo]=date.split('-');
  if(month!==`T${mo}/${y}`)return;
  const m=mdata(c,month),old=m.schedule[meeting.studentId]||{},items=studentAppointments(c,month,meeting.studentId);
  const linked=items.find(a=>a.id===meeting.appointmentId);
  if(linked&&!linked.sourceMeetingId)return;
  if(meeting.appointmentId&&!linked)return;
  const available=items.find(a=>!a.sourceMeetingId&&scheduleSlot(a).date===date&&appointmentRange({...a,...scheduleSlot(a)})[0]===time&&!m.meetings.some(r=>r.id!==meeting.id&&r.appointmentId===a.id));
  if(!linked&&available){meeting.appointmentId=available.id;return;}
  const session=time==='09:55'?'morning':time==='15:00'?'afternoon':'other';
  const minutes=+time.slice(0,2)*60 + +time.slice(3)+20,end=Math.min(minutes,1440);
  const endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
  const info=session==='other'?{label:'Giờ khác',time:time+'–'+endTime}:MEETING_SESSIONS[session];
  const a={...linked,id:linked?.id||newID(),date,session,startTime:time,endTime,sourceMeetingId:meeting.id,
    topics:linked?.topics||[],goal:linked?.goal||'',note:linked?.note||'',priority:linked?.priority===true,
    planTime:`${date.slice(8)}/${mo}/${y} · ${info.label} ${info.time}`};
  meeting.appointmentId=a.id;
  m.schedule[meeting.studentId]=appointmentRollup(old,linked?items.map(x=>x.id===a.id?a:x):[...items,a]);
}
/** Chỉ đổi cờ ưu tiên của đúng lần hẹn; không đổi thời gian, mục tiêu cũ hoặc số lượt đã gặp. */
function setAppointmentPriority(studentId,appointmentId,checked){
  if(!editable()||typeof checked!=='boolean')return;
  const c=cls(),m=mdata(),old=m.schedule[studentId];
  const appointments=studentAppointments(c,ui.month,studentId);
  if(!appointmentId&&c.students.some(s=>s.id===studentId)){
    m.schedule[studentId]={...appointmentRollup(old||{},appointments),priority:checked};
    if(!save()){if(old)m.schedule[studentId]=old;else delete m.schedule[studentId];}
    render();return;
  }
  if(!old||!appointments.some(a=>a.id===appointmentId))return;
  m.schedule[studentId]=appointmentRollup(old,appointments.map(a=>a.id===appointmentId?{...a,priority:checked}:a));
  if(!save())m.schedule[studentId]=old;
  render();
}
/**
 * Trả về cặp [giờ bắt đầu, giờ kết thúc] 24 giờ; giờ tùy chọn được lưu riêng, không thêm vào hai
 * ca tự động.
 */
function appointmentRange(a){return a.session==='other'?[a.startTime||'11:00',a.endTime||'11:20']:a.session==='afternoon'?['15:00','15:20']:['09:55','10:15'];}
/**
 * Giờ tùy chọn phải né cả ngày nghỉ và phần sáng/chiều bị cấm; mốc phân buổi là 12:00.
 */
function customHoliday(date,start,end){return isExcludedMeetingDate(date)||((schoolCalendar().excludedSessions||[]).some(s=>s.date===date&&(s.session==='morning'?start<'12:00':end>'12:00')));}
/**
 * Sinh ngày ISO thật của tháng, tự tính số ngày và năm nhuận.
 */
function scheduleMonthDates(month=ui.month) {
  const match=/^T(\d{2})\/(\d{4})$/.exec(month);
  if (!match) return [];
  const m=+match[1], year=+match[2], days=new Date(year,m,0).getDate();
  return Array.from({length:days},(_,i)=>`${year}-${match[1]}-${String(i+1).padStart(2,"0")}`);
}
/**
 * Ưu tiên trường date/session; với lịch cũ chỉ đọc lại ngày và buổi khi nhận diện được rõ ràng.
 */
function scheduleSlot(record={}) {
  if (record.date && record.session) return {date:record.date,session:record.session};
  // Recognize dated legacy schedules where a fixed session is unambiguous.
  const text=String(record.planTime||""), iso=text.match(/\b\d{4}-\d{2}-\d{2}\b/), local=text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const date=iso?.[0]||(local?`${local[3]}-${local[2].padStart(2,"0")}-${local[1].padStart(2,"0")}`:"");
  const session=/\b0?9:55\b/.test(text)?"morning":/\b15:00\b/.test(text)?"afternoon":"";
  return {date,session};
}
/**
 * Đọc danh sách lịch nhiều lần; bọc lịch cũ dạng đơn thành một phần tử để không mất dữ liệu cũ.
 */
function studentAppointments(c,month,studentId) {
  const record=mdata(c,month,false).schedule[studentId]||{};
  if (Array.isArray(record.appointments)) return record.appointments;
  return record.planTime ? [{...record,id:`legacy-${studentId}`}] : [];
}
/**
 * Gom lịch của tất cả học sinh trong lớp và sắp theo ngày, giờ bắt đầu; không tạo lượt gặp thực
 * tế.
 */
function monthlyAppointments(c=cls(),month=ui.month) {
  return c.students.flatMap(s=>studentAppointments(c,month,s.id).map(a=>({...a,studentId:s.id})))
    .sort((a,b)=>`${scheduleSlot(a).date}:${appointmentRange({...a,...scheduleSlot(a)})[0]}`.localeCompare(`${scheduleSlot(b).date}:${appointmentRange({...b,...scheduleSlot(b)})[0]}`));
}
/**
 * Chỉ cho T2–T6; lớp 12 được sáng T7, kể cả giờ tùy chọn kết thúc không quá 12:00.
 */
function scheduleSessionAllowed(c,date,session) {
  const day=new Date(date+'T12:00:00').getDay();
  return day>=1&&day<=5 || Number(c.grade)===12&&day===6&&(session==='morning'||session==='other'&&(ui.editing?.schedule?.endTime||'11:20')<='12:00');
}
function changeCustomScheduleTime(key,value){
  if(!['startTime','endTime'].includes(key)||!editorContextCurrent()||!editable())return;
  ui.editing.schedule[key]=value;ui.editing.schedule.note=$('scheduleNote').value;renderScheduleEditor();saveEditorDraft();
}
/**
 * Hai khoảng thời gian trùng khi start < otherEnd và end > otherStart; chạm đầu/cuối không tính
 * trùng. Bỏ qua chính lịch đang sửa.
 */
function scheduleOccupant(date,session,studentId=ui.editing?.id,c=cls(),month=ui.month,appointmentId=ui.editing?.seed?.appointmentId) {
  const [start,end]=appointmentRange({...(session==='other'?ui.editing?.schedule:{}),session});
  return monthlyAppointments(c,month).find(a=>{
    const slot=scheduleSlot(a);
    const [otherStart,otherEnd]=appointmentRange({...a,...slot});
    return !(a.studentId===studentId&&a.id===appointmentId) && slot.date===date&&start<otherEnd&&end>otherStart;
  })?.studentId;
}
/**
 * Một ô chỉ khả dụng nếu không nghỉ, đúng ngày học, không trùng giờ và học sinh chưa có lịch khác
 * cùng ngày.
 */
function scheduleAvailable(date,session,studentId=ui.editing?.id,c=cls(),month=ui.month,appointmentId=ui.editing?.seed?.appointmentId) {
  if(session==='other'&&customHoliday(date,...appointmentRange({...ui.editing?.schedule,session})))return false;
  return !isExcludedMeetingDate(date,session) && scheduleSessionAllowed(c,date,session) && !scheduleOccupant(date,session,studentId,c,month,appointmentId) &&
    !studentAppointments(c,month,studentId).some(a=>a.id!==appointmentId&&scheduleSlot(a).date===date);
}

async function rescheduleAppointment(studentId,appointmentId){
  if(!editable()||cloud.busy)return;
  const context=dialogContext();
  if(cloud.ready){
    try{const data=await databaseRequest('/calendar','GET',undefined,{silent:true});
      if(Object.keys(context).some(k=>context[k]!==dialogContext()[k]))return;
      if(data.calendar)appData.calendar=data.calendar;
    }catch(error){return appAlert('Chưa kiểm tra được lịch nghỉ: '+error.message);}
  }
  openStudentAppointment(studentId,appointmentId);
  if(ui.editing?.seed?.appointmentId===appointmentId){ui.editing.seed.reschedule=true;$('modalTitle').textContent='Dời lịch · '+studentName(cls(),studentId);}
}
/**
 * Giữ mảng appointments làm dữ liệu chi tiết, đồng thời cập nhật chuỗi tổng hợp cho màn hình/xuất
 * cũ.
 */
function appointmentRollup(old,appointments) {
  const {date,session,topics,id,...base}=old;
  return {...base,appointments,planTime:appointments.map(a=>a.planTime).filter(Boolean).join('\n'),
    goal:uniq(appointments.map(a=>a.goal).filter(Boolean)).join('\n'),note:appointments.map(a=>a.note).filter(Boolean).join('\n'),
    ...(!appointments.length?{status:''}:{})};
}

function openStudentAppointment(studentId,appointmentId='') {
  if (!editable()) return;
  if (appointmentId&&!studentAppointments(cls(),ui.month,studentId).some(a=>a.id===appointmentId)) {
    toast('Lịch hẹn đã thay đổi. Hãy tải lại danh sách.');return;
  }
  openModal('m01',studentId,{appointmentId,addAppointment:!appointmentId});
}

function scheduleEditorState(record) {
  const slot=scheduleSlot(record), dates=scheduleMonthDates();
  return {priority:record.priority===true||record.priority==='1',date:dates.includes(slot.date)?slot.date:"",session:slot.session==='other'?'other':MEETING_SESSIONS[slot.session]?slot.session:"",startTime:record.startTime||'11:00',endTime:record.endTime||'11:20',
    topics:Array.isArray(record.topics)?record.topics.filter(t=>MEETING_TOPICS.includes(t)):
      MEETING_TOPICS.filter(t=>String(record.goal||"").split(" · ").includes(t)),note:String(record.note||"")};
}

function selectSchedulePart(key,value) {
  if (ui.editing?.type!=="m01" || !editorContextCurrent() || !editable()) return;
  const state=ui.editing.schedule;
  state.note=$("scheduleNote").value;
  if (key==="session" && (MEETING_SESSIONS[value]||value==='other')) {
    if (state.date && !scheduleAvailable(state.date,value)) return;
    state.session=value;
  } else if (key==="date" && scheduleMonthDates().includes(value)) {
    if (state.session && !scheduleAvailable(value,state.session)) return;
    if (!state.session && !Object.keys(MEETING_SESSIONS).some(s=>scheduleAvailable(value,s))) return;
    state.date=value;
  } else if (key==="topic" && MEETING_TOPICS.includes(value)) {
    state.topics=state.topics.includes(value)?state.topics.filter(t=>t!==value):[...state.topics,value];
  } else return;
  renderScheduleEditor();
  saveEditorDraft();
}

function renderScheduleEditor() {
  const {date,session,topics,note,priority}=ui.editing.schedule, dates=scheduleMonthDates();
  const [year,month]=dates[0].split('-').map(Number), offset=(new Date(year,month-1,1).getDay()+6)%7;
  const old=studentAppointments(cls(),ui.month,ui.editing.id).find(a=>a.id===ui.editing.seed.appointmentId)||{}, legacyGoal=String(old.goal||"").split(" · ").filter(t=>!MEETING_TOPICS.includes(t)).join(" · ");
  const selected=dates.includes(date)?`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`:"Chưa chọn ngày";
  const appointmentIndex=studentAppointments(cls(),ui.month,ui.editing.id).findIndex(a=>a.id===ui.editing.seed.appointmentId);
  const linked=old.id&&mdata().meetings.some(r=>r.appointmentId===old.id);
  $('deleteAppointmentButton').hidden=appointmentIndex<0||!!linked&&!(hasAppRole('admin')||isAdminClassEditing());
  $('deleteAppointmentButton').textContent='Xóa lịch lần '+(appointmentIndex+1);
  $("modalBody").innerHTML = `<div class="schedule-editor">
    <div class="schedule-student"><b>${esc(studentName(cls(),ui.editing.id))}</b><span>${esc(ui.month)}</span></div>
    <fieldset><legend>Thời gian gặp</legend><div class="schedule-sessions">${Object.entries(MEETING_SESSIONS).map(([key,value])=>{
      const occupant=date&&scheduleOccupant(date,key);
      const blocked=date&&!scheduleAvailable(date,key);
      return `<button type="button" class="schedule-choice" aria-pressed="${session===key}" ${blocked?'disabled':''} onclick="selectSchedulePart('session','${key}')"><b>${value.label}</b><span>${value.time}</span>${occupant?`<small>Đã hẹn: ${esc(studentName(cls(),occupant))}</small>`:''}</button>`;
    }).join('')}<button type="button" class="schedule-choice" aria-pressed="${session==='other'}" onclick="selectSchedulePart('session','other')">Giờ khác</button></div>${session==='other'?`<div class="schedule-custom-time"><label>Giờ bắt đầu (24 giờ)<input name="startTime" value="${esc(ui.editing.schedule.startTime)}" placeholder="HH:mm" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" required onchange="changeCustomScheduleTime(this.name,this.value)"></label><label>Giờ kết thúc (24 giờ)<input name="endTime" value="${esc(ui.editing.schedule.endTime)}" placeholder="HH:mm" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" required onchange="changeCustomScheduleTime(this.name,this.value)"></label></div>`:''}</fieldset>
    <fieldset><legend>Chọn ngày · Tháng ${month}/${year}</legend><div class="schedule-calendar" role="group" aria-label="Lịch tháng ${month}/${year}">
      ${['T2','T3','T4','T5','T6','T7','CN'].map(day=>`<span class="calendar-heading">${day}</span>`).join('')}
      ${Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')}
      ${dates.map(day=>{
        const blocked=session?!scheduleAvailable(day,session):!Object.keys(MEETING_SESSIONS).some(s=>scheduleAvailable(day,s));
        return `<button type="button" class="calendar-day" data-date="${day}" aria-label="Ngày ${day.slice(8)}/${day.slice(5,7)}/${day.slice(0,4)}" aria-pressed="${day===date}" ${blocked?'disabled':''} onclick="selectSchedulePart('date','${day}')"><b>${Number(day.slice(8))}</b></button>`;
      }).join('')}</div><p class="help">${selected}${session==='other'?' · Giờ khác':session?' · '+MEETING_SESSIONS[session].label+' '+MEETING_SESSIONS[session].time:''}</p></fieldset>
    <label class="schedule-priority"><input type="checkbox" name="priority" value="1" ${priority?'checked':''} onchange="ui.editing.schedule.priority=this.checked;saveEditorDraft()"> <b>Ưu tiên</b></label>
    <label class="field"><b>Ghi chú</b><textarea id="scheduleNote" name="note" rows="3">${esc(note)}</textarea></label>
    ${linked&&!(hasAppRole('admin')||isAdminClassEditing())?'<p class="help">Lịch này đã ghi nhận cuộc gặp thực tế nên không thể xóa.</p>':''}
    <input type="hidden" name="date" value="${esc(date)}"><input type="hidden" name="session" value="${esc(session)}">
    ${topics.map(t=>`<input type="hidden" name="topics" value="${esc(t)}">`).join('')}</div>`;
}
/**
 * Kiểm tra ngày, giờ, lịch nghỉ và xung đột trước khi tạo hoặc thay đúng một lần hẹn; giữ ID khi
 * sửa.
 */
function buildScheduleRecord(c,month,id,record) {
  if (!scheduleMonthDates(month).includes(record.date)) throw Error("Hãy chọn ngày hợp lệ trong tháng đang mở.");
  if (!MEETING_SESSIONS[record.session]&&record.session!=='other') throw Error("Hãy chọn buổi sáng, buổi chiều hoặc giờ khác.");
  if(record.session==='other'&&(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(record.startTime)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(record.endTime)||record.startTime>=record.endTime))throw Error('Giờ bắt đầu/kết thúc phải hợp lệ, kết thúc sau bắt đầu.');
  if(record.session==='other'&&customHoliday(record.date,record.startTime,record.endTime))throw Error('Khung giờ nằm trong lịch nghỉ.');
  if (!scheduleSessionAllowed(c,record.date,record.session)) throw Error('Chỉ hẹn T2–T6; lớp 12 được thêm sáng T7.');
  if(record.session==='other')Object.assign(ui.editing.schedule,{startTime:record.startTime,endTime:record.endTime});
  const occupant=scheduleOccupant(record.date,record.session,id,c,month);
  if (occupant) throw Error(`Khung giờ này đã hẹn ${studentName(c,occupant)}. Hãy chọn khung giờ khác.`);
  const old=mdata(c,month,false).schedule[id]||{}, appointments=studentAppointments(c,month,id);
  const appointmentId=ui.editing.seed.appointmentId, previous=appointments.find(a=>a.id===appointmentId);
  if(isExcludedMeetingDate(record.date,record.session)&&(!previous||previous.date!==record.date||previous.session!==record.session))throw Error('Ngày hoặc buổi đã chọn là lịch nghỉ. Hãy chọn lịch khác.');
  if (appointments.some(a=>a.id!==appointmentId&&scheduleSlot(a).date===record.date)) throw Error('Hai buổi trong ngày phải hẹn hai học sinh khác nhau.');
  const topics=MEETING_TOPICS.filter(t=>record.topics.includes(t));
  const legacyGoal=String(previous?.goal||(!appointments.length?old.goal:'')||"").split(" · ").filter(t=>!MEETING_TOPICS.includes(t));
  const info=record.session==='other'?{label:'Giờ khác',time:record.startTime+'–'+record.endTime}:MEETING_SESSIONS[record.session], date=record.date;
  const appointment={...previous,id:previous?.id||newID(),date,session:record.session,topics,note:record.note,priority:record.priority===true,
    ...(record.session==='other'?{startTime:record.startTime,endTime:record.endTime}:{}),goal:[...legacyGoal,...topics].filter(Boolean).join(" · "),
    planTime:`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · ${info.label} ${info.time}`};
  delete appointment.sourceMeetingId;
  return appointmentRollup(old,previous?appointments.map(a=>a.id===appointmentId?appointment:a):[...appointments,appointment]);
}

async function removeEditedAppointment() {
  const editor=ui.editing;
  if(editor?.type!=='m01'||!editorContextCurrent())return;
  return removeAppointment(editor.id,editor.seed.appointmentId,editor);
}
/**
 * Xóa đúng ID lịch sau xác nhận. Nếu Admin xóa lịch đã liên kết, chỉ bỏ liên kết, vẫn giữ cuộc gặp
 * thực tế.
 */
async function removeAppointment(studentId,appointmentId,editor=null) {
  if (cloud.busy||!editable()||!appointmentId) return;
  const c=cls(),m=mdata(),old=m.schedule[studentId],month=ui.month,owner=auth.email,epoch=cloud.epoch;
  const appointments=studentAppointments(c,month,studentId),index=appointments.findIndex(a=>a.id===appointmentId);
  if(index<0)return;
  const baseline=stableString(old),appointment=appointments[index];
  if (m.meetings.some(r=>r.appointmentId===appointmentId)&&!(hasAppRole('admin')||isAdminClassEditing())) return appAlert('Lịch đã liên kết cuộc gặp thực tế, không thể xóa.');
  if (!await appConfirm(`Xóa lịch lần ${index+1} của ${studentName(c,studentId)} · ${appointment.planTime}? Các lần gặp khác được giữ nguyên. Cuộc gặp thực tế nếu có vẫn giữ lại và chỉ bỏ liên kết với lịch này.`)) return;
  if(cloud.busy||!editable()||auth.email!==owner||cloud.epoch!==epoch||ui.month!==month||cls()!==c||
    stableString(mdata().schedule[studentId])!==baseline||
    editor&&(ui.editing!==editor||!editorContextCurrent()))return;
  if(mdata().meetings.some(r=>r.appointmentId===appointmentId)&&!(hasAppRole('admin')||isAdminClassEditing()))return appAlert('Lịch đã liên kết cuộc gặp thực tế, không thể xóa.');
  const beforeMeetings=m.meetings;
  m.meetings=m.meetings.map(r=>{if(r.appointmentId!==appointmentId)return r;const {appointmentId:removed,...rest}=r;return rest;});
  m.schedule[studentId]=appointmentRollup(old,appointments.filter(a=>a.id!==appointmentId));
  if (!save()) {m.schedule[studentId]=old;m.meetings=beforeMeetings;return;}
  if(editor){clearEditorDraft();$('editor').close();ui.editing=null;}
  render();toast('Đã xóa đúng lịch hẹn được chọn.');
}
/**
 * Xếp trên bản sao: duyệt ngày rồi sáng/chiều và quay vòng danh sách học sinh. Giữ lịch có sẵn,
 * không áp trần số lần/tháng.
 */
function* automaticScheduleSteps(c=cls(),month=ui.month) {
  // Chỉ sao chép tháng đang xếp. Các tháng khác và nhật ký gặp thực tế không bị sửa.
  const copy={...c,students:c.students.map(s=>({...s})),months:{...c.months,[month]:JSON.parse(JSON.stringify(mdata(c,month,false)))}};
  const m=mdata(copy,month),students=copy.students,busy=new Map(),studentDays=new Map();
  const addBusy=(studentId,appointment)=>{
    const slot=scheduleSlot(appointment);if(!slot.date)return;
    if(!busy.has(slot.date))busy.set(slot.date,[]);
    busy.get(slot.date).push(appointmentRange({...appointment,...slot}));
    if(!studentDays.has(studentId))studentDays.set(studentId,new Set());
    studentDays.get(studentId).add(slot.date);
  };
  for(const student of students)for(const appointment of studentAppointments(copy,month,student.id))addBusy(student.id,appointment);
  const priorityIds=new Set(students.filter(s=>m.schedule[s.id]?.priority===true||studentAppointments(copy,month,s.id).some(a=>a.priority===true)).map(s=>s.id));
  let next=0,added=0;
  if (!students.length) return {classData:copy,added};
  for (const date of scheduleMonthDates(month)) {
    yield;
    for (const session of Object.keys(MEETING_SESSIONS)) {
    if(isExcludedMeetingDate(date,session))continue;
    const [start,end]=appointmentRange({session});
    if (!scheduleSessionAllowed(copy,date,session)||(busy.get(date)||[]).some(([a,b])=>start<b&&end>a)) continue;
    // Mỗi em có lượt đầu trước; sau đó dành thêm lượt 2–3 cho HS ưu tiên, giữ thứ tự khi bằng điểm.
    const candidates=Array.from({length:students.length},(_,i)=>students[(next+i)%students.length]);
    const score=s=>{const n=studentAppointments(copy,month,s.id).length;return n===0?-1:priorityIds.has(s.id)&&n<3?n/10:n;};
    candidates.sort((a,b)=>score(a)-score(b));
    for (const student of candidates) {
      const appointments=studentAppointments(copy,month,student.id);
      if (studentDays.get(student.id)?.has(date)) continue;
      const info=MEETING_SESSIONS[session],appointment={id:newID(),date,session,topics:[],goal:'',note:'',priority:priorityIds.has(student.id),
        planTime:`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · ${info.label} ${info.time}`};
      m.schedule[student.id]=appointmentRollup(m.schedule[student.id]||{},[...appointments,appointment]);
      addBusy(student.id,appointment);
      next=(students.indexOf(student)+1)%students.length;added++;break;
    }
    }
  }
  return {classData:copy,added};
}
/** Bản đồng bộ dùng chung thuật toán cho xuất/kiểm thử; không nhân đôi quy tắc xếp lịch. */
function buildAutomaticSchedule(c=cls(),month=ui.month){
  const steps=automaticScheduleSteps(c,month);let step;
  do{step=steps.next();}while(!step.done);
  return step.value;
}
function schedulePaint(){
  return new Promise(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>requestAnimationFrame(resolve)):setTimeout(resolve,0));
}
/** Nhường luồng giao diện sau mỗi bốn ngày để vòng xoay vẫn chạy trên điện thoại. */
async function buildAutomaticScheduleAsync(c,month){
  const steps=automaticScheduleSteps(c,month);let step,count=0;
  while(!(step=steps.next()).done)if(++count%4===0)await schedulePaint();
  return step.value;
}
/**
 * Đọc lịch nghỉ mới nhất trước khi xếp, hỏi xác nhận rồi mới thay dữ liệu tháng; lưu lỗi thì trả
 * lại bản cũ.
 */
async function autoScheduleMonth() {
  if (pageLoading.pending.size) return;
  // Hiện modal ngay trong click handler, trước cả kiểm tra quyền/dữ liệu có thể tốn thời gian.
  const release=beginPageLoading('Đang xếp lịch, vui lòng chờ...');
  const context={owner:auth.email,epoch:cloud.epoch,classId:ui.classId,month:ui.month};
  let c,result;
  try {
    // Nhường một khung hình để màn chờ được vẽ trước khi tính lịch trên thiết bị di động.
    await schedulePaint();
    if(!editable())return;
    if(cloud.ready) {
      const data=await databaseRequest('/calendar','GET',undefined,{silent:true});
      if(auth.email!==context.owner||cloud.epoch!==context.epoch||ui.classId!==context.classId||ui.month!==context.month||!editable())return;
      if(data.calendar)appData.calendar=data.calendar;
    }
    if (!cls().students.length) return toast('Cần nhập danh sách học sinh trước khi xếp lịch.');
    c=cls();result=await buildAutomaticScheduleAsync(c,context.month);
  } catch(error){appAlert('Chưa xếp được lịch: '+error.message);return;}
  finally{await release(!!result);}
  if(cls()!==c)return toast('Dữ liệu lớp đã thay đổi. Vui lòng xếp lịch lại.');
  if (!result.added) return toast('Không còn khung giờ trống.');
  if (!await appConfirm(`Xếp thêm ${result.added} lịch dự kiến?`)) return;
  if(auth.email!==context.owner||cloud.epoch!==context.epoch||ui.classId!==context.classId||ui.month!==context.month||!editable())return;
  const old=c.months[ui.month];c.months[ui.month]=result.classData.months[ui.month];
  if (!save()) {if(old)c.months[ui.month]=old;else delete c.months[ui.month];return;}
  render();toast(`Đã xếp thêm ${result.added} lịch dự kiến. Xem tại Mẫu 2.`);
}
