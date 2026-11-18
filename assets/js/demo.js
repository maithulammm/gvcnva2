"use strict";

// Explicit offline-only synthetic example data.

async function demoData() {
  if (isRolePreview()) return;
  if (cloud.ready) {
    toast("Dữ liệu minh họa chỉ dùng trong chế độ cục bộ.");
    return;
  }
  const c = cls("6A1");
  if (
    c.students.length &&
    !await appConfirm("Lớp 6A1 đã có dữ liệu. Thay bằng dữ liệu demo giả lập?")
  )
    return;
  appData.classes["6A1"] = {
    ...defaultSchool().classes["6A1"],
    teacher: "Giáo viên minh họa",
    email: "",
    students: Array.from({ length: 28 }, (_, i) => ({
      id: "S" + String(i + 1).padStart(3, "0"),
      name: "Học sinh " + String(i + 1).padStart(2, "0"),
      code: "",
    })),
    months: {},
    profiles: [],
    audit: [],
  };
  let x = cls("6A1");
  let m = mdata(x, "T11/2026");
  x.students.forEach((s, i) => {
    m.schedule[s.id] = {
      priority: i < 5,
      goal: "Trao đổi về mục tiêu học tập và hoạt động lớp",
      planTime: `${String(i + 2).padStart(2, "0")}/11, 14:00–14:25; phòng GVCN`,
      status: "Chưa gặp",
      note: "",
    };
  });
  for (let i = 0; i < 24; i++) {
    let s = x.students[i];
    m.meetings.push({
      id: newID(),
      studentId: s.id,
      actual: `${String(i + 2).padStart(2, "0")}/11, 14:00–14:25, phòng GVCN`,
      concern: "Mong muốn phát triển thói quen chuẩn bị bài",
      participation:
        i % 7 === 0
          ? "Từ 2/5 lên 4/5 ngày chuẩn bị bài"
          : "Lần đầu trao đổi",
      progressEvidence: i % 7 === 0 ? "Có" : "Chưa đủ căn cứ",
      goal: "Chuẩn bị bài đủ 4/5 ngày trong 2 tuần",
      action: "HS dùng checklist, GVCN kiểm tra sau 2 tuần",
      cooperation: i % 3 === 0 ? "GVBM phối hợp theo dõi" : "Chưa cần",
      needsCoop: i % 3 === 0 ? "Có" : "Không",
      evidence: `6A1-11-GG-${String(i + 1).padStart(2, "0")}`,
      profileId: "",
      profileProgress: "",
      profileNext: "",
    });
  }
  for (let i of [0, 3]) {
    m.meetings.push({
      ...m.meetings[i],
      id: newID(),
      actual: "27/11, 14:00–14:25, phòng GVCN",
      evidence: `6A1-11-GG-${i === 0 ? "25" : "26"}`,
    });
  }
  for (let i = 0; i < 8; i++) {
    let s = x.students[i % 6];
    m.connections.push({
      id: newID(),
      studentId: s.id,
      date: `2026-11-${String(7 + i).padStart(2, "0")}`,
      channel: i % 2 === 0 ? "Tin nhắn" : "Điện thoại",
      message: "Học sinh chủ động hỗ trợ bạn trong hoạt động nhóm",
      recipient: "Mẹ",
      reply: "Phụ huynh xác nhận đã nhận",
      evidence: `6A1-11-KN-${String(i + 1).padStart(2, "0")}`,
    });
  }
  m.plans.push({
    id: newID(),
    studentId: "S004",
    need: "Muốn quản lý thời gian; biết sử dụng checklist",
    goal: "Nộp đúng hạn tối thiểu 4/5 bài trong 3 tuần",
    action: "HS dùng bảng kiểm hằng ngày; GVCN rà soát thứ Sáu",
    deadline: "30/11/2026",
    cooperation: "GVBM xác minh số bài",
    assessment: "Đối chiếu nhật ký nộp bài ngày 30/11",
    result: "Chưa chốt",
  });
  m.previous.push({
    id: newID(),
    studentId: "S004",
    action: "Học sinh sử dụng bảng kiểm 2 tuần",
    observation: "Tăng từ 2/5 lên 4/5 bài nộp đúng hạn",
    next: "Duy trì trong 3 tuần tiếp",
  });
  let p = {
    id: newID(),
    studentId: "S001",
    code: "6A1-11-CN-01",
    startMonth: "T11/2026",
    strength: "Chủ động trao đổi và biết dùng bảng kiểm",
    concern: "Muốn giảm việc quên đồ dùng học tập",
    goal: "Từ 2/5 lên ít nhất 4/5 ngày chuẩn bị đủ đồ trong 3 tuần",
    result: "Đang theo dõi",
    progress: "",
    next: "",
  };
  x.profiles.push(p);
  m.meetings[0].profileId = p.id;
  m.meetings[0].profileProgress =
    "Bước đầu xác định mục tiêu và cách thực hiện";
  m.meetings[0].profileNext = "Kiểm tra lại vào 19/11/2026";
  ui.classId = "6A1";
  ui.grade = "6";
  ui.month = "T11/2026";
  ui.page = "dashboard";
  markChanged();
  toast("Đã nạp dữ liệu DEMO giả lập cho lớp 6A1.");
}
