import {createHash} from 'node:crypto';
import {randomUUID} from 'node:crypto';
import {ROOT,normalizeClass,encodeClass,requireValue} from './model.mjs';
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
function sourceData(raw){
  requireValue(raw?.bootstrapAdminOid&&raw.classes,'Firebase chưa có dữ liệu trường hợp lệ.',409);
  const copy=structuredClone(raw);delete copy._migration;
  for(const [id,row]of Object.entries(copy.classes))row.data=encodeClass(normalizeClass(id,row.data));
  return copy;
}
/** One-way staging, not cutover. Never writes/deletes Firebase and never marks
 * Supabase verified. A live source change requires a later frozen final copy.
 */
export async function stageSupabase(source,target){
  const raw=sourceData((await source.ref(ROOT).get()).val()),hash=digest(raw);
  const marker={state:'staged',sourceHash:hash,at:new Date().toISOString()};
  const result=await target.ref(ROOT).transaction(current=>{
    requireValue(!current||current._migration?.state==='staged','Supabase đã có dữ liệu không thuộc bản chuyển thử; không ghi đè.',409);
    return {...raw,_migration:marker};
  });
  requireValue(result.committed,'Chưa ghi được bản chuyển thử.',409);
  const saved=(await target.ref(ROOT).get()).val();delete saved._migration;
  requireValue(digest(saved)===hash,'Dữ liệu Supabase chưa khớp bản sao; không kích hoạt.',409);
  const unchanged=digest(sourceData((await source.ref(ROOT).get()).val()))===hash;
  return {staged:true,matched:true,sourceUnchanged:unchanged,activeDataSource:'firebase',
    classes:Object.keys(raw.classes).length,
    students:Object.values(raw.classes).reduce((n,row)=>n+row.data.students.length,0),
    months:Object.values(raw.classes).reduce((n,row)=>n+Object.keys(row.data.months).length,0)};
}

/** Resumable staging: one source branch per HTTP request. Checkpoints contain
 * counts/hashes only; a staging run is not a frozen, atomic school snapshot.
 */
export async function stageSupabaseStep(source,target,body={}){
  const markerRef=target.ref(ROOT+'/_migration');
  if(body.operation==='begin'){
    const prior=(await markerRef.get()).val();
    requireValue(!prior||prior.state==='staged','Không ghi đè nguồn Supabase đã kích hoạt.',409);
    if(prior?.units&&!body.restart)return {session:prior.session,next:prior.next,total:prior.units.length,done:prior.next===prior.units.length,
      classes:prior.classes,students:prior.students,months:prior.months,atomicSnapshot:false};
    if(!prior)requireValue(!(await target.ref(ROOT).get()).val(),'Supabase có dữ liệu chưa đánh dấu chuyển thử.',409);
    const keys=async path=>{const ref=source.ref(path);return ref.keys?ref.keys():Object.keys((await ref.get()).val()||{});};
    const roots=await keys(ROOT),classes=await keys(ROOT+'/classes');
    requireValue(roots.includes('bootstrapAdminOid')&&classes.length>0,'Firebase chưa có dữ liệu trường hợp lệ.',409);
    const units=[...roots.filter(k=>!['classes','_migration'].includes(k)).map(key=>[key]),...classes.map(id=>['classes',id])];
    const marker={state:'staged',session:randomUUID(),units,next:0,classes:0,students:0,months:0,at:new Date().toISOString()};
    await markerRef.transaction(current=>{requireValue(!current||current.state==='staged','Nguồn đã đổi trong lúc bắt đầu.',409);return marker;});
    return {session:marker.session,next:0,total:units.length};
  }
  requireValue(body.operation==='step','Thao tác chuyển thử không hợp lệ. Hãy tải lại trang để nhận bản mới.');
  const marker=(await markerRef.get()).val();
  requireValue(marker?.state==='staged'&&marker.session===body.session&&Array.isArray(marker.units),'Phiên sao chép đã thay đổi.',409);
  if(marker.next>=marker.units.length)return {...marker,units:undefined,done:true,total:marker.units.length,atomicSnapshot:false};
  const parts=marker.units[marker.next];
  requireValue(parts.every(k=>/^[A-Za-z0-9_@%+-]+$/.test(k)),'Nhánh nguồn không hợp lệ.',409);
  const path=ROOT+'/'+parts.join('/');
  let value=(await source.ref(path).get()).val();
  if(parts[0]==='classes'&&value)value={...value,data:encodeClass(normalizeClass(parts[1],value.data))};
  const hash=digest(value);
  await target.ref(path).transaction(()=>value);
  requireValue(digest((await target.ref(path).get()).val())===hash,'Nhánh sao chép chưa khớp; hãy thử tiếp tục.',409);
  const result=await markerRef.transaction(current=>{
    requireValue(current?.session===marker.session&&current.state==='staged','Phiên sao chép đã đổi.',409);
    requireValue(current.next===marker.next,'Có QTV khác đang sao chép. Hãy tiếp tục lại.',409);
    return {...current,next:current.next+1,classes:current.classes+(parts[0]==='classes'?1:0),
      students:current.students+(parts[0]==='classes'?value.data.students.length:0),months:current.months+(parts[0]==='classes'?Object.keys(value.data.months).length:0)};
  });
  const saved=result.snapshot.val();
  return {session:saved.session,next:saved.next,total:saved.units.length,done:saved.next===saved.units.length,
    classes:saved.classes,students:saved.students,months:saved.months,atomicSnapshot:false};
}
