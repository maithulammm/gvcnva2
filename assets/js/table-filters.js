"use strict";
/**
 * Chuẩn hóa chữ thường và bỏ dấu để tìm tên/nội dung tiếng Việt thuận tiện.
 */
function tableFilterText(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim();
}
/**
 * Gắn tìm kiếm một lần cho mỗi bảng; lưu trạng thái theo phiên/lớp/tháng/trang và lọc cả nội dung
 * đang thu gọn.
 */
function installTableFilters(table,index){
  if(table.dataset.filterReady)return;
  const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  if(!headers.length)return;
  table.dataset.filterReady='true';
  const scope=[auth.email,cloud.epoch,ui.role,ui.classId,ui.month,ui.page,index].join('|');
  ui.tableFilters ||= {};
  if(Object.keys(ui.tableFilters).length>100)ui.tableFilters={};
  const state=ui.tableFilters[scope] ||= {search:''};
  const panel=document.createElement('section');panel.className='table-filter-panel';
  panel.setAttribute('aria-label','Bộ lọc bảng '+(index+1));
  panel.innerHTML=`<div class="table-filter-top"><label><span class="table-search-label">Tìm trong bảng</span><input type="search" class="table-search" placeholder="Tìm tên hoặc nội dung…" aria-label="Tìm trong bảng ${index+1}"></label><button type="button" class="btn small table-filter-clear">Xóa tìm kiếm</button></div><p class="table-filter-empty" role="status" hidden>Không có kết quả phù hợp.</p>`;
  const wrap=table.closest('.table-wrap')||table;
  wrap.parentNode.insertBefore(panel,wrap);
  const count=table.closest('.pending-meetings')?.querySelector('.pending-count');
  if(count)panel.querySelector('.table-filter-top').append(count);
  installScheduleBulk(table,panel);
  const records=[...table.querySelectorAll('tbody > tr')].filter(row=>!row.querySelector('td[colspan]')).map(row=>({row,values:[...row.cells].map(cell=>{
    const copy=cell.cloneNode(true);for(const action of copy.querySelectorAll('button,select,input'))action.remove();
    return tableFilterText(copy.textContent);
  })}));
  const global=panel.querySelector('.table-search');global.value=state.search;
  function apply(){
    const term=tableFilterText(state.search);
    let count=0;
    for(const {row,values} of records){const match=!term||values.join(' ').includes(term);row.hidden=!match;if(match)count++;}
    panel.querySelector('.table-filter-empty').hidden=!(count===0&&records.length&&term);
    if(table.classList.contains('m01-table')&&editable())updateScheduleSelection();
  }
  global.addEventListener('input',()=>{state.search=global.value;apply();});
  panel.querySelector('.table-filter-clear').addEventListener('click',()=>{state.search='';global.value='';apply();global.focus();});
  apply();
}
