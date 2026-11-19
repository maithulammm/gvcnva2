# Quản lý GVCN Việt Anh · 2026–2027

**Triển khai hiện tại: Cloudflare Workers** tại
`https://gvcnva2.lammt.workers.dev/index.html`. Xem [thiết lập Cloudflare](cloudflare/README.md)
để cấu hình build GitHub, Secret Firebase và Redirect URI Microsoft.
Các hướng dẫn Netlify bên dưới được giữ làm tài liệu triển khai cũ; mã frontend
hiện gọi trực tiếp API Cloudflare, không dùng Netlify làm trung gian.

Mở **`index.html`** bằng Live Server hoặc máy chủ HTTP/HTTPS. Giao diện dùng HTML, CSS và JavaScript thuần; không cần cài thư viện hoặc chạy bước build cho frontend.

Mẫu 2 dùng một giao diện nhập thống nhất: phần phối hợp, liên kết Mẫu 5 và mục tiêu
2–3 có thể mở khi cần. Mẫu nội dung chỉ điền gợi ý chủ đề, mục tiêu và hành động;
không tự điền nhận xét, mức tiến bộ, ngày gặp hoặc tạo cuộc gặp thực tế. GVCN có
thể lưu tối đa 20 mẫu riêng trên thiết bị, tách theo tài khoản Microsoft.
Nút **Lưu & ghi HS tiếp theo** chỉ mở lịch hẹn chưa ghi/học sinh chưa gặp tiếp
theo sau khi lưu cục bộ thành công; mỗi học sinh vẫn cần được ghi nhận thực tế.
Trang Công việc tháng đã được bỏ khỏi menu; lối gọi cũ `navTo('work')` đưa về Mẫu 2.
Trang Nhập / xuất dữ liệu nằm trong nhóm Quản trị viên và chỉ Admin nhìn thấy.

**Quản trị viên → Lịch không gặp:** chọn ngày nghỉ trong 12 tháng từ 09/2026 đến
08/2027 rồi bấm Lưu. Thiết lập dùng chung được lưu riêng tại `calendar` trong
năm học Firebase qua `PUT /api/calendar`; chỉ Admin được ghi, có revision để
tránh ghi đè khi hai Admin sửa đồng thời. Tất cả tài khoản nhận lịch trong
bootstrap; trước khi tự động xếp lịch, trình duyệt đọc bootstrap mới nhất và bỏ
qua ngày nghỉ. Không sửa/xóa lịch hẹn đã có, không tạo lượt gặp thực tế. Quy tắc
T2–T6 và sáng T7 lớp 12 vẫn áp dụng. Chế độ cục bộ chỉ giữ lịch trên thiết bị.
API mới cần được triển khai Cloudflare theo lệnh chủ dự án; nếu bản đang chạy
trả 404 khi lưu lịch, việc chỉ push GitHub chưa đủ để cập nhật API.

## Sửa chức năng ở đâu?

| File / thư mục | Nội dung |
| --- | --- |
| `index.html` | Trang chính: bố cục, thanh điều hướng, khung đăng nhập và hộp thoại |
| `assets/css/app.css` | Toàn bộ màu sắc, kích thước, bố cục và giao diện di động |
| `assets/css/responsive.css` | Bố cục điện thoại/tablet, thẻ bản ghi, nút cảm ứng và biểu mẫu thích ứng bàn phím |
| `assets/js/config.js` | Năm học, 32 lớp, tháng, nhãn trang, tài khoản cục bộ và địa chỉ API |
| `assets/js/state.js` | Trạng thái dùng chung: `auth`, `ui`, `appData`, `cloud` |
| `assets/js/helpers.js` | Hiển thị trạng thái, thông báo, định dạng và nút giao diện |
| `assets/js/loading.js` | Màn hình chờ, đếm thao tác đang chạy và thời gian chờ sau request |
| `assets/js/data.js` | Cấu trúc dữ liệu lớp/tháng, lưu trình duyệt và kiểm tra liên kết học sinh |
| `assets/js/permissions.js` | Phạm vi truy cập và quyền sửa phía giao diện |
| `assets/js/validation.js` | Thống kê và các kiểm tra K1–K9 |
| `assets/js/router.js` | Điều hướng trang, chọn khối/lớp/tháng |
| `assets/js/responsive.js` | Menu điện thoại theo quyền, nhãn cột cho thẻ bản ghi và kích thước vùng nhìn khi mở bàn phím |
| `assets/js/views/dashboard.js` | Bảng tổng quan GVCN, khối trưởng và BGH |
| `assets/js/views/students.js` | Danh sách học sinh theo lớp |
| `assets/js/views/reports.js` | Màn hình kiểm tra báo cáo, nhập/xuất và sao lưu |
| `assets/js/views/work.js` | Công việc tháng: ghi nhận theo học sinh và tiếp tục kế hoạch tháng trước |
| `assets/js/forms/m01.js` | Mẫu 01: lịch gặp học sinh |
| `assets/js/forms/schedule.js` | Lịch tháng và nút chọn buổi/mục tiêu hẹn gặp, kiểm tra trùng khung giờ |
| `assets/js/forms/m02.js` | Mẫu 02: sổ ghi cuộc gặp thực tế |
| `assets/js/forms/m03.js` | Mẫu 03: kết nối tích cực với phụ huynh |
| `assets/js/forms/m04.js` | Mẫu 04: kết quả và kế hoạch hỗ trợ |
| `assets/js/forms/m05.js` | Mẫu 05: hồ sơ theo dõi cá nhân |
| `assets/js/forms/schema.js` | Các trường nhập, loại trường, yêu cầu bắt buộc và tên hộp thoại |
| `assets/js/forms/meeting.js` | M02: thời gian/địa điểm, gợi ý chọn nhanh, nút tiến bộ và ba mục tiêu có thời hạn |
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

Trên điện thoại và máy tính bảng nhỏ, nút **Menu** hiển thị đầy đủ tên chức năng; nút **Công việc** mở nhanh trang nhập theo học sinh. GVCN một lớp chỉ cần nhìn lớp và chọn tháng, không phải thao tác với khối/vai trò cố định. Các bảng trở thành thẻ có nhãn từng thông tin dưới 900 px; màn hình lớn vẫn dùng bảng. Menu dùng cùng danh sách quyền với thanh bên và tự đóng khi chuyển trang hoặc đăng xuất.

Biểu mẫu trên điện thoại chiếm toàn màn hình, nội dung cuộn riêng còn các nút Lưu/Đóng nằm ở cuối khung. CSS theo vùng nhìn thực tế hỗ trợ khi bàn phím hoặc thanh trình duyệt thay đổi chiều cao. Ô nhập dùng chữ 16 px trên màn hình nhỏ, nút chính cao ít nhất 44 px và có chừa vùng an toàn cho thiết bị có tai thỏ/thanh thao tác. Không thay đổi mô hình dữ liệu hay cách tính báo cáo giữa các thiết bị.

GVCN vào trang **Công việc tháng**, chọn học sinh rồi ghi cuộc gặp, kết nối PHHS, lịch hẹn hoặc kế hoạch hỗ trợ. Mục tiêu và hành động có sẵn được đưa vào hộp thoại để giáo viên kiểm tra trước khi lưu. Ngày thực tế gợi ý hôm nay chỉ khi đang mở đúng tháng hiện tại. Phần phối hợp chỉ mở khi cần; chi tiết M05 chỉ mở khi chọn phiếu thuộc học sinh đó.

Trong M01 hoặc Công việc tháng, nút **Hẹn gặp** mở lịch đúng tháng báo cáo và các nút **Sáng 9:55–10:15**, **Chiều 15:00–15:20**, **Mục tiêu**, **Vở ghi**, **Học sinh chia sẻ** cùng ô ghi chú. Chỉ hẹn T2–T6; lớp 12 được thêm sáng T7. Mỗi ngày hẹn hai học sinh khác nhau, tối đa 3 lịch mỗi học sinh trong tháng; có thể sửa riêng từng lượt. Giao diện và API cùng kiểm tra ngày, buổi, giới hạn lượt và trùng khung giờ.

Nút **Tự động xếp lịch tháng** bổ sung vào khung giờ trống theo thứ tự ngày, sáng rồi chiều, lần lượt danh sách học sinh và quay lại từ đầu. Không thay lịch đã có hoặc tạo cuộc gặp thực tế. Dừng khi hết khung giờ hoặc mọi học sinh đủ 3 lượt; nếu không đủ 2 lượt cho mỗi học sinh, hộp xác nhận báo rõ số học sinh còn thiếu. Các lịch xuất hiện ngay trong phần **Lịch gặp dự kiến từ Mẫu 1** ở M02. Chỉ nút **Ghi nhận đã gặp** và lưu đầy đủ thông tin mới tạo bản ghi thực tế, liên kết bằng `appointmentId`; mỗi lịch chỉ liên kết một lượt thực tế.

Lịch mới nằm trong `schedule[studentId].appointments`, mỗi lượt có `id`, `date`, `session`, `topics`, `goal`, `planTime`, `note`. Các trường tổng hợp `planTime`, `goal`, `note` trên hồ sơ lịch học sinh vẫn được duy trì cho Excel và thống kê cũ. Lịch một lượt cũ được đọc tương thích, không tự xóa hoặc chuyển dữ liệu trên máy chủ. Lịch cuối tuần đã lưu trước thay đổi được giữ nguyên nếu không sửa; khi đổi lịch phải chọn theo quy tắc mới. Báo cáo và Excel M02 chỉ tính bản ghi thực tế; danh sách dự kiến không được trộn vào lượt đã gặp.

Một cuộc gặp được lưu duy nhất trong `meetings`: M01 lấy trạng thái từ bản ghi này và M05 hiển thị qua `profileId`, không tạo bản sao. Kết nối PHHS luôn phải ghi riêng sau khi thực hiện. Giữ nguyên cách đếm hoạt động thực tế và quy trình duyệt báo cáo.

Danh sách học sinh không hiển thị cột mã học sinh. M02/M03 không nhập mã minh chứng và M05 không hiển thị mã xác nhận; các kiểm tra báo cáo không còn bắt buộc/khuyến nghị mã này. Trang chốt báo cáo hiển thị 8 tiêu chí đang áp dụng, giữ khóa K8 trong API để tương thích dữ liệu cũ. Các mã đã có trong database được giữ nguyên, kể cả khi sửa một bản ghi qua biểu mẫu mới. File Excel xuất ra ẩn các cột mã học sinh/minh chứng tương ứng và gỡ kiểm tra thiếu/khớp mã minh chứng trên bản workbook được tạo, không sửa workbook gốc nhúng trong mã nguồn.

M02 chọn ngày bằng lịch và nhập giờ 24 giờ `HH:mm` (00:00–23:59), không dùng bộ chọn SA/CH phụ thuộc thiết lập máy. Ngày và giờ được ghép thành `actualDateTime`; địa điểm nằm trong `actualLocation`. Khi ghi nhận một lịch dự kiến sẽ điền sẵn giờ hẹn và `Phòng [mã lớp]`, đều sửa được. Trường quan tâm và tham gia có placeholder cùng gợi ý bấm chọn, vẫn cho phép gõ nội dung riêng. Ba nút tiến bộ hiển thị “Chưa ghi nhận / Có tiến bộ / Chưa tiến bộ”, ánh xạ về giá trị cũ “Chưa đủ căn cứ / Có / Không” để giữ cách tính báo cáo.

M02 có ba dòng mục tiêu với thời hạn riêng bằng số và đơn vị ngày/tuần, mặc định 1 tuần. Chỉ mục tiêu 1 bắt buộc; dòng trống không được đưa vào báo cáo. `goals` giữ cấu trúc từng mục tiêu; `goal` và `actual` vẫn tổng hợp thành văn bản để Excel, M05 và báo cáo cũ tiếp tục sử dụng. Khi mở sửa dữ liệu cũ mà không đổi các ô thời gian hoặc mục tiêu, văn bản cũ được giữ nguyên, không tự bổ sung thời hạn vào hồ sơ đã có.

Kế hoạch tháng trước có kết quả khác “Đạt” được gợi ý tiếp tục. Giáo viên phải xem lại và nhập thời hạn mới; kết quả ban đầu là “Chưa chốt”. `sourceMonth` và `sourcePlanId` ghi nguồn để không gợi ý lại kế hoạch đã chuyển. Không tự tạo kết quả hỗ trợ tháng trước hoặc hoạt động đã hoàn thành.

Nội dung đang nhập được giữ trong localStorage riêng theo tài khoản, lớp, tháng và biểu mẫu. Bản nháp chưa gửi lên Firebase, chưa tính vào báo cáo, có thể mở lại hoặc bỏ bằng nút **Bỏ bản nháp**; chỉ nút **Lưu thông tin** mới tạo/cập nhật bản ghi. Bản nháp này không đồng bộ sang máy khác. Khi dữ liệu hoặc phạm vi làm việc đã thay đổi, biểu mẫu yêu cầu mở lại để tránh ghi nhầm.

## Cách nạp mã

`index.html` nạp các file JavaScript bằng `defer` theo thứ tự: cấu hình → trạng thái → tiện ích/nghiệp vụ → giao diện/tích hợp → `main.js`.

Các file là script thông thường, dùng chung các khai báo trong `state.js`. Cách này giữ các nút `onclick` và luồng đăng nhập hiện có. Mỗi trạng thái/hàm chỉ được khai báo ở một nơi; không sao chép logic sang trang HTML khác. Nếu thêm file chức năng, khai báo thẻ `<script defer>` trước `main.js` và kiểm tra các phụ thuộc khởi tạo.

Khi chuyển ứng dụng sang máy khác hoặc máy chủ, chép `index.html` và thư mục `assets/`. Frontend không cần thư mục `node_modules`; backend Firebase có quy trình triển khai riêng.

## Giữ đăng nhập Microsoft và dữ liệu

`index.html` là trang HTML duy nhất, đồng thời tiếp nhận kết quả đăng nhập Microsoft. Khi mở `index.html` hoặc đường dẫn thư mục `/`, hàm `currentRedirectUri()` sử dụng `index.html` trong cùng thư mục.

MSAL giữ tài khoản/token trong `localStorage` để khôi phục phiên khi tải lại hoặc mở lại trình duyệt. Ứng dụng ghi nhớ tài khoản tối đa 30 ngày kể từ lần xác thực Microsoft mới, chỉ lưu mã tài khoản, email và thời hạn trong `VA_GVCN_REMEMBER_LOGIN_V1`; marker này không cấp quyền truy cập và không thay thế kiểm tra token/vai trò trên API. Mỗi lần mở vẫn lấy token bằng MSAL và tải lại phân công từ máy chủ. Token trống/hết hạn được yêu cầu làm mới; nếu cần tương tác, khi khôi phục có thể chuyển qua Microsoft một lần, có chặn lặp. Chính sách Entra, MFA hoặc đổi mật khẩu có thể yêu cầu xác thực lại trước 30 ngày.

Nút **Đăng xuất** xóa marker ghi nhớ và gọi MSAL `logoutRedirect` không chỉ định tài khoản để xóa toàn bộ account/token của ứng dụng; chỉ báo đăng xuất ngăn khôi phục cache cũ kể cả khi không kết nối được máy chủ Microsoft. Các tab khác cũng khóa giao diện khi nhận sự kiện đăng xuất. Không gọi `localStorage.clear()`: dữ liệu lớp, bản chờ đồng bộ, bản nháp và cấu hình Microsoft được giữ nguyên. Không tự chạy đăng nhập trong iframe dùng cho gia hạn token.

Đăng nhập, đăng xuất và request API có màn hình chờ dạng modal với nền làm mờ, khóa bấm lặp kể cả khi đang mở biểu mẫu. Request API được xếp hàng: `await` hoàn tất phản hồi và đọc JSON, sau đó chờ `REQUEST_SETTLE_MS = 2000` bằng `setTimeout` trước khi trả kết quả và chạy request kế tiếp. Khoảng chờ bổ sung không thay thế việc đợi request thật. Lỗi cũng kết thúc trạng thái chờ; đổi phiên trong lúc chờ sẽ bỏ phản hồi và các request xếp hàng của phiên cũ. Khi có nhiều thao tác cùng chờ, lớp phủ chỉ đóng khi tất cả hoàn tất.

Lưu tự động và tải cập nhật định kỳ dùng request `silent`, không hiện màn hình chờ hoặc làm mờ nền; hàng đợi, thời gian chờ và xử lý lỗi đồng bộ vẫn giữ nguyên. Các thao tác chủ động như đăng nhập hoặc tải dữ liệu thủ công vẫn có trạng thái chờ.

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
