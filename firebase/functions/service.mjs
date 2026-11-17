import { randomUUID } from 'node:crypto';
import {YEAR,CLASSES,MONTHS,ROOT,emailKey,list,normalizeSchool,normalizeClass,encodeClass,blankClass,
  assignmentFor,scopeFor,checkScope,requireValue,fail,validateClass,authorizeClassEdit,emptyMonth,validateReport,summary} from './model.mjs';

export function createService(db,{adminEmail='lammt@vietanhschool.edu.vn',clock=()=>new Date()}={}) {
  const ref=db.ref(ROOT);
  const now=()=>clock().toISOString();
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
            requireValue(!Object.values(s.users).some(u=>u.role==='admin'&&u.active!==false),'Admin đầu tiên đã được thiết lập.',403);
            s.users[key]={email:identity.email,name:identity.name||identity.email,role:'admin',active:true,oid:identity.oid};
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
  function entry(s,id) {
    const stored=s.classes[id];
    return {data:normalizeClass(id,stored?.data),revision:stored?.revision||0};
  }
  function put(s,id,c,revision,identity) {
    s.classes[id]={data:encodeClass(c),revision:revision+1,updatedAt:now(),updatedBy:identity.email};
  }
  function publicClass(s,id) { return entry(s,id); }
  function publicBootstrap(s,identity) {
    const u=assignmentFor(s,identity),ids=scopeFor(u),classes={},revisions={},summaries={},checks={};
    for(const id of ids) {
      const {data:c,revision}=entry(s,id); revisions[id]=revision;
      if(u.role!=='bgh') { classes[id]=c; continue; }
      classes[id]={...blankClass(id),teacher:c.teacher,months:{}}; summaries[id]={}; checks[id]={};
      for(const month of MONTHS) {
        summaries[id][month]=summary(c,month);
        const v=validateReport(c,month);
        checks[id][month]={...v,errors:v.errors.map(e=>({key:e.key,message:'Cần GVCN bổ sung thông tin biểu mẫu.'})),warnings:v.warnings.map(e=>({key:e.key,message:'Báo cáo có nội dung cần lưu ý.'}))};
        classes[id].months[month]={...emptyMonth(),approval:{state:c.months[month]?.approval.state||'draft',history:[]}};
      }
    }
    return {schema:2,year:YEAR,assignment:{role:u.role,classId:u.classId||'',grade:u.grade||'',display:u.name||identity.email},
      classes,revisions,summaries,checks,teachers:u.role==='admin'?s.teachers:{},serverTime:now()};
  }
  return {
    async bootstrap(identity) {
      const s=await mutate(identity,null,(school,u)=>{
        if(u.role==='admin') for(const id of CLASSES) if(!school.classes[id]) school.classes[id]={data:encodeClass(blankClass(id)),revision:0};
      },{bind:true});
      return publicBootstrap(s,identity);
    },
    async putClass(identity,id,body,importMode=false) {
      const s=await mutate(identity,`${importMode?'import':'save'}-class:${id}`,(school,u)=>{
        checkScope(u,id);
        const old=entry(school,id);
        requireValue(Number.isInteger(body.revision)&&body.revision===old.revision,'Lớp đã được cập nhật trên máy khác. Xuất JSON giữ bản đang sửa rồi tải lại dữ liệu.',409);
        requireValue(body.classData && typeof body.classData==='object','Thiếu dữ liệu lớp.');
        requireValue(Array.isArray(body.classData.students),'Danh sách học sinh phải là một mảng.');
        requireValue(!body.classData.profiles || Array.isArray(body.classData.profiles),'Danh sách M05 không đúng định dạng.');
        const c=normalizeClass(id,body.classData);
        if(importMode) {
          requireValue(u.role==='admin','Chỉ Admin được chuyển dữ liệu cũ lên Firebase.',403);
          requireValue(!old.data.students.length&&!old.data.profiles.length&&!Object.keys(old.data.months).length,'Chỉ nhập dữ liệu cũ vào lớp còn trống; không ghi đè lớp đang có dữ liệu.',409);
        } else authorizeClassEdit(u,old.data,c);
        validateClass(c);
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
        requireValue(u.role==='admin','Chỉ Admin được quản lý GVCN.',403);
        const old=school.teachers[id];
        if(body.id) requireValue(old,'GVCN không còn tồn tại. Tải lại dữ liệu.',409);
        requireValue(Object.values(school.teachers).every(t=>t.id===id || (t.email!==email && !(t.active!==false&&body.active&&t.classId===classId))),'Email đã tồn tại hoặc lớp đã có GVCN đang hoạt động.',409);
        const assigned=school.users[emailKey(email)];
        requireValue(!assigned || assigned.role==='gvcn','Email này dành cho vai trò quản lý; không thể thay bằng phân công GVCN.',409);
        if(old) {
          const oldUser=school.users[emailKey(old.email)];
          if(oldUser?.teacherId===id) oldUser.active=false;
          const previous=entry(school,old.classId);
          if(previous.data.email===old.email) { previous.data.teacher=''; previous.data.email=''; put(school,old.classId,previous.data,previous.revision,identity); }
        }
        const teacher={id,name,email,classId,active:body.active,createdAt:old?.createdAt||now(),updatedAt:now()};
        school.teachers[id]=teacher;
        school.users[emailKey(email)]={email,name,role:'gvcn',classId,teacherId:id,active:teacher.active,...(assigned?.oid?{oid:assigned.oid}:{})};
        if(teacher.active) {
          const next=entry(school,classId); next.data.teacher=name; next.data.email=email; put(school,classId,next.data,next.revision,identity);
        }
      });
      return publicBootstrap(s,identity);
    },
    async deleteTeacher(identity,id) {
      const s=await mutate(identity,`delete-teacher:${id}`,(school,u)=>{
        requireValue(u.role==='admin','Chỉ Admin được xóa GVCN.',403);
        const t=school.teachers[id]; requireValue(t,'Không tìm thấy GVCN.',404);
        school.teacherArchive=school.teacherArchive||{};
        school.teacherArchive[randomUUID()]={...t,deletedAt:now(),deletedBy:identity.email};
        const user=school.users[emailKey(t.email)]; if(user?.teacherId===id) user.active=false;
        const old=entry(school,t.classId);
        if(old.data.email===t.email) { old.data.teacher='';old.data.email='';put(school,t.classId,old.data,old.revision,identity); }
        delete school.teachers[id];
      });
      return publicBootstrap(s,identity);
    },
    async transition(identity,id,body) {
      const s=await mutate(identity,`transition:${id}:${body.target}`,(school,u)=>{
        checkScope(u,id); requireValue(MONTHS.includes(body.month),'Tháng báo cáo không hợp lệ.');
        const old=entry(school,id),c=old.data;
        requireValue(body.revision===old.revision,'Báo cáo đã thay đổi. Tải lại trước khi xác nhận.',409);
        const m=c.months[body.month]||emptyMonth(),prev=m.approval.state,target=body.target;
        const allowed=(u.role==='gvcn'&&target==='submitted'&&['draft','returned'].includes(prev)) ||
          (u.role==='lead'&&prev==='submitted'&&['reviewed','returned'].includes(target)) ||
          (u.role==='bgh'&&prev==='reviewed'&&['approved','returned'].includes(target));
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
