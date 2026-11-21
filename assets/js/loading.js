"use strict";

// Native modal stays above open editors and blocks repeated clicks.
const pageLoading = {pending:new Map(),nextId:0};
let databaseQueue=Promise.resolve();
let releaseSavingOverlay;
/** Một màn chờ cho toàn bộ chuỗi lưu, kể cả thời gian debounce và các lớp đang chờ. */
function showSavingOverlay(active){
  if(active&&!releaseSavingOverlay)releaseSavingOverlay=beginPageLoading('Đang lưu dữ liệu, vui lòng chờ...');
  if(!active&&releaseSavingOverlay){const release=releaseSavingOverlay;releaseSavingOverlay=null;release();}
}
/**
 * Trả hàm release chỉ có hiệu lực một lần. Đếm các tác vụ để tác vụ xong sớm không tắt màn chờ của
 * tác vụ khác.
 */
function beginPageLoading(message='Đang tải dữ liệu…') {
  const id=++pageLoading.nextId;
  pageLoading.pending.set(id,message);
  renderPageLoading();
  let released=false;
  return ()=>{
    if(released)return;released=true;
    pageLoading.pending.delete(id);renderPageLoading();
  };
}

function renderPageLoading() {
  const overlay=$('requestOverlay'),active=pageLoading.pending.size>0;
  if(active) {
    $('requestLoadingText').textContent=[...pageLoading.pending.values()].at(-1);
    document.body.classList.add('request-loading');
    if(!overlay.open)overlay.showModal();
  } else {
    overlay.close();document.body.classList.remove('request-loading');
  }
}
/**
 * Khoảng nghỉ giao diện theo cấu hình sau request; await fetch mới là thứ bảo đảm request đã trả
 * về, không phải setTimeout.
 */
function waitAfterRequest() {
  return new Promise(resolve=>setTimeout(resolve,REQUEST_SETTLE_MS));
}
