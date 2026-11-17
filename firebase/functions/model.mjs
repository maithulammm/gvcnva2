import { isDeepStrictEqual } from 'node:util';

export const YEAR = '2026-2027';
export const GRADES = {6:6,7:6,8:6,9:5,10:4,11:2,12:3};
export const CLASSES = Object.entries(GRADES).flatMap(([g,n]) =>
  Array.from({length:n},(_,i) => `${g}${({6:'A',7:'B',8:'C',9:'D',10:'A',11:'B',12:'C'})[g]}${i+1}`));
export const MONTHS = [...[9,10,11,12].map(n=>`T${String(n).padStart(2,'0')}/2026`),
  ...[1,2,3,4,5].map(n=>`T${String(n).padStart(2,'0')}/2027`)];
export const ROOT = `gvcn/v1/years/${YEAR}`;
export const DATABASE_URL = 'https://gvcn-3bdf9-default-rtdb.asia-southeast1.firebasedatabase.app';
export const same = isDeepStrictEqual;
export const emailKey = email => Buffer.from(email.toLowerCase().trim()).toString('base64url');
export const list = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
export const gradeOf = id => Number(String(id).match(/^\d+/)?.[0]);
export const USER_ROLES = ['admin','gvcn','lead','bgh'];
export function rolesOf(user) {
  const roles=list(user?.roles);
  return [...new Set(roles.length?roles:(user?.role?[user.role]:[]))];
}
export function gradesOf(user) {
  const grades=list(user?.grades);
  return [...new Set((grades.length?grades:(user?.grade?[user.grade]:[])).map(String))];
}
export function hasRole(user,role) { return rolesOf(user).includes(role); }
export function primaryRole(user) {
  const roles=rolesOf(user);
  return ['admin','bgh','lead','gvcn'].find(role=>roles.includes(role))||'';
}
export function normalizeAssignment(user) {
  const roles=rolesOf(user),grades=gradesOf(user);
  return {...user,roles,role:primaryRole({...user,roles}),grades,
    grade:grades.length===1?grades[0]:(user?.grade||'')};
}
export function fail(status, message) { throw Object.assign(new Error(message), {status}); }
export function requireValue(condition, message, status=400) { if(!condition) fail(status,message); }
export function emptyMonth() {
  return {schedule:{},meetings:[],connections:[],previous:[],plans:[],notes:{},approval:{state:'draft',history:[]}};
}
export function blankClass(id) {
  return {id,grade:gradeOf(id),teacher:'',email:'',students:[],months:{},profiles:[],audit:[]};
}
export function normalizeClass(id, input) {
  const c = {...blankClass(id),...(input||{}),id,grade:gradeOf(id)};
  for(const key of ['students','profiles','audit']) c[key]=list(c[key]);
  c.months=Object.fromEntries(Object.entries(c.months||{}).map(([key,value])=>{
    const m={...emptyMonth(),...value};
    for(const field of ['meetings','connections','previous','plans']) m[field]=list(m[field]);
    m.schedule=m.schedule||{}; m.notes=m.notes||{};
    m.approval={state:'draft',...m.approval,history:list(m.approval?.history)};
    return [key.replace('_','/'),m];
  }));
  return c;
}
export function encodeClass(c) {
  return {...c,months:Object.fromEntries(Object.entries(c.months).map(([m,v])=>[m.replace('/','_'),v]))};
}
export function normalizeSchool(s) {
  return {...s,year:YEAR,schema:1,classes:s?.classes||{},teachers:s?.teachers||{},users:s?.users||{},audit:s?.audit||{}};
}
export function assignmentFor(s, identity) {
  const stored=s.users[emailKey(identity.email)];
  requireValue(stored && stored.active !== false,'Tài khoản chưa được cấp quyền hoặc đã ngừng hoạt động.',403);
  const u=normalizeAssignment(stored),roles=u.roles,grades=u.grades;
  requireValue(roles.length>0&&roles.every(role=>USER_ROLES.includes(role)),'Vai trò tài khoản không hợp lệ.',403);
  requireValue(u.oid === identity.oid,'Phân công chưa liên kết đúng danh tính Microsoft.',403);
  if(hasRole(u,'gvcn')) requireValue(CLASSES.includes(u.classId),'Lớp được phân công không hợp lệ.',403);
  else requireValue(!u.classId,'Tài khoản không có vai trò GVCN nhưng lại gán lớp.',403);
  if(hasRole(u,'lead')) requireValue(grades.length>0&&grades.every(grade=>GRADES[grade]),'Khối được phân công không hợp lệ.',403);
  else requireValue(!grades.length,'Tài khoản không có vai trò khối trưởng nhưng lại gán khối.',403);
  return u;
}
export function scopeFor(u) {
  if(hasRole(u,'admin')||hasRole(u,'bgh')) return CLASSES;
  const ids=new Set();
  if(hasRole(u,'gvcn')) ids.add(u.classId);
  if(hasRole(u,'lead')) for(const id of CLASSES) if(gradesOf(u).includes(String(gradeOf(id)))) ids.add(id);
  return [...ids];
}
export function checkScope(u,id) {
  requireValue(CLASSES.includes(id),'Không tìm thấy lớp.',404);
  requireValue(scopeFor(u).includes(id),'Không có quyền truy cập lớp này.',403);
}
export function studentReferences(c,id) {
  return c.profiles.some(p=>p.studentId===id) || Object.values(c.months).some(m=>
    Object.hasOwn(m.schedule,id) || ['meetings','connections','previous','plans'].some(k=>m[k].some(r=>r.studentId===id)));
}
function safeTree(v, depth=0) {
  requireValue(depth<24,'Dữ liệu lồng nhau quá sâu.');
  if(typeof v==='string') requireValue(v.length<=20000,'Nội dung vượt giới hạn 20.000 ký tự.');
  if(!v || typeof v!=='object') return;
  for(const [k,x] of Object.entries(v)) {
    requireValue(!['__proto__','prototype','constructor'].includes(k) && !/[.#$\[\]]/.test(k),'Khóa dữ liệu không hợp lệ.');
    requireValue(!k.includes('/') || MONTHS.includes(k),'Khóa dữ liệu chứa đường dẫn không hợp lệ.');
    safeTree(x,depth+1);
  }
}
export function validateClass(c) {
  safeTree(c);
  requireValue(CLASSES.includes(c.id),'Lớp không hợp lệ.');
  requireValue(c.students.length<=28,'Mẫu Excel hiện hỗ trợ tối đa 28 học sinh/lớp.');
  requireValue(c.profiles.length<=40,'Tối đa 40 hồ sơ M05/lớp.');
  const ids=new Set(),studentCodes=new Set();
  for(const st of c.students) {
    requireValue(typeof st.id==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(st.id),'Mã nội bộ học sinh không hợp lệ.');
    requireValue(!ids.has(st.id),'Trùng mã nội bộ học sinh.'); ids.add(st.id);
    requireValue(typeof st.name==='string' && st.name.trim() && st.name.length<=200,'Tên học sinh không hợp lệ.');
    requireValue(!st.code || (typeof st.code==='string' && st.code.length<=100),'Mã học sinh không hợp lệ.');
    if(st.code) { requireValue(!studentCodes.has(st.code),'Trùng mã học sinh.');studentCodes.add(st.code); }
  }
  const profileIds=new Set();
  const profileCodes=new Set();
  for(const p of c.profiles) {
    requireValue(typeof p.id==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(p.id) && !profileIds.has(p.id),'Mã nội bộ M05 không hợp lệ hoặc bị trùng.');
    requireValue(ids.has(p.studentId) && MONTHS.includes(p.startMonth),'Hồ sơ M05 không thuộc học sinh/tháng hợp lệ.');
    requireValue(typeof p.code==='string' && p.code.trim() && !profileCodes.has(p.code),'Mã phiếu M05 trống hoặc bị trùng.');
    profileIds.add(p.id); profileCodes.add(p.code);
  }
  for(const [month,m] of Object.entries(c.months)) {
    requireValue(MONTHS.includes(month),'Tháng báo cáo không hợp lệ.');
    requireValue(['draft','returned','submitted','reviewed','approved'].includes(m.approval.state),'Trạng thái báo cáo không hợp lệ.');
    for(const id of Object.keys(m.schedule)) requireValue(ids.has(id),'Lịch gặp có học sinh không còn trong danh sách.');
    for(const key of ['meetings','connections','previous','plans']) {
      requireValue(m[key].length<=2000,'Số bản ghi tháng vượt giới hạn.');
      const recordIds=new Set();
      for(const r of m[key]) {
        requireValue(typeof r.id==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(r.id) && !recordIds.has(r.id),'Mã bản ghi không hợp lệ hoặc bị trùng.');
        recordIds.add(r.id);
        requireValue(ids.has(r.studentId),'Bản ghi liên kết học sinh không còn trong danh sách.');
        if(key==='meetings' && r.profileId)
          requireValue(c.profiles.some(p=>p.id===r.profileId && p.studentId===r.studentId),'Liên kết M02–M05 không hợp lệ.');
      }
    }
  }
}
export function authorizeClassEdit(u,old,c) {
  checkScope(u,c.id);
  const isAdmin=hasRole(u,'admin');
  requireValue(isAdmin||(hasRole(u,'gvcn')&&u.classId===c.id),'Vai trò không có quyền sửa biểu mẫu.',403);
  requireValue(same(old.audit,c.audit),'Nhật ký xác nhận chỉ được ghi bởi máy chủ.',403);
  requireValue(old.teacher===c.teacher && old.email===c.email,'Thay đổi GVCN tại trang Quản lý GVCN.',403);
  if(!isAdmin) requireValue(same(old.students,c.students),'Chỉ Admin được thêm, xóa, sửa học sinh.',403);
  for(const st of old.students.filter(s=>!c.students.some(x=>x.id===s.id)))
    requireValue(!studentReferences(old,st.id),`Không thể xóa ${st.name}: đã có dữ liệu biểu mẫu liên quan.`,409);
  for(const month of new Set([...Object.keys(old.months),...Object.keys(c.months)])) {
    const before=old.months[month]||emptyMonth(), after=c.months[month]||emptyMonth();
    requireValue(same(before.approval,after.approval),'Trạng thái duyệt chỉ được thay đổi qua quy trình xác nhận.',403);
    requireValue(!old.months[month] || c.months[month],'Không được xóa toàn bộ tháng đã lưu.');
    if(!isAdmin && !['draft','returned'].includes(before.approval.state))
      requireValue(same(before,after),'Báo cáo tháng này đã khóa.',403);
  }
  if(!isAdmin) {
    const profileIds=new Set([...old.profiles,...c.profiles].map(p=>p.id));
    for(const id of profileIds) {
      const a=old.profiles.find(p=>p.id===id), b=c.profiles.find(p=>p.id===id);
      if(same(a,b)) continue;
      const months=new Set([a?.startMonth,b?.startMonth].filter(Boolean));
      for(const [month,m] of Object.entries(old.months)) if(m.meetings.some(r=>r.profileId===id)) months.add(month);
      for(const month of months) requireValue(['draft','returned'].includes((old.months[month]||emptyMonth()).approval.state),'Hồ sơ M05 thuộc tháng đã khóa.',403);
    }
  }
}
export function validateReport(c,month) {
  const m=c.months[month]||emptyMonth(), errors=[],warnings=[];
  const add=(key,message,bad=true)=>(bad?errors:warnings).push({key,message});
  const missing=(x,keys)=>keys.some(k=>!x[k]);
  for(const [i,r] of m.meetings.entries()) {
    if(!r.actual) add('K2',`M02 lượt ${i+1} thiếu thời gian thực tế.`);
    if(missing(r,['studentId','actual','concern','participation','progressEvidence','goal','action','cooperation','needsCoop','evidence'])) add('K3',`M02 lượt ${i+1} thiếu thông tin.`);
    if(r.profileId && (missing(r,['profileProgress','profileNext','evidence']) || !c.profiles.some(p=>p.id===r.profileId && p.studentId===r.studentId))) add('K6',`M05 lượt ${i+1} thiếu chi tiết hoặc liên kết.`);
  }
  for(const [i,r] of m.connections.entries()) if(missing(r,['studentId','date','channel','message','recipient','reply'])) add('K4',`M03 lượt ${i+1} thiếu thông tin.`);
  for(const r of m.previous) if(missing(r,['studentId','action','observation','next'])) add('K5','M04 phần I thiếu thông tin.');
  for(const r of m.plans) if(missing(r,['studentId','need','goal','action','deadline','cooperation','assessment'])) add('K5','M04 phần II thiếu thông tin.');
  for(const p of c.profiles.filter(p=>p.startMonth===month)) if(missing(p,['studentId','code','strength','concern','goal'])) add('K6','M05 thiếu thông tin.');
  const planned=c.students.filter(s=>m.schedule[s.id]?.planTime || m.schedule[s.id]?.status || m.meetings.some(r=>r.studentId===s.id)).length;
  if(planned<c.students.length) add('K7',`M01 mới lên lịch ${planned}/${c.students.length} học sinh.`,false);
  if(m.connections.some(r=>!r.evidence)) add('K8','M03 còn thiếu mã minh chứng.',false);
  if(!m.connections.length) add('K9','Chưa có kết nối PHHS trong tháng.',false);
  const hasData=!!(planned+m.meetings.length+m.connections.length+m.previous.length+m.plans.length);
  const codes=Object.fromEntries(Array.from({length:9},(_,i)=>{const k=`K${i+1}`;return [k,errors.some(e=>e.key===k)?'LỖI':warnings.some(e=>e.key===k)?'CHÚ Ý':hasData?'OK':'—'];}));
  return {errors,warnings,hasData,codes};
}
export function summary(c,month) {
  const m=c.months[month]||emptyMonth(), unique=rows=>new Set(rows.map(r=>r.studentId)).size;
  const met=new Set(m.meetings.map(r=>r.studentId));
  const planned=c.students.filter(s=>m.schedule[s.id]?.planTime||m.schedule[s.id]?.status||met.has(s.id));
  return {classId:c.id,grade:c.grade,teacher:c.teacher,count:c.students.length,planned:planned.length,met:met.size,
    miss:planned.filter(s=>!met.has(s.id)).length,rate:c.students.length?Math.round(1000*met.size/c.students.length)/10:0,
    priorityMet:c.students.filter(s=>m.schedule[s.id]?.priority&&met.has(s.id)).length,meetings:m.meetings.length,
    improved:unique(m.meetings.filter(r=>r.progressEvidence==='Có')),coordination:unique(m.meetings.filter(r=>r.needsCoop==='Có')),
    connections:m.connections.length,connectedStudents:unique(m.connections),connEvidence:m.connections.filter(r=>r.evidence).length,
    unconnected:Math.max(0,c.students.length-unique(m.connections)),supportPrev:unique(m.previous),supportPlans:unique(m.plans),
    supportDone:m.plans.filter(r=>r.result==='Đạt').length,profileSessions:m.meetings.filter(r=>r.profileId).length,state:m.approval.state};
}
