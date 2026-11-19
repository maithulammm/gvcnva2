"use strict";

// Bind DOM events and start the app after all deferred feature scripts.

$("entryForm").addEventListener("submit", submitForm);
$("entryForm").addEventListener("invalid",event=>{
  let panel=event.target.closest?.('details');
  while(panel){panel.open=true;panel=panel.parentElement?.closest('details');}
},true);
$("appDialogForm").addEventListener("submit",event=>{event.preventDefault();finishAppDialog(true);});
$("appDialog").addEventListener("cancel",event=>{event.preventDefault();finishAppDialog(false);});
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
  const release=beginPageLoading('Đang chuyển đến Microsoft…');
  try {
    $("msLoginBtn").disabled = true;
    await auth.client.loginRedirect({
      scopes: ["openid", "profile", "email"],
      extraScopesToConsent: ["User.Read"],
      prompt: "select_account",
    });
  } catch (e) {
    loginStatus(microsoftErrorText(e), true);
    $("msLoginBtn").disabled = false;
  } finally {
    await waitAfterRequest();release();
  }
});

$("msLogoutBtn").addEventListener("click", logoutMicrosoft);
document.addEventListener?.('pointerdown',event=>{if(!event.target.closest?.('#identityBox,#accountMenu'))closeAccountMenu();});
document.addEventListener?.('focusin',event=>{if(!event.target.closest?.('#identityBox,#accountMenu'))closeAccountMenu();});
$('accountMenuButton').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();if($('accountMenu').hidden)toggleAccountMenu();else $('msLogoutBtn').focus();}});
document.addEventListener?.('keydown',event=>{if(event.key==='Escape'&&!$('accountMenu').hidden){event.preventDefault();closeAccountMenu(true);}});
window.addEventListener?.('resize',()=>closeAccountMenu());
window.addEventListener?.('scroll',()=>closeAccountMenu(),true);
window.addEventListener?.("storage", handleMicrosoftLogoutStorage);
$("requestOverlay").addEventListener("cancel",e=>e.preventDefault());
$("mobileNav").addEventListener("close",()=>{if($('mobileNav').open)return;placeAccountControl(false);$("mobileMenuButton").setAttribute("aria-expanded","false");});
$("editor").addEventListener("close",()=>{if(ui.editing&&auth.account&&appData&&ui.page==='m02')render();});
window.addEventListener?.("resize",updateVisualViewport);
window.visualViewport?.addEventListener("resize",updateVisualViewport);
updateVisualViewport();

initializeMsLogin();
