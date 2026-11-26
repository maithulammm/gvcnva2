"use strict";

// Native modal stays above open editors and blocks repeated clicks.
const pageLoading = {pending:new Map(),nextId:0,progress:0,timer:null,failed:false};
let databaseQueue=Promise.resolve();
let databaseWriteQueue=Promise.resolve();
const databaseReads=new Map();
let databaseWriteGeneration=0;
let releaseSavingOverlay;
/** Một màn chờ cho toàn bộ chuỗi lưu, kể cả thời gian debounce và các lớp đang chờ. */
function showSavingOverlay(active){
  if(active&&!releaseSavingOverlay)releaseSavingOverlay=beginPageLoading('Đang lưu dữ liệu, vui lòng chờ...');
  if(!active&&releaseSavingOverlay){const release=releaseSavingOverlay;releaseSavingOverlay=null;release(!cloud.error);}
}
/**
 * Trả hàm release chỉ có hiệu lực một lần. Đếm các tác vụ để tác vụ xong sớm không tắt màn chờ của
 * tác vụ khác.
 */
function beginPageLoading(message='Đang tải dữ liệu…') {
  const id=++pageLoading.nextId;
  if(!pageLoading.pending.size){
    pageLoading.progress=0;pageLoading.failed=false;
    pageLoading.timer=setInterval(()=>{
      if([...pageLoading.pending.values()].at(-1)?.measured||pageLoading.progress>=90)return;
      // Ước tính khi API không trả tiến trình; tuyệt đối không tự chạy đến 100%.
      pageLoading.progress=Math.min(90,pageLoading.progress+Math.max(1,(90-pageLoading.progress)*.08));
      renderPageLoading();
    },250);
  }
  pageLoading.pending.set(id,{message,measured:false});
  renderPageLoading();
  let released=false;
  const release=(success=true)=>{
    if(released)return;released=true;
    if(!success)pageLoading.failed=true;
    pageLoading.pending.delete(id);
    if(!pageLoading.pending.size){clearInterval(pageLoading.timer);pageLoading.timer=null;if(success&&!pageLoading.failed)pageLoading.progress=100;}
    return renderPageLoading();
  };
  release.update=(progress,nextMessage)=>{
    const task=pageLoading.pending.get(id);if(!task)return;
    if(nextMessage)task.message=nextMessage;
    task.measured=true;
    pageLoading.progress=Math.max(pageLoading.progress,Math.min(95,Math.max(0,progress)));
    renderPageLoading();
  };
  return release;
}

function renderPageLoading() {
  const overlay=$('requestOverlay'),active=pageLoading.pending.size>0;
  if(active) {
    const task=[...pageLoading.pending.values()].at(-1);
    if($('requestLoadingText').textContent!==task.message)$('requestLoadingText').textContent=task.message;
    $('requestProgressHint').textContent=task.measured?'Đang xử lý; chờ xác nhận hoàn tất.':'Tiến trình ước tính · Đang chờ hệ thống xử lý.';
    document.body.classList.add('request-loading');
    if(!overlay.open)overlay.showModal();
  }
  const percent=Math.floor(pageLoading.progress);
  $('requestProgress').value=percent;
  $('requestProgress').setAttribute('aria-valuenow',String(percent));
  $('requestProgressValue').textContent=percent+'%';
  if(!active){
    const close=()=>{overlay.close();document.body.classList.remove('request-loading');};
    if(percent===100&&overlay.open){
      $('requestLoadingText').textContent='Hoàn tất';
      const generation=pageLoading.nextId;
      const frame=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>Promise.resolve().then(fn);
      // Cho 100% được vẽ một khung hình; không thêm thời gian chờ cố định sau request.
      return new Promise(resolve=>frame(()=>frame(()=>{if(!pageLoading.pending.size&&generation===pageLoading.nextId)close();resolve();})));
    }
    close();
  }
}
/**
 * Khoảng nghỉ giao diện theo cấu hình sau request; await fetch mới là thứ bảo đảm request đã trả
 * về, không phải setTimeout.
 */
function waitAfterRequest() {
  return REQUEST_SETTLE_MS>0?new Promise(resolve=>setTimeout(resolve,REQUEST_SETTLE_MS)):Promise.resolve();
}
