import { randomUUID,createHash } from 'node:crypto';
import {appointmentEntries} from './appointments.mjs';
import {YEAR,GRADES,CLASSES,MONTHS,ROOT,emailKey,list,normalizeSchool,normalizeClass,encodeClass,blankClass,
  assignmentFor,scopeFor,checkScope,requireValue,validateClass,authorizeClassEdit,emptyMonth,validateReport,summary,
  USER_ROLES,rolesOf,gradesOf,hasRole,primaryRole,normalizeAssignment,gradeOf} from './model.mjs';
/**
 * Nghiệp vụ máy chủ: phân quyền, revision, transaction, lịch sử và khôi phục. Không lấy quyền từ
 * vai trò gửi lên bởi trình duyệt.
 */
export function createService(db,{adminEmail='lammt@vietanhschool.edu.vn',clock=()=>new Date()}={}) {
  const ref=db.ref(ROOT);
  const now=()=>clock().toISOString();
  const legacyId=image=>createHash('sha256').update(JSON.stringify(image)).digest('hex');
  function publicData(c){
    const copy=structuredClone(c);
    for(const m of Object.values(copy.months))for(const row of m.connections)
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
  /**
   * So bản trước/sau để ghi audit từng bản ghi, giữ snapshot trước thay đổi rồi tăng revision lớp.
   */
  function put(s,id,c,revision,identity) {
    const old=entry(s,id);
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
    const snapshot={data:encodeClass(old.data),revision:old.revision,at:stamp,actor:identity.email};
    if(!history['day-'+day])history['day-'+day]={...snapshot,kind:'daily'};
    history['rev-'+revision]={...snapshot,kind:'revision'};
    // Giới hạn dung lượng: giữ tối đa 30 snapshot ngày và 20 phiên bản gần nhất mỗi lớp.
    for(const kind of ['day-','rev-']){
      const keys=Object.keys(history).filter(k=>k.startsWith(kind)).sort((a,b)=>history[b].at.localeCompare(history[a].at)||history[b].revision-history[a].revision);
      for(const key of keys.slice(kind==='day-'?30:20))delete history[key];
    }
    s.classes[id]={data:encodeClass(c),revision:revision+1,updatedAt:now(),updatedBy:identity.email};
  }
  function publicClass(s,id) {const value=entry(s,id);return {...value,data:publicData(value.data)};}
  /**
   * Chỉ trả chi tiết cho Admin/GVCN đúng lớp; BGH/khối trưởng nhận chỉ tiêu và lỗi đã bỏ nội dung
   * nhận diện cá nhân.
   */
  function publicBootstrap(s,identity) {
    const u=assignmentFor(s,identity),ids=scopeFor(u),classes={},revisions={},summaries={},checks={};
    for(const id of ids) {
      const {data:c,revision}=entry(s,id); revisions[id]=revision;
      const detailAllowed=hasRole(u,'admin') || (hasRole(u,'gvcn')&&u.classId===id);
      if(detailAllowed) { classes[id]=publicData(c); continue; }
      classes[id]={...blankClass(id),teacher:c.teacher,months:{}}; summaries[id]={}; checks[id]={};
      for(const month of MONTHS) {
        summaries[id][month]=summary(c,month);
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock());
        const m=c.months[month]||emptyMonth();
        summaries[id][month].overdueAppointments=c.students.flatMap(st=>m.schedule[st.id]?.appointments||[]).filter(a=>a.date&&a.date<today&&!m.meetings.some(r=>r.appointmentId===a.id)).length;
        const v=validateReport(c,month);
        checks[id][month]={...v,errors:v.errors.map(e=>({key:e.key,message:'Cần GVCN bổ sung thông tin biểu mẫu.'})),warnings:v.warnings.map(e=>({key:e.key,message:'Báo cáo có nội dung cần lưu ý.'}))};
        classes[id].months[month]={...emptyMonth(),approval:{state:c.months[month]?.approval.state||'draft',history:[]}};
      }
    }
    return {schema:2,year:YEAR,assignment:{role:u.role,roles:u.roles,classId:u.classId||'',grade:u.grade||'',grades:u.grades,display:u.name||identity.email},
      classes,revisions,summaries,checks,teachers:hasRole(u,'admin')?s.teachers:{},
      calendar:s.calendar,
      users:hasRole(u,'admin')?Object.values(s.users).map(user=>{
        const normalized=normalizeAssignment(user);
        return {email:normalized.email,name:normalized.name||normalized.email,roles:normalized.roles,
          classId:normalized.classId||'',grades:normalized.grades,active:normalized.active!==false,teacherId:normalized.teacherId||''};
      }):[],serverTime:now()};
  }
  return {
    async evidenceScope(identity,id,month,studentId){
      requireValue(MONTHS.includes(month)&&typeof studentId==='string'&&studentId,'Chọn học sinh và tháng hợp lệ.');
      const s=normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id,month,studentId,true);
    },
    async registerEvidence(identity,id,body,item){
      const key=createHash('sha256').update([id,body.month,body.studentId,body.uploadId].join('|')).digest('hex');
      const s=await mutate(identity,'evidence:'+id,(school)=>{
        evidenceAccess(school,identity,id,body.month,body.studentId,true);school.evidence ||= {};
        school.evidence[key]={...item,id:key,classId:id,month:body.month,studentId:body.studentId,createdBy:identity.email,createdAt:now()};
      });
      const saved=s.evidence[key];return {provider:'school',id:key,size:saved.size,mimeType:saved.mimeType};
    },
    async evidenceItem(identity,id,key){
      const s=normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id);
      const item=s.evidence?.[key];requireValue(item&&item.classId===id,'Không tìm thấy ảnh.',404);return item;
    },
    async legacyEvidence(identity,id,month,recordId,key){
      const s=normalizeSchool((await ref.get()).val());evidenceAccess(s,identity,id,month);
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
          history['day-'+day] ||= {data:encodeClass(old.data),revision:old.revision,at,actor:'system',kind:'daily'};
          const keys=Object.keys(history).filter(k=>k.startsWith('day-')).sort().reverse();
          for(const key of keys.slice(30))delete history[key];
        }
        return s;
      },undefined,false);
    },
    // Không trả snapshot/audit cho GVCN hoặc khối trưởng, kể cả có quyền xem tiến độ lớp.
    async recovery(identity,id){
      const s=normalizeSchool((await ref.get()).val());
      requireValue(hasRole(assignmentFor(s,identity),'admin'),'Chỉ Admin được xem bản sao lưu.',403);
      requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
      return {classId:id,revision:entry(s,id).revision,snapshots:s.recovery?.[id]||{},audit:Object.values(s.audit).filter(a=>a.action?.endsWith(':'+id)).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100)};
    },
    // Khôi phục có kiểm tra revision, sao lưu trạng thái hiện tại và giữ phân công GVCN hiện hành.
    async restore(identity,id,body){
      const s=await mutate(identity,'restore-class:'+id,(school,u)=>{
        requireValue(hasRole(u,'admin'),'Chỉ Admin được khôi phục.',403);
        requireValue(CLASSES.includes(id),'Lớp không hợp lệ.');
        const old=entry(school,id),saved=school.recovery?.[id]?.[body.key];
        requireValue(saved&&body.revision===old.revision,'Bản sao không tồn tại hoặc dữ liệu đã thay đổi.',409);
        const c=normalizeClass(id,saved.data);c.teacher=old.data.teacher;c.email=old.data.email;
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
    async bootstrap(identity) {
      const current=normalizeSchool((await ref.get()).val());
      const stored=current.users[emailKey(identity.email)];
      if(stored?.oid===identity.oid && current.bootstrapAdminOid &&
        (!hasRole(stored,'admin') || CLASSES.every(id=>current.classes[id]))) {
        return publicBootstrap(current,identity);
      }
      const s=await mutate(identity,null,(school,u)=>{
        if(hasRole(u,'admin')) for(const id of CLASSES) if(!school.classes[id]) school.classes[id]={data:encodeClass(blankClass(id)),revision:0};
      },{bind:true});
      return publicBootstrap(s,identity);
    },
    // Quyền và revision được kiểm tra trong transaction, không tin kiểm tra ở giao diện.
    async putClass(identity,id,body,importMode=false) {
      const s=await mutate(identity,`${importMode?'import':'save'}-class:${id}`,(school,u)=>{
        checkScope(u,id);
        const old=entry(school,id);
        requireValue(Number.isInteger(body.revision)&&body.revision===old.revision,'Lớp đã được cập nhật trên máy khác. Xuất JSON giữ bản đang sửa rồi tải lại dữ liệu.',409);
        requireValue(body.classData && typeof body.classData==='object','Thiếu dữ liệu lớp.');
        requireValue(Array.isArray(body.classData.students),'Danh sách học sinh phải là một mảng.');
        requireValue(!body.classData.profiles || Array.isArray(body.classData.profiles),'Danh sách M05 không đúng định dạng.');
        const c=normalizeClass(id,body.classData);
        for(const [month,m]of Object.entries(c.months))for(const row of m.connections){
          if(row.evidenceImages===undefined)continue;
          requireValue(Array.isArray(row.evidenceImages)&&row.evidenceImages.length<=5,'Tối đa 5 ảnh minh chứng.');
          row.evidenceImages=row.evidenceImages.map(image=>{
            requireValue(image&&typeof image==='object','Ảnh minh chứng không hợp lệ.');
            if(image.provider==='school'){
              const stored=school.evidence?.[image.id];
              requireValue(stored&&stored.classId===id&&stored.month===month&&stored.studentId===row.studentId,'Ảnh không thuộc học sinh/lớp/tháng này.',403);
              return {provider:'school',id:stored.id,size:stored.size,mimeType:stored.mimeType};
            }
            if(image.provider==='legacy'){
              const prior=old.data.months[month]?.connections.find(r=>r.id===row.id&&r.studentId===row.studentId);
              const original=prior?.evidenceImages?.find(a=>legacyId(a)===image.id);
              requireValue(original,'Liên kết ảnh cũ đã thay đổi.',409);return original;
            }
            // Tương thích bản cũ: metadata OneDrive hiện có vẫn được giữ, không tạo link công khai.
            return image;
          });
        }
        if(importMode) {
          requireValue(hasRole(u,'admin'),'Chỉ Admin được chuyển dữ liệu cũ lên Firebase.',403);
          requireValue(!old.data.students.length&&!old.data.profiles.length&&!Object.keys(old.data.months).length,'Chỉ nhập dữ liệu cũ vào lớp còn trống; không ghi đè lớp đang có dữ liệu.',409);
        } else authorizeClassEdit(u,old.data,c);
        validateClass(c,old.data);
        for(const [month,m] of Object.entries(c.months))for(const st of c.students)for(const a of appointmentEntries(m,st.id)){
          const previous=appointmentEntries(old.data.months[month],st.id).find(p=>p.id===a.id);
          if(previous?.date===a.date&&previous?.session===a.session&&previous?.startTime===a.startTime&&previous?.endTime===a.endTime)continue;
          if(a.session==='other')requireValue(!school.calendar.excludedDates.includes(a.date)&&!school.calendar.excludedSessions.some(slot=>slot.date===a.date&&(slot.session==='morning'?a.startTime<'12:00':a.endTime>'12:00')),'Khung giờ nằm trong lịch nghỉ.',409);
          requireValue(!school.calendar.excludedDates.includes(a.date)&&!school.calendar.excludedSessions.some(slot=>slot.date===a.date&&slot.session===a.session),'Ngày hoặc buổi đã chọn là lịch nghỉ. Hãy tải lại lịch.',409);
        }
        put(school,id,c,old.revision,identity);
      });
      return publicClass(s,id);
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
