"use strict";

// Microsoft-authenticated Firebase API adapter and pending drafts.

function readCloudConfig() {
  return { enabled: FIREBASE_ENABLED };
}
/**
 * Tách bộ nhớ đệm theo định danh Microsoft để dữ liệu chờ đồng bộ không lẫn giữa các tài khoản.
 */
function cloudCacheKey() {
  return (
    "VA_GVCN_FIREBASE_CACHE_V1_" +
    (auth.account?.idTokenClaims?.oid ||
      auth.account?.localAccountId ||
      auth.email)
  );
}
/**
 * Giữ bản lớp đang sửa cùng revision gốc trên thiết bị; dùng để phục hồi khi mất mạng hoặc đóng
 * trình duyệt.
 */
function storePendingDrafts() {
  const drafts = {
    ...cloud.unassignedDrafts,
    ...Object.fromEntries(
      [...cloud.pending].map((id) => [
        id,
        { data: appData.classes[id], revision: cloud.revisions[id] || 0 },
      ]),
    ),
  };
  const key = cloudCacheKey() + "_PENDING";
  if (Object.keys(drafts).length)
    localStorage.setItem(
      key,
      JSON.stringify({
        year: YEARS,
        classes: drafts,
        savedAt: new Date().toISOString(),
      }),
    );
  else localStorage.removeItem(key);
}
/**
 * Khôi phục bản chờ nhưng không tự ghi đè khi revision máy chủ đã khác. Bản thuộc phân công cũ
 * được giữ riêng.
 */
function restorePendingDrafts(raw) {
  if (!raw) return;
  let drafts;
  try {
    drafts = JSON.parse(raw);
  } catch {
    cloud.error =
      "Bản đang sửa đã lưu không đọc được. Hãy xuất bản lưu chờ đồng bộ để kiểm tra trước khi tải lại.";
    return;
  }
  if (drafts.year !== YEARS || !drafts.classes) {
    cloud.error =
      "Bản đang sửa đã lưu khác định dạng. Hãy xuất bản lưu chờ đồng bộ trước khi tải lại.";
    return;
  }
  let conflict = false;
  for (const [id, draft] of Object.entries(drafts.classes)) {
    if (
      !Object.hasOwn(cloud.baselines, id) ||
      (!hasAppRole("admin") && !hasAppRole("gvcn")) ||
      !draft.data
    ) {
      cloud.unassignedDrafts[id] = draft;
      continue;
    }
    if (classFingerprint(draft.data) === cloud.baselines[id]) continue;
    if (draft.revision !== cloud.revisions[id]) conflict = true;
    appData.classes[id] = draft.data;
    cloud.revisions[id] = draft.revision;
    cloud.pending.add(id);
  }
  if (conflict)
    cloud.error =
      "Máy chủ đã có cập nhật khác với bản đang sửa được khôi phục. Xuất JSON để giữ bản này rồi tải dữ liệu mới; hệ thống không tự ghi đè.";
  else if (cloud.pending.size) scheduleCloudSave();
}
/**
 * Tăng epoch và hủy lịch polling/debounce; mọi kết quả bất đồng bộ mang epoch cũ phải bị bỏ qua.
 */
function resetCloud() {
  cloud.epoch++;
  clearTimeout(cloud.timer);
  clearInterval(cloud.poll);
  cloud.ready = false;
  cloud.busy = false;
  cloud.worker = null;
  cloud.error = "";
  cloud.assignment = null;
  cloud.unassignedDrafts = {};
  cloud.pending = new Set();
  cloud.revisions = {};
  cloud.baselines = {};
  cloud.summaries = {};
  cloud.checks = {};
  cloud.syncVersion=undefined;cloud.metadataVersion=undefined;
  showSavingOverlay(false);
}
/**
 * Đưa request vào một hàng đợi tuần tự. Nhánh catch giữ hàng đợi tiếp tục chạy sau khi một request
 * lỗi.
 */
function databaseRequest(path, method = "GET", body, {silent=false} = {}) {
  // Share only identical in-flight reads, not stored responses. A newly queued
  // write changes the generation so a later read cannot reuse a pre-write read.
  if(method!=='GET')databaseWriteGeneration++;
  const readKey=method==='GET'?cloud.epoch+':'+databaseWriteGeneration+':'+path:null;
  if(readKey&&databaseReads.has(readKey))return databaseReads.get(readKey);
  const saving=method!=='GET'&&!path.endsWith('/evidence/cleanup');
  const epoch=cloud.epoch,release=silent&&!saving?()=>{}:beginPageLoading(saving?'Đang lưu dữ liệu, vui lòng chờ...':'Đang tải dữ liệu…');
  let completed=false;
  // Writes wait for earlier writes, never for unrelated background reads.
  const request=(method==='GET'?databaseQueue:databaseWriteQueue).then(()=>{
    if(epoch!==cloud.epoch)throw Error('Phiên làm việc đã thay đổi.');
    return performDatabaseRequest(path,method,body);
  }).then(data=>{completed=true;return data;}).finally(()=>{
    if(readKey&&databaseReads.get(readKey)===request)databaseReads.delete(readKey);
    release(completed);
  });
  // Nuốt lỗi chỉ ở đuôi hàng đợi; Promise request trả cho nơi gọi vẫn báo lỗi đầy đủ.
  if(method==='GET')databaseQueue=request.catch(()=>{});
  else databaseWriteQueue=request.catch(()=>{});
  if(readKey)databaseReads.set(readKey,request);
  return request;
}
/**
 * Gửi Bearer ID token đến API, giới hạn thời gian chờ và kiểm tra phiên trước/sau request; không
 * truy cập RTDB trực tiếp từ trình duyệt.
 */
async function performDatabaseRequest(path, method = "GET", body, attempt=0) {
  const epoch = cloud.epoch;
  if (!auth.client || !auth.account)
    throw Error("Cần đăng nhập Microsoft trước khi kết nối dữ liệu.");
  if (epoch !== cloud.epoch) throw Error("Phiên làm việc đã thay đổi.");
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetchMicrosoftApi(path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      cache: "no-store",
    });
    let data;
    try { data=await response.json(); }
    catch { throw Object.assign(Error('Máy chủ trả về dữ liệu chưa hợp lệ. Vui lòng thử lại.'),{status:response.status>=400?response.status:502}); }
    if (epoch !== cloud.epoch) throw Error("Phiên làm việc đã thay đổi.");
    if (!response.ok)
      throw Object.assign(
        new Error(
          data.error ||
            "API Firebase chưa sẵn sàng (HTTP " + response.status + ").",
        ),
        { status: response.status },
      );
    return data;
  } catch (error) {
    // Đọc có thể thử lại một lần; không tự lặp thao tác ghi khi mất mạng và chưa biết đã lưu hay chưa.
    if(method==='GET'&&attempt===0&&epoch===cloud.epoch&&!controller.signal.aborted&&
      (error instanceof TypeError||[429,502,503,504].includes(error.status)))
      return performDatabaseRequest(path,method,body,attempt+1);
    if (error.name === "AbortError")
      throw Error(
        "Kết nối Firebase quá thời gian chờ. Bản đang sửa vẫn được giữ trên trình duyệt.",
      );
    if (error instanceof TypeError)
      throw Error(
        "Chưa kết nối được API Firebase. Kiểm tra mạng, triển khai API và địa chỉ website được phép truy cập.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    await waitAfterRequest();
    if(epoch!==cloud.epoch)throw Error('Phiên làm việc đã thay đổi.');
  }
}
/**
 * Áp dụng dữ liệu đã được API giới hạn theo quyền; lưu revision và fingerprint làm mốc phát hiện
 * thay đổi.
 */
function useBootstrap(data) {
  if (!data.assignment || data.year !== YEARS || !data.classes)
    throw Error("Dữ liệu máy chủ không đúng định dạng.");
  cloud.readInterrupted=false;
  cloud.assignment = data.assignment;
  auth.assignment = data.assignment;
  ui.role = data.assignment.role;
  cloud.revisions = data.revisions || {};
  cloud.summaries = data.summaries || {};
  cloud.checks = data.checks || {};
  cloud.scopedSync=!!data.scopedSync;
  cloud.recordPatches=!!data.recordPatches;
  if(data.metadataVersion)cloud.metadataVersion=data.metadataVersion;
  cloud.evidenceCleanup=!!data.evidenceCleanup;
  const defaults = defaultSchool();
  appData = {
    ...defaults,
    // Không giữ cả khung lớp ngoài phạm vi trong cache của tài khoản hiện tại.
    classes: { ...data.classes },
    teachers: data.teachers || {},
    users: data.users || [],
    calendar: data.calendar || {excludedDates:[],excludedSessions:[],revision:0},
  };
  cloud.baselines = Object.fromEntries(
    Object.entries(data.classes).map(([id, c]) => [
      id,
      classFingerprint(c),
    ]),
  );
  cloud.pending.clear();
  cloud.error = "";
  cloud.lastSync = new Date().toLocaleTimeString("vi-VN");
  const roles = assignmentRoles(data.assignment),
    grades = assignedGrades(data.assignment);
  if (roles.includes("admin") || roles.includes("bgh")) {
    if (ui.grade !== "all" && !CLASSES.some((id) => gradeText(id) === ui.grade))
      ui.grade = "all";
  } else if (roles.includes("lead")) {
    if (!grades.includes(String(ui.grade))) ui.grade = grades[0];
    if (!classesForAssignment(data.assignment).includes(ui.classId))
      ui.classId = data.assignment.classId || GRADES[ui.grade]?.[0] || "";
  } else if (roles.includes("gvcn")) {
    ui.classId = data.assignment.classId;
    ui.grade = gradeText(ui.classId);
  }
  try {
    localStorage.setItem(cloudCacheKey(), JSON.stringify(appData));
  } catch {
    toast(
      "Đã tải Firebase nhưng bộ nhớ trình duyệt đã đầy. Hãy xuất JSON sao lưu.",
    );
  }
}
/**
 * Tải bootstrap rồi khôi phục bản chờ; chỉ polling khi không mở popup, không có thay đổi chờ và
 * không có lỗi.
 */
/** Tải theo nhóm 8 lớp để không vượt số request con của Workers Free. Chỉ áp dụng khi đủ các nhóm. */
async function loadCloudBootstrap(quiet=false){
  const data=await databaseRequest('/bootstrap?paged=1','GET',undefined,{silent:quiet});
  const ids=data.remainingClassIds||[];
  for(let offset=0;offset<ids.length;offset+=8){
    const page=await databaseRequest('/bootstrap/classes?ids='+ids.slice(offset,offset+8).join(','),'GET',undefined,{silent:quiet});
    if(stableString(page.assignment)!==stableString(data.assignment))throw Error('Phân công đã thay đổi trong lúc tải. Vui lòng tải lại.');
    for(const key of ['classes','revisions','summaries','checks'])Object.assign(data[key]||={},page[key]||{});
  }
  return data;
}
async function connectCloud() {
  cloud.syncVersion=undefined;cloud.metadataVersion=undefined;
  const draft = localStorage.getItem(cloudCacheKey() + "_PENDING");
  const data = await loadCloudBootstrap();
  cloud.ready = true;
  useBootstrap(data);
  restorePendingDrafts(draft);
  cloud.poll = setInterval(() => {
    if (
      document.hidden ||
      $("editor").open ||
      cloud.busy ||
      cloud.worker ||
      cloud.pending.size ||
      (cloud.error&&!cloud.readInterrupted)
    )
      return;
    refreshCloud(true);
  }, 45000);
}
/**
 * So fingerprint với mốc máy chủ để tìm lớp thực sự thay đổi; tránh gửi lại các lớp không được
 * chỉnh sửa.
 */
function scanPendingClasses() {
  if (!cloud.ready || (!hasAppRole("admin") && !hasAppRole("gvcn")))
    return;
  for (const id of Object.keys(cloud.baselines)) {
    if (classFingerprint(appData.classes[id]) !== cloud.baselines[id])
      cloud.pending.add(id);
  }
}
/**
 * Debounce 700 ms để gom thay đổi liên tiếp; luôn giữ bản chờ trên thiết bị trước khi gửi lên
 * mạng.
 */
function scheduleCloudSave() {
  scanPendingClasses();
  storePendingDrafts();
  clearTimeout(cloud.timer);
  updateStorageNotice();
  if (!cloud.error)
    cloud.timer = setTimeout(
      () =>
        flushCloud().catch((error) => {
          cloud.error = error.message;
          updateStorageNotice();
        }),
      700,
    );
}
/**
 * Chỉ cho một worker đồng bộ chạy. Mỗi lớp gửi kèm revision để API từ chối ghi đè dữ liệu mới hơn.
 */
function buildRecordPatch(baseline,snapshot){
  const {months:before,...oldMetadata}=baseline,{months:after,...newMetadata}=snapshot;
  if(stableString(oldMetadata)!==stableString(newMetadata))return null;
  const operations=[],monthVersions={};
  for(const month of new Set([...Object.keys(before||{}),...Object.keys(after||{})])){
    const old=before?.[month]||{},next=after?.[month];
    if(stableString(old)===stableString(next))continue;
    if(!next)return null;
    const allowed=['meetings','connections','plans','previous','schedule','notes','approval','_revision'];
    if(Object.keys(next).some(key=>!allowed.includes(key)&&stableString(old[key])!==stableString(next[key])))return null;
    if(stableString(old.approval||{state:'draft',history:[]})!==stableString(next.approval||{state:'draft',history:[]}))return null;
    monthVersions[month]=old._revision||0;
    for(const collection of ['meetings','connections','plans','previous','schedule','notes']){
      if(stableString(old[collection])===stableString(next[collection]))continue;
      if(collection==='notes'){
        operations.push({month,collection,id:'notes',operation:'upsert',value:next.notes||{}});continue;
      }
      const keyed=value=>collection==='schedule'?(value||{}):Object.fromEntries((value||[]).map(row=>[row.id,row]));
      const left=keyed(old[collection]),right=keyed(next[collection]);
      if(Object.keys(left).includes('undefined')||Object.keys(right).includes('undefined'))return null;
      for(const id of new Set([...Object.keys(left),...Object.keys(right)]))if(stableString(left[id])!==stableString(right[id]))
        operations.push({month,collection,id,operation:right[id]===undefined?'delete':'upsert',...(right[id]===undefined?{}:{value:right[id]})});
    }
  }
  return operations.length&&operations.length<=2000?{monthVersions,operations}:null;
}

async function flushCloud() {
  clearTimeout(cloud.timer);
  if (cloud.worker) return cloud.worker;
  if (!cloud.ready) return;
  if (cloud.error) throw Error(cloud.error);
  scanPendingClasses();
  const epoch = cloud.epoch;
  if (!cloud.pending.size) return;
  cloud.worker = (async () => {
    try {
      for (const id of cloud.pending) {
        const snapshot = JSON.parse(JSON.stringify(appData.classes[id]));
        // Chỉ gửi các tháng thay đổi; máy chủ ghép với các tháng hiện có trong giao dịch lớp.
        const baseline=JSON.parse(cloud.baselines[id]||'{}');
        const partialMonths=cloud.scopedSync;
        const payload=partialMonths?{...snapshot,months:Object.fromEntries(Object.entries(snapshot.months||{}).filter(([month,value])=>stableString(value)!==stableString(baseline.months?.[month]||{})))}:snapshot;
        const patch=cloud.recordPatches?buildRecordPatch(baseline,snapshot):null;
        const result = await databaseRequest("/classes/" + id, "PUT", patch?{patch}:{
          classData: payload,
          partialMonths,
          revision: cloud.revisions[id] || 0,
        }, {silent:true});
        if (epoch !== cloud.epoch) return;
        // Chỉ nâng revision sau xác nhận từ API; request thất bại phải giữ bản chờ.
        cloud.revisions[id] = result.revision;
        cloud.baselines[id] = classFingerprint(result.data);
        if (
          classFingerprint(appData.classes[id]) ===
          classFingerprint(snapshot)
        )
          // Keep the class reference used by an open, unsaved next-student form.
          Object.assign(appData.classes[id],result.data);
        // Người dùng có thể nhập thêm trong lúc await; quét lại để không bỏ sót lần sửa mới.
        cloud.pending.delete(id);
        scanPendingClasses();
        storePendingDrafts();
        if(result.cleanupPending)scheduleEvidenceCleanup(id,true);
      }
      if (epoch !== cloud.epoch) return;
      localStorage.setItem(cloudCacheKey(), JSON.stringify(appData));
      cloud.lastSync = new Date().toLocaleTimeString("vi-VN");
    } catch (error) {
      if (epoch === cloud.epoch) {cloud.error = error.message;cloud.readInterrupted=false;}
      throw error;
    } finally {
      if (epoch === cloud.epoch) {
        cloud.worker = null;
        updateStorageNotice();
      }
    }
  })();
  return cloud.worker;
}

async function retryCloud() {
  if (cloud.busy) return;
  cloud.error = "";
  try {
    await flushCloud();
    render();
    toast("Đã đồng bộ các thay đổi lên Firebase.");
  } catch (error) {
    appAlert(error.message);
  }
}
/**
 * Polling âm thầm không đè bản đang sửa; tải lại thủ công phải xác nhận nếu còn thay đổi chưa đồng
 * bộ.
 */
async function refreshCloud(quiet = false) {
  if (!cloud.ready || cloud.busy) return;
  const readGeneration=databaseWriteGeneration;
  const superseded=()=>quiet&&(readGeneration!==databaseWriteGeneration||cloud.pending.size||cloud.worker);
  try {
    scanPendingClasses();
    if (
      cloud.pending.size ||
      cloud.worker ||
      (cloud.error&&!cloud.readInterrupted) ||
      Object.keys(cloud.unassignedDrafts).length
    ) {
      if (quiet) return;
      if (
        !await appConfirm(
          "Tải lại sẽ bỏ bản đang sửa trên màn hình. Hãy xuất JSON trước nếu cần giữ. Tiếp tục tải dữ liệu máy chủ?",
        )
      )
        return;
      if (cloud.worker) await cloud.worker;
    }
    cloud.busy = true;
    let nextSyncVersion,nextMetadataVersion;
    if(quiet&&cloud.scopedSync){
      const state=await databaseRequest('/changes','GET',undefined,{silent:true});
      if(superseded())return;
      if(state.supported&&state.version===cloud.syncVersion){
        if(cloud.readInterrupted){cloud.error='';cloud.readInterrupted=false;updateStorageNotice();}
        cloud.busy=false;return;
      }
      nextSyncVersion=state.version;
      nextMetadataVersion=state.metadataVersion;
      if(state.supported&&state.metadataVersion&&state.metadataVersion===cloud.metadataVersion&&state.revisions){
        const ids=Object.keys(state.revisions),allowed=classesForAssignment(auth.assignment);
        // Phân công đổi phải bootstrap lại; không trộn cache từ phạm vi quyền cũ.
        if(stableString([...ids].sort())===stableString([...allowed].sort())){
          const changed=ids.filter(id=>state.revisions[id]!==cloud.revisions[id]);
          const data={year:YEARS,assignment:auth.assignment,classes:{...appData.classes},
            revisions:{...cloud.revisions},summaries:{...cloud.summaries},checks:{...cloud.checks},
            teachers:appData.teachers,users:appData.users,calendar:appData.calendar,
            scopedSync:cloud.scopedSync,recordPatches:cloud.recordPatches,evidenceCleanup:cloud.evidenceCleanup};
          for(let offset=0;offset<changed.length;offset+=8){
            const page=await databaseRequest('/bootstrap/classes?ids='+changed.slice(offset,offset+8).join(','),'GET',undefined,{silent:true});
            if(stableString(page.assignment)!==stableString(data.assignment))throw Error('Phân công đã thay đổi trong lúc tải. Vui lòng tải lại.');
            for(const key of ['classes','revisions','summaries','checks'])Object.assign(data[key],page[key]||{});
          }
          if(superseded())return;
          useBootstrap(data);cloud.syncVersion=nextSyncVersion;cloud.metadataVersion=nextMetadataVersion;
          cloud.busy=false;if(changed.length)render();return;
        }
      }
    }
    const data = await loadCloudBootstrap(quiet);
    if(superseded())return;
    useBootstrap(data);
    cloud.syncVersion=nextSyncVersion;
    cloud.metadataVersion=nextMetadataVersion;
    cloud.unassignedDrafts = {};
    storePendingDrafts();
    cloud.busy = false;
    render();
    if (!quiet) toast("Đã tải dữ liệu mới nhất từ Firebase.");
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      lockUi();
      loginStatus(error.message, true);
    } else {
      cloud.error = error.message;
      // Retry background reads on the next poll. Pending edits still prevent
      // refresh, and a failed write is never automatically resubmitted here.
      cloud.readInterrupted=quiet;
      updateStorageNotice();
      if (!quiet) appAlert(error.message);
    }
  } finally {
    cloud.busy = false;
    updateStorageNotice();
  }
}
/**
 * Hiện tích xanh, vòng xoay hoặc dấu lỗi; mô tả đầy đủ vẫn có qua title/aria-label và các nút phục
 * hồi.
 */
function updateStorageNotice() {
  showSavingOverlay(!!(cloud.ready&&!cloud.error&&(cloud.worker||cloud.pending.size)));
  const message = !cloud.ready
    ? "Dữ liệu đang lưu cục bộ trên trình duyệt. Admin có thể quản lý GVCN và học sinh; bật Firebase sau khi triển khai API để dùng chung dữ liệu."
    : cloud.error
      ? "Chưa đồng bộ: " +
        cloud.error +
        " Bản đang sửa được giữ cục bộ. Xuất JSON trước khi tải lại."
      : cloud.worker || cloud.pending.size
        ? "Đang chờ đồng bộ Firebase · " + cloud.pending.size + " lớp."
        : "✓";
  const synced = cloud.ready && !cloud.error && !cloud.busy && !cloud.worker && !cloud.pending.size &&
    !Object.keys(cloud.unassignedDrafts).length;
  const loading=cloud.ready&&!cloud.error&&(cloud.busy||cloud.worker||cloud.pending.size);
  const detail=message +
    (Object.keys(cloud.unassignedDrafts).length
      ? " Có bản lưu chờ đồng bộ thuộc phân công cũ. Bạn có thể xuất bản lưu này; hệ thống không tự gửi vào lớp mới."
      : "");
  const label=synced?'Đã đồng bộ dữ liệu':loading?'Đang đồng bộ dữ liệu':detail;
  $('offlineNotice').className=synced?'sync-ok':loading?'sync-icon sync-loading':'sync-icon sync-error';
  $('offlineNotice').setAttribute('role','status');
  $('offlineNotice').setAttribute('aria-label',label);
  $('offlineNotice').setAttribute('aria-busy',String(!!loading));
  $('offlineNotice').title=label;
  $('offlineNotice').textContent=synced?'✓':loading?'':'!';
  $("syncActions").innerHTML =
    cloud.ready &&
    (cloud.error ||
      cloud.pending.size ||
      Object.keys(cloud.unassignedDrafts).length)
      ? btn("Xuất JSON giữ bản đang sửa", "jsonBackup()") +
        btn("Xuất bản lưu chờ đồng bộ", "exportPendingDrafts()") +
        btn("Thử đồng bộ lại", "retryCloud()") +
        btn("Tải dữ liệu máy chủ", "refreshCloud()")
      : "";
}

async function enableFirebase() {
  if (!hasAppRole("admin")) return;
  if (
    !await appConfirm(
      "Bật kết nối API Firebase đã triển khai? Dữ liệu cục bộ sẽ được giữ riêng để chuyển lên sau.",
    )
  )
    return;
  localStorage.setItem(
    CLOUD_CONFIG_KEY,
    JSON.stringify({ enabled: true }),
  );
  initializeMsLogin();
}
