"use strict";

// Client-side scope and edit controls; server authorization remains authoritative.
/**
 * Chế độ xem thử chỉ hợp lệ nếu tài khoản thật có quyền Admin.
 */
function isRolePreview() {
  return !!ui.preview && assignmentRoles(auth.assignment).includes("admin");
}
/**
 * Ngoại lệ cho Admin mô phỏng GVCN của đúng lớp đang chọn; API vẫn nhận danh tính Admin thật.
 */
function isAdminClassEditing() {
  return !!auth.account&&assignmentRoles(auth.assignment).includes('admin')&&
    ui.preview?.role==='gvcn'&&ui.preview.classId===ui.classId;
}
/**
 * Dùng phân công mô phỏng để dựng giao diện; không thay đổi phân công thật của tài khoản.
 */
function viewAssignment() {
  return isRolePreview() ? ui.preview : auth.assignment;
}
/**
 * Chuẩn hóa dữ liệu nhiều vai trò, đồng thời hỗ trợ cấu trúc cũ chỉ có role.
 */
function assignmentRoles(assignment = viewAssignment()) {
  return assignment
    ? [...new Set(
        Array.isArray(assignment.roles) && assignment.roles.length
          ? assignment.roles
          : [assignment.role].filter(Boolean),
      )]
    : [];
}

function hasAppRole(role) {
  return assignmentRoles().includes(role);
}

function isAggregateBgh() {
  const roles = assignmentRoles();
  return (
    roles.includes("bgh") &&
    !roles.some((role) => ["admin", "gvcn", "lead"].includes(role))
  );
}

function assignedGrades(assignment = viewAssignment()) {
  const grades = assignment?.grades;
  return Array.isArray(grades) && grades.length
    ? grades.map(String)
    : assignment?.grade
      ? [String(assignment.grade)]
      : [];
}
/**
 * Hợp nhất phạm vi các vai trò để dựng bộ chọn lớp; phạm vi tổng hợp không đồng nghĩa quyền xem
 * nội dung cá nhân.
 */
function classesForAssignment(assignment = viewAssignment()) {
  if (!assignment) return [];
  const roles = assignmentRoles(assignment);
  if (roles.includes("admin") || roles.includes("bgh")) return [...CLASSES];
  const ids = new Set();
  if (roles.includes("gvcn") && assignment.classId)
    ids.add(assignment.classId);
  if (roles.includes("lead"))
    for (const id of CLASSES)
      if (assignedGrades(assignment).includes(gradeText(id))) ids.add(id);
  return [...ids];
}

function getScope() {
  return classesForAssignment();
}
/**
 * Cho sửa khi đúng quyền và trạng thái tháng còn mở; các chế độ xem thử khác chỉ đọc. API kiểm tra
 * quyền độc lập.
 */
function editable() {
  if (!auth.account || cloud.busy) return false;
  if(isAdminClassEditing())return true;
  if(isRolePreview())return false;
  return (
    hasAppRole("admin") ||
    (hasAppRole("gvcn") &&
      viewAssignment()?.classId === ui.classId &&
      ["draft", "returned"].includes(mdata().approval.state || "draft"))
  );
}
/**
 * Chỉ Admin đang dùng quyền thực tế mới quản lý danh sách và phân công.
 */
function canEditSetup() {
  return !!auth.account && hasAppRole("admin") && !cloud.busy && !isRolePreview();
}
/**
 * Nội dung cá nhân chỉ dành cho Admin hoặc GVCN của đúng lớp; khối trưởng/BGH chỉ xem số liệu tổng
 * hợp.
 */
function canViewPersonal() {
  return hasAppRole("admin") || hasAppRole("gvcn")&&viewAssignment()?.classId===ui.classId;
}
/**
 * Áp bộ lọc khối lên phạm vi được phân công, không mở rộng quyền khi chọn Toàn trường.
 */
function scopedClasses() {
  if (!hasAppRole("admin") && !hasAppRole("bgh") && !hasAppRole("lead"))
    return viewAssignment()?.classId ? [viewAssignment().classId] : [];
  if (ui.grade === "all") return getScope();
  return getScope().filter((id) => gradeText(id) === String(ui.grade));
}
