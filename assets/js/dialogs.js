"use strict";

const appDialogs={active:null,queue:[]};
/**
 * Chụp phiên, lớp, tháng, phân quyền và fingerprint để phát hiện dữ liệu đổi trong lúc người dùng
 * đang xác nhận.
 */
function dialogContext() {
  return {owner:auth.email,account:auth.account,epoch:cloud.epoch,classId:ui.classId,month:ui.month,
    assignment:stableString(viewAssignment()||{}),data:appData,
    fingerprint:stableString(appData?.classes?.[ui.classId]||{})};
}
/**
 * Xếp thông báo/xác nhận/nhập lý do vào hàng đợi Promise; tránh nhiều popup chồng nhau.
 */
function appDialog(message,kind='alert',value='') {
  return new Promise(resolve=>{
    appDialogs.queue.push({message:String(message??''),kind,value,resolve,context:dialogContext(),focus:document.activeElement});
    showNextAppDialog();
  });
}
function appAlert(message){return appDialog(message);}
async function appConfirm(message){return await appDialog(message,'confirm');}
async function appPrompt(message,value=''){return await appDialog(message,'prompt',value);}

function showNextAppDialog() {
  if(appDialogs.active||!appDialogs.queue.length)return;
  const entry=appDialogs.active=appDialogs.queue.shift(),prompting=entry.kind==='prompt';
  const exporting=entry.kind==='export';
  $('appDialogTitle').textContent=exporting?'Xuất lịch gặp':entry.kind==='alert'?'Thông báo':prompting?'Nhập nội dung xác nhận':'Xác nhận thao tác';
  $('appDialogWord').hidden=!exporting;
  $('appDialogMessage').textContent=entry.message;
  $('appDialogInputWrap').hidden=!prompting;
  $('appDialogInput').value=entry.value;
  $('appDialogCancel').hidden=entry.kind==='alert';
  $('appDialogCancel').textContent=exporting?'Đóng':'Hủy';
  $('appDialogAccept').textContent=exporting?'Excel (.xlsx)':entry.kind==='alert'?'Đóng':'Xác nhận';
  $('appDialog').showModal();
  (prompting?$('appDialogInput'):entry.kind==='alert'?$('appDialogAccept'):$('appDialogCancel')).focus();
}
/**
 * Chỉ chấp nhận xác nhận nếu ngữ cảnh không đổi; trả kết quả Promise, khôi phục focus rồi mở thông
 * báo kế tiếp.
 */
function finishAppDialog(accepted) {
  const entry=appDialogs.active;if(!entry)return;
  const current=dialogContext();
  if(accepted&&entry.kind!=='alert'&&Object.keys(current).some(key=>entry.context[key]!==current[key])) {
    accepted=false;
    toast('Phiên hoặc dữ liệu đã thay đổi. Vui lòng mở lại thao tác để xác nhận.');
  }
  const result=entry.kind==='export'?(accepted?(accepted==='word'?'word':'excel'):null):entry.kind==='prompt'?(accepted?$('appDialogInput').value:null):!!accepted;
  appDialogs.active=null;$('appDialog').close();entry.resolve(result);
  if(entry.focus?.isConnected)entry.focus.focus({preventScroll:true});
  showNextAppDialog();
}
/**
 * Giải quyết toàn bộ Promise đang chờ với kết quả hủy khi đăng xuất/khóa giao diện.
 */
function cancelAppDialogs() {
  const entries=[...(appDialogs.active?[appDialogs.active]:[]),...appDialogs.queue];
  appDialogs.active=null;appDialogs.queue=[];$('appDialog').close();
  for(const entry of entries)entry.resolve(entry.kind==='prompt'?null:false);
}
