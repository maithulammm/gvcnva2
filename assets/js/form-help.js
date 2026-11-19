"use strict";
// Summarized from the school's two GVCN documents, adapted to current app rules.
const FORM_HELP={
  m01:{title:'Mẫu 01 · Lịch gặp học sinh',purpose:'Lập lịch bao quát học sinh của lớp, sắp xếp các cuộc gặp và rà soát lịch bù.',steps:[
    'Chọn đúng lớp và tháng. Kiểm tra danh sách học sinh trước khi xếp lịch.',
    'Bấm Thêm lịch ở học sinh hoặc Tự động xếp lịch tháng. Sửa từng lần nếu cần điều chỉnh.',
    'Chọn ngày, buổi sáng/chiều hoặc Giờ khác; giờ bắt đầu phải trước giờ kết thúc. Tránh trùng giờ, ngày nghỉ và bảo đảm an toàn, riêng tư.',
    'Chọn trọng tâm trao đổi và ghi chú ngắn gọn. Chú ý học sinh chủ động đề nghị gặp hoặc có việc cần tiếp tục từ tháng trước; không gắn nhãn học sinh.',
    'Lịch dự kiến xuất hiện ở Mẫu 02. Chỉ ghi nhận đã gặp sau khi cuộc gặp thực sự diễn ra.',
    'Cuối tháng rà soát học sinh chưa gặp, cập nhật lịch bù và đối chiếu Mẫu 02. Có thể xuất Excel lịch gặp.'
  ],example:'Một học sinh có hai lịch hẹn vẫn là một học sinh trong độ bao phủ; chỉ khi ghi nhận hai cuộc gặp thực tế mới tính hai lượt gặp.'},
  m02:{title:'Mẫu 02 · Sổ theo dõi gặp gỡ',purpose:'Ghi từng cuộc gặp thực tế, điều học sinh quan tâm, mục tiêu thống nhất và hành động tiếp theo.',steps:[
    'Từ lịch dự kiến, chọn Ghi nhận đã gặp; hoặc Thêm lượt gặp khi cuộc gặp phát sinh ngoài kế hoạch.',
    'Kiểm tra học sinh, ngày, giờ 24 giờ và địa điểm thực tế. Thông tin điền sẵn được phép sửa.',
    'Ghi điều học sinh quan tâm bằng ngôn ngữ trung tính; lắng nghe ý kiến, điểm mạnh và mong muốn của học sinh.',
    'Nếu có lần gặp trước, đọc thông tin tham khảo và nhận xét việc thực hiện mục tiêu đã thống nhất. Chọn cụm từ gợi ý rồi chỉnh theo thực tế; không sao chép kết quả cũ.',
    'Ghi mức tham gia và căn cứ tiến bộ trước–sau. Khi chưa đủ dữ kiện, chọn Chưa ghi nhận; không suy diễn tiến bộ.',
    'Thống nhất mục tiêu cụ thể, mức cần đạt, thời hạn và hành động của học sinh/GVCN. Ví dụ: chuẩn bị bài đủ 4/5 ngày mỗi tuần trong 2 tuần.',
    'Chỉ chọn phối hợp khi có nhiệm vụ cụ thể. Liên kết Mẫu 05 nếu học sinh có hồ sơ theo dõi chuyên sâu.',
    'Lưu sau cuộc gặp; giữ xác nhận học sinh theo quy trình của trường. Mỗi cuộc gặp là một bản ghi, không ghi trùng cùng một lịch.'
  ],example:'Học sinh A gặp hai lần, B gặp một lần: tổng 3 lượt gặp nhưng chỉ có 2 học sinh đã gặp.'},
  m03:{title:'Mẫu 03 · Kết nối tích cực với phụ huynh',purpose:'Ghi nhận thông điệp tích cực thực sự đã gửi tới gia đình và phản hồi nhận được.',steps:[
    'Chọn học sinh, ngày thực hiện và hình thức: tin nhắn, gọi điện, email, gặp trực tiếp hoặc thư của học sinh.',
    'Nêu sự việc cụ thể về nỗ lực, điểm mạnh, tiến bộ hoặc đóng góp; không khen chung chung, so sánh với bạn hoặc sao chép lời khen.',
    'Chỉ ghi khi đã gửi/trao đổi thật; tin đang soạn không được tính là kết nối.',
    'Người nhận chỉ ghi vai trò như cha, mẹ, người giám hộ; không đưa số điện thoại vào báo cáo.',
    'Ghi phản hồi thực tế. Nếu chưa phản hồi, ghi rõ Đã gửi, chưa phản hồi.',
    'Lưu chứng cứ tại nơi được phân quyền theo quy trình trường. Cuối tháng rà soát học sinh chưa được ghi nhận để cân đối cơ hội tháng sau.'
  ],example:'“Hôm nay em chủ động hỗ trợ bạn hoàn thành nhiệm vụ nhóm.” Một học sinh được liên hệ nhiều lần tạo nhiều lượt, nhưng chỉ đếm một học sinh được ghi nhận.'},
  m04:{title:'Mẫu 04 · Kế hoạch hỗ trợ học sinh',purpose:'Đánh giá hỗ trợ kỳ trước và lập kế hoạch phù hợp nhu cầu, điểm mạnh, mục tiêu của học sinh trong tháng này.',steps:[
    'Phần I: ghi biện pháp đã thực hiện tháng trước, kết quả quan sát và nội dung cần tiếp tục; không chép nguyên kế hoạch dự định.',
    'Khi không phát sinh hỗ trợ kỳ trước, phản ánh đúng tình hình; không tạo bản ghi học sinh giả để đủ biểu mẫu.',
    'Phần II: nêu nhu cầu cùng điểm mạnh/nguồn lực. Hỗ trợ có thể nhằm phát huy thế mạnh, thói quen hoặc hòa nhập, không chỉ xử lý khó khăn.',
    'Mỗi kế hoạch cần mục tiêu đo được, biện pháp khả thi, thời hạn, người phối hợp và cách đánh giá.',
    'Ghi rõ ai làm gì và tần suất rà soát. Chỉ chia sẻ thông tin cần thiết với người có nhiệm vụ.',
    'Cuối kỳ đánh giá theo dữ liệu thực tế; nêu việc hoàn tất, cần tiếp tục hoặc cần điều chỉnh. Vấn đề vượt chuyên môn chuyển bộ phận có thẩm quyền.',
    'Dùng Kiểm tra & xác nhận để gửi BGH theo quy trình hiện tại; không tự ghi đã được duyệt.'
  ],example:'Trong 3 tuần, nộp đúng hạn ít nhất 4/5 bài mỗi tuần; học sinh dùng bảng kiểm, GVCN rà soát thứ Sáu và đối chiếu nhật ký nộp bài.'},
  m05:{title:'Mẫu 05 · Theo dõi cá nhân',purpose:'Theo dõi chiều sâu quá trình phát triển của một học sinh qua nhiều mốc; không thay thế nhật ký lượt gặp ở Mẫu 02.',steps:[
    'Chỉ mở phiếu khi học sinh cần theo dõi liên tục hoặc có mục tiêu phát triển riêng; không bắt buộc mở cho mọi học sinh.',
    'Ghi đúng học sinh, tháng bắt đầu, điểm mạnh/nguồn lực, điều học sinh muốn cải thiện và mục tiêu có mốc ban đầu.',
    'Sau cuộc gặp, ghi ở Mẫu 02 rồi chọn liên kết phiếu Mẫu 05 đúng học sinh. Không tạo thêm lượt gặp chỉ để cập nhật phiếu.',
    'Cập nhật chia sẻ, tiến bộ/khó khăn quan sát được, hành động thống nhất, người phối hợp và mốc kiểm tra tiếp theo.',
    'So sánh bằng hành vi, số liệu hoặc sản phẩm; thiếu căn cứ phải ghi chưa đủ dữ liệu. Không suy đoán tâm lý hoặc dùng nhãn tiêu cực.',
    'Cuối kỳ chọn mức đạt mục tiêu theo căn cứ; nêu điểm tiến bộ, việc cần duy trì/điều chỉnh và ngày rà soát.',
    'Giữ thông tin cá nhân trong phạm vi phân quyền; xác nhận nội dung đã thống nhất với học sinh theo quy trình trường.'
  ],example:'Mốc đầu chuẩn bị đủ đồ dùng 2/5 ngày; sau hai tuần ghi nhận 4/5 ngày. Ghi rõ dữ liệu so sánh, kết quả và bước duy trì tiếp theo.'}
};
let activeFormHelp=null;
function formHelpKey(page){return 'VA_GVCN_HELP_V1_'+encodeURIComponent(auth.email)+'_'+page;}
function openFormHelp(page=ui.page,automatic=false){
  if(!auth.account||!FORM_HELP[page]||ui.page!==page)return;
  let suppressed=false;try{suppressed=localStorage.getItem(formHelpKey(page))==='1';}catch{}
  if(automatic&&suppressed)return;
  const help=FORM_HELP[page];activeFormHelp={page,owner:auth.email};
  $('formHelpTitle').textContent=help.title;
  $('formHelpBody').innerHTML=`<p>${esc(help.purpose)}</p><ol>${help.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><div class="meeting-reference"><b>Ví dụ minh họa</b><p>${esc(help.example)}</p></div><p class="help">Ghi dữ liệu thực tế, không đưa thông tin gia đình hoặc sức khỏe riêng tư vào bản chia sẻ rộng. Nội dung tóm lược từ bộ biểu mẫu và hướng dẫn GVCN của trường, phù hợp các chức năng đang áp dụng.</p>`;
  $('formHelpNever').checked=suppressed;
  if(!$('formHelp').open)$('formHelp').showModal();
  $('formHelpBody').scrollTop=0;$('formHelpClose').focus();
}
function closeFormHelp(remember=true){
  if(remember&&activeFormHelp?.owner===auth.email)try{
    if($('formHelpNever').checked)localStorage.setItem(formHelpKey(activeFormHelp.page),'1');else localStorage.removeItem(formHelpKey(activeFormHelp.page));
  }catch{/* The help remains usable when browser storage is unavailable. */}
  activeFormHelp=null;$('formHelp').close();
}
