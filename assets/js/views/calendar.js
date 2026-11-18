"use strict";

const SCHOOL_CALENDAR_MONTHS=[...MONTHS,'T06/2027','T07/2027','T08/2027'];
function schoolCalendar(){return appData?.calendar||{excludedDates:[],revision:0};}
function isExcludedMeetingDate(date){return schoolCalendar().excludedDates.includes(date);}
function calendarDraft() {
  const scope=auth.email+'|'+cloud.epoch;
  const draft=ui.calendarDraft,server=schoolCalendar();
  if(!draft||draft.scope!==scope||(draft.revision!==server.revision&&stableString(draft.dates)===stableString(draft.baseDates))) {
    ui.calendarDraft={scope,dates:[...server.excludedDates],baseDates:[...server.excludedDates],revision:server.revision};
  }
  return ui.calendarDraft;
}
function calendarDirty(){return stableString([...calendarDraft().dates].sort())!==stableString([...schoolCalendar().excludedDates].sort());}
function selectCalendarMonth(month) {
  if(!hasAppRole('admin')||!SCHOOL_CALENDAR_MONTHS.includes(month))return;
  ui.calendarMonth=month;render();
}
function toggleExcludedDate(date) {
  if(!canEditSetup()||isRolePreview())return;
  if(!scheduleMonthDates(ui.calendarMonth||ui.month).includes(date))return;
  const draft=calendarDraft(),set=new Set(draft.dates);
  if(set.has(date))set.delete(date);else set.add(date);
  draft.dates=[...set].sort();render();
}
async function resetCalendarDraft() {
  if(!canEditSetup())return;
  if(calendarDirty()&&!await appConfirm('Bỏ các ngày nghỉ vừa chọn nhưng chưa lưu?'))return;
  ui.calendarDraft=null;render();
}
async function saveSchoolCalendar() {
  if(!canEditSetup()||isRolePreview()||!calendarDirty())return;
  const draft=calendarDraft(),context={owner:auth.email,epoch:cloud.epoch},payload={excludedDates:[...draft.dates].sort(),revision:draft.revision};
  if(cloud.ready) {
    try {
      await flushCloud();
      if(context.owner!==auth.email||context.epoch!==cloud.epoch||!canEditSetup())return;
      cloud.busy=true;
      const result=await databaseRequest('/calendar','PUT',payload);
      if(!result.calendar)throw Error('API chưa trả lịch không gặp hợp lệ.');
      appData.calendar=result.calendar;
      ui.calendarDraft=null;
      try {localStorage.setItem(cloudCacheKey(),JSON.stringify(appData));}
      catch {appAlert('Lịch đã lưu trên máy chủ. Bộ nhớ thiết bị đã đầy nên chưa giữ được bản lưu trên máy này.');}
      toast('Đã lưu lịch không gặp cho toàn trường.');
    } catch(error) {
      appAlert(error.status===404?'API đang chạy chưa có Lịch không gặp. Cần triển khai phiên bản API mới trên Cloudflare. Các ngày đang chọn vẫn được giữ trên màn hình.':error.message);
    } finally {cloud.busy=false;render();}
  } else {
    const previous=appData.calendar;
    appData.calendar={excludedDates:payload.excludedDates,revision:payload.revision+1};
    if(!save()){appData.calendar=previous;return;}
    ui.calendarDraft=null;render();toast('Đã lưu lịch không gặp trên thiết bị này.');
  }
}
function renderSchoolCalendar() {
  if(!hasAppRole('admin'))return '';
  const draft=calendarDraft(),selected=new Set(draft.dates),month=ui.calendarMonth||ui.month;
  ui.calendarMonth=month;
  const dates=scheduleMonthDates(month),offset=(new Date(dates[0]+'T12:00:00').getDay()+6)%7,dirty=calendarDirty();
  const disabled=!canEditSetup()||isRolePreview();
  return `<div class="section-head"><h2>Năm học 2026–2027</h2><span class="pill">${selected.size} ngày không tự động xếp lịch</span></div>
    <section class="card school-calendar"><p class="help">Bấm ngày để chọn hoặc bỏ ngày nghỉ. Sau khi lưu, tự động xếp lịch của tất cả lớp sẽ bỏ qua các ngày này. Lịch hẹn đã có vẫn được giữ nguyên.</p>
    <div class="calendar-months" role="group" aria-label="Chọn tháng">${SCHOOL_CALENDAR_MONTHS.map(m=>`<button type="button" class="schedule-choice" aria-pressed="${m===month}" onclick="selectCalendarMonth('${m}')">${esc(m)}</button>`).join('')}</div>
    <div class="school-calendar-body"><div><h3>${esc(month)}</h3><div class="schedule-calendar">${['T2','T3','T4','T5','T6','T7','CN'].map(day=>`<div class="calendar-heading">${day}</div>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${dates.map(date=>{
      const display=date.split('-').reverse().join('/'),weekend=[0,6].includes(new Date(date+'T12:00:00').getDay());
      return `<button type="button" class="calendar-day ${weekend?'calendar-weekend':''}" aria-label="${display}${selected.has(date)?' · Ngày nghỉ':''}" aria-pressed="${selected.has(date)}" ${disabled?'disabled':''} onclick="toggleExcludedDate('${date}')"><b>${Number(date.slice(8))}</b><small>${selected.has(date)?'Nghỉ':''}</small></button>`;
    }).join('')}</div></div>
    <div><h3>Ngày đã chọn trong tháng</h3><div class="calendar-selected">${dates.filter(d=>selected.has(d)).map(date=>`<span class="pill">${esc(date.split('-').reverse().join('/'))}</span>`).join('')||'<p class="help">Chưa chọn ngày nghỉ trong tháng này.</p>'}</div>
    <p class="help">${dirty?'Có thay đổi chưa lưu.':'Lịch đã lưu.'}${draft.revision!==schoolCalendar().revision?' Lịch máy chủ đã thay đổi; hãy bỏ bản đang chọn và tải lại trước khi lưu.':''}</p>
    <div class="actions">${disabled?'':`<button type="button" class="btn primary" onclick="saveSchoolCalendar()" ${dirty?'':'disabled'}>Lưu lịch không gặp</button>${btn('Bỏ thay đổi','resetCalendarDraft()')}`}</div></div></div></section>`;
}
