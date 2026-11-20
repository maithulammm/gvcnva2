"use strict";

// M03: ảnh qua API có phân quyền; báo cáo chỉ giữ mã ảnh, không giữ token hoặc nội dung ảnh.
const EVIDENCE_LIMIT=5, EVIDENCE_MAX_BYTES=10*1024*1024;

/** Chỉ cho mở đường dẫn Microsoft HTTPS, không tin URL tùy ý trong bản sao lưu. */
function evidenceWebUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&
    (u.hostname.endsWith('.sharepoint.com')||u.hostname==='onedrive.live.com')?u.href:'';}catch{return '';}
}
function evidenceMetadata(value){
  if(value&&['school','legacy'].includes(value.provider)&&/^[a-f0-9]{64}$/.test(value.id))
    return {provider:value.provider,id:value.id,...(value.provider==='school'?{size:Number(value.size)||0,mimeType:'image/jpeg'}:{})};
  if(!value||value.provider!=='onedrive'||!value.itemId||!value.driveId||!evidenceWebUrl(value.webUrl))return null;
  return {provider:'onedrive',itemId:String(value.itemId),driveId:String(value.driveId),
    name:String(value.name||'Ảnh minh chứng').slice(0,200),webUrl:evidenceWebUrl(value.webUrl),
    size:Number(value.size)||0,mimeType:String(value.mimeType||'image/jpeg'),
    uploadedBy:String(value.uploadedBy||''),uploadedAt:String(value.uploadedAt||'')};
}
function connectionEvidenceLinks(record){
  return (Array.isArray(record.evidenceImages)?record.evidenceImages:[]).map(evidenceMetadata).filter(Boolean)
    .map((a,index)=>evidenceThumbnail(a,{recordId:record.id,index})).join('')||'—';
}
function resetEvidenceEditor(){
  const state=ui.editing?.evidence;if(!state)return;
  state.controller?.abort();
  for(const item of state.entries)if(item.preview)URL.revokeObjectURL(item.preview);
}
function initEvidenceEditor(record){
  ui.editing.evidence={entries:(Array.isArray(record.evidenceImages)?record.evidenceImages:[])
    .map(evidenceMetadata).filter(Boolean).map(meta=>({meta})),busy:false,status:'',controller:null};
}
function evidenceCurrent(editor){return ui.editing===editor&&editorContextCurrent()&&editable();}
function evidenceEditorHtml(){
  return `<section class="wide evidence-editor" aria-label="Ảnh minh chứng kết nối phụ huynh">
    <div class="evidence-heading"><b>Ảnh minh chứng <small>Không bắt buộc</small></b><span>Tối đa 5 ảnh</span></div>
    <div class="evidence-tools"><label class="btn small evidence-file-label">＋ Chọn ảnh<input id="evidenceFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange="addEvidenceFiles(this.files);this.value='' "></label>
    </div>
    <div id="evidencePaste" class="evidence-paste" tabindex="0" role="group" aria-label="Bấm vào đây và dán ảnh chụp màn hình" onpaste="pasteEvidenceImages(event)">Bấm vào đây rồi Ctrl+V để dán ảnh chụp màn hình</div>
    <div id="evidenceList" class="evidence-list"></div><p id="evidenceStatus" class="help" role="status" aria-live="polite"></p>
    <small class="help">Bấm ảnh để xem lớn. Ảnh được lưu khi bấm Lưu thông tin.</small></section>`;
}
function renderEvidenceEditor(){
  const state=ui.editing?.evidence,host=$('evidenceList');if(!state||!host)return;
  host.innerHTML=state.entries.map((item,i)=>evidenceThumbnail(item.meta,{editorIndex:i,preview:item.preview,disabled:state.busy})).join('');
  $('evidenceStatus').textContent=state.status||'';
  if(state.busy)$('evidenceStatus').insertAdjacentHTML('afterbegin','<span class="request-spinner" aria-hidden="true"></span> ');
  $('evidenceFiles').disabled=state.busy;
  hydrateEvidenceImages(host);
}
/** Giải mã rồi vẽ lại ảnh raster; không đưa SVG/HTML hoặc tên tệp gốc vào OneDrive. */
async function prepareEvidenceImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>EVIDENCE_MAX_BYTES)
    throw Error('Chỉ chọn JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.');
  const image=await createImageBitmap(file);
  try{
    const scale=Math.min(1,2000/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
    if(!blob||blob.size>2*1024*1024)throw Error('Ảnh quá lớn sau khi nén (tối đa 2 MB). Hãy chọn ảnh nhỏ hơn.');
    return blob;
  }finally{image.close();}
}
async function addEvidenceFiles(files){
  const editor=ui.editing,state=editor?.evidence;
  if(!state||state.busy||!evidenceCurrent(editor))return;
  const selected=Array.from(files||[]);if(!selected.length)return;
  if(selected.length+state.entries.length>EVIDENCE_LIMIT)return appAlert('Mỗi lần kết nối được đính kèm tối đa 5 ảnh.');
  state.busy=true;state.status='Đang chuẩn bị ảnh…';renderEvidenceEditor();
  try{
    for(const file of selected){
      const blob=await prepareEvidenceImage(file);
      if(!evidenceCurrent(editor))return;
      state.entries.push({file:blob,preview:URL.createObjectURL(blob),uploadId:newID()});
    }
    state.status='Bấm Lưu thông tin để lưu ảnh minh chứng.';
  }catch(error){state.status=error.message||'Không đọc được ảnh. Hãy chọn lại.';}
  finally{state.busy=false;if(ui.editing===editor)renderEvidenceEditor();}
}
function pasteEvidenceImages(event){
  const files=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
  if(files.length){event.preventDefault();addEvidenceFiles(files);}
}
async function removeEvidenceImage(index){
  const editor=ui.editing,state=editor?.evidence,item=state?.entries[index];
  if(!item||state.busy||!evidenceCurrent(editor))return;
  if(item.meta&&!await appConfirm('Gỡ ảnh khỏi lần kết nối này? Ảnh gốc vẫn được giữ trong kho lưu trữ.'))return;
  if(!evidenceCurrent(editor)||state.entries[index]!==item)return;
  if(item.preview)URL.revokeObjectURL(item.preview);
  state.entries.splice(index,1);saveEditorDraft();renderEvidenceEditor();
}
/** Upload through the school API, never through a teacher Graph token. */
async function uploadConnectionEvidence(editor){return uploadSchoolEvidence(editor);}
async function requestCloseEditor(){
  const editor=ui.editing,state=editor?.evidence;
  if(state?.busy)return toast('Đang xử lý ảnh. Vui lòng chờ.');
  if(state?.entries.some(item=>!item.meta)&&!await appConfirm('Ảnh chưa lưu sẽ cần chọn lại khi mở biểu mẫu. Đóng cửa sổ?'))return;
  if(ui.editing===editor)$('editor').close();
}
