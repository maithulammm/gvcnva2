"use strict";

// Client-side scope and edit controls; server authorization remains authoritative.

function isRolePreview() {
  return !!ui.preview && assignmentRoles(auth.assignment).includes("admin");
}

function viewAssignment() {
  return isRolePreview() ? ui.preview : auth.assignment;
}

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

function editable() {
  if (!auth.account || cloud.busy || isRolePreview()) return false;
  return (
    hasAppRole("admin") ||
    (hasAppRole("gvcn") &&
      viewAssignment()?.classId === ui.classId &&
      ["draft", "returned"].includes(mdata().approval.state || "draft"))
  );
}

function canEditSetup() {
  return !!auth.account && hasAppRole("admin") && !cloud.busy && !isRolePreview();
}

function canViewPersonal() {
  return hasAppRole("gvcn") || hasAppRole("admin");
}

function scopedClasses() {
  if (!hasAppRole("admin") && !hasAppRole("bgh") && !hasAppRole("lead"))
    return viewAssignment()?.classId ? [viewAssignment().classId] : [];
  if (ui.grade === "all") return getScope();
  return getScope().filter((id) => gradeText(id) === String(ui.grade));
}
