# Kết nối OneDrive bằng tài khoản chủ kho

Luồng mặc định hiện tại là **Delegated authorization code + PKCE**, không phải quyền Application. Chỉ `lammt@vietanhschool.edu.vn` kết nối kho ảnh một lần; GVCN vẫn chỉ đăng nhập GVCN như bình thường. Chính sách Microsoft 365 của trường vẫn có thể yêu cầu quản trị viên phê duyệt; mã không bỏ qua chính sách này.

## Cấu hình Entra

Trong ứng dụng riêng **GVCN - Kho ảnh**, giữ Microsoft Graph Delegated permissions `Files.ReadWrite` và `offline_access`. Không thay ứng dụng đăng nhập GVCN chính.

Thêm nền tảng **Web** với Redirect URI chính xác:

```text
https://gvcnva2.lammt.workers.dev/api/evidence/oauth/callback
```

Không đăng ký callback này dưới SPA: mã trao đổi authorization code và làm mới token chạy phía máy chủ với Client Secret.

## Cấu hình Cloudflare

| Biến | Cách thiết lập |
| --- | --- |
| `EVIDENCE_CLIENT_ID` | ID ứng dụng GVCN - Kho ảnh; đã khai báo giá trị công khai trong wrangler.jsonc |
| `EVIDENCE_CLIENT_SECRET` | Secret Value của ứng dụng kho ảnh, lưu loại Secret trong runtime, không đưa vào source |
| `EVIDENCE_AUTH_MODE` | `delegated`, đã khai báo trong wrangler.jsonc |
| `MICROSOFT_TENANT_ID` | Giữ tenant trường hiện có |
| `GVCN_ADMIN_EMAIL` | Giữ `lammt@vietanhschool.edu.vn` |

Không cần nhập Drive ID hoặc Folder ID ở chế độ này. Khi kết nối thành công, máy chủ tự tìm OneDrive của chủ kho và tìm/tạo thư mục `GVCN_MinhChung`.

## Sau khi triển khai phiên bản mới

1. Đăng nhập web GVCN bằng `lammt@vietanhschool.edu.vn`.
2. Mở **Quản trị viên → Dữ liệu → Kho ảnh minh chứng**.
3. Bấm **Kết nối OneDrive của tôi**, chọn đúng tài khoản `lammt@vietanhschool.edu.vn` và chấp nhận quyền.
4. Microsoft quay lại trang Dữ liệu. Bấm Kiểm tra kết nối nếu cần; trạng thái phải hiện **Đã kết nối**.
5. Tải thử một ảnh mới ở Mẫu 3 và mở lại để kiểm tra. Sau đó có thể Disconnect Builds của Cloudflare nếu không muốn tự deploy các lần push tiếp theo.

GVCN không được xem cấu hình kho ảnh, không cần cấp quyền Graph và không nhận refresh token của chủ kho. Admin khác có thể xem trạng thái, nhưng chỉ email chủ kho được bắt đầu kết nối.

## Cách lưu phiên và ảnh

- API xác thực danh tính Microsoft của Admin trước khi tạo yêu cầu OAuth.
- Mỗi yêu cầu có state ngẫu nhiên, PKCE S256 và nonce, hiệu lực 10 phút, chỉ dùng một lần.
- ID token của ứng dụng kho ảnh được kiểm tra chữ ký, tenant, audience, hạn dùng và nonce. Tài khoản được chọn phải trùng OID/email của người khởi tạo.
- Refresh token và PKCE verifier được mã hóa AES-256-GCM trước khi ghi Firebase. Khóa được dẫn xuất từ Client Secret phía máy chủ; bootstrap/JSON sao lưu trên giao diện không trả vault này.
- Token truy cập Graph chỉ ở RAM máy chủ. Refresh token mới được mã hóa và thay thế sau khi Microsoft làm mới phiên.
- Thay Client Secret hoặc Microsoft thu hồi quyền/phiên có thể yêu cầu chủ kho kết nối lại. Không bảo đảm kết nối vĩnh viễn.
- Cấu trúc ảnh, phân quyền theo lớp, mã ảnh ở M03, thumbnail và popup xem lớn giữ như [Kho ảnh tập trung](KHO_ANH_TAP_TRUNG.md).
- Hủy liên kết ảnh ở M03 không tự xóa tệp gốc. Không có bước tự tạo link chia sẻ công khai.

## Xử lý thông báo thường gặp

| Thông báo/tình huống | Cách xử lý |
| --- | --- |
| AADSTS50011 | Callback phải đúng URI phía trên, loại Web, trong đúng ứng dụng kho ảnh |
| Need admin approval | Chính sách trường chưa cho phép tự cấp consent; cần quản trị Microsoft 365 xử lý |
| Máy chủ thiếu cấu hình | Kiểm tra Client ID và Secret Value, không dùng Secret ID |
| Kết nối xong nhưng báo lỗi | Chọn đúng tài khoản chủ kho; kiểm tra OneDrive công vụ có dùng được không |
| Admin cần kết nối lại kho ảnh | Mở Dữ liệu và bấm Kết nối lại; không thay cấu hình đăng nhập GVCN chính |

Tài liệu Microsoft: [Authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [chính sách consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent).
