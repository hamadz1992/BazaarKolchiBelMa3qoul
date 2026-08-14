import React, { useMemo, useState } from "react";
import { Boxes, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import "./products.css";

const BARCODE_PREFIX = "622100000";
const initialProducts = [
  { id: 1, name: "حجاب نسائي", barcode: "622100000001", category: "ملابس نسائية", unit: "قطعة", purchase: 250, price: 400, stock: 18, min: 5 },
  { id: 2, name: "فندروب", barcode: "622100000002", category: "ملابس نسائية", unit: "قطعة", purchase: 700, price: 950, stock: 9, min: 4 },
  { id: 3, name: "علبة تخزين", barcode: "622100000003", category: "أواني منزلية", unit: "قطعة", purchase: 180, price: 300, stock: 3, min: 5 },
  { id: 4, name: "مناديل مبللة", barcode: "622100000004", category: "تنظيف", unit: "علبة", purchase: 90, price: 140, stock: 24, min: 6 }
];
const emptyProduct = { name: "", barcode: "", category: "", unit: "قطعة", purchase: "", price: "", stock: "", min: "" };

function getNextBarcode(products) {
  const numbers = products
    .map(p => String(p.barcode || "").match(/^(?:622100000)(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = Math.max(0, ...numbers) + 1;
  return `${BARCODE_PREFIX}${String(next).padStart(3, "0")}`;
}

export default function ProductsView({ autoOpen = false }) {
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(autoOpen ? "add" : null);
  const [form, setForm] = useState(autoOpen ? { ...emptyProduct, barcode: getNextBarcode(initialProducts) } : emptyProduct);
  const filtered = useMemo(() => products.filter(p => `${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase())), [products, query]);

  const openAdd = () => { setForm({ ...emptyProduct, barcode: getNextBarcode(products) }); setModal("add"); };
  const openEdit = (product) => { setForm({ ...product }); setModal(product.id); };
  const save = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    const normalized = { ...form, purchase: Number(form.purchase) || 0, price: Number(form.price) || 0, stock: Number(form.stock) || 0, min: Number(form.min) || 0 };
    if (modal === "add") setProducts(prev => [...prev, { ...normalized, id: Date.now() }]);
    else setProducts(prev => prev.map(p => p.id === modal ? { ...p, ...normalized } : p));
    setModal(null);
  };
  const remove = (id) => { if (window.confirm("هل تريد حذف هذه السلعة؟")) setProducts(prev => prev.filter(p => p.id !== id)); };

  return <div className="productsView" dir="rtl">
    <div className="productsHeader"><div><h1>قائمة السلع</h1><p>إدارة السلع والأسعار والمخزون</p></div><button className="primaryAction" onClick={openAdd}><Plus size={18}/> إضافة سلعة</button></div>
    <div className="productsToolbar"><div className="searchBox"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div><div className="productsCount">{filtered.length} سلع</div></div>
    <section className="productsPanel"><div className="productsTableWrap"><table className="productsTable"><thead><tr><th>السلعة</th><th>الباركود</th><th>التصنيف</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>المخزون</th><th>إجراءات</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td><div className="productName"><span className="productIcon"><Boxes size={18}/></span><strong>{p.name}</strong></div></td><td>{p.barcode}</td><td>{p.category || "—"}</td><td>{p.unit}</td><td>{p.purchase.toFixed(2)} دج</td><td className="salePrice">{p.price.toFixed(2)} دج</td><td><span className={p.stock <= p.min ? "stockLow" : "stockOk"}>{p.stock}</span></td><td><div className="rowActions"><button onClick={() => openEdit(p)} title="تعديل"><Edit3 size={16}/></button><button onClick={() => remove(p.id)} title="حذف"><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="emptyProducts">لا توجد سلع مطابقة للبحث.</div>}</div></section>
    {modal && <div className="modalBackdrop" onMouseDown={() => setModal(null)}><form className="productModal" onSubmit={save} onMouseDown={e => e.stopPropagation()}><div className="modalHead"><h2>{modal === "add" ? "إضافة سلعة" : "تعديل السلعة"}</h2><button type="button" onClick={() => setModal(null)}><X size={20}/></button></div><div className="formGrid">{[["name","اسم السلعة","text"],["barcode","الباركود","text"],["category","التصنيف","text"],["unit","الوحدة","text"],["purchase","سعر الشراء","number"],["price","سعر البيع","number"],["stock","الكمية الحالية","number"],["min","الحد الأدنى للمخزون","number"]].map(([key,label,type]) => <label key={key}>{label}<input required={key === "name" || key === "price"} type={type} value={form[key] ?? ""} readOnly={key === "barcode" && modal === "add"} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}</div><div className="modalActions"><button type="button" className="cancelBtn" onClick={() => setModal(null)}>إلغاء</button><button className="primaryAction" type="submit">حفظ السلعة</button></div></form></div>}
  </div>;
}
