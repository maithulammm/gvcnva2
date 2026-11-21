"use strict";

// JSON backup, recovery and migration of local records.

function jsonBackup() {
  let scope =
    classesForAssignment();
  let payload = {
    ...appData,
    classes: Object.fromEntries(
      scope.map((id) => [id, appData.classes[id]]),
    ),
    backupAt: new Date().toISOString(),
  };
  downloadFile(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `GVCN_SaoLuu_${new Date().toISOString().slice(0, 10)}.json`,
  );
  toast("Đã xuất JSON sao lưu. Giữ tệp ở nơi an toàn.");
}

async function importBackup(e) {
  if (isRolePreview()) { e.target.value = ""; return; }
  let files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  if (cloud.ready) {
    appAlert(
      "Khi dùng Firebase, hãy chuyển dữ liệu cũ tại trang Dữ liệu Firebase. Hệ thống chỉ nhập vào lớp còn trống để bảo vệ dữ liệu hiện có.",
    );
    return;
  }
  if (!hasAppRole("admin") && !hasAppRole("gvcn")) {
    appAlert("Vai trò không được nhập bản sao lưu.");
    return;
  }
  let total = 0;
  if (
    !await appConfirm(
      `Ghép ${files.length} tệp sao lưu JSON vào dữ liệu cục bộ? Các lớp trùng mã sẽ được thay bằng dữ liệu trong file nhập.`,
    )
  )
    return;
  for (let f of files) {
    try {
      let j = JSON.parse(await f.text());
      if (j.schema !== 2 || !j.classes)
        throw Error("Không đúng định dạng sao lưu v2.");
      let source = Object.entries(j.classes).filter(
        ([id, c]) =>
          CLASSES.includes(id) &&
          c?.students?.length &&
          (hasAppRole("admin") || id === ui.classId),
      );
      for (let [id, c] of source) {
        appData.classes[id] = c;
        total++;
      }
    } catch (err) {
      appAlert(`Không nhập được ${f.name}: ${err.message}`);
    }
  }
  save();
  render();
  toast(`Đã nạp dữ liệu của ${total} lớp từ bản sao lưu.`);
}

function exportLegacyData() {
  if (!hasAppRole("admin")) return;
  const original = localStorage.getItem(DATA_KEY);
  if (!original) {
    toast("Không có bản dữ liệu cục bộ ban đầu.");
    return;
  }
  downloadFile(
    new Blob([original], { type: "application/json;charset=utf-8" }),
    "GVCN_CucBo_TruocFirebase.json",
  );
}

function exportPendingDrafts() {
  const raw = localStorage.getItem(cloudCacheKey() + "_PENDING");
  if (!raw) {
    toast("Không có bản lưu chờ đồng bộ.");
    return;
  }
  downloadFile(
    new Blob([raw], { type: "application/json;charset=utf-8" }),
    "GVCN_ChoDongBo.json",
  );
}

async function migrateLegacyData() {
  if (!cloud.ready || !canEditSetup()) return;
  let original;
  try {
    original = JSON.parse(localStorage.getItem(DATA_KEY));
  } catch {
    appAlert(
      "Bản dữ liệu cục bộ không đọc được. Hãy xuất bản sao để kiểm tra.",
    );
    return;
  }
  if (original?.schema !== 2 || !original.classes) {
    appAlert("Không có dữ liệu cục bộ schema 2 để chuyển.");
    return;
  }
  const ids = CLASSES.filter((id) => {
    const c = original.classes[id];
    return (
      c &&
      ((c.students || []).length ||
        (c.profiles || []).length ||
        Object.keys(c.months || {}).length)
    );
  });
  if (!ids.length) {
    toast("Không có hồ sơ cục bộ cần chuyển.");
    return;
  }
  if (
    !await appConfirm(
      `Chuyển dữ liệu cục bộ của ${ids.length} lớp lên Firebase? Chỉ nhập vào lớp trống; dữ liệu cục bộ ban đầu được giữ nguyên.`,
    )
  )
    return;
  let count = 0,
    skipped = 0;
  try {
    await flushCloud();
    cloud.busy = true;
    for (const id of ids) {
      const c = appData.classes[id];
      if (
        c.students.length ||
        c.profiles.length ||
        Object.keys(c.months).some(
          (m) =>
            classFingerprint({ ...c, months: { [m]: c.months[m] } }) !==
            classFingerprint({ ...c, months: {} }),
        )
      ) {
        skipped++;
        continue;
      }
      const result = await databaseRequest("/import/" + id, "POST", {
        classData: original.classes[id],
        revision: cloud.revisions[id] || 0,
      });
      appData.classes[id] = result.data;
      cloud.revisions[id] = result.revision;
      cloud.baselines[id] = classFingerprint(result.data);
      count++;
    }
    useBootstrap(await loadCloudBootstrap());
    cloud.busy = false;
    render();
    toast(
      `Đã chuyển ${count} lớp; bỏ qua ${skipped} lớp đang có dữ liệu.`,
    );
  } catch (error) {
    appAlert(`Đã chuyển ${count} lớp trước khi dừng: ${error.message}`);
  } finally {
    cloud.busy = false;
    updateStorageNotice();
  }
}
