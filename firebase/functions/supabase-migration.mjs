import {createHash} from 'node:crypto';
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
