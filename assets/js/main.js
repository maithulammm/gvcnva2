"use strict";

// Bind DOM events and start the app after all deferred feature scripts.

$("entryForm").addEventListener("submit", submitForm);
$("entryForm").addEventListener("input", e => saveEditorDraft(e.currentTarget));
$("entryForm").addEventListener("change", e => saveEditorDraft(e.currentTarget));
// Không còn nút tự chọn vai trò: vai trò lấy từ danh sách phân quyền sau đăng nhập Microsoft.

$("gradeSel").addEventListener("change", (e) => {
  if (!auth.account || (!hasAppRole("bgh") && !hasAppRole("admin") && !hasAppRole("lead"))) return;
  ui.grade = e.target.value;
  ui.classId = (GRADES[ui.grade] || ["6A1"])[0];
  if (!hasAppRole("admin") && !hasAppRole("bgh"))
    ui.classId =
      classesForAssignment().find((id) => gradeText(id) === ui.grade) ||
      ui.classId;
  render();
});

$("classSel").addEventListener("change", (e) => {
  if (!auth.account || (hasAppRole("gvcn") && !hasAppRole("lead") && !hasAppRole("admin"))) return;
  if (!classesForAssignment().includes(e.target.value))
    return;
  ui.classId = e.target.value;
  if (hasAppRole("lead")) ui.grade = gradeText(e.target.value);
  ui.profileId = "";
  render();
});

$("monthSel").addEventListener("change", (e) => {
  ui.month = e.target.value;
  render();
});

// All Excel import/export operations use browser-native APIs; no network dependencies.

$("xlsxInput").addEventListener("change", importRoster);

$("directoryInput").addEventListener("change", importDirectoryFile);

$("backupInput").addEventListener("change", importBackup);

$("msLoginBtn").addEventListener("click", async () => {
  if (!auth.client) {
    loginStatus("Chưa có cấu hình đăng nhập hợp lệ.", true);
    return;
  }
  try {
    $("msLoginBtn").disabled = true;
    await auth.client.loginRedirect({
      scopes: ["openid", "profile", "email"],
      prompt: "select_account",
    });
  } catch (e) {
    loginStatus(microsoftErrorText(e), true);
    $("msLoginBtn").disabled = false;
  }
});

$("msLogoutBtn").addEventListener("click", async () => {
  const account = auth.account,
    client = auth.client;
  lockUi();
  loginStatus("Đang đăng xuất khỏi phiên đăng nhập Microsoft…");
  try {
    if (client && account)
      await client.logoutRedirect({
        account,
        postLogoutRedirectUri: currentRedirectUri(),
      });
    else await initializeMsLogin();
  } catch (e) {
    loginStatus(
      "Đã khóa giao diện; không thể hoàn tất đăng xuất Microsoft: " +
        String(e.message || e),
      true,
    );
  }
});

initializeMsLogin();
