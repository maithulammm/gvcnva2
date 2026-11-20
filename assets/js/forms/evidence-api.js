"use strict";

const evidenceImageCache=new Map(),evidenceRequests=new Set();let evidenceGeneration=0;
const evidenceCleanupJobs=new Map(),evidenceCleanupTimes=new Map();
/** Xóa tệp sau khi báo cáo đã được máy chủ xác nhận; lỗi xóa không biến lần lưu thành thất bại. */
function scheduleEvidenceCleanup(classId,notify=false){
  if(!cloud.ready||!cloud.evidenceCleanup||!auth.account||!canViewPersonal())return;
  const owner=auth.email,epoch=cloud.epoch,key=owner+'|'+epoch+'|'+classId;
  if(evidenceCleanupJobs.has(key)||!notify&&Date.now()-(evidenceCleanupTimes.get(key)||0)<60000)return;
  evidenceCleanupTimes.set(key,Date.now());
  const job=(async()=>{
    let removed=0,pending=0;
    try{
      for(let batch=0;batch<6&&owner===auth.email&&epoch===cloud.epoch;batch++){
        const result=await databaseRequest('/classes/'+classId+'/evidence/cleanup','POST',{}, {silent:true});
        removed+=result.deleted||0;pending=result.pending||0;
        if(!pending||!result.deleted)break;
      }
      if(notify&&pending&&owner===auth.email&&epoch===cloud.epoch)toast('Đã lưu dữ liệu. Ảnh còn chờ xóa sẽ được tự động thử lại.');
    }catch{
      if(notify&&owner===auth.email&&epoch===cloud.epoch)toast('Đã lưu dữ liệu. Tác vụ xóa ảnh sẽ được thử lại.');
    }finally{
      if(removed&&owner===auth.email&&epoch===cloud.epoch&&ui.classId===classId){clearEvidenceImages();if(ui.page==='m03')render();}
      evidenceCleanupJobs.delete(key);
    }
  })();
  evidenceCleanupJobs.set(key,job);
  return job;
}
/** Thu hồi URL ảnh khi rời trang/đăng xuất; không dùng cache của người trước cho phiên sau. */
function clearEvidenceImages(){
  evidenceObserver?.disconnect();
  evidenceGeneration++;
  for(const controller of evidenceRequests)controller.abort();evidenceRequests.clear();
  for(const entry of evidenceImageCache.values())if(entry.url)URL.revokeObjectURL(entry.url);
  evidenceImageCache.clear();
  const viewer=$('evidenceViewer');viewer?.close();$('evidenceFullImage')?.removeAttribute?.('src');
}
function evidenceThumbnail(meta,{editorIndex,recordId='',index=0,preview='',disabled=false}={}){
  let path='';
  if(meta?.provider==='school')path='/evidence/'+ui.classId+'/'+meta.id;
  if(meta?.provider==='legacy'&&recordId)path='/evidence/'+ui.classId+'/legacy/'+ui.month.replace('/','-')+'/'+recordId+'/'+meta.id;
  if(meta?.provider==='legacy'&&editorIndex!==undefined&&ui.editing?.id)path='/evidence/'+ui.classId+'/legacy/'+ui.month.replace('/','-')+'/'+ui.editing.id+'/'+meta.id;
  return `<span class="evidence-thumb"><button type="button" class="evidence-image-button" title="Xem ảnh minh chứng" aria-label="Xem ảnh minh chứng ${index+1}" onclick="openEvidenceImage(this)"><img ${preview?`src="${esc(preview)}"`:''} ${path?`data-evidence-path="${esc(path)}"`:''} alt="Ảnh minh chứng" loading="lazy"><span class="evidence-image-state">${preview?'':'Đang tải ảnh'}</span></button>
    ${editorIndex!==undefined?`<button type="button" class="evidence-remove" ${disabled?'disabled':''} title="Gỡ ảnh" aria-label="Gỡ ảnh minh chứng ${editorIndex+1}" onclick="removeEvidenceImage(${editorIndex})">×</button>`:''}</span>`;
}
async function evidenceApi(path,options={}){
  const epoch=cloud.epoch,owner=auth.email,token=await acquireMicrosoftIdToken();
  if(epoch!==cloud.epoch||owner!==auth.email)throw Error('Phiên làm việc đã thay đổi.');
  const response=await fetch(FIREBASE_API_URL+path,{...options,cache:'no-store',headers:{Authorization:'Bearer '+token,...options.headers}});
  let data;try{data=await response.json();}catch{throw Error('Kho ảnh chưa sẵn sàng.');}
  if(epoch!==cloud.epoch||owner!==auth.email)throw Error('Phiên làm việc đã thay đổi.');
  if(!response.ok)throw Error(response.status===404?'Ảnh hoặc API kho ảnh chưa sẵn sàng.':data.error||'Không truy cập được ảnh minh chứng.');
  return data;
}
async function evidenceImageUrl(path){
  const key=auth.email+'|'+cloud.epoch+'|'+path,existing=evidenceImageCache.get(key);if(existing)return existing.promise;
  const generation=evidenceGeneration,controller=new AbortController(),entry={};evidenceRequests.add(controller);
  const timer=setTimeout(()=>controller.abort(),45000);
  entry.promise=(async()=>{
    const data=await evidenceApi(path,{signal:controller.signal});
    if(generation!==evidenceGeneration)throw Error('Trang đã thay đổi.');
    if(!['image/jpeg','image/png','image/webp'].includes(data.mimeType)||typeof data.contentBase64!=='string'||data.contentBase64.length>7*1024*1024)throw Error('Ảnh không hợp lệ.');
    const bytes=Uint8Array.from(atob(data.contentBase64),char=>char.charCodeAt(0));
    entry.url=URL.createObjectURL(new Blob([bytes],{type:data.mimeType}));return entry.url;
  })().catch(error=>{evidenceImageCache.delete(key);throw error;}).finally(()=>{clearTimeout(timer);evidenceRequests.delete(controller);});
  evidenceImageCache.set(key,entry);return entry.promise;
}
async function loadEvidenceThumbnail(img){
  const label=img.parentElement.querySelector('.evidence-image-state');
  // Giữ vòng xoay đến khi trình duyệt giải mã xong ảnh, không chỉ chờ API trả về.
  label.innerHTML='<span class="request-spinner" role="status" aria-label="Đang tải ảnh"></span>';
  try{const url=await evidenceImageUrl(img.dataset.evidencePath);if(!img.isConnected)return;img.src=url;if(img.decode)await img.decode();label.textContent='';}
  catch{if(img.isConnected){label.textContent='Chưa tải được ảnh';img.removeAttribute('src');}}
}
let evidenceObserver;
function hydrateEvidenceImages(root=document){
  for(const img of root.querySelectorAll?.('img[data-evidence-path]')||[]){
    if(img.dataset.observed)continue;img.dataset.observed='true';
    if(typeof IntersectionObserver==='undefined'){loadEvidenceThumbnail(img);continue;}
    evidenceObserver ||= new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){evidenceObserver.unobserve(entry.target);loadEvidenceThumbnail(entry.target);}},{rootMargin:'100px'});
    evidenceObserver.observe(img);
  }
}
async function openEvidenceImage(button){
  const img=button.querySelector('img'),generation=evidenceGeneration;
  const state=button.querySelector('.evidence-image-state');
  state.innerHTML='<span class="request-spinner" role="status" aria-label="Đang tải ảnh"></span>';
  try{
    const url=img.dataset.evidencePath?await evidenceImageUrl(img.dataset.evidencePath):img.getAttribute('src');
    if(!url||!url.startsWith('blob:'))throw Error('Ảnh cũ cần được chuyển vào kho ảnh tập trung.');
    if(generation!==evidenceGeneration||!auth.account)return;
    img.src=url;button.querySelector('.evidence-image-state').textContent='';
    $('evidenceFullImage').src=url;$('evidenceViewer').showModal();
  }catch(error){state.textContent='Chưa tải được ảnh';appAlert(error.message);}
}
async function uploadSchoolEvidence(editor){
  const state=editor.evidence;if(!state)return [];
  if(state.busy)throw Error('Đang xử lý ảnh. Vui lòng chờ.');
  if(!state.entries.some(item=>!item.meta))return state.entries.map(item=>item.meta);
  const studentId=$('entryForm').querySelector('[name="studentId"]')?.value;
  if(!studentId)throw Error('Hãy chọn học sinh trước khi lưu ảnh.');
  state.busy=true;const controller=state.controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),120000);
  try{
    for(const [index,item]of state.entries.entries()){
      if(item.meta)continue;
      if(!evidenceCurrent(editor))throw Error('Phiên hoặc dữ liệu đã thay đổi.');
      state.status='Đang lưu ảnh '+(index+1)+'/'+state.entries.length+'…';renderEvidenceEditor();
      const bytes=new Uint8Array(await item.file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const uploaded=await evidenceApi('/evidence/'+editor.classId+'/upload',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({month:editor.month,studentId,uploadId:item.uploadId,contentBase64:btoa(binary)})});
      const meta=evidenceMetadata(uploaded);if(meta?.provider!=='school')throw Error('Kho ảnh trả kết quả chưa hợp lệ.');
      if(!evidenceCurrent(editor))throw Error('Phiên hoặc dữ liệu đã thay đổi.');
      item.meta=meta;saveEditorDraft();
    }
    state.status='Đã lưu ảnh minh chứng.';return state.entries.map(item=>item.meta);
  }catch(error){state.status=error.name==='AbortError'?'Tải ảnh quá thời gian chờ. Hãy thử lại.':error.message;throw Error(state.status);}
  finally{clearTimeout(timer);state.busy=false;state.controller=null;if(ui.editing===editor)renderEvidenceEditor();}
}
