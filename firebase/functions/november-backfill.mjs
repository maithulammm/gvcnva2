import {createHash} from 'node:crypto';
import {appointmentEntries,actualMeetingSlot} from './appointments.mjs';

/** Chỉ bổ sung liên kết M01 từ M02 tháng triển khai; không ghi nội dung, ảnh hoặc tháng khác. */
export function backfillNovemberMeetings(c){
  const month=c.months?.['T11/2026'],result={added:0,linked:0,skipped:0};
  if(!month?.meetings?.length)return result;
  const students=new Set(c.students.map(s=>s.id));
  const used=new Set(month.meetings.map(r=>r.appointmentId).filter(Boolean));
  for(const r of month.meetings){
    if(!students.has(r.studentId)){result.skipped++;continue;}
    const items=appointmentEntries(month,r.studentId);
    if(r.appointmentId&&items.some(a=>a.id===r.appointmentId))continue;
    const {date,time}=actualMeetingSlot(r);
    if(!date.startsWith('2026-11-')){result.skipped++;continue;}
    const existing=items.find(a=>{
      if(used.has(a.id))return false;
      const slot=actualMeetingSlot({actual:a.planTime});
      const known=String(a.planTime||'').match(/(?:Sáng|Chiều|Giờ khác)\s+(\d{1,2}):(\d{2})/);
      const start=a.session==='morning'?'09:55':a.session==='afternoon'?'15:00':a.startTime||slot.time||(known?known[1].padStart(2,'0')+':'+known[2]:'');
      return (a.date||slot.date)===date&&start===time&&(!a.session||!!time);
    });
    if(existing){r.appointmentId=existing.id;used.add(existing.id);result.linked++;continue;}
    const id='nov-'+createHash('sha256').update([c.id,r.studentId,r.id].join('|')).digest('hex').slice(0,40);
    if(Object.keys(month.schedule||{}).some(st=>appointmentEntries(month,st).some(a=>a.id===id))){result.skipped++;continue;}
    const display=`${date.slice(8)}/${date.slice(5,7)}/2026`;
    const a={id,sourceMeetingId:r.id,topics:[],goal:'',note:'',priority:false};
    if(time){
      const session=time==='09:55'?'morning':time==='15:00'?'afternoon':'other';
      const end=Math.min(1440,+time.slice(0,2)*60 + +time.slice(3)+20);
      Object.assign(a,{date,session,startTime:time,endTime:String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0')});
      a.planTime=`${display} · ${session==='morning'?'Sáng 9:55–10:15':session==='afternoon'?'Chiều 15:00–15:20':'Giờ khác '+time+'–'+a.endTime}`;
    }else Object.assign(a,{recordedDate:date,planTime:display+' · Đã ghi nhận (chưa ghi giờ)'});
    const old=month.schedule?.[r.studentId]||{},appointments=[...items,a];
    month.schedule||={};
    month.schedule[r.studentId]={...old,appointments,planTime:appointments.map(a=>a.planTime).filter(Boolean).join('\n')};
    r.appointmentId=id;used.add(id);result.added++;
  }
  return result;
}
