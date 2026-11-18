"use strict";

// Import Excel student rosters.

async function importRoster(e) {
  let input = e.target,
    blob = input.files?.[0];
  input.value = "";
  if (!blob) return;
  if (!canEditSetup()) {
    appAlert("Không đủ quyền nhập danh sách.");
    return;
  }
  const targetClass = cls();
  const targetEpoch = cloud.epoch;
  const targetRoster = stableString(targetClass.students);
  if (
    cls().students.length &&
    !await appConfirm(
      "Nhập lại danh sách có thể làm lệch liên kết hồ sơ cũ. Chỉ nên nhập khi chưa có dữ liệu hoặc đã sao lưu. Tiếp tục?",
    )
  )
    return;
  try {
    let f = await readZip(await blob.arrayBuffer());
    let paths = getSheetNamePaths(f);
    let ss = [];
    if (f["xl/sharedStrings.xml"]) {
      let doc = xmlparse(decoder.decode(f["xl/sharedStrings.xml"]));
      for (let si of doc.getElementsByTagNameNS(S_NS, "si"))
        ss.push(si.textContent);
    }
    let chosen = null;
    for (let sh of [
      ...paths.filter((x) => /danh\s*s[aá]ch/i.test(x.name)),
      ...paths,
    ]) {
      let doc = xmlparse(decoder.decode(f[sh.path]));
      let sheetRows = [...doc.getElementsByTagNameNS(S_NS, "row")].slice(
        0,
        1200,
      );
      let out = sheetRows.map((r) => {
        let entries = {};
        for (let cell of r.getElementsByTagNameNS(S_NS, "c")) {
          let ref = cell.getAttribute("r"),
            col = ref?.match(/^[A-Z]+/)?.[0] || "",
            t = cell.getAttribute("t");
          let v = cell.getElementsByTagNameNS(S_NS, "v")[0],
            inline = cell.getElementsByTagNameNS(S_NS, "is")[0];
          let val =
            t === "s"
              ? ss[+(v?.textContent || 0)]
              : t === "inlineStr"
                ? inline?.textContent
                : v?.textContent;
          entries[col] = String(val ?? "").trim();
        }
        return { n: +r.getAttribute("r"), entries };
      });
      let heading = out.find(
        (r) =>
          r.n <= 20 &&
          Object.entries(r.entries).some(([k, v]) =>
            /họ\s*(?:và\s*)?tên|họ tên học sinh/i.test(v),
          ),
      );
      let col =
        heading &&
        Object.entries(heading.entries).find(([k, v]) =>
          /họ\s*(?:và\s*)?tên|họ tên học sinh/i.test(v),
        )?.[0];
      if (!col && sh.name === "DanhSach") col = "B";
      if (!col) continue;
      let colNext = col.replace(/[A-Z]+/, (x) => {
        let idx = colIndex(x) + 1,
          z = "";
        while (idx) {
          idx--;
          z = String.fromCharCode(65 + (idx % 26)) + z;
          idx = Math.floor(idx / 26);
        }
        return z;
      });
      let records = out
        .filter((r) => r.n > (heading?.n || 4))
        .map((r) => ({
          name: r.entries[col] || "",
          code: r.entries[colNext] || "",
        }))
        .filter(
          (x) =>
            x.name && x.name !== "0" && !/^học sinh\s*$/i.test(x.name),
        );
      if (records.length) {
        chosen = { sh: sh.name, records };
        break;
      }
    }
    if (!chosen)
      throw Error(
        "Không tìm thấy cột Họ và tên và danh sách học sinh trong tệp.",
      );
    if (!canEditSetup() || cloud.epoch !== targetEpoch ||
        appData.classes[targetClass.id] !== targetClass ||
        stableString(targetClass.students) !== targetRoster)
      throw Error("Phiên hoặc danh sách lớp đã thay đổi trong khi đọc Excel. Hãy nhập lại.");
    const c = targetClass;
    const roster = reconcileRoster(c.students, chosen.records);
    let missing = c.students.filter(
      (s) => !roster.some((r) => r.id === s.id),
    );
    if (
      missing.length &&
      missing.some((s) => hasStudentReferences(c, s.id))
    )
      throw Error(
        "Danh sách mới thiếu học sinh đã có dữ liệu biểu mẫu. Hãy giữ học sinh trong danh sách để bảo toàn liên kết hồ sơ.",
      );
    c.students = roster;
    if (!save()) throw Error("Chưa lưu được danh sách. Hãy kiểm tra bộ nhớ và xuất bản sao dữ liệu.");
    render();
    toast(`Đã nhập ${roster.length} học sinh từ sheet ${chosen.sh}.`);
  } catch (err) {
    console.error(err);
    appAlert("Không thể nhập danh sách: " + err.message);
  }
}

function reconcileRoster(existing, records) {
  const used = new Set(), codes = new Set();
  const names = new Map();
  for (const record of records) {
    const key = String(record.name || "").trim().toLowerCase();
    const group = names.get(key) || [];
    group.push(record);
    names.set(key, group);
  }
  for (const group of names.values()) {
    if (group.length > 1 && group.some(record => !String(record.code || "").trim()))
      throw Error("Học sinh cùng tên cần có mã học sinh để phân biệt.");
  }
  return records.map(record => {
    const name = String(record.name || "").trim();
    const code = String(record.code || "").trim();
    if (code && codes.has(code)) throw Error("Tệp Excel có mã học sinh trùng.");
    if (code) codes.add(code);
    let matches = code ? existing.filter(s => s.code === code) : [];
    if (!matches.length) {
      matches = existing.filter(s => s.name.trim().toLowerCase() === name.toLowerCase() && (!code || !s.code));
    }
    if (matches.length > 1) throw Error("Không thể phân biệt học sinh cùng tên. Hãy bổ sung mã học sinh.");
    const id = matches[0]?.id || newID();
    if (used.has(id)) throw Error("Tệp Excel có dòng học sinh trùng hoặc thiếu mã phân biệt.");
    used.add(id);
    return {id, name, code};
  });
}
