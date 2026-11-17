"use strict";

// M02: actual student meetings.

function renderM02() {
  let c = cls(),
    m = mdata(),
    s = summarize(c, ui.month);
  return `<div class="section-head"><h2>Sổ ghi lượt gặp thực tế</h2><div class="actions"><span class="pill">${s.meetings} lượt / ${s.met} HS khác nhau</span>${editable() ? btn("＋ Thêm lượt gặp", "openModal('m02')", "primary") : ""}</div></div><p class="help">Mỗi cuộc gặp cần thời gian, chủ đề học sinh quan tâm, mục tiêu có thể đo lường và mã xác nhận. Có thể liên kết phiếu M05 nếu cần.</p><div class="card no-pad"><div class="table-wrap"><table><thead><tr><th>STT</th><th>Học sinh</th><th>Ngày giờ / nơi gặp</th><th>Điều HS quan tâm</th><th>Tham gia / tiến bộ</th><th>Mục tiêu & hành động</th><th>Phối hợp</th><th>Mã minh chứng</th><th>Phiếu M05</th><th></th></tr></thead><tbody>${m.meetings.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(studentName(c, r.studentId))}</b></td><td class="long">${esc(r.actual)}</td><td class="long">${esc(r.concern)}</td><td class="long">${esc(r.participation)}<div class="hint">Căn cứ: ${esc(r.progressEvidence || "—")}</div></td><td class="long">${esc(r.goal)}<div class="hint">${esc(r.action)}</div></td><td class="long">${esc(r.cooperation || "—")}</td><td>${esc(r.evidence || "—")}</td><td>${r.profileId ? "Đã liên kết" : "—"}</td><td>${rowAction("m02", r.id)}</td></tr>`).join("") || '<tr><td colspan="10"><div class="empty">Chưa có lượt gặp thực tế trong tháng này.</div></td></tr>'}</tbody></table></div></div>`;
}
