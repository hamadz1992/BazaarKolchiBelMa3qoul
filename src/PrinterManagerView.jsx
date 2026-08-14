import React,{useEffect,useMemo,useState} from "react";
import {Bluetooth,CheckCircle2,Printer,RefreshCw,Search,Usb,Wifi,AlertCircle,Play,Settings2} from "lucide-react";
import "./print.css";

const KEY="bazaar_print_settings";
const readSettings=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch{return {}}};

function connectionType(printer){
  const text=`${printer?.name||""} ${printer?.displayName||""} ${printer?.description||""}`.toLowerCase();
  if(text.includes("bluetooth")||text.includes("bt")) return "Bluetooth";
  if(text.includes("wi-fi")||text.includes("wifi")||text.includes("network")||text.includes("tcp")) return "Wi-Fi";
  return "USB/Windows";
}

function statusText(status){
  if(status===0) return "جاهزة";
  if(status===1) return "متوقفة";
  if(status===2) return "طباعة";
  if(status===3) return "موقوفة";
  return "متاحة في Windows";
}

export default function PrinterManagerView(){
  const[printers,setPrinters]=useState([]);
  const[selected,setSelected]=useState("");
  const[loading,setLoading]=useState(false);
  const[printing,setPrinting]=useState(false);
  const[message,setMessage]=useState("");
  const[error,setError]=useState("");

  const desktop=typeof window!=="undefined"&&Boolean(window.desktopAPI?.getPrinters);

  const load=async()=>{
    setLoading(true);setError("");setMessage("");
    try{
      if(!desktop){setPrinters([]);setError("مدير الطابعات يعمل من نسخة Windows Desktop. شغّل البرنامج عبر Electron.");return;}
      const list=await window.desktopAPI.getPrinters();
      const safe=Array.isArray(list)?list:[];
      setPrinters(safe);
      const saved=readSettings().printer||"";
      const defaultPrinter=safe.find(p=>p.name===saved)||safe.find(p=>p.isDefault)||safe[0];
      if(defaultPrinter)setSelected(defaultPrinter.name);
      if(!safe.length)setError("لم يتم العثور على طابعة مثبتة في Windows.");
    }catch(e){setError(e?.message||"تعذر جلب قائمة الطابعات.");}
    finally{setLoading(false);}
  };

  useEffect(()=>{load();},[]);

  const current=useMemo(()=>printers.find(p=>p.name===selected),[printers,selected]);

  const saveSelected=()=>{
    const settings=readSettings();
    localStorage.setItem(KEY,JSON.stringify({...settings,connection:"Windows",printer:selected}));
    setMessage("تم حفظ الطابعة الافتراضية.");
    setTimeout(()=>setMessage(""),2200);
  };

  const testPrint=async()=>{
    if(!selected){setError("اختر طابعة أولًا.");return;}
    if(!desktop){setError("الطباعة المباشرة متاحة في نسخة Windows Desktop فقط.");return;}
    setPrinting(true);setError("");setMessage("");
    const settings=readSettings();
    const html=`<div style="width:80mm;margin:0 auto;padding:5mm 4mm;font-family:Arial,Tahoma,sans-serif;font-size:12px;direction:rtl;text-align:right">
      <div style="text-align:center;font-size:21px;font-weight:800">${settings.storeName||"كل شيء بالمعقول"}</div>
      <div style="text-align:center;margin-top:3px">اختبار الطباعة</div>
      <hr style="border:0;border-top:1px dashed #555;margin:10px 0"/>
      <div style="display:flex;justify-content:space-between"><span>الطابعة</span><b>${current?.displayName||selected}</b></div>
      <div style="display:flex;justify-content:space-between;margin-top:5px"><span>الاتصال</span><b>${connectionType(current)}</b></div>
      <div style="display:flex;justify-content:space-between;margin-top:5px"><span>التاريخ</span><span>${new Date().toLocaleString("ar-DZ")}</span></div>
      <hr style="border:0;border-top:1px dashed #555;margin:10px 0"/>
      <div style="text-align:center;font-weight:700">تم الاتصال بالطابعة بنجاح</div>
      <div style="text-align:center;margin-top:10px">هذا وصل اختبار من برنامج<br/>كل شيء بالمعقول</div>
    </div>`;
    try{
      const result=await window.desktopAPI.printHtml({html,deviceName:selected,copies:1,silent:true});
      if(result?.ok){setMessage("تم إرسال وصل الاختبار إلى الطابعة.");saveSelected();}
      else setError(result?.error||"فشلت الطباعة.");
    }catch(e){setError(e?.message||"تعذر تنفيذ اختبار الطباعة.");}
    finally{setPrinting(false);}
  };

  return <div className="printView" dir="rtl">
    <div className="printTitle"><div><h1><Printer/> مدير الطابعات</h1><p>اكتشاف وإدارة الطابعات المثبتة في Windows واختبار الطباعة</p></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:18}}>
      <section className="printCard" style={{padding:22}}>
        <div className="printCardHead"><Printer/><h2>الطابعات المتاحة</h2><button onClick={load} disabled={loading} style={{marginRight:"auto",display:"flex",alignItems:"center",gap:7,padding:"9px 13px",border:"1px solid #ddd",borderRadius:7,background:"#fff"}}>{loading?<RefreshCw className="spin"/>:<RefreshCw/>} تحديث</button></div>
        {!printers.length&&!loading&&<div style={{padding:35,textAlign:"center",color:"#6b7280"}}><Printer size={42}/><p>لا توجد طابعات ظاهرة حاليًا.</p><small>تأكد أن Epson L3110 مثبتة وتظهر في إعدادات Windows.</small></div>}
        <div style={{display:"grid",gap:10}}>{printers.map(p=><button key={p.name} onClick={()=>{setSelected(p.name);setMessage("");setError("")}} style={{textAlign:"right",padding:15,border:selected===p.name?"2px solid #7b22d3":"1px solid #e1e6ef",borderRadius:9,background:selected===p.name?"#faf7ff":"#fff",display:"grid",gridTemplateColumns:"48px 1fr auto",gap:12,alignItems:"center"}}>
          <span style={{width:42,height:42,borderRadius:9,display:"grid",placeItems:"center",background:"#f1eafe",color:"#6d20c8"}}>{connectionType(p)==="Bluetooth"?<Bluetooth/>:connectionType(p)==="Wi-Fi"?<Wifi/>:<Usb/>}</span>
          <span><strong style={{display:"block",fontSize:15}}>{p.displayName||p.name}</strong><small style={{display:"block",color:"#6b7280",marginTop:3}}>{p.name}</small><small style={{display:"block",marginTop:4}}>{connectionType(p)} • {statusText(p.status)}</small></span>
          {selected===p.name?<CheckCircle2 color="#7b22d3"/>:<Search color="#9ca3af"/>}
        </button>)}</div>
      </section>

      <section className="printCard" style={{padding:22}}>
        <div className="printCardHead"><Settings2/><h2>الطابعة المحددة</h2></div>
        {current?<>
          <div style={{padding:18,border:"1px solid #e1e6ef",borderRadius:9,background:"#fafbfe"}}><strong style={{fontSize:17}}>{current.displayName||current.name}</strong><p style={{margin:"7px 0 0",color:"#6b7280",fontSize:13}}>{current.name}</p><p style={{margin:"7px 0 0",fontSize:13}}>{connectionType(current)} • {statusText(current.status)}</p></div>
          <div style={{display:"grid",gap:10,marginTop:16}}><button onClick={saveSelected} style={{height:45,border:0,borderRadius:7,background:"#6d20c8",color:"#fff",fontWeight:700}}><CheckCircle2 size={18}/> حفظ كطابعة افتراضية</button><button onClick={testPrint} disabled={printing} style={{height:45,border:"1px solid #6d20c8",borderRadius:7,background:"#fff",color:"#6d20c8",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{printing?<RefreshCw className="spin"/>:<Play size={18}/>} {printing?"جاري إرسال الاختبار...":"طباعة وصل اختبار"}</button></div>
        </>:<div style={{padding:35,textAlign:"center",color:"#6b7280"}}><AlertCircle/><p>اختر طابعة من القائمة.</p></div>}
        {message&&<div style={{marginTop:15,padding:11,borderRadius:7,background:"#eaf8f1",color:"#16845d",display:"flex",gap:7,alignItems:"center"}}><CheckCircle2 size={17}/>{message}</div>}
        {error&&<div style={{marginTop:15,padding:11,borderRadius:7,background:"#fff0f2",color:"#c4234d",display:"flex",gap:7,alignItems:"center"}}><AlertCircle size={17}/>{error}</div>}
        <div style={{marginTop:18,padding:12,borderTop:"1px dashed #d8dce4",fontSize:12,color:"#687385",lineHeight:1.8}}>أي طابعة تظهر في Windows يمكن للبرنامج التعامل معها هنا، سواء كانت USB أو شبكة أو Bluetooth إذا كان Windows قد أضافها كطابعة. الدعم المباشر لبروتوكولات Bluetooth/ESC-POS سيضاف في المرحلة التالية للطابعات الحرارية.</div>
      </section>
    </div>
  </div>;
}
