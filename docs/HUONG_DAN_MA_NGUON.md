# Hướng dẫn đọc và chỉnh sửa mã nguồn

Tài liệu mô tả cấu trúc hiện có. Chú thích `/** ... */` ngay trên hàm giải thích mục đích và các ràng buộc cần giữ; chú thích `//` trong thân hàm giải thích những bước dễ gây mất dữ liệu hoặc nhầm quyền.

## Bắt đầu từ đâu?

1. `index.html`: các vùng giao diện, popup và thứ tự tải script bằng `defer`.
2. `assets/js/config.js`: cấu hình công khai, lớp, tháng, menu. Không đặt service account hay client secret vào đây.
3. `assets/js/state.js`: trạng thái `auth`, `cloud`, `ui` trong RAM.
4. `assets/js/main.js`: gắn sự kiện DOM và gọi `initializeMsLogin()`.
5. `assets/js/auth.js`: đăng nhập/khôi phục phiên, tải phân công rồi mới mở giao diện.
6. `assets/js/router.js`: dựng menu, bộ chọn và nội dung trang theo quyền.

Các script giao diện hiện dùng hàm/biến chung, chưa phải ES module. Khi chuyển file hoặc thêm script, phải giữ thứ tự phụ thuộc trong `index.html`.

## Chọn đúng nơi để sửa

| Nhu cầu | File chính |
| --- | --- |
| Đăng nhập, đăng xuất, thời hạn ghi nhớ | `assets/js/auth.js` |
| Quyền hiển thị và sửa ở giao diện | `assets/js/permissions.js` |
| Tên, ảnh tài khoản và menu đăng xuất | `assets/js/account-menu.js` |
| Đồng bộ API, lỗi mạng và bản chờ | `assets/js/firebase.js` |
| Dữ liệu lớp/tháng và lưu cục bộ | `assets/js/data.js` |
| Tổng quan, lịch hôm nay | `assets/js/views/dashboard.js`, `assets/js/views/work.js` |
| Trường biểu mẫu và popup chung | `assets/js/forms/schema.js`, `assets/js/forms/editor.js` |
| Mẫu 1: hiển thị, chọn ngày/giờ, xếp lịch | `assets/js/forms/m01.js`, `assets/js/forms/schedule.js` |
| Tích chọn và xóa nhiều lịch | `assets/js/forms/schedule-bulk.js` |
| Mẫu 2: danh sách và điều khiển nhập | `assets/js/forms/m02.js`, `assets/js/forms/meeting.js` |
| Lần gặp trước, bản nháp | `assets/js/forms/history.js`, `assets/js/forms/drafts.js` |
| Mẫu 3, 4, 5 | `assets/js/forms/m03.js`, `m04.js`, `m05.js` |
| Ảnh minh chứng: chọn ảnh, thumbnail, xem lớn và API | `assets/js/forms/evidence.js`, `evidence-api.js`, `firebase/functions/evidence-store.mjs` |
| Hướng dẫn từng mẫu | `assets/js/form-help.js` |
| Lịch nghỉ cả ngày/sáng/chiều | `assets/js/views/calendar.js` |
| Kiểm tra chỉ tiêu, gửi BGH | `assets/js/validation.js`, `assets/js/approval.js` |
| Nhập/xuất Excel | `assets/js/excel/import.js`, `export.js`, `schedule-export.js` |
| Đọc/ghi ZIP/XML của XLSX | `assets/js/excel/codec.js` |
| Popup xác nhận và kiểm tra ngữ cảnh | `assets/js/dialogs.js` |
| Tìm kiếm bảng và danh sách trên điện thoại | `assets/js/table-filters.js`, `assets/js/responsive.js` |
| API, xác thực và nghiệp vụ máy chủ | `firebase/functions/api.mjs`, `identity.mjs`, `service.mjs`, `model.mjs` |
| Kết nối Cloudflare với Firebase REST | `cloudflare/worker.mjs`, `cloudflare/firebase-rest.mjs` |

CSS được nạp theo nhiều lớp. Quy tắc phía sau có thể ghi đè quy tắc phía trước; xem thứ tự trong `index.html` trước khi sửa bố cục. `simple-flow.css` tinh chỉnh luồng GVCN, `popup-layout.css` quản lý phần cuộn của popup.

## Các khái niệm dễ nhầm

| Tên | Ý nghĩa |
| --- | --- |
| `auth.assignment` | Phân công thật của tài khoản; API quyết định khi bật Firebase. |
| `ui.preview` | Cách xem mô phỏng của Admin, không đổi danh tính gửi API. |
| `cloud.epoch` | Số phiên trong RAM; tăng khi reset để loại kết quả request của phiên cũ. |
| `revision` | Phiên bản do máy chủ quản lý; không tự tăng để vượt lỗi xung đột. |
| `baseline` / fingerprint | Nội dung mốc để phát hiện bản ghi đã đổi, khác với revision máy chủ. |
| `cloud.pending` | Các lớp đã thay đổi và đang chờ máy chủ xác nhận. |
| `appointments` | Lịch dự kiến của Mẫu 1, có thể nhiều lần mỗi học sinh. |
| `meetings` | Các cuộc gặp thực tế đã lưu ở Mẫu 2. |
| `appointmentId` | Liên kết một cuộc gặp với đúng lịch dự kiến. |
| `seed` | Giá trị điền sẵn khi mở popup; chưa phải bản ghi đã lưu. |

`save()` thành công nghĩa là đã giữ dữ liệu tại trình duyệt và lên lịch đồng bộ nếu cần. Chỉ khi API xác nhận thì revision và mốc máy chủ mới cập nhật. Một bản nháp popup chưa được tính vào báo cáo.

## Những ràng buộc cần giữ khi phát triển

- Kiểm tra quyền ở giao diện giúp người dùng thao tác đúng; API vẫn phải kiểm tra độc lập. Khối trưởng chỉ xem tổng hợp, không xem nội dung cá nhân của lớp khác.
- Sau `await`, phiên/lớp/tháng có thể đã đổi. Giữ các kiểm tra ngữ cảnh trước khi áp kết quả hoặc ghi/xóa dữ liệu.
- Chờ `fetch`/Promise mới bảo đảm request hoàn tất. `waitAfterRequest()` chỉ thêm khoảng nghỉ giao diện, không thay cho `await`.
- Không biến lịch dự kiến thành lượt gặp thực tế tự động. GVCN phải ghi nhận và lưu.
- Lịch tự động chỉ dùng ca sáng/chiều. Giờ khác được kiểm tra giao nhau theo khoảng thời gian; vẫn phải né ngày/buổi nghỉ và ngày không được phép.
- Ngày hiển thị dùng `displayDateText()`; không đổi chuỗi ISO dùng cho lưu trữ, input ngày hoặc so sánh.
- Giữ ID học sinh khi nhập lại danh sách; không ghép mơ hồ các học sinh cùng tên.
- Không sửa workbook gốc trong `assets/js/excel/template.js`. Xuất Excel xử lý bản sao.
- Các hàm mẫu nội dung trong `quick-meeting.js` vẫn được giữ để tương thích; phần mẫu nội dung không còn được dựng trong popup. File này còn chứa luồng chuyển sang học sinh tiếp theo.
- Secret Firebase chỉ nằm phía máy chủ. Không ghi token, khóa riêng hay mật khẩu vào log, comment hoặc Git.

## Kiểm tra sau khi sửa

- Kiểm tra báo cáo dùng chung cách phân loại ở `validation.js` và `model.mjs`: M03 trống không tự phát sinh cảnh báo; M04–M05 chỉ kiểm tra thông tin các bản ghi/liên kết hiện có. `CHƯA GHI NHẬN` và `THEO TRƯỜNG HỢP` là trạng thái trung tính, không khẳng định GVCN đã hoàn thành rà soát. Không ép tạo lượt kết nối hoặc hồ sơ để đủ số lượng. M01 vẫn nhắc rà soát độ bao phủ danh sách lớp; trạng thái gửi/xem xét báo cáo là quy trình riêng.
- Sheet `KiemTra` của bản Excel xuất dùng kết quả kiểm tra tại thời điểm xuất, đồng nhất với web; công thức kiểm tra dòng M03 không bắt buộc thông điệp, phản hồi hay ảnh. Workbook gốc không thay đổi.
- `automaticScheduleSteps()` dùng chỉ mục lịch bận theo ngày, không sắp xếp toàn bộ lớp cho mỗi ô giờ. Bản bất đồng bộ nhường khung hình sau mỗi bốn ngày để màn chờ vẫn hoạt động; bản đồng bộ dùng cùng generator cho kiểm thử. Chỉ sao chép và thay tháng đang xếp, giữ nguyên lịch cũ và các tháng khác.

### Đồng bộ theo lớp và tháng (Workers)

- Adapter REST hỗ trợ đường dẫn con dưới `ROOT`. Lưu biểu mẫu thường xuyên dùng transaction tại `classes/{classId}`, giữ revision và các liên kết M02–M05 nhất quán. Trình duyệt gửi `partialMonths: true` và chỉ các tháng thay đổi; máy chủ ghép với tháng hiện có. Không dùng PATCH không có điều kiện hoặc ghi đè từ một bản lớp đã cũ.
- Giao dịch vẫn đọc/ghi **một lớp**, gồm các tháng của lớp đó, để kiểm tra liên kết xuyên tháng. Chưa phải transaction độc lập tại từng nút tháng. Các thao tác quản trị danh sách, đổi quyền, duyệt/khôi phục và sao lưu định kỳ vẫn có thể cần giao dịch toàn trường.
- Bootstrap chia nhóm tối đa 8 lớp, chỉ đọc `data` và `revision`, không tải kho ảnh, token, audit hay snapshot riêng. `/changes` chỉ đọc phân công, lịch, revision và danh mục quản trị cần thiết; khi phiên bản không đổi, trình duyệt bỏ qua tải lại báo cáo. Chỉ áp dụng cả bootstrap sau khi mọi nhóm hoàn tất.
- Ảnh được đọc riêng theo mã; ảnh cũ đọc theo lớp/tháng. Làm mới token OneDrive chỉ giao dịch trên `storageAuth`.
- Snapshot mới `format: 2` giữ metadata lớp và `monthRefs`; nội dung tháng lưu một lần theo SHA-256 trong `recoveryBlobs`. Lịch sử giao dịch lớp được giữ nguyên tử với bản lớp, sau đó tác vụ sao lưu hằng ngày gom về kho lịch sử riêng. `recovery()` và `restore()` giải tham chiếu, vẫn đọc được snapshot định dạng cũ. Không rollback về backend cũ không hiểu `monthRefs` để khôi phục dữ liệu.
- M03 cho thêm tối đa **2 ảnh** mỗi lần kết nối ở cả giao diện và máy chủ. Bản cũ có hơn 2 ảnh được giữ nguyên nếu không sửa ảnh. Gỡ ảnh rồi lưu hoặc xóa lần kết nối sẽ xóa vĩnh viễn ảnh không còn được dùng; `evidence-cleanup.mjs` tạo hàng đợi, kiểm tra tham chiếu và chặn khôi phục liên kết tới ảnh đã xóa. Xem chi tiết trong `KHO_ANH_TAP_TRUNG.md`. Ảnh không bắt buộc.

```powershell
npm.cmd test
npm.cmd run build
git diff --check
```

Với thay đổi giao diện, thử thêm trên desktop và điện thoại. Với thay đổi dữ liệu, kiểm tra lưu lỗi, đổi lớp/tháng khi popup đang mở, phân quyền và các liên kết M01–M02–M05. Build chỉ tạo thư mục `dist`, không tự triển khai Cloudflare. Việc triển khai Cloudflare cần theo yêu cầu riêng của chủ dự án.
