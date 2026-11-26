# Cloudflare Workers — GVCN Việt Anh

Production: https://gvcnva2.lammt.workers.dev/index.html

## Sao lưu và khôi phục

Worker có Cron Trigger `0 18 * * *` (01:00 giờ Việt Nam mỗi ngày).
Sau khi deploy API mới, mỗi lớp giữ tối đa 30 bản sao theo ngày và 20 phiên bản
trước cập nhật. Bản sao được lưu trong `recovery` cùng gốc dữ liệu Firebase;
đây là lịch sử khôi phục trong cùng database, không thay thế bản sao ngoài hệ thống.
Admin vào Dữ liệu, chọn lớp rồi bấm **Sao lưu & lịch sử lớp đang chọn** để tải
JSON hoặc khôi phục toàn bộ lớp. Khôi phục kiểm tra revision, sao lưu dữ liệu hiện
tại trước khi thay thế và giữ phân công GVCN hiện hành. Người dùng khác không
được đọc API `/recovery/:classId`.

## Xem giao diện mới trên GitHub Pages

Frontend không tự chuyển từ GitHub Pages sang Cloudflare. Mở
`https://maithulammm.github.io/gvcnva2/index.html` sau khi GitHub Pages cập nhật.
Trong repository → Settings → Pages, có thể chọn Deploy from a branch → `main`
→ `/(root)` vì frontend dùng các đường dẫn tài nguyên tương đối.

Để đăng nhập và dùng dữ liệu thật trên GitHub Pages, thêm SPA Redirect URI
`https://maithulammm.github.io/gvcnva2/index.html` trong Entra và thêm origin
`https://maithulammm.github.io` vào danh sách CORS của API. `wrangler.jsonc` đã
chuẩn bị cả origin Cloudflare và GitHub; cấu hình này chỉ có hiệu lực trên máy
chủ khi chủ dự án yêu cầu triển khai Cloudflare. GitHub Pages chỉ chạy frontend,
API dùng chung vẫn tại Cloudflare. Không chuyển API sang đường dẫn `/api` của
GitHub Pages hoặc bỏ kiểm tra phân quyền để xem trước.

Theo yêu cầu chủ dự án: chỉ commit/push GitHub, không tự triển khai Cloudflare.
Kết nối tự triển khai Cloudflare đã được chủ dự án xác nhận ngắt; chỉ triển khai
Cloudflare khi có lệnh rõ ràng.

## Kết nối GitHub và tự triển khai

Trong Cloudflare → Compute → Workers & Pages → `gvcnva2` → Settings → Builds,
kết nối repository `maithulammm/gvcnva2` và chọn:

| Mục | Giá trị |
| --- | --- |
| Production branch | `main` |
| Root directory | Gốc repository |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |

`wrangler.jsonc` cũng khai báo `build.command = "npm run build"`, nên lệnh
`npx wrangler deploy` vẫn tự tạo `dist/` khi mục Build command trên dashboard
đang để None. Không cần đưa thư mục sinh tự động `dist/` lên GitHub.

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
- `GVCN_ALLOWED_ORIGINS`: `https://gvcnva2.lammt.workers.dev,https://maithulammm.github.io`
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

## Kho lịch sử D1

## Đồng bộ bản ghi và thống kê API

### Bảo trì

- Migration D1 `0004_maintenance.sql` khởi tạo trạng thái tắt. QTV → Bảo trì có
  thông báo tùy chỉnh và nút bật/tắt, xác nhận trước khi thay đổi.
- Trạng thái lấy trực tiếp từ D1; API chặn tài khoản ngoài QTV với HTTP 503,
  mã `MAINTENANCE`, kể cả đọc biểu mẫu, lưu hoặc tải ảnh. QTV thực được miễn
  chặn dù đang xem thử vai trò. GVCN không thể tự tắt bằng cách gọi API.
- Trang kiểm tra mỗi 15 giây qua endpoint công khai chỉ chứa thông báo/trạng
  thái. Dialog toàn màn hình không đóng bằng Escape; tắt thì tự gỡ chặn.
- Giữ bản nhập cục bộ và bản chờ; phần chờ do bảo trì cần bấm thử đồng bộ lại
  sau khi mở. Không tự phát lại một lượt ghi chưa biết kết quả.
- Đây không phải khóa cutover: request đã vào trước lúc bật và tác vụ Scheduled
  có thể hoàn tất. Chuyển nguồn dữ liệu cần cơ chế chờ cạn giao dịch riêng.

### Chuẩn bị chuyển nguồn sang Supabase

1. Giữ `GVCN_DATA_SOURCE` chưa đặt (mặc định Firebase). Không đổi tên hoặc xóa
   Microsoft/Firebase/OneDrive secrets và binding lịch sử D1.
2. Chạy `supabase/migrations/0001_gvcn_staging.sql`, rồi
   `supabase/migrations/0002_transactional_storage.sql` trong SQL Editor.
3. QTV → Dữ liệu → Kiểm tra kết nối Supabase → Sao chép thử & đối chiếu.
   Bản sao thử chỉ ghi đè một bản thử có marker `staged`, không ghi đè database
   bất kỳ và không sửa/xóa Firebase. So sánh hash toàn bộ dữ liệu đã chuẩn hóa,
   kiểm tra nguồn có thay đổi trong lúc sao chép và trả số lớp/học sinh/tháng.
4. ĐÂY CHƯA PHẢI CUTOVER. Trước khi chuyển chính thức phải có cơ chế chặn tất cả
   lượt ghi, chờ các request đang chạy kết thúc, sao chép cuối cùng và đối chiếu.
   Không tự đổi marker thành `verified` hoặc bật biến nguồn trong Dashboard.
5. Adapter nguồn Supabase chỉ chạy khi marker đã `verified`; nếu chưa có marker,
   báo 503 thay vì khởi tạo trường trống hoặc tự quay lại Firebase đã cũ.

Các bảng `gvcn_classes`, `gvcn_class_months` tách lớp/tháng. Postgres CAS khóa
giao dịch ngắn, so hash giá trị cũ trước khi ghi và chỉ UPDATE những tháng thay
đổi. Nghiệp vụ phân quyền, snapshot, ảnh và liên kết M01/M02 dùng service cũ.
Các bảng/hàm không mở cho anon/authenticated. Secret key chỉ ở backend.
Chưa có luồng realtime/presence mới: không tạo Firebase Auth hoặc đổi đăng nhập.

- Chạy migrations D1 trước khi deploy để có `gvcn_api_metrics`.
- QTV → Dữ liệu → Thống kê API: số request theo route/phương thức/HTTP,
  thời gian trung bình, tối đa và số lượt >= 3 giây trong 24 giờ; giữ 30 ngày.
- Không ghi token, email, mã lớp/học sinh, nội dung hay query string vào thống kê.
- Giao diện dùng hai hàng đợi đọc/ghi riêng; ghi không chờ lượt đọc nền, nhưng
  vẫn tuần tự với các lượt ghi khác. Phiên đăng nhập đổi sẽ hủy công việc cũ.
- Khi máy chủ báo `recordPatches`, chỉnh sửa nội dung tháng gửi các operation
  upsert/delete, kèm phiên bản từng tháng `_revision`. Hai tháng khác nhau không
  bị xung đột chỉ vì revision lớp đổi. Cùng tháng có thay đổi thì trả HTTP 409.
- Danh sách học sinh, phân công, M05 và thay đổi cấu trúc vẫn dùng đường lưu lớp
  hiện có. Phía Firebase hiện vẫn giữ giao dịch cấp lớp để bảo toàn liên kết,
  kiểm tra quyền, snapshot và hàng đợi xóa ảnh. Đây chưa phải chuyển dữ liệu thật
  sang các bảng Supabase; không được tuyên bố đã bỏ mọi lượt đọc cả lớp.
- `gvcn_revision_cache` ở D1 giữ phiên bản lớp tối đa 60 giây cho `/changes`.
  Phân công và phạm vi vẫn đọc mới; không cache quyền hoặc nội dung học sinh.
  Bootstrap/lưu cập nhật cache. Cache lỗi thì đọc Firebase. Chỉ thông báo thay
  đổi có thể trễ do TTL; kiểm tra xung đột khi lưu không dùng cache.
- Các GET cùng URL đang chờ dùng chung một Promise. Sau khi có lượt ghi mới,
  GET không dùng lại lượt đọc trước ghi. Refresh nền không áp dữ liệu nếu đã có
  lượt ghi/chỉnh sửa mới trong lúc chờ, tránh ghi đè bản đang nhập.

### Vận hành kho lịch sử

- Binding `GVCN_HISTORY`: database `gvcn-history`, migrations tại `cloudflare/migrations`.
- Chạy `npx wrangler d1 migrations apply gvcn-history --remote` trước khi triển khai.
- `GVCN_D1_ARCHIVE_ENABLED=true` bật tác vụ chuyển lịch sử: 4 lớp mỗi giờ,
  luân phiên toàn bộ 32 lớp trong 8 giờ. Không chờ D1 trong lượt lưu biểu mẫu.
- Từng lớp được đọc riêng, ghi bản sao đầy đủ và sự kiện vào D1 rồi mới gỡ các
  mục tương ứng khỏi nút lớp Firebase. So sánh lại từng mục trong transaction để
  giữ lịch sử của lượt lưu đồng thời. D1 lỗi thì giữ nguyên lịch sử Firebase.
- Dữ liệu biểu mẫu, phân công, revision, lịch nghỉ và hàng đợi xóa ảnh tiếp tục ở
  Firebase; tệp ảnh ở OneDrive. Kho lịch sử Firebase cũ vẫn được giữ và đọc cùng D1.
- QTV đọc/khôi phục bản sao D1 qua API hiện có; GVCN/khối trưởng không có quyền này.
- D1 hiện giữ các mục đã chuyển, không tự xóa lịch sử đã lưu. Theo dõi dung lượng
  D1 trước khi thiết lập chính sách lưu trữ dài hạn.
- Dừng chuyển bằng `GVCN_D1_ARCHIVE_ENABLED=false`, nhưng giữ binding D1 để tiếp
  tục xem/khôi phục những bản sao đã chuyển. Không tháo binding sau khi đã chuyển.
- Health báo `d1HistoryBound` và `d1HistoryArchiving`; đây là trạng thái cấu hình,
  không thay thế việc kiểm tra tác vụ Scheduled trong Workers Logs.
