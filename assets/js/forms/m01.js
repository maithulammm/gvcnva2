"use strict";

// Planned visits remain separate from actual M02 meetings.
function scheduleActionIcon(kind,label,call,number='') {
  const paths={edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',move:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h8m-3-3 3 3-3 3"/>',add:'<path d="M12 5v14M5 12h14"/>'};
  return `<button type="button" class="btn small schedule-icon ${kind==='add'?'m01-add':''}" title="${esc(label)}" aria-label="${esc(label)}" onclick="${esc(call)}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>${number?`<span class="schedule-icon-number" aria-hidden="true">${number}</span>`:''}</button>`;
}
function renderM01() {
  const c=cls(),m=mdata(),canEdit=editable();
  return `<section class="m01-section"><div class="section-head"><h2>Lịch gặp của lớp ${esc(c.id)} · ${esc(ui.month)}</h2><div class="actions">
    <span class="pill">${monthlyAppointments().length} lịch · ${plannedStudentIds(c,m).length}/${c.students.length} HS</span>
    ${canEdit?btn('Tự động xếp lịch tháng','autoScheduleMonth()','primary'):''}${monthlyAppointments().length?btn('Xuất Excel lịch gặp','exportSchedule()'):''}${btn('Đến Mẫu 02',"navTo('m02')")}</div></div>
    <div class="card no-pad"><div class="table-wrap"><table class="m01-table"><thead><tr><th>${canEdit?'<input type="checkbox" data-schedule-select-all aria-label="Chọn tất cả học sinh đang hiển thị" onchange="selectAllScheduleStudents(this.checked)"> ':''}STT</th><th>Học sinh</th><th>Lịch dự kiến</th><th>Mục tiêu</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
    ${c.students.map((student,index)=>{
      const appointments=studentAppointments(c,ui.month,student.id);
      const schedule=m.schedule[student.id]||{},hasGoal=appointments.some(a=>a.goal)||(!appointments.length&&schedule.goal),hasNote=appointments.some(a=>a.note)||(!appointments.length&&schedule.note);
      return `<tr><td class="schedule-selection-cell">${canEdit?`<input type="checkbox" data-select-student="${esc(student.id)}" aria-label="Chọn lịch của ${esc(student.name)}" ${scheduleSelection().has(student.id)?'checked':''} ${appointments.length?'':'disabled'} onchange="selectScheduleStudent('${student.id}',this.checked)"> `:''}<span>${index+1}</span></td><td><b>${esc(student.name)}</b></td>
        <td class="m01-dates">${appointments.map((a,i)=>`<div class="m01-entry m01-appointment-line"><span class="m01-visit-label"><b>Lần ${i+1}</b>${canEdit?scheduleActionIcon('edit','S\u1eeda l\u1ea7n '+(i+1),`openStudentAppointment('${student.id}','${a.id}')`):''}</span> · ${esc(displayDateText(a.planTime))}${m.meetings.some(r=>r.appointmentId===a.id)?' · Đã ghi nhận':''}</div>`).join('')||'Chưa hẹn'}</td>
        <td class="long ${hasGoal?'':'m01-empty'}">${appointments.map((a,i)=>`<div class="m01-entry ${a.goal?'':'is-empty'}"><span class="m01-entry-label">Lần ${i+1} · </span>${esc(a.goal||'—')}</div>`).join('')||esc(schedule.goal||'—')}</td>
        <td class="long ${hasNote?'':'m01-empty'}">${appointments.map((a,i)=>`<div class="m01-entry ${a.note?'':'is-empty'}"><span class="m01-entry-label">Lần ${i+1} · </span>${esc(a.note||'—')}</div>`).join('')||esc(schedule.note||'—')}</td>
        <td class="m01-controls"><div class="m01-actions">${canEdit?scheduleActionIcon('add','Hẹn gặp',`openStudentAppointment('${student.id}')`):''}</div></td></tr>`;
    }).join('')||'<tr><td colspan="6">Chưa có danh sách học sinh.</td></tr>'}</tbody></table></div></div></section>`;
}
