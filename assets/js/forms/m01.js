"use strict";

// Planned visits remain separate from actual M02 meetings.
/**
 * Dựng nút Bootstrap SVG có nhãn truy cập và tooltip; hình sửa đặt cạnh từng lần hẹn, dấu cộng
 * dùng để thêm lịch.
 */
function scheduleActionIcon(kind,label,call,number='') {
  const icons={"edit":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-pencil-square\" viewBox=\"0 0 16 16\">\n  <path d=\"M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z\"/>\n  <path fill-rule=\"evenodd\" d=\"M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5z\"/>\n</svg>","move":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-calendar-event\" viewBox=\"0 0 16 16\">\n  <path d=\"M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z\"/>\n  <path d=\"M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z\"/>\n</svg>","add":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-plus-lg\" viewBox=\"0 0 16 16\">\n  <path fill-rule=\"evenodd\" d=\"M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2\"/>\n</svg>"};
  return `<button type="button" class="btn small schedule-icon ${kind==='add'?'m01-add':''}" title="${esc(label)}" aria-label="${esc(label)}" onclick="${esc(call)}">${icons[kind]}${number?`<span class="schedule-icon-number" aria-hidden="true">${number}</span>`:''}</button>`;
}
/** Dựng các thẻ ngày/buổi/giờ; lịch cũ không rõ giờ vẫn hiển thị nguyên nội dung, không tự suy đoán. */
function scheduleTimeTags(appointment,recorded=false) {
  const slot=scheduleSlot(appointment),session=slot.session;
  if(!slot.date||!['morning','afternoon','other'].includes(session))
    return `<span class="schedule-tags"><span class="schedule-tag">${esc(displayDateText(appointment.planTime||'Chưa hẹn'))}</span></span>`;
  const label=session==='other'?'Giờ khác':MEETING_SESSIONS[session].label;
  const range=appointmentRange({...appointment,...slot}).join('–');
  return `<span class="schedule-tags"><time class="schedule-tag schedule-tag-date" datetime="${esc(slot.date)}">${esc(displayDateText(slot.date))}</time> <span class="schedule-tag schedule-tag-${session}">${label}</span> <span class="schedule-tag schedule-tag-time">${esc(range)}</span>${recorded?'<span class="schedule-tag schedule-tag-recorded" title="Đã ghi nhận"><span aria-hidden="true">✓</span><span class="visually-hidden">Đã ghi nhận</span></span>':''}</span>`;
}
/**
 * Mỗi học sinh một dòng, từng lịch hẹn một hàng nhỏ; quyền sửa quyết định checkbox và các nút thao
 * tác.
 */
function renderM01() {
  const c=cls(),m=mdata(),canEdit=editable();
  return `<section class="m01-section"><div class="section-head"><h2>Lịch gặp của lớp ${esc(c.id)} · ${esc(ui.month)}</h2><div class="actions">
    <span class="pill">${monthlyAppointments().length} lịch · ${plannedStudentIds(c,m).length}/${c.students.length} HS</span>
    ${canEdit?btn('Tự động xếp lịch tháng','autoScheduleMonth()','primary'):''}${monthlyAppointments().length?btn('Xuất lịch gặp','exportSchedule()'):''}${btn('Đến Mẫu 02',"navTo('m02')")}</div></div>
    <div class="card no-pad"><div class="table-wrap"><table class="m01-table"><thead><tr><th>${canEdit?'<input type="checkbox" data-schedule-select-all aria-label="Chọn tất cả học sinh đang hiển thị" onchange="selectAllScheduleStudents(this.checked)"> ':''}STT</th><th>Học sinh</th><th>Lịch dự kiến</th><th>Ưu tiên</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
    ${c.students.map((student,index)=>{
      const appointments=studentAppointments(c,ui.month,student.id);
      const schedule=m.schedule[student.id]||{},hasGoal=appointments.some(a=>a.goal)||(!appointments.length&&schedule.goal),hasNote=appointments.some(a=>a.note)||(!appointments.length&&schedule.note);
      return `<tr data-compact-status="${appointments.length?(appointments.every(a=>m.meetings.some(r=>r.appointmentId===a.id))?'Đã ghi nhận':'Dự kiến'):'Chưa hẹn'}"><td class="schedule-selection-cell">${canEdit?`<input type="checkbox" data-select-student="${esc(student.id)}" aria-label="Chọn lịch của ${esc(student.name)}" ${scheduleSelection().has(student.id)?'checked':''} ${appointments.length?'':'disabled'} onchange="selectScheduleStudent('${student.id}',this.checked)"> `:''}<span>${index+1}</span></td><td><b>${esc(student.name)}</b></td>
        <td class="m01-dates">${appointments.map((a,i)=>`<div class="m01-entry m01-appointment-line"><span class="m01-visit-label"><b>Lần ${i+1}</b>${canEdit?scheduleActionIcon('edit','S\u1eeda l\u1ea7n '+(i+1),`openStudentAppointment('${student.id}','${a.id}')`):''}</span> ${scheduleTimeTags(a,m.meetings.some(r=>r.appointmentId===a.id))}</div>`).join('')||'Chưa hẹn'}</td>
        <td class="m01-priority">${appointments.map((a,i)=>`<label class="m01-entry schedule-priority"><input type="checkbox" aria-label="Ưu tiên lần ${i+1} của ${esc(student.name)}" ${a.priority===true?'checked':''} ${canEdit?'':'disabled'} onchange="setAppointmentPriority('${student.id}','${a.id}',this.checked)"><span class="visually-hidden">Ưu tiên lần ${i+1}</span></label>`).join('')||`<label class="schedule-priority"><input type="checkbox" aria-label="Ưu tiên ${esc(student.name)}" ${schedule.priority===true?'checked':''} ${canEdit?'':'disabled'} onchange="setAppointmentPriority('${student.id}','',this.checked)"><span class="visually-hidden">Ưu tiên</span></label>`}</td>
        <td class="long ${hasNote?'':'m01-empty'}">${appointments.map((a,i)=>`<div class="m01-entry ${a.note?'':'is-empty'}"><span class="m01-entry-label">Lần ${i+1} · </span>${esc(a.note||'—')}</div>`).join('')||esc(schedule.note||'—')}</td>
        <td class="m01-controls"><div class="m01-actions">${canEdit?scheduleActionIcon('add','Hẹn gặp',`openStudentAppointment('${student.id}')`):''}</div></td></tr>`;
    }).join('')||'<tr><td colspan="6">Chưa có danh sách học sinh.</td></tr>'}</tbody></table></div></div></section>`;
}
