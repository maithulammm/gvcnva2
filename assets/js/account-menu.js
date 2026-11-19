"use strict";

const accountPhoto={owner:'',url:'',controller:null};
/**
 * Hủy request ảnh và thu hồi Blob URL để không hiện ảnh tài khoản cũ sau khi đổi phiên.
 */
function clearAccountPhoto(){
  accountPhoto.controller?.abort();
  if(accountPhoto.url)URL.revokeObjectURL(accountPhoto.url);
  accountPhoto.owner='';accountPhoto.url='';accountPhoto.controller=null;
  const img=$('accountPhoto');if(img){img.hidden=true;img.removeAttribute?.('src');}
}
/**
 * Dùng Graph User.Read âm thầm lấy ảnh của tài khoản thật; kiểm tra owner sau mỗi await, thất bại
 * thì giữ chữ viết tắt.
 */
async function updateAccountPhoto(){
  const fallback=$('accountInitials'),img=$('accountPhoto');if(!fallback||!img)return;
  fallback.textContent=accountDisplayName().split(/\s+/).slice(-2).map(s=>s[0]).join('').toUpperCase();
  if(!auth.account||!auth.client?.acquireTokenSilent)return;
  const owner=auth.email+'|'+(auth.account.homeAccountId||'');
  if(accountPhoto.owner===owner)return;
  clearAccountPhoto();accountPhoto.owner=owner;
  const controller=accountPhoto.controller=new AbortController();
  const current=()=>!controller.signal.aborted&&accountPhoto.owner===owner&&!!auth.account;
  try{
    const token=await auth.client.acquireTokenSilent({account:auth.account,scopes:['User.Read']});
    if(!current()||!token.accessToken)return;
    if(token.account?.homeAccountId&&auth.account.homeAccountId&&token.account.homeAccountId!==auth.account.homeAccountId)return;
    const response=await fetch('https://graph.microsoft.com/v1.0/me/photo/$value',{headers:{Authorization:'Bearer '+token.accessToken},signal:controller.signal});
    if(!current()||!response.ok)return;
    const blob=await response.blob();if(!current()||!blob.type.startsWith('image/')||blob.size>5*1024*1024)return;
    accountPhoto.url=URL.createObjectURL(blob);
    img.onload=()=>{if(current())img.hidden=false;};
    img.onerror=()=>{if(current())img.hidden=true;};
    img.src=accountPhoto.url;
  }catch{/* Keep initials when the account photo is unavailable. */}
}
/**
 * Lấy tên chủ tài khoản thật, không lấy tên lớp/giáo viên đang mô phỏng.
 */
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
/**
 * Di chuyển cùng một cụm tài khoản giữa sidebar và menu điện thoại, tránh nhân đôi ID DOM.
 */
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
  $('accountMenuButton').setAttribute('aria-expanded','true');$('msLogoutBtn').focus();
}
