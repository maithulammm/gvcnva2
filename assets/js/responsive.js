"use strict";

function openMobileNavigation() {
  if(!auth.account||window.innerWidth>900)return;
  const menu=$('mobileNav');
  placeAccountControl(true);
  if(!menu.open)menu.showModal();
  $('mobileMenuButton').setAttribute('aria-expanded','true');
}

function closeMobileNavigation() {
  placeAccountControl(false);
  $('mobileNav').close();
  $('mobileMenuButton').setAttribute('aria-expanded','false');
}

function renderResponsiveNavigation(permitted) {
  $('mobileNavLinks').innerHTML=$('nav').innerHTML;
  $('mobileWorkButton').hidden=!permitted.some(([key])=>key==='m02');
  const single=hasAppRole('gvcn')&&!hasAppRole('admin')&&!hasAppRole('lead')&&!hasAppRole('bgh');
  document.body.classList[single?'add':'remove']('single-class-view');
}

function adaptResponsiveTables() {
  const host=$('view');
  if(!host.querySelectorAll)return;
  let tableIndex=0;
  for(const table of host.querySelectorAll('table')) {
    installTableFilters(table,tableIndex++);
    installMeetingSummaries(table);
    installCompactList(table);
    const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    if(!headers.length)continue;
    table.classList.add('responsive-records');
    table.setAttribute('role','table');
    for(const header of table.querySelectorAll('thead th'))header.setAttribute('scope','col');
    for(const row of table.querySelectorAll('tbody > tr')) {
      row.setAttribute('role','row');
      const cells=[...row.children].filter(cell=>cell.tagName==='TD');
      for(const [index,cell] of cells.entries()) {
        cell.setAttribute('role','cell');
        if(cell.colSpan>1) {cell.classList.add('table-empty');continue;}
        cell.dataset.label=headers[index]||'Thao tác';
      }
    }
  }
}

function updateVisualViewport() {
  const height=window.visualViewport?.height||window.innerHeight;
  if(Number.isFinite(height)&&height>0)
    document.documentElement.style.setProperty('--visual-height',`${Math.round(height)}px`);
  if(document.documentElement?.style)document.documentElement.style.setProperty('--visual-top',`${Math.round(window.visualViewport?.offsetTop||0)}px`);
  if(window.innerWidth>900)closeMobileNavigation();
  const active=document.activeElement;
  if($('editor').open&&active?.closest?.('#editor'))
    window.requestAnimationFrame?.(()=>active.scrollIntoView({block:'nearest',inline:'nearest'}));
}
