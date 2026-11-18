"use strict";

// Shared form editor and record mutations.

function rowAction(type, id) {
  return editable()
    ? `${btn("Sửa", `openModal('${type}','${id}')`, "small")} ${btn("Xóa", `removeRecord('${type}','${id}')`, "small danger")}`
    : "—";
}

function lookup(type, id) {
  if (type === "teacherAccount") return (appData.teachers || {})[id];
  if (type === "userRoles")
    return (appData.users || []).find((user) => user.email === id);
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

function openModal(type, id = "", seed = {}) {
  if (type === "teacher") {
    openClassTeacher();
    return;
  }
  if (cloud.busy) {
    toast("Đang xử lý dữ liệu. Vui lòng chờ.");
    return;
  }
  if (
    ["teacherAccount", "userRoles"].includes(type) &&
    !hasAppRole("admin")
  )
    return;
  if (
    (["teacherAccount", "student", "userRoles"].includes(type) &&
      !canEditSetup()) ||
    (!["teacherAccount", "student", "userRoles"].includes(type) &&
      !editable())
  ) {
    toast("Biểu mẫu đã khóa hoặc vai trò không có quyền sửa.");
    return;
  }
  if (type === "teacher" && !hasAppRole("admin") && !hasAppRole("gvcn"))
    return;
  let c = cls(),
    rec = { ...(lookup(type, id) || {}), ...seed },
    opts = FIELDS[type];
  if (type === "teacherAccount" && !id)
    Object.assign(rec, {
      active: true,
      classId: c.id,
      name: c.teacher,
      email: c.email,
    });
  if (type === "userRoles" && !id)
    Object.assign(rec, { name: "", email: "", roles: [], grades: [], active: true });
  if (!opts) return;
  ui.editing = { type, id, seed, classId:c.id, month:ui.month,
    epoch:cloud.epoch, owner:auth.email, classObject:c,
    baseline:stableString(lookup(type,id)||{}) };
  if (type === 'm01') {
    const appointments=studentAppointments(c,ui.month,id);
    const selected=seed.addAppointment?undefined:appointments.find(a=>a.id===(seed.appointmentId||appointments[0]?.id));
    if (!selected&&appointments.length>=3) {ui.editing=null;toast('Học sinh đã đủ 3 lịch hẹn.');return;}
    ui.editing.seed={...seed,appointmentId:selected?.id||'',addAppointment:!selected};
    rec=selected?{...selected}:{};
  }
  if (!id && type === "m02") Object.assign(rec, {
    actual:workToday(), progressEvidence:"Chưa đủ căn cứ", needsCoop:"Không", cooperation:"Chưa cần", ...rec,
  });
  if (!id && type === "m03") rec.date ||= workToday();
  if (type==='m02') ui.editing.meetingInitial=meetingEditorValues(rec);
  const restored = restoreEditorDraft();
  if (restored) Object.assign(rec, restored);
  $("discardDraftBtn").hidden = !DRAFT_TYPES.includes(type);
  $("editorDraftStatus").textContent = restored ? "Đã khôi phục bản nháp trên máy này. Chưa ghi vào báo cáo." : "";
  $("modalTitle").textContent =
    MODAL_TITLES[type] + (id ? " · Chỉnh sửa" : "");
  if (type === "m01") {
    if (!c.students.some(s=>s.id===id)) return;
    ui.editing.schedule = scheduleEditorState(rec);
    $("modalTitle").textContent = "Hẹn gặp · " + studentName(c,id);
    renderScheduleEditor();
    $("editor").showModal();
    $("modalBody").scrollTop = 0;
    return;
  }
  let h = "";
  if(type==='m02') {
    const initial=meetingEditorValues(rec);
    h+=`<div id="previousMeetingPanel" class="wide">${previousMeetingPanel(c,rec.studentId,ui.month,id,initial.actualDateTime)}</div>`;
  }
  if (type === "m05detail") {
    h += `<div class="footnote wide">Lượt gặp: ${esc(rec.actual || "")}</div>`;
  }
  if (type === "userRoles")
    h += `<div class="footnote wide">Phân công GVCN được quản lý trong mục Quản lý GVCN; vai trò GVCN hiện có không thể bị bỏ tại đây.</div>`;
  for (let [key, label, kind, required, options] of opts) {
    let value = rec[key] ?? (kind === "boolean" ? false : "");
    let control = "";
    let req = required ? "required" : "";
    if (type==='m02' && key==='actual') {
      control=meetingTimeControls(rec);
    } else if(type==='m02' && key==='goal') {
      control=meetingGoalControls(rec);
    } else if(type==='m02' && key==='progressEvidence') {
      control=meetingProgressControls(value);
    } else if(type==='m02' && MEETING_SUGGESTIONS[key]) {
      control=meetingSuggestionControls(key,value);
    } else if (kind === "boolean") {
      control = `<select name="${key}"><option value="0" ${value ? "" : "selected"}>Không</option><option value="1" ${value ? "selected" : ""}>Có</option></select>`;
    } else if (kind === "roles") {
      const current = Array.isArray(value) ? value : [];
      control = `<div class="stack">${Object.entries(ROLE_NAMES)
        .map(([role, roleLabel]) => {
          const fixedGvcn = role === "gvcn" && rec.teacherId;
          const managedByTeacherPage = role === "gvcn" && !rec.teacherId;
          return `<label class="filterline"><input type="checkbox" name="roles" value="${role}" ${current.includes(role) ? "checked" : ""} ${fixedGvcn || managedByTeacherPage ? "disabled" : ""}> ${esc(roleLabel)}</label>${fixedGvcn ? `<input type="hidden" name="roles" value="gvcn">` : ""}`;
        })
        .join("")}</div>`;
    } else if (kind === "grades") {
      const current = Array.isArray(value) ? value.map(String) : [];
      control = `<div class="filterline">${Object.keys(GRADES)
        .map(
          (grade) =>
            `<label><input type="checkbox" name="grades" value="${grade}" ${current.includes(grade) ? "checked" : ""}> Khối ${grade}</label>`,
        )
        .join("")}</div>`;
    } else if (type === "userRoles" && key === "email" && id) {
      control = `<input name="${key}" type="email" value="${esc(value)}" readonly>`;
    } else if (kind === "students") {
      control = `<select name="${key}" data-choice-mode="dropdown" ${req} onchange="updateMeetingFields()"><option value="">— Chọn học sinh —</option>${c.students.map((s) => `<option value="${s.id}" ${value === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
    } else if (kind === "classes") {
      control = `<select name="${key}" ${req}>${CLASSES.map((classId) => `<option value="${classId}" ${value === classId ? "selected" : ""}>${classId}</option>`).join("")}</select>`;
    } else if (kind === "profiles") {
      control = `<select name="${key}" onchange="updateMeetingFields()"><option value="">— Không liên kết —</option>${c.profiles.map((p) => `<option value="${p.id}" data-student="${p.studentId}" ${value === p.id ? "selected" : ""}>${esc(p.code)} · ${esc(studentName(c, p.studentId))}</option>`).join("")}</select>`;
    } else if (kind === "months") {
      control = `<select name="${key}">${MONTHS.map((s) => `<option value="${s}" ${(value || ui.month) === s ? "selected" : ""}>${s}</option>`).join("")}</select>`;
    } else if (kind === "select") {
      control = `<select name="${key}" ${type==='m03'&&key==='channel'||type==='profile'&&key==='result'?'data-choice-layout="row-five"':''} ${req} ${key==="needsCoop"?'onchange="updateMeetingFields()"':''}><option value="" ${!value ? "selected" : ""}>— Chọn —</option>${options.map((s) => `<option value="${esc(s)}" ${value === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
    } else if (kind === "textarea") {
      control = `<textarea name="${key}" ${req} placeholder="${esc(label)}">${esc(value)}</textarea>`;
    } else
      control = `<input name="${key}" type="${kind}" value="${esc(value)}" ${req} placeholder="${esc(label)}">`;
    h += `<div data-field="${key}" class="field ${kind === "textarea" || type==='m02'&&['actual','progressEvidence'].includes(key) || type==='m03'&&key==='channel' || type==='profile'&&key==='result' ? "wide" : ""}"><label>${esc(label)}${required ? " *" : ""}</label>${control}</div>`;
  }
  if (type === "m02")
    h += `<div class="footnote wide">Muốn cập nhật diễn biến Mẫu 05: chọn phiếu phù hợp và bổ sung hai trường M05, sau đó xem tiến trình theo phiếu cá nhân.</div>`;
  $("modalBody").innerHTML = `<div class="fieldgrid">${h}</div>`;
  updateMeetingFields();
  refreshButtonChoices($("entryForm"));
  $("editor").showModal();
}

async function submitForm(e) {
  e.preventDefault();
  if (!ui.editing) return;
  if (!editorContextCurrent()) {
    alert("Lớp, tháng hoặc dữ liệu đã thay đổi. Hãy đóng và mở lại biểu mẫu; bản nháp trên máy được giữ lại.");
    return;
  }
  let { type, id } = ui.editing;
  if (
    cloud.busy ||
    (["student", "teacherAccount", "userRoles"].includes(type)
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
      kind === "roles" || kind === "grades" || kind === "choices"
        ? typeof fd.getAll === "function"
          ? fd.getAll(key)
          : v
            ? [v]
            : []
        : kind === "boolean"
        ? v === "1"
        : typeof v === "string"
          ? v.trim()
          : "";
  });
  if(type==='m02') {
    try { record=serializeMeetingInputs(fd,record); }
    catch(error) { alert(error.message);return; }
  }
  if (type === "userRoles") {
    if (!record.roles.includes("lead")) record.grades = [];
    $("modalSave").disabled = true;
    try {
      if ((await saveUserRole({ ...record, id })) === false) return;
      $("editor").close();
      ui.editing = null;
      render();
      toast("Đã cập nhật vai trò trên Firebase.");
    } catch (error) {
      alert(error.message);
    } finally {
      $("modalSave").disabled = false;
    }
    return;
  }
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
  const beforeSave = JSON.parse(JSON.stringify(c));
  if (type === "teacher") {
    c.teacher = record.teacher;
    c.email = record.email;
  } else if (type === "student") {
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
    try { m.schedule[id] = buildScheduleRecord(c,ui.month,id,record); }
    catch(error) { alert(error.message); return; }
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
    if (type === "plans" && ui.editing.seed?.sourcePlanId) {
      const {sourceMonth,sourcePlanId}=ui.editing.seed;
      const source=mdata(c,sourceMonth,false).plans.find(p=>p.id===sourcePlanId);
      if (!source || source.studentId!==record.studentId || source.result==="Đạt" ||
          m.plans.some(p=>p.sourceMonth===sourceMonth&&p.sourcePlanId===sourcePlanId)) {
        alert("Kế hoạch gốc đã thay đổi hoặc đã được chuyển tiếp. Hãy kiểm tra lại.");
        return;
      }
      Object.assign(record,{sourceMonth,sourcePlanId});
    }
    if (type === "m02" && record.needsCoop === "Không") record.cooperation = "Chưa cần";
    const linkedAppointment=type==='m02'?(ui.editing.seed?.appointmentId||(id?lookup(type,id)?.appointmentId:'')):'';
    if (linkedAppointment) {
      const appointment=studentAppointments(c,ui.month,record.studentId).find(a=>a.id===linkedAppointment);
      if (!appointment || m.meetings.some(r=>r.id!==id&&r.appointmentId===appointment.id)) {
        alert('Lịch hẹn đã thay đổi hoặc đã ghi nhận cuộc gặp. Hãy mở lại danh sách.');return;
      }
      record.appointmentId=appointment.id;
    }
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
  if (!save()) {
    Object.assign(c,beforeSave);
    toast("Chưa lưu được dữ liệu. Giữ biểu mẫu mở và xuất bản sao trước khi tải lại.");
    return;
  }
  clearEditorDraft();
  $("editor").close();
  ui.editing = null;
  render();
  toast(cloud.ready ? "Đã lưu, đang đồng bộ dữ liệu…" : "Đã lưu thông tin.");
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
