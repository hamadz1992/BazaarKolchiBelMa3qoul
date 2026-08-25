import React,{useEffect,useMemo,useState} from 'react';
import {BarChart3,Boxes,Package,AlertTriangle,ArrowRight} from 'lucide-react';
import {api,apiEnabled} from './api-client.js';
import {subscribeDataChanged,affectsDomains,DATA_DOMAINS} from './data-events.js';

export default function InventoryReportView({onBack}){
  const [products,setProducts]=useState([]);
  const [summary,setSummary]=useState(null);
  const [loading,setLoading]=useState(apiEnabled());
  const [error,setError]=useState('');
  const remote=apiEnabled();
  const refresh=React.useCallback(async()=>{
    if(!remote){setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const [p,d]=await Promise.all([api('/products'),api('/reports/dashboard')]);
      const list=(p||[]).map(x=>({id:x.id,name:x.name,barcode:x.barcode||'',stock:Number(x.current_stock||0),min:Number(x.minimum_stock||0),purchase:Number(x.purchase_price||x.purchase||0),unit:x.unit||''}));
      setProducts(list);setSummary(d||{});
    }catch(e){setError(e?.message||'تعذر تحميل تقرير المخزون.');}
    finally{setLoading(false);}
  },[remote]);
  useEffect(()=>{
    refresh();
    const off=subscribeDataChanged(ev=>{if(affectsDomains(ev,[DATA_DOMAINS.INVENTORY,DATA_DOMAINS.SALES]))refresh();});
    return()=>off?.();
  },[refresh]);
  const stats=useMemo(()=>{
    const low=products.filter(p=>p.stock>0&&p.stock<=p.min), empty=products.filter(p=>p.stock<=0);
    const value=products.reduce((a,p)=>a+(p.stock*p.purchase),0);
    return {count:products.length,low:low.length,empty:empty.length,value,lowList:low.slice(0,10),emptyList:empty.slice(0,10)};
  },[products]);
  return <div className="inventoryReportView" dir="rtl">
    <div className="title"><div><h1><BarChart3/> تقرير المخزون</h1><p>ملخص شامل لحالة المخزون من PostgreSQL</p></div><button className="textBtn" onClick={onBack}>العودة إلى المخزون <ArrowRight size={16}/></button></div>
    {error&&<div className="inventoryReportError">{error}</div>}
    <section className="inventoryReportStats">
      <article><span><Package/></span><div><small>إجمالي السلع</small><strong>{stats.count}</strong></div></article>
      <article><span><Boxes/></span><div><small>قيمة المخزون</small><strong>{stats.value.toLocaleString('en-US',{minimumFractionDigits:2,useGrouping:false})} دج</strong></div></article>
      <article className="warn"><span><AlertTriangle/></span><div><small>منخفضة المخزون</small><strong>{stats.low}</strong></div></article>
      <article className="danger"><span><AlertTriangle/></span><div><small>نافدة</small><strong>{stats.empty}</strong></div></article>
    </section>
    <section className="inventoryReportGrid">
      <article className="reportPanel"><div className="inventoryReportHead"><h2>سلع منخفضة المخزون</h2><button className="textBtn" onClick={onBack}>عرض المخزون</button></div>{loading?<div className="emptyReport">جارٍ التحميل...</div>:stats.lowList.length?<div className="inventoryReportList">{stats.lowList.map(p=><div key={p.id}><strong>{p.name}</strong><span>{p.stock} {p.unit||''}</span><b>الحد {p.min}</b></div>)}</div>:<div className="emptyReport">لا توجد سلع منخفضة المخزون.</div>}</article>
      <article className="reportPanel"><div className="inventoryReportHead"><h2>سلع نافدة</h2><button className="textBtn" onClick={onBack}>عرض المخزون</button></div>{loading?<div className="emptyReport">جارٍ التحميل...</div>:stats.emptyList.length?<div className="inventoryReportList">{stats.emptyList.map(p=><div key={p.id}><strong>{p.name}</strong><span>0 {p.unit||''}</span><b>نفدت</b></div>)}</div>:<div className="emptyReport">لا توجد سلع نافدة.</div>}</article>
    </section>
  </div>;
}
