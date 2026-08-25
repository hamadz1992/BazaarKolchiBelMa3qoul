import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, Search, X, ChevronLeft } from "lucide-react";
import "./inventory-movements.css";
import {api,apiEnabled} from "./api-client.js";
import {emitDataChanged,DATA_DOMAINS} from "./data-events.js";
import Pagination from "./Pagination.jsx";


export default function InventoryMovementsView(){
 const remote=apiEnabled();
 const [products,setProducts]=useState([]);
 const [movements,setMovements]=useState([]);
 const [query,setQuery]=useState(""); const [page,setPage]=useState(1); const pageSize=10;
 const [modal,setModal]=useState(null);
 const [form,setForm]=useState({productId:"",quantity:"",note:""});
 useEffect(()=>{if(!remote)return;Promise.all([api('/products'),api('/inventory/movements')]).then(([ps,ms])=>{setProducts(ps.map(p=>({id:p.id,name:p.name,barcode:p.barcode||'',category:p.category||'',unit:p.unit||'',stock:Number(p.current_stock||0)})));setMovements(ms.map(m=>({id:m.id,type:m.type==='ADJUSTMENT_IN'||m.type==='OPENING'||m.type==='RETURN'?'in':'out',productId:m.product_id,productName:m.product_name,quantity:Math.abs(Number(m.quantity||0)),note:m.note||'',time:new Date(m.created_at).toLocaleString('ar-DZ')})))}).catch(()=>{})},[remote]);
 const filtered=useMemo(()=>products.filter(p=>`${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase())),[products,query]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)); const pageRows=filtered.slice((page-1)*pageSize,page*pageSize);
 const open=(type,p)=>{setForm({productId:String(p.id),quantity:"",note:""});setModal(type)};
 const submit=async e=>{e.preventDefault();const qty=Math.floor(Number(form.quantity));const product=products.find(p=>String(p.id)===String(form.productId));if(!product||qty<=0)return;try{if(remote){await api('/inventory/adjust',{method:'POST',body:JSON.stringify({productId:product.id,quantity:modal==='in'?qty:-qty,type:modal==='in'?'ADJUSTMENT_IN':'ADJUSTMENT_OUT',note:form.note})});const [ps,ms]=await Promise.all([api('/products'),api('/inventory/movements')]);setProducts(ps.map(p=>({id:p.id,name:p.name,barcode:p.barcode||'',category:p.category||'',unit:p.unit||'',stock:Number(p.current_stock||0)})));setMovements(ms.map(m=>({id:m.id,type:m.quantity>0?'in':'out',productId:m.product_id,productName:m.product_name,quantity:Math.abs(Number(m.quantity||0)),note:m.note||'',time:new Date(m.created_at).toLocaleString('ar-DZ')})));emitDataChanged([DATA_DOMAINS.INVENTORY,DATA_DOMAINS.REPORTS],{source:'inventory-adjustment'});}else{window.alert('يتطلب هذا القسم اتصال PostgreSQL/API.');return;}setModal(null)}catch(err){window.alert(err?.message||'تعذر تنفيذ حركة المخزون')}};
 return <div className="movementsView" dir="rtl">
  <div className="movementsHeader"><div><h1><ClipboardList size={28}/> حركات المخزون</h1><p>إدخال وإخراج الكميات وتعديل المخزون</p></div></div>
  <section className="movementPanel"><div className="movementToolbar"><div className="movementSearch"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div></div>
   <div className="movementTableWrap"><table className="movementTable"><thead><tr><th>السلعة</th><th>الباركود</th><th>المخزون الحالي</th><th>الوحدة</th><th>إجراء</th></tr></thead><tbody>{pageRows.map(p=><tr key={p.id}><td><div className="movementProduct"><span><Boxes size={17}/></span><strong>{p.name}</strong></div></td><td>{p.barcode}</td><td><b>{p.stock}</b></td><td>{p.unit}</td><td><div className="movementActions"><button className="inBtn" onClick={()=>open("in",p)}><ArrowDownToLine size={16}/> إدخال</button><button className="outBtn" onClick={()=>open("out",p)}><ArrowUpFromLine size={16}/> إخراج</button></div></td></tr>)}</tbody></table>{filtered.length>0&&<Pagination page={page} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} pageSize={pageSize}/>}</div>
  </section>
  {modal&&<div className="modalBackdrop" onMouseDown={()=>setModal(null)}><form className="movementModal" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><h2>{modal==="in"?"إدخال مخزون":"إخراج مخزون"}</h2><button type="button" onClick={()=>setModal(null)}><X size={20}/></button></div><div className="movementFormProduct">{products.find(p=>String(p.id)===String(form.productId))?.name}</div><label>الكمية<input autoFocus min="1" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} required/></label><label>ملاحظة اختيارية<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="مثال: شراء جديد / تالف / مرتجع"/></label><div className="modalActions"><button type="button" className="cancelBtn" onClick={()=>setModal(null)}>إلغاء</button><button className="primaryAction" type="submit">تأكيد العملية</button></div></form></div>}
 </div>
}
