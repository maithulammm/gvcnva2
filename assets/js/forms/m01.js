"use strict";

// Planned visits remain separate from actual M02 meetings.
function renderM01() {
  const c=cls(),m=mdata(),canEdit=editable();
  return `<section class="m01-section"><div class="section-head"><h2>Lịch gặp của lớp ${esc(c.id)} · ${esc(ui.month)}</h2><div class="actions">
    <span class="pill">${monthlyAppointments().length} lịch · ${plannedStudentIds(c,m).length}/${c.students.length} HS</span>
    ${canEdit?btn('Tự động xếp lịch tháng','autoScheduleMonth()','primary'):''}${monthlyAppointments().length?btn('Xuất Excel lịch gặp','exportSchedule()'):''}${btn('Đến Mẫu 02',"navTo('m02')")}</div></div>
    <p class="help">T2–T6: sáng 9:55–10:15, chiều 15:00–15:20.${Number(c.grade)===12?' Lớp 12 thêm sáng thứ 7.':''} Mỗi học sinh tối đa 3 lịch hẹn, hai buổi cùng ngày gặp hai học sinh khác nhau.</p>
    <div class="card no-pad"><div class="table-wrap"><table class="m01-table"><thead><tr><th>STT</th><th>Học sinh</th><th>Lịch dự kiến</th><th>Mục tiêu</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
    ${c.students.map((student,index)=>{
      const appointments=studentAppointments(c,ui.month,student.id);
      const schedule=m.schedule[student.id]||{},hasGoal=appointments.some(a=>a.goal)||(!appointments.length&&schedule.goal),hasNote=appointments.some(a=>a.note)||(!appointments.length&&schedule.note);
      return `<tr><td>${index+1}</td><td><b>${esc(student.name)}</b></td>
        <td class="m01-dates">${appointments.map((a,i)=>`<div class="m01-entry"><b>Lần ${i+1}</b> · ${esc(a.planTime)}${m.meetings.some(r=>r.appointmentId===a.id)?' · Đã ghi nhận':''}</div>`).join('')||'Chưa hẹn'}</td>
        <td class="long ${hasGoal?'':'m01-empty'}">${appointments.map((a,i)=>`<div class="m01-entry ${a.goal?'':'is-empty'}"><span class="m01-entry-label">Lần ${i+1} · </span>${esc(a.goal||'—')}</div>`).join('')||esc(schedule.goal||'—')}</td>
        <td class="long ${hasNote?'':'m01-empty'}">${appointments.map((a,i)=>`<div class="m01-entry ${a.note?'':'is-empty'}"><span class="m01-entry-label">Lần ${i+1} · </span>${esc(a.note||'—')}</div>`).join('')||esc(schedule.note||'—')}</td>
        <td class="m01-controls"><div class="m01-actions"><div class="m01-edit-list">${canEdit?appointments.map((a,i)=>`<div class="m01-edit-row">${btn('Sửa lần '+(i+1),`openStudentAppointment('${student.id}','${a.id}')`,'small')}${m.meetings.some(r=>r.appointmentId===a.id)?'':btn('Dời lịch',`rescheduleAppointment('${student.id}','${a.id}')`,'small')}</div>`).join(''):'—'}</div>${canEdit&&appointments.length<3?btn('Hẹn gặp',`openStudentAppointment('${student.id}')`,'small m01-add'):''}</div></td></tr>`;
    }).join('')||'<tr><td colspan="6">Chưa có danh sách học sinh.</td></tr>'}</tbody></table></div></div></section>`;
}
