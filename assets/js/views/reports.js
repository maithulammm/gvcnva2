"use strict";

// Review and import/export pages.

function renderCheck() {
  let scope = scopedClasses();
  if ((hasAppRole("bgh") || hasAppRole("lead")) && ui.page === "check") {
    return `<div class="section-head"><h2>Danh sách chờ rà soát · ${ui.month}</h2><span class="pill">${scope.length} lớp</span></div><section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Lớp</th><th>GVCN</th><th>Trạng thái</th><th>Lỗi</th><th>Cảnh báo</th><th>Thao tác</th></tr></thead><tbody>${scope
      .map((id) => {
        let c = cls(id),
          m = mdata(c, ui.month),
          v = validations(c, ui.month);
        let action =
          hasAppRole("lead") &&
          m.approval.state === "submitted" &&
          !m.approval.history?.some(
            (event) => event.state === "submitted" && event.actor === auth.email,
          )
            ? btn(
                "Đã rà soát",
                `transition('${id}','reviewed')`,
                "small success",
              )
            : hasAppRole("bgh") && m.approval.state === "reviewed"
              ? btn(
                  "Đã xem xét",
                  `transition('${id}','approved')`,
                  "small success",
                )
              : "";
        const canReturn =
          (hasAppRole("lead") &&
            m.approval.state === "submitted" &&
            !m.approval.history?.some(
              (event) => event.state === "submitted" && event.actor === auth.email,
            )) ||
          (hasAppRole("bgh") && m.approval.state === "reviewed");
        const canSubmit =
          hasAppRole("gvcn") &&
          viewAssignment()?.classId === id &&
          ["draft", "returned"].includes(m.approval.state);
        const submit = canSubmit
          ? btn("Gửi rà soát", `transition('${id}','submitted')`, "small primary")
          : "";
        return `<tr><td><b>${id}</b></td><td>${esc(c.teacher || "—")}</td><td>${statusTag(stageName(m.approval.state))}</td><td>${v.errors.length}</td><td>${v.warnings.length}</td><td>${submit} ${action} ${canReturn ? btn("Trả lại", `transition('${id}','returned')`, "small danger") : "—"}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div></section>`;
  }
  let c = cls(),
    m = mdata(),
    v = validations(c, ui.month),
    state = m.approval?.state || "draft";
  let names = {
    K1: "M01 khớp số HS đã gặp ở M02",
    K2: "M01 trạng thái và ngày giờ thực tế",
    K3: "M02 đủ thông tin từng cuộc gặp",
    K4: "M03 đủ thông tin kết nối",
    K5: "M04 đủ kết quả / kế hoạch hỗ trợ",
    K6: "M05 liên kết đúng học sinh và đủ chi tiết",
    K7: "M01 bao quát sĩ số (khuyến nghị)",
    K9: "M03 có kết nối tích cực trong tháng (khuyến nghị)",
  };
  return `<div class="section-head"><h2>Chốt kiểm tra · lớp ${c.id}</h2>${statusTag(stageName(state))}</div>${kpis(
    [
      [
        "Kiểm tra đạt",
        Object.keys(names).filter((key) => v.codes[key] === "OK").length + "/" + Object.keys(names).length,
        "Tiêu chí đang áp dụng",
      ],
      ["Lỗi cần sửa", v.errors.length, "Không được nộp khi còn lỗi"],
      ["Chú ý", v.warnings.length, "Khuyến nghị bổ sung"],
      [
        "Dữ liệu tháng",
        v.hasData ? "Đã có" : "Trống",
        "Dữ liệu thực tế, không tính tháng trống",
      ],
    ],
  )}<div class="cols2"><div class="card"><h2>Kết quả từng tiêu chí</h2><div class="listchecks marg-top">${Object.entries(
    names,
  )
    .map(
      ([k, name]) =>
        `<div class="check ${v.codes[k] === "OK" ? "ok" : v.codes[k] === "LỖI" ? "bad" : v.codes[k] === "CHÚ Ý" ? "warn" : ""}"><i class="dot"></i><div><b>${k}. ${name}</b><div>${statusTag(v.codes[k])}</div></div></div>`,
    )
    .join(
      "",
    )}</div></div><section class="card"><h2>Cảnh báo và thiếu thông tin</h2><div class="stack marg-top">${[...v.errors, ...v.warnings].map((x) => `<div class="readonly"><b>${esc(x.key)}</b> · ${esc(x.message)}</div>`).join("") || '<div class="readonly">Không phát hiện lỗi trong phạm vi kiểm tra.</div>'}</div><div class="section-head"><h2>Quy trình xác nhận</h2></div><div class="timeline">${(m.approval?.history || []).map((x) => `<div class="tl"><b>${esc(stageName(x.state))}</b><div>${esc(x.actor)} · ${esc(displayDateText(x.at))}</div><small>${esc(x.note || "")}</small></div>`).join("") || '<p class="help">Chưa có lượt xác nhận.</p>'}</div><div class="marg-top">${hasAppRole("gvcn") && viewAssignment()?.classId === c.id && (state === "draft" || state === "returned") ? btn("Gửi khối trưởng rà soát", `transition('${c.id}','submitted')`, "primary") : ""}</div><p class="help">Báo cáo đã gửi chỉ sửa được khi khối trưởng/BGH trả lại.</p></section></div>`;
}

function renderExport() {
  let c = cls();
  let perClass = hasAppRole("gvcn") || hasAppRole("admin");
  return `<div class="section-head"><h2>Đầu ra Excel theo mẫu nhà trường</h2></div>
    <div class="cols2"><section class="card"><h2>Xuất báo cáo và nhập dữ liệu</h2>
    <div class="stack marg-top">${perClass ? btn("⇩ Xuất Excel 15 sheet · " + c.id, "exportClass()", "primary") : ""}
    ${hasAppRole("bgh") || hasAppRole("admin") || hasAppRole("lead") ? btn("⇩ Xuất Excel tổng hợp các lớp", "exportSchool()", "primary") : ""}
    ${canEditSetup() ? btn("⇧ Nhập danh sách học sinh từ Excel", "$('xlsxInput').click()") : ""}
    </div></section>
    <section class="card"><h2>Sao lưu dữ liệu</h2><p class="help">JSON lưu dữ liệu trong phạm vi được phân công, gồm cả bản đang sửa chưa đồng bộ. Giữ bản sao trước khi khôi phục hoặc tải lại dữ liệu máy chủ.</p>
    <div class="stack marg-top">${btn("⇩ Xuất bản sao lưu JSON", "jsonBackup()")}
    ${!cloud.ready && (hasAppRole("admin") || hasAppRole("gvcn")) ? btn("⇧ Nhập / ghép bản sao JSON", "$('backupInput').click()") : ""}
    ${hasAppRole("admin") ? btn("Mở trang dữ liệu Firebase", "navTo('database')") : ""}
    ${hasAppRole("admin") && !cloud.ready ? btn("Nạp dữ liệu minh họa 6A1", "demoData()", "warn") : ""}</div></section></div>
    `;
}
