"use strict";
function scheduleSelection(){
  const scope=[auth.email,cloud.epoch,ui.classId,ui.month,isRolePreview()].join('|');
  if(ui.scheduleSelection?.scope!==scope)ui.scheduleSelection={scope,ids:new Set()};
  return ui.scheduleSelection.ids;
}
function updateScheduleSelection(){
  const table=document.querySelector('.m01-table');if(!table)return;
  const ids=scheduleSelection(),boxes=[...table.querySelectorAll('[data-select-student]')];
  for(const id of ids)if(!boxes.some(b=>b.dataset.selectStudent===id&&!b.disabled))ids.delete(id);
  for(const box of boxes)box.checked=ids.has(box.dataset.selectStudent);
  const visible=boxes.filter(b=>!b.disabled&&!b.closest('tr').hidden),count=visible.filter(b=>b.checked).length;
  for(const master of document.querySelectorAll('[data-schedule-select-all]')){master.checked=!!visible.length&&count===visible.length;master.indeterminate=count>0&&count<visible.length;master.disabled=!visible.length;}
  const button=$('bulkScheduleDelete');if(button){button.disabled=!ids.size||!editable();button.classList.toggle('danger',!!ids.size);}
}
function selectScheduleStudent(id,checked){const ids=scheduleSelection();if(checked)ids.add(id);else ids.delete(id);updateScheduleSelection();}
function selectAllScheduleStudents(checked){
  for(const box of document.querySelectorAll('.m01-table [data-select-student]'))if(!box.disabled&&!box.closest('tr').hidden){if(checked)scheduleSelection().add(box.dataset.selectStudent);else scheduleSelection().delete(box.dataset.selectStudent);}
  updateScheduleSelection();
}
function installScheduleBulk(table,panel){
  if(!table.classList.contains('m01-table')||!editable())return;
  const button=document.createElement('button');button.id='bulkScheduleDelete';button.type='button';button.className='btn small';button.textContent='Xóa';button.disabled=true;button.addEventListener('click',deleteSelectedSchedules);
  panel.querySelector('.table-filter-top').prepend(button);
  const master=document.createElement('label');master.className='mobile-bulk-select';master.innerHTML='<input type="checkbox" data-schedule-select-all onchange="selectAllScheduleStudents(this.checked)"> Tất cả';
  panel.querySelector('.table-filter-top').append(master);updateScheduleSelection();
}
async function deleteSelectedSchedules(){
  if(!editable())return;
  const ids=[...scheduleSelection()],c=cls(),month=ui.month,context=dialogContext(),admin=hasAppRole('admin')||isAdminClassEditing();
  const remove=[];let protectedCount=0;
  for(const id of ids)for(const a of studentAppointments(c,month,id)){
    if(!admin&&mdata().meetings.some(r=>r.appointmentId===a.id))protectedCount++;else remove.push(a.id);
  }
  if(!remove.length)return appAlert('Không có lịch được phép xóa. Lịch đã ghi nhận thực tế được giữ lại.');
  if(!await appConfirm(`Xóa ${remove.length} lịch dự kiến của ${ids.length} học sinh đã chọn? Không xóa học sinh hay cuộc gặp thực tế.${protectedCount?' Có '+protectedCount+' lịch đã ghi nhận được giữ lại.':''}${admin?' Cuộc gặp thực tế chỉ được bỏ liên kết với lịch bị xóa.':''}`))return;
  if(!editable()||Object.keys(context).some(k=>context[k]!==dialogContext()[k]))return;
  const m=mdata(),before=JSON.parse(JSON.stringify(c)),removed=new Set(remove);
  for(const id of ids){const old=m.schedule[id];if(old)m.schedule[id]=appointmentRollup(old,studentAppointments(c,month,id).filter(a=>!removed.has(a.id)));}
  if(admin)m.meetings=m.meetings.map(r=>{if(!removed.has(r.appointmentId))return r;const {appointmentId,...rest}=r;return rest;});
  if(!save()){Object.assign(c,before);return;}
  scheduleSelection().clear();render();toast('Đã xóa '+remove.length+' lịch dự kiến.');
}
