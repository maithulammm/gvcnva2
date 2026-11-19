"use strict";

const MEETING_SESSIONS = {
  morning:{label:"Sáng",time:"9:55–10:15"},
  afternoon:{label:"Chiều",time:"15:00–15:20"},
};
const MEETING_TOPICS = ["Mục tiêu","Vở ghi","Học sinh chia sẻ"];

function scheduleMonthDates(month=ui.month) {
  const match=/^T(\d{2})\/(\d{4})$/.exec(month);
  if (!match) return [];
  const m=+match[1], year=+match[2], days=new Date(year,m,0).getDate();
  return Array.from({length:days},(_,i)=>`${year}-${match[1]}-${String(i+1).padStart(2,"0")}`);
}

function scheduleSlot(record={}) {
  if (record.date && record.session) return {date:record.date,session:record.session};
  // Recognize dated legacy schedules where a fixed session is unambiguous.
  const text=String(record.planTime||""), iso=text.match(/\b\d{4}-\d{2}-\d{2}\b/), local=text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const date=iso?.[0]||(local?`${local[3]}-${local[2].padStart(2,"0")}-${local[1].padStart(2,"0")}`:"");
  const session=/\b0?9:55\b/.test(text)?"morning":/\b15:00\b/.test(text)?"afternoon":"";
  return {date,session};
}

function studentAppointments(c,month,studentId) {
  const record=mdata(c,month,false).schedule[studentId]||{};
  if (Array.isArray(record.appointments)) return record.appointments;
  return record.planTime ? [{...record,id:`legacy-${studentId}`}] : [];
}

function monthlyAppointments(c=cls(),month=ui.month) {
  return c.students.flatMap(s=>studentAppointments(c,month,s.id).map(a=>({...a,studentId:s.id})))
    .sort((a,b)=>`${scheduleSlot(a).date}:${scheduleSlot(a).session==='afternoon'?1:0}`.localeCompare(`${scheduleSlot(b).date}:${scheduleSlot(b).session==='afternoon'?1:0}`));
}

function scheduleSessionAllowed(c,date,session) {
  const day=new Date(date+'T12:00:00').getDay();
  return day>=1&&day<=5 || Number(c.grade)===12&&day===6&&session==='morning';
}

function scheduleOccupant(date,session,studentId=ui.editing?.id,c=cls(),month=ui.month,appointmentId=ui.editing?.seed?.appointmentId) {
  return monthlyAppointments(c,month).find(a=>{
    const slot=scheduleSlot(a);
    return !(a.studentId===studentId&&a.id===appointmentId) && slot.date===date&&slot.session===session;
  })?.studentId;
}

function scheduleAvailable(date,session,studentId=ui.editing?.id,c=cls(),month=ui.month,appointmentId=ui.editing?.seed?.appointmentId) {
  return !isExcludedMeetingDate(date,session) && scheduleSessionAllowed(c,date,session) && !scheduleOccupant(date,session,studentId,c,month,appointmentId) &&
    !studentAppointments(c,month,studentId).some(a=>a.id!==appointmentId&&scheduleSlot(a).date===date);
}

async function rescheduleAppointment(studentId,appointmentId){
  if(!editable()||cloud.busy)return;
  const context=dialogContext();
  if(cloud.ready){
    try{const data=await databaseRequest('/bootstrap','GET',undefined,{silent:true});
      if(Object.keys(context).some(k=>context[k]!==dialogContext()[k]))return;
      if(data.calendar)appData.calendar=data.calendar;
    }catch(error){return appAlert('Chưa kiểm tra được lịch nghỉ: '+error.message);}
  }
  openStudentAppointment(studentId,appointmentId);
  if(ui.editing?.seed?.appointmentId===appointmentId){ui.editing.seed.reschedule=true;$('modalTitle').textContent='Dời lịch · '+studentName(cls(),studentId);}
}

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
  if (!appointmentId && studentAppointments(cls(),ui.month,studentId).length>=3) {
    toast('Mỗi học sinh tối đa 3 lịch hẹn trong tháng. Có thể sửa lịch đã có.');return;
  }
  openModal('m01',studentId,{appointmentId,addAppointment:!appointmentId});
}

function scheduleEditorState(record) {
  const slot=scheduleSlot(record), dates=scheduleMonthDates();
  return {date:dates.includes(slot.date)?slot.date:"",session:MEETING_SESSIONS[slot.session]?slot.session:"",
    topics:Array.isArray(record.topics)?record.topics.filter(t=>MEETING_TOPICS.includes(t)):
      MEETING_TOPICS.filter(t=>String(record.goal||"").split(" · ").includes(t)),note:String(record.note||"")};
}

function selectSchedulePart(key,value) {
  if (ui.editing?.type!=="m01" || !editorContextCurrent() || !editable()) return;
  const state=ui.editing.schedule;
  state.note=$("scheduleNote").value;
  if (key==="session" && MEETING_SESSIONS[value]) {
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
  const {date,session,topics,note}=ui.editing.schedule, dates=scheduleMonthDates();
  const [year,month]=dates[0].split('-').map(Number), offset=(new Date(year,month-1,1).getDay()+6)%7;
  const old=studentAppointments(cls(),ui.month,ui.editing.id).find(a=>a.id===ui.editing.seed.appointmentId)||{}, legacyGoal=String(old.goal||"").split(" · ").filter(t=>!MEETING_TOPICS.includes(t)).join(" · ");
  const selected=dates.includes(date)?`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`:"Chưa chọn ngày";
  const appointmentIndex=studentAppointments(cls(),ui.month,ui.editing.id).findIndex(a=>a.id===ui.editing.seed.appointmentId);
  const linked=old.id&&mdata().meetings.some(r=>r.appointmentId===old.id);
  $("modalBody").innerHTML = `<div class="schedule-editor">
    <div class="schedule-student"><b>${esc(studentName(cls(),ui.editing.id))}</b><span>${esc(ui.month)}</span></div>
    <fieldset><legend>Thời gian gặp</legend><div class="schedule-sessions">${Object.entries(MEETING_SESSIONS).map(([key,value])=>{
      const occupant=date&&scheduleOccupant(date,key);
      const blocked=date&&!scheduleAvailable(date,key);
      return `<button type="button" class="schedule-choice" aria-pressed="${session===key}" ${blocked?'disabled':''} onclick="selectSchedulePart('session','${key}')"><b>${value.label}</b><span>${value.time}</span>${occupant?`<small>Đã hẹn: ${esc(studentName(cls(),occupant))}</small>`:''}</button>`;
    }).join('')}</div></fieldset>
    <fieldset><legend>Chọn ngày · Tháng ${month}/${year}</legend><div class="schedule-calendar" role="group" aria-label="Lịch tháng ${month}/${year}">
      ${['T2','T3','T4','T5','T6','T7','CN'].map(day=>`<span class="calendar-heading">${day}</span>`).join('')}
      ${Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')}
      ${dates.map(day=>{
        const occupied=Object.keys(MEETING_SESSIONS).filter(s=>scheduleOccupant(day,s,"")).length;
        const capacity=Object.keys(MEETING_SESSIONS).filter(s=>scheduleSessionAllowed(cls(),day,s)).length;
        const blocked=session?!scheduleAvailable(day,session):!Object.keys(MEETING_SESSIONS).some(s=>scheduleAvailable(day,s));
        return `<button type="button" class="calendar-day" data-date="${day}" aria-label="Ngày ${day.slice(8)}/${day.slice(5,7)}/${day.slice(0,4)}" aria-pressed="${day===date}" ${blocked?'disabled':''} onclick="selectSchedulePart('date','${day}')"><b>${Number(day.slice(8))}</b><small>${capacity?`${occupied}/${capacity} đã hẹn`:'Nghỉ'}</small></button>`;
      }).join('')}</div><p class="help">${selected}${session?' · '+MEETING_SESSIONS[session].label+' '+MEETING_SESSIONS[session].time:''} · T2–T6${Number(cls().grade)===12?', thêm sáng T7':''}</p></fieldset>
    <fieldset><legend>Mục tiêu cuộc gặp · Có thể chọn nhiều</legend><div class="schedule-topics">${MEETING_TOPICS.map(t=>`<button type="button" class="schedule-choice" aria-pressed="${topics.includes(t)}" onclick="selectSchedulePart('topic','${t}')">${t}</button>`).join('')}</div>
      ${legacyGoal?`<p class="help">Nội dung đã có được giữ lại: ${esc(legacyGoal)}</p>`:''}</fieldset>
    <label class="field"><b>Ghi chú</b><textarea id="scheduleNote" name="note" rows="3">${esc(note)}</textarea></label>
    ${appointmentIndex>=0?`<div class="schedule-delete">${linked&&!hasAppRole('admin')?'<p class="help">Lịch này đã ghi nhận cuộc gặp thực tế nên không thể xóa.</p>':`<button type="button" class="btn danger" id="deleteAppointmentButton" onclick="removeEditedAppointment()">Xóa lịch lần ${appointmentIndex+1}</button>`}</div>`:''}
    <input type="hidden" name="date" value="${esc(date)}"><input type="hidden" name="session" value="${esc(session)}">
    ${topics.map(t=>`<input type="hidden" name="topics" value="${esc(t)}">`).join('')}</div>`;
}

function buildScheduleRecord(c,month,id,record) {
  if (!scheduleMonthDates(month).includes(record.date)) throw Error("Hãy chọn ngày hợp lệ trong tháng đang mở.");
  if (!MEETING_SESSIONS[record.session]) throw Error("Hãy chọn buổi sáng hoặc buổi chiều.");
  if (!scheduleSessionAllowed(c,record.date,record.session)) throw Error('Chỉ hẹn T2–T6; lớp 12 được thêm sáng T7.');
  const occupant=scheduleOccupant(record.date,record.session,id,c,month);
  if (occupant) throw Error(`Khung giờ này đã hẹn ${studentName(c,occupant)}. Hãy chọn khung giờ khác.`);
  const old=mdata(c,month,false).schedule[id]||{}, appointments=studentAppointments(c,month,id);
  const appointmentId=ui.editing.seed.appointmentId, previous=appointments.find(a=>a.id===appointmentId);
  if(isExcludedMeetingDate(record.date,record.session)&&(!previous||previous.date!==record.date||previous.session!==record.session))throw Error('Ngày hoặc buổi đã chọn là lịch nghỉ. Hãy chọn lịch khác.');
  if (!previous&&appointments.length>=3) throw Error('Mỗi học sinh tối đa 3 lịch hẹn trong tháng.');
  if (appointments.some(a=>a.id!==appointmentId&&scheduleSlot(a).date===record.date)) throw Error('Hai buổi trong ngày phải hẹn hai học sinh khác nhau.');
  const topics=MEETING_TOPICS.filter(t=>record.topics.includes(t));
  const legacyGoal=String(previous?.goal||(!appointments.length?old.goal:'')||"").split(" · ").filter(t=>!MEETING_TOPICS.includes(t));
  const info=MEETING_SESSIONS[record.session], date=record.date;
  const appointment={...previous,id:previous?.id||newID(),date,session:record.session,topics,note:record.note,
    goal:[...legacyGoal,...topics].filter(Boolean).join(" · "),
    planTime:`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · ${info.label} ${info.time}`};
  return appointmentRollup(old,previous?appointments.map(a=>a.id===appointmentId?appointment:a):[...appointments,appointment]);
}

async function removeEditedAppointment() {
  const editor=ui.editing;
  if(editor?.type!=='m01'||!editorContextCurrent())return;
  return removeAppointment(editor.id,editor.seed.appointmentId,editor);
}

async function removeAppointment(studentId,appointmentId,editor=null) {
  if (cloud.busy||!editable()||!appointmentId) return;
  const c=cls(),m=mdata(),old=m.schedule[studentId],month=ui.month,owner=auth.email,epoch=cloud.epoch;
  const appointments=studentAppointments(c,month,studentId),index=appointments.findIndex(a=>a.id===appointmentId);
  if(index<0)return;
  const baseline=stableString(old),appointment=appointments[index];
  if (m.meetings.some(r=>r.appointmentId===appointmentId)&&!hasAppRole('admin')) return appAlert('Lịch đã liên kết cuộc gặp thực tế, không thể xóa.');
  if (!await appConfirm(`Xóa lịch lần ${index+1} của ${studentName(c,studentId)} · ${appointment.planTime}? Các lần gặp khác được giữ nguyên. Cuộc gặp thực tế nếu có vẫn giữ lại và chỉ bỏ liên kết với lịch này.`)) return;
  if(cloud.busy||!editable()||auth.email!==owner||cloud.epoch!==epoch||ui.month!==month||cls()!==c||
    stableString(mdata().schedule[studentId])!==baseline||
    editor&&(ui.editing!==editor||!editorContextCurrent()))return;
  if(mdata().meetings.some(r=>r.appointmentId===appointmentId)&&!hasAppRole('admin'))return appAlert('Lịch đã liên kết cuộc gặp thực tế, không thể xóa.');
  const beforeMeetings=m.meetings;
  m.meetings=m.meetings.map(r=>{if(r.appointmentId!==appointmentId)return r;const {appointmentId:removed,...rest}=r;return rest;});
  m.schedule[studentId]=appointmentRollup(old,appointments.filter(a=>a.id!==appointmentId));
  if (!save()) {m.schedule[studentId]=old;m.meetings=beforeMeetings;return;}
  if(editor){clearEditorDraft();$('editor').close();ui.editing=null;}
  render();toast('Đã xóa đúng lịch hẹn được chọn.');
}

function buildAutomaticSchedule(c=cls(),month=ui.month) {
  const copy=JSON.parse(JSON.stringify(c)), m=mdata(copy,month), students=copy.students;
  let next=0,added=0;
  if (!students.length) return {classData:copy,added};
  for (const date of scheduleMonthDates(month)) for (const session of Object.keys(MEETING_SESSIONS)) {
    if(isExcludedMeetingDate(date,session))continue;
    if (!scheduleSessionAllowed(copy,date,session)||scheduleOccupant(date,session,'',copy,month,'')) continue;
    for (let attempt=0;attempt<students.length;attempt++) {
      const student=students[next];next=(next+1)%students.length;
      const appointments=studentAppointments(copy,month,student.id);
      if (appointments.length>=3||!scheduleAvailable(date,session,student.id,copy,month,'')) continue;
      const info=MEETING_SESSIONS[session],appointment={id:newID(),date,session,topics:[],goal:'',note:'',
        planTime:`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · ${info.label} ${info.time}`};
      m.schedule[student.id]=appointmentRollup(m.schedule[student.id]||{},[...appointments,appointment]);
      added++;break;
    }
  }
  return {classData:copy,added};
}

async function autoScheduleMonth() {
  if (!editable()) return;
  const context={owner:auth.email,epoch:cloud.epoch,classId:ui.classId,month:ui.month};
  if(cloud.ready) {
    try {
      const data=await databaseRequest('/bootstrap','GET',undefined,{silent:true});
      if(auth.email!==context.owner||cloud.epoch!==context.epoch||ui.classId!==context.classId||ui.month!==context.month||!editable())return;
      if(data.calendar)appData.calendar=data.calendar;
    } catch(error){appAlert('Chưa kiểm tra được lịch không gặp mới nhất: '+error.message);return;}
  }
  if (!cls().students.length) return toast('Cần nhập danh sách học sinh trước khi xếp lịch.');
  const c=cls(),result=buildAutomaticSchedule(c);
  if (!result.added) return toast('Không còn khung giờ trống hoặc học sinh đã đủ 3 lịch hẹn.');
  const belowTwo=c.students.filter(s=>studentAppointments(result.classData,ui.month,s.id).length<2).length;
  if (!await appConfirm(`Xếp thêm ${result.added} lịch theo thứ tự danh sách, ngày và buổi. Giữ nguyên lịch đã có. Tối đa 3 lịch/HS.${belowTwo?`\n${belowTwo} học sinh chưa đủ 2 lượt vì tháng không đủ khung giờ phù hợp.`:''}\nCác lịch chỉ là dự kiến, chưa tính là đã gặp. Áp dụng?`)) return;
  const old=c.months[ui.month];c.months[ui.month]=result.classData.months[ui.month];
  if (!save()) {if(old)c.months[ui.month]=old;else delete c.months[ui.month];return;}
  render();toast(`Đã xếp thêm ${result.added} lịch dự kiến. Xem tại Mẫu 2.`);
}
