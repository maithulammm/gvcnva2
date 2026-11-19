"use strict";

// Report submission, review, approval and return.

async function transition(classId, target) {
  if (isRolePreview()) return;
  if (cloud.ready) {
    await cloudTransition(classId, target);
    return;
  }
  let c = cls(classId),
    m = mdata(c, ui.month),
    prev = m.approval?.state || "draft";
  if (
    target === "submitted" &&
    (!hasAppRole("gvcn") || viewAssignment()?.classId !== classId)
  )
    return;
  if(target==='reviewed')return;
  if(['approved','returned'].includes(target)&&(!hasAppRole('bgh')||!['submitted','reviewed'].includes(prev)))return;
  if (target === "submitted") {
    let v = validations(c, ui.month);
    if (!v.hasData) {
      appAlert("Chưa có dữ liệu tháng để gửi báo cáo.");
      return;
    }
    if (v.errors.length) {
      appAlert(
        `Còn ${v.errors.length} lỗi bắt buộc. Vui lòng hoàn thiện trước khi gửi.`,
      );
      return;
    }
    if (
      v.warnings.length &&
      !await appConfirm(`Có ${v.warnings.length} chú ý. Tiếp tục gửi báo cáo?`)
    )
      return;
  }
  let note = "";
  if(target==='returned') {
    const answer=await appPrompt('Ghi lý do yêu cầu bổ sung (không ghi thông tin riêng tư HS):');
    if(answer===null)return;
    note=answer.trim();
    if(!note){appAlert('Cần nhập lý do trả bổ sung.');return;}
  }
  if (
    target !== "returned" &&
    !await appConfirm(`Xác nhận chuyển trạng thái: ${stageName(target)}?`)
  )
    return;
  let actor = auth.email;
  let event = {
    state: target,
    actor,
    note,
    at: new Date().toLocaleString("vi-VN"),
    date: new Date().toLocaleDateString("vi-VN"),
  };
  m.approval.state = target;
  m.approval.history = [...(m.approval.history || []), event];
  c.audit.push({ month: ui.month, ...event });
  save();
  toast("Đã cập nhật trạng thái bản demo.");
  render();
}

async function cloudTransition(id, target) {
  if (isRolePreview()) return;
  if (cloud.busy) return;
  let note = "";
  if (target === "returned") {
    const answer = await appPrompt("Lý do yêu cầu bổ sung:");
    if (answer === null) return;
    note = answer.trim();
    if (!note) {
      appAlert("Cần nhập lý do trả bổ sung.");
      return;
    }
  } else if (
    !await appConfirm("Xác nhận chuyển trạng thái: " + stageName(target) + "?")
  )
    return;
  try {
    await flushCloud();
    cloud.busy = true;
    try {
      useBootstrap(
        await databaseRequest("/classes/" + id + "/transition", "POST", {
          month: ui.month,
          target,
          note,
          revision: cloud.revisions[id] || 0,
        }),
      );
    } finally {
      cloud.busy = false;
    }
    render();
    toast("Đã cập nhật trạng thái trên Firebase.");
  } catch (error) {
    appAlert(error.message);
  }
}
