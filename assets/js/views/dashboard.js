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
    return renderDashboardGuide()+renderTodayWork(c,!isRolePreview()||isAdminClassEditing(),todayMonth)+h;
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
  return renderDashboardGuide()+renderDashboardFilters()+h;
}

/** Hướng dẫn chỉ mở các trang trong quyền hiện tại; đọc hướng dẫn không tạo dữ liệu báo cáo. */
function renderDashboardGuide(){
  const personal=canViewPersonal();
  const steps=personal?[
    ['Kiểm tra lớp và tháng','Trên thanh đầu trang, chọn đúng **lớp** và **tháng báo cáo**. Kiểm tra danh sách học sinh trước khi nhập. Nếu chưa đúng, liên hệ QTV để cập nhật.'],
    ['Lập lịch gặp · Mẫu 01','Bấm **+** ở học sinh để hẹn từng em hoặc **Tự động xếp lịch tháng**. Bấm biểu tượng bút cạnh từng lần để chỉnh ngày và giờ. Có thể **Xuất lịch gặp** ra Word hoặc Excel.','m01','Mở Mẫu 01'],
    ['Ghi nhận sau cuộc gặp · Mẫu 02','Sau khi gặp học sinh, chọn **Ghi nhận đã gặp** từ lịch dự kiến hoặc **Thêm lượt gặp**. Kiểm tra ngày/giờ, nhận xét lần trước nếu có, nhập nội dung mới và mục tiêu tiếp theo. Bấm **Lưu thông tin**.','m02','Mở Mẫu 02'],
    ['Ghi kết nối phụ huynh · Mẫu 03','Chỉ ghi lần **đã gửi tin hoặc đã trao đổi thực tế**. Kiểm tra học sinh, ngày, hình thức và người nhận. Thông điệp/phản hồi không bắt buộc; có thể chọn hoặc dán tối đa **2 ảnh minh chứng** cho lần kết nối mới, rồi bấm **Lưu thông tin**.','m03','Mở Mẫu 03'],
    ['Rà soát hỗ trợ trong tháng · Mẫu 04','Mặc định là **Chưa rà soát**. Sau khi kiểm tra lớp, chọn **Không phát sinh hỗ trợ trong tháng** hoặc **Có phát sinh hỗ trợ** và ghi kế hoạch cụ thể. Phần kết quả tháng trước ghi những việc đã thực hiện.','m04','Mở Mẫu 04'],
    ['Theo dõi riêng khi cần · Mẫu 05','Chỉ mở phiếu khi học sinh cần theo dõi liên tục hoặc có mục tiêu riêng. **Không bắt buộc mở cho mọi học sinh**. Mã phiếu tự tạo; các cuộc gặp được ghi tại Mẫu 02 rồi liên kết đúng phiếu Mẫu 05.','m05','Mở Mẫu 05'],
    ['Kiểm tra và gửi báo cáo','Cuối tháng, mở **Kiểm tra & xác nhận**, sửa các lỗi còn thiếu và đọc những điểm cần chú ý. GVCN phụ trách bấm **Gửi BGH xem xét** khi đã rà soát; báo cáo đã gửi chỉ sửa khi được trả lại, QTV có quyền xử lý theo phân công.','check','Kiểm tra báo cáo']
  ]:[
    ['Chọn phạm vi và tháng','Chọn **khối / phạm vi** và **tháng báo cáo** trên thanh đầu trang. Khối trưởng xem các khối được phân công; BGH xem tổng hợp trong phạm vi quyền của mình.'],
    ['Đọc các chỉ số trên Tổng quan','**Học sinh đã gặp** là số học sinh khác nhau. **Lượt gặp** hiển thị thực tế / dự kiến. Một học sinh có nhiều lượt gặp vẫn chỉ được đếm một lần ở số học sinh đã gặp.'],
    ['Lọc các lớp cần theo dõi','Dùng **Chưa gửi báo cáo**, **Có lịch quá hạn chưa ghi nhận**, **Có học sinh cần phối hợp**, **Chưa rà soát M04** hoặc **Có phát sinh, chưa lập kế hoạch** để tìm đúng nhóm lớp.'],
    [hasAppRole('bgh')?'Xem xét báo cáo':'Theo dõi và trao đổi với GVCN',hasAppRole('bgh')?'Vào **Kiểm tra & xác nhận** để xem báo cáo đã gửi và xử lý theo quyền BGH. Số liệu hợp lệ và trạng thái phê duyệt được hiển thị riêng.':'Khối trưởng **chỉ xem tiến độ tổng hợp**. Khi lớp cần bổ sung, trao đổi với GVCN phụ trách; không sửa hoặc duyệt thay lớp.','check','Xem trạng thái báo cáo']
  ];
  return `<details class="card dashboard-guide" ${ui.overviewGuideOpen?'open':''} ontoggle="ui.overviewGuideOpen=this.open"><summary><span class="dashboard-guide-symbol" aria-hidden="true">?</span><span><strong>Hướng dẫn cho người mới</strong><small>${personal?'7 bước từ lập lịch đến gửi báo cáo':'Các bước đọc tiến độ và theo dõi báo cáo'}</small></span><span class="dashboard-guide-arrow" aria-hidden="true">▾</span></summary><div class="dashboard-guide-body"><p class="help">${personal?'Bắt đầu từ bước 1. Ghi nhận đúng những việc đã thực hiện; các mẫu theo phát sinh được dùng khi có nhu cầu.':'Theo dõi dữ liệu trong phạm vi tài khoản được phân công. Nội dung gặp riêng của học sinh được giới hạn theo quyền.'}</p><div class="form-help-quick"><ol>${steps.map(([title,body,page,label],index)=>`<li><div class="guide-step-heading"><span class="guide-step-number" aria-hidden="true">${index+1}</span><h4>${title}</h4></div><p>${guideText(body)}</p>${page?`<div class="dashboard-guide-action">${btn(label,`navTo('${page}')`,'small')}</div>`:''}</li>`).join('')}</ol></div><aside class="guide-key-note"><span class="guide-note-symbol" aria-hidden="true">!</span><div><h4>Nhớ phân biệt ba trạng thái</h4><p>${guideText('**Lịch dự kiến** là kế hoạch. **Đã ghi nhận** là việc thực tế đã nhập. **Dấu tích xanh** xác nhận đồng bộ dữ liệu; trạng thái BGH xem xét/phê duyệt được hiển thị riêng trong báo cáo.')}</p></div></aside>${personal?`<details class="guide-more"><summary>Đọc nhanh các tình huống thường gặp</summary><ul><li>Gặp ngoài lịch: thêm lượt gặp ở Mẫu 02 và nhập thời gian thực tế.</li><li>Chưa đủ dữ liệu đánh giá tiến bộ: chọn <strong>Chưa đủ căn cứ</strong>.</li><li>Chưa có trường hợp hỗ trợ: rà soát Mẫu 04 rồi chọn <strong>Không phát sinh hỗ trợ trong tháng</strong>.</li><li>Nhập bằng điện thoại: bấm dòng tên học sinh hoặc mũi tên để mở nội dung và thao tác.</li><li>Đang lưu: chờ tiến trình hoàn tất. Nếu báo lỗi, giữ bản nháp và thử đồng bộ lại; chưa coi dữ liệu là đã lưu thành công.</li></ul></details>`:''}</div></details>`;
}

function renderDashboardFilters(){
  const scope=scopedClasses().map(id=>summarize(cls(id),ui.month));
  const filters=[['all','Tất cả'],['unsubmitted','Chưa gửi báo cáo'],['overdue','Có lịch quá hạn chưa ghi nhận'],['coordination','Có học sinh cần phối hợp'],['support-unreviewed','Chưa rà soát M04'],['support-missing-plan','Có phát sinh, chưa lập kế hoạch']];
  return `<div class="actions" role="group" aria-label="Lọc lớp cần hỗ trợ">${filters.map(([key,label])=>{
    const count=key==='support-unreviewed'?scope.filter(s=>(s.supportReview||'pending')==='pending').length:key==='support-missing-plan'?scope.filter(s=>s.supportReview==='needed'&&!s.supportPlans).length:null;
    return `<button type="button" class="btn ${(!ui.dashboardFilter&&key==='all'||ui.dashboardFilter===key)?'primary':''}" aria-pressed="${(ui.dashboardFilter||'all')===key}" onclick="ui.dashboardFilter='${key}';render()">${label}${count!==null?` (${count})`:''}</button>`;
  }).join('')}</div>`;
}
function dashboardMatches(s){
  if(ui.dashboardFilter==='support-unreviewed')return (s.supportReview||'pending')==='pending';
  if(ui.dashboardFilter==='support-missing-plan')return s.supportReview==='needed'&&!s.supportPlans;
  if(ui.dashboardFilter==='unsubmitted')return ['draft','returned'].includes(s.state);
  if(ui.dashboardFilter==='coordination')return (s.coordination||0)>0;
  if(ui.dashboardFilter==='overdue')return (s.overdueAppointments||0)>0;
  return true;
}
