import {createHash} from 'node:crypto';
import {requireValue} from './model.mjs';

export const evidenceKey=image=>['school','legacy'].includes(image?.provider)?image.id:
  createHash('sha256').update(JSON.stringify(image)).digest('hex');
const sameFile=(a,b)=>a?.driveId&&a.driveId===b?.driveId&&a.itemId===b?.itemId;
export function evidenceReferences(c){
  return Object.entries(c.months||{}).flatMap(([month,m])=>(m.connections||[]).flatMap(row=>(row.evidenceImages||[])
    .filter(image=>image&&['school','onedrive','legacy'].includes(image.provider))
    .map(image=>({key:evidenceKey(image),image,month,studentId:row.studentId,recordId:row.id}))));
}
export function evidenceStillUsed(c,task,item=task.item){
  return evidenceReferences(c).some(ref=>ref.key===task.key||sameFile(ref.image,item));
}
function retired(stored,image,index={}){
  const key=evidenceKey(image),item=image.provider==='school'?index[image.id]:image;
  return stored?.pendingEvidenceDeletes?.[key]||stored?.deletedEvidence?.[key]||
    Object.values({...stored?.pendingEvidenceDeletes,...stored?.deletedEvidence}).find(task=>sameFile(task.item,item));
}
/** Hàng đợi nằm cùng giao dịch dữ liệu: lưu thất bại thì tuyệt đối chưa xóa tệp. */
export function queueRemovedEvidence(stored,before,after,at,actor){
  const pending={...stored.pendingEvidenceDeletes};
  for(const ref of evidenceReferences(before)){
    const item=ref.image.provider==='onedrive'?{driveId:ref.image.driveId,itemId:ref.image.itemId}:undefined;
    if(evidenceStillUsed(after,ref,item)||stored.deletedEvidence?.[ref.key])continue;
    pending[ref.key] ||= {key:ref.key,ref:ref.image.provider==='school'?{provider:'school',id:ref.key}:{provider:'onedrive'},
      ...(item?{item}:{}),month:ref.month,createdAt:at,requestedBy:actor||'system',attempts:0,nextAttemptAt:0};
  }
  return pending;
}
export function assertEvidenceNotRetired(c,stored,index){
  for(const {image}of evidenceReferences(c))requireValue(!retired(stored,image,index),'Ảnh này đã được yêu cầu xóa. Hãy chọn ảnh mới.',409);
}
/** Khôi phục nội dung báo cáo không khôi phục liên kết tới ảnh đã xóa vĩnh viễn. */
export function stripRetiredEvidence(c,stored){
  for(const m of Object.values(c.months))for(const row of m.connections)
    if(Array.isArray(row.evidenceImages))row.evidenceImages=row.evidenceImages.filter(image=>!retired(stored,image));
  return c;
}
