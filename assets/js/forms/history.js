"use strict";
/**
 * Tìm lần gặp trước thời điểm đang ghi, loại chính bản ghi đang sửa và các cuộc gặp tương lai; xét
 * cả các tháng trước.
 */
function previousMeetingFor(c,studentId,month,editingId='',before='') {
  const limit=MONTHS.indexOf(month),candidates=[];
  for(const [key,value] of Object.entries(c.months)) {
    if(MONTHS.indexOf(key)<0||MONTHS.indexOf(key)>limit)continue;
    for(const [index,record] of (value.meetings||[]).entries()) {
      if(record.studentId!==studentId||record.id===editingId)continue;
      const parsed=record.actualDateTime||parseMeetingActual(record.actual).dateTime;
      const iso=String(record.actual||'').match(/\b\d{4}-\d{2}-\d{2}\b/),local=String(record.actual||'').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      const date=iso?.[0]||(local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:'');
      const time=parsed||(date?date+'T00:00':'');
      if(before&&time&&time>=before)continue;
      if(!time&&key===month&&editingId) {
        const currentIndex=value.meetings.findIndex(r=>r.id===editingId);
        if(index>=currentIndex)continue;
      }
      const parts=key.match(/^T(\d{2})\/(\d{4})$/);
      candidates.push({record,month:key,knownDate:!!time,sort:time||`${parts[2]}-${parts[1]}-00T00:00`,index});
    }
  }
  candidates.sort((a,b)=>b.sort.localeCompare(a.sort)||b.index-a.index);
  return candidates[0]||null;
}
/**
 * Chỉ hiển thị tham khảo mục tiêu/việc cần kiểm tra; không tự chép nhận xét vào cuộc gặp mới.
 */
function previousMeetingPanel(c,studentId,month,editingId='',before='') {
  if(!studentId)return '<p class="help">Chọn học sinh để xem lần gặp trước.</p>';
  const previous=previousMeetingFor(c,studentId,month,editingId,before);
  if(!previous)return '<p class="help">Chưa có lần gặp trước được lưu cho học sinh này.</p>';
  const r=previous.record;
  return `<section class="meeting-reference"><b>${previous.knownDate?'Lần gặp trước':'Lần gặp đã lưu'} · ${esc(displayDateText(r.actual||previous.month))}</b>
    ${!previous.knownDate?'<p class="help">Thời gian cũ chưa đủ ngày giờ để xếp thứ tự chính xác.</p>':''}
    <div><small>Mục tiêu đã thống nhất</small><p class="work-appointments">${esc(r.goal||'Chưa ghi')}</p></div>
    <div><small>Việc cần kiểm tra</small><p class="work-appointments">${esc(r.action||r.profileNext||'Chưa ghi')}</p></div>
    <details><summary>Xem nhận xét lần trước</summary><p>${esc(r.participation||'Chưa ghi')}</p>${r.profileProgress?`<p>${esc(r.profileProgress)}</p>`:''}</details>
    <small>Chỉ tham khảo; không tự chép nhận xét hoặc kết quả tiến bộ vào lần gặp mới.</small></section>`;
}
/**
 * Đổi học sinh/ngày/giờ thì tính lại lịch sử; ô nhận xét lần trước chỉ hiện khi có căn cứ hoặc đã
 * có nội dung.
 */
function updatePreviousMeetingPanel() {
  if(ui.editing?.type!=='m02'||!$('entryForm').querySelector)return;
  const form=$('entryForm'),student=form.querySelector('[name="studentId"]')?.value||'';
  const date=form.querySelector('[name="actualDate"]')?.value||'',time=form.querySelector('[name="actualTime"]')?.value||'';
  const before=date&&/^\d{2}:\d{2}$/.test(time)?date+'T'+time:'';
  $('previousMeetingPanel').innerHTML=previousMeetingPanel(cls(),student,ui.month,ui.editing.id,before);
  const review=form.querySelector('[data-field="previousReview"]');
  const hide=!previousMeetingFor(cls(),student,ui.month,ui.editing.id,before)&&!form.querySelector('[name="previousReview"]')?.value;
  if(review)review.hidden=hide;
  $('previousReviewHeading').hidden=hide;
  $('previousReviewReference').hidden=hide;
  let step=0;
  for(const heading of form.querySelectorAll?.('.meeting-section-title')||[])
    if(!heading.hidden)heading.textContent=heading.textContent.replace(/^\d+\./,++step+'.');
}
