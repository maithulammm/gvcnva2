import {MONTHS,requireValue,emptyMonth} from './model.mjs';
const arrays=['meetings','connections','plans','previous'];
const safeKey=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!['__proto__','constructor','prototype'].includes(value)&&!/[.#$\[\]\/]/.test(value);

/** Apply only changed records to the server's latest class inside its transaction.
 * All touched months must match; this keeps M01/M02 edits atomic while allowing
 * another month to change independently. No client can patch class assignments.
 */
export function applyRecordPatch(current,patch){
  requireValue(patch&&Array.isArray(patch.operations)&&patch.operations.length>0&&patch.operations.length<=2000,'Danh sách thay đổi không hợp lệ.');
  const touched=[...new Set(patch.operations.map(op=>op.month))];
  for(const month of touched){
    requireValue(MONTHS.includes(month),'Tháng báo cáo không hợp lệ.');
    const revision=patch.monthVersions?.[month];
    requireValue(Number.isInteger(revision)&&revision>=0&&revision===(current.months[month]?._revision||0),'Tháng này đã thay đổi trên máy khác. Vui lòng tải lại trước khi lưu.',409);
  }
  const next=structuredClone(current),seen=new Set();
  for(const op of patch.operations){
    const {month,collection,id,operation,value}=op;
    requireValue([...arrays,'schedule','notes'].includes(collection)&&['upsert','delete'].includes(operation),'Loại thay đổi không hợp lệ.');
    const key=JSON.stringify([month,collection,id]);requireValue(!seen.has(key),'Bản ghi thay đổi bị lặp.');seen.add(key);
    const m=next.months[month] ||= emptyMonth();
    if(collection==='notes'){
      requireValue(id==='notes'&&operation==='upsert'&&value&&typeof value==='object'&&!Array.isArray(value),'Ghi chú không hợp lệ.');
      m.notes=structuredClone(value);continue;
    }
    requireValue(safeKey(id),'Mã bản ghi không hợp lệ.');
    if(operation==='upsert')requireValue(value&&typeof value==='object'&&!Array.isArray(value),'Nội dung bản ghi không hợp lệ.');
    if(collection==='schedule'){
      if(operation==='delete')delete m.schedule[id];else m.schedule[id]=structuredClone(value);
    }else{
      const index=m[collection].findIndex(row=>row.id===id);
      if(operation==='delete'){requireValue(index>=0,'Bản ghi không còn tồn tại.',409);m[collection].splice(index,1);}
      else{
        requireValue(value.id===id,'Mã bản ghi không khớp.');
        if(index>=0)m[collection][index]=structuredClone(value);else m[collection].push(structuredClone(value));
      }
    }
  }
  return next;
}
