"use strict";

const DEFAULT_MEETING_TEMPLATES=[
  {name:'Hoàn thành bài tập',concern:'Nề nếp học tập',goal:'Hoàn thành bài tập được giao và ghi lại phần chưa hiểu',action:'GVCN cùng học sinh kiểm tra việc hoàn thành bài tập sau 1 tuần'},
  {name:'Quản lý thời gian',concern:'Sắp xếp thời gian học tập',goal:'Lập và thực hiện thời gian biểu học tập phù hợp',action:'Cùng học sinh rà soát thời gian biểu sau 1 tuần'},
  {name:'Quan hệ bạn bè',concern:'Quan hệ bạn bè',goal:'Thực hành lắng nghe và trao đổi tôn trọng với bạn',action:'Trao đổi lại với học sinh về tình huống đã thực hành sau 1 tuần'},
].map(t=>({...t,goals:[{text:t.goal,amount:1,unit:'week'}]}));

function meetingTemplatesKey(){return 'VA_GVCN_MEETING_TEMPLATES_V1_'+encodeURIComponent(auth.email);}
function personalMeetingTemplates() {
  try {
    const rows=JSON.parse(localStorage.getItem(meetingTemplatesKey())||'[]');
    if(!Array.isArray(rows))return [];
    return rows.slice(0,20).filter(t=>typeof t.id==='string'&&typeof t.name==='string'&&Array.isArray(t.goals)).map(t=>({
      id:t.id,name:t.name.slice(0,80),concern:String(t.concern||'').slice(0,4000),action:String(t.action||'').slice(0,4000),
      goals:t.goals.slice(0,3).map(g=>({text:String(g.text||'').slice(0,4000),amount:Number.isInteger(g.amount)&&g.amount>0&&g.amount<=999?g.amount:1,unit:g.unit==='day'?'day':'week'})),
    }));
  } catch{return [];}
}
function allMeetingTemplates(){return [...DEFAULT_MEETING_TEMPLATES,...personalMeetingTemplates()];}
function renderQuickMeetingTools() {
  return `<div class="wide quick-meeting-tools"><div class="actions"><button type="button" class="btn small" data-meeting-mode="quick" onclick="setMeetingMode('quick')">Ghi nhanh</button><button type="button" class="btn small" data-meeting-mode="full" onclick="setMeetingMode('full')">Đầy đủ</button></div>
    <details><summary>Mẫu nội dung · Gợi ý mục tiêu và hành động</summary><div id="meetingTemplates">${renderMeetingTemplates()}</div></details></div>`;
}
function renderMeetingTemplates() {
  return `<div class="meeting-template-list">${allMeetingTemplates().map((t,i)=>`<div><button type="button" class="btn small" onclick="applyMeetingTemplate(${i})">${esc(t.name)}</button>${t.id?`<button type="button" class="btn small danger" aria-label="Xóa mẫu ${esc(t.name)}" onclick="deleteMeetingTemplate(${i})">×</button>`:''}</div>`).join('')}</div>
    ${btn('Lưu nội dung thành mẫu riêng','saveMeetingTemplate()','small')}<p class="help">Mẫu riêng lưu trên thiết bị này. Chỉ gợi ý chủ đề, mục tiêu và hành động; hãy kiểm tra trước khi dùng.</p>`;
}
function syncMeetingModeButtons() {
  if(!$('entryForm').querySelectorAll)return;
  for(const button of $('entryForm').querySelectorAll('[data-meeting-mode]'))button.setAttribute('aria-pressed',String(button.dataset.meetingMode===(ui.meetingMode||'quick')));
  if(ui.meetingMode==='full')for(const panel of $('entryForm').querySelectorAll('.meeting-extra'))panel.open=true;
}
function setMeetingMode(mode) {
  if(!['quick','full'].includes(mode)||ui.editing?.type!=='m02')return;
  ui.meetingMode=mode;
  for(const panel of $('entryForm').querySelectorAll('.meeting-extra'))panel.open=mode==='full';
  syncMeetingModeButtons();
}
function meetingFormSuggestions(form=$('entryForm')) {
  const fd=new FormData(form),goals=[];
  for(let i=1;i<=3;i++) {
    const text=String(fd.get('goal'+i)||'').trim();
    if(text)goals.push({text,amount:Number(fd.get('goalAmount'+i))||1,unit:fd.get('goalUnit'+i)==='day'?'day':'week'});
  }
  return {concern:String(fd.get('concern')||'').trim(),action:String(fd.get('action')||'').trim(),goals};
}
async function saveMeetingTemplate() {
  if(ui.editing?.type!=='m02'||!editorContextCurrent()||!editable())return;
  const editor=ui.editing,suggestions=meetingFormSuggestions();
  if(!suggestions.goals.length||!suggestions.action)return appAlert('Nhập ít nhất mục tiêu 1 và hành động trước khi lưu mẫu.');
  const name=await appPrompt('Đặt tên mẫu gợi ý (không ghi tên hoặc thông tin riêng của học sinh):');
  if(!name?.trim()||ui.editing!==editor||!editorContextCurrent()||!editable())return;
  const templates=personalMeetingTemplates();
  if(templates.length>=20)return appAlert('Đã có 20 mẫu riêng. Hãy xóa mẫu không còn dùng trước khi thêm.');
  try {
    localStorage.setItem(meetingTemplatesKey(),JSON.stringify([...templates,{id:newID(),name:name.trim().slice(0,80),...suggestions}]));
    $('meetingTemplates').innerHTML=renderMeetingTemplates();toast('Đã lưu mẫu riêng.');
  } catch{appAlert('Không lưu được mẫu trên thiết bị này. Nội dung biểu mẫu vẫn được giữ.');}
}
async function applyMeetingTemplate(index) {
  if(ui.editing?.type!=='m02'||!editorContextCurrent()||!editable())return;
  const template=allMeetingTemplates()[index],editor=ui.editing;if(!template)return;
  const current=meetingFormSuggestions();
  if((current.concern||current.action||current.goals.length)&&!await appConfirm('Thay chủ đề, mục tiêu và hành động bằng mẫu gợi ý? Nhận xét quan sát và mức tiến bộ sẽ được giữ nguyên.'))return;
  if(ui.editing!==editor||!editorContextCurrent()||!editable())return;
  const form=$('entryForm'),field=key=>form.querySelector(`[name="${key}"]`);
  field('concern').value=template.concern;field('action').value=template.action;
  for(let i=1;i<=3;i++) {
    const goal=template.goals[i-1];field('goal'+i).value=goal?.text||'';field('goalAmount'+i).value=goal?.amount||1;
    for(const radio of form.querySelectorAll(`[name="goalUnit${i}"]`))radio.checked=radio.value===(goal?.unit||'week');
  }
  if(template.goals.length>1)$('meetingMoreGoals').open=true;
  saveEditorDraft(form);toast('Đã điền gợi ý. Kiểm tra và điều chỉnh theo học sinh.');
}
async function deleteMeetingTemplate(index) {
  if(ui.editing?.type!=='m02'||!editable())return;
  const template=allMeetingTemplates()[index];if(!template?.id)return;
  if(!await appConfirm(`Xóa mẫu riêng “${template.name}”?`))return;
  try {localStorage.setItem(meetingTemplatesKey(),JSON.stringify(personalMeetingTemplates().filter(t=>t.id!==template.id)));$('meetingTemplates').innerHTML=renderMeetingTemplates();}
  catch{appAlert('Không xóa được mẫu trên thiết bị này.');}
}

function nextMeetingEntry(c=cls(),month=ui.month,previousStudent='') {
  const m=mdata(c,month,false),pending=monthlyAppointments(c,month).filter(a=>!m.meetings.some(r=>r.appointmentId===a.id));
  const appointment=pending.find(a=>a.studentId!==previousStudent)||pending[0];
  if(appointment)return {studentId:appointment.studentId,appointmentId:appointment.id};
  const student=c.students.find(s=>s.id!==previousStudent&&!m.meetings.some(r=>r.studentId===s.id));
  return student?{studentId:student.id}:null;
}
function openNextMeeting(previousStudent) {
  if(!editable())return;
  const next=nextMeetingEntry(cls(),ui.month,previousStudent);
  if(!next){toast('Đã hết lịch hẹn và học sinh chưa ghi cuộc gặp trong tháng.');return;}
  if(next.appointmentId)openScheduledMeeting(next.studentId,next.appointmentId);
  else openModal('m02','',{studentId:next.studentId,actualLocation:`Phòng ${cls().id}`});
}
