import {isDeepStrictEqual as same} from 'node:util';

export function appointmentEntries(month,studentId) {
  const record=month?.schedule?.[studentId]||{};
  return Array.isArray(record.appointments)?record.appointments:
    record.planTime||record.date||record.session?[{...record,id:`legacy-${studentId}`}]:[];
}

function slotOf(record) {
  if(record.date&&record.session) return {date:record.date,session:record.session};
  const text=String(record.planTime||''),iso=text.match(/\b\d{4}-\d{2}-\d{2}\b/),local=text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  return {date:iso?.[0]||(local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:''),
    session:/\b0?9:55\b/.test(text)?'morning':/\b15:00\b/.test(text)?'afternoon':''};
}

export function validateAppointments(c,month,m,previous,requireValue) {
  const slots=new Map(),allIds=new Map();
  const parts=/^T(\d{2})\/(\d{4})$/.exec(month),prefix=`${parts[2]}-${parts[1]}-`;
  for(const [studentId,schedule] of Object.entries(m.schedule)) {
    requireValue(c.students.some(s=>s.id===studentId),'Lịch gặp có học sinh không còn trong danh sách.');
    const nested=Object.hasOwn(schedule,'appointments');
    requireValue(!nested||Array.isArray(schedule.appointments),'Danh sách lịch hẹn không hợp lệ.');
    const entries=appointmentEntries(m,studentId),oldEntries=appointmentEntries(previous?.months?.[month],studentId),days=new Map();
    if(nested) requireValue(schedule.planTime===entries.map(a=>a.planTime).filter(Boolean).join('\n'),'Danh sách thời gian hẹn không khớp các lượt hẹn.');
    for(const appointment of entries) {
      requireValue(appointment&&typeof appointment==='object'&&!Array.isArray(appointment),'Lượt hẹn không hợp lệ.');
      requireValue(typeof appointment.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(appointment.id)&&!allIds.has(appointment.id),'Mã lịch hẹn bị trùng hoặc không hợp lệ.');
      allIds.set(appointment.id,studentId);
      const structured=appointment.date!==undefined||appointment.session!==undefined;
      const unchanged=same(oldEntries.find(a=>a.id===appointment.id),appointment);
      requireValue(!nested||structured||unchanged,'Lượt hẹn mới cần có ngày và buổi rõ ràng.');
      const {date,session}=slotOf(appointment);
      if(structured) {
        const day=Number(String(date||'').slice(-2));
        requireValue(typeof date==='string'&&date.startsWith(prefix)&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&day>=1&&day<=new Date(+parts[2],+parts[1],0).getDate(),'Ngày hẹn không hợp lệ hoặc không thuộc tháng báo cáo.');
        requireValue(['morning','afternoon'].includes(session),'Buổi hẹn phải là sáng hoặc chiều.');
        const displayDate=`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`;
        requireValue(appointment.planTime===`${displayDate} · ${session==='morning'?'Sáng 9:55–10:15':'Chiều 15:00–15:20'}`,'Giờ hẹn không đúng khung giờ sáng hoặc chiều.');
        requireValue(appointment.topics===undefined||Array.isArray(appointment.topics)&&appointment.topics.every(t=>['Mục tiêu','Vở ghi','Học sinh chia sẻ'].includes(t)),'Mục tiêu hẹn gặp không hợp lệ.');
      }
      if(date&&session) {
        const weekday=new Date(date+'T12:00:00').getDay();
        requireValue(unchanged||weekday>=1&&weekday<=5||c.grade===12&&weekday===6&&session==='morning','Chỉ hẹn T2–T6; lớp 12 được thêm sáng T7.');
        const key=`${date}:${session}`,prior=slots.get(key),sameDay=days.get(date);
        requireValue(!prior||unchanged&&prior.unchanged,'Khung giờ đã được hẹn cho học sinh khác. Hãy chọn lịch khác.',409);
        requireValue(!sameDay||unchanged&&sameDay.unchanged,'Hai buổi trong ngày phải hẹn hai học sinh khác nhau.',409);
        slots.set(key,{unchanged});days.set(date,{unchanged});
      }
    }
  }
  const recorded=new Set();
  for(const meeting of m.meetings) if(meeting.appointmentId) {
    requireValue(allIds.get(meeting.appointmentId)===meeting.studentId,'Cuộc gặp liên kết lịch hẹn không hợp lệ hoặc lịch đã bị xóa.');
    requireValue(!recorded.has(meeting.appointmentId),'Một lịch hẹn chỉ được ghi nhận cuộc gặp thực tế một lần.',409);
    recorded.add(meeting.appointmentId);
  }
}
