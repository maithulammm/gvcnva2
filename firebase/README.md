# Firebase cho hệ thống GVCN Việt Anh 2026–2027

Trang duy nhất là `index.html`; CSS và JavaScript được tách trong `assets/`. Đăng nhập Microsoft cũng trả về `index.html`. Xem [bản đồ mã nguồn](../README.md). Chưa có thao tác triển khai hoặc ghi vào database thật từ phiên phát triển này.

## Đã chuẩn bị

- Admin đầu tiên: `lammt@vietanhschool.edu.vn`.
- Admin thêm, sửa, xóa GVCN; phân công một lớp/GVCN; thu hồi quyền khi ngừng hoạt động hoặc xóa.
- Admin thêm, sửa, xóa học sinh, nhập danh sách Excel. Chặn xóa học sinh có lịch gặp, cuộc gặp, kết nối phụ huynh, hỗ trợ hoặc hồ sơ M05 liên quan.
- Database: `https://gvcn-3bdf9-default-rtdb.asia-southeast1.firebasedatabase.app`.
- API Cloud Functions: `https://asia-southeast1-gvcn-3bdf9.cloudfunctions.net/gvcnApi`.
- Quyền được kiểm tra ở API sau khi xác minh chữ ký, issuer, audience, thời hạn, tenant và `oid` của token Microsoft. Vai trò gửi từ HTML không được tin cậy.
- GVCN chỉ sửa biểu mẫu lớp được giao khi tháng còn mở; khối trưởng rà soát khối; BGH nhận số liệu tổng hợp; Admin quản lý danh mục.
- Cập nhật lớp có số phiên bản: một máy dùng dữ liệu cũ không thể ghi đè máy đã lưu trước. Thay đổi chưa đồng bộ được giữ theo tài khoản trong trình duyệt và phục hồi khi tải lại.

## Sửa lỗi Microsoft AADSTS50011

Lỗi trong ảnh là Redirect URI không khớp. Trong Entra → App registrations → ứng dụng có Client ID `94c476b3-4723-4161-9dea-d64ff8bf505c` → Authentication → Single-page application (SPA), thêm:

```text
http://127.0.0.1:5500/index.html
```

Nếu vẫn sử dụng địa chỉ localhost đã đăng ký trước, giữ thêm URI đó:

```text
http://localhost:5500/index.html
```

Lưu cấu hình Entra, chờ thay đổi có hiệu lực rồi mở lại ứng dụng. Nút **Sao chép Redirect URI** trên màn hình đăng nhập cung cấp chính xác địa chỉ `index.html` được sử dụng. Hai tên máy có vùng lưu dữ liệu trình duyệt riêng; dùng lại tên máy và cổng cũ nếu cần lấy cấu hình/dữ liệu đã lưu. Giữ Tenant ID/Client ID đang dùng, đồng thời đăng ký URI mới kết thúc bằng `/index.html`.

Tài liệu Microsoft: [AADSTS50011](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50011-redirect-uri-mismatch).

## Triển khai lần đầu

URL database không cấp quyền quản trị dự án. Các bước dưới đây cần tài khoản Google có quyền triển khai trong Firebase project `gvcn-3bdf9`. Cloud Functions cần dự án đáp ứng điều kiện thanh toán/triển khai của Firebase.

1. Giữ nguyên ứng dụng Entra đang dùng. Lấy Tenant ID từ phần cấu hình đăng nhập hiện tại.
2. Sao chép `firebase/functions/.env.example` thành `firebase/functions/.env.gvcn-3bdf9`, điền Tenant ID thật. Client ID trong ví dụ lấy từ ảnh lỗi; kiểm tra trùng với ứng dụng đang hoạt động. `GVCN_ALLOWED_ORIGINS` liệt kê chính xác các địa chỉ website được phép gọi API, không kèm đường dẫn HTML. Thêm tên miền HTTPS của trường khi đưa vào sử dụng.
3. Chạy từ thư mục gốc dự án trong PowerShell:

```powershell
npm.cmd --prefix firebase/functions ci --ignore-scripts
npm.cmd --prefix firebase/functions test
npm.cmd --prefix firebase/functions run check
npx.cmd --yes firebase-tools login
npx.cmd --yes firebase-tools projects:list
npx.cmd --yes firebase-tools deploy --project gvcn-3bdf9 --only "database,functions:gvcn"
```

Nếu database đang phục vụ ứng dụng khác, gộp nhánh `gvcn` vào rules hiện có trước khi triển khai rules; file rules trong dự án là cấu hình đầy đủ. API dùng Firebase Admin SDK với danh tính dịch vụ do Cloud Functions cung cấp. Không đặt khóa service account, database secret, mật khẩu hoặc Microsoft Client Secret trong HTML. Không cần Firebase Web API key cho cách kết nối này.

4. Mở `index.html` qua Live Server hoặc HTTPS, giữ cùng tên máy/cổng đã dùng để truy cập dữ liệu trình duyệt cũ. Đăng nhập Microsoft bằng tài khoản Admin. Chọn **Dữ liệu Firebase → Bật kết nối Firebase** sau khi API triển khai thành công. Có thể bật/tắt tại phần **Kết nối dữ liệu Firebase** trước khi đăng nhập nếu API chưa sẵn sàng.
5. Lần đầu đăng nhập online, API tạo các lớp còn thiếu trong nhánh dành riêng cho ứng dụng, đồng thời liên kết Admin đầu tiên với `oid` Microsoft. Không tạo dữ liệu minh họa hoặc ghi đè các nhánh khác của database.
6. Admin vào **Quản lý GVCN** để nhập họ tên, email Microsoft, lớp và trạng thái hoạt động. Giáo viên sau đó đăng nhập bằng Microsoft và nhận đúng phân công từ máy chủ.
7. Vào **Danh sách học sinh**, chọn khối/lớp rồi thêm, sửa, xóa hoặc nhập Excel. Giới hạn 28 học sinh/lớp hiện giữ theo workbook gốc.

Tài liệu Firebase: [HTTP Functions](https://firebase.google.com/docs/functions/http-events), [triển khai Functions](https://firebase.google.com/docs/functions/get-started), [Admin SDK và database](https://firebase.google.com/docs/database/admin/start).

## Cấu trúc dữ liệu

```text
gvcn/v1/years/2026-2027/
  bootstrapAdminOid              # Chỉ thiết lập Admin đầu tiên một lần
  users/{base64url(email)}/       # email, oid, role, classId/grade, active, teacherId
  teachers/{teacherId}/           # name, email, classId, active, thời điểm tạo/sửa
  teacherArchive/{eventId}/       # GVCN đã xóa, giữ dấu vết phân công
  classes/{classId}/
    revision                     # Số phiên bản tăng sau mỗi lần lưu
    updatedAt / updatedBy
    data/
      id / grade / teacher / email
      students/                  # id, name, code
      profiles/                  # M05 xuyên tháng
      months/T11_2026/           # Mã tháng được đổi / thành _ khi lưu RTDB
        schedule                 # M01
        meetings                 # M02, liên kết M05
        connections              # M03
        previous / plans         # M04
        approval                 # Trạng thái và lịch sử xác nhận
      audit/
  audit/{eventId}/                # Nhật ký thao tác máy chủ
```

Giao diện/JSON cũ vẫn sử dụng `schema: 2` và tên tháng `T11/2026`. API chuyển đổi khóa tháng và khôi phục mảng rỗng bị Firebase lược bỏ. Không dùng email chứa dấu chấm trực tiếp làm khóa Firebase.

Để cấp vai trò khối trưởng hoặc BGH trước khi có màn hình quản lý các vai trò này, người triển khai tạo bản ghi trong `users` qua Firebase Console. Ví dụ khối trưởng có `email`, `name`, `role: "lead"`, `grade: "8"`, `active: true`; BGH có `role: "bgh"`. Không đặt `oid` tùy ý: lần đăng nhập đầu sẽ liên kết tài khoản Microsoft đã xác thực. Tính khóa email bằng:

```powershell
node -e "console.log(Buffer.from('email@vietanhschool.edu.vn').toString('base64url'))"
```

Người dùng không thể tự sửa nhánh `users` từ trình duyệt. Rules chặn đọc/ghi trực tiếp nhánh `gvcn`; API kiểm tra quyền từng yêu cầu và ghi dữ liệu bằng Admin SDK.

## Giữ và chuyển dữ liệu cũ

- Khóa dữ liệu cũ `VA_GVCN_MSAL_PROTOTYPE_DATA_V1` và khóa Microsoft `VA_GVCN_MICROSOFT_AUTH_CONFIG_V1` được giữ nguyên.
- Chế độ Firebase sử dụng bộ nhớ đệm riêng theo tài khoản, không lấy cache làm nguồn quyết định quyền.
- Xuất JSON trước khi chuyển đổi. Admin chọn **Dữ liệu Firebase → Chuyển dữ liệu cũ lên Firebase**. Chỉ nhập lớp còn trống; không trộn hoặc ghi đè lớp đã có hồ sơ.
- Lịch sử báo cáo cũ trong dữ liệu do Admin nhập được giữ lại như dữ liệu chuyển đổi, không được xem là chữ ký xác nhận mới của máy chủ.
- Kiểm tra và bổ sung phân công trong **Quản lý GVCN** sau khi chuyển dữ liệu. Chỉ khi có bản ghi phân công máy chủ, giáo viên mới được đăng nhập online vào lớp.
- Khi có xung đột, xuất JSON/bản lưu chờ đồng bộ rồi tải dữ liệu máy chủ để đối chiếu. Thử đồng bộ lại không bỏ qua kiểm tra phiên bản.
- Dữ liệu cục bộ hỏng/khác schema được giữ nguyên và báo lỗi, không tự thay bằng dữ liệu trống.

## Kiểm tra đã có

```powershell
npm.cmd --prefix firebase/functions test
```

Bộ kiểm tra chạy với dữ liệu giả, Firebase adapter trong bộ nhớ có mô phỏng việc bỏ mảng rỗng, HTML chạy trong môi trường DOM giả lập, và token RS256 ký bằng khóa kiểm thử. Chưa thay thế kiểm tra trình duyệt, đăng nhập Microsoft thật hoặc kiểm tra database thật sau triển khai.
