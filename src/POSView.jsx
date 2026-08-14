import React, { useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { loadProducts, saveProducts } from "./products-data.js";
import "./pos.css";

const SALES_KEY = "bazaar-kolchi-sales";
function loadSales(){try{const raw=localStorage.getItem(SALES_KEY);return raw?JSON.parse(raw):[]}catch{return []}}
function saveSales(items){localStorage.setItem(SALES_KEY,JSON.stringify(items))}

export default function POSView(){
 const [products,setProducts]=useState(()=>loadProducts());
 const [cart,setCart]=useState([]); const [query,setQuery]=useState(""); const [paid,setPaid]=useState(""); const [message,setMessage]=useState("");
 const filtered=useMemo(()=>products.filter(p=>`${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase())),[products,query]);
 const total=cart.reduce((s,i)=>s+i.price*i.quantity,0);
 const add=p=>{setMessage("");setCart(c=>{const found=c.find(i=>i.id===p.id);if(found){if(found.quantity>=p.stock)return c;return c.map(i=>i.id===p.id?{...i,quantity:i.quantity+1}:i)}return [...c,{id:p.id,name:p.name,barcode:p.barcode,price:p.price,quantity:1,max:p.stock}]})};
 const change=(id,delta)=>setCart(c=>c.map(i=>i.id===id?{...i,quantity:Math.max(1,Math.min(i.max,i.quantity+delta))}:i));
 const remove=id=>setCart(c=>c.filter(i=>i.id!==id));
 const complete=()=>{if(!cart.length)return;if(Number(paid)<total){setMessage("المبلغ المدفوع أقل من إجمالي الفاتورة.");return}const nextProducts=products.map(p=>{const item=cart.find(i=>i.id===p.id);return item?{...p,stock:p.stock-item.quantity}:p});saveProducts(nextProducts);setProducts(nextProducts);const sales=loadSales();saveSales([{id:Date.now(),number:`INV-${String(sales.length+1).padStart(5,"0")}`,items:cart,total,paid:Number(paid),change:Number(paid)-total,time:new Date().toLocaleString("ar-DZ")},...sales]);setCart([]);setPaid("");setMessage("تم تسجيل عملية البيع وتحديث المخزون بنجاح.")};
 return <div className="posView" dir="rtl"><div className="posHeader"><div><h1><ShoppingCart size={28}/> نقطة البيع</h1><p>إتمام عمليات البيع وتحديث المخزون تلقائيًا</p></div><span className="posInvoice">فاتورة جديدة</span></div><div className="posLayout"><section className="posProducts"><div className="posSearch"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div><div className="posGrid">{filtered.map(p=><button className="posProduct" key={p.id} onClick={()=>p.stock>0&&add(p)} disabled={p.stock<=0}><strong>{p.name}</strong><small>{p.barcode}</small><span>{p.price.toFixed(2)} دج</span><em>{p.stock>0?`متوفر: ${p.stock}`:"نافد"}</em></button>)}</div></section><section className="posCart"><div className="cartHead"><h2>السلة</h2><span>{cart.reduce((s,i)=>s+i.quantity,0)} قطعة</span></div><div className="cartItems">{cart.length?cart.map(i=><div className="cartItem" key={i.id}><div><strong>{i.name}</strong><small>{i.price.toFixed(2)} دج × {i.quantity}</small></div><div className="cartControls"><button onClick={()=>change(i.id,-1)}><Minus size={14}/></button><b>{i.quantity}</b><button onClick={()=>change(i.id,1)}><Plus size={14}/></button><button className="delete" onClick={()=>remove(i.id)}><Trash2 size={15}/></button></div></div>):<div className="cartEmpty"><ShoppingCart size={30}/><span>السلة فارغة</span><small>اختر سلعة لإضافتها إلى الفاتورة</small></div>}</div><div className="cartSummary"><div><span>الإجمالي</span><strong>{total.toFixed(2)} دج</strong></div><label>المبلغ المدفوع<input type="number" min="0" value={paid} onChange={e=>setPaid(e.target.value)} placeholder="0.00"/></label><div><span>الباقي</span><strong>{Math.max(0,Number(paid||0)-total).toFixed(2)} دج</strong></div><button className="completeBtn" onClick={complete} disabled={!cart.length}><CheckCircle2 size={18}/> إتمام البيع</button>{message&&<div className="posMessage">{message}</div>}</div></section></div></div>
}
