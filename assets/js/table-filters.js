"use strict";

function tableFilterText(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim();
}

function installTableFilters(table,index){
  if(table.dataset.filterReady)return;
  const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  if(!headers.length)return;
  table.dataset.filterReady='true';
  const scope=[auth.email,cloud.epoch,ui.role,ui.classId,ui.month,ui.page,index].join('|');
  ui.tableFilters ||= {};
  if(Object.keys(ui.tableFilters).length>100)ui.tableFilters={};
  const state=ui.tableFilters[scope] ||= {search:'',columns:{}};
  const panel=document.createElement('section');panel.className='table-filter-panel';
  panel.setAttribute('aria-label','Bộ lọc bảng '+(index+1));
  panel.innerHTML=`<div class="table-filter-top"><label>Tìm trong bảng<input type="search" class="table-search" placeholder="Nhập tên hoặc nội dung…" aria-label="Tìm trong bảng ${index+1}"></label><button type="button" class="btn small table-filter-clear">Xóa bộ lọc</button><span class="table-filter-count" role="status" aria-live="polite"></span></div><details><summary>Lọc theo cột</summary><div class="table-filter-columns">${headers.map((name,col)=>name&&!/thao tác/i.test(name)?`<label>${esc(name)}<input type="search" data-filter-column="${col}" aria-label="Lọc ${esc(name)}" placeholder="Lọc ${esc(name)}"></label>`:'').join('')}</div></details>`;
  const wrap=table.closest('.table-wrap')||table;
  wrap.parentNode.insertBefore(panel,wrap);
  const records=[...table.querySelectorAll('tbody > tr')].filter(row=>!row.querySelector('td[colspan]')).map(row=>({row,values:[...row.cells].map(cell=>{
    const copy=cell.cloneNode(true);for(const action of copy.querySelectorAll('button,select,input'))action.remove();
    return tableFilterText(copy.textContent);
  })}));
  const global=panel.querySelector('.table-search');global.value=state.search;
  const inputs=[...panel.querySelectorAll('[data-filter-column]')];
  for(const input of inputs)input.value=state.columns[input.dataset.filterColumn]||'';
  function apply(){
    const term=tableFilterText(state.search),columns=Object.entries(state.columns).map(([col,value])=>[+col,tableFilterText(value)]).filter(([,value])=>value);
    let count=0;
    for(const {row,values} of records){const match=(!term||values.join(' ').includes(term))&&columns.every(([col,value])=>(values[col]||'').includes(value));row.hidden=!match;if(match)count++;}
    panel.querySelector('.table-filter-count').textContent=`${count}/${records.length} dòng${count===0&&records.length?' · Không có kết quả phù hợp':''}`;
  }
  global.addEventListener('input',()=>{state.search=global.value;apply();});
  for(const input of inputs)input.addEventListener('input',()=>{state.columns[input.dataset.filterColumn]=input.value;apply();});
  panel.querySelector('.table-filter-clear').addEventListener('click',()=>{state.search='';state.columns={};global.value='';for(const input of inputs)input.value='';apply();global.focus();});
  apply();
}
