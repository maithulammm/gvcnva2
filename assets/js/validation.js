"use strict";

// Report totals and K1-K9 checks.

function rows(m, key) {
  return m[key] || [];
}
/** Kế hoạch đã có là căn cứ phát sinh; trạng thái không phát sinh phải được GVCN chọn rõ. */
function supportReviewState(m){return m.plans?.length?'needed':['none','needed'].includes(m.notes?.supportReview)?m.notes.supportReview:'pending';}
function supportReviewLabel(state){return {none:'Không phát sinh hỗ trợ',needed:'Có phát sinh hỗ trợ',pending:'Chưa rà soát'}[state]||'Chưa rà soát';}
/**
 * Dùng Set để mỗi học sinh chỉ tính một lần trong số HS đã gặp, dù có nhiều cuộc gặp.
 */
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
/**
 * Tính chỉ tiêu từ bản ghi đã lưu; nếu API chỉ cấp tổng hợp thì dùng số liệu máy chủ, không suy từ
 * lớp đã che chi tiết.
 */
function summarize(c, month) {
  if (cloud.ready && cloud.summaries[c.id]?.[month])
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
    overdueAppointments: monthlyAppointments(c,month).filter(a=>scheduleSlot(a).date&&scheduleSlot(a).date<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())&&!meet.some(r=>r.appointmentId===a.id)).length,
    plannedMeetings: c.students.reduce((total, student) => {
      const plan=m.schedule[student.id]||{};
      return total+(Array.isArray(plan.appointments)?plan.appointments.length:plan.planTime?1:0);
    },0),
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
    supportReview:supportReviewState(m),
    supportDone: plans.filter((x) => x.result === "Đạt").length,
    profileSessions: meet.filter((x) => x.profileId).length,
    state: m.approval?.state || "draft",
  };
}
/**
 * Kiểm tra lỗi bắt buộc và cảnh báo phục vụ gửi báo cáo; đọc dữ liệu, không tự bổ sung nội dung
 * cho giáo viên.
 */
function validations(c, month) {
  if (cloud.ready && cloud.checks[c.id]?.[month])
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
      !x.cooperation ||
      !x.needsCoop
    )
      add(
        "K3",
        `M02 lượt ${i + 1} thiếu thông tin bắt buộc.`,
        true,
      );
  }
  for (let [i, x] of m.connections.entries()) {
    if (
      !x.studentId ||
      !x.date ||
      !x.channel ||
      !x.recipient
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
  // M03–M05 ghi theo phát sinh: không tạo cảnh báo hay đòi đủ số lượng khi không có bản ghi.
  const hasData = supportReviewState(m)!=='pending' ||
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
  const active={K2:m.meetings.length,K3:m.meetings.length,K4:m.connections.length,
    K5:m.previous.length+m.plans.length,K6:c.profiles.filter(p=>p.startMonth===month).length+m.meetings.filter(r=>r.profileId).length,K9:m.connections.length};
  for(const [key,count]of Object.entries(active))if(!count&&!errors.some(e=>e.key===key))codes[key]=key==='K6'?'THEO TRƯỜNG HỢP':'CHƯA GHI NHẬN';
  if(m.notes?.supportReview==='none'&&m.plans.length){errors.push({key:'K5',message:'M04 đã có kế hoạch hỗ trợ, không thể chọn không phát sinh.'});codes.K5='LỖI';}
  else if(supportReviewState(m)==='none'&&!errors.some(e=>e.key==='K5'))codes.K5='KHÔNG PHÁT SINH';
  else if(supportReviewState(m)==='needed'&&!m.plans.length){warnings.push({key:'K5',message:'M04 đã xác nhận có phát sinh nhưng chưa có kế hoạch hỗ trợ.'});codes.K5='CHÚ Ý';}
  return { errors, warnings, codes, hasData };
}
