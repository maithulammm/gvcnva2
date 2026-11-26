import { randomUUID,createHash } from 'node:crypto';
import {appointmentEntries,actualMeetingMirror} from './appointments.mjs';
import {backfillNovemberMeetings} from './november-backfill.mjs';
import {applyRecordPatch} from './record-patches.mjs';
import {evidenceReferences,evidenceStillUsed,queueRemovedEvidence,assertEvidenceNotRetired,stripRetiredEvidence} from './evidence-cleanup.mjs';
import {YEAR,GRADES,CLASSES,MONTHS,ROOT,emailKey,list,normalizeSchool,normalizeClass,encodeClass,blankClass,
  assignmentFor,scopeFor,checkScope,requireValue,validateClass,authorizeClassEdit,emptyMonth,validateReport,summary,
  USER_ROLES,rolesOf,gradesOf,hasRole,primaryRole,normalizeAssignment,gradeOf} from './model.mjs';
/**
 * Nghiệp vụ máy chủ: phân quyền, revision, transaction, lịch sử và khôi phục. Không lấy quyền từ
 * vai trò gửi lên bởi trình duyệt.
 */
export function createService(db,{adminEmail='lammt@vietanhschool.edu.vn',clock=()=>new Date(),historyStore=null,revisionCache=null}={}) {
  const ref=db.ref(ROOT);
  const now=()=>clock().toISOString();
  const legacyId=image=>createHash('sha256').update(JSON.stringify(image)).digest('hex');
  const read=async path=>(await db.ref(ROOT+'/'+path).get()).val();
  /** Chỉ đọc phân công và lịch chung; không tải báo cáo, ảnh và bản sao lưu toàn trường. */
  async function context(identity,{includeCalendar=true}={}){
    const key=emailKey(identity.email),[user,calendar]=await Promise.all([read('users/'+key),includeCalendar?read('calendar'):Promise.resolve(undefined)]);
    const s=normalizeSchool({users:{[key]:user},calendar});
    assignmentFor(s,identity);return s;
  }
  async function imageContext(identity,id,month,studentId){
    const s=await context(identity,{includeCalendar:false});
    // Kiểm tra quyền trước khi đọc tên học sinh hoặc nội dung tháng.
    evidenceAccess(s,identity,id);
    if(month){
      requireValue(MONTHS.includes(month),'Tháng không hợp lệ.');
      const [data,students]=await Promise.all([read('classes/'+id+'/data/months/'+month.replace('/','_')),
        studentId?read('classes/'+id+'/data/students'):Promise.resolve([])]);
      s.classes[id]={data:{students,months:{[month]:data||emptyMonth()}}};
    }
    return s;
  }
  /** Giao dịch cấp lớp giữ revision, liên kết M02–M05 và bản khôi phục cùng một lần ghi. */
  async function mutateClass(identity,id,action,operation,evidence={},checkedContext){
    if(!db.scoped)return mutate(identity,action,operation);
    requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
    const base=checkedContext||await context(identity);checkScope(assignmentFor(base,identity),id);
    const target=db.ref(ROOT+'/classes/'+id);let failure;
    // REST transaction reads the latest value with its ETag; a warm-up read would duplicate it.
    const result=await target.transaction(raw=>{
      failure=null;
      try{
        const s=normalizeSchool({...base,classes:{[id]:raw},evidence,
          recovery:{[id]:raw?.recovery||{}},recoveryBlobs:{[id]:raw?.recoveryBlobs||{}},audit:{}});
        operation(s,assignmentFor(s,identity));
        if(action)s.audit[randomUUID()]={action,actor:identity.email,oid:identity.oid,at:now()};
        const events={...raw?.events,...s.audit};
        // Lịch sử chi tiết gần nhất; các snapshot ngày/phiên bản có giới hạn riêng trong put().
        const keys=Object.keys(events).sort((a,b)=>events[b].at.localeCompare(events[a].at));
        return {...s.classes[id],recovery:s.recovery[id],recoveryBlobs:s.recoveryBlobs?.[id]||{},events:Object.fromEntries(keys.slice(0,2000).map(k=>[k,events[k]]))};
      }catch(error){failure=error;return undefined;}
    },undefined,false);
    if(failure)throw failure;
    requireValue(result.committed,'Lớp đã thay đổi. Vui lòng tải lại.',409);
    return normalizeSchool({...base,classes:{[id]:result.snapshot.val()}});
  }
  /** Cập nhật trạng thái xóa riêng tư; không đổi revision của báo cáo khi chạy lại tác vụ. */
  async function updateEvidenceState(id,operation){
    const target=db.scoped?db.ref(ROOT+'/classes/'+id):ref;let value;
    if(!db.scoped)await target.get();
    await target.transaction(raw=>{
      value=undefined;if(!raw)return undefined;
      const stored=db.scoped?raw:raw.classes?.[id];if(!stored)return undefined;
      value=operation(stored);
      if(value===undefined)return undefined;
      return raw;
    },undefined,false);
    return value;
  }
  function publicData(c){
    const copy=structuredClone(c);
    for(const m of Object.values(copy.months))for(const row of [...m.connections,...m.meetings])
      if(Array.isArray(row.evidenceImages))row.evidenceImages=row.evidenceImages.map(image=>image.provider==='onedrive'?{provider:'legacy',id:legacyId(image)}:image);
    return copy;
  }
  function evidenceAccess(s,identity,id,month,studentId,write=false){
    const u=assignmentFor(s,identity);checkScope(u,id);
    requireValue(hasRole(u,'admin')||hasRole(u,'gvcn')&&u.classId===id,'Không có quyền xem ảnh lớp này.',403);
    if(month){
      requireValue(MONTHS.includes(month),'Tháng không hợp lệ.');
      const c=entry(s,id).data;
      if(studentId)requireValue(c.students.some(st=>st.id===studentId),'Học sinh không thuộc lớp này.');
      if(write)requireValue(hasRole(u,'admin')||['draft','returned'].includes(c.months[month]?.approval.state||'draft'),'Báo cáo đã khóa.',403);
    }
  }
  /**
   * Chuẩn hóa nhiều vai trò và phạm vi khối; chỉ vai trò khối trưởng mới được nhận danh sách khối.
   */
  function roleFields(roles,grades=[]) {
    requireValue(Array.isArray(roles)&&roles.length>0&&roles.length<=USER_ROLES.length,'Chọn ít nhất một vai trò hợp lệ.');
    requireValue(new Set(roles).size===roles.length&&roles.every(role=>USER_ROLES.includes(role)),'Danh sách vai trò không hợp lệ.');
    requireValue(Array.isArray(grades),'Danh sách khối không hợp lệ.');
    const normalizedGrades=[...new Set(grades.map(String))];
    requireValue(normalizedGrades.length===grades.length&&normalizedGrades.every(grade=>Object.hasOwn(GRADES,grade)),'Danh sách khối không hợp lệ.');
    requireValue(roles.includes('lead')?normalizedGrades.length>0:normalizedGrades.length===0,'Vai trò khối trưởng cần một hoặc nhiều khối; vai trò khác không nhận khối.');
    return {roles:[...roles],role:primaryRole({roles}),grades:normalizedGrades,...(normalizedGrades.length===1?{grade:normalizedGrades[0]}:{grade:''})};
  }
  /**
   * Mọi thay đổi đi qua transaction: tải lại phân công thật, chạy nghiệp vụ và audit cùng một lần
   * ghi nguyên tử; lỗi thì hủy.
   */
  async function mutate(identity,action,operation,{bind=false}={}) {
    let error;
    // Warm the RTDB cache on cold starts: a transaction otherwise first receives null,
    // which would incorrectly deny an already provisioned teacher before its retry.
    await ref.get();
    const result=await ref.transaction(raw=>{
      error=null;
      // A null local cache must still let RTDB compare-and-swap/retry against
      // existing server data. Returning undefined here would abort too early.
      if(raw===null && !(bind && identity.email===adminEmail)) return null;
      try {
        const s=normalizeSchool(raw),key=emailKey(identity.email);
        if(bind) {
          if(!s.bootstrapAdminOid && identity.email===adminEmail) {
            requireValue(!Object.values(s.users).some(u=>hasRole(u,'admin')&&u.active!==false),'Admin đầu tiên đã được thiết lập.',403);
            s.users[key]={email:identity.email,name:identity.name||identity.email,role:'admin',roles:['admin'],active:true,oid:identity.oid};
            s.bootstrapAdminOid=identity.oid;
          }
          const user=s.users[key];
          requireValue(user && user.active!==false,'Tài khoản chưa được Admin phân công hoặc đã bị thu hồi quyền.',403);
          requireValue(!user.oid || user.oid===identity.oid,'Tài khoản Microsoft không khớp phân công đã liên kết.',403);
          user.oid=identity.oid;
        }
        const u=assignmentFor(s,identity);
        operation(s,u);
        if(action) s.audit[randomUUID()]={action,actor:identity.email,oid:identity.oid,at:now()};
        s.updatedAt=now();
        return s;
      } catch(e) { error=e; return undefined; }
    },undefined,false);
    if(error) throw error;
    requireValue(result.committed,'Dữ liệu đã thay đổi, vui lòng thử lại.',409);
    const school=normalizeSchool(result.snapshot.val());
    assignmentFor(school,identity);
    return school;
  }
  /**
   * Giải mã dữ liệu lớp và revision hiện tại từ cấu trúc lưu RTDB.
   */
  function entry(s,id) {
    const stored=s.classes[id];
    return {data:normalizeClass(id,stored?.data),revision:stored?.revision||0};
  }
  /** Snapshot dùng nội dung tháng theo hash: tháng không đổi chỉ lưu một lần, không nhân cả năm 50 lần. */
  function snapshotClass(s,id,old,info){
    s.recoveryBlobs ||= {};const blobs=s.recoveryBlobs[id] ||= {},monthRefs={};
    for(const [month,value]of Object.entries(encodeClass(old.data).months)){
      const hash=createHash('sha256').update(JSON.stringify(value)).digest('hex');
      blobs[hash]=value;monthRefs[month]=hash;
    }
    return {format:2,data:encodeClass({...old.data,months:{}}),monthRefs,revision:old.revision,...info};
  }
  function snapshotData(s,id,snapshot){
    const blobs={...s.recoveryBlobs?.[id],...s.classes[id]?.recoveryBlobs};
    const months={...snapshot.data.months};
    for(const [month,hash]of Object.entries(snapshot.monthRefs||{})){
      requireValue(blobs[hash],'Bản sao thiếu dữ liệu tháng; không thực hiện khôi phục.',409);
      months[month]=blobs[hash];
    }
    return {...snapshot.data,months};
  }
  function pruneSnapshotBlobs(s,id){
    const used=new Set(Object.values(s.recovery?.[id]||{}).flatMap(snapshot=>Object.values(snapshot.monthRefs||{})));
    for(const hash of Object.keys(s.recoveryBlobs?.[id]||{}))if(!used.has(hash))delete s.recoveryBlobs[id][hash];
  }
  /**
   * So bản trước/sau để ghi audit từng bản ghi, giữ snapshot trước thay đổi rồi tăng revision lớp.
   */
  function put(s,id,c,revision,identity) {
    const old=entry(s,id);
    // Every mutation path (old clients, approval, restore and record patches)
    // advances only changed month versions, so stale writes cannot bypass checks.
    for(const [month,m]of Object.entries(c.months)){
      const before=old.data.months[month]||{};
      const content=value=>{const {_revision,...rest}=value;return JSON.stringify(rest);};
      m._revision=(before._revision||0)+(content(before)!==content(m)?1:0);
    }
    assertEvidenceNotRetired(c,s.classes[id],s.evidence);
    const pendingEvidenceDeletes=queueRemovedEvidence(s.classes[id]||{},old.data,c,now(),identity.email);
    const records=value=>{
      const result={};
      for(const st of value.students)result['student:'+st.id]=st;
      for(const [month,m] of Object.entries(value.months)){
        for(const [studentId,plan] of Object.entries(m.schedule)){
          const entries=plan.appointments||[plan];
          for(const a of entries)result[month+':schedule:'+studentId+':'+(a.id||'legacy')]=a;
        }
        for(const type of ['meetings','connections','plans','previous'])for(const r of m[type]||[])result[month+':'+type+':'+r.id]=r;
      }
      return result;
    };
    const before=records(old.data),after=records(c),changes=[];
    for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(JSON.stringify(before[key])!==JSON.stringify(after[key]))changes.push({record:key,operation:!before[key]?'add':!after[key]?'delete':'edit'});
    if(changes.length)s.audit[randomUUID()]={action:'records:'+id,actor:identity.email,oid:identity.oid,at:now(),changes};
    s.recovery ||= {};
    const history=s.recovery[id] ||= {};
    const stamp=now(),day=stamp.slice(0,10);
    const snapshot=snapshotClass(s,id,old,{at:stamp,actor:identity.email});
    if(!history['day-'+day])history['day-'+day]={...snapshot,kind:'daily'};
    history['rev-'+revision]={...snapshot,kind:'revision'};
    // Giới hạn dung lượng: giữ tối đa 30 snapshot ngày và 20 phiên bản gần nhất mỗi lớp.
    for(const kind of ['day-','rev-']){
      const keys=Object.keys(history).filter(k=>k.startsWith(kind)).sort((a,b)=>history[b].at.localeCompare(history[a].at)||history[b].revision-history[a].revision);
      for(const key of keys.slice(kind==='day-'?30:20))delete history[key];
    }
    pruneSnapshotBlobs(s,id);
    s.classes[id]={...s.classes[id],pendingEvidenceDeletes,data:encodeClass(c),revision:revision+1,updatedAt:now(),updatedBy:identity.email};
  }
  function publicClass(s,id) {const value=entry(s,id);return {...value,data:publicData(value.data),cleanupPending:Object.keys(s.classes[id]?.pendingEvidenceDeletes||{}).length};}
  /** Sửa dữ liệu cũ trong giao dịch cấp lớp, có snapshot/revision; chỉ GVCN lớp đó hoặc Admin. */
  async function repairNovember(identity,id){
    return mutateClass(identity,id,null,(s,u)=>{
      requireValue(hasRole(u,'admin')||hasRole(u,'gvcn')&&u.classId===id,'Không có quyền đồng bộ lớp này.',403);
      const old=entry(s,id),copy=structuredClone(old.data),result=backfillNovemberMeetings(copy);
      if(result.added||result.linked){
        put(s,id,copy,old.revision,identity);
        s.audit[randomUUID()]={action:'backfill-november:'+id,actor:identity.email,oid:identity.oid,at:now(),...result};
      }
    });
  }
  /**
   * Chỉ trả chi tiết cho Admin/GVCN đúng lớp; BGH/khối trưởng nhận chỉ tiêu và lỗi đã bỏ nội dung
   * nhận diện cá nhân.
   */
  function publicBootstrap(s,identity,selectedIds) {
    const u=assignmentFor(s,identity),ids=selectedIds||scopeFor(u),classes={},revisions={},summaries={},checks={};
    let today;
    for(const id of ids) {
      const {data:c,revision}=entry(s,id); revisions[id]=revision;
      const detailAllowed=hasRole(u,'admin') || (hasRole(u,'gvcn')&&u.classId===id);
      if(detailAllowed) { classes[id]=publicData(c); continue; }
      classes[id]={...blankClass(id),teacher:c.teacher,months:{}}; summaries[id]={}; checks[id]={};
      for(const month of MONTHS) {
        summaries[id][month]=summary(c,month);
        today ||= new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock());
        const m=c.months[month]||emptyMonth();
        summaries[id][month].overdueAppointments=c.students.flatMap(st=>m.schedule[st.id]?.appointments||[]).filter(a=>a.date&&a.date<today&&!m.meetings.some(r=>r.appointmentId===a.id)).length;
        const v=validateReport(c,month);
        checks[id][month]={...v,errors:v.errors.map(e=>({key:e.key,message:'Cần GVCN bổ sung thông tin biểu mẫu.'})),warnings:v.warnings.map(e=>({key:e.key,message:'Báo cáo có nội dung cần lưu ý.'}))};
        classes[id].months[month]={...emptyMonth(),approval:{state:c.months[month]?.approval.state||'draft',history:[]}};
      }
    }
    return {schema:2,year:YEAR,evidenceCleanup:true,recordPatches:true,assignment:{role:u.role,roles:u.roles,classId:u.classId||'',grade:u.grade||'',grades:u.grades,display:u.name||identity.email},
      classes,revisions,summaries,checks,teachers:hasRole(u,'admin')?s.teachers:{},
      calendar:s.calendar,
      users:hasRole(u,'admin')?Object.values(s.users).map(user=>{
        const normalized=normalizeAssignment(user);
        return {email:normalized.email,name:normalized.name||normalized.email,roles:normalized.roles,
          classId:normalized.classId||'',grades:normalized.grades,active:normalized.active!==false,teacherId:normalized.teacherId||''};
      }):[],serverTime:now()};
  }
  return {
    /** Đọc lịch nghỉ riêng; vẫn xác minh phân công nhưng không tải dữ liệu 32 lớp. */
    async calendar(identity){
      const s=db.scoped?await context(identity):normalizeSchool((await ref.get()).val());
      assignmentFor(s,identity);return {calendar:s.calendar};
    },
    /** Chỉ hàng đợi do máy chủ tạo mới có thể gọi xóa; không nhận itemId từ trình duyệt. */
    async cleanupEvidence(identity,id,remove,{limit=2}={}){
      requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
      if(identity){const s=db.scoped?await context(identity):normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id);}
      const pending=db.scoped?await read('classes/'+id+'/pendingEvidenceDeletes'):
        (await ref.get()).val()?.classes?.[id]?.pendingEvidenceDeletes;
      let deleted=0;
      for(const key of Object.keys(pending||{}).filter(key=>!(pending[key].nextAttemptAt>clock().getTime())&&!(pending[key].leaseUntil>clock().getTime())).slice(0,Math.min(limit,2))){
        const claim=randomUUID(),stamp=clock().getTime();
        let task=await updateEvidenceState(id,stored=>{
          const task=stored.pendingEvidenceDeletes?.[key];
          if(!task||task.nextAttemptAt>stamp||task.leaseUntil>stamp)return;
          if(evidenceStillUsed(normalizeClass(id,stored.data),task)){
            delete stored.pendingEvidenceDeletes[key];return {cancelled:true};
          }
          Object.assign(task,{claim,leaseUntil:stamp+300000});return structuredClone(task);
        });
        if(!task||task.cancelled)continue;
        try{
          const item=task.item||(db.scoped?await read('evidence/'+task.ref.id):(await ref.get()).val()?.evidence?.[task.ref.id]);
          requireValue(item?.driveId&&item.itemId,'Chưa xác định được tệp ảnh cần xóa.',503);
          if(task.ref.provider==='school')requireValue(item.classId===id&&item.month===task.month,'Ảnh không thuộc lớp/tháng cần xóa.',403);
          // Kiểm tra lại sau khi tra chỉ mục; giữ ảnh nếu một bản ghi khác còn dùng tệp này.
          const ready=await updateEvidenceState(id,stored=>{
            const current=stored.pendingEvidenceDeletes?.[key];if(current?.claim!==claim)return;
            if(evidenceStillUsed(normalizeClass(id,stored.data),current,item)){
              delete stored.pendingEvidenceDeletes[key];return false;
            }
            current.item={driveId:item.driveId,itemId:item.itemId,classId:id,month:task.month,...(item.recordType?{recordType:item.recordType}:{})};
            return {protectedImageIds:evidenceReferences(normalizeClass(id,stored.data)).filter(ref=>ref.image.provider==='school').map(ref=>ref.key)};
          });
          if(!ready)continue;
          const outcome=await remove(item,{classId:id,month:task.month,key,legacy:task.ref.provider==='onedrive',...ready});
          await updateEvidenceState(id,stored=>{
            const current=stored.pendingEvidenceDeletes?.[key];if(current?.claim!==claim)return;
            if(!outcome?.retained){
              stored.deletedEvidence ||= {};stored.deletedEvidence[key]={item:current.item,deletedAt:now(),requestedBy:current.requestedBy||'system'};
              stored.events ||= {};stored.events[randomUUID()]={action:'evidence-delete:'+id,actor:current.requestedBy||identity?.email||'system',at:now(),evidenceId:key};
            }
            delete stored.pendingEvidenceDeletes[key];return true;
          });if(!outcome?.retained)deleted++;
        }catch(error){
          await updateEvidenceState(id,stored=>{
            const current=stored.pendingEvidenceDeletes?.[key];if(current?.claim!==claim)return;
            current.attempts=(current.attempts||0)+1;current.leaseUntil=0;delete current.claim;
            current.nextAttemptAt=clock().getTime()+Math.min(86400,Math.max(Number(error.retryAfter)||0,60*2**Math.min(current.attempts,8)))*1000;
            current.lastError=String(error.status||503);return true;
          });
        }
      }
      const remaining=db.scoped?await read('classes/'+id+'/pendingEvidenceDeletes'):
        (await ref.get()).val()?.classes?.[id]?.pendingEvidenceDeletes;
      return {deleted,pending:Object.keys(remaining||{}).length};
    },
    async pendingEvidenceClasses(ids=CLASSES){
      requireValue(ids.every(id=>CLASSES.includes(id)),'Lớp không hợp lệ.');
      const entries=db.scoped?await Promise.all(ids.map(async id=>[id,await read('classes/'+id+'/pendingEvidenceDeletes')])):
        Object.entries((await ref.get()).val()?.classes||{}).map(([id,c])=>[id,c.pendingEvidenceDeletes]);
      const at=clock().getTime();
      return entries.map(([id,tasks])=>({id,next:Math.min(...Object.values(tasks||{}).filter(t=>!(t.leaseUntil>at)).map(t=>t.nextAttemptAt||0))}))
        .filter(c=>c.next<=at).sort((a,b)=>a.next-b.next||a.id.localeCompare(b.id)).map(c=>c.id);
    },
    async changes(identity){
      if(!db.scoped)return {supported:false};
      const s=await context(identity),u=assignmentFor(s,identity),ids=scopeFor(u);
      let cached={};
      // Only after fresh assignment/scope checks. Cache errors never block access.
      if(revisionCache)try{cached=await revisionCache.read(ids);}catch{}
      const observedAt=revisionCache?.now(),missing=ids.filter(id=>!Number.isInteger(cached[id])||cached[id]<0);
      const fresh=await Promise.all(missing.map(async id=>[id,await read('classes/'+id+'/revision')||0]));
      if(revisionCache&&fresh.length)try{await revisionCache.write(fresh,observedAt);}catch{}
      const revisions=ids.map(id=>[id,fresh.find(([key])=>key===id)?.[1]??cached[id]]);
      const directory=hasRole(u,'admin')?await Promise.all([read('users'),read('teachers')]):[];
      // Dấu mốc phân công/lịch/danh bạ tách khỏi revision lớp để client chỉ tải lớp thay đổi.
      const metadataVersion=createHash('sha256').update(JSON.stringify([s.users,s.calendar,directory])).digest('hex');
      return {supported:true,metadataVersion,revisions:Object.fromEntries(revisions),
        version:createHash('sha256').update(JSON.stringify([metadataVersion,revisions])).digest('hex')};
    },
    async storageAdmin(identity,ownerOnly=false){
      const s=db.scoped?await context(identity,{includeCalendar:false}):normalizeSchool((await ref.get()).val()),u=assignmentFor(s,identity);
      requireValue(hasRole(u,'admin'),'Chỉ Admin được quản lý kho ảnh.',403);
      if(ownerOnly)requireValue(identity.email===adminEmail,'Chỉ chủ kho ảnh được kết nối OneDrive.',403);
    },
    async integrationAdmin(identity){
      const s=db.scoped?await context(identity,{includeCalendar:false}):normalizeSchool((await ref.get()).val());
      requireValue(hasRole(assignmentFor(s,identity),'admin'),'Chỉ QTV được kiểm tra kết nối dữ liệu.',403);
    },
    async storageState(){return db.scoped?(await read('storageAuth')||{}):normalizeSchool((await ref.get()).val()).storageAuth||{};},
    async createStorageFlow(identity,key,sealed,expiresAt){
      await mutate(identity,null,(s,u)=>{
        requireValue(hasRole(u,'admin')&&identity.email===adminEmail,'Chỉ chủ kho ảnh được kết nối.',403);
        s.storageAuth ||= {};const flows=s.storageAuth.flows ||= {};
        for(const [id,flow]of Object.entries(flows))if(flow.expiresAt<=clock().getTime())delete flows[id];
        requireValue(Object.keys(flows).length<6,'Có nhiều yêu cầu kết nối đang chờ. Hãy thử lại sau ít phút.',429);
        flows[key]={sealed,expiresAt};
      });
    },
    async consumeStorageFlow(key){
      let flow;
      await ref.get();
      await ref.transaction(raw=>{
        flow=null;if(!raw)return undefined;const s=normalizeSchool(raw),candidate=s.storageAuth?.flows?.[key];
        if(!candidate)return undefined;
        delete s.storageAuth.flows[key];
        if(candidate.expiresAt>clock().getTime())flow=candidate;
        return s;
      },undefined,false);
      requireValue(flow,'Yêu cầu kết nối đã hết hạn hoặc đã được sử dụng. Mở lại kết nối từ trang Admin.',400);
      return flow.sealed;
    },
    async bindStorage(identity,sealed,expectedBinding){
      const s=await mutate(identity,'storage:connect',(school,u)=>{
        requireValue(hasRole(u,'admin')&&identity.email===adminEmail,'Chỉ chủ kho ảnh được kết nối.',403);
        const old=school.storageAuth||{};
        requireValue((old.bindingId||'')===expectedBinding,'Kho ảnh đã được kết nối trong cửa sổ khác. Hãy thử lại.',409);
        school.storageAuth={...old,sealed,bindingId:randomUUID(),ownerEmail:identity.email,ownerOid:identity.oid,connectedAt:now()};
      });return s.storageAuth.bindingId;
    },
    async refreshStorage(sealed,bindingId){
      let saved=false;
      if(db.scoped){
        await db.ref(ROOT+'/storageAuth').transaction(raw=>{
          saved=false;if(raw?.bindingId!==bindingId)return undefined;
          saved=true;return {...raw,sealed};
        });requireValue(saved,'Kết nối kho ảnh đã thay đổi. Hãy thử lại.',409);return;
      }
      await ref.get();await ref.transaction(raw=>{
        saved=false;if(!raw)return undefined;const s=normalizeSchool(raw);
        if(s.storageAuth?.bindingId!==bindingId)return undefined;
        s.storageAuth.sealed=sealed;saved=true;return s;
      },undefined,false);requireValue(saved,'Kết nối kho ảnh đã thay đổi. Hãy thử lại.',409);
    },
    async evidenceScope(identity,id,month,studentId){
      requireValue(MONTHS.includes(month)&&typeof studentId==='string'&&studentId,'Chọn học sinh và tháng hợp lệ.');
      const s=db.scoped?await imageContext(identity,id,month,studentId):normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id,month,studentId,true);
    },
    async registerEvidence(identity,id,body,item){
      const recordType=body.recordType||'connections';
      requireValue(['meetings','connections'].includes(recordType),'Loại minh chứng không hợp lệ.');
      const key=createHash('sha256').update([id,body.month,body.studentId,body.uploadId,...(recordType==='meetings'?['meetings']:[])].join('|')).digest('hex');
      if(db.scoped){
        const s=await imageContext(identity,id,body.month,body.studentId);
        evidenceAccess(s,identity,id,body.month,body.studentId,true);
        const saved={...item,recordType,id:key,classId:id,month:body.month,studentId:body.studentId,createdBy:identity.email,createdAt:now()};
        await db.ref(ROOT+'/evidence/'+key).transaction(()=>saved);
        return {provider:'school',id:key,size:saved.size,mimeType:saved.mimeType};
      }
      const s=await mutate(identity,'evidence:'+id,(school)=>{
        evidenceAccess(school,identity,id,body.month,body.studentId,true);school.evidence ||= {};
        school.evidence[key]={...item,recordType,id:key,classId:id,month:body.month,studentId:body.studentId,createdBy:identity.email,createdAt:now()};
      });
      const saved=s.evidence[key];return {provider:'school',id:key,size:saved.size,mimeType:saved.mimeType};
    },
    async evidenceItem(identity,id,key){
      const s=db.scoped?await imageContext(identity,id):normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id);
      const retired=db.scoped?await read('classes/'+id+'/deletedEvidence/'+key):s.classes[id]?.deletedEvidence?.[key];
      const pending=db.scoped?await read('classes/'+id+'/pendingEvidenceDeletes/'+key):s.classes[id]?.pendingEvidenceDeletes?.[key];
      requireValue(!retired&&!pending,'Ảnh đã được xóa.',404);
      const item=db.scoped?await read('evidence/'+key):s.evidence?.[key];requireValue(item&&item.classId===id,'Không tìm thấy ảnh.',404);return item;
    },
    async legacyEvidence(identity,id,month,recordId,key){
      const s=db.scoped?await imageContext(identity,id,month):normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id,month);
      const row=entry(s,id).data.months[month]?.connections.find(r=>r.id===recordId);
      const image=row?.evidenceImages?.find(image=>image.provider==='onedrive'&&legacyId(image)===key);
      requireValue(image,'Không tìm thấy ảnh cũ.',404);return image;
    },
    // Tác vụ lịch định kỳ phía máy chủ; khóa ngày snapshot hiện dùng ngày UTC của now().
    async backupDaily(){
      await ref.get();
      await ref.transaction(raw=>{
        if(!raw)return undefined;
        const s=normalizeSchool(raw),at=now(),day=at.slice(0,10);s.recovery ||= {};
        for(const id of Object.keys(s.classes)){
          const old=entry(s,id),history=s.recovery[id] ||= {};
          // Gom lịch sử giao dịch lớp về kho riêng mỗi ngày; bootstrap không đọc kho này.
          for(const [key,snapshot]of Object.entries(s.classes[id].recovery||{})){
            if(!key.startsWith('day-')||!history[key])history[key]=snapshot;
          }
          s.recoveryBlobs ||= {};s.recoveryBlobs[id]={...s.recoveryBlobs[id],...s.classes[id].recoveryBlobs};
          Object.assign(s.audit,s.classes[id].events||{});
          delete s.classes[id].recovery;delete s.classes[id].recoveryBlobs;delete s.classes[id].events;
          history['day-'+day] ||= snapshotClass(s,id,old,{at,actor:'system',kind:'daily'});
          const keys=Object.keys(history).filter(k=>k.startsWith('day-')).sort().reverse();
          for(const key of keys.slice(30))delete history[key];
          const revisions=Object.keys(history).filter(k=>k.startsWith('rev-')).sort((a,b)=>history[b].revision-history[a].revision);
          for(const key of revisions.slice(20))delete history[key];
          pruneSnapshotBlobs(s,id);
        }
        return s;
      },undefined,false);
    },
    /** Copy acknowledged history to D1 before removing it from the hot class node.
     * A concurrent save is preserved by comparing each captured entry in the transaction.
     * Live class data, revision, image cleanup and legacy archives are never replaced.
     */
    async archiveClassHistory(id){
      if(!historyStore||!db.scoped)return {archived:false};
      requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
      const target=db.ref(ROOT+'/classes/'+id),stored=(await target.get()).val();
      if(!stored?.data)return {archived:false};
      const captured=stored.recovery||{},events=stored.events||{};
      const s=normalizeSchool({classes:{[id]:stored}});
      const snapshots=Object.fromEntries(Object.entries(captured).map(([key,value])=>[key,
        {...value,format:1,monthRefs:{},data:snapshotData(s,id,value)}]));
      const day='day-'+now().slice(0,10);
      snapshots[day] ||= {format:1,data:stored.data,revision:stored.revision||0,at:now(),actor:'system',kind:'daily'};
      await historyStore.write(id,snapshots,events);
      // No destructive action occurs until every D1 batch has succeeded.
      if(!Object.keys(captured).length&&!Object.keys(events).length)return {archived:true};
      await target.transaction(raw=>{
        if(!raw)return undefined;
        for(const [key,value]of Object.entries(captured))
          if(JSON.stringify(raw.recovery?.[key])===JSON.stringify(value))delete raw.recovery[key];
        for(const [key,value]of Object.entries(events))
          if(JSON.stringify(raw.events?.[key])===JSON.stringify(value))delete raw.events[key];
        const used=new Set(Object.values(raw.recovery||{}).flatMap(item=>Object.values(item.monthRefs||{})));
        for(const key of Object.keys(raw.recoveryBlobs||{}))if(!used.has(key))delete raw.recoveryBlobs[key];
        return raw;
      },undefined,false);
      return {archived:true};
    },
    // Không trả snapshot/audit cho GVCN hoặc khối trưởng, kể cả có quyền xem tiến độ lớp.
    async recovery(identity,id){
      if(db.scoped){
        const s=await context(identity);
        requireValue(hasRole(assignmentFor(s,identity),'admin'),'Chỉ Admin được xem bản sao lưu.',403);
        requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
        const [stored,legacy,audit,blobs]=await Promise.all([read('classes/'+id),read('recovery/'+id),read('audit'),read('recoveryBlobs/'+id)]);
        s.classes[id]=stored;s.recoveryBlobs={[id]:blobs};
        const archived=historyStore?await historyStore.read(id):{snapshots:{},events:{}};
        const snapshots={...archived.snapshots,...Object.fromEntries(Object.entries({...legacy,...stored?.recovery}).map(([key,snapshot])=>[key,{...snapshot,data:snapshotData(s,id,snapshot)}]))};
        return {classId:id,revision:stored?.revision||0,snapshots,
          audit:Object.values({...archived.events,...audit,...stored?.events}).filter(a=>a.action?.endsWith(':'+id)).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100)};
      }
      const s=normalizeSchool((await ref.get()).val());
      requireValue(hasRole(assignmentFor(s,identity),'admin'),'Chỉ Admin được xem bản sao lưu.',403);
      requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
      const snapshots=Object.fromEntries(Object.entries({...s.recovery?.[id],...s.classes[id]?.recovery}).map(([key,snapshot])=>[key,{...snapshot,data:snapshotData(s,id,snapshot)}]));
      return {classId:id,revision:entry(s,id).revision,snapshots,audit:Object.values({...s.audit,...s.classes[id]?.events}).filter(a=>a.action?.endsWith(':'+id)).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100)};
    },
    // Khôi phục có kiểm tra revision, sao lưu trạng thái hiện tại và giữ phân công GVCN hiện hành.
    async restore(identity,id,body){
      // Authorization is checked before accessing D1 and again in the restore transaction.
      let archived;
      if(historyStore){
        const access=await context(identity);
        requireValue(hasRole(assignmentFor(access,identity),'admin'),'Chỉ Admin được khôi phục.',403);
        requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
        archived=await historyStore.snapshot(id,body.key);
      }
      const s=await mutate(identity,'restore-class:'+id,(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Admin được khôi phục.',403);
        requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
        const old=entry(school,id),saved=school.classes[id]?.recovery?.[body.key]||school.recovery?.[id]?.[body.key]||archived;
        requireValue(saved&&body.revision===old.revision,'Bản sao không tồn tại hoặc dữ liệu đã thay đổi.',409);
        const c=stripRetiredEvidence(normalizeClass(id,snapshotData(school,id,saved)),school.classes[id]);c.teacher=old.data.teacher;c.email=old.data.email;
        validateClass(c,old.data);put(school,id,c,old.revision,identity);
      });return publicBootstrap(s,identity);
    },
    async saveCalendar(identity,body) {
      const dates=body.excludedDates;
      requireValue(Array.isArray(dates)&&dates.length<=366,'Danh sách ngày nghỉ không hợp lệ.');
      requireValue(new Set(dates).size===dates.length,'Danh sách có ngày nghỉ trùng nhau.');
      const validateDate=date=>{
        requireValue(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date),'Ngày nghỉ không đúng định dạng.');
        const parsed=new Date(date+'T00:00:00Z');
        requireValue(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&date>='2026-09-01'&&date<='2027-08-31','Ngày nghỉ phải hợp lệ và thuộc năm học 2026–2027.');
      };
      for(const date of dates)validateDate(date);
      if(body.excludedSessions!==undefined) {
        requireValue(Array.isArray(body.excludedSessions)&&body.excludedSessions.length<=732,'Danh sách buổi nghỉ không hợp lệ.');
        const seen=new Set();
        for(const slot of body.excludedSessions) {
          requireValue(slot&&['morning','afternoon'].includes(slot.session),'Buổi nghỉ phải là sáng hoặc chiều.');
          validateDate(slot.date);
          const key=slot.date+':'+slot.session;
          requireValue(!seen.has(key),'Danh sách có buổi nghỉ trùng nhau.');seen.add(key);
        }
      }
      const s=await mutate(identity,'calendar:update',(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Quản trị viên được sửa lịch không gặp.',403);
        requireValue(Number.isInteger(body.revision)&&body.revision===school.calendar.revision,'Lịch không gặp đã được cập nhật ở máy khác. Hãy tải lại trước khi lưu.',409);
        // Old clients editing whole days must not erase already stored half days.
        const sessions=body.excludedSessions??school.calendar.excludedSessions,full=new Set(dates),byDate=new Map();
        for(const slot of sessions) {
          if(!byDate.has(slot.date))byDate.set(slot.date,new Set());
          byDate.get(slot.date).add(slot.session);
        }
        const partial=[];
        for(const [date,slots] of byDate) {
          if(slots.size===2)full.add(date);
          if(!full.has(date))for(const session of slots)partial.push({date,session});
        }
        partial.sort((a,b)=>a.date.localeCompare(b.date)||a.session.localeCompare(b.session));
        school.calendar={excludedDates:[...full].sort(),excludedSessions:partial,revision:school.calendar.revision+1};
      });
      return {calendar:s.calendar};
    },
    async bootstrap(identity,options={}) {
      if(db.scoped){
        const user=await read('users/'+emailKey(identity.email));
        if(user?.oid===identity.oid){
          const s=await context(identity),u=assignmentFor(s,identity),all=scopeFor(u);
          const ids=options.ids|| (options.paged?all.slice(0,8):all);
          requireValue(Array.isArray(ids)&&ids.length<=32&&ids.every(id=>all.includes(id)),'Phạm vi lớp không hợp lệ.',403);
          if(hasRole(u,'admin')&&!options.ids)[s.users,s.teachers]=await Promise.all([read('users'),read('teachers')]);
          s.users ||= {};s.teachers ||= {};
          await Promise.all(ids.map(async id=>{
            // Không ghép dữ liệu cũ với revision mới khi giáo viên khác đang lưu.
            const revision=await read('classes/'+id+'/revision')||0;
            const data=await read('classes/'+id+'/data');
            const after=await read('classes/'+id+'/revision')||0;
            requireValue(after===revision,'Lớp đang được cập nhật. Vui lòng tải lại dữ liệu.',409);
            const candidate=normalizeClass(id,data),check=backfillNovemberMeetings(structuredClone(candidate));
            if((hasRole(u,'admin')||hasRole(u,'gvcn')&&u.classId===id)&&(check.added||check.linked)){
              const repaired=await repairNovember(identity,id);s.classes[id]=repaired.classes[id];
            }else s.classes[id]={data,revision};
          }));
          const result={...publicBootstrap(s,identity,ids),scopedSync:true,
            remainingClassIds:options.paged?all.filter(id=>!ids.includes(id)):[]};
          if(!options.ids)result.metadataVersion=createHash('sha256').update(JSON.stringify([
            {[emailKey(identity.email)]:user},s.calendar,hasRole(u,'admin')?[s.users,s.teachers]:[],
          ])).digest('hex');
          // Các trang tiếp theo chỉ mang dữ liệu lớp; danh bạ đã có ở trang đầu.
          if(options.ids){delete result.users;delete result.teachers;}
          if(revisionCache)try{await revisionCache.write(Object.entries(result.revisions));}catch{}
          return result;
        }
      }
      const current=normalizeSchool((await ref.get()).val());
      const stored=current.users[emailKey(identity.email)];
      if(stored?.oid===identity.oid && current.bootstrapAdminOid &&
        (!hasRole(stored,'admin') || CLASSES.every(id=>current.classes[id]))) {
        const u=assignmentFor(current,identity);
        for(const id of scopeFor(u))if(hasRole(u,'admin')||hasRole(u,'gvcn')&&u.classId===id){
          const check=backfillNovemberMeetings(structuredClone(entry(current,id).data));
          if(check.added||check.linked){const repaired=await repairNovember(identity,id);current.classes[id]=repaired.classes[id];}
        }
        return publicBootstrap(current,identity);
      }
      const s=await mutate(identity,null,(school,u)=>{
        if(hasRole(u,'admin')) for(const id of CLASSES) if(!school.classes[id]) school.classes[id]={data:encodeClass(blankClass(id)),revision:0};
      },{bind:true});
      return publicBootstrap(s,identity);
    },
    // Quyền và revision được kiểm tra trong transaction, không tin kiểm tra ở giao diện.
    async putClass(identity,id,body,importMode=false) {
      let evidence={},checkedContext;
      if(db.scoped){
        const base=checkedContext=await context(identity);checkScope(assignmentFor(base,identity),id);
        // Ảnh đã gắn đúng bản ghi sẽ được xác minh lại với bản hiện tại trong transaction;
        // chỉ tra cứu chỉ mục riêng cho ảnh vừa thêm, tránh hàng trăm request lặp lại.
        // Content-only saves need no preliminary image lookup. The transaction still
        // checks the current revision, existing image references and deleted images.
        const incomingMonths=body.patch?{patch:{connections:(body.patch.operations||[]).map(op=>op.value).filter(Boolean)}}:body.classData?.months||{};
        const hasSchoolImages=Object.values(incomingMonths).some(m=>[...(m.connections||[]),...(m.meetings||[])].some(r=>(r.evidenceImages||[]).some(a=>a?.provider==='school')));
        const existing=hasSchoolImages?await read('classes/'+id+'/data'):null;
        const existingIds=new Set(Object.values(existing?.months||{}).flatMap(m=>[...(m.connections||[]),...(m.meetings||[])].flatMap(r=>(r.evidenceImages||[]).filter(a=>a?.provider==='school').map(a=>a.id))));
        const ids=[...new Set(Object.values(incomingMonths).flatMap(m=>[...(m.connections||[]),...(m.meetings||[])].flatMap(r=>(r.evidenceImages||[]).filter(a=>a?.provider==='school').map(a=>a.id))))];
        requireValue(ids.length<=10000&&ids.every(key=>/^[a-f0-9]{64}$/.test(key)),'Mã ảnh không hợp lệ.');
        const added=ids.filter(key=>!existingIds.has(key));
        requireValue(added.length<=16,'Hãy lưu ảnh theo từng nhóm nhỏ hơn để tránh vượt giới hạn xử lý.');
        evidence=Object.fromEntries(await Promise.all(added.map(async key=>[key,await read('evidence/'+key)])));
      }
      const s=await mutateClass(identity,id,`${importMode?'import':'save'}-class:${id}`,(school,u)=>{
        checkScope(u,id);
        const old=entry(school,id);
        let c;
        if(body.patch){
          requireValue(!importMode&&!body.classData,'Không trộn nhập lớp và thay đổi bản ghi.');
          c=applyRecordPatch(old.data,body.patch);
        }else{
          requireValue(Number.isInteger(body.revision)&&body.revision===old.revision,'Lớp đã được cập nhật trên máy khác. Xuất JSON giữ bản đang sửa rồi tải lại dữ liệu.',409);
          requireValue(body.classData && typeof body.classData==='object','Thiếu dữ liệu lớp.');
          requireValue(Array.isArray(body.classData.students),'Danh sách học sinh phải là một mảng.');
          requireValue(!body.classData.profiles || Array.isArray(body.classData.profiles),'Danh sách M05 không đúng định dạng.');
          c=normalizeClass(id,body.partialMonths?{...body.classData,months:{...old.data.months,...body.classData.months}}:body.classData);
        }
        for(const [month,m]of Object.entries(c.months))for(const recordType of ['connections','meetings'])for(const row of m[recordType]){
          if(row.evidenceImages===undefined)continue;
          requireValue(Array.isArray(row.evidenceImages),'Danh sách ảnh không hợp lệ.');
          const previousImages=old.data.months[month]?.[recordType].find(r=>r.id===row.id&&r.studentId===row.studentId)?.evidenceImages||[];
          const unchangedLegacy=row.evidenceImages.length<=previousImages.length&&row.evidenceImages.every(image=>image&&previousImages.some(oldImage=>oldImage&&(image.id&&image.id===oldImage.id&&image.provider===oldImage.provider||image.provider==='legacy'&&legacyId(oldImage)===image.id||JSON.stringify(image)===JSON.stringify(oldImage))));
          requireValue(Array.isArray(row.evidenceImages)&&(row.evidenceImages.length<=2||unchangedLegacy),'Tối đa 2 ảnh minh chứng mỗi bản ghi.');
          row.evidenceImages=row.evidenceImages.map(image=>{
            requireValue(image&&typeof image==='object','Ảnh minh chứng không hợp lệ.');
            if(image.provider==='school'){
              const existing=previousImages.find(a=>a.provider==='school'&&a.id===image.id);
              const stored=school.evidence?.[image.id]||(existing?{...existing,classId:id,month,studentId:row.studentId,recordType}:null);
              requireValue(stored&&stored.classId===id&&stored.month===month&&stored.studentId===row.studentId&&(stored.recordType||'connections')===recordType,'Ảnh không thuộc học sinh/lớp/tháng hoặc loại biểu mẫu này.',403);
              return {provider:'school',id:stored.id,size:stored.size,mimeType:stored.mimeType};
            }
            if(image.provider==='legacy'){
              const prior=old.data.months[month]?.[recordType].find(r=>r.id===row.id&&r.studentId===row.studentId);
              const original=prior?.evidenceImages?.find(a=>legacyId(a)===image.id);
              requireValue(original,'Liên kết ảnh cũ đã thay đổi.',409);return original;
            }
            // Tương thích bản cũ: metadata OneDrive hiện có vẫn được giữ, không tạo link công khai.
            requireValue(recordType==='connections'||previousImages.some(oldImage=>JSON.stringify(oldImage)===JSON.stringify(image)),'Ảnh phiếu giấy phải được tải qua kho ảnh của trường.',403);
            return image;
          });
        }
        if(importMode) {
          requireValue(hasRole(u,'admin'),'Chỉ Admin được chuyển dữ liệu cũ lên Firebase.',403);
          requireValue(!old.data.students.length&&!old.data.profiles.length&&!Object.keys(old.data.months).length,'Chỉ nhập dữ liệu cũ vào lớp còn trống; không ghi đè lớp đang có dữ liệu.',409);
        } else authorizeClassEdit(u,old.data,c);
        validateClass(c,old.data);
        for(const [month,m] of Object.entries(c.months))for(const st of c.students)for(const a of appointmentEntries(m,st.id)){
          if(actualMeetingMirror(m,st.id,a))continue;
          const previous=appointmentEntries(old.data.months[month],st.id).find(p=>p.id===a.id);
          if(previous?.date===a.date&&previous?.session===a.session&&previous?.startTime===a.startTime&&previous?.endTime===a.endTime)continue;
          if(a.session==='other')requireValue(!school.calendar.excludedDates.includes(a.date)&&!school.calendar.excludedSessions.some(slot=>slot.date===a.date&&(slot.session==='morning'?a.startTime<'12:00':a.endTime>'12:00')),'Khung giờ nằm trong lịch nghỉ.',409);
          requireValue(!school.calendar.excludedDates.includes(a.date)&&!school.calendar.excludedSessions.some(slot=>slot.date===a.date&&slot.session===a.session),'Ngày hoặc buổi đã chọn là lịch nghỉ. Hãy tải lại lịch.',409);
        }
        put(school,id,c,old.revision,identity);
      },evidence,checkedContext);
      const result=publicClass(s,id);
      if(revisionCache)try{await revisionCache.write([[id,result.revision]]);}catch{}
      return result;
    },
    async saveTeacher(identity,body) {
      const id=body.id||randomUUID();
      requireValue(/^[A-Za-z0-9_-]{1,100}$/.test(id),'Mã GVCN không hợp lệ.');
      const name=String(body.name||'').trim(),email=String(body.email||'').toLowerCase().trim(),classId=String(body.classId||'');
      requireValue(name&&name.length<=200,'Họ tên GVCN không hợp lệ.');
      requireValue(/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(email),'GVCN phải sử dụng email công vụ của trường.');
      requireValue(CLASSES.includes(classId),'Lớp được phân công không hợp lệ.');
      requireValue(typeof body.active==='boolean','Trạng thái GVCN không hợp lệ.');
      const s=await mutate(identity,`save-teacher:${id}`,(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Admin được quản lý GVCN.',403);
        const old=school.teachers[id];
        if(body.id) requireValue(old,'GVCN không còn tồn tại. Tải lại dữ liệu.',409);
        requireValue(Object.values(school.teachers).every(t=>t.id===id || (t.email!==email && !(t.active!==false&&body.active&&t.classId===classId))),'Email đã tồn tại hoặc lớp đã có GVCN đang hoạt động.',409);
        const assigned=school.users[emailKey(email)];
        const assignedRoles=rolesOf(assigned);
        const requestedRoles=body.roles||[...new Set([...assignedRoles,'gvcn'])];
        requireValue(requestedRoles.includes('gvcn'),'Phân công GVCN cần có vai trò GVCN.',400);
        const roleData=roleFields(requestedRoles,body.grades??gradesOf(assigned).filter(grade=>requestedRoles.includes('lead')));
        if(assigned&&hasRole(assigned,'admin')&&(!roleData.roles.includes('admin')||!body.active)) {
          requireValue(email!==identity.email,'Không thể thu hồi quyền Admin đang sử dụng qua hồ sơ GVCN.',409);
          requireValue(Object.values(school.users).filter(user=>user.active!==false&&hasRole(user,'admin')).length>1,'Không thể vô hiệu hóa Admin cuối cùng qua hồ sơ GVCN.',409);
        }
        if(roleData.roles.includes('lead')) requireValue(roleData.grades.includes(String(gradeOf(classId))),'Khối GVCN phải nằm trong phạm vi khối trưởng của chính tài khoản đó.');
        requireValue(!assigned||assignedRoles.includes('gvcn')||!assignedRoles.some(role=>['admin','bgh','lead'].includes(role))||roleData.roles.some(role=>['admin','bgh','lead'].includes(role)),'Email này đã có vai trò quản lý; hãy giữ vai trò hiện có khi phân công GVCN.',409);
        requireValue(!assigned?.teacherId||assigned.teacherId===id,'Email đã được liên kết với GVCN khác.',409);
        if(old) {
          const oldUser=school.users[emailKey(old.email)];
          if(oldUser?.teacherId===id) {
            const priorRoles=rolesOf(oldUser).filter(role=>role!=='gvcn');
            if(priorRoles.length) Object.assign(oldUser,{roles:priorRoles,role:primaryRole({roles:priorRoles}),classId:'',teacherId:'',grades:priorRoles.includes('lead')?gradesOf(oldUser):[],grade:priorRoles.includes('lead')?oldUser.grade:''});
            else oldUser.active=false;
          }
          const previous=entry(school,old.classId);
          if(previous.data.email===old.email) { previous.data.teacher=''; previous.data.email=''; put(school,old.classId,previous.data,previous.revision,identity); }
        }
        const teacher={id,name,email,classId,active:body.active,createdAt:old?.createdAt||now(),updatedAt:now()};
        school.teachers[id]=teacher;
        school.users[emailKey(email)]={...assigned,email,name,...roleData,classId,teacherId:id,active:teacher.active,...(assigned?.oid?{oid:assigned.oid}:{})};
        if(teacher.active) {
          const next=entry(school,classId); next.data.teacher=name; next.data.email=email; put(school,classId,next.data,next.revision,identity);
        }
      });
      return publicBootstrap(s,identity);
    },
    async deleteTeacher(identity,id) {
      const s=await mutate(identity,`delete-teacher:${id}`,(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Admin được xóa GVCN.',403);
        const t=school.teachers[id]; requireValue(t,'Không tìm thấy GVCN.',404);
        school.teacherArchive=school.teacherArchive||{};
        school.teacherArchive[randomUUID()]={...t,deletedAt:now(),deletedBy:identity.email};
        const user=school.users[emailKey(t.email)];
        if(user?.teacherId===id) {
          const remaining=rolesOf(user).filter(role=>role!=='gvcn');
          if(remaining.length) Object.assign(user,{roles:remaining,role:primaryRole({roles:remaining}),classId:'',teacherId:'',grades:remaining.includes('lead')?gradesOf(user):[],grade:remaining.includes('lead')?user.grade:''});
          else user.active=false;
        }
        const old=entry(school,t.classId);
        if(old.data.email===t.email) { old.data.teacher='';old.data.email='';put(school,t.classId,old.data,old.revision,identity); }
        delete school.teachers[id];
      });
      return publicBootstrap(s,identity);
    },
    async saveUserRoles(identity,body) {
      const email=String(body.email||'').toLowerCase().trim(),name=String(body.name||'').trim();
      requireValue(/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(email),'Email phải thuộc miền công vụ của trường.');
      requireValue(name&&name.length<=200,'Họ tên không hợp lệ.');
      const roleData=roleFields(body.roles,body.grades||[]);
      const s=await mutate(identity,`save-user-roles:${emailKey(email)}`,(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Admin được quản lý vai trò.',403);
        const key=emailKey(email),old=school.users[key];
        requireValue(!body.id||String(body.id).toLowerCase().trim()===email,'Không được đổi email của tài khoản hiện có.',409);
        requireValue(body.id||!old,'Tài khoản đã tồn tại; hãy mở tài khoản đó để sửa vai trò.',409);
        if(old?.teacherId) {
          const teacher=school.teachers[old.teacherId];
          requireValue(teacher&&roleData.roles.includes('gvcn'),'Phân công GVCN cần được quản lý cùng hồ sơ GVCN.',409);
          requireValue(!body.classId||body.classId===teacher.classId,'Thay đổi lớp tại trang Quản lý GVCN.',409);
          if(roleData.roles.includes('lead')) requireValue(roleData.grades.includes(String(gradeOf(teacher.classId))),'Khối GVCN phải nằm trong phạm vi khối trưởng của chính tài khoản đó.');
        } else requireValue(!roleData.roles.includes('gvcn'),'Hãy tạo phân công GVCN trước khi cấp vai trò GVCN.',409);
        const currentAdmins=Object.entries(school.users).filter(([,user])=>user.active!==false&&hasRole(user,'admin'));
        if(key===emailKey(identity.email)) requireValue(roleData.roles.includes('admin')&&body.active!==false,'Không thể thu hồi hoặc vô hiệu hóa quyền Admin đang sử dụng.',409);
        if(old&&hasRole(old,'admin')&&(!roleData.roles.includes('admin')||body.active===false))
          requireValue(currentAdmins.length>1,'Không thể thu hồi Admin cuối cùng.',409);
        school.users[key]={...old,email,name,...roleData,active:body.active!==false,
          ...(old?.teacherId?{classId:school.teachers[old.teacherId].classId,teacherId:old.teacherId}:{classId:'',teacherId:''}),
          ...(old?.oid?{oid:old.oid}:{})};
        if(old?.teacherId&&school.teachers[old.teacherId]) {
          const teacher=school.teachers[old.teacherId];
          teacher.name=name;teacher.active=body.active!==false;teacher.updatedAt=now();
          const classEntry=entry(school,teacher.classId);
          if(classEntry.data.email===email) { classEntry.data.teacher=name;put(school,teacher.classId,classEntry.data,classEntry.revision,identity); }
        }
      });
      return publicBootstrap(s,identity);
    },
    async importDirectory(identity,body) {
      const teachers=body.teachers;
      const additionalUsers=body.users||[];
      requireValue(Array.isArray(teachers)&&teachers.length>0&&teachers.length<=100,'Danh sách GVCN không hợp lệ.');
      requireValue(Array.isArray(additionalUsers)&&additionalUsers.length<=100,'Danh sách vai trò không hợp lệ.');
      const normalizedTeachers=teachers.map(item=>{
        const email=String(item.email||'').toLowerCase().trim(),name=String(item.name||'').trim(),classId=String(item.classId||'');
        requireValue(name&&name.length<=200,'Có GVCN không có họ tên hợp lệ.');
        requireValue(/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(email),'Có email GVCN không thuộc miền công vụ của trường.');
        requireValue(CLASSES.includes(classId),'Có mã lớp GVCN không hợp lệ.');
        requireValue(item.active!==false,'Không thể nhập phân công GVCN đã ngừng hoạt động.');
        const roleData=roleFields(item.roles||['gvcn'],item.grades||[]);
        requireValue(roleData.roles.includes('gvcn'),'Mỗi dòng GVCN phải giữ vai trò GVCN.');
        if(roleData.roles.includes('lead')) requireValue(roleData.grades.includes(String(gradeOf(classId))),'Khối GVCN phải nằm trong phạm vi khối trưởng của chính tài khoản đó.');
        return {email,name,classId,roleData};
      });
      const normalizedUsers=additionalUsers.map(item=>{
        const email=String(item.email||'').toLowerCase().trim(),name=String(item.name||'').trim();
        requireValue(name&&name.length<=200,'Có tài khoản không có họ tên hợp lệ.');
        requireValue(/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/.test(email),'Có email không thuộc miền công vụ của trường.');
        const roleData=roleFields(item.roles,item.grades||[]);
        requireValue(!roleData.roles.includes('gvcn'),'Phân công GVCN phải nằm trong danh sách GVCN.');
        return {email,name,roleData};
      });
      const allEmails=[...normalizedTeachers.map(item=>item.email),...normalizedUsers.map(item=>item.email)];
      const classIds=normalizedTeachers.map(item=>item.classId);
      requireValue(new Set(allEmails).size===allEmails.length,'Tệp có email bị lặp; không có dữ liệu nào được nhập.');
      requireValue(new Set(classIds).size===classIds.length,'Tệp có lớp được phân công nhiều lần; không có dữ liệu nào được nhập.');
      const s=await mutate(identity,'import-user-directory',(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Admin được nhập danh sách và vai trò.',403);
        for(const item of normalizedTeachers) {
          const existingTeacher=Object.values(school.teachers).find(t=>t.email===item.email||t.classId===item.classId&&t.active!==false);
          requireValue(!existingTeacher||existingTeacher.email===item.email&&existingTeacher.classId===item.classId,
            `Lớp ${item.classId} hoặc email đã có phân công khác. Không có dữ liệu nào được nhập.`,409);
          const existingUser=school.users[emailKey(item.email)];
          if(existingUser) {
            requireValue(!existingUser.teacherId||existingUser.teacherId===existingTeacher?.id,'Email đã được liên kết với một GVCN khác.',409);
            requireValue(rolesOf(existingUser).every(role=>item.roleData.roles.includes(role)),'Tài khoản đã có vai trò ngoài danh sách được nhập; cần rà soát trước khi thay đổi.',409);
          }
          const currentClass=entry(school,item.classId);
          requireValue(!currentClass.data.email||currentClass.data.email===item.email,`Lớp ${item.classId} đang có email GVCN khác. Không có dữ liệu nào được nhập.`,409);
        }
        for(const item of normalizedUsers) {
          const existing=school.users[emailKey(item.email)];
          requireValue(!existing||rolesOf(existing).every(role=>item.roleData.roles.includes(role)),
            'Tài khoản quản lý đã có vai trò khác với tệp; cần rà soát trước khi thay đổi.',409);
        }
        for(const item of normalizedTeachers) {
          const existingTeacher=Object.values(school.teachers).find(t=>t.email===item.email);
          const id=existingTeacher?.id||randomUUID(),existingUser=school.users[emailKey(item.email)];
          const record={id,name:item.name,email:item.email,classId:item.classId,active:true,
            createdAt:existingTeacher?.createdAt||now(),updatedAt:now()};
          school.teachers[id]=record;
          school.users[emailKey(item.email)]={...existingUser,email:item.email,name:item.name,...item.roleData,
            classId:item.classId,teacherId:id,active:true,...(existingUser?.oid?{oid:existingUser.oid}:{})};
          const current=entry(school,item.classId);
          if(current.data.teacher!==item.name||current.data.email!==item.email) {
            current.data.teacher=item.name;current.data.email=item.email;
            put(school,item.classId,current.data,current.revision,identity);
          }
        }
        for(const item of normalizedUsers) {
          const key=emailKey(item.email),existing=school.users[key];
          school.users[key]={...existing,email:item.email,name:item.name,...item.roleData,active:true,
            classId:'',teacherId:'',...(existing?.oid?{oid:existing.oid}:{})};
        }
      });
      return publicBootstrap(s,identity);
    },
    // GVCN gửi trực tiếp BGH; khối trưởng không có bước duyệt hay quyền can thiệp nội dung.
    async transition(identity,id,body) {
      const s=await mutate(identity,`transition:${id}:${body.target}`,(school,u)=>{
        checkScope(u,id); requireValue(MONTHS.includes(body.month),'Tháng báo cáo không hợp lệ.');
        const old=entry(school,id),c=old.data;
        requireValue(body.revision===old.revision,'Báo cáo đã thay đổi. Tải lại trước khi xác nhận.',409);
        const m=c.months[body.month]||emptyMonth(),prev=m.approval.state,target=body.target;
        const allowed=(hasRole(u,'gvcn')&&target==='submitted'&&id===u.classId&&['draft','returned'].includes(prev)) ||
          (hasRole(u,'bgh')&&['submitted','reviewed'].includes(prev)&&['approved','returned'].includes(target));
        requireValue(allowed,'Không có quyền chuyển trạng thái báo cáo này.',403);
        if(target==='submitted') { const v=validateReport(c,body.month); requireValue(v.hasData&&!v.errors.length,'Báo cáo trống hoặc còn lỗi bắt buộc.',409); }
        const note=String(body.note||'').trim().slice(0,2000);
        if(target==='returned') requireValue(note,'Cần nhập lý do trả bổ sung.');
        const dt=clock(),event={state:target,actor:identity.email,note,at:dt.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),date:dt.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),timestamp:dt.toISOString()};
        m.approval={state:target,history:[...m.approval.history,event]}; c.months[body.month]=m; c.audit.push({month:body.month,...event});
        put(school,id,c,old.revision,identity);
      });
      return publicBootstrap(s,identity);
    }
  };
}
