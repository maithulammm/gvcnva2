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
  ["dashboard", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-grid-1x2\" viewBox=\"0 0 16 16\">\n  <path d=\"M6 1H1v14h5zm9 0h-5v5h5zm0 9v5h-5v-5zM0 1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1zm1 8a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1z\"/>\n</svg>", "Tổng quan"],
  ["students", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-people\" viewBox=\"0 0 16 16\">\n  <path d=\"M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4\"/>\n</svg>", "Danh sách học sinh"],
  ["teachers", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-person-badge\" viewBox=\"0 0 16 16\">\n  <path d=\"M6.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1zM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0\"/>\n  <path d=\"M4.5 0A2.5 2.5 0 0 0 2 2.5V14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2.5A2.5 2.5 0 0 0 11.5 0zM3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v10.795a4.2 4.2 0 0 0-.776-.492C11.392 12.387 10.063 12 8 12s-3.392.387-4.224.803a4.2 4.2 0 0 0-.776.492z\"/>\n</svg>", "Quản lý GVCN"],
  ["users", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-person-gear\" viewBox=\"0 0 16 16\">\n  <path d=\"M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m.256 7a4.5 4.5 0 0 1-.229-1.004H3c.001-.246.154-.986.832-1.664C4.484 10.68 5.711 10 8 10q.39 0 .74.025c.226-.341.496-.65.804-.918Q8.844 9.002 8 9c-5 0-6 3-6 4s1 1 1 1zm3.63-4.54c.18-.613 1.048-.613 1.229 0l.043.148a.64.64 0 0 0 .921.382l.136-.074c.561-.306 1.175.308.87.869l-.075.136a.64.64 0 0 0 .382.92l.149.045c.612.18.612 1.048 0 1.229l-.15.043a.64.64 0 0 0-.38.921l.074.136c.305.561-.309 1.175-.87.87l-.136-.075a.64.64 0 0 0-.92.382l-.045.149c-.18.612-1.048.612-1.229 0l-.043-.15a.64.64 0 0 0-.921-.38l-.136.074c-.561.305-1.175-.309-.87-.87l.075-.136a.64.64 0 0 0-.382-.92l-.148-.045c-.613-.18-.613-1.048 0-1.229l.148-.043a.64.64 0 0 0 .382-.921l-.074-.136c-.306-.561.308-1.175.869-.87l.136.075a.64.64 0 0 0 .92-.382zM14 12.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0\"/>\n</svg>", "Người dùng & vai trò"],
  ["database", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-database\" viewBox=\"0 0 16 16\">\n  <path d=\"M4.318 2.687C5.234 2.271 6.536 2 8 2s2.766.27 3.682.687C12.644 3.125 13 3.627 13 4c0 .374-.356.875-1.318 1.313C10.766 5.729 9.464 6 8 6s-2.766-.27-3.682-.687C3.356 4.875 3 4.373 3 4c0-.374.356-.875 1.318-1.313M13 5.698V7c0 .374-.356.875-1.318 1.313C10.766 8.729 9.464 9 8 9s-2.766-.27-3.682-.687C3.356 7.875 3 7.373 3 7V5.698c.271.202.58.378.904.525C4.978 6.711 6.427 7 8 7s3.022-.289 4.096-.777A5 5 0 0 0 13 5.698M14 4c0-1.007-.875-1.755-1.904-2.223C11.022 1.289 9.573 1 8 1s-3.022.289-4.096.777C2.875 2.245 2 2.993 2 4v9c0 1.007.875 1.755 1.904 2.223C4.978 15.71 6.427 16 8 16s3.022-.289 4.096-.777C13.125 14.755 14 14.007 14 13zm-1 4.698V10c0 .374-.356.875-1.318 1.313C10.766 11.729 9.464 12 8 12s-2.766-.27-3.682-.687C3.356 10.875 3 10.373 3 10V8.698c.271.202.58.378.904.525C4.978 9.71 6.427 10 8 10s3.022-.289 4.096-.777A5 5 0 0 0 13 8.698m0 3V13c0 .374-.356.875-1.318 1.313C10.766 14.729 9.464 15 8 15s-2.766-.27-3.682-.687C3.356 13.875 3 13.373 3 13v-1.302c.271.202.58.378.904.525C4.978 12.71 6.427 13 8 13s3.022-.289 4.096-.777c.324-.147.633-.323.904-.525\"/>\n</svg>", "Dữ liệu Firebase"],
  ["calendar", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-calendar-x\" viewBox=\"0 0 16 16\">\n  <path d=\"M6.146 7.146a.5.5 0 0 1 .708 0L8 8.293l1.146-1.147a.5.5 0 1 1 .708.708L8.707 9l1.147 1.146a.5.5 0 0 1-.708.708L8 9.707l-1.146 1.147a.5.5 0 0 1-.708-.708L7.293 9 6.146 7.854a.5.5 0 0 1 0-.708\"/>\n  <path d=\"M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z\"/>\n</svg>", "Lịch không gặp"],
  ["m01", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-calendar-week\" viewBox=\"0 0 16 16\">\n  <path d=\"M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-5 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z\"/>\n  <path d=\"M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z\"/>\n</svg>", "01 · Lịch hẹn"],
  ["m02", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-journal-text\" viewBox=\"0 0 16 16\">\n  <path d=\"M5 10.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5\"/>\n  <path d=\"M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2\"/>\n  <path d=\"M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z\"/>\n</svg>", "02 · Ghi nhận cuộc gặp"],
  ["m03", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-envelope\" viewBox=\"0 0 16 16\">\n  <path d=\"M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1zm13 2.383-4.708 2.825L15 11.105zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741M1 11.105l4.708-2.897L1 5.383z\"/>\n</svg>", "03 · Kết nối phụ huynh"],
  ["m04", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-clipboard-heart\" viewBox=\"0 0 16 16\">\n  <path fill-rule=\"evenodd\" d=\"M5 1.5A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5v1A1.5 1.5 0 0 1 9.5 4h-3A1.5 1.5 0 0 1 5 2.5zm5 0a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5z\"/>\n  <path d=\"M3 1.5h1v1H3a1 1 0 0 0-1 1V14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3.5a1 1 0 0 0-1-1h-1v-1h1a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3.5a2 2 0 0 1 2-2\"/>\n  <path d=\"M8 6.982C9.664 5.309 13.825 8.236 8 12 2.175 8.236 6.336 5.31 8 6.982\"/>\n</svg>", "04 · Kế hoạch hỗ trợ"],
  ["m05", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-person-lines-fill\" viewBox=\"0 0 16 16\">\n  <path d=\"M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zM11 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5m.5 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1zm2 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1zm0 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1z\"/>\n</svg>", "05 · Theo dõi cá nhân"],
  ["check", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-clipboard-check\" viewBox=\"0 0 16 16\">\n  <path fill-rule=\"evenodd\" d=\"M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0\"/>\n  <path d=\"M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z\"/>\n  <path d=\"M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z\"/>\n</svg>", "Kiểm tra & xác nhận"],
  ["export", "<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" class=\"bi bi-arrow-down-up\" viewBox=\"0 0 16 16\">\n  <path fill-rule=\"evenodd\" d=\"M11.5 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L11 2.707V14.5a.5.5 0 0 0 .5.5m-7-14a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L4 13.293V1.5a.5.5 0 0 1 .5-.5\"/>\n</svg>", "Nhập / xuất dữ liệu"],
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
const LOGIN_REMEMBER_KEY = "VA_GVCN_REMEMBER_LOGIN_V1";
const LOGIN_SIGNED_OUT_KEY = "VA_GVCN_SIGNED_OUT_V1";
const LOGIN_REAUTH_KEY = "VA_GVCN_REAUTH_V1";
const LOGIN_REMEMBER_DAYS = 30;
const REQUEST_SETTLE_MS = 0;

// Public deployment configuration shared by every browser and device.
const MICROSOFT_CONFIG = Object.freeze({
  tenantId: "22215a7f-b9e3-4b53-bd27-3a317311e6ca",
  clientId: "94c476b3-4723-4161-9dea-d64ff8bf505c",
});
const FIREBASE_ENABLED = true;

const ROLE_NAMES = {
  gvcn: "Giáo viên chủ nhiệm",
  lead: "Khối trưởng",
  bgh: "Ban giám hiệu",
  admin: "Quản trị viên",
};

VIEW_LIST.push(['maintenance','⚙','Bảo trì']);
const HEADINGS = {
  maintenance:['Bảo trì hệ thống',''],
  calendar: ["Lịch không gặp", ""],
  work: ["Công việc tháng", ""],
  teachers: [
    "Quản lý giáo viên chủ nhiệm",
    "",
  ],
  users: [
    "Người dùng & vai trò",
    "",
  ],
  database: [
    "Kết nối dữ liệu Firebase",
    "",
  ],
  dashboard: [
    "Tổng quan công tác chủ nhiệm",
    "",
  ],
  students: [
    "Hồ sơ lớp học",
    "",
  ],
  m01: [
    "Mẫu 01 · Lịch gặp gỡ học sinh",
    "",
  ],
  m02: [
    "Mẫu 02 · Sổ theo dõi gặp gỡ",
    "",
  ],
  m03: [
    "Mẫu 03 · Kết nối tích cực với PHHS",
    "",
  ],
  m04: [
    "Mẫu 04 · Kế hoạch hỗ trợ học sinh",
    "",
  ],
  m05: [
    "Mẫu 05 · Phiếu theo dõi cá nhân",
    "",
  ],
  check: [
    "Kiểm tra & xác nhận báo cáo",
    "",
  ],
  export: [
    "Nhập / xuất và sao lưu",
    "",
  ],
};

const FIREBASE_DATABASE_URL =
  "https://gvcn-3bdf9-default-rtdb.asia-southeast1.firebasedatabase.app";

const FIREBASE_API_URL =
  "https://gvcnva2.lammt.workers.dev/api";

const CLOUD_CONFIG_KEY = "VA_GVCN_FIREBASE_CONNECTION_V1";

