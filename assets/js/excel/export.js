"use strict";

// Export original class workbook and school summaries.

function hideWorkbookColumn(doc,index) {
  let cols=doc.getElementsByTagNameNS(S_NS,'cols')[0];
  if(!cols) {cols=doc.createElementNS(S_NS,'cols');doc.documentElement.insertBefore(cols,doc.getElementsByTagNameNS(S_NS,'sheetData')[0]);}
  for(const col of [...cols.getElementsByTagNameNS(S_NS,'col')]) {
    const min=+col.getAttribute('min'),max=+col.getAttribute('max');
    if(index<min||index>max)continue;
    if(min<index) {const before=col.cloneNode(true);before.setAttribute('max',index-1);cols.insertBefore(before,col);}
    const hidden=col.cloneNode(true);hidden.setAttribute('min',index);hidden.setAttribute('max',index);hidden.setAttribute('hidden','1');cols.insertBefore(hidden,col);
    if(max>index) {const after=col.cloneNode(true);after.setAttribute('min',index+1);cols.insertBefore(after,col);}
    cols.removeChild(col);return;
  }
  const col=doc.createElementNS(S_NS,'col');col.setAttribute('min',index);col.setAttribute('max',index);col.setAttribute('hidden','1');cols.appendChild(col);
}

function retireWorkbookCodeFields(files) {
  const hiddenColumns={DanhSach:3,M02:12,M03:8,M05_CacLan:11,KiemTra:10};
  for(const sheet of getSheetNamePaths(files)) {
    if(!hiddenColumns[sheet.name])continue;
    const doc=xmlparse(decoder.decode(files[sheet.path]));
    hideWorkbookColumn(doc,hiddenColumns[sheet.name]);
    for(const formula of doc.getElementsByTagNameNS(S_NS,'f')) {
      const address=formula.parentNode.getAttribute('r'),row=Number(address.replace(/\D/g,''));
      let text=formula.textContent;
      if(sheet.name==='M02'&&address.startsWith('N'))text=text.replace(`&IF(L${row}="","Mã minh chứng; ","")`,'');
      if(sheet.name==='M05_CacLan'&&address.startsWith('L')) {
        text=text.replace(`&IF(K${row}="","Mã xác nhận; ","")`,'');
        text=text.replace(`&IF(AND(K${row}<>"",COUNTIF('M02'!$L$5:$L$604,K${row})=0),"Mã chưa khớp dòng M02; ","")`,'');
      }
      if(sheet.name==='KiemTra'&&address.startsWith('J')&&row>=5)text=`IF($B${row}=0,"—","OK")`;
      if(text!==formula.textContent) {
        formula.textContent=text;
        for(const value of [...formula.parentNode.getElementsByTagNameNS(S_NS,'v')])formula.parentNode.removeChild(value);
      }
    }
    files[sheet.path]=encoder.encode(new XMLSerializer().serializeToString(doc));
  }
}

// Expand only the generated workbook; preserve the embedded original template.
/**
 * Mở rộng các hàng mẫu theo sĩ số thực, giữ cấu trúc biểu mẫu Excel thay vì cắt ở số hàng mẫu ban
 * đầu.
 */
function expandRosterTemplate(files, count) {
  const baseSize = 28;
  if (count <= baseSize) return baseSize;
  const paths = getSheetNamePaths(files);
  for (const item of paths.filter(s => ["DanhSach", "TheoDoiHS", "M01"].includes(s.name))) {
    const doc = xmlparse(decoder.decode(files[item.path]));
    const data = doc.getElementsByTagNameNS(S_NS, "sheetData")[0];
    const original = [...data.getElementsByTagNameNS(S_NS, "row")];
    const first = original.find(r => r.getAttribute("r") === "5");
    const monthly = item.name === "M01";
    const last = 4 + count * (monthly ? MONTHS.length : 1);
    for (const row of original) if (+row.getAttribute("r") >= 5) data.removeChild(row);
    for (let i = 0; i < count * (monthly ? MONTHS.length : 1); i++) {
      const rowNumber = 5 + i, studentIndex = i % count;
      const row = first.cloneNode(true);
      row.setAttribute("r", rowNumber);
      for (const cell of row.getElementsByTagNameNS(S_NS, "c")) {
        const col = cell.getAttribute("r").replace(/\d+$/, "");
        cell.setAttribute("r", col + rowNumber);
        const formula = cell.getElementsByTagNameNS(S_NS, "f")[0];
        if (formula) {
          formula.textContent = formula.textContent.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g,
            (ref, column, absolute, n) => absolute ? ref : column + (+n + i));
          if (col === (monthly ? "C" : "B"))
            formula.textContent = `IF(DanhSach!$B$${5+studentIndex}="","",DanhSach!$B$${5+studentIndex})`;
          for (const value of [...cell.getElementsByTagNameNS(S_NS, "v")]) cell.removeChild(value);
        } else if (col === (monthly ? "B" : "A")) {
          const value = cell.getElementsByTagNameNS(S_NS, "v")[0];
          if (value) value.textContent = studentIndex + 1;
        }
      }
      data.appendChild(row);
    }
    // Extend filters, validation and formatting to the generated final row.
    const oldLast = 4 + baseSize * (monthly ? MONTHS.length : 1);
    for (const node of doc.getElementsByTagName("*")) {
      for (const attr of ["ref", "sqref"]) {
        const value = node.getAttribute(attr);
        if (value) node.setAttribute(attr, value.replace(new RegExp(`(\\$?[A-Z]+\\$?)${oldLast}\\b`, "g"), `$1${last}`));
      }
    }
    files[item.path] = encoder.encode(new XMLSerializer().serializeToString(doc));
  }
  // Update cross-sheet formulas and named ranges, including student dropdowns.
  for (const path of Object.keys(files).filter(p => p.endsWith(".xml"))) {
    let xml = decoder.decode(files[path]);
    xml = xml.replace(/((?:'DanhSach'|DanhSach)!\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?)32\b/g, `$1${count+4}`);
    xml = xml.replace(/((?:'M01'|M01)!\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?)256\b/g, `$1${4+count*MONTHS.length}`);
    files[path] = encoder.encode(xml);
  }
  return count;
}
/**
 * Điền dữ liệu vào bản sao tệp mẫu Excel của lớp; tệp mẫu gốc nhúng trong source không bị thay
 * đổi.
 */
async function exportClass() {
  try {
    let c = cls();
    if (!c.students.length) {
      appAlert("Lớp chưa có danh sách học sinh.");
      return;
    }
    let b = b64bytes(TEMPLATE_B64);
    const files = await readZip(b.buffer);
    const rosterSize = expandRosterTemplate(files, c.students.length);
    retireWorkbookCodeFields(files);
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
          row = 5 + mi * rosterSize + si;
        add("M01", "A" + row, month);
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
        F: [x.previousReview?'Nhận xét sau lần trước: '+x.previousReview:'',x.participation].filter(Boolean).join('\n'),
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
    appAlert("Không xuất được Excel: " + e.message);
  }
}
/**
 * Xuất số liệu tổng hợp trong phạm vi hiện tại, không đưa nội dung gặp cá nhân vào báo cáo tổng
 * quan.
 */
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
