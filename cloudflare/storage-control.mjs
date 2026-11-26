import {randomUUID} from 'node:crypto';
import {requireValue} from '../firebase/functions/model.mjs';

/** D1 serializes admission and freeze. Never use a time-based lease expiry:
 * a timed-out client does not prove that its database write has finished. */
export function createStorageControl(db){
  if(!db)return null;
  const read=async(ignore='')=>{
    const row=await db.prepare('SELECT source,frozen,epoch,(SELECT count(*) FROM gvcn_storage_leases WHERE id<>?) AS active FROM gvcn_storage_control WHERE id=1').bind(ignore).first();
    requireValue(row,'Chưa khởi tạo migration D1 0005.',503);
    return {...row,frozen:!!row.frozen};
  };
  const assertFrozen=async(epoch,ignore='')=>{
    const state=await read(ignore);
    requireValue(state.source==='firebase'&&state.frozen&&state.epoch===epoch&&state.active===0,'Chưa khóa xong mọi lượt ghi hoặc phiên chốt đã thay đổi. Hãy kiểm tra lại.',409);
    return state;
  };
  const activate=async(epoch,ignore='')=>{
    const result=await db.prepare("UPDATE gvcn_storage_control SET source='supabase',frozen=0,epoch=epoch+1 WHERE id=1 AND source='firebase' AND frozen=1 AND epoch=? AND NOT EXISTS(SELECT 1 FROM gvcn_storage_leases WHERE id<>?) AND EXISTS(SELECT 1 FROM gvcn_maintenance WHERE id=1 AND enabled=1)")
      .bind(epoch,ignore).run();
    requireValue(result.meta.changes===1,'Phiên chốt thay đổi; chưa chuyển nguồn.',409);return read(ignore);
  };
  const control={read,
    async enter(source){
      const id=randomUUID();
      const result=await db.prepare('INSERT INTO gvcn_storage_leases(id,started_at) SELECT ?,? FROM gvcn_storage_control WHERE id=1 AND frozen=0 AND source=?')
        .bind(id,new Date().toISOString(),source).run();
      requireValue(result.meta.changes===1,'Đang chốt/chuyển nguồn dữ liệu. Bản đang nhập được giữ lại; vui lòng chờ.',503);
      return async()=>{await db.prepare('DELETE FROM gvcn_storage_leases WHERE id=?').bind(id).run();};
    },
    async freeze(){
      await db.prepare("UPDATE gvcn_storage_control SET frozen=1,epoch=epoch+1 WHERE id=1 AND source='firebase' AND frozen=0 AND EXISTS(SELECT 1 FROM gvcn_maintenance WHERE id=1 AND enabled=1)").run();
      const state=await read();requireValue(state.frozen&&state.source==='firebase','Cần bật bảo trì và giữ Firebase là nguồn chính trước khi chốt.',409);return state;
    },
    assertFrozen,activate,
    async runFinal(fn){
      const state=await read(),id=randomUUID();
      const entered=await db.prepare("INSERT INTO gvcn_storage_leases(id,started_at) SELECT ?,? FROM gvcn_storage_control WHERE id=1 AND source='firebase' AND frozen=1 AND epoch=? AND NOT EXISTS(SELECT 1 FROM gvcn_storage_leases)")
        .bind(id,new Date().toISOString(),state.epoch).run();
      requireValue(entered.meta.changes===1,'Còn lượt ghi hoặc QTV khác đang chốt. Hãy tiếp tục lại.',409);
      try{return await fn({...control,read:()=>read(id),assertFrozen:epoch=>assertFrozen(epoch,id),activate:epoch=>activate(epoch,id)});}
      finally{await db.prepare('DELETE FROM gvcn_storage_leases WHERE id=?').bind(id).run();}
    },
    async cancel(epoch){
      const result=await db.prepare("UPDATE gvcn_storage_control SET frozen=0,epoch=epoch+1 WHERE id=1 AND source='firebase' AND frozen=1 AND epoch=? AND NOT EXISTS(SELECT 1 FROM gvcn_storage_leases)").bind(epoch).run();
      requireValue(result.meta.changes===1,'Còn lượt đang chạy hoặc đã chuyển nguồn; không hủy khóa.',409);return read();
    }
  };return control;
}

/** Guard ALL transactions, including bootstrap repair and OAuth token refresh.
 * Reading remains available to Admin so a page reload can resume cutover. */
export function guardDatabase(database,control,source){
  if(!control)return database;
  return {...database,ref(path){
    const ref=database.ref(path);
    return {...ref,async transaction(update){
      const leave=await control.enter(source);
      try{return await ref.transaction(update);}finally{await leave();}
    }};
  }};
}
