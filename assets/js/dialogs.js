"use strict";

const appDialogs={active:null,queue:[]};

function dialogContext() {
  return {owner:auth.email,account:auth.account,epoch:cloud.epoch,classId:ui.classId,month:ui.month,
    assignment:stableString(viewAssignment()||{}),data:appData,
    fingerprint:stableString(appData?.classes?.[ui.classId]||{})};
}

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
  $('appDialogTitle').textContent=entry.kind==='alert'?'Thông báo':prompting?'Nhập nội dung xác nhận':'Xác nhận thao tác';
  $('appDialogMessage').textContent=entry.message;
  $('appDialogInputWrap').hidden=!prompting;
  $('appDialogInput').value=entry.value;
  $('appDialogCancel').hidden=entry.kind==='alert';
  $('appDialogAccept').textContent=entry.kind==='alert'?'Đóng':'Xác nhận';
  $('appDialog').showModal();
  (prompting?$('appDialogInput'):entry.kind==='alert'?$('appDialogAccept'):$('appDialogCancel')).focus();
}

function finishAppDialog(accepted) {
  const entry=appDialogs.active;if(!entry)return;
  const current=dialogContext();
  if(accepted&&entry.kind!=='alert'&&Object.keys(current).some(key=>entry.context[key]!==current[key])) {
    accepted=false;
    toast('Phiên hoặc dữ liệu đã thay đổi. Vui lòng mở lại thao tác để xác nhận.');
  }
  const result=entry.kind==='prompt'?(accepted?$('appDialogInput').value:null):!!accepted;
  appDialogs.active=null;$('appDialog').close();entry.resolve(result);
  if(entry.focus?.isConnected)entry.focus.focus({preventScroll:true});
  showNextAppDialog();
}

function cancelAppDialogs() {
  const entries=[...(appDialogs.active?[appDialogs.active]:[]),...appDialogs.queue];
  appDialogs.active=null;appDialogs.queue=[];$('appDialog').close();
  for(const entry of entries)entry.resolve(entry.kind==='prompt'?null:false);
}
