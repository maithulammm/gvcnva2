"use strict";

// Admin teacher assignments and database settings.

function renderTeachers() {
  if (auth.assignment?.role !== "admin") return "";
  const teachers = Object.values(appData.teachers || {}).sort((a, b) =>
    a.classId.localeCompare(b.classId, undefined, { numeric: true }),
  );
  return `<div class="section-head"><h2>Danh sách GVCN · ${teachers.length} giáo viên</h2><div class="actions">${btn("＋ Thêm GVCN", "openModal('teacherAccount')", "primary")}${cloud.ready ? btn("Tải dữ liệu mới", "refreshCloud()") : ""}</div></div>
    <p class="help">Mỗi GVCN được phân công một lớp và dùng email Microsoft công vụ. Khi kết nối Firebase, phân công này quyết định quyền truy cập của giáo viên. Xóa GVCN thu hồi phân công và giữ hồ sơ lớp/học sinh.</p>
    <section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email Microsoft</th><th>Lớp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${teachers.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.classId)}</td><td>${statusTag(t.active !== false ? "Đang hoạt động" : "Ngừng hoạt động")}</td><td class="actions-cell">${btn("Sửa", `openModal('teacherAccount','${t.id}')`, "small")}${btn("Học sinh", `openClassStudents('${t.classId}')`, "small")}${btn("Xóa", `deleteTeacherAccount('${t.id}')`, "small danger")}</td></tr>`).join("") || '<tr><td colspan="5"><div class="empty">Chưa có GVCN trong danh sách quản lý. Bấm Thêm GVCN để bắt đầu.</div></td></tr>'}</tbody></table></div></section>`;
}

function renderDatabase() {
  if (auth.assignment?.role !== "admin") return "";
  return `<div class="section-head"><h2>${cloud.ready ? "Firebase đã kết nối" : "Đang dùng dữ liệu cục bộ"}</h2></div>
    <div class="cols2"><section class="card"><h2>Kết nối dữ liệu dùng chung</h2><p class="help">32 lớp · năm học ${YEARS}. Tài khoản Admin đầu tiên: lammt@vietanhschool.edu.vn.</p>
    <p class="help" style="overflow-wrap:anywhere">Database: ${esc(FIREBASE_DATABASE_URL)}</p>
    <p class="help">${cloud.ready ? esc(cloud.error || "Dữ liệu tự đồng bộ khi lưu; kiểm tra cập nhật mỗi 45 giây khi không có bản đang sửa.") : "Cần triển khai API Firebase trước khi bật kết nối. Mã nguồn và hướng dẫn nằm trong thư mục firebase của dự án."}</p>
    <div class="actions">${cloud.ready ? btn("Tải dữ liệu mới", "refreshCloud()") + btn("Thử đồng bộ lại", "retryCloud()") + btn("Xuất bản lưu chờ đồng bộ", "exportPendingDrafts()") : btn("Bật kết nối Firebase", "enableFirebase()", "primary")}${btn("Xuất JSON sao lưu", "jsonBackup()")}</div></section>
    <section class="card"><h2>Chuyển dữ liệu cũ lên Firebase</h2><p class="help">Bản dữ liệu cục bộ ban đầu được giữ nguyên. Chỉ chuyển vào lớp trống; lớp đã có hồ sơ trên Firebase được bỏ qua. Thông tin và lịch sử cũ được giữ trong bản nhập.</p>
    <div class="actions">${btn("Xuất dữ liệu cục bộ ban đầu", "exportLegacyData()")}${cloud.ready ? btn("Chuyển dữ liệu cũ lên Firebase", "migrateLegacyData()", "primary") : ""}</div></section></div>`;
}

function openClassStudents(id) {
  ui.classId = id;
  ui.grade = gradeText(id);
  ui.profileId = "";
  navTo("students");
}

function openClassTeacher() {
  if (!canEditSetup()) return;
  const existing = Object.values(appData.teachers || {}).find(
    (t) => t.classId === ui.classId && t.active !== false,
  );
  openModal("teacherAccount", existing?.id || "");
}

async function saveTeacherAccount(record) {
  if (!canEditSetup()) throw Error("Chỉ Admin được quản lý GVCN.");
  record.email = record.email.toLowerCase().trim();
  if (!/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(record.email))
    throw Error("GVCN phải sử dụng email công vụ @vietanhschool.edu.vn.");
  if (!CLASSES.includes(record.classId)) throw Error("Lớp không hợp lệ.");
  if (record.email === "lammt@vietanhschool.edu.vn")
    throw Error(
      "Email này đang giữ quyền Admin. Hãy dùng email GVCN được phân công.",
    );
  if (cloud.ready) {
    await flushCloud();
    cloud.busy = true;
    try {
      useBootstrap(await databaseRequest("/teachers", "POST", record));
    } finally {
      cloud.busy = false;
    }
    return;
  }
  const teachers = (appData.teachers ||= {}),
    id = record.id || newID(),
    old = teachers[id];
  if (
    Object.values(teachers).some(
      (t) =>
        t.id !== id &&
        (t.email === record.email ||
          (t.active !== false &&
            record.active &&
            t.classId === record.classId)),
    )
  )
    throw Error("Email đã tồn tại hoặc lớp đã có GVCN đang hoạt động.");
  if (old && appData.classes[old.classId].email === old.email) {
    appData.classes[old.classId].teacher = "";
    appData.classes[old.classId].email = "";
  }
  teachers[id] = { ...record, id };
  if (record.active) {
    appData.classes[record.classId].teacher = record.name;
    appData.classes[record.classId].email = record.email;
  }
  if (!save())
    throw Error("Không lưu được dữ liệu. Hãy xuất JSON sao lưu.");
}

async function deleteTeacherAccount(id) {
  if (!canEditSetup()) return;
  const t = appData.teachers?.[id];
  if (!t) return;
  if (
    !confirm(
      `Xóa GVCN ${t.name} và thu hồi phân công lớp ${t.classId}? Hồ sơ lớp và học sinh được giữ lại.`,
    )
  )
    return;
  try {
    if (cloud.ready) {
      await flushCloud();
      cloud.busy = true;
      try {
        useBootstrap(await databaseRequest("/teachers/" + id, "DELETE"));
      } finally {
        cloud.busy = false;
      }
    } else {
      appData.teacherArchive ||= [];
      appData.teacherArchive.push({
        ...t,
        deletedAt: new Date().toISOString(),
        deletedBy: auth.email,
      });
      const c = appData.classes[t.classId];
      if (c.email === t.email) {
        c.teacher = "";
        c.email = "";
      }
      delete appData.teachers[id];
      save();
    }
    render();
    toast("Đã xóa GVCN và giữ nguyên hồ sơ lớp.");
  } catch (error) {
    alert(error.message);
  }
}
