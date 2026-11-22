"use strict";
// Summarized from the school's two GVCN documents, adapted to current app rules.
const FORM_HELP={
  m01:{title:'Mẫu 01 · Lịch gặp học sinh',purpose:'Lập lịch bao quát học sinh của lớp, sắp xếp các cuộc gặp và rà soát lịch bù.',steps:[
    'Chọn đúng lớp và tháng. Kiểm tra danh sách học sinh trước khi xếp lịch.',
    'Bấm dấu + ở học sinh hoặc Tự động xếp lịch tháng. Sửa từng lần nếu cần điều chỉnh.',
    'Chọn ngày, buổi sáng/chiều hoặc Giờ khác; giờ bắt đầu phải trước giờ kết thúc. Tránh trùng giờ, ngày nghỉ và bảo đảm an toàn, riêng tư.',
    'Chọn trọng tâm trao đổi và ghi chú ngắn gọn. Chú ý học sinh chủ động đề nghị gặp hoặc có việc cần tiếp tục từ tháng trước; không gắn nhãn học sinh.',
    'Lịch dự kiến xuất hiện ở Mẫu 02. Chỉ ghi nhận đã gặp sau khi cuộc gặp thực sự diễn ra.',
    'Cuối tháng rà soát học sinh chưa gặp, cập nhật lịch bù và đối chiếu Mẫu 02. Có thể xuất lịch gặp dạng Word hoặc Excel.'
  ],example:'Một học sinh có hai lịch hẹn vẫn là một học sinh trong độ bao phủ; chỉ khi ghi nhận hai cuộc gặp thực tế mới tính hai lượt gặp.'},
  m02:{title:'Mẫu 02 · Sổ theo dõi gặp gỡ',purpose:'Ghi từng cuộc gặp thực tế, điều học sinh quan tâm, mục tiêu thống nhất và hành động tiếp theo.',steps:[
    'Từ lịch dự kiến, chọn Ghi nhận đã gặp; hoặc Thêm lượt gặp khi cuộc gặp phát sinh ngoài kế hoạch.',
    'Kiểm tra học sinh, ngày, giờ 24 giờ và địa điểm thực tế. Thông tin điền sẵn được phép sửa.',
    'Nếu có lần gặp trước, đọc thông tin tham khảo và nhận xét việc thực hiện mục tiêu đã thống nhất. Chọn cụm từ gợi ý rồi chỉnh theo thực tế; không sao chép kết quả cũ.',
    'Ghi điều học sinh quan tâm bằng ngôn ngữ trung tính; lắng nghe ý kiến, điểm mạnh và mong muốn của học sinh.',
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
    'Thông điệp và phản hồi không bắt buộc nhập. Hình thức mặc định là Tin nhắn, người nhận mặc định là Mẹ; có thể đổi khi cần.',
    'Chọn hoặc dán tối đa 2 ảnh minh chứng cho một lần kết nối mới. Ảnh được tải và gắn vào bản ghi khi bấm Lưu thông tin; chỉ tài khoản được phân quyền mới xem được.',
    'Cuối tháng rà soát học sinh chưa được ghi nhận để cân đối cơ hội tháng sau.'
  ],example:'“Hôm nay em chủ động hỗ trợ bạn hoàn thành nhiệm vụ nhóm.” Một học sinh được liên hệ nhiều lần tạo nhiều lượt, nhưng chỉ đếm một học sinh được ghi nhận.'},
  m04:{title:'Mẫu 04 · Kế hoạch hỗ trợ học sinh',purpose:'Đánh giá hỗ trợ kỳ trước và lập kế hoạch phù hợp nhu cầu, điểm mạnh, mục tiêu của học sinh trong tháng này.',steps:[
    'Rà soát hỗ trợ tháng này: chọn Chưa rà soát, Không phát sinh hỗ trợ trong tháng hoặc Có phát sinh hỗ trợ. Khi đã có kế hoạch, không thể chọn Không phát sinh.',
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
// Nội dung trọng tâm hiển thị trước; hướng dẫn đầy đủ bên trên vẫn được giữ để đọc thêm.
const FORM_HELP_QUICK={
  m01:{label:'LẬP LỊCH',headline:'Sắp xếp các cuộc gặp trong tháng',steps:[
    ['Chọn phạm vi','Kiểm tra đúng **lớp**, **tháng báo cáo** và danh sách học sinh.'],
    ['Xếp lịch gặp','Bấm **+** để thêm lịch từng em hoặc **Tự động xếp lịch tháng**. Bấm **biểu tượng bút** cạnh mỗi lần để sửa ngày, buổi hoặc giờ.'],
    ['Theo dõi sau cuộc gặp','Lịch được chuyển sang **Mẫu 02**. Sau khi gặp thật, chọn **Ghi nhận đã gặp**. Nút **Xuất lịch gặp** cho phép chọn Word hoặc Excel.']
  ],note:['Điểm cần nhớ','Chỉ tính **lượt gặp thực tế** khi đã ghi nhận và lưu ở Mẫu 02. Xếp lịch trước chưa làm tăng số học sinh đã gặp.']},
  m02:{label:'GHI NHẬN CUỘC GẶP',headline:'Nhập theo diễn biến cuộc gặp',steps:[
    ['Thông tin cuộc gặp','Kiểm tra **học sinh → ngày/giờ → địa điểm**. Thông tin từ lịch dự kiến được điền sẵn và có thể sửa.'],
    ['Nhận xét lần trước','Nhóm này chỉ hiện khi có **lần gặp trước** hoặc nhận xét đã lưu. Đánh giá việc thực hiện mục tiêu cũ; phần tham khảo dài có thể bấm mở.'],
    ['Nội dung mới','Ghi **điều học sinh quan tâm** và **mức tham gia / tiến bộ**. Chọn cụm từ gợi ý rồi chỉnh theo tình huống thực tế.'],
    ['Mục tiêu tiếp theo','Thống nhất **mục tiêu cụ thể**, **thời hạn** và **việc cần làm**. Bấm **Lưu thông tin** hoặc **Lưu & ghi HS tiếp theo**.']
  ],note:['Ghi đúng căn cứ','Chọn **Chưa ghi nhận** khi chưa có đủ dữ kiện để so sánh tiến bộ. Chỉ mở **Phối hợp & liên kết Mẫu 5** khi cần.']},
  m03:{label:'KẾT NỐI PHỤ HUYNH',headline:'Ghi lại lần kết nối đã thực hiện',steps:[
    ['Chọn học sinh và ngày','Hình thức mặc định là **Tin nhắn**, người nhận mặc định là **Mẹ**. Đổi lại nếu lần kết nối có hình thức hoặc người nhận khác.'],
    ['Ghi nội dung cần thiết','**Thông điệp** và **phản hồi không bắt buộc nhập**. Nếu ghi, nêu sự việc tích cực cụ thể; tránh so sánh học sinh với bạn.'],
    ['Thêm ảnh và lưu','Có thể **chọn ảnh** hoặc **dán ảnh chụp màn hình**, tối đa **2 ảnh** cho lần kết nối mới. Bấm **Lưu thông tin**, chờ xử lý hoàn tất; bấm ảnh để xem lớn.']
  ],note:['Chỉ ghi kết nối đã diễn ra','Tin đang soạn chưa được tính là kết nối. Trước khi tải ảnh, kiểm tra ảnh có chứa **thông tin riêng tư không cần thiết** hay không.']},
  m04:{label:'RÀ SOÁT HỖ TRỢ',headline:'Xác nhận tình hình hỗ trợ trong tháng',steps:[
    ['Chọn đúng trạng thái','**Chưa rà soát**: chưa kiểm tra tình hình lớp. **Không phát sinh hỗ trợ trong tháng**: đã rà soát và không có trường hợp cần hỗ trợ. **Có phát sinh hỗ trợ**: cần ghi kế hoạch cụ thể.'],
    ['Nhìn lại tháng trước','Ở **Phần I**, ghi biện pháp **đã thực hiện**, kết quả quan sát và nội dung cần tiếp tục. Kết quả tháng trước vẫn được giữ khi tháng này không phát sinh.'],
    ['Lập kế hoạch khi phát sinh','Ở **Phần II**, nêu **mục tiêu → biện pháp → thời hạn → người phối hợp → cách đánh giá**. Khi chọn không phát sinh, phần này tự thu gọn.']
  ],note:['BGH đọc trạng thái rà soát','Chọn **Không phát sinh** sau khi đã rà soát lớp. Khi đã có kế hoạch hỗ trợ trong tháng, hệ thống sẽ giữ trạng thái **Có phát sinh hỗ trợ**.']},
  m05:{label:'THEO DÕI CÁ NHÂN',headline:'Theo dõi một mục tiêu qua nhiều lần gặp',steps:[
    ['Mở phiếu khi cần','Chọn **học sinh**, **tháng bắt đầu**, điểm mạnh và mục tiêu phát triển riêng. **Mã phiếu được tạo tự động**, không cần nhập.'],
    ['Liên kết cuộc gặp','Ghi cuộc gặp ở **Mẫu 02**, rồi liên kết **đúng phiếu của học sinh**. Cuộc gặp chỉ được tính một lần.'],
    ['Cập nhật theo mốc','Ghi **tiến bộ / khó khăn**, mức đạt mục tiêu và **mốc kiểm tra tiếp theo**. Một phiếu có thể tiếp tục theo dõi qua nhiều tháng.']
  ],note:['Dùng theo nhu cầu','Chỉ mở phiếu cho học sinh cần theo dõi liên tục hoặc có mục tiêu riêng. **Không bắt buộc mở phiếu cho mọi học sinh**.']}
};
/** Chỉ hỗ trợ nhấn mạnh từ khóa, luôn escape nội dung trước khi đưa vào HTML. */
function guideText(text){
  return String(text).split(/(\*\*[^*]+\*\*|Tự động xếp lịch tháng|Ghi nhận đã gặp|Lưu thông tin|Không phát sinh|Chưa rà soát|Mẫu 0[1-5])/g)
    .map((part,i)=>i%2?`<strong>${esc(part.startsWith('**')?part.slice(2,-2):part)}</strong>`:esc(part)).join('');
}
function renderFormHelp(page){
  const help=FORM_HELP[page],quick=FORM_HELP_QUICK[page];
  return `<section class="guide-hero"><span class="guide-kicker">HƯỚNG DẪN NHANH · ${quick.label}</span><h3>${quick.headline}</h3><p>${guideText(help.purpose)}</p></section>
    <section class="form-help-quick" aria-label="Các bước thực hiện"><ol>${quick.steps.map(([title,body],index)=>`<li><div class="guide-step-heading"><span class="guide-step-number" aria-hidden="true">${index+1}</span><h4>${title}</h4></div><p>${guideText(body)}</p></li>`).join('')}</ol></section>
    <aside class="guide-key-note"><span class="guide-note-symbol" aria-hidden="true">!</span><div><h4>${quick.note[0]}</h4><p>${guideText(quick.note[1])}</p></div></aside>
    <details class="guide-more"><summary>Ví dụ áp dụng</summary><div class="guide-example">${guideText(help.example)}</div></details>
    <details class="guide-more"><summary>Đọc hướng dẫn chi tiết <span>${help.steps.length} lưu ý</span></summary><ol>${help.steps.map(s=>`<li>${guideText(s)}</li>`).join('')}</ol><p class="help">Nội dung tóm lược từ hướng dẫn GVCN và bộ biểu mẫu của trường, phù hợp chức năng đang áp dụng. Giữ thông tin cá nhân trong phạm vi được phân quyền.</p></details>`;
}
let activeFormHelp=null;
/**
 * Nhớ lựa chọn Không hiển thị lại riêng theo tài khoản và từng mẫu trên thiết bị này.
 */
function formHelpKey(page){return 'VA_GVCN_HELP_V1_'+encodeURIComponent(auth.email)+'_'+page;}
/**
 * Tự mở khi vào mẫu nếu chưa bỏ qua; nút ! luôn có thể mở lại thủ công.
 */
function openFormHelp(page=ui.page,automatic=false){
  if(!auth.account||!FORM_HELP[page]||ui.page!==page)return;
  let suppressed=false;try{suppressed=localStorage.getItem(formHelpKey(page))==='1';}catch{}
  if(automatic&&suppressed)return;
  const help=FORM_HELP[page];activeFormHelp={page,owner:auth.email};
  $('formHelpTitle').textContent=help.title;
  $('formHelpBody').innerHTML=renderFormHelp(page);
  $('formHelpNever').checked=suppressed;
  if(!$('formHelp').open)$('formHelp').showModal();
  $('formHelpBody').scrollTop=0;$('formHelpClose').focus();
}
/**
 * Đóng và ghi lựa chọn nếu cần; khi khóa phiên truyền remember=false để không ghi lựa chọn ngoài ý
 * muốn.
 */
function closeFormHelp(remember=true){
  if(remember&&activeFormHelp?.owner===auth.email)try{
    if($('formHelpNever').checked)localStorage.setItem(formHelpKey(activeFormHelp.page),'1');else localStorage.removeItem(formHelpKey(activeFormHelp.page));
  }catch{/* The help remains usable when browser storage is unavailable. */}
  activeFormHelp=null;$('formHelp').close();
}
