import React,{useEffect,useState} from 'react';
import {Users,Plus,Search,Edit3,Trash2,Power,UserRound} from 'lucide-react';
import './users.css';
const KEY='bazaar_users';
const emptyForm={name:'',username:'',role:'موظف',password:''};
const initial=[{id:1,name:'مدير المحل',username:'admin',role:'مدير',active:true}];
export default function UsersView(){
 const [users,setUsers]=useState(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||initial}catch{return initial}});
 const [q,setQ]=useState('');
 const [editing,setEditing]=useState(null);
 const [showModal,setShowModal]=useState(false);
 const [form,setForm]=useState(emptyForm);
 useEffect(()=>localStorage.setItem(KEY,JSON.stringify(users)),[users]);
 const close=()=>{setShowModal(false);setEditing(null);setForm(emptyForm)};
 const open=(u=null)=>{setEditing(u?.id||null);setForm(u?{name:u.name,username:u.username,role:u.role,password:''}:{...emptyForm});setShowModal(true)};
 const save=()=>{if(!form.name.trim()||!form.username.trim())return;if(editing)setUsers(users.map(u=>u.id===editing?{...u,name:form.name.trim(),username:form.username.trim(),role:form.role}:u));else setUsers([...users,{id:Date.now(),name:form.name.trim(),username:form.username.trim(),role:form.role,active:true}]);close()};
 const remove=id=>{if(users.length===1)return;setUsers(users.filter(u=>u.id!==id))};
 const toggle=id=>setUsers(users.map(u=>u.id===id?{...u,active:!u.active}:u));
 const filtered=users.filter(u=>`${u.name} ${u.username} ${u.role}`.toLowerCase().includes(q.toLowerCase()));
 return <div className="usersView"><div className="usersHeader"><div><h1><Users/> المستخدمون</h1><p>إدارة حسابات المستخدمين وحالتهم.</p></div><button onClick={()=>open()}><Plus size={18}/> إضافة مستخدم</button></div><div className="usersToolbar"><div><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن مستخدم..."/></div><span>{users.length} مستخدم</span></div><div className="usersTable"><div className="usersRow usersHead"><span>المستخدم</span><span>اسم المستخدم</span><span>الدور</span><span>الحالة</span><span>إجراءات</span></div>{filtered.map(u=><div className="usersRow" key={u.id}><span className="userName"><i><UserRound size={18}/></i><b>{u.name}</b></span><span>{u.username}</span><span>{u.role}</span><span><em className={u.active?'activeStatus':'inactiveStatus'}>{u.active?'نشط':'متوقف'}</em></span><span className="actions"><button onClick={()=>open(u)} title="تعديل"><Edit3 size={16}/></button><button onClick={()=>toggle(u.id)} title={u.active?'إيقاف':'تفعيل'}><Power size={16}/></button><button onClick={()=>remove(u.id)} title="حذف"><Trash2 size={16}/></button></span></div>)}</div>{showModal&&<div className="userModal"><div className="userModalCard"><h2>{editing?'تعديل المستخدم':'إضافة مستخدم'}</h2><label>الاسم<input autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>اسم المستخدم<input value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label><label>الدور<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option>مدير</option><option>موظف</option><option>بائع</option></select></label><label>كلمة المرور<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={editing?'اتركها فارغة إذا لا تريد تغييرها':''}/></label><div><button className="cancel" onClick={close}>إلغاء</button><button className="save" onClick={save}>حفظ</button></div></div></div>}</div>}
