"use strict";

// Bind DOM events and start the app after all deferred feature scripts.

$("entryForm").addEventListener("submit", submitForm);
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

// Firebase adapter: keep the Microsoft sign-in flow and the legacy DATA_KEY intact.
// Only the verified Microsoft session is sent to our API; no database secrets in HTML.

$("authDatabaseEnabled").checked = readCloudConfig().enabled;

$("saveDatabaseConfig").addEventListener("click", async () => {
  localStorage.setItem(
    CLOUD_CONFIG_KEY,
    JSON.stringify({ enabled: $("authDatabaseEnabled").checked }),
  );
  await initializeMsLogin();
});

$("saveAuthConfig").addEventListener("click", async () => {
  const tenantId = $("authTenant").value.trim(),
    clientId = $("authClient").value.trim();
  if (!isGuid(tenantId) || !isGuid(clientId)) {
    loginStatus(
      "Tenant ID và Application (Client) ID phải là chuỗi GUID hợp lệ của ứng dụng Microsoft Entra.",
      true,
    );
    return;
  }
  localStorage.setItem(
    MICROSOFT_CONFIG_KEY,
    JSON.stringify({ tenantId, clientId }),
  );
  auth.client = null;
  await initializeMsLogin();
});

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

$("authRedirect").value = currentRedirectUri();

$("copyRedirectUri").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentRedirectUri());
    loginStatus(
      "Đã sao chép Redirect URI. Dán vào cấu hình Authentication → SPA của Entra.",
    );
  } catch {
    $("authRedirect").focus();
    $("authRedirect").select();
    loginStatus(
      "Hãy sao chép URI đang được chọn rồi thêm vào cấu hình Entra.",
    );
  }
});

initializeMsLogin();
