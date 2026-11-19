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
  ui.workSearch=value;
  const query = value.trim().toLocaleLowerCase("vi");
  for (const row of $("workStudents").querySelectorAll("tr[data-search]"))
    row.hidden = !row.dataset.search.includes(query) || (ui.workFilter!=='all'&&!row.dataset.filters.split(' ').includes(ui.workFilter));
}

function selectWorkFilter(filter) {
  if(!['all','today','unmet','unconnected','overdue','drafts'].includes(filter))return;
  ui.workFilter=filter;render();
}

function monthlyWorkDrafts() {
  if(isRolePreview())return [];
  const prefix=`VA_GVCN_FORM_DRAFT_V1_${encodeURIComponent(auth.email)}_${ui.classId}_${ui.month.replace('/','_')}_`, drafts=[];
  try {
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(!key?.startsWith(prefix))continue;
      const d=JSON.parse(localStorage.getItem(key)), context=d?.context;
      if(d?.schema!==1||!context||context.owner!==auth.email||context.classId!==ui.classId||context.month!==ui.month||!DRAFT_TYPES.includes(context.type))continue;
      if(!cls().students.some(s=>s.id===context.studentId))continue;
      drafts.push({key,...d});
    }
  } catch { /* Unavailable device storage must not block the workspace. */ }
  return drafts.sort((a,b)=>a.key.localeCompare(b.key));
}

function openMonthlyDraft(index) {
  const d=monthlyWorkDrafts()[index];
  if(!d||!editable())return;
  if(d.baseline!==stableString(lookup(d.context.type,d.context.id)||{})) {
    toast('Dữ liệu đã thay đổi sau khi tạo bản nháp. Bản nháp vẫn được giữ trên máy.');return;
  }
  openModal(d.context.type,d.context.id,{...d.context.seed,draftKey:d.key});
}

function workStudentFlags(c,month,studentId,today=workToday(),drafts=[]) {
  const m=mdata(c,month,false), appointments=studentAppointments(c,month,studentId);
  const pending=appointments.filter(a=>!m.meetings.some(r=>r.appointmentId===a.id));
  return [!m.meetings.some(r=>r.studentId===studentId)&&'unmet',
    !m.connections.some(r=>r.studentId===studentId)&&'unconnected',
    today&&appointments.some(a=>scheduleSlot(a).date===today)&&'today',
    today&&pending.some(a=>scheduleSlot(a).date&&scheduleSlot(a).date<today)&&'overdue',
    drafts.some(d=>d.context.studentId===studentId)&&'drafts'].filter(Boolean);
}

function openTodayMeeting(month,studentId,appointmentId){
  if(!MONTHS.includes(month))return;
  ui.month=month;render();openScheduledMeeting(studentId,appointmentId);
}
function renderTodayWork(c,canEdit,month) {
  const today=month?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()):workToday();
  month ||= ui.month;
  if(!today)return '';
  if(`T${today.slice(5,7)}/${today.slice(0,4)}`!==month)return '';
  const m=mdata(c,month,false), appointments=monthlyAppointments(c,month).filter(a=>scheduleSlot(a).date===today);
  return `<section class="card marg-top"><h2>Lịch gặp hôm nay · ${esc(today.split('-').reverse().join('/'))}</h2><div class="today-grid">${['morning','afternoon',...(appointments.some(a=>a.session==='other')?['other']:[])].map(session=>{
    const entries=appointments.filter(a=>scheduleSlot(a).session===session);
    return `<div class="meeting-reference"><b>${MEETING_SESSIONS[session].label} · ${MEETING_SESSIONS[session].time}</b>${entries.map(a=>{
      const done=m.meetings.some(r=>r.appointmentId===a.id);
      return `<p><b>${esc(studentName(c,a.studentId))}</b></p><p>${session==='other'?esc(displayDateText(a.planTime))+' ? ':''}${esc(a.goal||'')}</p><p>${done?'✓ Đã ghi nhận':'Chưa ghi nhận'}</p>${canEdit?btn(done?'Xem cuộc gặp':'Ghi nhận cuộc gặp',`openTodayMeeting('${month}','${a.studentId}','${a.id}')`,'small'):''}`;
    }).join('')||'<p>Chưa có lịch hẹn.</p>'}</div>`;
  }).join('')}</div></section>`;
}

function renderMonthlyWork() {
  const c=cls(), m=mdata(c,ui.month,false), s=summarize(c,ui.month), v=validations(c,ui.month);
  const canEdit=editable(), carry=previousMonthPlans(c);
  const scope=`${auth.email}|${ui.classId}|${ui.month}|${isRolePreview()}`;
  if(ui.workFilterScope!==scope){ui.workFilterScope=scope;ui.workFilter='all';ui.workSearch='';}
  const drafts=monthlyWorkDrafts(), flags=new Map(c.students.map(st=>[st.id,workStudentFlags(c,ui.month,st.id,workToday(),drafts)]));
  const action=(label,type,id)=>btn(label,`openWorkEntry('${type}','${id}')`,"small");
  return `<div class="section-head"><h2>Lớp ${esc(c.id)} · ${esc(ui.month)}</h2>
    ${btn("Kiểm tra & gửi báo cáo", "navTo('check')", "primary")}</div>
    ${kpis([["Đã gặp",`${s.met}/${s.count}`],["Lượt gặp thực tế / dự kiến",`${s.meetings}/${s.plannedMeetings||0}`],["Kết nối PHHS",s.connections],["Kế hoạch hỗ trợ",s.supportPlans]])}
    ${renderTodayWork(c,canEdit)}
    ${!canEdit ? '<p class="readonly">Đang xem dữ liệu. Chỉ GVCN phụ trách hoặc Admin được ghi nhận khi tháng còn mở; chế độ xem thử chỉ cho phép xem.</p>' : ''}
    <section class="card"><div class="section-head"><h2>Ghi nhận theo học sinh</h2>
      <input class="work-search" type="search" aria-label="Tìm học sinh" placeholder="Tìm tên học sinh…" value="${esc(ui.workSearch||'')}" oninput="filterMonthlyWork(this.value)"></div>
    <div class="work-filters">${[['all','Tất cả'],['today','Hôm nay'],['unmet','Chưa gặp'],['unconnected','Chưa kết nối PHHS'],['overdue','Quá ngày chưa ghi'],['drafts','Có bản nháp']].map(([key,label])=>`<button type="button" aria-pressed="${ui.workFilter===key}" onclick="selectWorkFilter('${key}')">${label} (${key==='all'?c.students.length:c.students.filter(st=>flags.get(st.id).includes(key)).length})</button>`).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>Học sinh</th><th>Lịch / việc tiếp theo</th><th>Đã ghi nhận</th><th>Thao tác</th></tr></thead><tbody id="workStudents">
    ${c.students.map(st=>{
      const meetings=m.meetings.filter(r=>r.studentId===st.id), contacts=m.connections.filter(r=>r.studentId===st.id);
      const schedule=m.schedule[st.id]||{}, plan=m.plans.find(p=>p.studentId===st.id&&p.result!=="Đạt");
      const search=(st.name+' '+(st.code||'')).toLocaleLowerCase('vi'), tags=flags.get(st.id);
      const hidden=!search.includes((ui.workSearch||'').trim().toLocaleLowerCase('vi'))||(ui.workFilter!=='all'&&!tags.includes(ui.workFilter));
      return `<tr ${hidden?'hidden':''} data-filters="${tags.join(' ')}" data-search="${esc(search)}"><td><b>${esc(st.name)}</b></td>
        <td><div class="work-appointments">${esc(schedule.planTime||'Chưa hẹn lịch')}</div><div class="hint work-appointments">${esc(schedule.goal||plan?.goal||'')}</div></td>
        <td>${meetings.length} lượt gặp · ${contacts.length} kết nối${meetings.length?'<div class="hint">Đã gặp</div>':''}</td>
        <td><div class="actions">${canEdit?action('Ghi cuộc gặp','m02',st.id)+action('Kết nối PHHS','m03',st.id)+action('Hẹn gặp','m01',st.id)+action('Kế hoạch','plans',st.id)+drafts.map((d,i)=>d.context.studentId===st.id?btn('Mở bản nháp',`openMonthlyDraft(${i})`,'small'):'').join(''):'—'}</div></td></tr>`;
    }).join('')||'<tr><td colspan="4">Chưa có danh sách học sinh.</td></tr>'}</tbody></table></div></section>
    ${carry.length?`<section class="card marg-top"><h2>Kế hoạch chưa hoàn tất từ tháng trước</h2><p class="help">Mở để xem lại, cập nhật thời hạn rồi lưu. Không tự ghi nhận kết quả hoặc hoạt động đã thực hiện.</p>
      <div class="stack">${carry.map(({plan,month})=>`<div class="readonly"><b>${esc(studentName(c,plan.studentId))}</b> · ${esc(plan.goal)}<div class="hint">${esc(month)} · ${esc(plan.result||'Chưa chốt')}</div>${canEdit?btn('Tiếp tục kế hoạch',`continueWorkPlan('${plan.id}')`,'small'):''}</div>`).join('')}</div></section>`:''}
    <section class="card marg-top"><h2>Trước khi gửi tháng</h2><p>${v.errors.length} lỗi cần bổ sung · ${v.warnings.length} chú ý</p>
      <div class="actions">${btn('Xem mục còn thiếu',"navTo('check')")}${btn('Sổ gặp',"navTo('m02')")}${btn('Kết nối PHHS',"navTo('m03')")}${btn('Kế hoạch hỗ trợ',"navTo('m04')")}</div></section>`;
}
