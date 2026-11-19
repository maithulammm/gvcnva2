"use strict";

// M05: individual follow-up profiles.

function renderM05() {
  let c = cls(),
    m = mdata(),
    profiles = c.profiles;
  let current =
    profiles.find((p) => p.id === ui.profileId) || profiles[0];
  if (current) ui.profileId = current.id;
  let related = current
    ? Object.values(c.months)
        .flatMap((mm) => mm.meetings || [])
        .filter((x) => x.profileId === current.id)
    : [];
  return `<div class="section-head"><h2>Hồ sơ cá nhân theo dõi chuyên sâu</h2><div class="actions"><span class="pill">${profiles.length} phiếu trong lớp</span>${editable() ? btn("＋ Mở phiếu M05", "openModal('profile')", "primary") : ""}</div></div><div class="cols2" style="grid-template-columns:minmax(240px,0.65fr) minmax(0,1.5fr)"><section class="card"><h3>Danh sách phiếu</h3><p class="help">Chỉ mở cho HS cần theo dõi nhiều lần hoặc có mục tiêu phát triển riêng.</p>${profiles.map((p) => `<button class="btn" style="width:100%;margin:5px 0;justify-content:space-between;${current?.id === p.id ? "background:var(--selection-bg)" : ""}" onclick="ui.profileId='${p.id}';render()"><span>${esc(studentName(c, p.studentId))}<br><small>${esc(p.code)}</small></span><span>›</span></button>`).join("") || '<div class="empty">Chưa mở phiếu M05.</div>'}</section><section class="card">${current ? `<div class="section-head" style="margin-top:0"><h2>${esc(studentName(c, current.studentId))}</h2>${statusTag(current.result || "Đang theo dõi")}</div><div class="filterline"><span class="pill">Mã: ${esc(current.code)}</span><span class="pill">Bắt đầu: ${esc(current.startMonth)}</span></div><div class="stack marg-top"><div><b>Điểm mạnh / nguồn lực</b><p>${esc(current.strength)}</p></div><div><b>Điều HS quan tâm</b><p>${esc(current.concern)}</p></div><div><b>Mục tiêu và dấu hiệu tiến bộ</b><p>${esc(current.goal)}</p></div><div><b>Đánh giá / hướng tiếp theo</b><p>${esc(current.progress || "Chưa đánh giá")}</p><p class="help">${esc(current.next || "")}</p></div><div class="actions">${editable() ? btn("Sửa phiếu", `openModal('profile','${current.id}')`) : ""}${editable() ? btn("Xóa phiếu", `removeRecord('profile','${current.id}')`, "danger") : ""}</div></div><div class="section-head"><h3>II. Theo dõi các lần gặp · ${related.length} lượt</h3></div><p class="help">Liên kết cuộc gặp từ Mẫu 2 bằng phiếu theo dõi, không tạo thêm lượt gặp.</p><div class="timeline">${related.map((x, i) => `<div class="tl"><b>Lần ${i + 1} · ${esc(x.actual)}</b><p>${esc(x.concern)}</p><p class="help">Tiến bộ / khó khăn: ${esc(x.profileProgress || "Chưa nhập")}</p><p class="help">Mốc kiểm tra: ${esc(x.profileNext || "Chưa nhập")}</p>${editable() ? `<div class="marg-top">${btn("Bổ sung theo dõi", `openModal('m05detail','${x.id}')`, "small")}</div>` : ""}</div>`).join("") || '<div class="empty">Chưa có cuộc gặp nào liên kết phiếu này. Vào Mẫu 02 để chọn liên kết M05.</div>'}</div>` : '<div class="empty">Chọn một phiếu ở bên trái hoặc mở phiếu mới.</div>'}</section></div>`;
}
