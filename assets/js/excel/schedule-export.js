"use strict";

const SCHEDULE_EXPORT_CONTENT = '1. Học sinh đặt mục tiêu.\n\n2. Kiểm tra vở ghi bài và vở bài tập.\n\n3. Đánh giá hoàn thành mục tiêu.\n\n4. Lắng nghe những chia sẻ về khó khăn và nguyện vọng của HS.';

function scheduleExportEntries(c,month) {
  return c.students.map(student=>({student,appointments:[...studentAppointments(c,month,student.id)]
    .sort((a,b)=>`${scheduleSlot(a).date}:${scheduleSlot(a).session==='afternoon'?1:0}`.localeCompare(`${scheduleSlot(b).date}:${scheduleSlot(b).session==='afternoon'?1:0}`))}))
    .filter(entry=>entry.appointments.length);
}

function scheduleExportTime(appointment) {
  if(appointment.session==='other')return appointment.startTime+' - '+appointment.endTime;
  const session=scheduleSlot(appointment).session;
  return session==='morning'?'9h55 - 10h15':session==='afternoon'?'15h00 - 15h20':appointment.planTime||'';
}

function scheduleExportDate(appointment) {
  const date=scheduleSlot(appointment).date;
  return date?`${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`:appointment.planTime||'';
}

function scheduleExportSheet(c,month,entries) {
  const last=entries.length+3,monthMatch=/^T(\d{2})\/(\d{4})$/.exec(month);
  const cell=(address,value,style)=>value===''?`<c r="${address}" s="${style}"/>`:inlineCell(address,value,style);
  let rows=`<row r="1" ht="46" customHeight="1">${cell('A1',`DỰ KIẾN LỊCH LÀM VIỆC CÁ NHÂN\nVỚI HỌC SINH LỚP ${c.id}`,3)}</row>`;
  rows+=`<row r="2" ht="26" customHeight="1">${cell('A2',`Tháng ${Number(monthMatch[1])}/${monthMatch[2]}`,4)}</row>`;
  rows+=`<row r="3" ht="24" customHeight="1">${['STT','Họ và tên học sinh','Giờ','Ngày','Nội dung'].map((v,i)=>cell('ABCDE'[i]+'3',v,6)).join('')}</row>`;
  entries.forEach(({student,appointments},index)=>{
    const r=index+4,values=[index+1,student.name,appointments.map(scheduleExportTime).join('\n'),appointments.map(scheduleExportDate).join('\n')];
    rows+=`<row r="${r}" ht="${Math.max(54,appointments.length*22,Math.ceil(260/entries.length))}" customHeight="1">${values.map((v,i)=>cell('ABCD'[i]+r,v,i===1?0:2)).join('')}${cell('E'+r,index===0?SCHEDULE_EXPORT_CONTENT:'',5)}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S_NS}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:E${last}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${[6,30,22,17,42].map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><mergeCells count="${entries.length>1?3:2}"><mergeCell ref="A1:E1"/><mergeCell ref="A2:E2"/>${entries.length>1?`<mergeCell ref="E4:E${last}"/>`:''}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function scheduleExportStyles() {
  const align=(horizontal)=>`<alignment horizontal="${horizontal}" vertical="center" wrapText="1"/>`;
  const xf=(font,border,horizontal)=>`<xf numFmtId="0" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${align(horizontal)}</xf>`;
  return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${S_NS}"><fonts count="3">${[0,1,2].map(i=>`<font>${i?'<b/>':''}<sz val="${i===2?14:12}"/><color rgb="FF000000"/><name val="Times New Roman"/></font>`).join('')}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left','right','top','bottom'].map(side=>`<${side} style="thin"><color rgb="FF000000"/></${side}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">${xf(0,1,'left')}${xf(1,1,'center')}${xf(0,1,'center')}${xf(2,0,'center')}${xf(0,0,'center')}${xf(0,1,'left')}${xf(1,1,'center')}</cellXfs></styleSheet>`;
}
/**
 * Tạo workbook lịch dự kiến: sheet trình bày theo học sinh và sheet chi tiết để giữ đủ các lần
 * hẹn/mục tiêu/ghi chú.
 */
function buildScheduleWorkbook(c=cls(),month=ui.month) {
  const entries=scheduleExportEntries(c,month);
  if(!entries.length)throw Error('Chưa có lịch gặp dự kiến trong tháng này.');
  const details=[['STT','Họ và tên học sinh','Giờ','Ngày','Mục tiêu','Ghi chú']];
  entries.forEach(({student,appointments},index)=>appointments.forEach(a=>details.push([index+1,student.name,scheduleExportTime(a),scheduleExportDate(a),a.goal||'',a.note||''])));
  return simpleWorkbook([['Lịch gặp dự kiến',[]],['Chi tiết lịch',details]],{
    stylesXml:scheduleExportStyles(),
    worksheetXml:(name,rows,index)=>index===0?scheduleExportSheet(c,month,entries):null,
  });
}
/**
 * Tải file lịch của lớp/tháng đang chọn; xuất file không đánh dấu đã gặp và không sửa dữ liệu báo
 * cáo.
 */
function exportSchedule() {
  try {
    const c=cls();
    downloadFile(buildScheduleWorkbook(c,ui.month),`Lich_gap_${c.id}_${ui.month.replace('/','-')}.xlsx`);
  }catch(error){appAlert(error.message);}
}
