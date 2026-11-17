"use strict";

// School catalog, storage keys and service endpoints.

const GRADES = {
  6: Array.from({ length: 6 }, (_, i) => `6A${i + 1}`),
  7: Array.from({ length: 6 }, (_, i) => `7B${i + 1}`),
  8: Array.from({ length: 6 }, (_, i) => `8C${i + 1}`),
  9: Array.from({ length: 5 }, (_, i) => `9D${i + 1}`),
  10: Array.from({ length: 4 }, (_, i) => `10A${i + 1}`),
  11: ["11B1", "11B2"],
  12: ["12C1", "12C2", "12C3"],
};

const CLASSES = Object.values(GRADES).flat();

const MONTHS = [
  ...Array.from(
    { length: 4 },
    (_, i) => `T${String(i + 9).padStart(2, "0")}/2026`,
  ),
  ...Array.from(
    { length: 5 },
    (_, i) => `T${String(i + 1).padStart(2, "0")}/2027`,
  ),
];

const YEARS = "2026-2027";

const DATA_KEY = "VA_GVCN_MSAL_PROTOTYPE_DATA_V1";

const MONTH_DEFAULT = "T11/2026";

const VIEW_LIST = [
  ["dashboard", "◈", "Tổng quan"],
  ["students", "♙", "Danh sách học sinh"],
  ["teachers", "♟", "Quản lý GVCN"],
  ["database", "☁", "Dữ liệu Firebase"],
  ["m01", "▦", "Mẫu 01 · Lịch gặp"],
  ["m02", "☷", "Mẫu 02 · Sổ gặp"],
  ["m03", "✉", "Mẫu 03 · Kết nối PHHS"],
  ["m04", "✦", "Mẫu 04 · Kế hoạch hỗ trợ"],
  ["m05", "♧", "Mẫu 05 · Theo dõi cá nhân"],
  ["check", "✓", "Kiểm tra & xác nhận"],
  ["export", "⇩", "Nhập / xuất dữ liệu"],
];
// Trình diễn: ánh xạ vai trò phía trình duyệt. THỰC TẾ phải chuyển sang DB + API máy chủ.
// Admin ban đầu theo yêu cầu của nhà trường. Khi bật Firebase, API quyết định phân quyền.

const USER_ALLOWLIST = Object.freeze({
  "lammt@vietanhschool.edu.vn": {
    role: "admin",
    display: "Quản trị viên",
  },
  // Ví dụ: 'bgh@vietanhschool.edu.vn': {role:'bgh'},
  // Ví dụ: 'admin@vietanhschool.edu.vn': {role:'admin'},
  // Ví dụ: 'khoitruong6@vietanhschool.edu.vn': {role:'lead',grade:'6'}
});

const MICROSOFT_CONFIG_KEY = "VA_GVCN_MICROSOFT_AUTH_CONFIG_V1";

const ROLE_NAMES = {
  gvcn: "Giáo viên chủ nhiệm",
  lead: "Khối trưởng",
  bgh: "Ban giám hiệu",
  admin: "Quản trị viên",
};

const HEADINGS = {
  teachers: [
    "Quản lý giáo viên chủ nhiệm",
    "Admin thêm, sửa, xóa GVCN và phân công lớp",
  ],
  database: [
    "Kết nối dữ liệu Firebase",
    "Trạng thái đồng bộ, cấu hình và chuyển dữ liệu cũ",
  ],
  dashboard: [
    "Tổng quan công tác chủ nhiệm",
    "Thống kê tiến độ theo tháng và toàn trường",
  ],
  students: [
    "Hồ sơ lớp học",
    "Nhập danh sách học sinh từ Excel và quản lý lớp",
  ],
  m01: [
    "Mẫu 01 · Lịch gặp gỡ học sinh",
    "Một học sinh một dòng theo từng tháng; tự đối chiếu cuộc gặp đã thực hiện",
  ],
  m02: [
    "Mẫu 02 · Sổ theo dõi gặp gỡ",
    "Mỗi lượt gặp thực tế là một bản ghi; tách số lượt và số học sinh",
  ],
  m03: [
    "Mẫu 03 · Kết nối tích cực với PHHS",
    "Chỉ ghi nội dung tích cực đã thực sự gửi tới gia đình",
  ],
  m04: [
    "Mẫu 04 · Kế hoạch hỗ trợ học sinh",
    "Kết quả tháng trước và kế hoạch hỗ trợ trong tháng hiện tại",
  ],
  m05: [
    "Mẫu 05 · Phiếu theo dõi cá nhân",
    "Hồ sơ chuyên sâu chỉ mở khi thực sự cần theo dõi nhiều mốc",
  ],
  check: [
    "Kiểm tra & xác nhận báo cáo",
    "Chốt dữ liệu, cảnh báo K1–K9 và quy trình 3 cấp",
  ],
  export: [
    "Nhập / xuất và sao lưu",
    "Xuất Excel đủ 15 sheet theo file mẫu nhà trường; sao lưu JSON",
  ],
};

const FIREBASE_DATABASE_URL =
  "https://gvcn-3bdf9-default-rtdb.asia-southeast1.firebasedatabase.app";

const FIREBASE_API_URL =
  "https://gvcnva2.netlify.app/api";

const CLOUD_CONFIG_KEY = "VA_GVCN_FIREBASE_CONNECTION_V1";

