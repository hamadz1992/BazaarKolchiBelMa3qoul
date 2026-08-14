import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell, CircleHelp, LogOut, ShoppingCart, Settings, Home, Store, Users,
  ShieldCheck, Package, Boxes, Warehouse, BarChart3, UserRound, FileText,
  CloudBackup, ReceiptText, WalletCards, AlertTriangle, TrendingUp,
  ChevronLeft, ChevronDown, ChevronUp, CalendarDays, Info, Tags, Ruler,
  ScanBarcode
} from "lucide-react";
import "./styles.css";

const menu = [
  { label: "نظرة عامة", Icon: Home },
  { label: "المتجر", Icon: Store },
  { label: "المستخدمون", Icon: Users },
  { label: "الصلاحيات", Icon: ShieldCheck },
  {
    label: "السلع", Icon: Package, children: [
      ["قائمة السلع", Package], ["إضافة سلعة", Boxes], ["تصنيفات السلع", Tags],
      ["الوحدات", Ruler], ["الباركود", ScanBarcode]
    ]
  },
  { label: "المخزون", Icon: Warehouse },
  { label: "المبيعات", Icon: BarChart3 },
  { label: "العملاء", Icon: UserRound },
  { label: "التقارير", Icon: FileText },
  { label: "النسخ الاحتياطي", Icon: CloudBackup },
  { label: "الإعدادات العامة", Icon: Settings }
];

const sales = [["السبت",7850],["الأحد",8420],["الاثنين",6230],["الثلاثاء",9540],["الأربعاء",10230],["الخميس",11280],["اليوم",12450]];
const operations = [["280.00","منذ 5 دقائق","#INV-00045"],["450.00","منذ 15 دقيقة","#INV-00044"],["120.00","منذ 32 دقيقة","#INV-00043"],["950.00","منذ 1 ساعة","#INV-00042"],["80.00","منذ 2 ساعة","#INV-00041"]];

function Stat({title,value,unit="دج",note,kind,Icon}) {
  return <article className={`stat ${kind}`}>
    <div className="statIcon"><Icon size={25}/></div>
    <div className="statTitle">{title}</div>
    <div className="statValue">{value}</div>
    <div className="statUnit">{unit}</div>
    {note && <div className="statNote">{note}</div>}
  </article>;
}

function Chart(){
  const max = 12450;
  const pts = sales.map(([,v],i)=>[45+i*88,180-(v/max)*135]);
  const line = pts.map(([x,y],i)=>`${i?'L':'M'} ${x} ${y}`).join(' ');
  return <section className="panel chartPanel">
    <div className="panelHead">
      <div><h2>المبيعات خلال 7 أيام</h2><div className="legend"><i/> المبيعات (دج)</div></div>
      <button className="range"><ChevronDown size={15}/> 7 أيام <CalendarDays size={15}/></button>
    </div>
    <div className="chart">
      <div className="axis">{['14K','12K','10K','8K','6K','4K','2K','0'].map(x=><span key={x}>{x}</span>)}</div>
      <svg viewBox="0 0 620 215" preserveAspectRatio="none">
        {[30,52,74,96,118,140,162,184].map(y=><line key={y} x1="40" x2="610" y1={y} y2={y} className="grid"/>)}
        <path d={`${line} L 573 190 L 45 190 Z`} className="area"/>
        <path d={line} className="line"/>
        {pts.map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="5"/><text x={x} y={y-12} textAnchor="middle">{sales[i][1].toLocaleString()}</text><text x={x} y="210" textAnchor="middle" className="day">{sales[i][0]}</text></g>)}
      </svg>
    </div>
    <div className="chartFoot"><span>↗ +16% عن الفترة السابقة</span><strong>إجمالي المبيعات خلال 7 أيام: <b>65,999.00 دج</b></strong></div>
  </section>;
}

function Operations(){
  return <section className="panel ops">
    <div className="panelHead"><h2>آخر العمليات</h2><button className="textBtn">عرض الكل <ChevronLeft size={15}/></button></div>
    {operations.map(([amount,time,id])=><div className="operation" key={id}>
      <div className="opIcon"><ShoppingCart size={19}/></div><div><strong>عملية بيع</strong><small>فاتورة {id}</small></div><b>{amount} دج</b><span>{time} ◷</span>
    </div>)}
  </section>;
}

function App(){
  const [mobile,setMobile] = useState(false);
  const [productsOpen,setProductsOpen] = useState(true);
  const [notifications,setNotifications] = useState(3);

  return <div className="app">
    <header className="top">
      <div className="brand"><div className="brandLogo">▰</div><div><strong>كل شيء بالمعقول</strong><small>نقطة بيع</small></div></div>
      <div className="topCenter"><button className="other"><ShoppingCart/> سلة أخرى</button><button className="pos"><ShoppingCart/> نقطة البيع</button></div>
      <div className="tools">
        <button onClick={()=>setNotifications(0)}><Bell/><em>{notifications}</em> إشعارات</button>
        <button><CircleHelp/> مساعدة</button><button><LogOut/> خروج</button>
      </div>
      <button className="mobile" onClick={()=>setMobile(!mobile)} aria-label="فتح القائمة">☰</button>
    </header>

    <aside className={mobile?'side open':'side'}>
      <div className="sideTitle"><Settings/> الإعدادات</div>
      {menu.map(({label,Icon,children},i)=><div key={label}>
        <button className={i===0?'nav active':'nav'} onClick={()=>children && setProductsOpen(!productsOpen)}>
          <Icon/><span>{label}</span>{children && (productsOpen ? <ChevronUp className="navArrow"/> : <ChevronDown className="navArrow"/>)}
        </button>
        {children && productsOpen && <div className="sub">{children.map(([child,ChildIcon])=><button key={child}><ChildIcon size={15}/><span>{child}</span></button>)}</div>}
      </div>)}
    </aside>

    <main className="content">
      <div className="title"><div><h1>نظرة عامة <TrendingUp/></h1><p>الإعدادات <ChevronLeft/> نظرة عامة</p></div></div>
      <section className="grid four">
        <Stat title="مبيعات اليوم" value="12,450.00" note="↗ +18% عن أمس" kind="green" Icon={ShoppingCart}/>
        <Stat title="ربح اليوم" value="3,250.00" note="↗ +15% عن أمس" kind="purple" Icon={TrendingUp}/>
        <Stat title="عدد عمليات البيع" value="42" unit="عملية" note="↗ +8 عن أمس" kind="blue" Icon={ShoppingCart}/>
        <Stat title="قيمة المخزون" value="245,680.00" note="إجمالي قيمة السلع" kind="orange" Icon={Boxes}/>
      </section>
      <section className="grid three second">
        <Stat title="متوسط قيمة البيع" value="296.43" note="لكل عملية بيع" kind="blue" Icon={ReceiptText}/>
        <Stat title="المبلغ الموجود في الصندوق" value="5,320.00" note="⟳ آخر تحديث: الآن" kind="teal" Icon={WalletCards}/>
        <article className="stat warning"><div className="statIcon"><AlertTriangle/></div><div className="statTitle">سلع منخفضة المخزون</div><div className="statValue">7</div><div className="statUnit">سلع</div><button className="link">عرض السلع <ChevronLeft size={15}/></button></article>
      </section>
      <section className="mainGrid"><Operations/><Chart/></section>
      <section className="bottom">
        <article className="notice stock"><div className="noticeIcon"><Bell/></div><div><h3>تنبيهات المخزون</h3><strong>7 سلع منخفضة المخزون</strong><p>يجب إعادة الطلب لتجنب نفاد المخزون</p></div><button>عرض السلع <ChevronLeft size={15}/></button></article>
        <article className="notice tip"><div className="noticeIcon"><BarChart3/></div><div><h3>نصيحة اليوم</h3><p>مبيعاتك اليوم أعلى من أمس بنسبة <strong>18%</strong><br/>استمر على هذا الأداء الرائع!</p></div><Info/></article>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
