# Cloudflare Workers — GVCN Việt Anh

Production: https://gvcnva2.lammt.workers.dev/index.html

## Kết nối GitHub và tự triển khai

Trong Cloudflare → Compute → Workers & Pages → `gvcnva2` → Settings → Builds,
kết nối repository `maithulammm/gvcnva2` và chọn:

| Mục | Giá trị |
| --- | --- |
| Production branch | `main` |
| Root directory | Gốc repository |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |

Tên Worker phải là `gvcnva2`, khớp `wrangler.jsonc`. File cấu hình này triển khai
giao diện từ `dist/` và API từ `cloudflare/worker.mjs` cùng domain. Không dùng chế độ
chỉ tải lên tài nguyên tĩnh vì chế độ đó không triển khai API. Mỗi lần push lên
`main` sẽ kích hoạt build/deploy khi kết nối Git đã bật. Lệnh build không triển khai
hoặc đọc dữ liệu Firebase.

## Cấu hình một Secret trên Worker

Trong Worker → Settings → Variables and Secrets → Add:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `FIREBASE_SERVICE_ACCOUNT` | Toàn bộ JSON service account của project `gvcn-3bdf9` |

Dùng khóa hiện đang cấp quyền truy cập database cho API cũ nếu còn bản lưu. Nếu
không còn, tại Firebase Console → Project settings → Service accounts → Generate
new private key, tải JSON và dán trực tiếp vào **Secret của Cloudflare**. Đây là
khóa máy chủ; không gửi qua chat, không đặt trong `assets/`, không commit Git.
Không cần Firebase Web Config hoặc mở rules database cho trình duyệt.

Lưu/Deploy thay đổi Secret rồi triển khai phiên bản code mới. Nếu Cloudflare hỏi
phạm vi biến, chọn biến **runtime của Worker**, không chỉ biến của bước Build.

Các giá trị công khai đã được khai báo trong `wrangler.jsonc`:

- `MICROSOFT_TENANT_ID`: `22215a7f-b9e3-4b53-bd27-3a317311e6ca`
- `MICROSOFT_CLIENT_ID`: `94c476b3-4723-4161-9dea-d64ff8bf505c`
- `GVCN_ALLOWED_ORIGINS`: `https://gvcnva2.lammt.workers.dev`
- `GVCN_ADMIN_EMAIL`: `lammt@vietanhschool.edu.vn`

Đừng thêm đường dẫn `/index.html` hoặc dấu `/` cuối vào giá trị allowed origin.

## Microsoft Entra

Trong Entra → App registrations → ứng dụng client ID
`94c476b3-4723-4161-9dea-d64ff8bf505c` → Authentication → Single-page application
(SPA), **thêm** Redirect URI:

```
https://gvcnva2.lammt.workers.dev/index.html
```

Giữ tenant/client ID và các URI cũ đang dùng. Cấu hình static assets giữ nguyên
`index.html` để URI callback không bị tự chuyển sang đường dẫn khác.

## Kiểm tra sau triển khai

1. Mở `https://gvcnva2.lammt.workers.dev/api/health`: phải là JSON, HTTP 200,
   `configured: true`. `databaseConfigured: false` nghĩa là chưa có Secret đúng
   định dạng; kiểm tra này chưa thử quyền đọc thực tế của khóa.
2. Chạy `npm run api:status`: health 200, preflight 204, bootstrap không token 401.
   404 nghĩa là mới triển khai giao diện tĩnh hoặc chưa chạy code Worker API.
3. Đăng nhập Microsoft bằng tài khoản trường; API kiểm tra token và phân công tại
   máy chủ. Nếu health đúng nhưng đăng nhập báo lỗi Firebase, xem quyền/khóa service
   account và Workers Logs; không đưa khóa hoặc token vào log.

Database, đường dẫn `gvcn/v1/years/2026-2027`, danh sách, oid đã liên kết và revision
giữ nguyên. Worker dùng Google OAuth và Firebase REST với ETag/If-Match để thực
hiện transaction; không dùng Netlify làm trung gian. Phân quyền và quy trình duyệt
tiếp tục dùng chung `firebase/functions/service.mjs`.

Bản nháp và phiên đăng nhập cục bộ thuộc từng domain. Website mới không tự đọc
localStorage của Netlify/GitHub Pages. Những dữ liệu đã đồng bộ Firebase vẫn có
trên website mới; dữ liệu còn ở máy cũ cần xuất JSON riêng nếu muốn chuyển.

Tài liệu: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/),
[Secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Firebase REST conditional writes](https://firebase.google.com/docs/database/rest/save-data).
