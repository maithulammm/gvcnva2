# Ảnh minh chứng kết nối phụ huynh (Mẫu 3)

## Cách sử dụng

1. Mở Mẫu 3 → Ghi lần kết nối hoặc Sửa.
2. Chọn ảnh JPG/PNG/WebP, hoặc bấm vùng dán rồi Ctrl+V ảnh chụp màn hình. Tối đa 5 ảnh, mỗi ảnh đầu vào không quá 10 MB.
3. Lần đầu dùng, bấm **Kết nối OneDrive** và cấp quyền bằng đúng tài khoản Microsoft đang đăng nhập ứng dụng.
4. Nhập nội dung kết nối và bấm **Lưu thông tin**. Ảnh được nén JPEG, cạnh dài tối đa 2.000 pixel rồi tải lên OneDrive trước khi lưu bản ghi.

Ảnh nằm trong OneDrive của người tải:

```text
GVCN_MinhChung/2026-2027/<lớp>/<tháng>/PHHS_<mã riêng>.jpg
```

Firebase lưu `evidenceImages` gồm mã tệp, mã drive, webUrl, tên ảnh, dung lượng, loại ảnh, người tải và thời gian. Không lưu Blob/base64 hoặc token Microsoft. Dữ liệu mới tương thích cơ chế lưu lớp hiện có; không cần API mới để lưu metadata này.

## Quyền Microsoft

Ứng dụng xin **Microsoft Graph → Delegated permissions → Files.ReadWrite** khi người dùng bấm Kết nối OneDrive. Quyền này khác `User.Read` dùng đọc ảnh đại diện và không yêu cầu đưa client secret vào trang web.

Nếu hộp thoại yêu cầu quản trị viên phê duyệt, quản trị Microsoft 365 cần kiểm tra ứng dụng GVCN trong Entra → API permissions, thêm quyền delegated trên và cấp consent theo chính sách của trường. Không thay Client ID, Tenant ID hay Redirect URI đang hoạt động. Tài khoản giáo viên cần có OneDrive sử dụng được.

- [Tải tệp qua Graph và quyền cần thiết](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content)
- [Tạo thư mục OneDrive](https://learn.microsoft.com/en-us/graph/api/driveitem-post-children)

## Lưu ý về dữ liệu

- **Bỏ ảnh** chỉ bỏ liên kết khi lưu bản ghi; không xóa tệp nguồn trên OneDrive.
- Ảnh chưa tải chỉ được giữ trong popup. Nếu đóng, bỏ nháp hoặc tải lại trang, cần chọn lại các ảnh chưa tải. Nội dung chữ và metadata ảnh đã tải được giữ trong bản nháp theo cơ chế hiện có.
- Nếu tải được một số ảnh rồi mất mạng, popup vẫn mở. Thử lại chỉ tải những ảnh còn thiếu; tên tệp được giữ ổn định để giảm trùng khi mạng ngắt sau khi máy chủ đã nhận tệp.
- Nếu ảnh đã tải nhưng hủy bản ghi, tệp vẫn còn trên OneDrive; có thể kiểm tra thư mục nguồn và tự dọn khi cần.
- Không tự tạo link công khai hoặc thay quyền chia sẻ. Admin/BGH của trang GVCN không tự có quyền đọc OneDrive của giáo viên. Muốn quản lý tập trung, cần thư viện SharePoint chung và cấu hình quyền tương ứng.
- Bản sao lưu JSON giữ metadata, không chứa ảnh gốc. Mẫu Excel hiện tại không nhúng các ảnh này.
- Khi đổi GVCN hoặc tài khoản Microsoft bị thu hồi, cần bàn giao tệp/quyền truy cập OneDrive riêng.

Kiểm thử tự động dùng Graph giả lập; việc cấp consent và tải lên tenant thật cần thử bằng tài khoản trường. Thêm ảnh là tùy chọn và không tự làm tăng số lần kết nối, lượt gặp hay thay đổi trạng thái báo cáo.
