"use strict";

// M04: previous results and support plans.

function renderM04() {
  let c = cls(),
    m = mdata();
  let out = "";
  for (let [key, title, desc, columns] of [
    [
      "previous",
      "I. Kết quả hỗ trợ tháng trước",
      "Ghi biện pháp đã thực hiện và kết quả quan sát, không chép kế hoạch cũ.",
      [
        "Học sinh",
        "Biện pháp đã thực hiện",
        "Kết quả quan sát",
        "Nội dung cần tiếp tục",
      ],
    ],
    [
      "plans",
      "II. Kế hoạch hỗ trợ tháng này",
      "Mục tiêu cụ thể, biện pháp, thời hạn, phối hợp và cách đánh giá.",
      [
        "Học sinh",
        "Nhu cầu / điểm mạnh",
        "Mục tiêu cụ thể",
        "Biện pháp / hoạt động",
        "Thời hạn",
        "Người phối hợp",
        "Cách đánh giá",
        "Kết quả",
      ],
    ],
  ]) {
    let list = m[key];
    out += `<div class="section-head"><h2>${title}</h2>${editable() ? btn("＋ Thêm nội dung", `openModal('${key}')`, "primary") : ""}</div><p class="help">${desc}</p><div class="card no-pad"><div class="table-wrap"><table><thead><tr>${columns.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>${list.map((r) => `<tr><td><b>${esc(studentName(c, r.studentId))}</b></td>${(key === "previous" ? [r.action, r.observation, r.next] : [r.need, r.goal, r.action, r.deadline, r.cooperation, r.assessment, r.result || "Chưa chốt"]).map((v) => `<td class="long">${esc(v || "—")}</td>`).join("")}<td>${rowAction(key, r.id)}</td></tr>`).join("") || `<tr><td colspan="${columns.length + 1}"><div class="empty">Chưa có dữ liệu phần này.${key === "previous" ? " Có thể ghi “Không phát sinh” khi nộp báo cáo." : ""}</div></td></tr>`}</tbody></table></div></div>`;
  }
  return (
    out +
    `<div class="card marg-top"><h2>III. Xác nhận / theo dõi</h2><p class="help">Phần này được quản lý trong mục Kiểm tra & xác nhận. Chỉ ghi nhận sau khi có hành động thực tế của người phụ trách.</p>${btn("Đi tới xác nhận", "navTo('check')")}</div>`
  );
}
