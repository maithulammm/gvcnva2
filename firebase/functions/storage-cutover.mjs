import {createHash} from 'node:crypto';
import {ROOT,normalizeClass,encodeClass,requireValue} from './model.mjs';
import {stageSupabaseStep} from './supabase-migration.mjs';

const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const read=async(db,path)=>(await db.ref(path).get()).val();
const keys=async(db,path)=>db.ref(path).keys?db.ref(path).keys():Object.keys(await read(db,path)||{});
const normalized=(parts,v)=>parts[0]==='classes'&&v?{...v,data:encodeClass(normalizeClass(parts[1],v.data))}:v;
const progress=m=>({session:m.session,phase:m.phase,verified:m.state==='verified',
  next:m.next||0,total:m.units?.length||0,verifyNext:m.verifyNext||0,classes:m.classes||0,students:m.students||0,months:m.months||0});

/** Frozen final copy followed by a second, independent source/target read pass.
 * Only this path may create the verified marker; a trial snapshot never can. */
export async function finalSupabaseStep(source,target,control,body={}){
  const state=await control.read();await control.assertFrozen(state.epoch);
  const marker=target.ref(ROOT+'/_migration');
  let m=await read(target,ROOT+'/_migration');
  if(body.operation==='begin'){
    if(m?.mode==='final'&&m.freezeEpoch===state.epoch)return progress(m);
    requireValue(!m||m.state==='staged'||m.mode==='final','Supabase có dữ liệu không thuộc phiên chuyển thử; không ghi đè.',409);
    if(m?.state==='verified')await marker.transaction(current=>{
      requireValue(current.session===m.session,'Phiên chốt đã thay đổi.',409);return {...current,state:'staged'};
    });
    const started=await stageSupabaseStep(source,target,{operation:'begin',restart:true});
    await control.assertFrozen(state.epoch);
    const saved=await marker.transaction(current=>{
      requireValue(current?.session===started.session,'Phiên sao chép đã thay đổi.',409);
      return {...current,mode:'final',freezeEpoch:state.epoch,phase:'copy',verifyNext:0};
    });
    return progress(saved.snapshot.val());
  }
  requireValue(m?.mode==='final'&&m.freezeEpoch===state.epoch&&m.session===body.session,'Phiên chốt không hợp lệ. Bấm bắt đầu/tiếp tục lại.',409);
  if(body.operation==='activate'){
    requireValue(m.state==='verified'&&m.verifyNext===m.units.length,'Chưa đối chiếu đầy đủ; không chuyển nguồn.',409);
    return {activated:true,...await control.activate(state.epoch)};
  }
  requireValue(body.operation==='advance','Thao tác chốt không hợp lệ.');
  if(m.state==='verified')return progress(m);
  if(m.phase==='copy'){
    const copied=await stageSupabaseStep(source,target,{operation:'step',session:m.session});
    await control.assertFrozen(state.epoch);
    if(copied.done)await marker.transaction(current=>{
      requireValue(current?.session===m.session,'Phiên chốt đã thay đổi.',409);return {...current,phase:'verify'};
    });
  }else{
    requireValue(m.phase==='verify'&&m.verifyNext<m.units.length,'Trạng thái đối chiếu không hợp lệ.',409);
    const parts=m.units[m.verifyNext],path=ROOT+'/'+parts.join('/');
    const a=normalized(parts,await read(source,path)),b=await read(target,path);
    requireValue(hash(a)===hash(b),'Dữ liệu nguồn đã đổi hoặc bản sao chưa khớp. Không chuyển nguồn; cần bắt đầu lại phiên chốt.',409);
    const last=m.verifyNext+1===m.units.length;
    if(last){
      // Reject leftovers from a previous trial and changes to the source manifest.
      const roots=m.units.filter(p=>p.length===1).map(p=>p[0]).sort();
      const classes=m.units.filter(p=>p[0]==='classes').map(p=>p[1]).sort();
      for(const db of [source,target]){
        requireValue(canonical((await keys(db,ROOT)).filter(k=>!['classes','_migration'].includes(k)).sort())===canonical(roots)&&
          canonical((await keys(db,ROOT+'/classes')).sort())===canonical(classes),'Danh mục nhánh/lớp đã thay đổi hoặc còn dữ liệu dư. Không chuyển nguồn.',409);
      }
    }
    await control.assertFrozen(state.epoch);
    await marker.transaction(current=>{
      requireValue(current?.session===m.session&&current.verifyNext===m.verifyNext,'QTV khác vừa đối chiếu; bấm tiếp tục lại.',409);
      return {...current,verifyNext:current.verifyNext+1,...(last?{state:'verified',phase:'verified',verifiedAt:new Date().toISOString()}:{} )};
    });
  }
  return progress(await read(target,ROOT+'/_migration'));
}
