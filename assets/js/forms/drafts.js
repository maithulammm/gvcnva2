"use strict";

// Unsubmitted form drafts stay on this device and never count in reports.
const DRAFT_TYPES = ["m01","m02","m03","plans","previous","profile","m05detail"];

function workToday() {
  const now=new Date(), month=`T${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  return month===ui.month ? `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}` : "";
}

function editorContextCurrent() {
  const e=ui.editing;
  return !!e && e.classId===ui.classId && e.month===ui.month && e.epoch===cloud.epoch &&
    e.owner===auth.email && e.classObject===appData?.classes[e.classId] &&
    e.baseline===stableString(lookup(e.type,e.id)||{});
}

function editorDraftKey() {
  const e=ui.editing;
  if (!e || !DRAFT_TYPES.includes(e.type)) return null;
  const prefix=`VA_GVCN_FORM_DRAFT_V1_${encodeURIComponent(auth.email)}_${e.classId}_${e.month.replace('/','_')}_`;
  if(typeof e.seed?.draftKey==='string'&&e.seed.draftKey.startsWith(prefix))return e.seed.draftKey;
  return `VA_GVCN_FORM_DRAFT_V1_${encodeURIComponent(auth.email)}_${e.classId}_${e.month.replace('/','_')}_${e.type}_${e.id||e.seed?.studentId||'new'}_${e.seed?.sourcePlanId||e.seed?.appointmentId||''}`;
}

function restoreEditorDraft() {
  const key=editorDraftKey();
  if (!key || isRolePreview()) return null;
  try {
    const draft=JSON.parse(localStorage.getItem(key));
    if (draft?.schema!==1 || draft.baseline!==ui.editing.baseline) return null;
    const fields=Object.fromEntries(FIELDS[ui.editing.type].filter(([k])=>typeof draft.fields?.[k]==="string")
      .map(([k,,kind])=>[k,kind==="boolean"?draft.fields[k]==="1":kind==="choices"?JSON.parse(draft.fields[k]):draft.fields[k]]));
    if(ui.editing.type==='m02') for(const key of MEETING_EXTRA_FIELDS)
      if(typeof draft.fields?.[key]==='string') fields[key]=draft.fields[key];
    return fields;
  } catch { return null; }
}

function saveEditorDraft(form=$("entryForm")) {
  const key=editorDraftKey();
  if (!key || !editorContextCurrent() || !editable()) return;
  try {
    const fd=new FormData(form), fields={};
    for (const [key,,kind] of FIELDS[ui.editing.type])
      fields[key]=kind==="choices"?JSON.stringify(fd.getAll(key)):String(fd.get(key)||"");
    if(ui.editing.type==='m02') for(const key of MEETING_EXTRA_FIELDS)
      if(fd.get(key)!==null) fields[key]=String(fd.get(key)||'');
    const e=ui.editing,studentId=fields.studentId||(e.type==='m01'?e.id:lookup(e.type,e.id)?.studentId)||e.seed?.studentId||'';
    const seed=Object.fromEntries(['studentId','appointmentId','addAppointment','sourceMonth','sourcePlanId'].filter(k=>e.seed?.[k]!==undefined).map(k=>[k,e.seed[k]]));
    localStorage.setItem(key,JSON.stringify({schema:1,baseline:e.baseline,fields,
      context:{owner:auth.email,classId:e.classId,month:e.month,type:e.type,id:e.id,studentId,seed}}));
    $("editorDraftStatus").textContent="Đã giữ bản nháp trên máy này · Chưa ghi vào báo cáo.";
  } catch {
    $("editorDraftStatus").textContent="Không giữ được bản nháp. Hãy lưu thông tin trước khi đóng.";
  }
}

function clearEditorDraft() {
  const key=editorDraftKey();
  if (key) {
    try { localStorage.removeItem(key); } catch { /* Saved record remains intact. */ }
  }
}

function discardEditorDraft() {
  if (!ui.editing || !confirm("Bỏ bản nháp chưa lưu của biểu mẫu này?")) return;
  const {type,id,seed}=ui.editing;
  clearEditorDraft();
  openModal(type,id,seed);
}

function updateMeetingFields() {
  if (ui.editing?.type!=="m02") return;
  const form=$("entryForm");
  if (!form.querySelector) return;
  const field=key=>form.querySelector(`[name="${key}"]`);
  const student=field("studentId").value, profile=field("profileId");
  for (const option of profile.options) option.hidden=!!option.value && option.dataset.student!==student;
  if (profile.selectedOptions[0]?.hidden) profile.value="";
  for (const key of ["cooperation","profileProgress","profileNext"]) {
    const visible=key==="cooperation" ? field("needsCoop").value==="Có" : !!profile.value;
    const control=field(key);
    control.closest("[data-field]").hidden=!visible;
    control.disabled=!visible;
    control.required=visible;
  }
  updatePreviousMeetingPanel();
  refreshButtonChoices(form);
}
