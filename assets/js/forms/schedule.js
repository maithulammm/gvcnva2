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

function scheduleOccupant(date,session,studentId=ui.editing?.id,c=cls(),month=ui.month) {
  return Object.entries(mdata(c,month,false).schedule).find(([id,record])=>{
    const slot=scheduleSlot(record);
    return id!==studentId && slot.date===date && slot.session===session;
  })?.[0];
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
    if (state.date && scheduleOccupant(state.date,value)) return;
    state.session=value;
  } else if (key==="date" && scheduleMonthDates().includes(value)) {
    if (state.session && scheduleOccupant(value,state.session)) return;
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
  const old=lookup("m01",ui.editing.id), legacyGoal=String(old.goal||"").split(" · ").filter(t=>!MEETING_TOPICS.includes(t)).join(" · ");
  const selected=dates.includes(date)?`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`:"Chưa chọn ngày";
  $("modalBody").innerHTML = `<div class="schedule-editor">
    <div class="schedule-student"><b>${esc(studentName(cls(),ui.editing.id))}</b><span>${esc(ui.month)}</span></div>
    <fieldset><legend>Thời gian gặp</legend><div class="schedule-sessions">${Object.entries(MEETING_SESSIONS).map(([key,value])=>{
      const occupant=date&&scheduleOccupant(date,key);
      return `<button type="button" class="schedule-choice" aria-pressed="${session===key}" ${occupant?'disabled':''} onclick="selectSchedulePart('session','${key}')"><b>${value.label}</b><span>${value.time}</span>${occupant?`<small>Đã hẹn: ${esc(studentName(cls(),occupant))}</small>`:''}</button>`;
    }).join('')}</div></fieldset>
    <fieldset><legend>Chọn ngày · Tháng ${month}/${year}</legend><div class="schedule-calendar" role="group" aria-label="Lịch tháng ${month}/${year}">
      ${['T2','T3','T4','T5','T6','T7','CN'].map(day=>`<span class="calendar-heading">${day}</span>`).join('')}
      ${Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')}
      ${dates.map(day=>{
        const occupied=Object.keys(MEETING_SESSIONS).filter(s=>scheduleOccupant(day,s,"")).length;
        const blocked=session?!!scheduleOccupant(day,session):occupied===2;
        return `<button type="button" class="calendar-day" data-date="${day}" aria-label="Ngày ${day.slice(8)}/${day.slice(5,7)}/${day.slice(0,4)}" aria-pressed="${day===date}" ${blocked?'disabled':''} onclick="selectSchedulePart('date','${day}')"><b>${Number(day.slice(8))}</b><small>${occupied}/2 đã hẹn</small></button>`;
      }).join('')}</div><p class="help">${selected}${session?' · '+MEETING_SESSIONS[session].label+' '+MEETING_SESSIONS[session].time:''}</p></fieldset>
    <fieldset><legend>Mục tiêu cuộc gặp · Có thể chọn nhiều</legend><div class="schedule-topics">${MEETING_TOPICS.map(t=>`<button type="button" class="schedule-choice" aria-pressed="${topics.includes(t)}" onclick="selectSchedulePart('topic','${t}')">${t}</button>`).join('')}</div>
      ${legacyGoal?`<p class="help">Nội dung đã có được giữ lại: ${esc(legacyGoal)}</p>`:''}</fieldset>
    <label class="field"><b>Ghi chú</b><textarea id="scheduleNote" name="note" rows="3">${esc(note)}</textarea></label>
    <input type="hidden" name="date" value="${esc(date)}"><input type="hidden" name="session" value="${esc(session)}">
    ${topics.map(t=>`<input type="hidden" name="topics" value="${esc(t)}">`).join('')}</div>`;
}

function buildScheduleRecord(c,month,id,record) {
  if (!scheduleMonthDates(month).includes(record.date)) throw Error("Hãy chọn ngày hợp lệ trong tháng đang mở.");
  if (!MEETING_SESSIONS[record.session]) throw Error("Hãy chọn buổi sáng hoặc buổi chiều.");
  const occupant=scheduleOccupant(record.date,record.session,id,c,month);
  if (occupant) throw Error(`Khung giờ này đã hẹn ${studentName(c,occupant)}. Hãy chọn khung giờ khác.`);
  const old=mdata(c,month,false).schedule[id]||{}, topics=MEETING_TOPICS.filter(t=>record.topics.includes(t));
  const legacyGoal=String(old.goal||"").split(" · ").filter(t=>!MEETING_TOPICS.includes(t));
  const info=MEETING_SESSIONS[record.session], date=record.date;
  return {...old,date,session:record.session,topics,note:record.note,
    goal:[...legacyGoal,...topics].filter(Boolean).join(" · "),
    planTime:`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · ${info.label} ${info.time}`};
}
