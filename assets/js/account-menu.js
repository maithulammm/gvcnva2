"use strict";

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
  menu.style.top=Math.max(8,anchor.top-68)+'px';
  menu.hidden=false;$('accountMenuButton').setAttribute('aria-expanded','true');$('msLogoutBtn').focus();
}
