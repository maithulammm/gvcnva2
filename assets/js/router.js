"use strict";

// Navigation, selectors and page rendering.

function markChanged() {
  if (save())
    toast(
      cloud.ready
        ? "Đã lưu bản cục bộ, đang chờ đồng bộ Firebase…"
        : "Đã lưu dữ liệu trên trình duyệt này.",
    );
  render();
}
/**
 * Đóng hướng dẫn/menu cũ, đổi trang rồi mở hướng dẫn của mẫu nếu chưa chọn bỏ qua; không lưu thay
 * đổi nghiệp vụ.
 */
function navTo(page) {
  closeFormHelp();
  closeMobileNavigation();
  ui.page = page==='work'?'m02':page;
  ui.search = "";
  if (page === "m05" && !ui.profileId)
    ui.profileId = cls().profiles[0]?.id || "";
  render();
  window.scrollTo?.({top:0,behavior:'auto'});
  $('pageTitle').focus({preventScroll:true});
  openFormHelp(ui.page,true);
}
/**
 * Chỉ Admin thật được đổi chế độ; đóng popup cũ, xóa trạng thái phục hồi và chuyển phạm vi mô
 * phỏng.
 */
function setRolePreview(role, classId = ui.preview?.classId || ui.classId) {
  ui.recovery=null;
  if (!assignmentRoles(auth.assignment).includes("admin")) return;
  if (!["", "admin", "gvcn", "lead", "bgh"].includes(role) || !CLASSES.includes(classId)) return;
  $("editor").close();
  ui.editing = null;
  ui.preview = role ? {role, roles:[role], classId, grades:[gradeText(classId)]} : null;
  ui.role = viewAssignment().role;
  ui.classId = classId;
  ui.grade = ["admin", "bgh"].includes(ui.role) ? "all" : gradeText(classId);
  ui.profileId = "";
  ui.page = "dashboard";
  render();
}

function renderRolePreview() {
  const host = $("rolePreview");
  host.innerHTML = "";
  if (!assignmentRoles(auth.assignment).includes("admin")) return;
  const role = isRolePreview() ? ui.preview.role : "";
  host.setAttribute('data-mode',role);
  const classId = ui.preview?.classId || ui.classId;
  host.innerHTML = `<label>Chế độ QTV <select aria-label="Chế độ QTV" data-choice-mode="dropdown" onchange="setRolePreview(this.value)">
    <option value="">Quyền thực tế</option>${["gvcn","lead","bgh","admin"].map(r=>`<option value="${r}" ${role===r?"selected":""}>${esc(ROLE_NAMES[r])}</option>`).join("")}</select></label>
    ${role ? `<label>Lớp / khối <select aria-label="Lớp / khối của chế độ QTV" data-choice-mode="dropdown" onchange="setRolePreview('${role}',this.value)">${CLASSES.map(id=>`<option value="${id}" ${id===classId?"selected":""}>${id} · Khối ${gradeText(id)}</option>`).join("")}</select></label>
    <span class="toolbar-mode-status" role="status" title="${role==='gvcn'?'QTV đang chỉnh sửa lớp '+esc(classId)+' · Lưu dữ liệu thật.':'Đang xem thử · Không lưu thay đổi.'}">${role==='gvcn'?'Lưu thật':'Chỉ xem'}</span><button type="button" class="btn small toolbar-exit" title="Thoát xem thử" aria-label="Thoát xem thử" onclick="setRolePreview('')">↩</button>` : ""}`;
}
/**
 * Dựng bộ chọn theo phạm vi quyền và cập nhật tên/ảnh của tài khoản thật.
 */
function renderSelectors() {
  const assignment = viewAssignment();
  if (!assignment || !auth.account) return;
  const grade = $("gradeSel"),
    classPicker = $("classSel"),
    roles = assignmentRoles(assignment);
  if (!roles.includes("admin") && !roles.includes("bgh") && !roles.includes("lead")) {
    ui.grade = gradeText(assignment.classId);
    ui.classId = assignment.classId;
    grade.innerHTML = `<option value="${ui.grade}">Khối ${ui.grade}</option>`;
    grade.value = ui.grade;
    grade.disabled = true;
    classPicker.innerHTML = `<option value="${ui.classId}">${ui.classId}</option>`;
    classPicker.value = ui.classId;
    classPicker.disabled = true;
  } else if (roles.includes("lead") && !roles.includes("admin") && !roles.includes("bgh")) {
    const assigned = assignedGrades(assignment);
    if (!assigned.includes(String(ui.grade))) ui.grade = assigned[0];
    let ids = classesForAssignment(assignment);
    if (!ids.includes(ui.classId)) ui.classId = assignment.classId || ids[0] || "";
    grade.innerHTML = assigned
      .map((g) => `<option value="${g}">Khối ${g}</option>`)
      .join("");
    grade.value = ui.grade;
    grade.disabled = assigned.length === 1;
    classPicker.innerHTML = ids
      .map((id) => `<option value="${id}">${id}</option>`)
      .join("");
    classPicker.value = ui.classId;
    classPicker.disabled = ids.length === 1;
  } else {
    let grades = Object.keys(GRADES);
    if (ui.grade !== "all" && !grades.includes(ui.grade))
      ui.grade = "all";
    grade.innerHTML =
      '<option value="all">Toàn trường</option>' +
      grades
        .map((g) => `<option value="${g}">Khối ${g}</option>`)
        .join("");
    grade.value = ui.grade;
    grade.disabled = false;
    let ids = ui.grade === "all" ? CLASSES : GRADES[ui.grade];
    if (!ids.includes(ui.classId)) ui.classId = ids[0] || "6A1";
    classPicker.innerHTML = ids
      .map((id) => `<option value="${id}">${id}</option>`)
      .join("");
    classPicker.value = ui.classId;
    classPicker.disabled = ui.grade === "all";
  }
  $("roleLabel").textContent = roles
    .map((role) => ROLE_NAMES[role] || role)
    .join(" · ");
  $("identityLabel").textContent = accountDisplayName();
  updateAccountPhoto();
  $("accountMenuButton").title = $("identityLabel").textContent;
  $("roleLabel").title = $("roleLabel").textContent;
  $("monthSel").innerHTML = MONTHS.map(
    (m) => `<option value="${m}">${m}</option>`,
  ).join("");
  $("monthSel").value = ui.month;
}
/**
 * Điểm dựng giao diện trung tâm; chặn trang ngoài quyền trước khi hiển thị và gắn lại các tiện ích
 * responsive.
 */
function render() {
  if (!auth.account || !appData) return;
  closeAccountMenu();
  ui.role = viewAssignment()?.role;
  renderRolePreview();
  renderSelectors();
  let allowed = canViewPersonal();
  let permitted = VIEW_LIST.filter(([k]) =>
    ["students", "teachers", "database", "users", "export", "calendar"].includes(k)
      ? hasAppRole("admin")
      : allowed || k==="dashboard" || k==="check"&&hasAppRole("bgh"),
  );
  const adminPages=['students','teachers','users','database','export','calendar'];
  if (!permitted.some((x) => x[0] === ui.page)) ui.page = "dashboard";
  const navButton=([k,i,s])=>
    `<button class="${ui.page===k?'active':''}" aria-label="${esc(s)}" title="${esc(s)}" ${ui.page===k?'aria-current="page"':''} onclick="navTo('${k}')"><span class="ico" aria-hidden="true">${i}</span><span class="nav-text">${esc(s)}</span></button>`;
  $("nav").innerHTML = permitted.filter(([k])=>!adminPages.includes(k)).map(navButton).join('')+
    (hasAppRole('admin')?`<details class="admin-nav" ${adminPages.includes(ui.page)||ui.adminMenuOpen?'open':''} ontoggle="ui.adminMenuOpen=this.open"><summary title="Quản trị viên"><span class="ico" aria-hidden="true"><svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-gear" viewBox="0 0 16 16">
  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/>
</svg></span><span class="nav-text">Quản trị viên</span></summary><div class="admin-nav-links">${permitted.filter(([k])=>adminPages.includes(k)).map(navButton).join('')}</div></details>`:'');
  const head = HEADINGS[ui.page];
  $("pageTitle").textContent = head[0];
  $('formHelpButton').hidden=!FORM_HELP[ui.page];
  $("pageTitle").title = head[0];
  $("pageSubtitle").textContent = head[1];
  $("pageSubtitle").hidden = !head[1];
  $("view").innerHTML = {
    dashboard: renderDashboard,
    students: renderStudents,
    teachers: renderTeachers,
    users: renderUsers,
    database: renderDatabase,
    calendar: renderSchoolCalendar,
    m01: renderM01,
    m02: renderM02,
    m03: renderM03,
    m04: renderM04,
    m05: renderM05,
    check: renderCheck,
    export: renderExport,
  }[ui.page]();
  renderResponsiveNavigation(permitted);
  adaptResponsiveTables();
  updateStorageNotice();
  refreshButtonChoices();
}
