"use strict";

async function loadRecovery(){
  if(!hasAppRole('admin')||!cloud.ready)return;
  const context=dialogContext(),id=ui.classId;
  try{
    const data=await databaseRequest('/recovery/'+id,'GET');
    if(Object.keys(context).some(k=>context[k]!==dialogContext()[k])||ui.page!=='database')return;
    ui.recovery=data;
    $('recoveryPanel').innerHTML=`<h3>Lớp ${esc(id)}</h3><p>30 bản hằng ngày và 20 phiên bản gần nhất. Khôi phục sẽ thay dữ liệu lớp bằng bản được chọn.</p>${Object.entries(data.snapshots).sort((a,b)=>b[1].at.localeCompare(a[1].at)).map(([key,s])=>`<p>${esc(new Date(s.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))} · ${esc(s.actor)} · Phiên bản ${s.revision} <button type="button" class="btn small" onclick="downloadRecovery('${key}')">Tải JSON</button> <button type="button" class="btn small danger" onclick="restoreRecovery('${key}')">Khôi phục</button></p>`).join('')||'<p>Chưa có bản sao lưu.</p>'}<h3>Lịch sử thay đổi</h3>${data.audit.map(a=>`<p>${esc(a.at)} · ${esc(a.actor)} · ${esc(a.action)} ${(a.changes||[]).map(x=>esc(x.operation+" ? "+x.record)).join("; ")}</p>`).join('')}`;
  }catch(error){appAlert('Chưa tải được lịch sử. API mới cần được triển khai: '+error.message);}
}
function downloadRecovery(key){
  const data=ui.recovery;if(!hasAppRole('admin')||!data?.snapshots[key])return;
  downloadFile(new Blob([JSON.stringify(data.snapshots[key],null,2)],{type:'application/json'}),`Sao_luu_${data.classId}_${key}.json`);
}
async function restoreRecovery(key){
  const data=ui.recovery;if(!hasAppRole('admin')||!data?.snapshots[key]||ui.classId!==data.classId)return;
  if(!await appConfirm(`Khôi phục lớp ${data.classId} về phiên bản ${data.snapshots[key].revision}? Dữ liệu hiện tại sẽ được sao lưu trước khi thay thế.`))return;
  if(ui.recovery!==data||!hasAppRole('admin')||ui.classId!==data.classId)return;
  try{useBootstrap(await databaseRequest('/recovery/'+data.classId,'POST',{key,revision:data.revision}));render();toast('Đã khôi phục dữ liệu lớp.');}catch(error){appAlert(error.message);}
}

// Admin teacher assignments and database settings.

function renderTeachers() {
  if (!hasAppRole("admin")) return "";
  const teachers = Object.values(appData.teachers || {}).sort((a, b) =>
    a.classId.localeCompare(b.classId, undefined, { numeric: true }),
  );
  return `<div class="section-head"><h2>Danh sách GVCN · ${teachers.length} giáo viên</h2><div class="actions">${btn("＋ Thêm GVCN", "openModal('teacherAccount')", "primary")}${cloud.ready ? btn("Tải dữ liệu mới", "refreshCloud()") : ""}</div></div>
    <section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email Microsoft</th><th>Lớp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${teachers.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.classId)}</td><td>${statusTag(t.active !== false ? "Đang hoạt động" : "Ngừng hoạt động")}</td><td class="actions-cell">${btn("Sửa", `openModal('teacherAccount','${t.id}')`, "small")}${btn("Học sinh", `openClassStudents('${t.classId}')`, "small")}${btn("Xóa", `deleteTeacherAccount('${t.id}')`, "small danger")}</td></tr>`).join("") || '<tr><td colspan="5"><div class="empty">Chưa có GVCN trong danh sách quản lý. Bấm Thêm GVCN để bắt đầu.</div></td></tr>'}</tbody></table></div></section>`;
}

function renderUsers() {
  if (!hasAppRole("admin")) return "";
  const users = [...(appData.users || [])].sort((a, b) =>
    a.email.localeCompare(b.email),
  );
  const rows = users
    .map((user) => {
      const roles = assignmentRoles(user)
        .map((role) => ROLE_NAMES[role] || role)
        .join(" · ");
      const grades = assignedGrades(user);
      const scope = user.classId
        ? `Lớp ${user.classId}`
        : grades.length
          ? `Khối ${grades.join(", ")}`
          : "Toàn trường";
      return `<tr><td><b>${esc(user.name || user.email)}</b></td><td>${esc(user.email)}</td><td>${esc(roles)}</td><td>${esc(scope)}</td><td>${statusTag(user.active !== false ? "Đang hoạt động" : "Ngừng hoạt động")}</td><td>${btn("Sửa vai trò", `openModal('userRoles','${esc(user.email)}')`, "small")}</td></tr>`;
    })
    .join("");
  return `<div class="section-head"><h2>Tài khoản & vai trò · ${users.length} tài khoản</h2><div class="actions">${cloud.ready ? btn("＋ Thêm tài khoản", "openModal('userRoles')", "primary") + btn("Nhập danh sách đã chuẩn bị", "$('directoryInput').click()") : ""}</div></div>
    ${cloud.ready ? `<section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email công vụ</th><th>Vai trò</th><th>Phạm vi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="empty">Chưa có tài khoản được phân công.</div></td></tr>'}</tbody></table></div></section>` : '<section class="card"><p class="help">Kết nối Firebase để xem và quản lý vai trò máy chủ.</p></section>'}`;
}

async function saveUserRole(record) {
  if (!canEditSetup() || !cloud.ready)
    throw Error("Cần quyền Admin và kết nối Firebase để quản lý vai trò.");
  record.email = record.email.toLowerCase().trim();
  const previous = (appData.users || []).find(
    (user) => user.email === record.email,
  );
  const previousRoles = assignmentRoles(previous);
  const gained = record.roles.filter((role) => !previousRoles.includes(role));
  if (
    gained.some((role) => ["admin", "bgh", "lead"].includes(role)) &&
    !await appConfirm(
      `Cấp vai trò ${gained.map((role) => ROLE_NAMES[role]).join(", ")} cho ${record.email}? Vai trò này mở quyền truy cập theo phạm vi được nêu.`,
    )
  )
    return false;
  await flushCloud();
  cloud.busy = true;
  try {
    useBootstrap(await databaseRequest("/users", "POST", record));
  } finally {
    cloud.busy = false;
  }
  return true;
}

async function importDirectoryFile(e) {
  const input = e.target,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!canEditSetup() || !cloud.ready) {
    appAlert("Chỉ Admin đang kết nối Firebase mới được nhập phân công.");
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    if (
      data.schema !== 1 ||
      data.year !== YEARS ||
      !Array.isArray(data.teachers) ||
      !Array.isArray(data.users)
    )
      throw Error("Tệp phân công không đúng định dạng năm học 2026–2027.");
    if (
      !await appConfirm(
        `Nhập ${data.teachers.length} phân công GVCN và ${data.users.length} tài khoản vai trò lên Firebase? Lớp đã có GVCN khác hoặc tài khoản có quyền ngoài tệp sẽ bị từ chối, không ghi đè.`,
      )
    )
      return;
    await flushCloud();
    cloud.busy = true;
    try {
      useBootstrap(
        await databaseRequest("/directory/import", "POST", data),
      );
    } finally {
      cloud.busy = false;
    }
    render();
    toast(
      `Đã đồng bộ ${data.teachers.length} GVCN và ${data.users.length} tài khoản vai trò.`,
    );
  } catch (error) {
    appAlert("Không thể nhập phân công: " + error.message);
  } finally {
    cloud.busy = false;
    updateStorageNotice();
  }
}

function renderDatabase() {
  if (!hasAppRole("admin")) return "";
  return `<div class="section-head"><h2>Dữ liệu</h2></div>
    <div class="cols2"><section class="card"><h2>Kết nối dữ liệu dùng chung</h2>
    <p class="help" style="overflow-wrap:anywhere">Database: ${esc(FIREBASE_DATABASE_URL)}</p>
    ${cloud.error?`<p class="help">${esc(cloud.error)}</p>`:!cloud.ready?'<p class="help">Chưa kết nối dữ liệu dùng chung.</p>':''}
    <div class="actions">${cloud.ready ? btn("Tải dữ liệu mới", "refreshCloud()") + btn("Thử đồng bộ lại", "retryCloud()") + btn("Xuất bản lưu chờ đồng bộ", "exportPendingDrafts()") + btn("Sao lưu & lịch sử lớp đang chọn", "loadRecovery()") : btn("Bật kết nối Firebase", "enableFirebase()", "primary")}${btn("Xuất JSON sao lưu", "jsonBackup()")}</div><div id="recoveryPanel"></div></section>
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
    !await appConfirm(
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
    appAlert(error.message);
  }
}
