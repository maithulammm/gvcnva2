"use strict";

// Dashboard for assigned class, grade and school.
/**
 * GVCN xem lịch hôm nay và tiến độ lớp; các vai trò quản lý xem tổng hợp trong phạm vi phân công,
 * không tự mở nội dung cá nhân.
 */
function renderDashboard() {
  let scope = scopedClasses();
  let results = scope.map((x) => summarize(cls(x), ui.month));
  let all = {
    count: results.reduce((a, x) => a + x.count, 0),
    met: results.reduce((a, x) => a + x.met, 0),
    meetings: results.reduce((a, x) => a + x.meetings, 0),
    plannedMeetings: results.reduce((a, x) => a + (x.plannedMeetings||0), 0),
    connections: results.reduce((a, x) => a + x.connections, 0),
    supportPlans: results.reduce((a, x) => a + x.supportPlans, 0),
  };
  let reporting = results.filter(
    (x) => validations(cls(x.classId), ui.month).hasData,
  ).length;
  let h = kpis([
    [
      ui.role === "gvcn" ? "Sĩ số lớp" : "Tổng số học sinh",
      nfmt(all.count),
      scope.length + " lớp trong phạm vi",
    ],
    [
      "Học sinh đã gặp",
      nfmt(all.met),
      all.count
        ? percent(((100 * all.met) / all.count).toFixed(1))
        : "Chưa có sĩ số",
    ],
    ["Lượt gặp", `${nfmt(all.meetings)}/${nfmt(all.plannedMeetings)}`, "Thực tế / dự kiến"],
    [
      "Lượt kết nối PHHS",
      nfmt(all.connections),
      "Thông điệp tích cực đã gửi",
    ],
  ]);
  if (ui.role === "gvcn") {
    let c = cls(),
      s = results[0],
      m = mdata();
    let v = validations(c, ui.month);
    let ungap = c.students.filter(
      (st) => !m.meetings.some((r) => r.studentId === st.id),
    );
    let unconn = c.students.filter(
      (st) => !m.connections.some((r) => r.studentId === st.id),
    );
    h += `<div class="cols2"><section class="card"><div class="section-head" style="margin-top:0"><h2>Tiến độ lớp ${c.id}</h2>${statusTag(stageName(s.state))}</div><div class="stack"><div><div class="filterline" style="justify-content:space-between"><b>Gặp gỡ học sinh</b><span>${s.met}/${s.count}</span></div><div class="bar"><i style="width:${Math.min(s.rate, 100)}%"></i></div></div><div><div class="filterline" style="justify-content:space-between"><b>HS đã có kết nối PHHS · thống kê</b><span>${s.connectedStudents}/${s.count}</span></div><div class="bar"><i style="width:${s.count ? Math.min(100, (100 * s.connectedStudents) / s.count) : 0}%"></i></div></div></div></section><section class="card"><div class="section-head" style="margin-top:0"><h2>Cần theo dõi</h2><span class="pill">${v.errors.length} lỗi · ${v.warnings.length} chú ý</span></div><b>${ungap.length} học sinh chưa có lượt gặp trong tháng</b><div class="help">${esc(
      ungap
        .slice(0, 6)
        .map((x) => x.name)
        .join(", ") || "Không có",
    )} ${ungap.length > 6 ? "…" : ""}</div><b>${unconn.length} học sinh chưa có lượt kết nối</b><div class="help">${esc(
      unconn
        .slice(0, 6)
        .map((x) => x.name)
        .join(", ") || "Không có",
    )} ${unconn.length > 6 ? "…" : ""}</div></section></div>`;
    const nowParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).split('-');
    const todayMonth=`T${nowParts[1]}/${nowParts[0]}`;
    return renderTodayWork(c,!isRolePreview()||isAdminClassEditing(),todayMonth)+h;
  }
  h += `<div class="section-head"><h2>Bảng theo dõi ${ui.grade === "all" ? "toàn trường" : "khối " + ui.grade}</h2><div class="actions">${btn("Xuất Excel tổng hợp", "exportSchool()", "primary")}<span class="pill">${reporting}/${scope.length} lớp đã có dữ liệu</span></div></div><section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Lớp</th><th>GVCN</th><th>Sĩ số</th><th>Đã gặp / sĩ số</th><th>Tỷ lệ</th><th>Lượt gặp<br><small>Thực tế / dự kiến</small></th><th>Kết nối PHHS</th><th>KH hỗ trợ</th><th>Kiểm tra</th><th>Trạng thái</th></tr></thead><tbody>${results
    .filter(s=>dashboardMatches(s))
    .map((s) => {
      let v = validations(cls(s.classId), ui.month);
      return `<tr><td><b>${s.classId}</b></td><td>${esc(s.teacher || "Chưa gán")}</td><td>${s.count || "—"}</td><td>${s.met}/${s.count}</td><td style="min-width:128px"><div class="bar"><i style="width:${Math.min(s.rate, 100)}%"></i></div><small>${percent(s.rate)}</small></td><td>${s.meetings}/${s.plannedMeetings||0}</td><td>${s.connections}</td><td>${s.supportPlans}<div class="hint">${esc(supportReviewLabel(s.supportReview))}</div></td><td>${v.hasData ? statusTag(v.errors.length ? "Còn lỗi" : v.warnings.length ? "CHÚ Ý" : "Hợp lệ") : "Chưa nhập"}</td><td>${statusTag(stageName(s.state))}</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div></section>`;
  return renderDashboardFilters()+h;
}

function renderDashboardFilters(){
  return `<div class="actions" role="group" aria-label="Lọc lớp cần hỗ trợ">${[['all','Tất cả'],['unsubmitted','Chưa gửi báo cáo'],['overdue','Có lịch quá hạn chưa ghi nhận'],['coordination','Có học sinh cần phối hợp']].map(([key,label])=>`<button type="button" class="btn ${(!ui.dashboardFilter&&key==='all'||ui.dashboardFilter===key)?'primary':''}" aria-pressed="${(ui.dashboardFilter||'all')===key}" onclick="ui.dashboardFilter='${key}';render()">${label}</button>`).join('')}</div>`;
}
function dashboardMatches(s){
  if(ui.dashboardFilter==='unsubmitted')return ['draft','returned'].includes(s.state);
  if(ui.dashboardFilter==='coordination')return (s.coordination||0)>0;
  if(ui.dashboardFilter==='overdue')return (s.overdueAppointments||0)>0;
  return true;
}
