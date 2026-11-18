# Firebase cho hệ thống GVCN Việt Anh 2026–2027

**Cập nhật triển khai:** API hiện chuyển sang **Cloudflare Workers** tại
`https://gvcnva2.lammt.workers.dev/api/*`. Làm theo [hướng dẫn Cloudflare](../cloudflare/README.md)
để thiết lập Secret Firebase và Microsoft Entra. Các phần Netlify bên dưới là
tài liệu triển khai cũ, không phải endpoint frontend đang dùng.

Trang duy nhất là `index.html`; CSS và JavaScript được tách trong `assets/`. Đăng nhập Microsoft cũng trả về `index.html`. API production chạy trên Netlify Functions, còn dữ liệu nằm trong Firebase Realtime Database. Xem [bản đồ mã nguồn](../README.md).

## Đã chuẩn bị

- Admin đầu tiên: `lammt@vietanhschool.edu.vn`.
- Admin thêm, sửa, xóa GVCN; phân công một lớp/GVCN; thu hồi quyền khi ngừng hoạt động hoặc xóa.
- Admin thêm, sửa, xóa học sinh, nhập danh sách Excel. Chặn xóa học sinh có lịch gặp, cuộc gặp, kết nối phụ huynh, hỗ trợ hoặc hồ sơ M05 liên quan.
- Database: `https://gvcn-3bdf9-default-rtdb.asia-southeast1.firebasedatabase.app`.
- API Netlify Function: `https://gvcnva2.netlify.app/api/*`.
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

Với website production, thêm URI:

```text
https://gvcnva2.netlify.app/index.html
```

Lưu cấu hình Entra, chờ thay đổi có hiệu lực rồi mở lại ứng dụng. Nút **Sao chép Redirect URI** trên màn hình đăng nhập cung cấp chính xác địa chỉ `index.html` được sử dụng. Hai tên máy có vùng lưu dữ liệu trình duyệt riêng; dùng lại tên máy và cổng cũ nếu cần lấy cấu hình/dữ liệu đã lưu. Giữ Tenant ID/Client ID đang dùng, đồng thời đăng ký URI mới kết thúc bằng `/index.html`.

Tài liệu Microsoft: [AADSTS50011](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50011-redirect-uri-mismatch).

## API miễn phí qua Netlify Functions

Firebase Realtime Database giữ nguyên ở project `gvcn-3bdf9` (gói Spark). Firebase Cloud Functions cần Blaze, nên API production chạy bằng Netlify Function tại `https://gvcnva2.netlify.app/api/*`. Các request vẫn xác minh JWT Microsoft ở máy chủ và kiểm tra quyền theo vai trò; không mở Realtime Database cho trình duyệt. Rules hiện tại từ chối đọc/ghi trực tiếp và không cần thay đổi.

### Cấu hình bí mật trong Netlify

1. Trong Firebase Console → Project settings → Service accounts, tạo/tải khóa JSON cho một service account của project `gvcn-3bdf9`. Khóa này có quyền quản trị database: không commit vào Git, không gửi qua chat và không đưa vào frontend.
2. Trong Netlify → Project configuration → Environment variables, thêm các biến sau cho Production và Functions:

```text
FIREBASE_SERVICE_ACCOUNT=<toàn bộ nội dung JSON key>
MICROSOFT_TENANT_ID=<Tenant ID Entra đang dùng>
MICROSOFT_CLIENT_ID=<Client ID Entra đang dùng>
GVCN_ADMIN_EMAIL=lammt@vietanhschool.edu.vn
GVCN_ALLOWED_ORIGINS=https://gvcnva2.netlify.app,http://localhost:5500,http://127.0.0.1:5500
```

`FIREBASE_SERVICE_ACCOUNT` là bí mật có quyền cao. Chỉ dán trực tiếp vào ô Environment variables của Netlify; không lưu trong `.env.example`, source code, GitHub hoặc tin nhắn. Các biến còn lại phải giữ đúng Tenant ID/Client ID của ứng dụng Microsoft đang dùng.
3. Push lên nhánh `main` để Netlify build site và function cùng lúc. Nếu đã thêm biến sau lần deploy, chạy lại deploy production từ Netlify.

Kiểm tra endpoint:

```powershell
npm.cmd run api:status
```

Khi đã cấu hình đúng, `/api/health` trả 200, OPTIONS của `/api/bootstrap` trả 204 và GET `/api/bootstrap` chưa có token Microsoft trả 401. Health chỉ báo trạng thái cấu hình, không đọc hồ sơ hay ghi dữ liệu.

Sau đó mở `https://gvcnva2.netlify.app`, đăng nhập Microsoft bằng Admin và bật **Dữ liệu Firebase**. Realtime Database hiện `null` là bình thường nếu chưa có Admin bootstrap dữ liệu; lần đầu Admin kết nối thành công, API mới khởi tạo cây dữ liệu. Có thể chạy frontend local qua `localhost:5500`; API production cho phép origin đó. Hạn mức miễn phí của Netlify và Firebase vẫn áp dụng.

Tài liệu: [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup), [Netlify Functions](https://docs.netlify.com/build/functions/overview/).

## Cấu trúc dữ liệu

```text
gvcn/v1/years/2026-2027/
  bootstrapAdminOid              # Chỉ thiết lập Admin đầu tiên một lần
  users/{base64url(email)}/       # email, oid, roles, classId, grades, active, teacherId
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

Tài khoản có thể có nhiều vai trò, ví dụ `roles: ["gvcn","lead"]`, `classId: "8C6"`, `grades: ["8"]`. Khối trưởng nhiều khối dùng mảng `grades`, chẳng hạn `["10","11","12"]`. `role` và `grade` đơn vẫn được lưu để tương thích dữ liệu cũ; API luôn xác thực phạm vi từng yêu cầu. GVCN kiêm khối trưởng chỉ được sửa lớp GVCN của mình và không thể tự rà soát báo cáo do chính tài khoản đó gửi.

Admin quản lý tài khoản tại **Người dùng & vai trò** trong ứng dụng khi đã kết nối Firebase. Có thể sửa vai trò/phạm vi, bật hoặc ngừng tài khoản và nhập danh sách phân công JSON đã chuẩn bị; API kiểm tra toàn bộ xung đột trước khi ghi. Không sửa trực tiếp nhánh `users` trong Firebase Console. Tài khoản mới không có `oid` cho đến khi đăng nhập Microsoft lần đầu; API liên kết với `oid` đã xác thực.

## Giữ và chuyển dữ liệu cũ

- Khóa dữ liệu cũ `VA_GVCN_MSAL_PROTOTYPE_DATA_V1` và khóa Microsoft `VA_GVCN_MICROSOFT_AUTH_CONFIG_V1` được giữ nguyên.
- Chế độ Firebase sử dụng bộ nhớ đệm riêng theo tài khoản, không lấy cache làm nguồn quyết định quyền.
- Xuất JSON trước khi chuyển đổi. Admin chọn **Dữ liệu Firebase → Chuyển dữ liệu cũ lên Firebase**. Chỉ nhập lớp còn trống; không trộn hoặc ghi đè lớp đã có hồ sơ.
- Lịch sử báo cáo cũ trong dữ liệu do Admin nhập được giữ lại như dữ liệu chuyển đổi, không được xem là chữ ký xác nhận mới của máy chủ.
- Kiểm tra và bổ sung phân công trong **Quản lý GVCN** và **Người dùng & vai trò** sau khi chuyển dữ liệu. Chỉ khi có bản ghi phân công máy chủ, người dùng mới được đăng nhập online theo vai trò.
- Khi có xung đột, xuất JSON/bản lưu chờ đồng bộ rồi tải dữ liệu máy chủ để đối chiếu. Thử đồng bộ lại không bỏ qua kiểm tra phiên bản.
- Dữ liệu cục bộ hỏng/khác schema được giữ nguyên và báo lỗi, không tự thay bằng dữ liệu trống.

## Kiểm tra đã có

```powershell
npm.cmd --prefix firebase/functions test
```

Bộ kiểm tra chạy với dữ liệu giả, Firebase adapter trong bộ nhớ có mô phỏng việc bỏ mảng rỗng, HTML chạy trong môi trường DOM giả lập, và token RS256 ký bằng khóa kiểm thử. Chưa thay thế kiểm tra trình duyệt, đăng nhập Microsoft thật hoặc kiểm tra database thật sau triển khai.
