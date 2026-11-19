"use strict";

// Microsoft Entra ID / MSAL sign-in lifecycle.

function loginStatus(message, error = false) {
  const el = $("authStatus");
  el.textContent = message;
  el.className = "auth-status" + (error ? " error" : "");
  $("msLoginBtn").title = error ? message : "Đăng nhập với Microsoft";
  if(error)appAlert(message);
}

function currentRedirectUri() {
  const { origin, pathname } = window.location;
  const directory = pathname.endsWith("/")
    ? pathname
    : pathname.slice(0, pathname.lastIndexOf("/") + 1);
  return origin + directory + "index.html";
}

function readAuthConfig() {
  return { ...MICROSOFT_CONFIG };
}

function isGuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "").trim(),
  );
}

function safeAccountEmail(account) {
  let claims = account?.idTokenClaims || {};
  let email = String(claims.preferred_username || account?.username || "")
    .toLowerCase()
    .trim();
  return email;
}

function rememberedLogin() {
  try { return JSON.parse(localStorage.getItem(LOGIN_REMEMBER_KEY)); } catch { return null; }
}

function rememberMicrosoftAccount(account,fresh=false) {
  const email=safeAccountEmail(account),accountId=account.homeAccountId||account.localAccountId||email;
  const old=rememberedLogin(),now=Date.now();
  const expiresAt=!fresh&&old?.accountId===accountId&&old.expiresAt>now?old.expiresAt:now+LOGIN_REMEMBER_DAYS*86400000;
  try {
    localStorage.setItem(LOGIN_REMEMBER_KEY,JSON.stringify({accountId,email,expiresAt}));
    localStorage.removeItem(LOGIN_SIGNED_OUT_KEY);
    localStorage.removeItem(LOGIN_REAUTH_KEY);
  } catch { /* Authentication still works when browser storage is unavailable. */ }
}

function cachedMicrosoftAccount(client) {
  try {
    if(localStorage.getItem(LOGIN_SIGNED_OUT_KEY))return null;
    const raw=localStorage.getItem(LOGIN_REMEMBER_KEY),remembered=rememberedLogin();
    if(raw!==null&&(!remembered||!Number.isFinite(remembered.expiresAt)||remembered.expiresAt<=Date.now()))return null;
    const accounts=client.getAllAccounts().filter(a=>{
      const tenant=a.tenantId||a.idTokenClaims?.tid;
      return safeAccountEmail(a).endsWith('@vietanhschool.edu.vn')&&String(tenant).toLowerCase()===auth.config.tenantId.toLowerCase();
    });
    if(remembered)return accounts.find(a=>(a.homeAccountId||a.localAccountId||safeAccountEmail(a))===remembered.accountId&&safeAccountEmail(a)===remembered.email)||null;
    const active=client.getActiveAccount?.();
    return accounts.find(a=>a.homeAccountId&&a.homeAccountId===active?.homeAccountId)||accounts[0]||null;
  } catch { return null; }
}

function microsoftTokenExpired(result) {
  let expiry=result?.idTokenClaims?.exp;
  if(!expiry&&result?.idToken?.split('.').length===3) {
    try { expiry=JSON.parse(atob(result.idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp; } catch { return true; }
  }
  return expiry!==undefined&&(!Number.isFinite(expiry)||expiry<=Date.now()/1000+60);
}

async function acquireMicrosoftIdToken() {
  if(!auth.client||!auth.account)throw Object.assign(new Error('Cần đăng nhập Microsoft trước khi kết nối dữ liệu.'),{status:401});
  const client=auth.client,account=auth.account,epoch=cloud.epoch;
  try {
    for(let attempt=0;attempt<2;attempt++) {
      const result=await client.acquireTokenSilent({account,scopes:['openid','profile','email'],...(attempt?{forceRefresh:true}:{})});
      if(epoch!==cloud.epoch||auth.account!==account)throw Error('Phiên làm việc đã thay đổi.');
      if(typeof result?.idToken==='string'&&result.idToken.trim()&&!microsoftTokenExpired(result))return result.idToken;
    }
    throw Error('Microsoft chưa cấp lại mã phiên đăng nhập.');
  } catch(error) {
    if(epoch!==cloud.epoch)throw error;
    if(/network|connection|offline/i.test(String(error.errorCode||error.code||'')))
      throw Error('Chưa kết nối được Microsoft để làm mới phiên. Kiểm tra mạng rồi thử lại.');
    throw Object.assign(new Error('Phiên Microsoft cần xác thực lại. Bấm “Đăng nhập với Microsoft” để tiếp tục.'),{status:401});
  }
}

async function recoverMicrosoftSession(account) {
  if(!auth.client?.acquireTokenRedirect)return false;
  try {
    if(localStorage.getItem(LOGIN_SIGNED_OUT_KEY))return false;
    const last=Number(localStorage.getItem(LOGIN_REAUTH_KEY)||0);
    if(Date.now()-last<60000)return false;
    localStorage.setItem(LOGIN_REAUTH_KEY,String(Date.now()));
    loginStatus('Đang khôi phục phiên Microsoft…');
    await auth.client.acquireTokenRedirect({account,scopes:['openid','profile','email'],loginHint:safeAccountEmail(account)});
    return true;
  } catch {return false;}
}

async function logoutMicrosoft() {
  const release=beginPageLoading('Đang đăng xuất…');
  const client=auth.client,account=auth.account;
  if($('editor').open)saveEditorDraft();
  if(cloud.ready&&appData) {try {storePendingDrafts();}catch{ /* Keep existing backups. */ }}
  try {
    localStorage.removeItem(LOGIN_REMEMBER_KEY);
    localStorage.removeItem(LOGIN_REAUTH_KEY);
    localStorage.setItem(LOGIN_SIGNED_OUT_KEY,String(Date.now()));
  } catch { /* MSAL will also clear its account/token cache below. */ }
  try {client?.setActiveAccount?.(null);}catch{ /* logoutRedirect also clears active-account state. */ }
  lockUi();
  loginStatus('Đã xóa ghi nhớ đăng nhập trên máy. Đang đăng xuất Microsoft…');
  $('msLoginBtn').disabled=true;
  try {
    // Omitting account clears all MSAL accounts/tokens for this application.
    if(client)await client.logoutRedirect({postLogoutRedirectUri:currentRedirectUri(),
      ...(account?.idTokenClaims?.login_hint?{logoutHint:account.idTokenClaims.login_hint}:{})});
  } catch {
    loginStatus('Đã đăng xuất khỏi ứng dụng và xóa ghi nhớ đăng nhập. Chưa kết nối được trang đăng xuất Microsoft.');
  } finally { await waitAfterRequest();$('msLoginBtn').disabled=false;release(); }
}

function handleMicrosoftLogoutStorage(event) {
  if(event.key!==LOGIN_SIGNED_OUT_KEY||!event.newValue)return;
  if($('editor').open)saveEditorDraft();
  auth.client?.setActiveAccount?.(null);
  lockUi();
  loginStatus('Đã đăng xuất trên cửa sổ khác. Bấm đăng nhập để tiếp tục.');
}

function lockUi() {
  ui.recovery=null;
  ui.tableFilters={};
  closeAccountMenu();
  cancelAppDialogs();
  closeMobileNavigation();
  $('mobileNavLinks').replaceChildren();
  ui.preview = null;
  resetCloud();
  $("editor").close();
  ui.editing = null;
  document.body.classList.remove("auth-ready");
  $("view").replaceChildren();
  $("nav").replaceChildren();
  auth.account = null;
  auth.email = "";
  auth.assignment = null;
  appData = null;
}

function authorizeAccount(account) {
  const email = safeAccountEmail(account);
  if (!email.endsWith("@vietanhschool.edu.vn"))
    return {
      error:
        "Tài khoản không thuộc miền vietanhschool.edu.vn. Vui lòng sử dụng tài khoản Microsoft của nhà trường.",
    };
  const tenant = String(
    account?.tenantId || account?.idTokenClaims?.tid || "",
  ).toLowerCase();
  if (
    auth.config?.tenantId &&
    tenant !== auth.config.tenantId.toLowerCase()
  )
    return {
      error:
        "Tài khoản không thuộc Microsoft Tenant được cấu hình. Vui lòng chọn đúng tài khoản của trường.",
    };
  if (readCloudConfig().enabled)
    return { email, assignment: cloud.assignment };
  const assignment = USER_ALLOWLIST[email];
  if (!assignment)
    return {
      error:
        "Đã xác thực Microsoft nhưng tài khoản " +
        email +
        " chưa được nhà trường gán vai trò/lớp trong bản thử nghiệm. Hãy liên hệ người triển khai.",
    };
  const roles =
    Array.isArray(assignment.roles) && assignment.roles.length
      ? assignment.roles
      : [assignment.role];
  if (roles.includes("gvcn") && !CLASSES.includes(assignment.classId))
    return { error: "Cấu hình lớp của tài khoản chưa hợp lệ." };
  const grades = assignedGrades(assignment);
  if (
    roles.includes("lead") &&
    (!grades.length || grades.some((grade) => !GRADES[grade]))
  )
    return { error: "Cấu hình khối của tài khoản chưa hợp lệ." };
  if (!roles.length || roles.some((role) => !ROLE_NAMES[role]))
    return { error: "Cấu hình vai trò chưa hợp lệ." };
  return { email, assignment };
}

async function authenticatedStart(account,{fresh=false,restoring=false}={}) {
  let result = authorizeAccount(account);
  if (result.error) {
    lockUi();
    loginStatus(result.error, true);
    return;
  }
  auth.account = account;
  auth.client?.setActiveAccount?.(account);
  auth.email = result.email;
  if (readCloudConfig().enabled) {
    try {
      loginStatus(
        "Đã xác thực Microsoft. Đang tải phân công và dữ liệu Firebase…",
      );
      await connectCloud();
      result = { email: auth.email, assignment: cloud.assignment };
    } catch (error) {
      lockUi();
      if(restoring&&error.status===401&&await recoverMicrosoftSession(account))return;
      loginStatus(error.message+(error.status===401?'':' Vui lòng liên hệ Admin để kiểm tra kết nối dữ liệu và phân công tài khoản.'),true);
      return;
    }
  }
  auth.assignment = result.assignment;
  ui.role = result.assignment.role;
  const roles = assignmentRoles(result.assignment);
  const grades = assignedGrades(result.assignment);
  ui.grade = roles.includes("admin") || roles.includes("bgh")
    ? "all"
    : roles.includes("lead")
      ? grades[0]
      : roles.includes("gvcn")
        ? gradeText(result.assignment.classId)
        : "all";
  ui.classId = roles.includes("gvcn")
    ? result.assignment.classId
    : roles.includes("lead")
      ? (GRADES[ui.grade] || [])[0]
      : "6A1";
  ui.page = roles.includes("gvcn") && !roles.includes("admin") ? "work" : "dashboard";
  ui.profileId = "";
  try {
    if (!cloud.ready) load();
    if (
      !cloud.ready &&
      ui.role === "gvcn" &&
      !appData.classes[ui.classId].email
    ) {
      appData.classes[ui.classId].email = auth.email;
      save();
    }
    render();
    document.body.classList.add("auth-ready");
    rememberMicrosoftAccount(account,fresh);
  } catch (e) {
    console.error(e);
    lockUi();
    loginStatus("Không thể mở ứng dụng: " + e.message, true);
  }
}

async function makeMsalClient(config) {
  if (typeof msal === "undefined" || !msal.PublicClientApplication)
    throw Error(
      "Chưa tải được thư viện Microsoft MSAL. Kiểm tra kết nối mạng hoặc chính sách chặn CDN của trường.",
    );
  const instance = new msal.PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: "https://login.microsoftonline.com/" + config.tenantId,
      redirectUri: currentRedirectUri(),
      postLogoutRedirectUri: currentRedirectUri(),
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        piiLoggingEnabled: false,
        logLevel: msal.LogLevel.Error,
      },
    },
  });
  if (typeof instance.initialize === "function")
    await instance.initialize();
  return instance;
}

async function initializeMsLogin() {
  // Silent renewal loads this callback in an iframe; only the parent handles it.
  if(window.parent&&window.parent!==window)return;
  const release=beginPageLoading('Đang kiểm tra phiên đăng nhập…');
  try {
  lockUi();
  if (!/^https?:$/.test(location.protocol)) {
    loginStatus(
      "Không thể đăng nhập Microsoft khi mở trực tiếp file HTML (file://). Hãy chạy trên http://localhost:5500 để thử hoặc HTTPS khi triển khai.",
      true,
    );
    $("msLoginBtn").disabled = true;
    return;
  }
  const config = readAuthConfig();
  auth.config = config;
  if (!isGuid(config?.tenantId) || !isGuid(config?.clientId)) {
    loginStatus(
      "Cấu hình đăng nhập của hệ thống chưa hợp lệ. Vui lòng liên hệ quản trị viên.",
    );
    $("msLoginBtn").disabled = true;
    return;
  }
  try {
    loginStatus("Đang kết nối Microsoft và kiểm tra phiên đăng nhập…");
    auth.client = await makeMsalClient(config);
    const result = await auth.client.handleRedirectPromise();
    await waitAfterRequest();
    let account = result?.account;
    if (!account) account=cachedMicrosoftAccount(auth.client);
    $("msLoginBtn").disabled = false;
    if (account) {
      await authenticatedStart(account,{fresh:!!result?.account,restoring:!result?.account});
      return;
    }
    loginStatus(
      "Chưa đăng nhập. Chỉ màn hình này được hiển thị; chọn “Đăng nhập với Microsoft” để tiếp tục.",
    );
  } catch (e) {
    console.error("MSAL initialization", e);
    loginStatus(microsoftErrorText(e), true);
    $("msLoginBtn").disabled = false;
  }
  } finally {release();}
}

function microsoftErrorText(error) {
  const message = String(error.message || error);
  return /AADSTS50011|redirect_uri_mismatch/i.test(message)
    ? "Redirect URI chưa khớp. Thêm chính xác " +
        currentRedirectUri() +
        " vào Authentication → SPA trong ứng dụng Entra."
    : "Kết nối đăng nhập thất bại: " + message;
}
