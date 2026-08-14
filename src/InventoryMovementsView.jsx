import React, { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, Search, X } from "lucide-react";
import { loadProducts, saveProducts } from "./products-data.js";
import "./inventory-movements.css";

const KEY = "bazaar-kolchi-inventory-movements";
function loadMovements(){try{const raw=localStorage.getItem(KEY);return raw?JSON.parse(raw):[]}catch{return []}}
function saveMovements(items){localStorage.setItem(KEY,JSON.stringify(items))}

export default function InventoryMovementsView(){
 const [products,setProducts]=useState(()=>loadProducts());
 const [movements,setMovements]=useState(()=>loadMovements());
 const [query,setQuery]=useState("");
 const [modal,setModal]=useState(null);
 const [form,setForm]=useState({productId:"",quantity:"",note:""});
 const filtered=useMemo(()=>products.filter(p=>`${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase())),[products,query]);
 const open=(type,p)=>{setForm({productId:String(p.id),quantity:"",note:""});setModal(type)};
 const submit=e=>{e.preventDefault();const qty=Math.floor(Number(form.quantity));const product=products.find(p=>String(p.id)===String(form.productId));if(!product||qty<=0)return;const nextStock=modal==="in"?product.stock+qty:product.stock-qty;if(nextStock<0){window.alert("لا يمكن إخراج كمية أكبر من المخزون الحالي.");return}const nextProducts=products.map(p=>p.id===product.id?{...p,stock:nextStock}:p);setProducts(nextProducts);saveProducts(nextProducts);const item={id:Date.now(),type:modal,productId:product.id,productName:product.name,quantity:qty,note:form.note,time:new Date().toLocaleString("ar-DZ")};const nextMovements=[item,...movements];setMovements(nextMovements);saveMovements(nextMovements);setModal(null)};
 return <div className="movementsView" dir="rtl">
  <div className="movementsHeader"><div><h1><ClipboardList size={28}/> حركات المخزون</h1><p>إدخال وإخراج الكميات ومتابعة سجل الحركات</p></div></div>
  <section className="movementPanel"><div className="movementToolbar"><div className="movementSearch"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div></div>
   <div className="movementTableWrap"><table className="movementTable"><thead><tr><th>السلعة</th><th>الباركود</th><th>المخزون الحالي</th><th>الوحدة</th><th>إجراء</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><div className="movementProduct"><span><Boxes size={17}/></span><strong>{p.name}</strong></div></td><td>{p.barcode}</td><td><b>{p.stock}</b></td><td>{p.unit}</td><td><div className="movementActions"><button className="inBtn" onClick={()=>open("in",p)}><ArrowDownToLine size={16}/> إدخال</button><button className="outBtn" onClick={()=>open("out",p)}><ArrowUpFromLine size={16}/> إخراج</button></div></td></tr>)}</tbody></table></div>
  </section>
  <section className="movementPanel history"><div className="historyHead"><h2>سجل حركات المخزون</h2><span>{movements.length} حركة</span></div>{movements.length?<div className="historyList">{movements.map(m=><div className="historyRow" key={m.id}><span className={`historyIcon ${m.type}`} >{m.type==="in"?<ArrowDownToLine size={17}/>:<ArrowUpFromLine size={17}/>}</span><div><strong>{m.productName}</strong><small>{m.type==="in"?"إدخال مخزون":"إخراج مخزون"}{m.note?` — ${m.note}`:""}</small></div><b className={m.type}>{m.type==="in"?"+":"−"}{m.quantity}</b><time>{m.time}</time></div>)}</div>:<div className="historyEmpty">لا توجد حركات مخزون بعد.</div>}</section>
  {modal&&<div className="modalBackdrop" onMouseDown={()=>setModal(null)}><form className="movementModal" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><h2>{modal==="in"?"إدخال مخزون":"إخراج مخزون"}</h2><button type="button" onClick={()=>setModal(null)}><X size={20}/></button></div><div className="movementFormProduct">{products.find(p=>String(p.id)===String(form.productId))?.name}</div><label>الكمية<input autoFocus min="1" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} required/></label><label>ملاحظة اختيارية<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="مثال: شراء جديد / تالف / مرتجع"/></label><div className="modalActions"><button type="button" className="cancelBtn" onClick={()=>setModal(null)}>إلغاء</button><button className="primaryAction" type="submit">تأكيد العملية</button></div></form></div>}
 </div>
}
