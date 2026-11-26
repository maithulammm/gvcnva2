"use strict";

// M03: positive parent connections.

/** Điền gợi ý theo thao tác của GV, giữ chữ đang nhập và không lặp khi bấm nhiều lần. */
function suggestParentNoReply(){
  if(ui.editing?.type!=='m03'||!editorContextCurrent()||!editable())return;
  const input=$('entryForm').querySelector('[name="reply"]'),text='Phụ huynh chưa phản hồi';
  if(!input)return;
  if(!input.value.includes(text))input.value=input.value.trim()?input.value.trimEnd()+'\n'+text:text;
  saveEditorDraft();input.focus();
}

function renderM03() {
  let c = cls(),
    m = mdata(),
    s = summarize(c, ui.month);
  return `<div class="section-head"><h2>Kết nối tích cực với phụ huynh</h2><div class="actions"><span class="pill">${s.connections} lượt / ${s.connectedStudents} HS</span>${editable() ? btn("＋ Ghi lần kết nối", "openModal('m03')", "primary") : ""}</div></div><p class="help">Chỉ ghi thông điệp đã gửi. Không lưu số điện thoại hoặc thông tin gia đình riêng tư trong báo cáo.</p><div class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Học sinh</th><th>Hình thức</th><th>Nội dung đã chia sẻ</th><th>Người nhận</th><th>Phản hồi</th><th>Ảnh minh chứng</th><th></th></tr></thead><tbody>${m.connections.map((r) => `<tr data-compact-status="Đã ghi nhận"><td>${esc(displayDateText(r.date))}</td><td><b>${esc(studentName(c, r.studentId))}</b></td><td>${esc(r.channel)}</td><td class="long">${esc(r.message)}</td><td>${esc(r.recipient)}</td><td class="long">${esc(r.reply)}</td><td>${connectionEvidenceLinks(r)}</td><td>${rowAction("m03", r.id)}</td></tr>`).join("") || '<tr><td colspan="8"><div class="empty">Chưa có kết nối tích cực được ghi nhận trong tháng này.</div></td></tr>'}</tbody></table></div></div>`;
}
