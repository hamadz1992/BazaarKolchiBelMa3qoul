import React,{useEffect,useState} from 'react';
import Pagination from './Pagination.jsx';
import {Users,Plus,Search,Edit3,Trash2,Power,UserRound,X} from 'lucide-react';
import './users.css';
import {api} from './api-client.js';

const emptyForm={name:'',username:'',role:'موظف',password:''};

export default function UsersView(){
 const [users,setUsers]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [q,setQ]=useState(''); const [page,setPage]=useState(1); const pageSize=10;
 const [editing,setEditing]=useState(null); const [showModal,setShowModal]=useState(false); const [form,setForm]=useState(emptyForm);

 const refresh=async()=>{
   setLoading(true);setError('');
   try{
     const rows=await api('/users');
     setUsers(rows.map(u=>({...u,role:Array.isArray(u.roles)?u.roles[0]||'موظف':'موظف'})));
   }catch(err){setUsers([]);setError(err?.message||'تعذر تحميل المستخدمين من PostgreSQL.');}
   finally{setLoading(false);}
 };
 useEffect(()=>{refresh()},[]);

 const close=()=>{setShowModal(false);setEditing(null);setForm(emptyForm)};
 const open=u=>{setEditing(u?.id||null);setForm(u?{name:u.name,username:u.username,role:u.role,password:''}:{...emptyForm});setShowModal(true)};

 const save=async()=>{
   if(!form.name.trim()||!form.username.trim())return;
   if(!editing&&!form.password.trim()){window.alert('كلمة المرور مطلوبة عند إنشاء مستخدم جديد.');return;}
   try{
     const u=await api('/users',{method:'POST',body:JSON.stringify(form)});
     if(!editing) await api(`/users/${u.id}/roles`,{method:'POST',body:JSON.stringify({roles:[form.role]})});
     else await api(`/users/${u.id}/roles`,{method:'POST',body:JSON.stringify({roles:[form.role]})});
     await refresh(); close();
   }catch(err){window.alert(err?.message||'تعذر حفظ المستخدم')}
 };
 const toggle=async id=>{
   const u=users.find(x=>x.id===id);if(!u)return;
   try{await api('/users',{method:'POST',body:JSON.stringify({id,name:u.name,username:u.username,active:!u.active})});await refresh();}
   catch(err){window.alert(err?.message||'تعذر تغيير الحالة')}
 };
 const remove=id=>window.alert('لا نحذف المستخدم من قاعدة البيانات؛ أوقفه بدلًا من ذلك للحفاظ على السجلات.');

 const filtered=users.filter(u=>`${u.name} ${u.username} ${u.role}`.toLowerCase().includes(q.toLowerCase()));
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const pageRows=filtered.slice((page-1)*pageSize,page*pageSize);

 return <div className="usersView">
  <div className="usersHeader"><div><h1><Users/> المستخدمون</h1><p>إدارة المستخدمين من PostgreSQL.</p></div><button onClick={()=>open()}><Plus size={18}/> إضافة مستخدم</button></div>
  <div className="usersToolbar"><div><Search size={18}/><input value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="ابحث عن مستخدم..."/></div><span>{users.length} مستخدم</span></div>
  {error&&<div className="usersError">{error}<button onClick={refresh}>إعادة المحاولة</button></div>}
  <div className="usersTable">
   <div className="usersRow usersHead"><span>المستخدم</span><span>اسم المستخدم</span><span>الدور</span><span>الحالة</span><span>إجراءات</span></div>
   {loading?<div className="usersEmpty">جارٍ تحميل المستخدمين من PostgreSQL...</div>:pageRows.map(u=><div className="usersRow" key={u.id}>
    <span className="userName"><i><UserRound size={18}/></i><b>{u.name}</b></span><span>{u.username}</span><span>{u.role}</span>
    <span><em className={u.active?'activeStatus':'inactiveStatus'}>{u.active?'نشط':'متوقف'}</em></span>
    <span className="actions"><button onClick={()=>open(u)} title="تعديل"><Edit3 size={16}/></button><button onClick={()=>toggle(u.id)} title={u.active?'إيقاف':'تفعيل'}><Power size={16}/></button><button onClick={()=>remove(u.id)} title="حذف"><Trash2 size={16}/></button></span>
   </div>)}
   {!loading&&!pageRows.length&&!error&&<div className="usersEmpty">لا يوجد مستخدمون.</div>}
  </div>
  {filtered.length>0&&<Pagination page={page} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} pageSize={pageSize}/>}
  {showModal&&<div className="userModal" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="userModalCard"><button className="modalClose" onClick={close} title="إغلاق"><X size={18}/></button><h2>{editing?'تعديل المستخدم':'إضافة مستخدم'}</h2>
   <label>الاسم<input autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
   <label>اسم المستخدم<input value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label>
   <label>الدور<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option>مدير</option><option>موظف</option><option>بائع</option></select></label>
   <label>كلمة المرور<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={editing?'اتركها فارغة إذا لا تريد تغييرها':'مطلوبة: 12+ محرفًا'}/></label>
   <div><button className="cancel" onClick={close}>إلغاء</button><button className="save" onClick={save}>حفظ</button></div>
  </div></div>}
 </div>
}
