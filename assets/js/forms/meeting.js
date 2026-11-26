"use strict";

const MEETING_SUGGESTIONS = {
  previousReview:{required:false,placeholder:"Ví dụ: Đã thực hiện mục tiêu lần trước; còn cần nhắc nhở; chưa đủ thời gian đánh giá…",
    values:["Đã thực hiện mục tiêu đã thống nhất","Hoàn thành một phần mục tiêu","Chủ động hơn so với lần trước","Còn cần nhắc nhở và hỗ trợ","Chưa thực hiện nội dung đã thống nhất","Chưa đủ thời gian đánh giá","Cần điều chỉnh mục tiêu hoặc thời hạn"]},
  concern:{placeholder:"Ví dụ: lo lắng về kết quả học tập, quan hệ bạn bè hoặc định hướng sau THPT…",
    values:["Kết quả học tập","Quan hệ bạn bè","Gia đình","Định hướng nghề nghiệp","Sức khỏe, cảm xúc","Nề nếp học tập"]},
  participation:{placeholder:"Ví dụ: HS chủ động chia sẻ hơn lần trước; cần gợi mở; chưa đủ điều kiện so sánh…",
    values:["Chưa đủ điều kiện so sánh","Chủ động trao đổi","Cần gợi mở","Tham gia tích cực hơn","Chưa ghi nhận thay đổi"]},
};
const PROGRESS_CHOICES = [["Chưa đủ căn cứ","Chưa đủ căn cứ"],["Có","Có tiến bộ"],["Không","Chưa tiến bộ"]];
const MEETING_EXTRA_FIELDS = ["actualDateTime","actualDate","actualTime","actualLocation",...Array.from({length:3},(_,i)=>["goal"+(i+1),"goalAmount"+(i+1),"goalUnit"+(i+1)]).flat()];
/**
 * Đọc giờ ISO hoặc dd/mm/yyyy và tách địa điểm từ chuỗi cũ; chỉ chuẩn hóa để nhập, không tự sửa
 * bản ghi gốc.
 */
function parseMeetingActual(actual) {
  const text=String(actual||""),iso=text.match(/\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/),local=text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  const dateTime=iso?`${iso[1]}T${iso[2]}`:local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}T${local[4].padStart(2,'0')}:${local[5]}`:"";
  const parts=text.split(/\s*·\s*/);
  const timeMatch=iso||local,tail=timeMatch?text.slice(timeMatch.index+timeMatch[0].length).replace(/^[\s,;·-]+/,'').replace(/^(?:tại|ở)\s+/i,''):'';
  const location=parts.length>1?parts.slice(1).join(' · '):tail&&!/^[:Z+]/.test(tail)?tail:'';
  return {dateTime,location,legacyTime:parts[0]};
}
/**
 * Ưu tiên trường mới, sau đó suy ra từ dữ liệu cũ; điền sẵn phòng theo lớp và thời hạn mặc định 1
 * tuần.
 */
function meetingEditorValues(record) {
  const parsed=parseMeetingActual(record.actual),values={};
  values.actualDateTime=record.actualDateTime??parsed.dateTime;
  if (!values.actualDateTime && !ui.editing.id && /^\d{4}-\d{2}-\d{2}$/.test(record.actual||'')) {
    const now=new Date();values.actualDateTime=record.actual+'T'+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  }
  values.actualLocation=record.actualLocation??(parsed.location||`Phòng ${cls().id}`);
  values.actualDate=record.actualDate??(values.actualDateTime.split('T')[0]||'');
  values.actualTime=record.actualTime??(values.actualDateTime.split('T')[1]||'');
  for(let i=1;i<=3;i++) {
    const goal=record.goals?.find(g=>(g.position||record.goals.indexOf(g)+1)===i);
    values['goal'+i]=record['goal'+i]??goal?.text??(i===1?record.goal||'':'');
    values['goalAmount'+i]=record['goalAmount'+i]??goal?.amount??1;
    values['goalUnit'+i]=record['goalUnit'+i]??goal?.unit??'week';
  }
  return values;
}
/**
 * Dựng ngày, giờ 24 giờ và địa điểm; ba nút ca chỉ giúp điền nhanh, không giới hạn giờ gặp thực
 * tế.
 */
function meetingTimeControls(record) {
  const v=meetingEditorValues(record),legacy=ui.editing.id&&!v.actualDateTime&&record.actual;
  return `<div class="actual-time-picker"><div id="actualMeetingCalendar">${renderActualMeetingCalendar(v.actualDate)}</div><div class="actual-time-fields"><div class="meeting-session-choices" role="group" aria-label="Chọn giờ gặp thực tế">${[['09:55','Sáng · 09:55'],['15:00','Chiều · 15:00'],['other','Giờ khác']].map(([key,label])=>`<button type="button" class="schedule-choice" data-actual-session="${key}" aria-pressed="${key==='other'?!['09:55','15:00'].includes(v.actualTime):v.actualTime===key}" onclick="chooseActualSession('${key}')">${label}</button>`).join('')}</div><div class="meeting-time"><div class="meeting-date-clock">
    <label>Ngày gặp<input type="date" name="actualDate" value="${esc(v.actualDate)}" onchange="refreshActualMeetingCalendar();updatePreviousMeetingPanel()" ${legacy?'':'required'}></label>
    <label>Giờ (24 giờ)<input type="text" name="actualTime" value="${esc(v.actualTime)}" onchange="updatePreviousMeetingPanel()" placeholder="HH:mm" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" title="Nhập giờ 24 giờ, ví dụ 09:55 hoặc 15:00" ${legacy?'':'required'}></label></div>
    <label>Địa điểm<input type="text" name="actualLocation" value="${esc(v.actualLocation)}" required maxlength="200"></label></div></div></div>
    ${legacy?`<p class="help">Thời gian đã lưu: ${esc(displayDateText(record.actual))}. Để trống ngày giờ để giữ nguyên.</p>`:''}
    <input type="hidden" name="actualDateTime" value="${esc(v.actualDateTime)}">
    <input type="hidden" name="actual" value="${esc(record.actual||'')}">`;
}
/** Lịch gặp thực tế không chặn ngày nghỉ/cuối tuần: đây là việc đã diễn ra, không phải lập lịch. */
function renderActualMeetingCalendar(selected=''){
  const fallback=scheduleMonthDates()[0].slice(0,7);
  const month=ui.editing.actualCalendarMonth||(/^\d{4}-\d{2}-\d{2}$/.test(selected)?selected.slice(0,7):fallback);
  ui.editing.actualCalendarMonth=month;
  const [year,number]=month.split('-').map(Number),days=new Date(year,number,0).getDate(),offset=(new Date(year,number-1,1).getDay()+6)%7;
  return `<div class="actual-calendar-head"><button type="button" class="btn small" aria-label="Tháng trước" onclick="moveActualMeetingMonth(-1)">‹</button><b>Tháng ${String(number).padStart(2,'0')}/${year}</b><button type="button" class="btn small" aria-label="Tháng sau" onclick="moveActualMeetingMonth(1)">›</button></div><div class="actual-calendar-grid" role="group" aria-label="Chọn ngày gặp thực tế">${['T2','T3','T4','T5','T6','T7','CN'].map(d=>`<span>${d}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0');return `<button type="button" aria-label="${i+1}/${String(number).padStart(2,'0')}/${year}" aria-pressed="${date===selected}" onclick="chooseActualMeetingDate('${date}')">${i+1}</button>`;}).join('')}</div>`;
}
function refreshActualMeetingCalendar(){
  const input=$('entryForm').querySelector('[name="actualDate"]');
  if(input?.value)ui.editing.actualCalendarMonth=input.value.slice(0,7);
  $('actualMeetingCalendar').innerHTML=renderActualMeetingCalendar(input?.value||'');
}
function chooseActualMeetingDate(date){
  if(ui.editing?.type!=='m02'||!editorContextCurrent()||!editable())return;
  $('entryForm').querySelector('[name="actualDate"]').value=date;
  refreshActualMeetingCalendar();updatePreviousMeetingPanel();saveEditorDraft();
}
function moveActualMeetingMonth(delta){
  if(ui.editing?.type!=='m02'||!editorContextCurrent()||!editable())return;
  const [y,m]=ui.editing.actualCalendarMonth.split('-').map(Number),next=new Date(y,m-1+delta,1);
  ui.editing.actualCalendarMonth=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0');
  $('actualMeetingCalendar').innerHTML=renderActualMeetingCalendar($('entryForm').querySelector('[name="actualDate"]').value);
}
/**
 * Điền giờ mặc định hoặc cho nhập giờ khác; cập nhật phần tham khảo lịch sử và giữ bản nháp.
 */
function chooseActualSession(value){
  if(ui.editing?.type!=='m02'||!editorContextCurrent()||!editable())return;
  const input=$('entryForm').querySelector('[name="actualTime"]');
  if(value==='other'){if(['09:55','15:00'].includes(input.value))input.value='';input.focus();}
  else if(['09:55','15:00'].includes(value))input.value=value;else return;
  for(const button of $('entryForm').querySelectorAll('[data-actual-session]'))button.setAttribute('aria-pressed',String(button.dataset.actualSession===value));
  updatePreviousMeetingPanel();saveEditorDraft();
}
/**
 * Dựng ba mục tiêu riêng và thời hạn từng mục tiêu; mục tiêu 2/3 chỉ mở khi cần.
 */
function meetingGoalControls(record) {
  const v=meetingEditorValues(record);
  const goalRow=i=>`<div class="meeting-goal-row"><label>Mục tiêu ${i}${i===1?' *':''}<textarea name="goal${i}" rows="2" placeholder="${i===1?'Ví dụ: Hoàn thành bài tập đúng hạn':'Có thể để trống'}" ${i===1?'required':''}>${esc(v['goal'+i])}</textarea></label>
    <div><span>Thời hạn</span><div class="goal-duration"><input type="number" name="goalAmount${i}" aria-label="Số ngày hoặc tuần của mục tiêu ${i}" min="1" max="999" step="1" value="${esc(v['goalAmount'+i])}" ${i===1?'required':''}>
    <div class="meeting-options" role="group" aria-label="Đơn vị thời hạn mục tiêu ${i}">${[['day','ngày'],['week','tuần']].map(([value,label])=>`<label><input type="radio" name="goalUnit${i}" value="${value}" ${v['goalUnit'+i]===value?'checked':''}><span>${label}</span></label>`).join('')}</div></div></div></div>`;
  return `<div class="meeting-goals">${goalRow(1)}<details id="meetingMoreGoals" class="meeting-extra" ${v.goal2||v.goal3?'open':''}><summary>Thêm mục tiêu 2, 3</summary>${goalRow(2)}${goalRow(3)}</details></div><input type="hidden" name="goal" value="${esc(record.goal||'')}">`;
}

function meetingProgressControls(value) {
  return `<div class="meeting-options" role="group" aria-label="Có căn cứ tiến bộ trước – sau?">${PROGRESS_CHOICES.map(([key,label])=>`<label><input type="radio" name="progressEvidence" value="${key}" ${value===key?'checked':''} required><span>${label}</span></label>`).join('')}</div>`;
}
/**
 * Hiện ba cụm từ chính; phần còn lại thu gọn, nhưng tự mở nếu bản ghi đã có lựa chọn trong đó.
 */
function meetingSuggestionControls(key,value) {
  const config=MEETING_SUGGESTIONS[key],selected=String(value).split(';').map(s=>s.trim());
  const button=(text,i)=>`<button type="button" class="schedule-choice" data-suggestion="${key}:${i}" aria-pressed="${selected.includes(text)}" onclick="toggleMeetingSuggestion('${key}',${i})">${esc(text)}</button>`;
  return `<textarea name="${key}" ${config.required===false?'':'required'} placeholder="${esc(config.placeholder)}">${esc(value)}</textarea>
    <div class="meeting-suggestions">${config.values.slice(0,3).map(button).join('')}</div>
    <details class="meeting-more-suggestions" ${config.values.slice(3).some(text=>selected.includes(text))?'open':''}><summary>Thêm gợi ý</summary><div class="meeting-suggestions">${config.values.slice(3).map((text,i)=>button(text,i+3)).join('')}</div></details>`;
}
/**
 * Bật/tắt đúng một cụm từ, giữ phần giáo viên tự gõ; phát input để cơ chế giữ nháp nhận thay đổi.
 */
function toggleMeetingSuggestion(key,index) {
  if (ui.editing?.type!=='m02'||!editorContextCurrent()||!editable()) return;
  const config=MEETING_SUGGESTIONS[key],text=config?.values[index];if(!text)return;
  const input=$('entryForm').querySelector(`[name="${key}"]`),parts=input.value.split(';').map(s=>s.trim()).filter(Boolean);
  input.value=(parts.includes(text)?parts.filter(t=>t!==text):[...parts,text]).join('; ');
  for(const button of $('entryForm').querySelectorAll(`[data-suggestion^="${key}:"]`)) {
    const i=Number(button.dataset.suggestion.split(':')[1]);
    button.setAttribute('aria-pressed',input.value.split(';').map(s=>s.trim()).includes(config.values[i]));
  }
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
/**
 * Ghép ngày/giờ/địa điểm và mục tiêu thành cấu trúc lưu; giữ tương thích bản ghi cũ khi người dùng
 * không đổi thời gian.
 */
function serializeMeetingInputs(fd,record) {
  // Legacy integrations and old drafts can still supply the original fields.
  if(fd.get('actualDateTime')!==null) {
    let dateTime=String(fd.get('actualDateTime')||'').trim();
    const location=String(fd.get('actualLocation')||'').trim();
    if(fd.get('actualDate')!==null) {
      const date=String(fd.get('actualDate')||'').trim(),time=String(fd.get('actualTime')||'').trim();
      if((date||time)&&(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))throw Error('Nhập đủ ngày và giờ 24 giờ, ví dụ 09:55 hoặc 15:00.');
      dateTime=date&&time?date+'T'+time:'';
    }
    const old=ui.editing.id?lookup('m02',ui.editing.id):null,initial=ui.editing.meetingInitial;
    const unchanged=old&&!old.actualDateTime&&dateTime===initial.actualDateTime&&location===initial.actualLocation;
    if(!location)throw Error('Cần nhập địa điểm gặp.');
    if(!unchanged) {
      if(!dateTime) {
        if(!old?.actual)throw Error('Cần chọn ngày và giờ gặp thực tế.');
        record.actual=parseMeetingActual(old.actual).legacyTime+' · '+location;
      } else {
        const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime);
        if(!match)throw Error('Ngày giờ gặp không hợp lệ.');
        const [,y,m,d,h,min]=match,dt=new Date(+y,+m-1,+d,+h,+min);
        if(dt.getFullYear()!==+y||dt.getMonth()!==+m-1||dt.getDate()!==+d||dt.getHours()!==+h||dt.getMinutes()!==+min)throw Error('Ngày giờ gặp không hợp lệ.');
        record.actualDateTime=dateTime;record.actual=`${d}/${m}/${y} ${h}:${min} · ${location}`;
      }
      record.actualLocation=location;
    } else record.actual=old.actual;
  }
  if(fd.get('goal1')!==null) {
    const goals=[];
    for(let i=1;i<=3;i++) {
      const text=String(fd.get('goal'+i)||'').trim();if(!text)continue;
      const amount=Number(fd.get('goalAmount'+i)),unit=fd.get('goalUnit'+i);
      if(!Number.isInteger(amount)||amount<1||amount>999||!['day','week'].includes(unit))throw Error(`Thời hạn mục tiêu ${i} không hợp lệ.`);
      goals.push({position:i,text,amount,unit});
    }
    if(!goals.some(g=>g.position===1))throw Error('Cần nhập ít nhất mục tiêu 1.');
    const old=ui.editing.id?lookup('m02',ui.editing.id):null,initial=ui.editing.meetingInitial;
    const unchanged=old&&!old.goals&&[1,2,3].every(i=>String(fd.get('goal'+i)||'')===String(initial['goal'+i])&&String(fd.get('goalAmount'+i))===String(initial['goalAmount'+i])&&fd.get('goalUnit'+i)===initial['goalUnit'+i]);
    if(unchanged)record.goal=old.goal;
    else {record.goals=goals;record.goal=goals.map(g=>`${g.position}. ${g.text} (${g.amount} ${g.unit==='week'?'tuần':'ngày'})`).join('\n');}
  }
  return record;
}
