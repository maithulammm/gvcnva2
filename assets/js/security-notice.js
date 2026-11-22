"use strict";

let securityNoticeAt=-Infinity;
/** Nhắc bảo mật khi bấm phím xem mã; đây không phải hàng rào phân quyền API. */
function warnSourceInspection(event){
  const key=String(event.key||'').toLowerCase();
  const tools=key==='f12'||['i','j','c'].includes(key)&&
    (event.ctrlKey&&event.shiftKey||event.metaKey&&event.altKey);
  const source=key==='u'&&(event.ctrlKey||event.metaKey&&event.altKey);
  if(!tools&&!source)return;
  // Chỉ chặn phím tắt này, không khóa chuột phải, sao chép, phóng to hoặc trình đọc màn hình.
  event.preventDefault();
  if(event.repeat||Date.now()-securityNoticeAt<30000||pageLoading.pending.size||$('appDialog')?.open)return;
  securityNoticeAt=Date.now();
  appAlert('Thông báo bảo mật: Mã nguồn và dữ liệu hệ thống phục vụ công tác nhà trường. Không chia sẻ mã xác thực, ảnh minh chứng hoặc thông tin học sinh; không truy cập API ngoài phạm vi được phân quyền. Nếu cần hỗ trợ kỹ thuật, vui lòng liên hệ quản trị viên.');
}
document.addEventListener?.('keydown',warnSourceInspection,{capture:true});
