# Kho ảnh tập trung trên OneDrive của Admin

## Trạng thái

Mã đã hỗ trợ lưu tập trung vào OneDrive công vụ `lammt@vietanhschool.edu.vn`. Để dùng thật, phải hoàn thành cấu hình Microsoft bên dưới và triển khai API mới. Push GitHub chỉ cập nhật mã/GitHub Pages, không tự thiết lập quyền Microsoft hay triển khai Cloudflare khi Builds đang ngắt.

## Người dùng thấy gì?

- GVCN chọn/dán ảnh, bấm Lưu thông tin; dùng phiên Microsoft hiện có của ứng dụng, không cấp quyền OneDrive riêng.
- Hiện ảnh thu nhỏ, dấu X ở góc để gỡ khỏi lần kết nối và popup xem ảnh lớn. Không hiện tên tệp hoặc link OneDrive.
- Admin được truy cập ảnh mọi lớp; GVCN chỉ lớp được phân công thật tại API. Khối trưởng và BGH thuần tổng hợp không được mở ảnh.
- Gỡ ảnh chỉ gỡ liên kết khỏi báo cáo, giữ tệp nguồn để tránh mất minh chứng. Chưa có tính năng dọn tệp nguồn tự động.

Phân quyền này nằm ở **API**, không phải chia sẻ thư mục OneDrive cho từng giáo viên. Các thư mục trên OneDrive của Admin vẫn có thể giữ riêng tư; ứng dụng máy chủ là bên có quyền ghi/đọc.

## Cấu hình một lần

Thực hiện bằng chủ OneDrive và người có quyền quản trị ứng dụng Microsoft 365 của trường. Quyền Admin trong web GVCN không đồng nghĩa quyền quản trị Entra.

1. Trong OneDrive công vụ của `lammt@vietanhschool.edu.vn`, tạo hoặc dùng thư mục `GVCN_MinhChung`. Không tạo link chia sẻ công khai.
2. Tạo **ứng dụng máy chủ riêng** trong Entra, cùng tenant trường. Giữ nguyên Client ID/Tenant ID/Redirect URI của ứng dụng đăng nhập GVCN đang hoạt động.
3. Ở ứng dụng máy chủ, thêm Microsoft Graph **Application permission `Files.SelectedOperations.Selected`**, rồi cấp admin consent theo chính sách trường.
4. Người có quyền quản lý thư mục cấp cho ứng dụng máy chủ vai trò `write` trên riêng thư mục kho ảnh. Chỉ thêm permission trong Entra chưa đủ: phải có bước gán thư mục này.
5. Tạo Client Secret cho ứng dụng máy chủ, giữ Value trong mục Secrets của máy chủ. Không đưa giá trị này vào GitHub, HTML, JavaScript, ảnh chụp hay cuộc trò chuyện.

Lấy drive ID và folder ID bằng công cụ quản trị/Graph Explorer được trường cho phép, đăng nhập bằng chủ OneDrive:

```http
GET https://graph.microsoft.com/v1.0/me/drive
GET https://graph.microsoft.com/v1.0/me/drive/root:/GVCN_MinhChung
```

Gán ứng dụng vào thư mục bằng tài khoản/công cụ có quyền thực hiện thao tác:

```http
POST https://graph.microsoft.com/v1.0/drives/{drive-id}/items/{folder-id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToV2": {
    "application": { "id": "CLIENT_ID_UNG_DUNG_MAY_CHU" }
  }
}
```

Đây là thao tác cấp quyền cho **ứng dụng**, không cấp cho toàn bộ giáo viên. Nếu không có quyền consent/thiết lập ứng dụng, cần quản trị Microsoft 365 thực hiện; tài khoản GVCN thông thường không thể tự vượt bước này.

## Biến máy chủ

Thêm vào runtime của Worker/API, không sửa cấu hình đăng nhập giao diện:

| Biến | Nội dung |
| --- | --- |
| `EVIDENCE_CLIENT_ID` | Application ID của ứng dụng lưu trữ máy chủ |
| `EVIDENCE_CLIENT_SECRET` | Secret Value của ứng dụng lưu trữ, đặt loại Secret |
| `EVIDENCE_DRIVE_ID` | Drive ID OneDrive của Admin |
| `EVIDENCE_ROOT_ID` | Item ID thư mục `GVCN_MinhChung` |
| `MICROSOFT_TENANT_ID` | Tenant hiện có của trường; giữ nguyên |

Cấu trúc được tạo khi tải ảnh:

```text
GVCN_MinhChung/
  2026-2027/
    8C3/
      T11-2026/
        <mã ảnh>.jpg
```

Mỗi ảnh mới được nén JPEG phía trình duyệt, tối đa 2 MB sau nén; đầu vào JPG/PNG/WebP tối đa 10 MB. Mỗi bản ghi tối đa 5 ảnh.

## Luồng bảo vệ và dữ liệu cũ

1. Web gửi ID token Microsoft GVCN đến `/api/evidence/{classId}/upload` hoặc đường dẫn xem ảnh.
2. API xác minh chữ ký token, đọc phân công mới nhất và kiểm tra lớp/trạng thái báo cáo. Không tin classId hoặc vai trò do web tự khai.
3. Máy chủ lấy token Graph bằng ứng dụng lưu trữ, ghi ảnh trong thư mục lớp, lưu chỉ mục riêng tại `school.evidence` của Firebase.
4. Bản ghi M03 chỉ giữ `{provider:'school', id, size, mimeType}`. Khi xem, máy chủ lấy ảnh rồi trả nội dung ảnh; không redirect trình duyệt đến URL tải Microsoft.
5. URL Blob hiển thị ảnh chỉ tồn tại trong trình duyệt của phiên hiện tại; được thu hồi khi rời trang/đăng xuất/đổi phạm vi.

Ảnh cũ dạng OneDrive được giữ nguyên trong dữ liệu lưu; API mới chỉ trả mã `legacy`, che URL nguồn. Proxy chỉ đọc ảnh cũ nếu đúng drive Admin, đúng thư mục năm/lớp/tháng dưới `EVIDENCE_ROOT_ID`. Ảnh từng lưu trên OneDrive riêng của giáo viên khác cần bàn giao/chuyển kho; hệ thống không tự di chuyển hay xóa ảnh cũ. Bản JSON sao lưu tải từ web không chứa các tệp ảnh gốc; không thay cho sao lưu kho lưu trữ.

Người có quyền xem ảnh luôn có thể lưu lại nội dung hoặc chụp màn hình. Việc không hiện đường dẫn nguồn không phải DRM và không thể che tuyệt đối công nghệ lưu trữ khỏi người phân tích mã nguồn. Bảo vệ thực tế là quyền API, thư mục riêng tư và không lộ token/URL tải.

## Kiểm thử và triển khai

Đã có kiểm thử giả lập Graph cho ghi/đọc ảnh, giới hạn kích thước, che thông tin nguồn, chống gắn ảnh chéo học sinh/lớp/tháng và khóa quyền sau thu hồi. Chưa xác nhận tải thật lên tenant trường khi chưa có cấu hình ở trên.

Sau cấu hình, triển khai API và giao diện cùng phiên bản khi chủ dự án cho phép Cloudflare deploy. Thử một ảnh bằng Admin, rồi bằng một GVCN; xác minh tài khoản lớp khác không mở được ảnh. Không dùng liên kết chia sẻ công khai làm phương án bỏ qua lỗi quyền.

Tài liệu Microsoft:

- [Selected permissions cho OneDrive/SharePoint](https://learn.microsoft.com/en-us/graph/permissions-selected-overview)
- [Cấp quyền ứng dụng cho một thư mục](https://learn.microsoft.com/en-us/graph/api/driveitem-post-permissions?view=graph-rest-1.0)
