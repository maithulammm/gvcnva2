"use strict";

// Browser-native ZIP/XML workbook operations.

const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8");

function asBytes(v) {
  return typeof v === "string"
    ? encoder.encode(v)
    : v instanceof Uint8Array
      ? v
      : new Uint8Array(v);
}

function crctable() {
  let t = [];
  for (let n = 0; n < 256; n++) {
    let x = n;
    for (let k = 0; k < 8; k++)
      x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
    t[n] = x >>> 0;
  }
  return t;
}

const CRC_TABLE = crctable();

function crc32(arr) {
  let crc = 0xffffffff;
  for (let b of arr) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function put16(v, n) {
  v.push(n & 255, (n >>> 8) & 255);
}

function put32(v, n) {
  put16(v, n);
  put16(v, n >>> 16);
}

function zipStore(source) {
  let files = Object.entries(source).map(([name, data]) => ({
    name,
    bytes: asBytes(data),
    nameBytes: encoder.encode(name),
  }));
  let locals = [],
    centers = [],
    offset = 0;
  let dt = new Date(),
    dosDate =
      (((dt.getFullYear() - 1980) & 127) << 9) |
      (((dt.getMonth() + 1) & 15) << 5) |
      dt.getDate(),
    dosTime =
      (dt.getHours() << 11) |
      (dt.getMinutes() << 5) |
      Math.floor(dt.getSeconds() / 2);
  for (let f of files) {
    let crc = crc32(f.bytes),
      n = f.nameBytes.length,
      s = f.bytes.length;
    let lh = [];
    put32(lh, 0x04034b50);
    put16(lh, 20);
    put16(lh, 0x0800);
    put16(lh, 0);
    put16(lh, dosTime);
    put16(lh, dosDate);
    put32(lh, crc);
    put32(lh, s);
    put32(lh, s);
    put16(lh, n);
    put16(lh, 0);
    let prefix = new Uint8Array([...lh, ...f.nameBytes]);
    locals.push(prefix, f.bytes);
    let ch = [];
    put32(ch, 0x02014b50);
    put16(ch, 20);
    put16(ch, 20);
    put16(ch, 0x0800);
    put16(ch, 0);
    put16(ch, dosTime);
    put16(ch, dosDate);
    put32(ch, crc);
    put32(ch, s);
    put32(ch, s);
    put16(ch, n);
    put16(ch, 0);
    put16(ch, 0);
    put16(ch, 0);
    put16(ch, 0);
    put32(ch, 0);
    put32(ch, offset);
    centers.push(new Uint8Array([...ch, ...f.nameBytes]));
    offset += prefix.length + s;
  }
  let cdSize = centers.reduce((a, x) => a + x.length, 0),
    end = [];
  put32(end, 0x06054b50);
  put16(end, 0);
  put16(end, 0);
  put16(end, files.length);
  put16(end, files.length);
  put32(end, cdSize);
  put32(end, offset);
  put16(end, 0);
  return new Blob([...locals, ...centers, new Uint8Array(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function readZip(buffer) {
  let b = new Uint8Array(buffer),
    dv = new DataView(buffer),
    end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0)
    throw Error(
      "Không tìm thấy danh mục tệp ZIP: file không phải XLSX hợp lệ.",
    );
  let count = dv.getUint16(end + 10, true),
    loc = dv.getUint32(end + 16, true),
    out = {};
  if (count > 3000) throw Error("Tệp Excel có quá nhiều phần.");
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(loc, true) !== 0x02014b50)
      throw Error("Cấu trúc ZIP bị lỗi.");
    let flag = dv.getUint16(loc + 8, true),
      method = dv.getUint16(loc + 10, true),
      sz = dv.getUint32(loc + 20, true),
      fn = dv.getUint16(loc + 28, true),
      ex = dv.getUint16(loc + 30, true),
      com = dv.getUint16(loc + 32, true),
      off = dv.getUint32(loc + 42, true);
    let name = decoder.decode(b.subarray(loc + 46, loc + 46 + fn));
    loc += 46 + fn + ex + com;
    if (name.endsWith("/")) continue;
    if (flag & 1)
      throw Error("Không hỗ trợ tệp Excel mã hóa bằng mật khẩu.");
    if (![0, 8].includes(method))
      throw Error("Định dạng nén XLSX không được hỗ trợ.");
    if (dv.getUint32(off, true) !== 0x04034b50)
      throw Error("Bị lỗi phần dữ liệu ZIP.");
    let po =
      off +
      30 +
      dv.getUint16(off + 26, true) +
      dv.getUint16(off + 28, true);
    let packed = b.slice(po, po + sz);
    if (method === 0) out[name] = packed;
    else {
      if (typeof DecompressionStream === "undefined")
        throw Error(
          "Trình duyệt không hỗ trợ giải nén XLSX offline. Hãy sử dụng Chrome hoặc Edge bản mới.",
        );
      let stream = new Blob([packed])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      out[name] = new Uint8Array(
        await new Response(stream).arrayBuffer(),
      );
    }
  }
  return out;
}

function b64bytes(base64) {
  let s = atob(base64.replace(/\s+/g, ""));
  let b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

function xmlparse(s) {
  let x = new DOMParser().parseFromString(s, "application/xml");
  if (x.getElementsByTagName("parsererror").length)
    throw Error("Không đọc được cấu trúc XML trong tệp Excel.");
  return x;
}

const S_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function colIndex(s) {
  let n = 0;
  for (let c of s) n = n * 26 + c.charCodeAt(0) - 64;
  return n;
}

function getSheetNamePaths(files) {
  let wb = xmlparse(decoder.decode(files["xl/workbook.xml"])),
    rels = xmlparse(decoder.decode(files["xl/_rels/workbook.xml.rels"]));
  let relMap = {};
  for (let a of rels.getElementsByTagName("*"))
    if (a.localName === "Relationship")
      relMap[a.getAttribute("Id")] = a.getAttribute("Target");
  let entries = [];
  for (let sh of wb.getElementsByTagNameNS(S_NS, "sheet")) {
    let id =
      sh.getAttribute("r:id") ||
      sh.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      );
    let target = relMap[id];
    if (!target) continue;
    let path = target.startsWith("/")
      ? target.slice(1)
      : target.startsWith("xl/")
        ? target
        : "xl/" + target;
    path = path.split(String.fromCharCode(92)).join("/");
    entries.push({ name: sh.getAttribute("name"), path });
  }
  return entries;
}

function changeCells(original, updates) {
  let doc = xmlparse(decoder.decode(original));
  let sheets = doc.getElementsByTagNameNS(S_NS, "sheetData");
  if (!sheets.length) return original;
  let rows = new Map(
    [...sheets[0].getElementsByTagNameNS(S_NS, "row")].map((x) => [
      +x.getAttribute("r"),
      x,
    ]),
  );
  for (let [addr, val] of Object.entries(updates)) {
    if (val === null || val === undefined) continue;
    let match = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!match) continue;
    let rowIndex = +match[2],
      col = colIndex(match[1]);
    let row = rows.get(rowIndex);
    if (!row) continue;
    let cell = [...row.children].find(
      (x) => x.localName === "c" && x.getAttribute("r") === addr,
    );
    if (!cell) {
      cell = doc.createElementNS(S_NS, "c");
      cell.setAttribute("r", addr);
      let after = [...row.children].find(
        (x) =>
          x.localName === "c" &&
          colIndex((x.getAttribute("r") || "").replace(/\d/g, "")) > col,
      );
      row.insertBefore(cell, after || null);
    }
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    if (typeof val === "number" && isFinite(val)) {
      cell.setAttribute("t", "n");
      let e = doc.createElementNS(S_NS, "v");
      e.textContent = String(val);
      cell.appendChild(e);
    } else {
      cell.setAttribute("t", "inlineStr");
      let e = doc.createElementNS(S_NS, "is"),
        t = doc.createElementNS(S_NS, "t");
      t.setAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "xml:space",
        "preserve",
      );
      t.textContent = String(val);
      e.appendChild(t);
      cell.appendChild(e);
    }
  }
  return encoder.encode(new XMLSerializer().serializeToString(doc));
}

function excelDate(s) {
  if (!s) return null;
  let d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}

function limitRows(label, items, max) {
  if (items.length > max)
    throw Error(
      `${label}: có ${items.length} dòng, nhưng mẫu Excel chỉ chứa ${max}. Không xuất cắt mất dữ liệu.`,
    );
}

function inlineCell(addr, value, style = 0) {
  if (value === null || value === undefined || value === "") return "";
  let num = typeof value === "number" && isFinite(value);
  return `<c r="${addr}" s="${style}" ${num ? 't="n"' : 't="inlineStr"'}>${num ? "<v>" + value + "</v>" : "<is><t>" + xmlEscape(value) + "</t></is>"}</c>`;
}

function xmlEscape(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}

function spreadsheetXml(rows) {
  let out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="17" customWidth="1"/><col min="2" max="2" width="25" customWidth="1"/><col min="3" max="3" width="28" customWidth="1"/><col min="4" max="30" width="15" customWidth="1"/></cols><sheetData>',
  ];
  rows.forEach((cells, i) => {
    let cellXml = cells
      .map((v, j) => {
        let col = "";
        let k = j + 1;
        while (k) {
          k--;
          col = String.fromCharCode(65 + (k % 26)) + col;
          k = Math.floor(k / 26);
        }
        return inlineCell(
          col + (i + 1),
          v,
          i === 0 ? 1 : i % 2 === 0 ? 2 : 0,
        );
      })
      .join("");
    out.push(
      `<row r="${i + 1}" ht="${i === 0 ? 33 : 20}" customHeight="1">${cellXml}</row>`,
    );
  });
  out.push(
    '</sheetData><autoFilter ref="A1:' +
      String.fromCharCode(65 + Math.min(rows[0].length - 1, 25)) +
      rows.length +
      '"/></worksheet>',
  );
  return out.join("");
}

function simpleWorkbook(sheetEntries) {
  let files = {};
  files["[Content_Types].xml"] =
    '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheetEntries
      .map(
        (x, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    "</Types>";
  files["_rels/.rels"] =
    '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files["xl/workbook.xml"] =
    '<?xml version="1.0" encoding="utf-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheetEntries
      .map(
        (x, i) =>
          `<sheet name="${xmlEscape(x[0])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("") +
    "</sheets></workbook>";
  files["xl/_rels/workbook.xml.rels"] =
    '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheetEntries
      .map(
        (x, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  files["xl/styles.xml"] =
    '<?xml version="1.0" encoding="utf-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF215B72"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F7F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>';
  sheetEntries.forEach(
    ([name, rows], i) =>
      (files[`xl/worksheets/sheet${i + 1}.xml`] = spreadsheetXml(rows)),
  );
  return zipStore(files);
}
