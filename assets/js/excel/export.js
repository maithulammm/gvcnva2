"use strict";

// Export original class workbook and school summaries.

async function exportClass() {
  try {
    let c = cls();
    if (!c.students.length) {
      alert("Lớp chưa có danh sách học sinh.");
      return;
    }
    if (c.students.length > 28)
      throw Error("Vượt giới hạn 28 học sinh của workbook chuẩn.");
    let b = b64bytes(TEMPLATE_B64);
    const files = await readZip(b.buffer);
    let maps = {};
    let add = (sheet, addr, value) => {
      if (!maps[sheet]) maps[sheet] = {};
      maps[sheet][addr] = value;
    };
    add("ThongTin", "B4", c.id);
    add("ThongTin", "B6", c.teacher);
    add("ThongTin", "B7", c.email);
    add("ThongTin", "B8", YEARS);
    c.students.forEach((s, i) => {
      add("DanhSach", "B" + (5 + i), s.name);
      if (s.code) add("DanhSach", "C" + (5 + i), s.code);
    });
    let meetingAll = [],
      connAll = [],
      previousAll = [],
      plansAll = [],
      sessionsAll = [];
    MONTHS.forEach((month, mi) => {
      const m = mdata(c, month, false);
      c.students.forEach((st, si) => {
        let a = m.schedule?.[st.id] || {},
          meet = m.meetings.filter((x) => x.studentId === st.id),
          row = 5 + mi * 28 + si;
        if (a.priority) add("M01", "D" + row, "Có");
        if (a.goal) add("M01", "E" + row, a.goal);
        if (a.planTime) add("M01", "F" + row, a.planTime);
        if (meet.length) {
          add("M01", "G" + row, meet[0].actual);
          add("M01", "H" + row, "Đã gặp");
        } else if (a.status) add("M01", "H" + row, a.status);
        if (a.note) add("M01", "I" + row, a.note);
      });
      for (let x of m.meetings) meetingAll.push({ ...x, month });
      for (let x of m.connections) connAll.push({ ...x, month });
      for (let x of m.previous) previousAll.push({ ...x, month });
      for (let x of m.plans) plansAll.push({ ...x, month });
      for (let x of m.meetings.filter((x) => x.profileId))
        sessionsAll.push({ ...x, month });
      let events = m.approval?.history || [];
      let r = mi + 5;
      for (let [state, nm, dat] of [
        ["submitted", "B", "C"],
        ["reviewed", "D", "E"],
        ["approved", "F", "G"],
      ]) {
        let event = events.filter((x) => x.state === state).at(-1);
        if (event) {
          add("XacNhan", nm + r, event.actor);
          let date = event.date || event.at.split(",")[0] || event.at;
          add("XacNhan", dat + r, date);
        }
      }
      let ret = events.filter((x) => x.state === "returned").at(-1);
      if (ret) add("XacNhan", "H" + r, ret.note || "Yêu cầu bổ sung");
    });
    limitRows("M02", meetingAll, 600);
    limitRows("M03", connAll, 500);
    limitRows("M04a", previousAll, 180);
    limitRows("M04b", plansAll, 180);
    limitRows("M05 hồ sơ", c.profiles, 40);
    limitRows("M05 lượt", sessionsAll, 200);
    meetingAll.forEach((x, i) => {
      let r = i + 5;
      for (let [col, v] of Object.entries({
        A: x.month,
        C: studentName(c, x.studentId),
        D: x.actual,
        E: x.concern,
        F: x.participation,
        G: x.progressEvidence,
        H: x.goal,
        I: x.action,
        J: x.cooperation,
        K: x.needsCoop,
        L: x.evidence,
        M: c.profiles.find((p) => p.id === x.profileId)?.code || "",
      }))
        if (v) add("M02", col + r, v);
    });
    connAll.forEach((x, i) => {
      let r = i + 5,
        vals = {
          A: x.month,
          B: excelDate(x.date),
          C: studentName(c, x.studentId),
          D: x.channel,
          E: x.message,
          F: x.recipient,
          G: x.reply,
          H: x.evidence,
        };
      for (let [col, v] of Object.entries(vals))
        if (v !== null && v !== "") add("M03", col + r, v);
    });
    previousAll.forEach((x, i) => {
      let r = i + 5,
        vals = {
          A: x.month,
          B: studentName(c, x.studentId),
          C: x.action,
          D: x.observation,
          E: x.next,
        };
      for (let [col, v] of Object.entries(vals))
        if (v) add("M04a_ThangTruoc", col + r, v);
    });
    plansAll.forEach((x, i) => {
      let r = i + 5,
        vals = {
          A: x.month,
          B: studentName(c, x.studentId),
          C: x.need,
          D: x.goal,
          E: x.action,
          F: x.deadline,
          G: x.cooperation,
          H: x.assessment,
          I: x.result || "Chưa chốt",
        };
      for (let [col, v] of Object.entries(vals))
        if (v) add("M04b_ThangNay", col + r, v);
    });
    c.profiles.forEach((x, i) => {
      let r = i + 5,
        vals = {
          A: x.code,
          B: studentName(c, x.studentId),
          C: x.startMonth,
          D: x.strength,
          E: x.concern,
          F: x.goal,
          G: x.result,
          H: x.progress,
          I: x.next,
        };
      for (let [col, v] of Object.entries(vals))
        if (v) add("M05_HoSo", col + r, v);
    });
    sessionsAll.forEach((x, i) => {
      let r = i + 5,
        vals = {
          A: x.month,
          B: c.profiles.find((p) => p.id === x.profileId)?.code || "",
          E: x.actual,
          F: x.concern,
          G: x.profileProgress || x.participation,
          H: x.action,
          I: x.cooperation,
          J: x.profileNext,
          K: x.evidence,
        };
      for (let [col, v] of Object.entries(vals))
        if (v) add("M05_CacLan", col + r, v);
    });
    const paths = getSheetNamePaths(files);
    for (let item of paths)
      if (maps[item.name])
        files[item.path] = changeCells(files[item.path], maps[item.name]);
    let workbookPath = "xl/workbook.xml";
    let wb = xmlparse(decoder.decode(files[workbookPath]));
    let cp = wb.getElementsByTagNameNS(S_NS, "calcPr")[0];
    if (!cp) {
      cp = wb.createElementNS(S_NS, "calcPr");
      wb.documentElement.appendChild(cp);
    }
    cp.setAttribute("calcMode", "auto");
    cp.setAttribute("fullCalcOnLoad", "1");
    cp.setAttribute("forceFullCalc", "1");
    files[workbookPath] = encoder.encode(
      new XMLSerializer().serializeToString(wb),
    );
    let blob = zipStore(files);
    downloadFile(blob, `GVCN_${c.id}_${YEARS}.xlsx`);
    toast("Đã xuất Excel 15 sheet theo mẫu gốc.");
  } catch (e) {
    console.error(e);
    alert("Không xuất được Excel: " + e.message);
  }
}

function exportSchool() {
  let scope = scopedClasses();
  let head = [
    "Khối",
    "Lớp",
    "Giáo viên chủ nhiệm",
    "Tháng",
    "Sĩ số",
    "HS dự kiến",
    "HS đã gặp",
    "HS chưa gặp",
    "Tỷ lệ gặp (%)",
    "Lượt gặp",
    "HS tiến bộ",
    "Cần phối hợp",
    "Lượt kết nối PHHS",
    "HS được kết nối",
    "Có minh chứng",
    "KH hỗ trợ",
    "Hồ sơ M05 (lượt)",
    "Lỗi",
    "Chú ý",
    "Trạng thái báo cáo",
  ];
  let rows = [head];
  let allRows = [head];
  for (let id of scope) {
    let c = cls(id);
    let renderRow = (month) => {
      let s = summarize(c, month),
        v = validations(c, month);
      return [
        c.grade,
        c.id,
        c.teacher || "",
        month,
        s.count,
        s.planned,
        s.met,
        s.miss,
        s.rate,
        s.meetings,
        s.improved,
        s.coordination,
        s.connections,
        s.connectedStudents,
        s.connEvidence,
        s.supportPlans,
        s.profileSessions,
        v.errors.length,
        v.warnings.length,
        stageName(s.state),
      ];
    };
    rows.push(renderRow(ui.month));
    for (let m of MONTHS) allRows.push(renderRow(m));
  }
  let blob = simpleWorkbook([
    ["TongHop_Thang", rows],
    ["TongHop_Nam", allRows],
  ]);
  downloadFile(
    blob,
    `GVCN_TongHop_${ui.grade === "all" ? "ToanTruong" : "Khoi" + ui.grade}_${ui.month.replace("/", "_")}.xlsx`,
  );
  toast("Đã xuất báo cáo tổng hợp " + scope.length + " lớp.");
}
