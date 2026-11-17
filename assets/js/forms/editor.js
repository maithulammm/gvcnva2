"use strict";

// Shared form editor and record mutations.

function rowAction(type, id) {
  return editable()
    ? `${btn("Sửa", `openModal('${type}','${id}')`, "small")} ${btn("Xóa", `removeRecord('${type}','${id}')`, "small danger")}`
    : "—";
}

function lookup(type, id) {
  if (type === "teacherAccount") return (appData.teachers || {})[id];
  let c = cls(),
    m = mdata();
  if (type === "teacher") return c;
  if (type === "student") return c.students.find((x) => x.id === id);
  if (type === "m01") return m.schedule[id] || {};
  if (type === "profile") return c.profiles.find((x) => x.id === id);
  if (type === "m05detail")
    return Object.values(c.months)
      .flatMap((mm) => mm.meetings || [])
      .find((x) => x.id === id);
  return m[{ m02: "meetings", m03: "connections" }[type] || type]?.find(
    (x) => x.id === id,
  );
}

function openModal(type, id = "") {
  if (type === "teacher") {
    openClassTeacher();
    return;
  }
  if (cloud.busy) {
    toast("Đang xử lý dữ liệu. Vui lòng chờ.");
    return;
  }
  if (type === "teacherAccount" && auth.assignment?.role !== "admin")
    return;
  if (
    (["teacherAccount", "student"].includes(type) && !canEditSetup()) ||
    (!["teacherAccount", "student"].includes(type) && !editable())
  ) {
    toast("Biểu mẫu đã khóa hoặc vai trò không có quyền sửa.");
    return;
  }
  if (type === "teacher" && ui.role !== "admin" && ui.role !== "gvcn")
    return;
  let c = cls(),
    rec = lookup(type, id) || {},
    opts = FIELDS[type];
  if (type === "teacherAccount" && !id)
    Object.assign(rec, {
      active: true,
      classId: c.id,
      name: c.teacher,
      email: c.email,
    });
  if (!opts) return;
  ui.editing = { type, id };
  $("modalTitle").textContent =
    MODAL_TITLES[type] + (id ? " · Chỉnh sửa" : "");
  let h = "";
  if (type === "m01") {
    h += `<div class="footnote wide">Học sinh: <b>${esc(studentName(c, id))}</b>. Trạng thái Đã gặp được xác định tự động theo Mẫu 02.</div>`;
  }
  if (type === "m05detail") {
    h += `<div class="footnote wide">Lượt gặp: ${esc(rec.actual || "")} · Mã xác nhận ${esc(rec.evidence || "Chưa có")}</div>`;
  }
  for (let [key, label, kind, required, options] of opts) {
    let value = rec[key] ?? (kind === "boolean" ? false : "");
    let control = "";
    let req = required ? "required" : "";
    if (kind === "boolean") {
      control = `<select name="${key}"><option value="0" ${value ? "" : "selected"}>Không</option><option value="1" ${value ? "selected" : ""}>Có</option></select>`;
    } else if (kind === "students") {
      control = `<select name="${key}" ${req}><option value="">— Chọn học sinh —</option>${c.students.map((s) => `<option value="${s.id}" ${value === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
    } else if (kind === "classes") {
      control = `<select name="${key}" ${req}>${CLASSES.map((classId) => `<option value="${classId}" ${value === classId ? "selected" : ""}>${classId}</option>`).join("")}</select>`;
    } else if (kind === "profiles") {
      control = `<select name="${key}"><option value="">— Không liên kết —</option>${c.profiles.map((p) => `<option value="${p.id}" ${value === p.id ? "selected" : ""}>${esc(p.code)} · ${esc(studentName(c, p.studentId))}</option>`).join("")}</select>`;
    } else if (kind === "months") {
      control = `<select name="${key}">${MONTHS.map((s) => `<option value="${s}" ${(value || ui.month) === s ? "selected" : ""}>${s}</option>`).join("")}</select>`;
    } else if (kind === "select") {
      control = `<select name="${key}" ${req}><option value="" ${!value ? "selected" : ""}>— Chọn —</option>${options.map((s) => `<option value="${esc(s)}" ${value === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
    } else if (kind === "textarea") {
      control = `<textarea name="${key}" ${req} placeholder="${esc(label)}">${esc(value)}</textarea>`;
    } else
      control = `<input name="${key}" type="${kind}" value="${esc(value)}" ${req} placeholder="${esc(label)}">`;
    h += `<div class="field ${kind === "textarea" ? "wide" : ""}"><label>${esc(label)}${required ? " *" : ""}</label>${control}</div>`;
  }
  if (type === "m02")
    h += `<div class="footnote wide">Muốn cập nhật diễn biến Mẫu 05: chọn phiếu phù hợp và bổ sung hai trường M05, sau đó xem tiến trình theo phiếu cá nhân.</div>`;
  $("modalBody").innerHTML = `<div class="fieldgrid">${h}</div>`;
  $("editor").showModal();
}

async function submitForm(e) {
  e.preventDefault();
  if (!ui.editing) return;
  let { type, id } = ui.editing;
  if (
    cloud.busy ||
    (["student", "teacherAccount"].includes(type)
      ? !canEditSetup()
      : !editable())
  ) {
    toast("Không có quyền sửa hoặc biểu mẫu đã khóa.");
    return;
  }
  let fd = new FormData(e.currentTarget),
    fields = FIELDS[type],
    record = {};
  fields.forEach(([key, label, kind]) => {
    let v = fd.get(key);
    record[key] =
      kind === "boolean"
        ? v === "1"
        : typeof v === "string"
          ? v.trim()
          : "";
  });
  if (type === "teacherAccount") {
    $("modalSave").disabled = true;
    try {
      await saveTeacherAccount({ ...record, id });
      $("editor").close();
      ui.editing = null;
      render();
      toast(
        cloud.ready
          ? "Đã lưu GVCN và phân công trên Firebase."
          : "Đã lưu GVCN và phân công trên trình duyệt.",
      );
    } catch (error) {
      alert(error.message);
    } finally {
      $("modalSave").disabled = false;
    }
    return;
  }
  let c = cls(),
    m = mdata();
  if (type === "teacher") {
    c.teacher = record.teacher;
    c.email = record.email;
  } else if (type === "student") {
    if (!id && c.students.length >= 28) {
      alert("Đã đủ 28 học sinh theo sức chứa file mẫu.");
      return;
    }
    if (
      c.students.some(
        (x) =>
          ((record.code && x.code === record.code) ||
            (x.name.toLowerCase() === record.name.toLowerCase() &&
              (!record.code || !x.code))) &&
          x.id !== id,
      )
    ) {
      alert(
        "Tên hoặc mã học sinh trùng. Hai học sinh cùng tên cần mã học sinh riêng để phân biệt.",
      );
      return;
    }
    if (id) Object.assign(lookup("student", id), record);
    else c.students.push({ ...record, id: newID() });
  } else if (type === "m01") {
    m.schedule[id] = { ...record };
  } else if (type === "m05detail") {
    let meeting = lookup(type, id);
    Object.assign(meeting, record);
  } else if (type === "profile") {
    if (!id && c.profiles.length >= 40) {
      alert("File Excel mẫu chỉ có tối đa 40 hồ sơ M05/lớp.");
      return;
    }
    if (c.profiles.some((x) => x.code === record.code && x.id !== id)) {
      alert("Mã phiếu M05 đã tồn tại.");
      return;
    }
    if (id) Object.assign(lookup(type, id), record);
    else c.profiles.push({ ...record, id: newID() });
    ui.profileId = id || c.profiles.at(-1).id;
  } else {
    if (type === "m02" && record.profileId) {
      let profile = c.profiles.find((x) => x.id === record.profileId);
      if (!profile || profile.studentId !== record.studentId) {
        alert("Phiếu M05 phải thuộc đúng học sinh của lượt gặp.");
        return;
      }
      if (!record.profileProgress || !record.profileNext) {
        alert(
          "Đã liên kết M05: cần nhập Tiến bộ/khó khăn và Mốc kiểm tra tiếp theo.",
        );
        return;
      }
    }
    if (id) Object.assign(lookup(type, id), record);
    else
      m[{ m02: "meetings", m03: "connections" }[type] || type].push({
        ...record,
        id: newID(),
      });
  }
  $("editor").close();
  ui.editing = null;
  markChanged();
}

function removeRecord(type, id) {
  if (cloud.busy) return;
  if (!editable() && type !== "student") return;
  if (!canEditSetup() && type === "student") return;
  let c = cls(),
    m = mdata();
  let r = lookup(type, id);
  if (!r) return;
  let name = r.studentId ? studentName(c, r.studentId) : r.name || r.code;
  if (
    !confirm(
      `Xóa mục "${name}"? Thao tác này không thể hoàn tác nếu chưa có bản sao lưu.`,
    )
  )
    return;
  if (type === "student") {
    if (hasStudentReferences(c, id)) {
      alert(
        "Học sinh đã có dữ liệu liên quan. Hãy giữ hồ sơ và cập nhật danh sách theo quy trình quản trị, tránh mất dữ liệu.",
      );
      return;
    }
    c.students = c.students.filter((x) => x.id !== id);
    delete m.schedule[id];
  } else if (type === "profile") {
    if (
      Object.values(c.months).some((mm) =>
        (mm.meetings || []).some((x) => x.profileId === id),
      )
    ) {
      alert("Hãy bỏ liên kết M05 ở từng lượt M02 trước khi xóa phiếu.");
      return;
    }
    c.profiles = c.profiles.filter((x) => x.id !== id);
    ui.profileId = "";
  } else {
    let key = { m02: "meetings", m03: "connections" }[type] || type;
    m[key] = m[key].filter((x) => x.id !== id);
  }
  markChanged();
}
