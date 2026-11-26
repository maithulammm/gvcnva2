"use strict";
const maintenanceState={enabled:false,message:'',revision:0,checking:false};
function actualMaintenanceAdmin(){return !!auth.assignment&&assignmentRoles(auth.assignment).includes('admin');}
function applyMaintenance(state){
  Object.assign(maintenanceState,state);
  const overlay=$('maintenanceOverlay');if(!overlay)return;
  const blocked=maintenanceState.enabled&&!!auth.account&&!actualMaintenanceAdmin();
  $('maintenanceMessage').textContent=maintenanceState.message||'Hệ thống đang bảo trì. Vui lòng chờ.';
  if(blocked&&!overlay.open){try{saveEditorDraft();storePendingDrafts();}catch{}overlay.showModal();}
  else if(!blocked&&overlay.open)overlay.close();
  if(!state.enabled&&cloud.maintenanceBlocked){
    cloud.maintenanceBlocked=false;cloud.error=cloud.pending.size?'Bảo trì đã kết thúc. Hãy bấm Thử đồng bộ lại.':'';updateStorageNotice();
    if(cloud.pending.size)toast('Bảo trì đã kết thúc. Bấm Thử đồng bộ lại để lưu phần đang chờ.');
  }
}
async function checkMaintenance(){
  if(!auth.account){applyMaintenance(maintenanceState);return;}
  if(maintenanceState.checking)return;
  maintenanceState.checking=true;
  try{
    const response=await fetch(FIREBASE_API_URL+'/maintenance',{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return;
    const state=await response.json();if(typeof state.enabled!=='boolean')return;
    applyMaintenance(state);
    if(ui.page==='maintenance'&&actualMaintenanceAdmin()){
      const text=$('maintenanceStatus');if(text)text.textContent=state.enabled?'ĐANG BẬT BẢO TRÌ':'Đang hoạt động bình thường';
      const button=$('maintenanceToggle');if(button){button.textContent=state.enabled?'Tắt bảo trì':'Bật bảo trì';button.disabled=false;}
    }
  }catch{}finally{maintenanceState.checking=false;}
}
function renderMaintenance(){
  if(!hasAppRole('admin'))return '';
  return `<section class="card"><h2>Bảo trì hệ thống</h2><p id="maintenanceStatus" role="status">Đang kiểm tra trạng thái…</p>
    <label>Thông báo cho giáo viên<textarea id="maintenanceText" maxlength="1000">${esc(maintenanceState.message||'Hệ thống đang bảo trì. Vui lòng chờ, hệ thống sẽ tự mở lại khi hoàn tất.')}</textarea></label>
    <p class="help">Khi bật, tài khoản ngoài QTV bị chặn thao tác. Trang đang mở sẽ hiện màn hình bảo trì trong khoảng 15 giây. QTV vẫn truy cập được để tắt.</p>
    <button type="button" class="btn primary" id="maintenanceToggle" disabled onclick="toggleMaintenance()">Đang kiểm tra…</button></section>`;
}
async function toggleMaintenance(){
  if(!actualMaintenanceAdmin())return;
  const enabled=!maintenanceState.enabled;
  if(!await appConfirm(enabled?'Bật bảo trì và chặn thao tác của các tài khoản ngoài QTV?':'Tắt bảo trì để giáo viên tiếp tục sử dụng?'))return;
  const button=$('maintenanceToggle');if(button)button.disabled=true;
  try{
    const result=await databaseRequest('/maintenance','PUT',{enabled,message:$('maintenanceText').value,revision:maintenanceState.revision});
    applyMaintenance(result);await checkMaintenance();
  }catch(error){await appAlert(error.message);await checkMaintenance();}
  finally{if(button)button.disabled=false;}
}
function startMaintenanceMonitor(){
  $('maintenanceOverlay').addEventListener('cancel',event=>event.preventDefault());
  setInterval(checkMaintenance,15000);
  document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)checkMaintenance();});
  checkMaintenance();
}
