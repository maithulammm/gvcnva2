"use strict";

// Report totals and K1-K9 checks.

function rows(m, key) {
  return m[key] || [];
}

function currentMeetingSidSet(m) {
  return new Set(
    rows(m, "meetings")
      .filter((x) => x.studentId)
      .map((x) => x.studentId),
  );
}

function plannedStudentIds(c, m) {
  return c.students
    .filter((s) => {
      const a = m.schedule?.[s.id] || {};
      return Boolean(
        a.planTime ||
        a.status ||
        m.meetings.some((x) => x.studentId === s.id),
      );
    })
    .map((s) => s.id);
}

function summarize(c, month) {
  if (cloud.ready && isAggregateBgh() && cloud.summaries[c.id]?.[month])
    return cloud.summaries[c.id][month];
  const m = mdata(c, month, false);
  let ids = new Set(c.students.map((s) => s.id));
  let meet = rows(m, "meetings").filter((x) => ids.has(x.studentId));
  let conn = rows(m, "connections").filter((x) => ids.has(x.studentId));
  let plans = rows(m, "plans").filter((x) => ids.has(x.studentId));
  let previous = rows(m, "previous").filter((x) => ids.has(x.studentId));
  let actual = uniq(meet.map((x) => x.studentId)),
    planned = plannedStudentIds(c, m);
  let metSet = new Set(actual);
  let confirmed = meet.filter((x) => x.evidence).length;
  return {
    classId: c.id,
    grade: c.grade,
    teacher: c.teacher,
    count: c.students.length,
    planned: planned.length,
    met: actual.length,
    miss: planned.filter((x) => !metSet.has(x)).length,
    rate: c.students.length
      ? Math.round((1000 * actual.length) / c.students.length) / 10
      : 0,
    priorityMet: c.students.filter(
      (s) => m.schedule?.[s.id]?.priority && metSet.has(s.id),
    ).length,
    meetings: meet.length,
    improved: uniq(
      meet
        .filter((x) => x.progressEvidence === "Có")
        .map((x) => x.studentId),
    ).length,
    coordination: uniq(
      meet.filter((x) => x.needsCoop === "Có").map((x) => x.studentId),
    ).length,
    connections: conn.length,
    connectedStudents: uniq(conn.map((x) => x.studentId)).length,
    connEvidence: conn.filter((x) => x.evidence).length,
    unconnected: Math.max(
      0,
      c.students.length - uniq(conn.map((x) => x.studentId)).length,
    ),
    supportPrev: uniq(previous.map((x) => x.studentId)).length,
    supportPlans: uniq(plans.map((x) => x.studentId)).length,
    supportDone: plans.filter((x) => x.result === "Đạt").length,
    profileSessions: meet.filter((x) => x.profileId).length,
    state: m.approval?.state || "draft",
  };
}

function validations(c, month) {
  if (cloud.ready && isAggregateBgh() && cloud.checks[c.id]?.[month])
    return cloud.checks[c.id][month];
  const m = mdata(c, month, false),
    s = summarize(c, month);
  const ids = new Set(c.students.map((x) => x.id));
  let errors = [];
  let warnings = [];
  let add = (key, problem, bad) =>
    (bad ? errors : warnings).push({ key, message: problem });
  if (
    s.met !==
    uniq(
      m.meetings
        .filter((x) => ids.has(x.studentId))
        .map((x) => x.studentId),
    ).length
  )
    add("K1", "M01 và M02 chưa khớp số HS đã gặp.", true);
  for (let x of c.students) {
    let a = m.schedule[x.id] || {};
    if (m.meetings.some((y) => y.studentId === x.id && !y.actual))
      add(
        "K2",
        `${x.name}: đã ghi lượt gặp nhưng thiếu ngày giờ thực tế.`,
        true,
      );
  }
  for (let [i, x] of m.meetings.entries()) {
    if (
      !x.studentId ||
      !ids.has(x.studentId) ||
      !x.actual ||
      !x.concern ||
      !x.participation ||
      !x.progressEvidence ||
      !x.goal ||
      !x.action ||
      !x.cooperation ||
      !x.needsCoop ||
      !x.evidence
    )
      add(
        "K3",
        `M02 lượt ${i + 1} thiếu thông tin bắt buộc hoặc mã xác nhận.`,
        true,
      );
  }
  for (let [i, x] of m.connections.entries()) {
    if (
      !x.studentId ||
      !x.date ||
      !x.channel ||
      !x.message ||
      !x.recipient ||
      !x.reply
    )
      add("K4", `M03 lượt ${i + 1} còn thiếu thông tin.`, true);
  }
  for (let [i, x] of m.previous.entries()) {
    if (!x.studentId || !x.action || !x.observation || !x.next)
      add("K5", `M04 phần I dòng ${i + 1} thiếu dữ liệu.`, true);
  }
  for (let [i, x] of m.plans.entries()) {
    if (
      !x.studentId ||
      !x.need ||
      !x.goal ||
      !x.action ||
      !x.deadline ||
      !x.cooperation ||
      !x.assessment
    )
      add("K5", `M04 phần II dòng ${i + 1} thiếu dữ liệu.`, true);
  }
  for (let p of c.profiles.filter((x) => x.startMonth === month)) {
    if (
      !ids.has(p.studentId) ||
      !p.code ||
      !p.strength ||
      !p.concern ||
      !p.goal
    )
      add(
        "K6",
        `M05 phiếu ${p.code || "không mã"} thiếu thông tin.`,
        true,
      );
  }
  for (let x of m.meetings.filter((x) => x.profileId)) {
    const profile = c.profiles.find((p) => p.id === x.profileId);
    if (
      !profile ||
      profile.studentId !== x.studentId ||
      !x.evidence ||
      !x.profileProgress ||
      !x.profileNext
    )
      add(
        "K6",
        `M05 lượt gặp của ${studentName(c, x.studentId)} thiếu chi tiết hoặc liên kết.`,
        true,
      );
  }
  if (c.students.length > 0 && s.planned < c.students.length)
    add(
      "K7",
      `M01 mới lên kế hoạch cho ${s.planned}/${c.students.length} học sinh.`,
      false,
    );
  if (m.connections.some((x) => !x.evidence))
    add(
      "K8",
      `M03 có ${m.connections.filter((x) => !x.evidence).length} lượt thiếu mã minh chứng.`,
      false,
    );
  if (!m.connections.length)
    add("K9", "M03 tháng này chưa ghi nhận kết nối tích cực.", false);
  const hasData =
    s.planned +
      s.meetings +
      s.connections +
      s.supportPrev +
      s.supportPlans +
      s.profileSessions >
    0;
  const codes = {};
  for (let i = 1; i <= 9; i++) {
    let k = "K" + i;
    codes[k] = errors.some((x) => x.key === k)
      ? "LỖI"
      : warnings.some((x) => x.key === k)
        ? "CHÚ Ý"
        : hasData
          ? "OK"
          : "—";
  }
  return { errors, warnings, codes, hasData };
}
