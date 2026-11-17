"use strict";

// Client-side scope and edit controls; server authorization remains authoritative.

function getScope() {
  if (ui.role === "gvcn") return [ui.classId];
  if (ui.role === "lead") return GRADES[ui.grade] || [];
  return CLASSES;
}

function editable() {
  if (!auth.account || cloud.busy) return false;
  return (
    ui.role === "admin" ||
    (ui.role === "gvcn" &&
      ["draft", "returned"].includes(mdata().approval.state || "draft"))
  );
}

function canEditSetup() {
  return (
    !!auth.account && auth.assignment?.role === "admin" && !cloud.busy
  );
}

function canViewPersonal() {
  return ui.role === "gvcn" || ui.role === "admin";
}

function scopedClasses() {
  if (ui.role === "gvcn") return [ui.classId];
  if (ui.role === "lead") return GRADES[ui.grade] || [];
  return ui.grade === "all" ? CLASSES : GRADES[ui.grade] || CLASSES;
}
