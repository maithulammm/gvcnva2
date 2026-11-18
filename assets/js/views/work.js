"use strict";

// One workspace, backed by the same records used by the five reporting forms.
function previousMonthPlans(c = cls(), month = ui.month) {
  const previousMonth = MONTHS[MONTHS.indexOf(month) - 1];
  if (!previousMonth) return [];
  const current = mdata(c, month, false);
  return mdata(c, previousMonth, false).plans.filter(plan =>
    plan.result !== "Đạt" && c.students.some(s => s.id === plan.studentId) &&
    !current.plans.some(p => p.sourceMonth === previousMonth && p.sourcePlanId === plan.id)
  ).map(plan => ({plan, month: previousMonth}));
}

function openWorkEntry(type, studentId) {
  if (!["m02", "m03", "plans", "m01"].includes(type) || !editable()) return;
  if (!cls().students.some(s => s.id === studentId)) return;
  if (type === "m01") return openStudentAppointment(studentId);
  if (type==='m02') {
    const appointment=monthlyAppointments().find(a=>a.studentId===studentId&&!mdata().meetings.some(r=>r.appointmentId===a.id));
    if(appointment)return openScheduledMeeting(studentId,appointment.id);
  }
  const plan = mdata().plans.find(p => p.studentId === studentId && p.result !== "Đạt");
  const seed = {studentId};
  if (type === "m02") {
    seed.goal = mdata().schedule[studentId]?.goal || plan?.goal || "";
    seed.action = plan?.action || "";
  }
  openModal(type, "", seed);
}

function continueWorkPlan(sourceId) {
  if (!editable()) return;
  const source = previousMonthPlans().find(x => x.plan.id === sourceId);
  if (!source) return;
  const {plan, month} = source;
  openModal("plans", "", {
    studentId:plan.studentId, need:plan.need, goal:plan.goal, action:plan.action,
    cooperation:plan.cooperation, assessment:plan.assessment,
    deadline:"", result:"Chưa chốt", sourceMonth:month, sourcePlanId:plan.id,
  });
}

function filterMonthlyWork(value) {
  const query = value.trim().toLocaleLowerCase("vi");
  for (const row of $("workStudents").querySelectorAll("tr[data-search]"))
    row.hidden = !row.dataset.search.includes(query);
}

function renderMonthlyWork() {
  const c=cls(), m=mdata(c,ui.month,false), s=summarize(c,ui.month), v=validations(c,ui.month);
  const canEdit=editable(), carry=previousMonthPlans(c);
  const action=(label,type,id)=>btn(label,`openWorkEntry('${type}','${id}')`,"small");
  return `<div class="section-head"><h2>Lớp ${esc(c.id)} · ${esc(ui.month)}</h2>
    ${btn("Kiểm tra & gửi báo cáo", "navTo('check')", "primary")}</div>
    ${kpis([["Đã gặp",`${s.met}/${s.count}`],["Lượt gặp",s.meetings],["Kết nối PHHS",s.connections],["Kế hoạch hỗ trợ",s.supportPlans]])}
    ${!canEdit ? '<p class="readonly">Đang xem dữ liệu. Chỉ GVCN phụ trách hoặc Admin được ghi nhận khi tháng còn mở; chế độ xem thử chỉ cho phép xem.</p>' : ''}
    <section class="card"><div class="section-head"><h2>Ghi nhận theo học sinh</h2>
      <input class="work-search" type="search" aria-label="Tìm học sinh" placeholder="Tìm tên hoặc mã học sinh…" oninput="filterMonthlyWork(this.value)"></div>
    <div class="table-wrap"><table><thead><tr><th>Học sinh</th><th>Lịch / việc tiếp theo</th><th>Đã ghi nhận</th><th>Thao tác</th></tr></thead><tbody id="workStudents">
    ${c.students.map(st=>{
      const meetings=m.meetings.filter(r=>r.studentId===st.id), contacts=m.connections.filter(r=>r.studentId===st.id);
      const schedule=m.schedule[st.id]||{}, plan=m.plans.find(p=>p.studentId===st.id&&p.result!=="Đạt");
      return `<tr data-search="${esc((st.name+' '+(st.code||'')).toLocaleLowerCase('vi'))}"><td><b>${esc(st.name)}</b><div class="hint">${esc(st.code||'')}</div></td>
        <td>${esc(schedule.planTime||'Chưa hẹn lịch')}<div class="hint">${esc(schedule.goal||plan?.goal||'')}</div></td>
        <td>${meetings.length} lượt gặp · ${contacts.length} kết nối${meetings.length?'<div class="hint">Đã gặp</div>':''}</td>
        <td><div class="actions">${canEdit?action('Ghi cuộc gặp','m02',st.id)+action('Kết nối PHHS','m03',st.id)+action('Hẹn gặp','m01',st.id)+action('Kế hoạch','plans',st.id):'—'}</div></td></tr>`;
    }).join('')||'<tr><td colspan="4">Chưa có danh sách học sinh.</td></tr>'}</tbody></table></div></section>
    ${carry.length?`<section class="card marg-top"><h2>Kế hoạch chưa hoàn tất từ tháng trước</h2><p class="help">Mở để xem lại, cập nhật thời hạn rồi lưu. Không tự ghi nhận kết quả hoặc hoạt động đã thực hiện.</p>
      <div class="stack">${carry.map(({plan,month})=>`<div class="readonly"><b>${esc(studentName(c,plan.studentId))}</b> · ${esc(plan.goal)}<div class="hint">${esc(month)} · ${esc(plan.result||'Chưa chốt')}</div>${canEdit?btn('Tiếp tục kế hoạch',`continueWorkPlan('${plan.id}')`,'small'):''}</div>`).join('')}</div></section>`:''}
    <section class="card marg-top"><h2>Trước khi gửi tháng</h2><p>${v.errors.length} lỗi cần bổ sung · ${v.warnings.length} chú ý</p>
      <div class="actions">${btn('Xem mục còn thiếu',"navTo('check')")}${btn('Sổ gặp',"navTo('m02')")}${btn('Kết nối PHHS',"navTo('m03')")}${btn('Kế hoạch hỗ trợ',"navTo('m04')")}</div></section>`;
}
