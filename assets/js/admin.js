"use strict";

/** Chỉ Admin thấy trạng thái và thao tác liên kết kho ảnh tập trung. */
function renderStorageSettings(){
  const status=ui.storageStatus;
  return `<section class="card"><h2>Kho ảnh minh chứng</h2><p id="storageStatusText" class="help">${status?esc(status.connected?'Đã kết nối · '+status.ownerEmail:status.configured?'Chưa kết nối tài khoản chủ kho ảnh.':'Máy chủ chưa có đủ cấu hình kho ảnh.'):'Đang kiểm tra kết nối…'}</p>
    <div class="actions"><button type="button" class="btn primary" id="connectStorageButton" onclick="connectSchoolStorage()" ${!cloud.ready||status?.canConnect===false?'disabled':''}>${status?.connected?'Kết nối lại OneDrive':'Kết nối OneDrive của tôi'}</button>${btn('Kiểm tra kết nối','loadStorageStatus()')}</div>
    <p class="help">Chỉ chủ kho ảnh thực hiện bước này. Giáo viên dùng ảnh ngay trong biểu mẫu, không cần cấp quyền lưu trữ.</p></section>`;
}
async function loadStorageStatus(){
  if(!canEditSetup()||!cloud.ready||ui.storageStatusLoading)return;
  const epoch=cloud.epoch,owner=auth.email;ui.storageStatusLoading=true;
  try{
    const status=await databaseRequest('/evidence/admin/status','GET',undefined,{silent:true});
    if(epoch!==cloud.epoch||owner!==auth.email||!canEditSetup())return;
    ui.storageStatus=status;
    const text=$('storageStatusText');if(text)text.textContent=status.connected?'Đã kết nối · '+status.ownerEmail:status.configured?'Chưa kết nối tài khoản chủ kho ảnh.':'Máy chủ chưa có đủ Client ID / Client Secret cho kho ảnh.';
    const button=$('connectStorageButton');if(button){button.disabled=!status.configured||!status.canConnect;button.textContent=status.connected?'Kết nối lại OneDrive':'Kết nối OneDrive của tôi';}
  }catch(error){const text=$('storageStatusText');if(text)text.textContent=error.message;}
  finally{if(epoch===cloud.epoch)ui.storageStatusLoading=false;}
}
async function connectSchoolStorage(){
  if(!canEditSetup()||!cloud.ready)return;
  const owner=auth.email,epoch=cloud.epoch,button=$('connectStorageButton');if(button)button.disabled=true;
  try{
    await flushCloud();
    const result=await databaseRequest('/evidence/admin/connect','POST',{returnUrl:currentRedirectUri()});
    if(owner!==auth.email||epoch!==cloud.epoch||!canEditSetup()||ui.page!=='database')return;
    const url=new URL(result.url);
    if(url.origin!=='https://login.microsoftonline.com')throw Error('Địa chỉ kết nối Microsoft không hợp lệ.');
    window.location.assign(url.href);
  }catch(error){appAlert(error.message);if(button)button.disabled=false;}
}
function handleStorageReturn(){
  const hash=window.location?.hash||'';
  if(!['#evidence-connected','#evidence-connect-error'].includes(hash)||!hasAppRole('admin'))return;
  window.history?.replaceState?.(null,'',window.location.pathname+window.location.search);
  ui.storageStatus=null;navTo('database');
  if(hash==='#evidence-connected')toast('Đã kết nối kho ảnh. Bạn có thể thử tải minh chứng ở Mẫu 3.');
  else appAlert('Chưa hoàn tất kết nối kho ảnh. Hãy chọn đúng tài khoản chủ kho; nếu Microsoft yêu cầu quản trị viên phê duyệt thì chính sách trường chưa cho phép tự cấp quyền.');
}

async function loadRecovery(){
  if(!hasAppRole('admin')||!cloud.ready)return;
  const context=dialogContext(),id=ui.classId;
  try{
    const data=await databaseRequest('/recovery/'+id,'GET');
    if(Object.keys(context).some(k=>context[k]!==dialogContext()[k])||ui.page!=='database')return;
    ui.recovery=data;
    $('recoveryPanel').innerHTML=`<h3>Lớp ${esc(id)}</h3><p>30 bản hằng ngày và 20 phiên bản gần nhất. Khôi phục sẽ thay dữ liệu lớp bằng bản được chọn.</p>${Object.entries(data.snapshots).sort((a,b)=>b[1].at.localeCompare(a[1].at)).map(([key,s])=>`<p>${esc(displayDateText(s.at))} · ${esc(s.actor)} · Phiên bản ${s.revision} <button type="button" class="btn small" onclick="downloadRecovery('${key}')">Tải JSON</button> <button type="button" class="btn small danger" onclick="restoreRecovery('${key}')">Khôi phục</button></p>`).join('')||'<p>Chưa có bản sao lưu.</p>'}<h3>Lịch sử thay đổi</h3>${data.audit.map(a=>`<p>${esc(displayDateText(a.at))} · ${esc(a.actor)} · ${esc(a.action)} ${(a.changes||[]).map(x=>esc(x.operation+" ? "+x.record)).join("; ")}</p>`).join('')}`;
  }catch(error){appAlert('Chưa tải được lịch sử. API mới cần được triển khai: '+error.message);}
}
function downloadRecovery(key){
  const data=ui.recovery;if(!hasAppRole('admin')||!data?.snapshots[key])return;
  downloadFile(new Blob([JSON.stringify(data.snapshots[key],null,2)],{type:'application/json'}),`Sao_luu_${data.classId}_${key}.json`);
}
async function restoreRecovery(key){
  const data=ui.recovery;if(!hasAppRole('admin')||!data?.snapshots[key]||ui.classId!==data.classId)return;
  if(!await appConfirm(`Khôi phục lớp ${data.classId} về phiên bản ${data.snapshots[key].revision}? Dữ liệu hiện tại sẽ được sao lưu trước khi thay thế.`))return;
  if(ui.recovery!==data||!hasAppRole('admin')||ui.classId!==data.classId)return;
  try{useBootstrap(await databaseRequest('/recovery/'+data.classId,'POST',{key,revision:data.revision}));render();toast('Đã khôi phục dữ liệu lớp.');}catch(error){appAlert(error.message);}
}

// Admin teacher assignments and database settings.

function renderTeachers() {
  if (!hasAppRole("admin")) return "";
  const teachers = Object.values(appData.teachers || {}).sort((a, b) =>
    a.classId.localeCompare(b.classId, undefined, { numeric: true }),
  );
  return `<div class="section-head"><h2>Danh sách GVCN · ${teachers.length} giáo viên</h2><div class="actions">${btn("＋ Thêm GVCN", "openModal('teacherAccount')", "primary")}${cloud.ready ? btn("Tải dữ liệu mới", "refreshCloud()") : ""}</div></div>
    <section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email Microsoft</th><th>Lớp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${teachers.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.classId)}</td><td>${statusTag(t.active !== false ? "Đang hoạt động" : "Ngừng hoạt động")}</td><td class="actions-cell">${btn("Sửa", `openModal('teacherAccount','${t.id}')`, "small")}${btn("Học sinh", `openClassStudents('${t.classId}')`, "small")}${btn("Xóa", `deleteTeacherAccount('${t.id}')`, "small danger")}</td></tr>`).join("") || '<tr><td colspan="5"><div class="empty">Chưa có GVCN trong danh sách quản lý. Bấm Thêm GVCN để bắt đầu.</div></td></tr>'}</tbody></table></div></section>`;
}

function renderUsers() {
  if (!hasAppRole("admin")) return "";
  const users = [...(appData.users || [])].sort((a, b) =>
    a.email.localeCompare(b.email),
  );
  const rows = users
    .map((user) => {
      const roles = assignmentRoles(user)
        .map((role) => ROLE_NAMES[role] || role)
        .join(" · ");
      const grades = assignedGrades(user);
      const scope = user.classId
        ? `Lớp ${user.classId}`
        : grades.length
          ? `Khối ${grades.join(", ")}`
          : "Toàn trường";
      return `<tr><td><b>${esc(user.name || user.email)}</b></td><td>${esc(user.email)}</td><td>${esc(roles)}</td><td>${esc(scope)}</td><td>${statusTag(user.active !== false ? "Đang hoạt động" : "Ngừng hoạt động")}</td><td>${btn("Sửa vai trò", `openModal('userRoles','${esc(user.email)}')`, "small")}</td></tr>`;
    })
    .join("");
  return `<div class="section-head"><h2>Tài khoản & vai trò · ${users.length} tài khoản</h2><div class="actions">${cloud.ready ? btn("＋ Thêm tài khoản", "openModal('userRoles')", "primary") + btn("Nhập danh sách đã chuẩn bị", "$('directoryInput').click()") : ""}</div></div>
    ${cloud.ready ? `<section class="card no-pad"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email công vụ</th><th>Vai trò</th><th>Phạm vi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="empty">Chưa có tài khoản được phân công.</div></td></tr>'}</tbody></table></div></section>` : '<section class="card"><p class="help">Kết nối Firebase để xem và quản lý vai trò máy chủ.</p></section>'}`;
}

async function saveUserRole(record) {
  if (!canEditSetup() || !cloud.ready)
    throw Error("Cần quyền Admin và kết nối Firebase để quản lý vai trò.");
  record.email = record.email.toLowerCase().trim();
  const previous = (appData.users || []).find(
    (user) => user.email === record.email,
  );
  const previousRoles = assignmentRoles(previous);
  const gained = record.roles.filter((role) => !previousRoles.includes(role));
  if (
    gained.some((role) => ["admin", "bgh", "lead"].includes(role)) &&
    !await appConfirm(
      `Cấp vai trò ${gained.map((role) => ROLE_NAMES[role]).join(", ")} cho ${record.email}? Vai trò này mở quyền truy cập theo phạm vi được nêu.`,
    )
  )
    return false;
  await flushCloud();
  cloud.busy = true;
  try {
    useBootstrap(await databaseRequest("/users", "POST", record));
  } finally {
    cloud.busy = false;
  }
  return true;
}

async function importDirectoryFile(e) {
  const input = e.target,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!canEditSetup() || !cloud.ready) {
    appAlert("Chỉ Admin đang kết nối Firebase mới được nhập phân công.");
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    if (
      data.schema !== 1 ||
      data.year !== YEARS ||
      !Array.isArray(data.teachers) ||
      !Array.isArray(data.users)
    )
      throw Error("Tệp phân công không đúng định dạng năm học 2026–2027.");
    if (
      !await appConfirm(
        `Nhập ${data.teachers.length} phân công GVCN và ${data.users.length} tài khoản vai trò lên Firebase? Lớp đã có GVCN khác hoặc tài khoản có quyền ngoài tệp sẽ bị từ chối, không ghi đè.`,
      )
    )
      return;
    await flushCloud();
    cloud.busy = true;
    try {
      useBootstrap(
        await databaseRequest("/directory/import", "POST", data),
      );
    } finally {
      cloud.busy = false;
    }
    render();
    toast(
      `Đã đồng bộ ${data.teachers.length} GVCN và ${data.users.length} tài khoản vai trò.`,
    );
  } catch (error) {
    appAlert("Không thể nhập phân công: " + error.message);
  } finally {
    cloud.busy = false;
    updateStorageNotice();
  }
}

function renderDatabase() {
  if (!hasAppRole("admin")) return "";
  return `<div class="section-head"><h2>Dữ liệu</h2></div>${renderStorageSettings()}
    <section class="card"><h2>Thống kê API · 24 giờ</h2>${btn('Tải thống kê','loadApiMetrics()')}<div id="apiMetricsPanel"></div></section>
    <section class="card"><h2>Supabase</h2><div class="actions">${btn('Kiểm tra kết nối Supabase','checkSupabaseConnection()')}<button type="button" class="btn" id="stageSupabaseButton" onclick="stageSupabaseData()">Sao chép thử & đối chiếu</button></div><div id="supabaseStatus" class="help">Chưa chuyển nguồn lưu chính sang Supabase.</div></section>
    <div class="cols2"><section class="card"><h2>Kết nối dữ liệu dùng chung</h2>
    <p class="help" style="overflow-wrap:anywhere">Database: ${esc(FIREBASE_DATABASE_URL)}</p>
    ${cloud.error?`<p class="help">${esc(cloud.error)}</p>`:!cloud.ready?'<p class="help">Chưa kết nối dữ liệu dùng chung.</p>':''}
    <div class="actions">${cloud.ready ? btn("Tải dữ liệu mới", "refreshCloud()") + btn("Thử đồng bộ lại", "retryCloud()") + btn("Xuất bản lưu chờ đồng bộ", "exportPendingDrafts()") + btn("Sao lưu & lịch sử lớp đang chọn", "loadRecovery()") : btn("Bật kết nối Firebase", "enableFirebase()", "primary")}${btn("Xuất JSON sao lưu", "jsonBackup()")}</div><div id="recoveryPanel"></div></section>
    <section class="card"><h2>Chuyển dữ liệu cũ lên Firebase</h2><p class="help">Bản dữ liệu cục bộ ban đầu được giữ nguyên. Chỉ chuyển vào lớp trống; lớp đã có hồ sơ trên Firebase được bỏ qua. Thông tin và lịch sử cũ được giữ trong bản nhập.</p>
    <div class="actions">${btn("Xuất dữ liệu cục bộ ban đầu", "exportLegacyData()")}${cloud.ready ? btn("Chuyển dữ liệu cũ lên Firebase", "migrateLegacyData()", "primary") : ""}</div></section></div>`;
}

async function checkSupabaseConnection(){
  if(!hasAppRole('admin')||!cloud.ready)return;
  const panel=$('supabaseStatus');if(panel)panel.textContent='Đang kiểm tra kết nối Supabase…';
  try{
    const result=await databaseRequest('/supabase/status');
    if(panel)panel.textContent=result.connected?(result.storageReady?'Supabase đã kết nối, có thể sao chép thử và đối chiếu.':'Supabase đã kết nối. Cần chạy migration 0002_transactional_storage.sql trước khi sao chép thử.'):'Chưa xác nhận được kết nối.';
  }catch(error){if(panel)panel.textContent=error.message;}
}

async function loadApiMetrics(){
  if(!hasAppRole('admin')||!cloud.ready)return;
  const panel=$('apiMetricsPanel');if(!panel)return;
  panel.textContent='Đang tải thống kê…';
  try{
    const result=await databaseRequest('/metrics');
    panel.innerHTML=result.enabled?`<div class="table-wrap"><table><thead><tr><th>API</th><th>HTTP</th><th>Số request</th><th>TB (ms)</th><th>Lâu nhất (ms)</th><th>Chậm ≥ 3s</th></tr></thead><tbody>${result.rows.map(row=>`<tr><td>${esc(row.method+' '+row.route)}</td><td>${esc(row.status)}</td><td>${esc(row.requests)}</td><td>${esc(row.average_ms)}</td><td>${esc(row.max_ms)}</td><td>${esc(row.slow_requests)}</td></tr>`).join('')}</tbody></table></div>`:'Chưa bật thống kê API.';
  }catch(error){panel.textContent=error.message;}
}

async function stageSupabaseData(){
  if(!hasAppRole('admin')||!cloud.ready)return;
  if(cloud.pending.size||cloud.worker){await appAlert('Hãy hoàn tất lưu dữ liệu đang sửa trước khi chuyển thử.');return;}
  if(!await appConfirm('Sao chép dữ liệu Firebase sang bản thử Supabase và đối chiếu? Firebase vẫn là nguồn chính.'))return;
  const button=$('stageSupabaseButton'),panel=$('supabaseStatus');if(button?.disabled)return;
  if(button)button.disabled=true;
  const release=beginPageLoading('Đang sao chép thử sang Supabase…');let completed=false;
  try{
    const status=await databaseRequest('/supabase/status');
    if(!status.storageReady)throw Error('Cần chạy migration 0002_transactional_storage.sql trên Supabase trước.');
    let result=await databaseRequest('/supabase/stage','POST',{operation:'begin'});
    if(result.done&&await appConfirm('Bản sao thử trước đã hoàn tất. Tạo bản sao thử mới từ dữ liệu Firebase hiện tại?'))
      result=await databaseRequest('/supabase/stage','POST',{operation:'begin',restart:true});
    while(!result.done){
      if(panel)panel.textContent=`Đang sao chép và kiểm tra ${result.next}/${result.total} phần (${Math.floor(result.next*100/result.total)}%). Có thể tiếp tục nếu gián đoạn.`;
      const next=databaseRequest('/supabase/stage','POST',{operation:'step',session:result.session});
      $('requestLoadingText').textContent=`Đang sao chép ${result.next}/${result.total} phần (${Math.floor(result.next*100/result.total)}%)…`;
      result=await next;
    }
    completed=true;
    if(panel)panel.textContent=`Đã đối chiếu từng phần: ${result.classes} lớp, ${result.students} học sinh, ${result.months} tháng/lớp (100%). Đây chưa phải bản chốt cùng một thời điểm; Firebase vẫn là nguồn chính.`;
  }catch(error){if(panel)panel.textContent=error.message+' Bấm Sao chép thử & đối chiếu để tiếp tục từ phần đã lưu.';await appAlert(error.message);}
  finally{release(completed);if(button)button.disabled=false;}
}

function openClassStudents(id) {
  ui.classId = id;
  ui.grade = gradeText(id);
  ui.profileId = "";
  navTo("students");
}

function openClassTeacher() {
  if (!canEditSetup()) return;
  const existing = Object.values(appData.teachers || {}).find(
    (t) => t.classId === ui.classId && t.active !== false,
  );
  openModal("teacherAccount", existing?.id || "");
}

async function saveTeacherAccount(record) {
  if (!canEditSetup()) throw Error("Chỉ Admin được quản lý GVCN.");
  record.email = record.email.toLowerCase().trim();
  if (!/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(record.email))
    throw Error("GVCN phải sử dụng email công vụ @vietanhschool.edu.vn.");
  if (!CLASSES.includes(record.classId)) throw Error("Lớp không hợp lệ.");
  if (record.email === "lammt@vietanhschool.edu.vn")
    throw Error(
      "Email này đang giữ quyền Admin. Hãy dùng email GVCN được phân công.",
    );
  if (cloud.ready) {
    await flushCloud();
    cloud.busy = true;
    try {
      useBootstrap(await databaseRequest("/teachers", "POST", record));
    } finally {
      cloud.busy = false;
    }
    return;
  }
  const teachers = (appData.teachers ||= {}),
    id = record.id || newID(),
    old = teachers[id];
  if (
    Object.values(teachers).some(
      (t) =>
        t.id !== id &&
        (t.email === record.email ||
          (t.active !== false &&
            record.active &&
            t.classId === record.classId)),
    )
  )
    throw Error("Email đã tồn tại hoặc lớp đã có GVCN đang hoạt động.");
  if (old && appData.classes[old.classId].email === old.email) {
    appData.classes[old.classId].teacher = "";
    appData.classes[old.classId].email = "";
  }
  teachers[id] = { ...record, id };
  if (record.active) {
    appData.classes[record.classId].teacher = record.name;
    appData.classes[record.classId].email = record.email;
  }
  if (!save())
    throw Error("Không lưu được dữ liệu. Hãy xuất JSON sao lưu.");
}

async function deleteTeacherAccount(id) {
  if (!canEditSetup()) return;
  const t = appData.teachers?.[id];
  if (!t) return;
  if (
    !await appConfirm(
      `Xóa GVCN ${t.name} và thu hồi phân công lớp ${t.classId}? Hồ sơ lớp và học sinh được giữ lại.`,
    )
  )
    return;
  try {
    if (cloud.ready) {
      await flushCloud();
      cloud.busy = true;
      try {
        useBootstrap(await databaseRequest("/teachers/" + id, "DELETE"));
      } finally {
        cloud.busy = false;
      }
    } else {
      appData.teacherArchive ||= [];
      appData.teacherArchive.push({
        ...t,
        deletedAt: new Date().toISOString(),
        deletedBy: auth.email,
      });
      const c = appData.classes[t.classId];
      if (c.email === t.email) {
        c.teacher = "";
        c.email = "";
      }
      delete appData.teachers[id];
      save();
    }
    render();
    toast("Đã xóa GVCN và giữ nguyên hồ sơ lớp.");
  } catch (error) {
    appAlert(error.message);
  }
}
