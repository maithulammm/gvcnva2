"use strict";

// Microsoft Entra ID / MSAL sign-in lifecycle.

function loginStatus(message, error = false) {
  const el = $("authStatus");
  el.textContent = message;
  el.className = "auth-status" + (error ? " error" : "");
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

function lockUi() {
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

async function authenticatedStart(account) {
  let result = authorizeAccount(account);
  if (result.error) {
    lockUi();
    loginStatus(result.error, true);
    return;
  }
  auth.account = account;
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
      loginStatus(
        error.message +
          " Vui lòng liên hệ Admin để kiểm tra kết nối dữ liệu và phân công tài khoản.",
        true,
      );
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
  ui.page = "dashboard";
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
      cacheLocation: "sessionStorage",
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
    let account = result?.account;
    if (!account) {
      let accounts = auth.client.getAllAccounts();
      account =
        accounts.find((a) => authorizeAccount(a).assignment) ||
        accounts[0] ||
        null;
    }
    $("msLoginBtn").disabled = false;
    if (account) {
      await authenticatedStart(account);
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
}

function microsoftErrorText(error) {
  const message = String(error.message || error);
  return /AADSTS50011|redirect_uri_mismatch/i.test(message)
    ? "Redirect URI chưa khớp. Thêm chính xác " +
        currentRedirectUri() +
        " vào Authentication → SPA trong ứng dụng Entra."
    : "Kết nối đăng nhập thất bại: " + message;
}
