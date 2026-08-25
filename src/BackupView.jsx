import React,{useEffect,useState} from 'react';
import {Download,Upload,Database,Clock,ShieldCheck,RefreshCw,Save,Plus,Trash2,FolderOpen,RotateCcw} from 'lucide-react';
import {api} from './api-client.js';
import './backup.css';

const DEFAULT_SCHEDULE={enabled:false,frequency:'daily',times:['02:00']};

export default function BackupView(){
  const [info,setInfo]=useState({directory:'',files:[]});
  const [schedule,setSchedule]=useState(DEFAULT_SCHEDULE);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const refresh=async()=>{
    try{const [backupInfo,backupSchedule]=await Promise.all([api('/backup'),api('/backup/schedule')]);setInfo(backupInfo||{directory:'',files:[]});setSchedule({...DEFAULT_SCHEDULE,...(backupSchedule||{}),times:Array.isArray(backupSchedule?.times)&&backupSchedule.times.length?backupSchedule.times:['02:00']});}
    catch(e){setMsg(e.message||'تعذر تحميل بيانات النسخ الاحتياطي.');}
  };
  useEffect(()=>{refresh();},[]);
  useEffect(()=>{const t=setInterval(refresh,30000);return()=>clearInterval(t)},[]);

  const formatSize=n=>n?`${(n/1024).toFixed(n<1024*1024?1:0)} ${n<1024*1024?'KB':'MB'}`:'—';
  const latest=info.files?.[0];

  const createNow=async()=>{
    setBusy(true);setMsg('');
    try{await api('/backup/create',{method:'POST'});await refresh();setMsg('تم إنشاء النسخة الاحتياطية بنجاح.');}
    catch(e){setMsg(e.message||'تعذر إنشاء النسخة الاحتياطية.');}
    finally{setBusy(false);}
  };

  const saveSchedule=async()=>{
    setBusy(true);setMsg('');
    try{const clean=[...new Set((schedule.times||[]).filter(v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)))]; if(!clean.length)throw new Error('أضف وقتًا واحدًا على الأقل.'); const saved=await api('/backup/schedule',{method:'PUT',body:JSON.stringify({...schedule,times:clean})});setSchedule({...schedule,...saved,times:saved.times});setMsg(saved.enabled?'تم حفظ النسخ التلقائي.':'تم حفظ الإعدادات وإيقاف النسخ التلقائي.');}
    catch(e){setMsg(e.message||'تعذر حفظ إعدادات النسخ التلقائي.');}
    finally{setBusy(false);}
  };

  const addTime=()=>setSchedule(s=>({...s,times:[...(s.times||[]),'02:00']}));
  const setTime=(index,value)=>setSchedule(s=>({...s,times:s.times.map((t,i)=>i===index?value:t)}));
  const removeTime=index=>setSchedule(s=>({...s,times:s.times.filter((_,i)=>i!==index)}));

  const restore=async(filename)=>{
    if(!filename){setMsg('اختر نسخة احتياطية أولًا.');return;}
    if(!window.confirm(`سيتم استعادة النسخة:\n${filename}\n\nيجب أن يكون الصندوق مغلقًا. سيتم استبدال بيانات قاعدة البيانات الحالية. هل تريد المتابعة؟`))return;
    setBusy(true);setMsg('جاري استعادة قاعدة البيانات...');
    try{await api('/backup/restore',{method:'POST',body:JSON.stringify({filename})});setMsg('تمت الاستعادة بنجاح. أغلق البرنامج وشغّله من جديد لإعادة تحميل جميع البيانات.');await refresh();}
    catch(e){setMsg(e.message||'تعذر استعادة النسخة.');}
    finally{setBusy(false);}
  };

  return <div className="backupView">
    <div className="backupHeader"><h1><Database/> النسخ الاحتياطي</h1><p>نسخ PostgreSQL حقيقية محفوظة تلقائيًا داخل مجلد النسخ الاحتياطية في الجهاز.</p></div>
    <div className="backupGrid">
      <section className="backupCard primary">
        <div className="backupIcon"><ShieldCheck/></div>
        <div><h2>النسخة الاحتياطية</h2><p>يمكنك إنشاء نسخة فورًا، أو الاعتماد على الجدول التلقائي أدناه.</p></div>
        <button onClick={createNow} disabled={busy}><Download size={18}/> حفظ نسخة الآن</button>
      </section>

      <section className="backupCard">
        <div className="backupCardHead"><Clock/><div><h2>آخر نسخة</h2><strong>{latest?new Date(latest.modifiedAt).toLocaleString('ar-DZ'):'لا توجد نسخة بعد'}</strong></div></div>
        <p>الملف: <b>{latest?.name||'—'}</b></p><p>الحجم: <b>{formatSize(latest?.size||0)}</b></p>
        <div className="backupPath"><FolderOpen size={16}/>{info.directory||'—'}</div>
      </section>

      <section className="backupCard">
        <div className="backupCardHead"><Upload/><div><h2>استعادة نسخة</h2><strong>اختر النسخة من القائمة</strong></div></div>
        <p>اختر أي نسخة موجودة داخل مجلد النسخ الاحتياطي. يجب أن يكون الصندوق مغلقًا قبل الاستعادة.</p>
        <div className="restoreList">
          {info.files?.length ? info.files.map(file=><div className="restoreRow" key={file.name}>
            <div><b>{file.name}</b><small>{new Date(file.modifiedAt).toLocaleString('ar-DZ')} · {formatSize(file.size)}</small></div>
            <button className="uploadBtn" onClick={()=>restore(file.name)} disabled={busy}><RotateCcw size={17}/> استعادة</button>
          </div>) : <div className="restoreEmpty">لا توجد نسخ احتياطية بعد.</div>}
        </div>
      </section>

      <section className="backupCard autoBackup">
        <div className="backupCardHead"><RefreshCw/><div><h2>النسخ التلقائي</h2><strong>اختر التكرار والوقت أو عدة أوقات</strong></div></div>
        <div className="backupSettings">
          <label>التكرار<select value={schedule.frequency} onChange={e=>setSchedule({...schedule,frequency:e.target.value})}><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></select></label>
          <label className="backupToggle"><input type="checkbox" checked={schedule.enabled} onChange={e=>setSchedule({...schedule,enabled:e.target.checked})}/> تفعيل الحفظ التلقائي</label>
        </div>
        <div className="backupTimes">
          {(schedule.times||[]).map((time,index)=><div className="backupTimeRow" key={`${index}-${time}`}><input type="time" value={time} onChange={e=>setTime(index,e.target.value)}/><button type="button" className="iconBtn" onClick={()=>removeTime(index)} title="حذف الوقت"><Trash2 size={16}/></button></div>)}
          <button type="button" className="addTimeBtn" onClick={addTime}><Plus size={16}/> إضافة وقت</button>
        </div>
        <small>يمكن اختيار أكثر من وقت في اليوم. يعمل الحفظ تلقائيًا من خدمة الـAPI أثناء تشغيل البرنامج.</small>
        <div className="backupActions"><button className="saveBackup" onClick={saveSchedule} disabled={busy}><Save size={17}/> حفظ الجدولة</button><button className="manualBackup" onClick={createNow} disabled={busy}><Download size={17}/> حفظ نسخة الآن</button></div>
      </section>
    </div>
    {msg&&<div className="backupMessage">{msg}</div>}
  </div>
}
