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

function navTo(page) {
  ui.page = page;
  ui.search = "";
  if (page === "m05" && !ui.profileId)
    ui.profileId = cls().profiles[0]?.id || "";
  render();
}

function renderSelectors() {
  const assignment = auth.assignment;
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
  $("identityLabel").textContent = auth.email;
  $("monthSel").innerHTML = MONTHS.map(
    (m) => `<option value="${m}">${m}</option>`,
  ).join("");
  $("monthSel").value = ui.month;
}

function render() {
  if (!auth.account || !appData) return;
  renderSelectors();
  let allowed = canViewPersonal() || ui.role === "lead";
  let permitted = VIEW_LIST.filter(([k]) =>
    ["teachers", "database", "users"].includes(k)
      ? hasAppRole("admin")
      : allowed || ["dashboard", "check", "export"].includes(k),
  );
  $("nav").innerHTML = permitted
    .map(
      ([k, i, s]) =>
        `<button class="${ui.page === k ? "active" : ""}" onclick="navTo('${k}')"><span class="ico">${i}</span><span class="nav-text">${esc(s)}</span></button>`,
    )
    .join("");
  if (!permitted.some((x) => x[0] === ui.page)) ui.page = "dashboard";
  const head = HEADINGS[ui.page];
  $("pageTitle").textContent = head[0];
  $("pageSubtitle").textContent = head[1];
  $("view").innerHTML = {
    dashboard: renderDashboard,
    students: renderStudents,
    teachers: renderTeachers,
    users: renderUsers,
    database: renderDatabase,
    m01: renderM01,
    m02: renderM02,
    m03: renderM03,
    m04: renderM04,
    m05: renderM05,
    check: renderCheck,
    export: renderExport,
  }[ui.page]();
  updateStorageNotice();
}
