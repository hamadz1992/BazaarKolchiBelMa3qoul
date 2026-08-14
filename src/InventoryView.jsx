import React, { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Search, Warehouse } from "lucide-react";
import { loadProducts } from "./products-data.js";
import "./inventory.css";

export default function InventoryView() {
  const [products] = useState(() => loadProducts());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => products.filter(p => {
    const matches = `${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase());
    const status = p.stock === 0 ? "out" : p.stock <= p.min ? "low" : "ok";
    return matches && (filter === "all" || filter === status);
  }), [products, query, filter]);

  const totalValue = products.reduce((sum, p) => sum + p.stock * p.purchase, 0);
  const low = products.filter(p => p.stock > 0 && p.stock <= p.min).length;
  const out = products.filter(p => p.stock === 0).length;
  const available = products.filter(p => p.stock > 0).length;

  return <div className="inventoryView" dir="rtl">
    <div className="inventoryHeader">
      <div><h1><Warehouse size={28}/> المخزون</h1><p>متابعة الكميات وقيمة المخزون وحالة السلع</p></div>
    </div>

    <section className="inventoryStats">
      <article className="inventoryStat total"><div className="inventoryStatIcon"><Boxes/></div><span>قيمة المخزون</span><strong>{totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong><small>دج بسعر الشراء</small></article>
      <article className="inventoryStat"><div className="inventoryStatIcon"><Boxes/></div><span>إجمالي السلع</span><strong>{products.length}</strong><small>سلعة</small></article>
      <article className="inventoryStat good"><div className="inventoryStatIcon">✓</div><span>سلع متوفرة</span><strong>{available}</strong><small>سلعة</small></article>
      <article className="inventoryStat warning"><div className="inventoryStatIcon"><AlertTriangle/></div><span>منخفضة المخزون</span><strong>{low}</strong><small>سلعة</small></article>
      <article className="inventoryStat danger"><div className="inventoryStatIcon">!</div><span>نافدة</span><strong>{out}</strong><small>سلعة</small></article>
    </section>

    <section className="inventoryPanel">
      <div className="inventoryToolbar"><div className="inventorySearch"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div><div className="inventoryFilters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>الكل</button><button className={filter === "ok" ? "active" : ""} onClick={() => setFilter("ok")}>متوفر</button><button className={filter === "low" ? "active" : ""} onClick={() => setFilter("low")}>منخفض</button><button className={filter === "out" ? "active" : ""} onClick={() => setFilter("out")}>نافد</button></div></div>
      <div className="inventoryTableWrap"><table className="inventoryTable"><thead><tr><th>السلعة</th><th>الباركود</th><th>التصنيف</th><th>الكمية الحالية</th><th>الحد الأدنى</th><th>سعر الشراء</th><th>قيمة المخزون</th><th>الحالة</th></tr></thead><tbody>{filtered.map(p => { const status = p.stock === 0 ? "out" : p.stock <= p.min ? "low" : "ok"; return <tr key={p.id}><td><div className="inventoryProduct"><span><Boxes size={17}/></span><strong>{p.name}</strong></div></td><td>{p.barcode}</td><td>{p.category || "—"}</td><td><b className={status === "out" ? "qtyDanger" : status === "low" ? "qtyWarning" : "qtyGood"}>{p.stock} {p.unit}</b></td><td>{p.min}</td><td>{p.purchase.toFixed(2)} دج</td><td className="inventoryValue">{(p.stock * p.purchase).toFixed(2)} دج</td><td><span className={`inventoryStatus ${status}`}>{status === "ok" ? "متوفر" : status === "low" ? "منخفض" : "نافد"}</span></td></tr>})}</tbody></table>{!filtered.length && <div className="inventoryEmpty">لا توجد سلع مطابقة للبحث أو الفلتر.</div>}</div>
    </section>
  </div>;
}
