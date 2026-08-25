import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Receipt,Plus,Trash2,Search,Filter,X} from 'lucide-react';
import './expenses.css';
import {subscribeDataChanged,affectsDomains,emitDataChanged,DATA_DOMAINS} from './data-events.js';
import {api,apiEnabled} from './api-client.js';

const formatRows=rows=>rows.map(x=>({...x,date:new Date(x.created_at).toLocaleString('ar-DZ')}));

export default function ExpensesView(){
  const [items,setItems]=useState([]);
  const remote=apiEnabled();
  const [form,setForm]=useState({amount:'',category:'عام',note:''});
  const [search,setSearch]=useState('');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [loading,setLoading]=useState(false);

  const loadExpenses=useCallback(async (fromValue=from,toValue=to)=>{
    if(!remote)return;
    setLoading(true);
    try{
      const params=new URLSearchParams();
      if(fromValue)params.set('from',fromValue);
      if(toValue){const end=new Date(`${toValue}T00:00:00`);end.setDate(end.getDate()+1);params.set('to',end.toISOString());}
      const rows=await api(`/expenses${params.toString()?`?${params.toString()}`:''}`);
      setItems(formatRows(rows));
    }catch(err){window.alert(err?.message||'تعذر تحميل المصاريف')}finally{setLoading(false)}
  },[remote,from,to]);

  useEffect(()=>{loadExpenses();},[loadExpenses]);
  useEffect(()=>{
    const unsub=subscribeDataChanged((event)=>{
      if(affectsDomains(event,[DATA_DOMAINS.EXPENSES,DATA_DOMAINS.CASH,DATA_DOMAINS.REPORTS])&&remote)loadExpenses();
    });
    const timer=setInterval(()=>{
      if(document.visibilityState!=="hidden"&&remote)loadExpenses();
    },5000);
    return()=>{unsub?.();clearInterval(timer)};
  },[loadExpenses,remote]);

  const save=async()=>{
    const amount=Number(String(form.amount).replace(',','.').replace(/^0+(?=\d)/,''));
    if(!Number.isFinite(amount)||amount<=0)return;
    try{
      const x=await api('/expenses',{method:'POST',body:JSON.stringify({amount,category:form.category,note:form.note})});
      setForm({amount:'',category:'عام',note:''});
      emitDataChanged([DATA_DOMAINS.EXPENSES,DATA_DOMAINS.CASH,DATA_DOMAINS.REPORTS],{source:'expense-created'});
      await loadExpenses();
    }catch(err){window.alert(err?.message||'تعذر حفظ المصروف')}
  };

  const remove=async id=>{try{await api(`/expenses/${id}`,{method:'DELETE'});emitDataChanged([DATA_DOMAINS.EXPENSES,DATA_DOMAINS.CASH,DATA_DOMAINS.REPORTS],{source:'expense-deleted'});await loadExpenses();}catch(err){window.alert(err?.message||'تعذر حذف المصروف')}};

  const resetDates=()=>{setFrom('');setTo('');};
  const filtered=useMemo(()=>items.filter(x=>(x.category+' '+x.note).toLowerCase().includes(search.toLowerCase())),[items,search]);
  const formatAmount = value => `${Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false})}دج`;
  const total=filtered.reduce((s,x)=>s+Number(x.amount||0),0);
  const monthTotal=filtered.filter(x=>{const d=new Date(x.created_at);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()}).reduce((s,x)=>s+Number(x.amount||0),0);

  return <div className="expensesView">
    <div className="expensesHeader"><h1><Receipt/> المصاريف</h1><p>تسجيل ومتابعة مصاريف المحل.</p></div>
    <section className="expenseStats">
      <article><span>إجمالي المصاريف</span><strong>{formatAmount(total)}</strong></article>
      <article><span>عدد العمليات</span><strong>{filtered.length}</strong></article>
      <article><span>هذا الشهر</span><strong>{formatAmount(monthTotal)}</strong></article>
    </section>
    <section className="expenseCard">
      <h2>إضافة مصروف</h2>
      <div className="expenseForm"><input type="text" inputMode="decimal" min="0" placeholder="المبلغ" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value.replace(/[^0-9.,]/g,'').replace(',', '.')})}/><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>عام</option><option>كهرباء</option><option>ماء</option><option>إيجار</option><option>نقل</option><option>أجور</option><option>شراء مستلزمات</option><option>أخرى</option></select><input placeholder="ملاحظة" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/><button onClick={save}><Plus size={18}/> إضافة</button></div>
    </section>
    <section className="expenseCard">
      <div className="expenseListHead"><h2>سجل المصاريف</h2><label><Search size={16}/><input placeholder="بحث" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="expenseFilters">
        <div className="expenseDateField"><span>من</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
        <div className="expenseDateField"><span>إلى</span><input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></div>
        <button className="expenseFilterBtn" onClick={()=>loadExpenses(from,to)} disabled={loading}><Filter size={16}/> تطبيق</button>
        <button className="expenseResetBtn" onClick={resetDates} disabled={!from&&!to}><X size={16}/> إظهار الكل</button>
      </div>
      {filtered.length===0?<div className="expenseEmpty">{loading?'جاري التحميل...':'لا توجد مصاريف ضمن الفترة المحددة.'}</div>:filtered.map(x=><div className="expenseRow" key={x.id}><div><strong>{x.category}</strong><small>{x.note||'بدون ملاحظة'} · {x.date}</small></div><b>{formatAmount(x.amount)}</b><button onClick={()=>remove(x.id)} title="حذف"><Trash2 size={17}/></button></div>)}
    </section>
  </div>
}
