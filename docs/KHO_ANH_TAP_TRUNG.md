# Kho ảnh tập trung trên OneDrive của Admin

Cấu hình hiện tại: [OneDrive bằng tài khoản chủ kho](ONEDRIVE_UY_QUYEN.md).

## Trạng thái

Mã hỗ trợ lưu tập trung vào OneDrive công vụ `lammt@vietanhschool.edu.vn` bằng quyền Delegated. Sau triển khai, chủ kho kết nối tại Quản trị viên → Dữ liệu. Push GitHub không tự thực hiện consent Microsoft và không triển khai Cloudflare khi Builds đang ngắt.

## Người dùng thấy gì?

- GVCN chọn/dán ảnh, bấm Lưu thông tin; dùng phiên Microsoft hiện có của ứng dụng, không cấp quyền OneDrive riêng.
- Hiện ảnh thu nhỏ, dấu X ở góc để gỡ khỏi lần kết nối và popup xem ảnh lớn. Không hiện tên tệp hoặc link OneDrive.
- Admin được truy cập ảnh mọi lớp; GVCN chỉ lớp được phân công thật tại API. Khối trưởng và BGH thuần tổng hợp không được mở ảnh.
- Gỡ ảnh rồi lưu, hoặc xóa lần kết nối, sẽ tạo tác vụ xóa tệp trong cùng giao dịch báo cáo. Ảnh không còn được bản ghi khác sử dụng sẽ bị xóa **vĩnh viễn** khỏi kho; popup xác nhận nêu rõ ảnh không thể khôi phục từ bản sao lưu báo cáo.

Phân quyền này nằm ở **API**, không phải chia sẻ thư mục OneDrive cho từng giáo viên. Các thư mục trên OneDrive của Admin vẫn có thể giữ riêng tư; ứng dụng máy chủ là bên có quyền ghi/đọc.

## Luồng bảo vệ và dữ liệu cũ

1. Web gửi ID token Microsoft GVCN đến `/api/evidence/{classId}/upload` hoặc đường dẫn xem ảnh.
2. API xác minh chữ ký token, đọc phân công mới nhất và kiểm tra lớp/trạng thái báo cáo. Không tin classId hoặc vai trò do web tự khai.
3. Máy chủ lấy token Graph bằng ứng dụng lưu trữ, ghi ảnh trong thư mục lớp, lưu chỉ mục riêng tại `school.evidence` của Firebase.
4. Bản ghi M03 chỉ giữ `{provider:'school', id, size, mimeType}`. Khi xem, máy chủ lấy ảnh rồi trả nội dung ảnh; không redirect trình duyệt đến URL tải Microsoft.
5. URL Blob hiển thị ảnh chỉ tồn tại trong trình duyệt của phiên hiện tại; được thu hồi khi rời trang/đăng xuất/đổi phạm vi.
6. `/api/classes/{classId}/evidence/cleanup` chỉ xử lý hàng đợi do máy chủ tạo, không nhận drive/item ID từ trình duyệt. GVCN chỉ xử lý lớp được giao; khối trưởng/BGH không có quyền xóa ảnh lớp khác.
7. Trước xóa, máy chủ kiểm tra lại tham chiếu, drive, loại tệp và cây thư mục năm/lớp/tháng; không xóa thư mục. Tệp thiếu (`404`) được coi là đã xóa. Hàng đợi giữ lease chống xử lý trùng và backoff theo `Retry-After`; lỗi không làm mất báo cáo đã lưu.
8. Trình duyệt xử lý hàng đợi sau lần lưu/xóa thành công và khi vào M03. Cron `15 * * * *` luân phiên hai nhóm 16 lớp, xử lý tối đa một ảnh/lượt, để hạn chế request con trên Workers Free. Cron sao lưu hằng ngày giữ nguyên. Cần deploy Worker mới để cron có hiệu lực.
9. `deletedEvidence` là dấu mốc riêng tư, giúp chặn gắn lại/khôi phục ảnh đã xóa. Khôi phục snapshot giữ nội dung báo cáo nhưng bỏ các ảnh đã bị yêu cầu xóa. Chỉ mục và snapshot không chứa tệp ảnh, không thay cho bản sao lưu ảnh độc lập.

Ảnh cũ dạng OneDrive được giữ nguyên trong dữ liệu lưu; API mới chỉ trả mã `legacy`, che URL nguồn. Proxy chỉ đọc ảnh cũ nếu đúng drive Admin, đúng thư mục năm/lớp/tháng dưới thư mục gốc đã kết nối. Ảnh từng lưu trên OneDrive riêng của giáo viên khác cần bàn giao/chuyển kho; hệ thống không tự di chuyển hay xóa ảnh cũ. Bản JSON sao lưu tải từ web không chứa các tệp ảnh gốc; không thay cho sao lưu kho lưu trữ.

Người có quyền xem ảnh luôn có thể lưu lại nội dung hoặc chụp màn hình. Việc không hiện đường dẫn nguồn không phải DRM và không thể che tuyệt đối công nghệ lưu trữ khỏi người phân tích mã nguồn. Bảo vệ thực tế là quyền API, thư mục riêng tư và không lộ token/URL tải.

## Kiểm thử và triển khai

Đã có kiểm thử giả lập Graph cho ghi/đọc ảnh, giới hạn kích thước, che thông tin nguồn, chống gắn ảnh chéo học sinh/lớp/tháng và khóa quyền sau thu hồi. Chưa xác nhận tải thật lên tenant trường khi chưa có cấu hình ở trên.

Sau cấu hình, triển khai API và giao diện cùng phiên bản khi chủ dự án cho phép Cloudflare deploy. Thử một ảnh bằng Admin, rồi bằng một GVCN; xác minh tài khoản lớp khác không mở được ảnh. Không dùng liên kết chia sẻ công khai làm phương án bỏ qua lỗi quyền.

Tài liệu Microsoft:

- [Authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Chính sách consent của tổ chức](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- [Xóa vĩnh viễn driveItem](https://learn.microsoft.com/en-us/graph/api/driveitem-permanentdelete?view=graph-rest-1.0)
