"use strict";

const SCHEDULE_EXPORT_CONTENT = '1. Học sinh đặt mục tiêu.\n2. Kiểm tra vở ghi bài và vở bài tập.\n3. Đánh giá hoàn thành mục tiêu.\n4. Lắng nghe những chia sẻ về khó khăn và nguyện vọng của HS.';

function scheduleExportEntries(c,month) {
  return c.students.map(student=>({student,appointments:[...studentAppointments(c,month,student.id)]
    .sort((a,b)=>`${scheduleSlot(a).date}:${String(appointmentRange({...a,...scheduleSlot(a)})[0]).padStart(4,'0')}`.localeCompare(`${scheduleSlot(b).date}:${String(appointmentRange({...b,...scheduleSlot(b)})[0]).padStart(4,'0')}`))}))
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
  let rows=`<row r="1" ht="34" customHeight="1">${cell('A1',`DỰ KIẾN LỊCH LÀM VIỆC CÁ NHÂN\nVỚI HỌC SINH LỚP ${c.id}`,3)}</row>`;
  rows+=`<row r="2" ht="18" customHeight="1">${cell('A2',`Tháng ${Number(monthMatch[1])}/${monthMatch[2]}`,4)}</row>`;
  rows+=`<row r="3" ht="20" customHeight="1">${['STT','Họ và tên học sinh','Giờ','Ngày','Nội dung'].map((v,i)=>cell('ABCDE'[i]+'3',v,6)).join('')}</row>`;
  entries.forEach(({student,appointments},index)=>{
    const r=index+4,values=[index+1,student.name,appointments.map(scheduleExportTime).join('\n'),appointments.map(scheduleExportDate).join('\n')];
    rows+=`<row r="${r}" ht="${Math.max(18,appointments.length*13,Math.ceil(130/entries.length))}" customHeight="1">${values.map((v,i)=>cell('ABCD'[i]+r,v,i===1?0:2)).join('')}${cell('E'+r,index===0?SCHEDULE_EXPORT_CONTENT:'',entries.length===1?5:index===0?7:index===entries.length-1?9:8)}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${S_NS}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:E${last}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${[5,27,22,17,30].map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><mergeCells count="${entries.length>1?3:2}"><mergeCell ref="A1:E1"/><mergeCell ref="A2:E2"/>${entries.length>1?`<mergeCell ref="E4:E${last}"/>`:''}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}

function scheduleExportStyles() {
  const align=(horizontal)=>`<alignment horizontal="${horizontal}" vertical="center" wrapText="1"/>`;
  const xf=(font,border,horizontal)=>`<xf numFmtId="0" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${align(horizontal)}</xf>`;
  // Ô gộp nội dung chỉ có viền ngoài, không kẻ ngang xuyên qua nội dung.
  const mergedBorders=[['left','right','top'],['left','right'],['left','right','bottom']].map(sides=>`<border>${['left','right','top','bottom'].map(side=>sides.includes(side)?`<${side} style="thin"><color rgb="FF000000"/></${side}>`:`<${side}/>`).join('')}<diagonal/></border>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${S_NS}"><fonts count="3">${[0,1,2].map(i=>`<font>${i?'<b/>':''}<sz val="${i===2?13:10}"/><color rgb="FF000000"/><name val="Times New Roman"/></font>`).join('')}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="5"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left','right','top','bottom'].map(side=>`<${side} style="thin"><color rgb="FF000000"/></${side}>`).join('')}<diagonal/></border>${mergedBorders}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10">${xf(0,1,'left')}${xf(1,1,'center')}${xf(0,1,'center')}${xf(2,0,'center')}${xf(0,0,'center')}${xf(0,1,'left')}${xf(1,1,'center')}${xf(0,2,'left')}${xf(0,3,'left')}${xf(0,4,'left')}</cellXfs></styleSheet>`;
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
async function exportSchedule(format) {
  try {
    const c=cls();
    if(!scheduleExportEntries(c,ui.month).length)throw Error('Chưa có lịch gặp dự kiến trong tháng này.');
    const month=ui.month;
    format=format||await appDialog('Chọn định dạng tải về. Bố cục in A4 dọc.','export');
    if(!format)return;
    if(!['word','excel'].includes(format))return;
    downloadFile(format==='word'?buildScheduleWord(c,month):buildScheduleWorkbook(c,month),`Lich_gap_${c.id}_${month.replace('/','-')}.${format==='word'?'docx':'xlsx'}`);
  }catch(error){appAlert(error.message);}
}

/** Word thật (OOXML), bảng cố định, viền đen và ô nội dung gộp dọc; không đổi dữ liệu nguồn. */
function buildScheduleWord(c=cls(),month=ui.month) {
  const entries=scheduleExportEntries(c,month);
  if(!entries.length)throw Error('Chưa có lịch gặp dự kiến trong tháng này.');
  const widths=[500,2600,2050,1550,3800],total=widths.reduce((a,b)=>a+b,0);
  // Giảm cỡ chữ theo số dòng, giữ nguyên mọi lượt hẹn; dữ liệu quá dài vẫn được sang trang.
  const lines=entries.reduce((n,e)=>n+Math.max(1,e.appointments.length),0);
  const size=lines>55?16:lines>42?18:20;
  const p=(text,bold=false,center=false)=>`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${size*12}" w:lineRule="auto"/><w:jc w:val="${center?'center':'left'}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="${size}"/><w:color w:val="000000"/>${bold?'<w:b/>':''}</w:rPr>${String(text).split('\n').map((line,i)=>`${i?'<w:br/>':''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('')}</w:r></w:p>`;
  const cell=(text,i,merge='',bold=false)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/><w:vAlign w:val="center"/>${merge?`<w:vMerge w:val="${merge}"/>`:''}</w:tcPr>${p(text,bold,i===0||i===2||i===3)}</w:tc>`;
  let rows=`<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${['STT','Họ và tên học sinh','Giờ','Ngày','Nội dung'].map((t,i)=>cell(t,i,'',true)).join('')}</w:tr>`;
  entries.forEach(({student,appointments},index)=>{
    const values=[index+1,student.name,appointments.map(scheduleExportTime).join('\n'),appointments.map(scheduleExportDate).join('\n'),index===0?SCHEDULE_EXPORT_CONTENT:''];
    rows+=`<w:tr><w:trPr><w:cantSplit/></w:trPr>${values.map((v,i)=>cell(v,i,i===4&&entries.length>1?(index===0?'restart':'continue'):'')).join('')}</w:tr>`;
  });
  const match=/^T(\d{2})\/(\d{4})$/.exec(month);
  const document=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(`DỰ KIẾN LỊCH LÀM VIỆC CÁ NHÂN\nVỚI HỌC SINH LỚP ${c.id}`,true,true)}${p(`Tháng ${Number(match[1])}/${match[2]}`,false,true)}<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="000000"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>${p('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="600" w:right="600" w:bottom="600" w:left="600" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`;
  return zipStore({'[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':document}).slice(0,undefined,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
