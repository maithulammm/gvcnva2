"use strict";

const SCHOOL_CALENDAR_MONTHS=[...MONTHS,'T06/2027','T07/2027','T08/2027'];
function schoolCalendar(){return appData?.calendar||{excludedDates:[],excludedSessions:[],revision:0};}
/**
 * Ngày nghỉ cả ngày chặn mọi buổi; buổi nghỉ riêng chỉ chặn ca tương ứng.
 */
function isExcludedMeetingDate(date,session) {
  const calendar=schoolCalendar();
  return calendar.excludedDates.includes(date)||!!session&&(calendar.excludedSessions||[]).some(s=>s.date===date&&s.session===session);
}
function sortedSessions(sessions=[]) {return [...sessions].map(s=>({date:s.date,session:s.session})).sort((a,b)=>a.date.localeCompare(b.date)||a.session.localeCompare(b.session));}
function calendarSessionsFor(dates,sessions,date) {
  return new Set(dates.includes(date)?['morning','afternoon']:sessions.filter(s=>s.date===date).map(s=>s.session));
}
function calendarDayLabel(draft,date) {
  const slots=calendarSessionsFor(draft.dates,draft.sessions,date);
  return slots.size===2?'Nghỉ cả ngày':slots.has('morning')?'Nghỉ sáng':slots.has('afternoon')?'Nghỉ chiều':'';
}
/**
 * Giữ lựa chọn ngày nghỉ tạm riêng với lịch đã lưu, gắn với phiên và revision lịch.
 */
function calendarDraft() {
  const scope=auth.email+'|'+cloud.epoch;
  const draft=ui.calendarDraft,server=schoolCalendar();
  if(!draft||draft.scope!==scope||(draft.revision!==server.revision&&stableString(draft.dates)===stableString(draft.baseDates)&&stableString(draft.sessions)===stableString(draft.baseSessions))) {
    const dates=[...server.excludedDates],sessions=sortedSessions(server.excludedSessions);
    ui.calendarDraft={scope,dates,baseDates:[...dates],sessions,baseSessions:sortedSessions(sessions),revision:server.revision};
  }
  return ui.calendarDraft;
}
function calendarDirty(){return stableString([...calendarDraft().dates].sort())!==stableString([...schoolCalendar().excludedDates].sort())||stableString(sortedSessions(calendarDraft().sessions))!==stableString(sortedSessions(schoolCalendar().excludedSessions));}
function selectCalendarSession(session) {
  if(!hasAppRole('admin')||!['all','morning','afternoon'].includes(session))return;
  ui.calendarSession=session;render();
}
function selectCalendarMonth(month) {
  if(!hasAppRole('admin')||!SCHOOL_CALENDAR_MONTHS.includes(month))return;
  ui.calendarMonth=month;render();
}
function toggleExcludedDate(date) {
  if(!canEditSetup()||isRolePreview())return;
  if(!scheduleMonthDates(ui.calendarMonth||ui.month).includes(date))return;
  const draft=calendarDraft(),slots=calendarSessionsFor(draft.dates,draft.sessions,date),mode=ui.calendarSession||'all';
  if(mode==='all') {
    if(slots.size===2)slots.clear();else {slots.add('morning');slots.add('afternoon');}
  } else if(slots.has(mode))slots.delete(mode);else slots.add(mode);
  draft.dates=draft.dates.filter(d=>d!==date);draft.sessions=draft.sessions.filter(s=>s.date!==date);
  if(slots.size===2)draft.dates.push(date);else for(const session of slots)draft.sessions.push({date,session});
  draft.dates.sort();draft.sessions=sortedSessions(draft.sessions);render();
}
async function resetCalendarDraft() {
  if(!canEditSetup())return;
  if(calendarDirty()&&!await appConfirm('Bỏ các ngày nghỉ vừa chọn nhưng chưa lưu?'))return;
  ui.calendarDraft=null;render();
}
/**
 * Chỉ Admin lưu lịch nghỉ; gửi revision và kiểm tra khả năng API hỗ trợ nghỉ theo buổi trước khi
 * ghi.
 */
async function saveSchoolCalendar() {
  if(!canEditSetup()||isRolePreview()||!calendarDirty())return;
  const draft=calendarDraft(),context={owner:auth.email,epoch:cloud.epoch},payload={excludedDates:[...draft.dates].sort(),excludedSessions:sortedSessions(draft.sessions),revision:draft.revision};
  if(cloud.ready) {
    if(!schoolCalendar().supportsSessions)return appAlert('Cần triển khai API mới trên Cloudflare để lưu lịch nghỉ sáng/chiều. Các lựa chọn đang được giữ trên màn hình.');
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
    appData.calendar={excludedDates:payload.excludedDates,excludedSessions:payload.excludedSessions,revision:payload.revision+1};
    if(!save()){appData.calendar=previous;return;}
    ui.calendarDraft=null;render();toast('Đã lưu lịch không gặp trên thiết bị này.');
  }
}
function renderSchoolCalendar() {
  if(!hasAppRole('admin'))return '';
  const draft=calendarDraft(),selected=new Set([...draft.dates,...draft.sessions.map(s=>s.date)]),month=ui.calendarMonth||ui.month;
  ui.calendarMonth=month;
  const dates=scheduleMonthDates(month),offset=(new Date(dates[0]+'T12:00:00').getDay()+6)%7,dirty=calendarDirty();
  const disabled=!canEditSetup()||isRolePreview();
  return `<div class="section-head"><h2>Năm học 2026–2027</h2><span class="pill">${draft.dates.length} ngày nghỉ cả ngày · ${draft.sessions.length} buổi nghỉ riêng</span></div>
    <section class="card school-calendar"><p class="help">Chọn Cả ngày, Sáng hoặc Chiều rồi bấm ngày để bật/tắt nghỉ tương ứng. Xếp lịch tự động bỏ qua đúng buổi đã lưu; buổi còn lại vẫn xếp được. Lịch hẹn đã có vẫn giữ nguyên.</p>
    <div class="calendar-session-mode" role="group" aria-label="Chọn buổi nghỉ">${[['all','Cả ngày'],['morning','Sáng'],['afternoon','Chiều']].map(([key,label])=>`<button type="button" class="schedule-choice" aria-pressed="${(ui.calendarSession||'all')===key}" onclick="selectCalendarSession('${key}')">${label}</button>`).join('')}</div>
    <div class="calendar-months" role="group" aria-label="Chọn tháng">${SCHOOL_CALENDAR_MONTHS.map(m=>`<button type="button" class="schedule-choice" aria-pressed="${m===month}" onclick="selectCalendarMonth('${m}')">${esc(m)}</button>`).join('')}</div>
    <div class="school-calendar-body"><div><h3>${esc(month)}</h3><div class="schedule-calendar">${['T2','T3','T4','T5','T6','T7','CN'].map(day=>`<div class="calendar-heading">${day}</div>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${dates.map(date=>{
      const display=date.split('-').reverse().join('/'),weekend=[0,6].includes(new Date(date+'T12:00:00').getDay());
      const label=calendarDayLabel(draft,date);
      return `<button type="button" class="calendar-day ${weekend?'calendar-weekend':''}" aria-label="${display}${label?' · '+label:''}" aria-pressed="${selected.has(date)}" ${disabled?'disabled':''} onclick="toggleExcludedDate('${date}')"><b>${Number(date.slice(8))}</b><small>${label}</small></button>`;
    }).join('')}</div></div>
    <div><h3>Ngày đã chọn trong tháng</h3><div class="calendar-selected">${dates.filter(d=>selected.has(d)).map(date=>`<span class="pill">${esc(date.split('-').reverse().join('/'))} · ${calendarDayLabel(draft,date)}</span>`).join('')||'<p class="help">Chưa chọn ngày nghỉ trong tháng này.</p>'}</div>
    <p class="help">${dirty?'Có thay đổi chưa lưu.':'Lịch đã lưu.'}${draft.revision!==schoolCalendar().revision?' Lịch máy chủ đã thay đổi; hãy bỏ bản đang chọn và tải lại trước khi lưu.':''}</p>
    <div class="actions">${disabled?'':`<button type="button" class="btn primary" onclick="saveSchoolCalendar()" ${dirty?'':'disabled'}>Lưu lịch không gặp</button>${btn('Bỏ thay đổi','resetCalendarDraft()')}`}</div></div></div></section>`;
}
