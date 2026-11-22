"use strict";

// M02: actual student meetings.
/** Tóm tắt ngày/giờ, không đưa nội dung trao đổi riêng vào dòng thu gọn. */
function compactRecordDate(value){
  const text=displayDateText(value||''),date=text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0],time=text.match(/\b\d{1,2}:\d{2}\b/)?.[0];
  return [date,time?.padStart(5,'0')].filter(Boolean).join(' ');
}
function compactRecordMeta(date,status){
  return `<span class="compact-row-meta">${date?`<span class="compact-row-date">${esc(date)}</span>`:''}${status?`<span class="compact-row-status">${esc(status)}</span>`:''}</span>`;
}
/**
 * Thêm hàng tóm tắt tên/giờ có thể mở rộng trên điện thoại; giữ nguyên dữ liệu và thao tác của
 * dòng đầy đủ.
 */
function installMeetingSummaries(table){
  if(!table.classList.contains('meeting-records-table'))return;
  for(const row of table.querySelectorAll('tbody > tr')){
    if(row.querySelector('.meeting-row-toggle')||row.cells.length<3)continue;
    const nameCell=row.cells[1],name=nameCell.textContent.trim(),actual=row.cells[2].textContent.trim();
    const time=compactRecordDate(actual);
    const button=document.createElement('button');button.type='button';button.className='meeting-row-toggle';
    button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Xem chi tiết lượt gặp của '+name+' · '+actual);button.title=actual;
    button.innerHTML=`<span class="meeting-row-name">${esc(name)}</span>${compactRecordMeta(time,'Đã ghi nhận')}<span class="meeting-row-arrow" aria-hidden="true">▾</span>`;
    nameCell.classList.add('meeting-name-cell');row.classList.add('meeting-collapsible');
    for(const node of [...nameCell.children])node.classList.add('meeting-name-original');
    nameCell.append(button);
    button.addEventListener('click',()=>{const open=row.classList.toggle('meeting-expanded');button.setAttribute('aria-expanded',String(open));});
  }
}
/**
 * Biến bảng thành danh sách thu gọn trên điện thoại; không xóa ô nên vẫn xem, sửa và tìm toàn bộ
 * nội dung.
 */
function installCompactList(table){
  if(table.classList.contains('meeting-records-table'))return;
  const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  let primary=headers.findIndex(h=>/Học sinh|Họ.*tên/i.test(h));
  if(primary<0)primary=headers.findIndex(h=>/^Lớp$/.test(h));
  if(primary<0)primary=headers.findIndex(h=>/GVCN|Tên|Tiêu chí/i.test(h));
  if(primary<0)primary=0;
  const secondary=headers.findIndex((h,i)=>i!==primary&&/Ngày|Lịch|Thời|Trạng thái/.test(h));
  const statusColumn=headers.findIndex(h=>/Trạng thái|Kết quả|Mức độ/.test(h));
  table.classList.add('compact-list-table');
  for(const row of table.querySelectorAll('tbody > tr')){
    if(row.querySelector('.meeting-row-toggle')||row.querySelector('td[colspan]')||!row.cells[primary])continue;
    const cell=row.cells[primary],name=cell.textContent.trim(),detail=secondary>=0?row.cells[secondary]?.textContent.trim()||'':'';
    const button=document.createElement('button');button.type='button';button.className='meeting-row-toggle';
    button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Xem chi tiết '+name);button.title=[name,detail].filter(Boolean).join(' · ');
    const status=row.dataset.compactStatus||(statusColumn>=0?row.cells[statusColumn]?.textContent.trim()||'':'');
    button.innerHTML=`<span class="meeting-row-name">${esc(name)}</span>${compactRecordMeta(compactRecordDate(detail),status)}<span class="meeting-row-arrow" aria-hidden="true">▾</span>`;
    const original=document.createElement('span');original.className='meeting-name-original';
    while(cell.firstChild)original.append(cell.firstChild);
    cell.append(original,button);cell.classList.add('meeting-name-cell');row.classList.add('meeting-collapsible');
    button.addEventListener('click',()=>{const open=row.classList.toggle('meeting-expanded');button.setAttribute('aria-expanded',String(open));});
  }
}
/**
 * Điền sẵn ngày, giờ và mục tiêu từ lịch dự kiến; appointmentId liên kết M02 với đúng một lần hẹn
 * M01.
 */
function openScheduledMeeting(studentId,appointmentId) {
  if (!editable()) return;
  const appointment=studentAppointments(cls(),ui.month,studentId).find(a=>a.id===appointmentId);
  if (!appointment) return;
  const recorded=mdata().meetings.find(r=>r.appointmentId===appointmentId);
  if (recorded) return openModal('m02',recorded.id);
  const slot=scheduleSlot(appointment),time=slot.session==='other'?appointment.startTime:slot.session==='afternoon'?'15:00':'09:55';
  openModal('m02','',{studentId,appointmentId,goal:appointment.goal||'',actual:'',
    actualDateTime:slot.date&&(MEETING_SESSIONS[slot.session]||slot.session==='other')?`${slot.date}T${time}`:'',actualLocation:`Phòng ${cls().id}`});
}
/**
 * Chỉ hiển thị lịch chưa liên kết cuộc gặp thực tế; xếp lịch dự kiến không làm tăng chỉ tiêu đã
 * gặp.
 */
function renderPendingMeetings(c,m) {
  const pending=monthlyAppointments(c).filter(a=>!m.meetings.some(r=>r.appointmentId===a.id));
  if (!pending.length) return '';
  return `<section class="card pending-meetings"><div class="section-head"><h2>Lịch gặp dự kiến từ Mẫu 1</h2><span class="pill pending-count">${pending.length} lịch</span></div>
    <div class="table-wrap"><table><thead><tr><th>Ngày / buổi</th><th>Học sinh</th><th>Mục tiêu</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${pending.map(a=>`<tr data-compact-status="Dự kiến"><td>${esc(displayDateText(a.planTime))}</td><td><b>${esc(studentName(c,a.studentId))}</b></td><td>${esc(a.goal||'—')}</td><td>${esc(a.note||'—')}</td><td>${editable()?btn('Ghi nhận đã gặp',`openScheduledMeeting('${a.studentId}','${a.id}')`,'small primary'):'Dự kiến'}</td></tr>`).join('')}
    </tbody></table></div></section>`;
}
/**
 * Dựng danh sách lịch chờ và các cuộc gặp đã lưu, cùng các thao tác theo quyền hiện tại.
 */
function renderM02() {
  let c = cls(),
    m = mdata(),
    s = summarize(c, ui.month);
  return `${renderPendingMeetings(c,m)}<div class="section-head"><h2>Sổ ghi lượt gặp thực tế</h2><div class="actions"><span class="pill">${s.meetings} lượt / ${s.met} HS khác nhau</span>${editable() ? btn("＋ Thêm lượt gặp", "openModal('m02')", "primary") : ""}</div></div><p class="help">Mỗi cuộc gặp cần thời gian, chủ đề học sinh quan tâm, mục tiêu có thể đo lường. Có thể liên kết phiếu M05 nếu cần.</p><div class="card no-pad"><div class="table-wrap"><table class="meeting-records-table"><thead><tr><th>STT</th><th>Học sinh</th><th>Ngày giờ / nơi gặp</th><th>Điều HS quan tâm</th><th>Tham gia / tiến bộ</th><th>Mục tiêu & hành động</th><th>Phối hợp</th><th>Phiếu M05</th><th></th></tr></thead><tbody>${m.meetings.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(studentName(c, r.studentId))}</b></td><td class="long">${esc(displayDateText(r.actual))}</td><td class="long">${esc(r.concern)}</td><td class="long">${r.previousReview?`<div class="hint">${esc(r.previousReview)}</div>`:""}${esc(r.participation)}<div class="hint">Căn cứ: ${esc(PROGRESS_CHOICES.find(choice=>choice[0]===r.progressEvidence)?.[1] || r.progressEvidence || "—")}</div></td><td class="long meeting-goal-text">${esc(r.goal)}<div class="hint">${esc(r.action)}</div></td><td class="long">${esc(r.cooperation || "—")}</td><td>${r.profileId ? "Đã liên kết" : "—"}</td><td>${rowAction("m02", r.id)}</td></tr>`).join("") || '<tr><td colspan="9"><div class="empty">Chưa có lượt gặp thực tế trong tháng này.</div></td></tr>'}</tbody></table></div></div>`;
}
