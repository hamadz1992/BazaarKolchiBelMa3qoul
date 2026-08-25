import React,{useEffect,useState} from 'react';
import {Store,Save,MapPin,Phone,Clock} from 'lucide-react';
import './store.css';
import {api} from './api-client.js';

const defaults={name:'كل شيء بالمعقول',phone:'',address:'',hours:'09:00 - 21:00',status:true};

export default function StoreView(){
 const [form,setForm]=useState(defaults);
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 const [msg,setMsg]=useState(''); const [error,setError]=useState('');
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));

 const refresh=async()=>{
   setLoading(true);setError('');
   try{
     const data=await api('/settings');
     const s=data?.store||{};
     setForm({
       name:s.store_name||defaults.name,
       phone:s.phone||'',
       address:s.address||'',
       hours:s.opening_hours||defaults.hours,
       status:s.is_open!==false
     });
   }catch(err){setError(err?.message||'تعذر تحميل بيانات المتجر من PostgreSQL.');}
   finally{setLoading(false);}
 };
 useEffect(()=>{refresh()},[]);

 const save=async()=>{
   try{
     setSaving(true);setMsg('');setError('');
     await api('/settings',{method:'PUT',body:JSON.stringify({
       shopName:form.name.trim(),phone:form.phone.trim(),address:form.address.trim(),
       currency:'DZD',openingHours:form.hours.trim(),isOpen:Boolean(form.status)
     })});
     setMsg('تم حفظ بيانات المتجر بنجاح.');
     await refresh();
   }catch(err){setError(err?.message||'تعذر حفظ بيانات المتجر.');}
   finally{setSaving(false);}
 };

 return <div className="storeView">
  <div className="storeHeader"><div><h1><Store/> المتجر</h1><p>إدارة معلومات المتجر وحالته وأوقات العمل من PostgreSQL.</p></div><button onClick={save} disabled={loading||saving}><Save size={18}/> {saving?'جارٍ الحفظ...':'حفظ'}</button></div>
  {error&&<div className="storeMessage error">{error}<button onClick={refresh}>إعادة المحاولة</button></div>}
  <section className="storeCard">
   <div className="storeIdentity"><div className="storeLogo"><Store/></div><div><h2>{form.name||'اسم المتجر'}</h2><span className={form.status?'openStatus':'closedStatus'}>{form.status?'المتجر مفتوح':'المتجر مغلق'}</span></div></div>
   <div className="storeFields">
    <label><Store size={16}/> اسم المتجر<input disabled={loading} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <label><Phone size={16}/> رقم الهاتف<input disabled={loading} value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="اختياري"/></label>
    <label><MapPin size={16}/> العنوان<input disabled={loading} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="اختياري"/></label>
    <label><Clock size={16}/> أوقات العمل<input disabled={loading} value={form.hours} onChange={e=>set('hours',e.target.value)}/></label>
   </div>
   <div className="storeStatus"><div><strong>حالة المتجر</strong><small>يمكن تغييرها عند إغلاق المتجر مؤقتًا.</small></div><button type="button" disabled={loading} className={form.status?'switch on':'switch'} onClick={()=>set('status',!form.status)}><i/></button></div>
  </section>
  {msg&&<div className="storeMessage">{msg}</div>}
 </div>
}
