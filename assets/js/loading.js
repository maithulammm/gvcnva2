"use strict";

// Native modal stays above open editors and blocks repeated clicks.
const pageLoading = {pending:new Map(),nextId:0};
let databaseQueue=Promise.resolve();

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

function waitAfterRequest() {
  return new Promise(resolve=>setTimeout(resolve,REQUEST_SETTLE_MS));
}
