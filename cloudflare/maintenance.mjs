import {requireValue} from '../firebase/functions/model.mjs';
export const MAINTENANCE_MESSAGE='Hệ thống đang bảo trì. Vui lòng chờ, hệ thống sẽ tự mở lại khi hoàn tất.';
export function createMaintenance(db){
  return {
    async read(){
      if(!db)return {enabled:false,message:MAINTENANCE_MESSAGE,revision:0};
      const row=await db.prepare('SELECT enabled,message,revision FROM gvcn_maintenance WHERE id=1').first();
      requireValue(row,'Chưa khởi tạo cấu hình bảo trì.',503);
      return {enabled:!!row.enabled,message:row.message,revision:row.revision};
    },
    async write(body){
      requireValue(db,'Chưa cấu hình kho điều khiển bảo trì.',503);
      requireValue(typeof body.enabled==='boolean'&&Number.isInteger(body.revision),'Cấu hình bảo trì không hợp lệ.');
      const message=String(body.message||MAINTENANCE_MESSAGE).trim();requireValue(message.length>0&&message.length<=1000,'Thông báo tối đa 1000 ký tự.');
      const result=await db.prepare('UPDATE gvcn_maintenance SET enabled=?,message=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING enabled,message,revision')
        .bind(body.enabled?1:0,message,body.revision).first();
      requireValue(result,'QTV khác đã thay đổi trạng thái. Hãy tải lại.',409);
      return {enabled:!!result.enabled,message:result.message,revision:result.revision};
    }
  };
}
