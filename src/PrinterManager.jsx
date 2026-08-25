import React,{useEffect,useMemo,useRef,useState} from "react";
import {api,apiEnabled} from "./api-client.js";
import {buildInvoiceHtml} from "./pos/pos-print.js";
import InvoiceReceiptPreview from "./pos/components/InvoiceReceiptPreview.jsx";
import {Printer,RefreshCw,CheckCircle2,AlertCircle,Usb,Bluetooth,Wifi,FileText,Settings,Store,Upload,Eye,Save,Minus,Plus} from "lucide-react";
import "./printer-manager.css";

const DEFAULTS={paper:"58mm",copies:1,showLogo:true,showInvoice:true,showDate:true,showEmployee:true,showItems:true,showDiscount:true,showPaid:true,showChange:true,autoPrint:true,shopName:"كل شيء بالمعقول",shopSubtitle:"نقطة بيع",address:"طريق التكوين المهني - بالزڨم\nحساني عبد الكريم - ولاية الوادي",phone:"07XX XXX XXX",barcodeEnabled:true,barcodeText:"رقم الفاتورة",footer:"شكراً لتسوقكم معنا\nنتمنى لكم يوماً سعيداً"};
function connectionType(p){const s=`${p.name||""} ${p.displayName||""} ${p.description||""} ${p.portName||""}`.toLowerCase();if(s.includes("bluetooth"))return ["Bluetooth",Bluetooth];if(s.includes("wifi")||s.includes("network")||s.includes("\\\\"))return ["Wi‑Fi",Wifi];if(s.includes("usb"))return ["USB",Usb];return ["Windows",Printer]}
function escapeHtml(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}

export default function PrinterManager(){
 const[printers,setPrinters]=useState([]),[selected,setSelected]=useState("__AUTO__"),[preferredPrinter,setPreferredPrinter]=useState(""),[loading,setLoading]=useState(false),[printing,setPrinting]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const[settings,setSettings]=useState(DEFAULTS);const[logo,setLogo]=useState("");const remote=apiEnabled();
 const selectedRef=useRef(selected),preferredPrinterRef=useRef(preferredPrinter);
 useEffect(()=>{selectedRef.current=selected},[selected]);
 useEffect(()=>{preferredPrinterRef.current=preferredPrinter},[preferredPrinter]);
 const refresh=async()=>{setLoading(true);setError("");try{if(!window.desktopAPI?.getPrinters)throw new Error("واجهة الطباعة في Desktop غير متاحة");const list=await window.desktopAPI.getPrinters();const available=Array.isArray(list)?list:[];setPrinters(available);const fallback=available.find(p=>p.isDefault)?.name||available[0]?.name||"__AUTO__";const preferred=preferredPrinterRef.current;if(preferred){if(available.some(p=>p.name===preferred)){setSelected(preferred);return;}setSelected(fallback);setMessage(`الطابعة المختارة ${preferred} غير متصلة. تم التحويل مؤقتًا إلى ${fallback==="__AUTO__"?"طابعة Windows الافتراضية":fallback}.`);return;}const current=selectedRef.current;if(current&&current!=="__AUTO__"&&available.some(p=>p.name===current))return;setSelected(fallback);}catch(e){setError(e?.message||"تعذر قراءة طابعات Windows")}finally{setLoading(false)}};
 useEffect(()=>{
  refresh();
  const timer=setInterval(()=>{ refresh(); }, 10000);
  if(remote){
    api('/settings').then(data=>{
      const ps={...DEFAULTS,...(data?.print||{})};
      if(data?.store){
        ps.shopName=data.store.store_name||ps.shopName;
        ps.phone=data.store.phone||ps.phone;
        ps.address=data.store.address||ps.address;
      }
      setSettings(ps);
      if(ps.logo)setLogo(ps.logo);
      const savedPrinter=ps.printerMode==='auto' || !ps.printer ? '' : ps.printer;
      setPreferredPrinter(savedPrinter);
      setSelected(savedPrinter || '__AUTO__');
    }).catch(()=>{});
  }
  return ()=>clearInterval(timer);
},[remote]);
 const update=(key,value)=>setSettings(s=>({...s,[key]:value}));
 const choosePrinter=(value)=>{setSelected(value);setPreferredPrinter(value==='__AUTO__'?'':value);setMessage("تم اختيار الطابعة. اضغط حفظ الإعدادات لتثبيت الاختيار.");setError("")};
 const save=async()=>{
   try{
     const savedPrinter=preferredPrinter || (selected==='__AUTO__' ? '' : selected);
     await api('/settings',{method:'PUT',body:JSON.stringify({shopName:settings.shopName,phone:settings.phone,address:settings.address,currency:'DZD',printSettings:{...settings,printer:savedPrinter,printerMode:savedPrinter?'manual':'auto',logo}})});
     setMessage("تم حفظ إعدادات الطباعة والوصل");
   }catch(e){setError(e?.message||'تعذر حفظ إعدادات الطباعة')}
 };
 const uploadLogo=(e)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setLogo(String(r.result||""));r.readAsDataURL(f)};
 const sampleSale=useMemo(()=>({invoice:"1",createdAt:new Date().toISOString(),customer:"زبون",isDefaultCustomer:true,subtotal:1010,discount:60,total:950,paid:1000,remaining:0,customerPreviousDebt:0,customerTotalDebt:0,items:[{id:"p1",name:"شامبو دوف 400 مل",price:400,quantity:1},{id:"p2",name:"معجون كولجيت 100 مل",price:180,quantity:2},{id:"p3",name:"مناديل ناعمة 550 منديل",price:250,quantity:1}]}),[]);
 const printHtml=useMemo(()=>buildInvoiceHtml(sampleSale,{...settings,logo}),[sampleSale,settings,logo]);
 const test=async()=>{setPrinting(true);setError("");setMessage("");try{if(!window.desktopAPI?.printHtml)throw new Error("خدمة الطباعة في Desktop غير متاحة");const r=await window.desktopAPI.printHtml({html:printHtml,copies:Math.max(1,Number(settings.copies)||1),deviceName:selected,paper:settings.paper});if(!r?.ok)throw new Error(r?.error||"فشلت عملية الطباعة");setMessage("تم إرسال الوصل إلى الطابعة")}catch(e){setError(e?.message||"تعذرت الطباعة")}finally{setPrinting(false)}};
 const [fullPreviewOpen,setFullPreviewOpen]=useState(false);
 const toggles=[['showLogo','إظهار شعار المحل'],['showInvoice','إظهار رقم الفاتورة'],['showDate','إظهار التاريخ والوقت'],['showEmployee','إظهار اسم الموظف'],['showItems','إظهار تفاصيل السلع'],['showDiscount','إظهار الخصم'],['showPaid','إظهار المدفوع'],['showChange','إظهار الباقي']];
 return <div className="printerManager" dir="rtl"><div className="pmTitle"><div><h1><Printer/> الطباعة</h1><p>إعدادات طباعة وصل البيع والفواتير</p></div><button onClick={refresh} disabled={loading}>{loading?<RefreshCw className="spin"/>:<RefreshCw/>} تحديث</button></div><div className="printLayout"><aside className="printSettings"><section className="settingsCard"><h2><Settings/> إعدادات الطباعة</h2><label>حجم الورق</label><div className="paperChoices">{['58mm','80mm','A4'].map(p=><button key={p} className={settings.paper===p?'active':''} onClick={()=>update('paper',p)}>{p}</button>)}</div><label>الطابعة</label><select value={selected} onChange={e=>choosePrinter(e.target.value)}><option value="__AUTO__">تلقائي — طابعة Windows الافتراضية</option>{printers.map(p=><option key={p.name} value={p.name}>{p.displayName||p.name}{p.isDefault?' — الافتراضية':''}</option>)}</select>{selected==='__AUTO__'?<div className="connected"><i/> اختيار تلقائي من Windows</div>:selected&&<div className="connected"><i/> متصلة</div>}<div className="copies"><span>عدد النسخ</span><div><button onClick={()=>update('copies',Math.max(1,settings.copies-1))}><Minus/></button><b>{settings.copies}</b><button onClick={()=>update('copies',settings.copies+1)}><Plus/></button></div></div><div className="toggleList">{toggles.map(([key,label])=><label key={key}><span>{label}</span><input type="checkbox" checked={!!settings[key]} onChange={e=>update(key,e.target.checked)}/></label>)}</div></section><section className="settingsCard autoCard"><label className="auto"><span>الطباعة التلقائية</span><input type="checkbox" checked={settings.autoPrint} onChange={e=>update('autoPrint',e.target.checked)}/></label><p>يُكتشف أي طابعة مثبتة في Windows تلقائيًا. عند تفعيل الوضع التلقائي يستخدم البرنامج الطابعة الافتراضية في Windows وقت الطباعة.</p><button className="saveBtn" onClick={save}><Save/> حفظ الإعدادات</button></section></aside><main className="previewColumn"><section className="previewCard"><h2><Eye/> معاينة الوصل</h2><div className="previewFrameWrap"><InvoiceReceiptPreview sale={sampleSale} printSettings={{...settings,logo}} storeSettings={{store_name:settings.shopName,address:settings.address,phone:settings.phone}} /></div><div className="previewActions"><button className="outline" onClick={()=>setFullPreviewOpen(true)}><Eye/> معاينة كاملة</button><button className="outline" onClick={save}><Save/> حفظ الإعدادات</button><button className="printBtn" onClick={test} disabled={printing}>{printing?<RefreshCw className="spin"/>:<Printer/>}{printing?'جاري الطباعة...':'طباعة الآن'}</button></div></section></main><aside className="shopSettings"><section className="settingsCard"><h2><Store/> معلومات المحل</h2><label>شعار المحل</label><div className="logoUpload"><div>{logo?<img src={logo} alt="logo"/>:<Store/>}</div><label className="uploadBtn"><Upload/> تغيير الشعار<input type="file" accept="image/png,image/jpeg" onChange={uploadLogo}/></label></div><small>الصيغ المدعومة: JPG, PNG</small><label>اسم المحل</label><input value={settings.shopName} onChange={e=>update('shopName',e.target.value)}/><label>العنوان</label><textarea value={settings.address} onChange={e=>update('address',e.target.value)}/><label>الهاتف</label><input value={settings.phone} onChange={e=>update('phone',e.target.value)}/></section></aside></div>{message&&<div className="pmMessage success"><CheckCircle2/>{message}</div>}{error&&<div className="pmMessage error"><AlertCircle/>{error}</div>}<div className="footerNote"><FileText/> المعاينة والطباعة تستخدمان نفس محتوى الوصل. تأكد من اختيار حجم الورق والطابعة قبل الطباعة.</div>{fullPreviewOpen&&<div className="fullPreviewOverlay" role="dialog" aria-modal="true" onMouseDown={e=>{if(e.target===e.currentTarget)setFullPreviewOpen(false)}}><div className="fullPreviewModal"><div className="fullPreviewHeader"><h2>معاينة كاملة للوصل</h2><button onClick={()=>setFullPreviewOpen(false)} aria-label="إغلاق">×</button></div><InvoiceReceiptPreview sale={sampleSale} printSettings={{...settings,logo}} storeSettings={{store_name:settings.shopName,address:settings.address,phone:settings.phone}} /><div className="fullPreviewActions"><button className="saveBtn" onClick={test} disabled={printing}>{printing?"جاري الطباعة...":"طباعة الآن"}</button><button className="previewCloseBtn" onClick={()=>setFullPreviewOpen(false)}>إغلاق</button></div></div></div>}</div>
}
