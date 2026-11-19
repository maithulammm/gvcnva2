"use strict";

const accountPhoto={owner:'',url:'',controller:null};
function clearAccountPhoto(){
  accountPhoto.controller?.abort();
  if(accountPhoto.url)URL.revokeObjectURL(accountPhoto.url);
  accountPhoto.owner='';accountPhoto.url='';accountPhoto.controller=null;
  const img=$('accountPhoto');if(img){img.hidden=true;img.removeAttribute?.('src');}
}
function photoStatus(message){
  const status=$('accountPhotoStatus');if(status)status.textContent=message;
  const avatar=$('accountPhoto');if(avatar?.parentElement)avatar.parentElement.title=message;
}
async function refreshAccountPhoto(){await updateAccountPhoto(true);}
async function updateAccountPhoto(interactive=false){
  const fallback=$('accountInitials'),img=$('accountPhoto');if(!fallback||!img)return;
  fallback.textContent=accountDisplayName().split(/\s+/).slice(-2).map(s=>s[0]).join('').toUpperCase();
  if(!auth.account||!auth.client?.acquireTokenSilent)return;
  const owner=auth.email+'|'+(auth.account.homeAccountId||'');
  if(accountPhoto.owner===owner&&!interactive)return;
  clearAccountPhoto();accountPhoto.owner=owner;
  const controller=accountPhoto.controller=new AbortController();
  const current=()=>!controller.signal.aborted&&accountPhoto.owner===owner&&!!auth.account;
  photoStatus('Đang tải ảnh Microsoft…');
  const refresh=$('refreshAccountPhotoButton');if(refresh)refresh.disabled=true;
  try{
    const request={account:auth.account,scopes:['User.Read']};
    const token=interactive?await auth.client.acquireTokenPopup({...request,prompt:'consent'}):await auth.client.acquireTokenSilent(request);
    if(!current())return;
    if(!token.accessToken)throw Error('missing_access_token');
    if(token.account?.homeAccountId&&auth.account.homeAccountId&&token.account.homeAccountId!==auth.account.homeAccountId)throw Error('account_mismatch');
    const response=await fetch('https://graph.microsoft.com/v1.0/me/photo/$value',{headers:{Authorization:'Bearer '+token.accessToken},signal:controller.signal});
    if(!current())return;
    if(!response.ok)throw Error('photo_http_'+response.status);
    const blob=await response.blob();if(!current())return;
    if(!blob.type.startsWith('image/')||blob.size>5*1024*1024)throw Error('invalid_photo');
    accountPhoto.url=URL.createObjectURL(blob);
    img.onload=()=>{if(current()){img.hidden=false;photoStatus('Đã tải ảnh Microsoft.');}};
    img.onerror=()=>{if(current()){img.hidden=true;photoStatus('Không hiển thị được ảnh. Bấm Cập nhật ảnh Microsoft để thử lại.');}};
    img.src=accountPhoto.url;
  }catch(error){
    if(!current())return;
    const code=String(error.errorCode||error.message||'');
    const message=code==='photo_http_404'?'Microsoft Graph chưa trả về ảnh cho tài khoản này.':code==='photo_http_403'?'Microsoft chưa cấp quyền đọc ảnh cho ứng dụng. Cần kiểm tra quyền User.Read trong Entra.':code==='photo_http_401'?'Phiên đọc ảnh đã hết hạn. Bấm Cập nhật ảnh Microsoft.':interactive?'Chưa cấp được quyền đọc ảnh ('+code.replace(/[^a-zA-Z0-9_]/g,'').slice(0,64)+'). Nếu Microsoft yêu cầu phê duyệt, cần quản trị Microsoft của trường hỗ trợ.':'Chưa tải được ảnh. Bấm Cập nhật ảnh Microsoft để cấp quyền và thử lại.';
    photoStatus(message);if(interactive)appAlert(message);
  }finally{if(accountPhoto.owner===owner&&refresh)refresh.disabled=false;}
}

function accountDisplayName() {
  const ownTeacher=Object.values(appData?.teachers||{}).find(t=>String(t.email||'').toLowerCase()===auth.email);
  const ownUser=(appData?.users||[]).find(u=>u.email===auth.email);
  return [ownTeacher?.name,auth.account?.name,auth.account?.idTokenClaims?.name,auth.assignment?.display,ownUser?.name]
    .find(value=>typeof value==='string'&&value.trim()&&!value.includes('@'))?.trim()||auth.email.split('@')[0]||'Tài khoản';
}
function closeAccountMenu(restoreFocus=false) {
  $('accountMenu').hidden=true;$('accountMenuButton').setAttribute('aria-expanded','false');
  if(restoreFocus)$('accountMenuButton').focus();
}
function placeAccountControl(inMobileMenu=false) {
  closeAccountMenu();
  const host=$(inMobileMenu?'mobileAccountFooter':'sidebarAccountFooter');
  host?.append?.($('identityBox'),$('accountMenu'));
}
function toggleAccountMenu() {
  if(!auth.account)return;
  const menu=$('accountMenu');
  if(!menu.hidden){closeAccountMenu(true);return;}
  const anchor=$('accountMenuButton').getBoundingClientRect();
  const width=Math.min(200,window.innerWidth-24);
  menu.style.width=width+'px';
  menu.style.left=Math.max(12,Math.min(anchor.left,window.innerWidth-width-12))+'px';
  menu.hidden=false;
  menu.style.top=Math.max(8,anchor.top-menu.getBoundingClientRect().height-6)+'px';
  $('accountMenuButton').setAttribute('aria-expanded','true');$('refreshAccountPhotoButton').focus();
}
