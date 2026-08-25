import React,{useMemo,useState} from 'react';
import {ArrowRight,FileSpreadsheet,Upload,CheckCircle2,AlertTriangle,Download,RefreshCw} from 'lucide-react';
import {api,apiEnabled} from './api-client.js';
import {emitDataChanged,DATA_DOMAINS} from './data-events.js';
import './products.css';

export default function ExcelImportView(){
  const[file,setFile]=useState(null),[preview,setPreview]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const onFile=e=>{setFile(e.target.files?.[0]||null);setPreview(null);setResult(null);setError('')};
  const toBase64=()=>new Promise((res,rej)=>{if(!file)return rej(new Error('اختر ملف Excel.'));const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error||new Error('تعذر قراءة الملف.'));r.readAsDataURL(file)});
  const runPreview=async()=>{if(!file||!apiEnabled())return;setBusy(true);setError('');setResult(null);try{const base64=await toBase64();setPreview(await api('/import/xlsx/preview',{method:'POST',body:JSON.stringify({base64})}));}catch(e){setError(e?.message||'تعذر تحليل ملف Excel.')}finally{setBusy(false)}};
  const importFile=async()=>{if(!file||!preview||preview.errorCount>0||!apiEnabled())return;setBusy(true);setError('');try{const base64=await toBase64();const x=await api('/import/xlsx',{method:'POST',body:JSON.stringify({base64})});setResult(x);emitDataChanged([DATA_DOMAINS.PRODUCTS,DATA_DOMAINS.INVENTORY,DATA_DOMAINS.REPORTS],{source:'excel-import'});setPreview(null);}catch(e){setError(e?.message||'تعذر استيراد الملف.')}finally{setBusy(false)}};
  const downloadErrors=()=>{if(!preview?.errors?.length)return;const rows=[['السطر','الخطأ'],...preview.errors.flatMap(e=>e.errors.map(msg=>[e.row,msg]))];const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`excel-errors-${Date.now()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  const summary=useMemo(()=>preview?`${preview.validRows||0} صالح من أصل ${preview.rows||0}`:'', [preview]);
  return <div className="productsView" dir="rtl">
    <div className="productsHeader"><button className="backToProducts" onClick={() => window.dispatchEvent(new CustomEvent('app:navigate',{detail:{key:'products'}}))}><ArrowRight size={17}/> العودة إلى السلع</button><div><h1><FileSpreadsheet/> استيراد Excel</h1><p>معاينة ثم إضافة/تحديث المنتجات مع تقرير أخطاء واضح.</p></div></div>
    <section className="productsPanel" style={{padding:24}}>
      <label style={{display:'grid',gap:10,border:'2px dashed #cbd6e4',borderRadius:12,padding:30,textAlign:'center',cursor:'pointer'}}><Upload size={30} style={{margin:'0 auto'}}/><strong>{file?file.name:'اختر ملف Excel (.xlsx)'}</strong><input type="file" accept=".xlsx" onChange={onFile} hidden/></label>
      <p style={{marginTop:14,color:'#667085',fontSize:12}}>الأعمدة المدعومة: اسم السلعة، الباركود، التصنيف، الوحدة، سعر الشراء، سعر البيع، المخزون، الحد الأدنى.</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
        <button className="primaryAction" disabled={!file||busy} onClick={runPreview}>{busy?<><RefreshCw size={16}/> جاري التحليل...</>:<>معاينة الملف</>}</button>
        <button className="primaryAction" disabled={!preview||busy||preview.errorCount>0} onClick={importFile}>{busy?'جاري الاستيراد...':'إضافة / تحديث'}</button>
      </div>
      {error&&<div style={{marginTop:12,color:'#b42318',display:'flex',gap:6,alignItems:'center'}}><AlertTriangle size={17}/>{error}</div>}
      {preview&&<>
        <div style={{marginTop:18,display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
          <div><strong>الصفوف</strong><div>{preview.rows}</div></div><div><strong>صحيحة</strong><div>{preview.validRows}</div></div><div><strong>أخطاء</strong><div>{preview.errorCount}</div></div><div><strong>الحالة</strong><div>{summary}</div></div>
        </div>
        {preview.errors?.length>0&&<div style={{marginTop:16,padding:14,border:'1px solid #f0c8c8',borderRadius:10,background:'#fff7f7'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><strong style={{color:'#b42318'}}>تم العثور على أخطاء — لم يتم السماح بالاستيراد حتى تصحيحها.</strong><button className="secondaryAction" onClick={downloadErrors}><Download size={16}/> تنزيل تقرير الأخطاء</button></div><div style={{marginTop:10,display:'grid',gap:6}}>{preview.errors.slice(0,10).map(e=><div key={e.row}><b>السطر {e.row}:</b> {e.errors.join('، ')}</div>)}{preview.errors.length>10&&<div>وأخطاء أخرى...</div>}</div></div>}
        <div style={{marginTop:18,overflow:'auto',border:'1px solid #e5e7eb',borderRadius:10}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}><thead><tr>{['السطر','السلعة','الباركود','التصنيف','الوحدة','الشراء','البيع','المخزون','الحد الأدنى','الحالة'].map(h=><th key={h} style={{padding:9,textAlign:'right',borderBottom:'1px solid #e5e7eb'}}>{h}</th>)}</tr></thead><tbody>{preview.preview?.slice(0,50).map(r=><tr key={r.row} style={{background:r.valid?'transparent':'#fff7f7'}}><td style={{padding:8}}>{r.row}</td><td style={{padding:8}}>{r.name||'—'}</td><td style={{padding:8}}>{r.barcode||'—'}</td><td style={{padding:8}}>{r.category||'—'}</td><td style={{padding:8}}>{r.unit||'—'}</td><td style={{padding:8}}>{r.purchase}</td><td style={{padding:8}}>{r.price}</td><td style={{padding:8}}>{r.stock}</td><td style={{padding:8}}>{r.min}</td><td style={{padding:8}}>{r.valid?<span style={{color:'#067647'}}>صالح</span>:<span style={{color:'#b42318'}}>خطأ</span>}</td></tr>)}</tbody></table></div>
      </>}
      {result&&<div style={{marginTop:16,padding:14,border:'1px solid #b7e0c2',borderRadius:10,background:'#f2fbf4',display:'flex',gap:8,alignItems:'center'}}><CheckCircle2 size={20}/><span>تمت العملية: {result.created||0} مضاف، {result.updated||0} محدث، {result.skipped||0} متجاوز بسبب أخطاء.</span></div>}
    </section>
  </div>
}
