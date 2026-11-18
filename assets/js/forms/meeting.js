"use strict";

const MEETING_SUGGESTIONS = {
  concern:{placeholder:"Ví dụ: lo lắng về kết quả học tập, quan hệ bạn bè hoặc định hướng sau THPT…",
    values:["Kết quả học tập","Quan hệ bạn bè","Gia đình","Định hướng nghề nghiệp","Sức khỏe, cảm xúc","Nề nếp học tập"]},
  participation:{placeholder:"Ví dụ: HS chủ động chia sẻ hơn lần trước; cần gợi mở; chưa đủ điều kiện so sánh…",
    values:["Chưa đủ điều kiện so sánh","Chủ động trao đổi","Cần gợi mở","Tham gia tích cực hơn","Chưa ghi nhận thay đổi"]},
};
const PROGRESS_CHOICES = [["Chưa đủ căn cứ","Chưa ghi nhận"],["Có","Có tiến bộ"],["Không","Chưa tiến bộ"]];
const MEETING_EXTRA_FIELDS = ["actualDateTime","actualLocation",...Array.from({length:3},(_,i)=>["goal"+(i+1),"goalAmount"+(i+1),"goalUnit"+(i+1)]).flat()];

function parseMeetingActual(actual) {
  const text=String(actual||""),iso=text.match(/\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/),local=text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  const dateTime=iso?`${iso[1]}T${iso[2]}`:local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}T${local[4].padStart(2,'0')}:${local[5]}`:"";
  const parts=text.split(/\s*·\s*/);
  const timeMatch=iso||local,tail=timeMatch?text.slice(timeMatch.index+timeMatch[0].length).replace(/^[\s,;·-]+/,'').replace(/^(?:tại|ở)\s+/i,''):'';
  const location=parts.length>1?parts.slice(1).join(' · '):tail&&!/^[:Z+]/.test(tail)?tail:'';
  return {dateTime,location,legacyTime:parts[0]};
}

function meetingEditorValues(record) {
  const parsed=parseMeetingActual(record.actual),values={};
  values.actualDateTime=record.actualDateTime??parsed.dateTime;
  if (!values.actualDateTime && !ui.editing.id && /^\d{4}-\d{2}-\d{2}$/.test(record.actual||'')) {
    const now=new Date();values.actualDateTime=record.actual+'T'+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  }
  values.actualLocation=record.actualLocation??(parsed.location||`Phòng ${cls().id}`);
  for(let i=1;i<=3;i++) {
    const goal=record.goals?.find(g=>(g.position||record.goals.indexOf(g)+1)===i);
    values['goal'+i]=record['goal'+i]??goal?.text??(i===1?record.goal||'':'');
    values['goalAmount'+i]=record['goalAmount'+i]??goal?.amount??1;
    values['goalUnit'+i]=record['goalUnit'+i]??goal?.unit??'week';
  }
  return values;
}

function meetingTimeControls(record) {
  const v=meetingEditorValues(record),legacy=ui.editing.id&&!v.actualDateTime&&record.actual;
  return `<div class="meeting-time"><label>Ngày và giờ<input type="datetime-local" name="actualDateTime" value="${esc(v.actualDateTime)}" ${legacy?'':'required'}></label>
    <label>Địa điểm<input type="text" name="actualLocation" value="${esc(v.actualLocation)}" required maxlength="200"></label></div>
    ${legacy?`<p class="help">Thời gian đã lưu: ${esc(record.actual)}. Để trống ngày giờ để giữ nguyên.</p>`:''}
    <input type="hidden" name="actual" value="${esc(record.actual||'')}">`;
}

function meetingGoalControls(record) {
  const v=meetingEditorValues(record);
  return `<div class="meeting-goals">${[1,2,3].map(i=>`<div class="meeting-goal-row"><label>Mục tiêu ${i}${i===1?' *':''}<textarea name="goal${i}" rows="2" placeholder="${i===1?'Ví dụ: Hoàn thành bài tập đúng hạn':'Có thể để trống'}" ${i===1?'required':''}>${esc(v['goal'+i])}</textarea></label>
    <div><span>Thời hạn</span><div class="goal-duration"><input type="number" name="goalAmount${i}" aria-label="Số ngày hoặc tuần của mục tiêu ${i}" min="1" max="999" step="1" value="${esc(v['goalAmount'+i])}" ${i===1?'required':''}>
    <div class="meeting-options" role="group" aria-label="Đơn vị thời hạn mục tiêu ${i}">${[['day','ngày'],['week','tuần']].map(([value,label])=>`<label><input type="radio" name="goalUnit${i}" value="${value}" ${v['goalUnit'+i]===value?'checked':''}><span>${label}</span></label>`).join('')}</div></div></div></div>`).join('')}</div>
    <input type="hidden" name="goal" value="${esc(record.goal||'')}">`;
}

function meetingProgressControls(value) {
  return `<div class="meeting-options" role="group" aria-label="Có căn cứ tiến bộ trước – sau?">${PROGRESS_CHOICES.map(([key,label])=>`<label><input type="radio" name="progressEvidence" value="${key}" ${value===key?'checked':''} required><span>${label}</span></label>`).join('')}</div>`;
}

function meetingSuggestionControls(key,value) {
  const config=MEETING_SUGGESTIONS[key],selected=String(value).split(';').map(s=>s.trim());
  return `<textarea name="${key}" required placeholder="${esc(config.placeholder)}">${esc(value)}</textarea>
    <div class="meeting-suggestions">${config.values.map((text,i)=>`<button type="button" class="schedule-choice" data-suggestion="${key}:${i}" aria-pressed="${selected.includes(text)}" onclick="toggleMeetingSuggestion('${key}',${i})">${esc(text)}</button>`).join('')}</div>`;
}

function toggleMeetingSuggestion(key,index) {
  if (ui.editing?.type!=='m02'||!editorContextCurrent()||!editable()) return;
  const config=MEETING_SUGGESTIONS[key],text=config?.values[index];if(!text)return;
  const input=$('entryForm').querySelector(`[name="${key}"]`),parts=input.value.split(';').map(s=>s.trim()).filter(Boolean);
  input.value=(parts.includes(text)?parts.filter(t=>t!==text):[...parts,text]).join('; ');
  for(const button of $('entryForm').querySelectorAll(`[data-suggestion^="${key}:"]`)) {
    const i=Number(button.dataset.suggestion.split(':')[1]);
    button.setAttribute('aria-pressed',input.value.split(';').map(s=>s.trim()).includes(config.values[i]));
  }
  input.dispatchEvent(new Event('input',{bubbles:true}));
}

function serializeMeetingInputs(fd,record) {
  // Legacy integrations and old drafts can still supply the original fields.
  if(fd.get('actualDateTime')!==null) {
    const dateTime=String(fd.get('actualDateTime')||'').trim(),location=String(fd.get('actualLocation')||'').trim();
    const old=ui.editing.id?lookup('m02',ui.editing.id):null,initial=ui.editing.meetingInitial;
    const unchanged=old&&!old.actualDateTime&&dateTime===initial.actualDateTime&&location===initial.actualLocation;
    if(!location)throw Error('Cần nhập địa điểm gặp.');
    if(!unchanged) {
      if(!dateTime) {
        if(!old?.actual)throw Error('Cần chọn ngày và giờ gặp thực tế.');
        record.actual=parseMeetingActual(old.actual).legacyTime+' · '+location;
      } else {
        const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime);
        if(!match)throw Error('Ngày giờ gặp không hợp lệ.');
        const [,y,m,d,h,min]=match,dt=new Date(+y,+m-1,+d,+h,+min);
        if(dt.getFullYear()!==+y||dt.getMonth()!==+m-1||dt.getDate()!==+d||dt.getHours()!==+h||dt.getMinutes()!==+min)throw Error('Ngày giờ gặp không hợp lệ.');
        record.actualDateTime=dateTime;record.actual=`${d}/${m}/${y} ${h}:${min} · ${location}`;
      }
      record.actualLocation=location;
    } else record.actual=old.actual;
  }
  if(fd.get('goal1')!==null) {
    const goals=[];
    for(let i=1;i<=3;i++) {
      const text=String(fd.get('goal'+i)||'').trim();if(!text)continue;
      const amount=Number(fd.get('goalAmount'+i)),unit=fd.get('goalUnit'+i);
      if(!Number.isInteger(amount)||amount<1||amount>999||!['day','week'].includes(unit))throw Error(`Thời hạn mục tiêu ${i} không hợp lệ.`);
      goals.push({position:i,text,amount,unit});
    }
    if(!goals.some(g=>g.position===1))throw Error('Cần nhập ít nhất mục tiêu 1.');
    const old=ui.editing.id?lookup('m02',ui.editing.id):null,initial=ui.editing.meetingInitial;
    const unchanged=old&&!old.goals&&[1,2,3].every(i=>String(fd.get('goal'+i)||'')===String(initial['goal'+i])&&String(fd.get('goalAmount'+i))===String(initial['goalAmount'+i])&&fd.get('goalUnit'+i)===initial['goalUnit'+i]);
    if(unchanged)record.goal=old.goal;
    else {record.goals=goals;record.goal=goals.map(g=>`${g.position}. ${g.text} (${g.amount} ${g.unit==='week'?'tuần':'ngày'})`).join('\n');}
  }
  return record;
}
