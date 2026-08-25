import React,{useCallback,useEffect,useMemo,useState} from "react";
import {BarChart3,Boxes,Package,TrendingUp,ShoppingCart,AlertTriangle,WalletCards,UsersRound,ReceiptText,CalendarDays} from "lucide-react";
import {api,apiEnabled} from "./api-client.js";
import {subscribeDataChanged,affectsDomains,DATA_DOMAINS} from "./data-events.js";
import "./reports.css";

function rangeFor(period,fromDate,toDate){
  const now=new Date();
  if(period==='custom'){
    const from=fromDate?new Date(`${fromDate}T00:00:00`):null;
    const to=toDate?new Date(`${toDate}T23:59:59.999`):null;
    return {from:from&&!Number.isNaN(from.getTime())?from.toISOString():null,to:to&&!Number.isNaN(to.getTime())?to.toISOString():null};
  }
  if(period==='all')return {from:null,to:null};
  const start=new Date(now); start.setHours(0,0,0,0);
  if(period==='7')start.setDate(start.getDate()-6);
  else if(period==='30')start.setDate(start.getDate()-29);
  return {from:start.toISOString(),to:now.toISOString()};
}

const money=v=>Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});

function SalesChart({daily}){
  const rows=useMemo(()=>daily.slice(0,14).reverse(),[daily]);
  if(!rows.length) return <div className="emptyReport">لا توجد بيانات كافية للرسم في الفترة المحددة.</div>;
  const max=Math.max(...rows.map(r=>Number(r.total||0)),1);
  const width=680,height=230,padX=34,padTop=22,padBottom=34,innerW=width-padX*2,innerH=height-padTop-padBottom;
  const points=rows.map((r,i)=>{const x=padX+(rows.length===1?innerW/2:(i/(rows.length-1))*innerW); const y=padTop+innerH-(Number(r.total||0)/max)*innerH; return {x,y,r};});
  const d=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return <div className="reportChartWrap"><svg viewBox={`0 0 ${width} ${height}`} className="reportChart" preserveAspectRatio="none">
    {[0,.25,.5,.75,1].map((n,i)=><line key={i} x1={padX} x2={width-padX} y1={padTop+innerH*n} y2={padTop+innerH*n} className="chartGrid"/>)}
    <path d={`${d} L ${points[points.length-1].x} ${padTop+innerH} L ${points[0].x} ${padTop+innerH} Z`} className="chartArea"/>
    <path d={d} className="chartLine"/>
    {points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="4" className="chartDot"/><text x={p.x} y={p.y-9} textAnchor="middle" className="chartValue">{money(p.r.total)}</text><text x={p.x} y={height-10} textAnchor="middle" className="chartLabel">{new Date(p.r.sale_day).toLocaleDateString("ar-DZ",{day:"2-digit",month:"2-digit"})}</text></g>)}
  </svg></div>;
}

export default function ReportsView(){
  const[period,setPeriod]=useState("today");
  const[fromDate,setFromDate]=useState(""); const[toDate,setToDate]=useState("");
  const[remoteData,setRemoteData]=useState(null); const[daily,setDaily]=useState([]); const[expenseBreakdown,setExpenseBreakdown]=useState([]); const[debtors,setDebtors]=useState([]);
  const[products,setProducts]=useState([]); const[loadError,setLoadError]=useState("");
  const remote=apiEnabled();

  const loadReports=useCallback(async()=>{
    if(!remote)return;
    const {from,to}=rangeFor(period,fromDate,toDate); const q=new URLSearchParams(); if(from)q.set('from',from); if(to)q.set('to',to); const suffix=q.toString()?`?${q.toString()}`:'';
    setLoadError("");
    const results=await Promise.allSettled([
      api(`/reports/dashboard${suffix}`),
      api(`/reports/top-products?limit=10${suffix?`&${q.toString()}`:''}`),
      api(`/reports/daily-sales${suffix}`),
      api(`/reports/expense-summary${suffix}`),
      api('/reports/debtors?limit=10'),
      api('/products')
    ]);
    const [d,t,ds,es,db,ps]=results;
    if(d.status==='fulfilled')setRemoteData(prev=>({...((prev)||{}),...(d.value||{})})); else setLoadError(d.reason?.message||'تعذر تحميل ملخص التقارير.');
    if(t.status==='fulfilled')setRemoteData(prev=>({...((prev)||{}),topProducts:t.value||[]}));
    if(ds.status==='fulfilled')setDaily(ds.value||[]); else setDaily([]);
    if(es.status==='fulfilled')setExpenseBreakdown(es.value||[]); else setExpenseBreakdown([]);
    if(db.status==='fulfilled')setDebtors(db.value||[]); else setDebtors([]);
    if(ps.status==='fulfilled')setProducts((ps.value||[]).map(p=>({id:p.id,name:p.name,stock:Number(p.current_stock||0),unit:p.unit||'',min:Number(p.minimum_stock||0),purchase:Number(p.purchase_price||0)})));
  },[remote,period,fromDate,toDate]);

  useEffect(()=>{loadReports(); if(!remote)return; const off=subscribeDataChanged((event)=>{if(affectsDomains(event,[DATA_DOMAINS.SALES,DATA_DOMAINS.CASH,DATA_DOMAINS.INVENTORY,DATA_DOMAINS.CUSTOMERS,DATA_DOMAINS.EXPENSES,DATA_DOMAINS.REPORTS]))loadReports();}); return()=>off?.();},[loadReports,remote]);

  const salesTotal=Number((remoteData?.netSales ?? remoteData?.sales?.total) || 0), grossSales=Number(remoteData?.grossSales||remoteData?.sales?.gross_total||salesTotal), returnedSales=Number(remoteData?.returnedSales||remoteData?.sales?.returned_total||0), profit=Number((remoteData?.grossProfit ?? remoteData?.profit) || 0), netProfit=Number(remoteData?.netProfit ?? (profit-Number(remoteData?.expenses||0))), count=Number(remoteData?.sales?.count||0), items=Number(remoteData?.items?.quantity||0);
  const cost=Number(remoteData?.items?.cost||0), expenses=Number(remoteData?.expenses||0), debt=Number(remoteData?.debt||0), cash=Number(remoteData?.cashBalance||0);
  const low=products.filter(p=>p.stock>0&&p.stock<=p.min), empty=products.filter(p=>p.stock<=0);
  const avg=count?salesTotal/count:0, margin=salesTotal?profit/salesTotal*100:0;
  const chartTotal=daily.reduce((s,r)=>s+Number(r.total||0),0);

  return <div className="reportsView" dir="rtl">
    <div className="reportsHeader">
      <div><h1><BarChart3/> لوحة التحكم</h1><p>{remote?"بيانات مباشرة من PostgreSQL":"ملخص المبيعات والمخزون والأداء"}</p></div>
      <div className="periodControls">
        <div className="periods">{[["today","اليوم"],["7","7 أيام"],["30","30 يوم"],["all","الكل"]].map(([v,t])=><button className={period===v?"active":""} onClick={()=>setPeriod(v)} key={v}>{t}</button>)}</div>
        <div className="customRange"><CalendarDays size={16}/><input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPeriod('custom')}}/><span>إلى</span><input type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPeriod('custom')}}/></div>
      </div>
    </div>

    {loadError&&<div className="emptyReport reportError">تعذر تحميل جزء من البيانات: {loadError}</div>}

    <section className="reportStats compactStats dashboardKpis">
      <article><span><ShoppingCart/></span><small>صافي المبيعات</small><strong>{money(salesTotal)} دج</strong><small>قبل المرتجعات {money(grossSales)} · المرتجعات {money(returnedSales)}</small></article>
      <article><span><TrendingUp/></span><small>مجمل الربح</small><strong>{money(profit)} دج</strong><small>صافي الربح بعد المصاريف {money(netProfit)} دج</small></article>
      <article><span><Package/></span><small>عدد العمليات</small><strong>{count}</strong><small>عمليات البيع في الفترة</small></article>
      <article><span><Boxes/></span><small>القطع المباعة</small><strong>{items}</strong><small>وحدة خلال الفترة</small></article>
    </section>

    <div className="dashboardSectionLabel">الوضع المالي الحالي</div>
    <section className="reportsGrid dashboardFinancial">
      <div className="reportPanel financialPanel"><h2><WalletCards/> الوضع المالي الحالي</h2><div className="financialCompact"><div><WalletCards/><span>الرصيد الحالي للصندوق</span><b>{money(cash)} دج</b></div><div><UsersRound/><span>ديون العملاء</span><b>{money(debt)} دج</b></div></div><div className="emptyReport compactMessage">الرصيد والدين الحاليان من PostgreSQL.</div></div>
      <div className="reportPanel"><h2>ملخص الفترة</h2>{[["تكلفة السلع المباعة",money(cost)+" دج"],["المصاريف",money(expenses)+" دج"],["مجمل الربح",money(profit)+" دج"],["صافي الربح",money(netProfit)+" دج"],["متوسط البيع",money(avg)+" دج"],["هامش الربح",margin.toFixed(1)+"%"]].map(([k,v])=><div className="summaryRow" key={k}><span>{k}</span><b>{v}</b></div>)}<div className="emptyReport compactMessage">{count?`${count} عملية بيع مسجلة في الفترة المحددة.`:"لا توجد عمليات بيع في الفترة المحددة."}</div></div>
    </section>

    <div className="dashboardSectionLabel">المبيعات</div>
    <section className="reportPanel chartPanel"><div className="panelTitleRow"><h2>المبيعات خلال الفترة</h2><span>{money(chartTotal)} دج</span></div><SalesChart daily={daily}/></section>

    <div className="dashboardSectionLabel">المخزون</div>
    <section className="reportsGrid dashboardInventory">
      <div className="reportPanel"><h2>تنبيهات المخزون</h2><div className="stockAlert"><AlertTriangle/><div><strong>منخفضة المخزون</strong><span>{low.length} سلع</span></div></div><div className="stockAlert empty"><Boxes/><div><strong>نافدة</strong><span>{empty.length} سلع</span></div></div><div className="reportTable compact">{[...low,...empty].slice(0,5).map(p=><div key={p.id}><strong>{p.name}</strong><b>{p.stock} {p.unit}</b></div>)}</div></div>
      <div className="reportPanel"><h2>الأكثر مبيعًا</h2>{remoteData?.topProducts?.length?<div className="reportTable">{remoteData.topProducts.slice(0,5).map(s=><div key={s.product_id||s.product_name}><strong>{s.product_name}</strong><span>{Number(s.quantity||0)} وحدة</span><b>{money(s.revenue)} دج</b></div>)}</div>:<div className="emptyReport compactMessage">لا توجد مبيعات في الفترة المحددة.</div>}<div className="panelFooter">عرض أول 5 منتجات</div></div>
    </section>

    <section className="reportPanel inventoryValuePanel"><h2>قيمة المخزون</h2><div className="inventorySummary"><div><span>القيمة الحالية بسعر الشراء</span><b>{money(remoteData?.inventoryValue)} دج</b></div><div><span>منخفضة</span><b>{low.length}</b></div><div><span>نافدة</span><b>{empty.length}</b></div></div></section>

    <div className="dashboardSectionLabel">العملاء والمصاريف</div>
    <section className="reportsGrid dashboardPeopleExpenses">
      <div className="reportPanel"><h2>أعلى المدينين</h2>{debtors.length?<div className="reportTable">{debtors.slice(0,5).map(r=><div key={r.id}><strong>{r.name}</strong><span>دين</span><b>{money(r.balance)} دج</b></div>)}</div>:<div className="emptyReport compactMessage">لا توجد ديون مستحقة.</div>}</div>
      <div className="reportPanel"><h2>المصاريف حسب النوع</h2>{expenseBreakdown.length?<div className="reportTable">{expenseBreakdown.slice(0,5).map((r,i)=><div key={r.category+i}><strong>{r.category}</strong><span>{r.count} عملية</span><b>{money(r.amount)} دج</b></div>)}</div>:<div className="emptyReport compactMessage">لا توجد مصاريف في الفترة المحددة.</div>}</div>
    </section>

    <div className="dashboardSectionLabel">ملاحظات</div>
    <div className="reportPanel notesPanel"><h2><ReceiptText/> ملاحظات التقرير</h2><p className="reportNote">الفترة الحالية محددة بالأزرار أعلاه، ويمكن اختيار نطاق مخصص بالتاريخ. البيانات التشغيلية تأتي من PostgreSQL عند التفعيل.</p></div>
  </div>;
}
