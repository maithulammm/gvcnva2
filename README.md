# Quản lý GVCN Việt Anh · 2026–2027

Mở **`index.html`** bằng Live Server hoặc máy chủ HTTP/HTTPS. Giao diện dùng HTML, CSS và JavaScript thuần; không cần cài thư viện hoặc chạy bước build cho frontend.

## Sửa chức năng ở đâu?

| File / thư mục | Nội dung |
| --- | --- |
| `index.html` | Trang chính: bố cục, thanh điều hướng, khung đăng nhập và hộp thoại |
| `assets/css/app.css` | Toàn bộ màu sắc, kích thước, bố cục và giao diện di động |
| `assets/js/config.js` | Năm học, 32 lớp, tháng, nhãn trang, tài khoản cục bộ và địa chỉ API |
| `assets/js/state.js` | Trạng thái dùng chung: `auth`, `ui`, `appData`, `cloud` |
| `assets/js/helpers.js` | Hiển thị trạng thái, thông báo, định dạng và nút giao diện |
| `assets/js/data.js` | Cấu trúc dữ liệu lớp/tháng, lưu trình duyệt và kiểm tra liên kết học sinh |
| `assets/js/permissions.js` | Phạm vi truy cập và quyền sửa phía giao diện |
| `assets/js/validation.js` | Thống kê và các kiểm tra K1–K9 |
| `assets/js/router.js` | Điều hướng trang, chọn khối/lớp/tháng |
| `assets/js/views/dashboard.js` | Bảng tổng quan GVCN, khối trưởng và BGH |
| `assets/js/views/students.js` | Danh sách học sinh theo lớp |
| `assets/js/views/reports.js` | Màn hình kiểm tra báo cáo, nhập/xuất và sao lưu |
| `assets/js/views/work.js` | Công việc tháng: ghi nhận theo học sinh và tiếp tục kế hoạch tháng trước |
| `assets/js/forms/m01.js` | Mẫu 01: lịch gặp học sinh |
| `assets/js/forms/m02.js` | Mẫu 02: sổ ghi cuộc gặp thực tế |
| `assets/js/forms/m03.js` | Mẫu 03: kết nối tích cực với phụ huynh |
| `assets/js/forms/m04.js` | Mẫu 04: kết quả và kế hoạch hỗ trợ |
| `assets/js/forms/m05.js` | Mẫu 05: hồ sơ theo dõi cá nhân |
| `assets/js/forms/schema.js` | Các trường nhập, loại trường, yêu cầu bắt buộc và tên hộp thoại |
| `assets/js/forms/editor.js` | Mở hộp thoại, lưu/sửa/xóa bản ghi biểu mẫu và học sinh |
| `assets/js/forms/drafts.js` | Bản nháp biểu mẫu theo tài khoản/lớp/tháng, trường nhập có điều kiện |
| `assets/js/approval.js` | Gửi, rà soát, duyệt và trả bổ sung báo cáo |
| `assets/js/admin.js` | Quản lý GVCN, phân công lớp và trang cấu hình dữ liệu |
| `assets/js/firebase.js` | Gọi API, đồng bộ, phát hiện xung đột và giữ bản chờ đồng bộ |
| `assets/js/auth.js` | Đăng nhập/đăng xuất Microsoft Entra ID và xử lý Redirect URI |
| `assets/js/backup.js` | Sao lưu JSON, khôi phục và chuyển dữ liệu cục bộ lên Firebase |
| `assets/js/excel/codec.js` | Đọc/ghi ZIP, XML và các thành phần workbook |
| `assets/js/excel/import.js` | Nhập danh sách học sinh từ Excel |
| `assets/js/excel/export.js` | Xuất Excel lớp và báo cáo tổng hợp |
| `assets/js/excel/template.js` | Nội dung nguyên gốc của workbook mẫu 15 sheet |
| `assets/js/demo.js` | Dữ liệu minh họa cục bộ, chỉ nạp khi Admin chọn |
| `assets/js/main.js` | Gắn sự kiện và khởi động ứng dụng |
| `firebase/functions/` | API máy chủ, phân quyền, xác minh Microsoft và kiểm thử |
| `firebase/database.rules.json` | Quy tắc truy cập database |

Ví dụ: muốn đổi cột hiển thị của M02, sửa `forms/m02.js`. Muốn đổi trường trong hộp thoại M02, sửa mục `m02` trong `forms/schema.js`. Nếu đổi dữ liệu bắt buộc, cập nhật cả `validation.js` và phần tương ứng trong `firebase/functions/model.mjs` để giao diện và máy chủ kiểm tra thống nhất.

## Công việc tháng cho GVCN

GVCN vào trang **Công việc tháng**, chọn học sinh rồi ghi cuộc gặp, kết nối PHHS, lịch hẹn hoặc kế hoạch hỗ trợ. Mục tiêu và hành động có sẵn được đưa vào hộp thoại để giáo viên kiểm tra trước khi lưu. Ngày thực tế gợi ý hôm nay chỉ khi đang mở đúng tháng hiện tại. Phần phối hợp chỉ mở khi cần; chi tiết M05 chỉ mở khi chọn phiếu thuộc học sinh đó.

Một cuộc gặp được lưu duy nhất trong `meetings`: M01 lấy trạng thái từ bản ghi này và M05 hiển thị qua `profileId`, không tạo bản sao. Kết nối PHHS luôn phải ghi riêng sau khi thực hiện. Không thay đổi công thức thống kê, điều kiện kiểm tra hoặc quy trình duyệt báo cáo.

Kế hoạch tháng trước có kết quả khác “Đạt” được gợi ý tiếp tục. Giáo viên phải xem lại và nhập thời hạn mới; kết quả ban đầu là “Chưa chốt”. `sourceMonth` và `sourcePlanId` ghi nguồn để không gợi ý lại kế hoạch đã chuyển. Không tự tạo kết quả hỗ trợ tháng trước hoặc hoạt động đã hoàn thành.

Nội dung đang nhập được giữ trong localStorage riêng theo tài khoản, lớp, tháng và biểu mẫu. Bản nháp chưa gửi lên Firebase, chưa tính vào báo cáo, có thể mở lại hoặc bỏ bằng nút **Bỏ bản nháp**; chỉ nút **Lưu thông tin** mới tạo/cập nhật bản ghi. Bản nháp này không đồng bộ sang máy khác. Khi dữ liệu hoặc phạm vi làm việc đã thay đổi, biểu mẫu yêu cầu mở lại để tránh ghi nhầm.

## Cách nạp mã

`index.html` nạp các file JavaScript bằng `defer` theo thứ tự: cấu hình → trạng thái → tiện ích/nghiệp vụ → giao diện/tích hợp → `main.js`.

Các file là script thông thường, dùng chung các khai báo trong `state.js`. Cách này giữ các nút `onclick` và luồng đăng nhập hiện có. Mỗi trạng thái/hàm chỉ được khai báo ở một nơi; không sao chép logic sang trang HTML khác. Nếu thêm file chức năng, khai báo thẻ `<script defer>` trước `main.js` và kiểm tra các phụ thuộc khởi tạo.

Khi chuyển ứng dụng sang máy khác hoặc máy chủ, chép `index.html` và thư mục `assets/`. Frontend không cần thư mục `node_modules`; backend Firebase có quy trình triển khai riêng.

## Giữ đăng nhập Microsoft và dữ liệu

`index.html` là trang HTML duy nhất, đồng thời tiếp nhận kết quả đăng nhập Microsoft. Khi mở `index.html` hoặc đường dẫn thư mục `/`, hàm `currentRedirectUri()` sử dụng `index.html` trong cùng thư mục.

Đăng ký Redirect URI mới trong Entra → Authentication → Single-page application (SPA), theo đúng địa chỉ đang sử dụng, ví dụ:

```text
http://127.0.0.1:5500/index.html
http://localhost:5500/index.html
```

Tenant ID và Client ID được giữ cố định trong `MICROSOFT_CONFIG` tại `assets/js/config.js`; `FIREBASE_ENABLED = true` bật dữ liệu dùng chung cho mọi máy. Màn hình chỉ có nút đăng nhập Microsoft, không cần nhập cấu hình trên trình duyệt mới. Redirect URI là origin hiện tại cộng đường dẫn thư mục và `index.html`, phải được đăng ký trong Microsoft Entra. Khi chỉnh bố cục, sửa trực tiếp **`index.html`**.

Tiếp tục dùng cùng tên máy và cổng Live Server đã dùng trước đây để truy cập đúng dữ liệu/cấu hình trình duyệt. Các khóa lưu `VA_GVCN_MSAL_PROTOTYPE_DATA_V1`, `VA_GVCN_MICROSOFT_AUTH_CONFIG_V1`, khóa Firebase và cấu trúc dữ liệu `schema: 2` được giữ nguyên. Việc tách file không chạy chuyển đổi hoặc ghi dữ liệu trên database thật.

## Kiểm tra sau khi sửa

Nếu chưa có thư viện backend, cài theo lockfile:

```powershell
npm.cmd ci
npm.cmd --prefix firebase/functions ci --ignore-scripts
```

Chạy tại thư mục gốc dự án:

```powershell
npm.cmd run check
npm.cmd test
```

`check` kiểm tra cú pháp, các đường dẫn tài nguyên, thứ tự khởi động và mã SHA-256 của workbook mẫu. Bộ kiểm thử chạy mã frontend theo đúng thứ tự các file trong `index.html`, cùng các kiểm tra quyền/API và token Microsoft.

Xem [hướng dẫn Firebase](firebase/README.md) để triển khai database/API và xử lý cấu hình Microsoft Entra.

Với website `https://gvcnva2.netlify.app`, API chạy bằng Netlify Functions tại `/api/*`, dùng Firebase Realtime Database và không cần nâng cấp Firebase lên Blaze. Dùng `npm run api:check` để kiểm tra cấu hình local và `npm run api:status` để kiểm tra API production. Cấu hình biến môi trường và khóa service account trong Netlify theo [hướng dẫn Firebase](firebase/README.md); không lưu khóa trong Git.

## Tự động build và triển khai lên Netlify

Đã có `netlify.toml` và lệnh `npm run build`. Lệnh này kiểm tra frontend rồi tạo `dist/` gồm `index.html` và thư mục `assets/`. Netlify chỉ công bố nội dung `dist/`. Thư mục build được tạo lại mỗi lần; sửa mã trong `index.html` và `assets/`, không sửa trực tiếp `dist/`.

Thiết lập một lần:

1. Dùng repository GitHub **`maithulammm/gvcnva2`** làm nguồn duy nhất cho project Netlify. Repository cần có `netlify.toml`, `package.json`, `scripts/`, `assets/` và `index.html`.
2. Trong Netlify, liên kết project với repository `maithulammm/gvcnva2` tại **Project configuration → Developer settings → Continuous deployment**.
3. Chọn nhánh `main` làm production branch. Base directory là thư mục gốc; build command là `npm run build`; publish directory là `dist`. File `netlify.toml` khai báo cả thư mục Netlify Functions và Node 22.
4. Deploy lần đầu và lấy tên miền cố định của website. Netlify sẽ tự build/deploy khi có lần push mới lên production branch.

Sau mỗi lần sửa, commit và push bằng VS Code hoặc terminal trong repository đã kết nối:

```powershell
git add .
git commit -m "Cap nhat he thong GVCN"
git push
```

Lưu file trên máy chưa kích hoạt Netlify. Netlify nhận thay đổi sau khi push lên nhánh đã cấu hình; có thể xem kết quả và lỗi trong trang Deploys của project.

Thử build tại máy trước khi push:

```powershell
npm.cmd run build
```

### Đăng nhập Microsoft trên gvcnva2.netlify.app

Trong Entra → App registrations → Authentication → Single-page application (SPA), đăng ký URI:

```text
https://gvcnva2.netlify.app/index.html
```

Giữ các URI localhost đang dùng. Cấu hình `pretty_urls = false` trong Netlify giữ nguyên đuôi `.html` cho callback. Trên `gvcnva2.netlify.app`, mọi máy dùng cùng cấu hình Microsoft/Firebase từ mã nguồn; cấu hình đăng nhập cũ trong localStorage được giữ lại nhưng không ghi đè cấu hình triển khai. Dữ liệu cục bộ trên localhost vẫn ở localhost; xuất JSON nếu cần chuyển dữ liệu.

API cho production được phục vụ cùng domain `https://gvcnva2.netlify.app`; Netlify tự triển khai function khi push lên `main`. Firebase Realtime Database vẫn ở project `gvcn-3bdf9`; không mở rules cho truy cập trực tiếp từ trình duyệt. Xem [hướng dẫn Firebase](firebase/README.md) để cấu hình biến môi trường bí mật trong Netlify.

Tài liệu Netlify: [continuous deployment và build settings](https://docs.netlify.com/build/configure-builds/overview/), [netlify.toml](https://docs.netlify.com/build/configure-builds/file-based-configuration/).
