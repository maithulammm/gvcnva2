import {requireValue,YEAR} from './model.mjs';

const MAX_IMAGE_BYTES=2*1024*1024;
export function centralEvidenceConfigured(env){return (env.EVIDENCE_AUTH_MODE==='application'?['EVIDENCE_CLIENT_ID','EVIDENCE_CLIENT_SECRET','EVIDENCE_DRIVE_ID','EVIDENCE_ROOT_ID']:['EVIDENCE_CLIENT_ID','EVIDENCE_CLIENT_SECRET']).every(k=>String(env[k]||'').trim());}
/** Graph chỉ chạy phía máy chủ; ứng dụng được cấp quyền write riêng trên thư mục kho ảnh. */
export function createEvidenceStore(env,{fetchImpl=fetch,clock=()=>Date.now(),loadConnection,saveConnection}={}){
  requireValue(centralEvidenceConfigured(env),'Kho ảnh chưa được quản trị viên cấu hình.',503);
  let cached,refreshing,connection;
  const delegated=env.EVIDENCE_AUTH_MODE!=='application';
  const driveId=()=>delegated?connection?.driveId:env.EVIDENCE_DRIVE_ID;
  const rootId=()=>delegated?connection?.rootId:env.EVIDENCE_ROOT_ID;
  async function token(){
    if(cached?.until>clock()+60000)return cached.value;
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      if(delegated){
        requireValue(loadConnection&&saveConnection,'Admin cần kết nối kho ảnh.',503);
        connection=await loadConnection();
      }
      const grant=delegated?{grant_type:'refresh_token',refresh_token:connection.refreshToken}:{grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'};
      const response=await fetchImpl('https://login.microsoftonline.com/'+encodeURIComponent(env.MICROSOFT_TENANT_ID)+'/oauth2/v2.0/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(45000),body:new URLSearchParams({client_id:env.EVIDENCE_CLIENT_ID,client_secret:env.EVIDENCE_CLIENT_SECRET,...grant})});
      requireValue(response.ok,delegated?'Admin cần kết nối lại kho ảnh.':'Kho ảnh chưa được cấp quyền kết nối.',503);
      const data=await response.json();requireValue(data.access_token&&Number(data.expires_in)>60,'Kho ảnh chưa sẵn sàng.',503);
      if(delegated&&data.refresh_token){connection={...connection,refreshToken:data.refresh_token};await saveConnection(connection);}
      cached={value:data.access_token,until:clock()+Math.min(Number(data.expires_in),3600)*1000};return cached.value;
    })();try{return await refreshing;}finally{refreshing=null;}
  }
  async function graph(path,options={}){
    for(let attempt=0;attempt<2;attempt++){
      const accessToken=await token();
      const response=await fetchImpl('https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId())+path,{...options,headers:{Authorization:'Bearer '+accessToken,...options.headers},signal:AbortSignal.timeout(45000)});
      if(delegated&&attempt===0&&[401,403].includes(response.status)){cached=null;await response.arrayBuffer();continue;}
      if([429,503].includes(response.status))throw Object.assign(Error('Kho ảnh đang bận. Tác vụ sẽ được thử lại.'),{status:503,retryAfter:Number(response.headers.get('retry-after'))||60});
      requireValue(response.ok,'Không thể truy cập kho ảnh. Vui lòng thử lại hoặc liên hệ quản trị viên.',response.status===404?404:response.status===409?409:503);
      return response.status===204?null:response.json();
    }
  }
  async function folder(parent,name){
    const item='/items/'+encodeURIComponent(parent);
    try{const found=await graph(item+':/'+encodeURIComponent(name));requireValue(found.folder,'Cấu trúc kho ảnh không hợp lệ.',503);return found.id;}
    catch(error){if(error.status!==404)throw error;
      try{return (await graph(item+'/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})})).id;}
      catch(conflict){if(conflict.status!==409)throw conflict;const found=await graph(item+':/'+encodeURIComponent(name));requireValue(found.folder,'Cấu trúc kho ảnh không hợp lệ.',503);return found.id;}
    }
  }
  /** Workers không hỗ trợ redirect:error. Theo từng Location và không gửi Bearer sang host tải ảnh. */
  async function downloadImage(start){
    let url;
    try{url=new URL(start);}catch{throw Object.assign(Error('Kho ảnh chưa trả địa chỉ tải hợp lệ. Hãy thử lại.'),{status:503});}
    const signal=AbortSignal.timeout(45000);
    for(let hop=0;hop<5;hop++){
      const graphHost=url.hostname==='graph.microsoft.com';
      requireValue(url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&
        (graphHost||url.hostname.endsWith('.sharepoint.com')||url.hostname.endsWith('.1drv.com')),'Kho ảnh trả địa chỉ tải không hợp lệ.',503);
      let response;
      try{response=await fetchImpl(url,{signal,redirect:'manual',...(graphHost?{headers:{Authorization:'Bearer '+await token()}}:{})});}
      catch{throw Object.assign(Error('Kết nối tải ảnh tạm thời gián đoạn. Vui lòng thử lại.'),{status:503});}
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');await response.body?.cancel();
        requireValue(location,'Kho ảnh thiếu địa chỉ chuyển tiếp. Vui lòng thử lại.',503);
        try{url=new URL(location,url);}catch{throw Object.assign(Error('Địa chỉ chuyển tiếp của ảnh không hợp lệ.'),{status:503});}
        continue;
      }
      requireValue(response.ok&&response.body,'Không đọc được ảnh. Vui lòng thử lại.',response.status===404?404:503);
      return response;
    }
    throw Object.assign(Error('Kho ảnh chuyển tiếp quá nhiều lần. Vui lòng thử lại.'),{status:503});
  }
  return {
    /** Xóa vĩnh viễn đúng một ảnh trong kho/lớp/tháng; tuyệt đối không xóa thư mục. */
    async remove(item,{classId,month,key,legacy=false,protectedImageIds=[]}){
      await token();
      requireValue(item.driveId===driveId()&&item.itemId!==rootId(),'Ảnh không thuộc kho đang kết nối.',403);
      const path='/items/'+encodeURIComponent(item.itemId);let node;
      try{node=await graph(path+'?$select=id,name,file,parentReference');}
      catch(error){if(error.status===404)return;throw error;}
      requireValue(['image/jpeg','image/png','image/webp'].includes(node.file?.mimeType),'Chỉ được xóa tệp ảnh minh chứng.',403);
      if(protectedImageIds.some(id=>node.name===id+'.jpg'))return {retained:true};
      if(!legacy)requireValue(node.name===key+'.jpg','Tên ảnh không khớp chỉ mục minh chứng.',403);
      for(const name of [...(item.recordType==='meetings'?['Gap-hoc-sinh']:[]),month.replace('/','-'),classId,YEAR]){
        requireValue(node.parentReference?.id,'Ảnh không thuộc thư mục minh chứng.',403);
        node=await graph('/items/'+encodeURIComponent(node.parentReference.id)+'?$select=id,name,parentReference');
        requireValue(node.name===name,'Ảnh không thuộc lớp/tháng cần xóa.',403);
      }
      requireValue(node.parentReference?.id===rootId(),'Ảnh không thuộc thư mục kho.',403);
      try{await graph(path+'/permanentDelete',{method:'POST'});}
      catch(error){if(error.status!==404)throw error;}
    },
    async upload({id,classId,month,contentBase64,recordType='connections'}){
      requireValue(['meetings','connections'].includes(recordType),'Loại minh chứng không hợp lệ.');
      requireValue(typeof contentBase64==='string'&&contentBase64.length<=Math.ceil(MAX_IMAGE_BYTES/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64),'Ảnh không hợp lệ hoặc vượt 2 MB.');
      const bytes=Buffer.from(contentBase64,'base64');requireValue(bytes.length>3&&bytes.length<=MAX_IMAGE_BYTES&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255,'Chỉ nhận ảnh JPEG hợp lệ, tối đa 2 MB.');
      await token();let parent=rootId();for(const name of [YEAR,classId,month.replace('/','-'),...(recordType==='meetings'?['Gap-hoc-sinh']:[])])parent=await folder(parent,name);
      const file=await graph('/items/'+encodeURIComponent(parent)+':/'+id+'.jpg:/content',{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:bytes});
      requireValue(file.id&&file.parentReference?.driveId===driveId(),'Kho ảnh trả kết quả chưa hợp lệ.',503);
      return {itemId:file.id,driveId:driveId(),size:bytes.length,mimeType:'image/jpeg',...(recordType==='meetings'?{recordType}:{})};
    },
    async read(item,{legacy=false,classId,month}={}){
      if(delegated)await token();
      requireValue(item.driveId===driveId(),'Ảnh cũ chưa có trong kho ảnh tập trung.',404);
      const path='/items/'+encodeURIComponent(item.itemId);
      if(legacy){
        // Ảnh cũ chỉ được đọc nếu thực sự nằm trong thư mục năm/lớp/tháng của bản ghi.
        let node=await graph(path+'?$select=id,parentReference');
        for(const name of [month.replace('/','-'),classId,YEAR]){
          requireValue(node.parentReference?.id,'Ảnh cũ chưa có trong kho chung.',404);
          node=await graph('/items/'+encodeURIComponent(node.parentReference.id)+'?$select=id,name,parentReference');
          requireValue(node.name===name,'Ảnh không thuộc thư mục của lớp.',403);
        }
        requireValue(node.parentReference?.id===rootId(),'Ảnh không thuộc kho chung.',403);
      }
      const meta=await graph(path+'?$select=id,file,size,@microsoft.graph.downloadUrl');
      requireValue(['image/jpeg','image/png','image/webp'].includes(meta.file?.mimeType)&&meta.size<=5*1024*1024,'Ảnh không hợp lệ.',400);
      // URL tải có chữ ký chỉ được dùng trong server; không gửi Location hay token xuống web.
      // Nếu metadata thiếu downloadUrl, endpoint /content sẽ cấp URL tải mới qua HTTP 302.
      const start=meta['@microsoft.graph.downloadUrl']||'https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId())+path+'/content';
      const response=await downloadImage(start);
      const chunks=[];let length=0;const reader=response.body.getReader();
      try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5*1024*1024){await reader.cancel();throw Object.assign(Error('Ảnh vượt dung lượng cho phép.'),{status:413});}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
      return {mimeType:meta.file.mimeType,contentBase64:Buffer.concat(chunks).toString('base64')};
    }
  };
}
