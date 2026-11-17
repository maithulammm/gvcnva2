"use strict";

// M01: student meeting schedule.

function renderM01() {
  let c = cls(),
    m = mdata(),
    v = validations(c, ui.month);
  return `<div class="section-head"><h2>Lịch gặp của lớp ${c.id} · ${ui.month}</h2><div class="actions"><span class="pill">${c.students.length} HS</span><span class="pill">${plannedStudentIds(c, m).length} đã lên kế hoạch</span>${btn("Đến Mẫu 02", "navTo('m02')")}</div></div><p class="help">Trạng thái “Đã gặp” và thời gian thực tế được tự cập nhật từ Mẫu 02. Muốn ghi nhận cuộc gặp, nhập một lượt ở Mẫu 02.</p><div class="card no-pad"><div class="table-wrap"><table><thead><tr><th>STT</th><th>Học sinh</th><th>Ưu tiên</th><th>Nội dung / mục tiêu</th><th>Ngày giờ / nơi dự kiến</th><th>Ngày giờ thực tế</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr></thead><tbody>${
    c.students
      .map((s, i) => {
        let a = m.schedule[s.id] || {},
          meet = m.meetings.filter((x) => x.studentId === s.id),
          status = meet.length ? "Đã gặp" : a.status || "Chưa gặp";
        return `<tr><td>${i + 1}</td><td><b>${esc(s.name)}</b></td><td>${a.priority ? statusTag("Ưu tiên") : "—"}</td><td class="long">${esc(a.goal || "—")}</td><td class="long">${esc(a.planTime || "—")}</td><td class="long">${esc(meet[0]?.actual || "—")}</td><td>${statusTag(status)}</td><td class="long">${esc(a.note || "")}</td><td>${editable() ? btn("Sửa lịch", `openModal('m01','${s.id}')`, "small") : "—"}</td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="9"><div class="empty">Chưa có học sinh. Hãy nhập Excel trong mục Danh sách học sinh.</div></td></tr>'
  }</tbody></table></div></div>`;
}
