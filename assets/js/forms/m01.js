"use strict";

// Planned visits remain separate from actual M02 meetings.
function renderM01() {
  const c=cls(),m=mdata(),canEdit=editable();
  return `<div class="section-head"><h2>Lịch gặp của lớp ${esc(c.id)} · ${esc(ui.month)}</h2><div class="actions">
    <span class="pill">${monthlyAppointments().length} lịch · ${plannedStudentIds(c,m).length}/${c.students.length} HS</span>
    ${canEdit?btn('Tự động xếp lịch tháng','autoScheduleMonth()','primary'):''}${btn('Đến Mẫu 02',"navTo('m02')")}</div></div>
    <p class="help">T2–T6: sáng 9:55–10:15, chiều 15:00–15:20.${Number(c.grade)===12?' Lớp 12 thêm sáng thứ 7.':''} Mỗi học sinh tối đa 3 lịch hẹn, hai buổi cùng ngày gặp hai học sinh khác nhau.</p>
    <div class="card no-pad"><div class="table-wrap"><table><thead><tr><th>STT</th><th>Học sinh</th><th>Lịch dự kiến</th><th>Mục tiêu</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
    ${c.students.map((student,index)=>{
      const appointments=studentAppointments(c,ui.month,student.id);
      return `<tr><td>${index+1}</td><td><b>${esc(student.name)}</b></td>
        <td>${appointments.map((a,i)=>`<div class="marg-top"><b>Lần ${i+1}</b> · ${esc(a.planTime)}${m.meetings.some(r=>r.appointmentId===a.id)?' · Đã ghi nhận':''}</div>`).join('')||'Chưa hẹn'}</td>
        <td class="long">${appointments.map(a=>`<div class="marg-top">${esc(a.goal||'—')}</div>`).join('')||esc(m.schedule[student.id]?.goal||'—')}</td>
        <td class="long">${appointments.map(a=>`<div class="marg-top">${esc(a.note||'—')}</div>`).join('')}</td>
        <td><div class="stack">${canEdit&&appointments.length<3?btn('Hẹn gặp',`openStudentAppointment('${student.id}')`,'small'):''}
        ${canEdit?appointments.map((a,i)=>`<div class="actions">${btn('Sửa lần '+(i+1),`openStudentAppointment('${student.id}','${a.id}')`,'small')}${m.meetings.some(r=>r.appointmentId===a.id)?'':btn('Xóa',`removeAppointment('${student.id}','${a.id}')`,'small danger')}</div>`).join(''):''}</div></td></tr>`;
    }).join('')||'<tr><td colspan="6">Chưa có danh sách học sinh.</td></tr>'}</tbody></table></div></div>`;
}
