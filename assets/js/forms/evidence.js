"use strict";

// M03: ảnh ở OneDrive; báo cáo chỉ giữ metadata, không giữ token hoặc nội dung ảnh.
const EVIDENCE_LIMIT=5, EVIDENCE_MAX_BYTES=10*1024*1024;
const EVIDENCE_SCOPES=['Files.ReadWrite'];

/** Chỉ cho mở đường dẫn Microsoft HTTPS, không tin URL tùy ý trong bản sao lưu. */
function evidenceWebUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&
    (u.hostname.endsWith('.sharepoint.com')||u.hostname==='onedrive.live.com')?u.href:'';}catch{return '';}
}
function evidenceMetadata(value){
  if(!value||value.provider!=='onedrive'||!value.itemId||!value.driveId||!evidenceWebUrl(value.webUrl))return null;
  return {provider:'onedrive',itemId:String(value.itemId),driveId:String(value.driveId),
    name:String(value.name||'Ảnh minh chứng').slice(0,200),webUrl:evidenceWebUrl(value.webUrl),
    size:Number(value.size)||0,mimeType:String(value.mimeType||'image/jpeg'),
    uploadedBy:String(value.uploadedBy||''),uploadedAt:String(value.uploadedAt||'')};
}
function connectionEvidenceLinks(record){
  return (Array.isArray(record.evidenceImages)?record.evidenceImages:[]).map(evidenceMetadata).filter(Boolean)
    .map(a=>`<a class="evidence-link" href="${esc(a.webUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a>`).join('')||'—';
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
    <button id="evidenceConnect" type="button" class="btn small" onclick="connectEvidenceOneDrive()">Kết nối OneDrive</button></div>
    <div id="evidencePaste" class="evidence-paste" tabindex="0" role="group" aria-label="Bấm vào đây và dán ảnh chụp màn hình" onpaste="pasteEvidenceImages(event)">Bấm vào đây rồi Ctrl+V để dán ảnh chụp màn hình</div>
    <div id="evidenceList" class="evidence-list"></div><p id="evidenceStatus" class="help" role="status" aria-live="polite"></p>
    <small class="help">Ảnh lưu trên OneDrive của bạn khi bấm Lưu thông tin. Người xem khác cần được cấp quyền mở tệp.</small></section>`;
}
function renderEvidenceEditor(){
  const state=ui.editing?.evidence,host=$('evidenceList');if(!state||!host)return;
  host.innerHTML=state.entries.map((item,i)=>`<div class="evidence-item">${item.preview?`<img src="${esc(item.preview)}" alt="Ảnh minh chứng ${i+1}">`:'<span class="evidence-saved" aria-hidden="true">✓</span>'}
    <div>${item.meta?`<a href="${esc(item.meta.webUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.meta.name)}</a>`:`<b>${esc(item.name)}</b>`}<small>${item.meta?'Đã tải lên OneDrive':'Chờ tải lên khi lưu'}</small></div>
    <button type="button" class="btn small danger" ${state.busy?'disabled':''} aria-label="Bỏ ảnh minh chứng ${i+1}" onclick="removeEvidenceImage(${i})">Bỏ ảnh</button></div>`).join('');
  $('evidenceStatus').textContent=state.status||'';
  $('evidenceFiles').disabled=state.busy;$('evidenceConnect').disabled=state.busy;
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
    if(!blob||blob.size>5*1024*1024)throw Error('Ảnh quá lớn sau khi nén. Hãy chọn ảnh nhỏ hơn.');
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
      state.entries.push({file:blob,preview:URL.createObjectURL(blob),name:'Minh chứng '+(state.entries.length+1),uploadName:'PHHS_'+newID()+'.jpg'});
    }
    state.status='Ảnh đang giữ trong cửa sổ này. Bấm Lưu thông tin để tải lên OneDrive.';
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
  if(item.meta&&!await appConfirm('Bỏ liên kết ảnh khỏi lần kết nối này? Tệp gốc trên OneDrive vẫn được giữ.'))return;
  if(!evidenceCurrent(editor)||state.entries[index]!==item)return;
  if(item.preview)URL.revokeObjectURL(item.preview);
  state.entries.splice(index,1);saveEditorDraft();renderEvidenceEditor();
}
/** Quyền Files.ReadWrite được xin riêng bằng thao tác rõ ràng, không thay cấu hình đăng nhập. */
async function connectEvidenceOneDrive(){
  const editor=ui.editing,state=editor?.evidence;if(!state||state.busy||!evidenceCurrent(editor))return;
  if(window.opener||window.parent!==window)return appAlert('Hãy kết nối OneDrive từ cửa sổ chính của ứng dụng.');
  state.busy=true;state.status='Đang kết nối OneDrive…';renderEvidenceEditor();
  try{
    const result=await auth.client.acquireTokenPopup({account:auth.account,scopes:EVIDENCE_SCOPES,loginHint:auth.email});
    if(!evidenceCurrent(editor))return;
    if(!result.accessToken||safeAccountEmail(result.account)!==auth.email)throw Error('Hãy chọn đúng tài khoản Microsoft đang đăng nhập.');
    state.status='Đã kết nối OneDrive. Bạn có thể lưu ảnh.';
  }catch{state.status='Chưa kết nối được OneDrive. Cần cấp quyền Files.ReadWrite; nếu trường chặn cấp quyền, hãy liên hệ quản trị Microsoft 365.';}
  finally{state.busy=false;if(ui.editing===editor)renderEvidenceEditor();}
}
/** Chỉ gọi Graph với URL cố định; Bearer token không được lưu vào Firebase hay bản nháp. */
async function evidenceGraph(path,token,controller,options={}){
  const response=await fetch('https://graph.microsoft.com/v1.0'+path,{...options,
    headers:{Authorization:'Bearer '+token,...options.headers},signal:controller.signal});
  if(!response.ok){const error=Object.assign(new Error(response.status===403?'OneDrive chưa cấp quyền ghi tệp.':response.status===401?'Phiên OneDrive hết hạn.':'Không thể tải ảnh lên OneDrive. Hãy kiểm tra mạng, dung lượng và thử lại.'),{status:response.status});throw error;}
  return response.json();
}
async function evidenceFolder(token,controller,parts){
  let parent='root',path='';
  for(const name of parts){
    path+=(path?'/':'')+encodeURIComponent(name);
    try{const item=await evidenceGraph('/me/drive/root:/'+path,token,controller);if(!item.folder)throw Error('Tên thư mục minh chứng đang được một tệp khác sử dụng.');parent='items/'+encodeURIComponent(item.id);}
    catch(error){
      if(error.status!==404)throw error;
      try{const item=await evidenceGraph('/me/drive/'+parent+'/children',token,controller,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})});parent='items/'+encodeURIComponent(item.id);}
      catch(conflict){if(conflict.status!==409)throw conflict;const item=await evidenceGraph('/me/drive/root:/'+path,token,controller);if(!item.folder)throw Error('Không tạo được thư mục minh chứng.');parent='items/'+encodeURIComponent(item.id);}
    }
  }
  return parent;
}
/** Tải tuần tự và giữ metadata sau từng ảnh; thử lại chỉ tải ảnh còn thiếu, tránh tạo bản trùng. */
async function uploadConnectionEvidence(editor){
  const state=editor.evidence;if(!state)return [];
  if(state.busy)throw Error('Đang xử lý ảnh. Vui lòng chờ.');
  if(!state.entries.some(item=>!item.meta))return state.entries.map(item=>item.meta);
  state.busy=true;const controller=state.controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),120000);
  try{
    let result;try{result=await auth.client.acquireTokenSilent({account:auth.account,scopes:EVIDENCE_SCOPES});}catch{throw Error('Bấm Kết nối OneDrive và cấp quyền trước khi lưu ảnh.');}
    if(!evidenceCurrent(editor)||!result.accessToken||safeAccountEmail(result.account)!==auth.email)throw Error('Phiên Microsoft đã thay đổi. Hãy mở lại biểu mẫu.');
    const folder=await evidenceFolder(result.accessToken,controller,['GVCN_MinhChung','2026-2027',editor.classId,editor.month.replace('/','-')]);
    for(const [index,item]of state.entries.entries()){
      if(item.meta)continue;
      if(!evidenceCurrent(editor))throw Error('Phiên hoặc dữ liệu đã thay đổi. Ảnh đã tải vẫn được giữ trên OneDrive.');
      state.status='Đang tải ảnh '+(index+1)+'/'+state.entries.length+'…';renderEvidenceEditor();
      const uploaded=await evidenceGraph('/me/drive/'+folder+':/'+encodeURIComponent(item.uploadName)+':/content',result.accessToken,controller,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:item.file});
      const meta=evidenceMetadata({provider:'onedrive',itemId:uploaded.id,driveId:uploaded.parentReference?.driveId,name:uploaded.name,
        webUrl:uploaded.webUrl,size:uploaded.size,mimeType:'image/jpeg',uploadedBy:auth.email,uploadedAt:new Date().toISOString()});
      if(!meta)throw Error('OneDrive chưa trả đủ thông tin ảnh. Hãy thử lại.');
      item.meta=meta;
      if(!evidenceCurrent(editor))throw Error('Phiên hoặc dữ liệu đã thay đổi. Ảnh đã tải vẫn được giữ trên OneDrive.');
      saveEditorDraft();
    }
    state.status='Đã tải ảnh lên OneDrive.';
    return state.entries.map(item=>item.meta);
  }catch(error){state.status=error.name==='AbortError'?'Tải ảnh quá thời gian chờ. Hãy thử lại.':error.message;throw Error(state.status);}
  finally{clearTimeout(timeout);state.busy=false;state.controller=null;if(ui.editing===editor)renderEvidenceEditor();}
}
async function requestCloseEditor(){
  const editor=ui.editing,state=editor?.evidence;
  if(state?.busy)return toast('Đang xử lý ảnh. Vui lòng chờ.');
  if(state?.entries.some(item=>!item.meta)&&!await appConfirm('Ảnh chưa tải lên OneDrive sẽ cần chọn lại khi mở biểu mẫu. Đóng cửa sổ?'))return;
  if(ui.editing===editor)$('editor').close();
}
