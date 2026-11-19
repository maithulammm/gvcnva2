"use strict";

// Class/month data model and browser persistence.

function defaultSchool() {
  return {
    schema: 2,
    year: YEARS,
    users: [],
    calendar: {excludedDates:[],excludedSessions:[],revision:0},
    classes: Object.fromEntries(
      CLASSES.map((id) => [
        id,
        {
          id,
          grade: +id.match(/^\d+/)[0],
          teacher: "",
          email: "",
          students: [],
          months: {},
          profiles: [],
          audit: [],
        },
      ]),
    ),
    created: new Date().toISOString(),
  };
}

function load() {
  if (!auth.account) throw Error("Chưa đăng nhập Microsoft.");
  try {
    const raw = localStorage.getItem(DATA_KEY);
    let p = JSON.parse(raw);
    if (p && p.schema === 2 && p.classes) {
      appData = p;
      for (let c of CLASSES)
        if (!appData.classes[c])
          appData.classes[c] = defaultSchool().classes[c];
      return;
    }
    if (raw)
      throw Error(
        "Dữ liệu cục bộ khác định dạng schema 2. Hệ thống giữ nguyên bản gốc và dừng để tránh ghi đè.",
      );
  } catch (e) {
    console.warn(e);
    throw Error(
      "Không đọc được dữ liệu cục bộ; bản gốc vẫn được giữ nguyên. " +
        e.message,
    );
  }
  appData = defaultSchool();
}

function save() {
  if (isRolePreview()) return false;
  if (!auth.account) throw Error("Chưa đăng nhập Microsoft.");
  try {
    localStorage.setItem(
      cloud.ready ? cloudCacheKey() : DATA_KEY,
      JSON.stringify(appData),
    );
    if (cloud.ready) scheduleCloudSave();
  } catch (e) {
    appAlert(
      "Không lưu được dữ liệu trình duyệt (có thể đã đầy bộ nhớ). Hãy xuất bản sao lưu JSON.",
    );
    return false;
  }
  return true;
}

function cls(id = ui.classId) {
  if (!auth.account || !auth.assignment || !appData)
    throw Error("Chưa có quyền truy cập dữ liệu.");
  if (!classesForAssignment().includes(id))
    throw Error("Không được xem lớp ngoài khối được phân công.");
  return appData.classes[id];
}

function mdata(c = cls(), month = ui.month, create = true) {
  if (!c.months[month] && create)
    c.months[month] = {
      schedule: {},
      meetings: [],
      connections: [],
      previous: [],
      plans: [],
      notes: {},
      approval: { state: "draft", history: [] },
    };
  return (
    c.months[month] || {
      schedule: {},
      meetings: [],
      connections: [],
      previous: [],
      plans: [],
      notes: {},
      approval: { state: "draft", history: [] },
    }
  );
}

function studentName(c, id) {
  return c.students.find((s) => s.id === id)?.name || "—";
}

function studentIdByName(c, n) {
  return (
    c.students.find(
      (x) =>
        x.name.trim().toLowerCase() === String(n).trim().toLowerCase(),
    )?.id || ""
  );
}

function gradeText(id) {
  return String(+id.match(/^\d+/)[0]);
}

function stableString(value) {
  return JSON.stringify(value, (key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}

function classFingerprint(c) {
  const months = Object.fromEntries(
    Object.entries(c.months || {}).filter(
      ([, m]) =>
        Object.keys(m.schedule || {}).length ||
        ["meetings", "connections", "previous", "plans"].some(
          (k) => (m[k] || []).length,
        ) ||
        Object.keys(m.notes || {}).length ||
        (m.approval?.state || "draft") !== "draft" ||
        (m.approval?.history || []).length,
    ),
  );
  return stableString({ ...c, months });
}

function hasStudentReferences(c, id) {
  return (
    c.profiles.some((p) => p.studentId === id) ||
    Object.values(c.months).some(
      (m) =>
        Object.hasOwn(m.schedule || {}, id) ||
        ["meetings", "connections", "previous", "plans"].some((k) =>
          (m[k] || []).some((r) => r.studentId === id),
        ),
    )
  );
}
