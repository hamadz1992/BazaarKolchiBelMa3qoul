import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, ClipboardList, History, Search, Warehouse } from "lucide-react";
import { api, apiEnabled } from "./api-client.js";
import Pagination from "./Pagination.jsx";
import {subscribeDataChanged,affectsDomains,DATA_DOMAINS} from "./data-events.js";
import "./inventory.css";

const inventoryErrorMessage = (err) => {
  const message = String(err?.message || "");
  if (/products_barcode_key|duplicate key value.*barcode|duplicate.*barcode/i.test(message)) {
    return "الباركود موجود مسبقًا. يرجى إدخال باركود مختلف.";
  }
  if (/timeout|timed out|انتهت مهلة/i.test(message)) return "انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.";
  if (/ECONNREFUSED|Failed to fetch|NetworkError|تعذر الاتصال/i.test(message)) return "تعذر الاتصال بالخادم. تأكد من تشغيل البرنامج ثم حاول مرة أخرى.";
  if (/unique constraint|duplicate key value/i.test(message)) return "هذه البيانات موجودة مسبقًا ولا يمكن تكرارها.";
  if (/foreign key|violates foreign key/i.test(message)) return "لا يمكن تنفيذ العملية لأن البيانات المرتبطة غير صحيحة.";
  return message && !/^HTTP \d+$/i.test(message) ? message : "تعذر تحميل بيانات المخزون.";
};

export default function InventoryView() {
  const [products, setProducts] = useState([]);
  const remote = apiEnabled();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const refreshProducts = async () => {
    if (!remote) return;
    try {
      const rows = await api('/products');
      setLoadError("");
      setReady(true);
      setProducts((Array.isArray(rows)?rows:[]).map(p => ({id:p.id,name:p.name,barcode:p.barcode||"",category:p.category||"",unit:p.unit||"",purchase:Number(p.purchase_price||0),stock:Number(p.current_stock||0),min:Number(p.minimum_stock||0)})));
    } catch (err) { setReady(true); setLoadError(inventoryErrorMessage(err)); }
  };

  useEffect(() => {
    setReady(false);
    refreshProducts();
    if (!remote) { setReady(true); setLoadError("يتطلب هذا القسم اتصال PostgreSQL/API."); return; }
    const onInventoryUpdated = () => refreshProducts();
    const onWindowMessage = (event) => {
      if (event?.origin === window.location.origin && event?.data?.type === 'bazaar-inventory-updated') onInventoryUpdated();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refreshProducts(); };
    window.addEventListener('bazaar:inventory-updated', onInventoryUpdated);
    window.addEventListener('storage', onInventoryUpdated);
    window.addEventListener('message', onWindowMessage);
    document.addEventListener('visibilitychange', onVisible);
    const removeDesktopListener = window.desktopAPI?.onInventoryUpdated?.(onInventoryUpdated) || (() => {});
    const removeUnified = subscribeDataChanged((event)=>{ if(affectsDomains(event,[DATA_DOMAINS.SALES,DATA_DOMAINS.INVENTORY,DATA_DOMAINS.PRODUCTS])) onInventoryUpdated(); });
    let channel = null;
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('bazaar-inventory-updates');
        channel.onmessage = onInventoryUpdated;
      }
    } catch {}
    return () => {
      window.removeEventListener('bazaar:inventory-updated', onInventoryUpdated);
      window.removeEventListener('storage', onInventoryUpdated);
      window.removeEventListener('message', onWindowMessage);
      document.removeEventListener('visibilitychange', onVisible);
      removeDesktopListener();
      removeUnified?.();
      try { channel?.close(); } catch {}
    };
  }, [remote]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => products.filter(p => {
    const matches = `${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase());
    const status = p.stock === 0 ? "out" : p.stock <= p.min ? "low" : "ok";
    return matches && (filter === "all" || filter === status);
  }), [products, query, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, filter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const totalValue = products.reduce((sum, p) => sum + p.stock * p.purchase, 0);
  const low = products.filter(p => p.stock > 0 && p.stock <= p.min).length;
  const out = products.filter(p => p.stock === 0).length;
  const available = products.filter(p => p.stock > 0).length;

  return <div className="inventoryView" dir="rtl">
    <div className="inventoryHeader">
      <div><h1><Warehouse size={28}/> المخزون</h1><p>متابعة الكميات وقيمة المخزون وحالة السلع</p></div>
    </div>

    <section className="inventoryStats">
      <article className="inventoryStat total"><div className="inventoryStatIcon"><Boxes/></div><span>قيمة المخزون</span><strong>{totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, useGrouping: false })}</strong><small>دج بسعر الشراء</small></article>
      <article className="inventoryStat"><div className="inventoryStatIcon"><Boxes/></div><span>إجمالي السلع</span><strong>{products.length}</strong><small>سلعة</small></article>
      <article className="inventoryStat good"><div className="inventoryStatIcon">✓</div><span>سلع متوفرة</span><strong>{available}</strong><small>سلعة</small></article>
      <article className="inventoryStat warning"><div className="inventoryStatIcon"><AlertTriangle/></div><span>منخفضة المخزون</span><strong>{low}</strong><small>سلعة</small></article>
      <article className="inventoryStat danger"><div className="inventoryStatIcon">!</div><span>نافدة</span><strong>{out}</strong><small>سلعة</small></article>
    </section>

    <div className="inventoryMovementsBar">
      <button className="inventoryMovementsAction" onClick={()=>window.dispatchEvent(new CustomEvent("app:navigate",{detail:{key:"inventory-movements"}}))}>
        <ClipboardList size={17}/> حركات المخزون
      </button>
      <button className="inventoryMovementsAction inventoryHistoryAction" onClick={()=>window.dispatchEvent(new CustomEvent("app:navigate",{detail:{key:"inventory-history"}}))}>
        <History size={17}/> سجل الحركات
      </button>
    </div>

    <section className="inventoryPanel">
      {loadError && <div className="inventoryLoadError" role="alert">{loadError}<button onClick={refreshProducts}>إعادة المحاولة</button></div>}
      <div className="inventoryToolbar"><div className="inventorySearch"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div><div className="inventoryFilters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>الكل</button><button className={filter === "ok" ? "active" : ""} onClick={() => setFilter("ok")}>متوفر</button><button className={filter === "low" ? "active" : ""} onClick={() => setFilter("low")}>منخفض</button><button className={filter === "out" ? "active" : ""} onClick={() => setFilter("out")}>نافد</button></div></div>
      <div className="inventoryTableWrap"><table className="inventoryTable"><thead><tr><th>السلعة</th><th>الباركود</th><th>التصنيف</th><th>الكمية الحالية</th><th>الحد الأدنى</th><th>سعر الشراء</th><th>قيمة المخزون</th><th>الحالة</th></tr></thead><tbody>{!ready ? <tr><td colSpan="8" style={{textAlign:"center",padding:"36px"}}>جاري تحميل المخزون...</td></tr> : pageRows.map(p => { const status = p.stock === 0 ? "out" : p.stock <= p.min ? "low" : "ok"; return <tr key={p.id}><td><div className="inventoryProduct"><span><Boxes size={17}/></span><strong>{p.name}</strong></div></td><td>{p.barcode}</td><td>{p.category || "—"}</td><td><b className={status === "out" ? "qtyDanger" : status === "low" ? "qtyWarning" : "qtyGood"}>{p.stock} {p.unit}</b></td><td>{p.min}</td><td>{p.purchase.toFixed(2)} دج</td><td className="inventoryValue">{(p.stock * p.purchase).toFixed(2)} دج</td><td><span className={`inventoryStatus ${status}`}>{status === "ok" ? "متوفر" : status === "low" ? "منخفض" : "نافد"}</span></td></tr>})}</tbody></table>{!filtered.length && <div className="inventoryEmpty">لا توجد سلع مطابقة للبحث أو الفلتر.</div>}{filtered.length>0&&<Pagination page={page} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} pageSize={pageSize}/>}</div>
    </section>
  </div>;
}
