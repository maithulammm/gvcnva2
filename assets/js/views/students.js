"use strict";

// Student roster page.

function renderStudents() {
  let c = cls();
  return `<div class="section-head"><h2>Lớp ${c.id} · ${c.students.length} học sinh</h2><div class="actions">${canEditSetup() ? btn("Thông tin GVCN", "openModal('teacher')") + btn("Nhập Excel danh sách", "$('xlsxInput').click()", "primary") + btn("Thêm học sinh", "openModal('student')") : "Xem danh sách"}</div></div><div class="card" style="margin-bottom:15px"><div class="filterline"><span class="pill">GVCN: ${esc(c.teacher || "Chưa cập nhật")}</span><span class="pill">Email Microsoft: ${esc(c.email || "Chưa nhập")}</span><span class="pill">Khối ${c.grade}</span></div></div><div class="card no-pad"><div class="table-wrap"><table><thead><tr><th>STT</th><th>Họ tên học sinh</th><th>Gặp tháng này</th><th>Kết nối PHHS</th><th>Thao tác</th></tr></thead><tbody>${c.students.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.name)}</b></td><td>${mdata().meetings.filter((x) => x.studentId === s.id).length} lượt</td><td>${mdata().connections.filter((x) => x.studentId === s.id).length} lượt</td><td>${canEditSetup() ? btn("Sửa", `openModal('student','${s.id}')`, "small") + btn("Xóa", `removeRecord('student','${s.id}')`, "small danger") : "—"}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty"><div class="big">☷</div>Chưa có danh sách. Nhập tệp Excel để bắt đầu.</div></td></tr>`}</tbody></table></div></div>`;
}
