import React,{useEffect,useState} from 'react';
import {Settings,Store,ReceiptText,Save,RefreshCw,History,RotateCcw} from 'lucide-react';
import './settings.css';
import {api,apiEnabled} from './api-client.js';

const defaults={shopName:'كل شيء بالمعقول',phone:'',address:'',currency:'دج',invoiceFooter:'شكراً لتعاملكم معنا'};
function readSettings(){return defaults}

export default function SettingsView(){
  const remote=apiEnabled();
  const[form,setForm]=useState(readSettings);
  const[msg,setMsg]=useState('');
  const[updateInfo,setUpdateInfo]=useState({version:'',checking:false,message:'',versions:[]});

  useEffect(()=>{
    if(remote) api('/settings').then(x=>setForm(v=>({...v,shopName:x.store?.store_name||v.shopName,phone:x.store?.phone||'',address:x.store?.address||'',currency:x.store?.currency==='DZD'?'دج':x.store?.currency||v.currency,invoiceFooter:x.store?.invoice_footer||v.invoiceFooter}))).catch(()=>{});
    try{window.desktopAPI?.getInfo?.().then(x=>setUpdateInfo(v=>({...v,version:x?.version||''})))}catch{}
    try{window.desktopAPI?.listPreviousVersions?.().then(x=>setUpdateInfo(v=>({...v,versions:Array.isArray(x)?x:[]}))).catch(()=>{})}catch{}
  },[remote]);

  const save=async()=>{
    try{
      if(remote) await api('/settings',{method:'PUT',body:JSON.stringify({shopName:form.shopName,phone:form.phone,address:form.address,currency:form.currency,invoiceFooter:form.invoiceFooter})});
      setMsg('تم حفظ الإعدادات بنجاح');
    }catch(err){setMsg(err?.message||'تعذر حفظ الإعدادات')}
  };

  const checkUpdates=async()=>{
    if(!window.desktopAPI?.checkForUpdates){setUpdateInfo(v=>({...v,message:'التحديث متاح في نسخة Windows المثبتة فقط.'}));return;}
    setUpdateInfo(v=>({...v,checking:true,message:''}));
    try{
      const result=await window.desktopAPI.checkForUpdates();
      let message='لا يوجد إصدار أحدث.';
      if(result?.available&&result?.postponed)message=`تم تأجيل الإصدار ${result.version}.`;
      else if(result?.updated)message='تم بدء التحديث وإعادة تشغيل البرنامج.';
      else if(result?.available&&result?.version)message=`الإصدار المتاح: ${result.version}`;
      else if(result?.error)message=result.error;
      setUpdateInfo(v=>({...v,checking:false,message}));
      window.desktopAPI?.listPreviousVersions?.().then(x=>setUpdateInfo(v=>({...v,versions:Array.isArray(x)?x:v.versions}))).catch(()=>{});
    }catch(err){setUpdateInfo(v=>({...v,checking:false,message:err?.message||'تعذر فحص التحديث'}))}
  };

  const rollback=async(version)=>{
    try{
      setUpdateInfo(v=>({...v,checking:true,message:''}));
      const result=await window.desktopAPI.rollbackVersion(version);
      const message=result?.cancelled?'تم إلغاء الاستعادة.':'بدأت استعادة الإصدار السابق وسيعاد تشغيل البرنامج.';
      setUpdateInfo(v=>({...v,checking:false,message}));
    }catch(err){setUpdateInfo(v=>({...v,checking:false,message:err?.message||'تعذر استعادة الإصدار'}))}
  };

  return <div className="settingsView" dir="rtl">
    <div className="settingsHeader"><h1><Settings/> الإعدادات العامة</h1><p>إدارة معلومات المحل والإعدادات الأساسية للبرنامج.</p></div>
    <div className="settingsGrid">
      <section className="settingsCard"><div className="settingsCardHead"><Store/><div><h2>معلومات المحل</h2><p>تُحفظ في PostgreSQL.</p></div></div><div className="settingsForm">
        <label>اسم المحل<input value={form.shopName||''} onChange={e=>setForm({...form,shopName:e.target.value})}/></label>
        <label>رقم الهاتف<input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label className="wide">العنوان<input value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/></label>
        <label>العملة<select value={form.currency||'دج'} onChange={e=>setForm({...form,currency:e.target.value})}><option value="دج">دج</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
      </div></section>

      <section className="settingsCard"><div className="settingsCardHead"><ReceiptText/><div><h2>الفواتير</h2><p>النص الذي يظهر أسفل الفاتورة.</p></div></div><label className="wide invoiceFooter">نص أسفل الفاتورة<textarea value={form.invoiceFooter||''} onChange={e=>setForm({...form,invoiceFooter:e.target.value})}/></label></section>

      <section className="settingsCard updateCard"><div className="settingsCardHead"><RefreshCw/><div><h2>تحديث البرنامج</h2><p>يفحص البرنامج تلقائيًا بعد تسجيل الدخول، ويسألك قبل التحديث. قبل أي تحديث تُحفظ نسخة من قاعدة البيانات والإصدار الحالي.</p></div></div>
        <div className="updatePanel">
          <div className="updateCurrent"><span>الإصدار الحالي</span><strong>{updateInfo.version||'—'}</strong></div>
          <button onClick={checkUpdates} disabled={updateInfo.checking}><RefreshCw size={17}/>{updateInfo.checking?'جاري الفحص...':'التحقق من وجود تحديث'}</button>
          {updateInfo.message&&<div className="settingsMessage">{updateInfo.message}</div>}
          <div className="rollbackBlock"><div className="rollbackHead"><History size={17}/><strong>آخر 3 إصدارات محفوظة</strong></div>
            {updateInfo.versions?.length ? <div className="rollbackList">{updateInfo.versions.map(v=><div className="rollbackItem" key={v.version}><div><strong>{v.version}</strong><small>{v.createdAt?new Date(v.createdAt).toLocaleString('ar-DZ'):''}</small></div><button onClick={()=>rollback(v.version)} disabled={updateInfo.checking}><RotateCcw size={15}/> استعادة</button></div>)}</div> : <div className="rollbackEmpty">لا توجد إصدارات سابقة محفوظة بعد. سيُحفظ الإصدار الحالي تلقائيًا قبل أول تحديث ناجح.</div>}
          </div>
        </div>
      </section>
    </div>
    <div className="settingsActions"><button onClick={save}><Save size={18}/> حفظ الإعدادات</button>{msg&&<span>{msg}</span>}</div>
  </div>
}
