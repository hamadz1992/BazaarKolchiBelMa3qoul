import React, { useEffect, useMemo, useState } from "react";
import { Boxes, Edit3, FileSpreadsheet, Plus, Ruler, ScanBarcode, Search, Tags, Trash2, X, Star } from "lucide-react";
import "./products.css";
import { api, apiEnabled } from "./api-client.js";
import Pagination from "./Pagination.jsx";

const emptyProduct = { name: "", barcode: "", category: "", unit: "قطعة", purchase: "", price: "", stock: "", min: "" };

// قارئات الباركود التي تعمل كلوحة مفاتيح قد ترسل صف الأرقام كرموز
// عند استعمال تخطيط لوحة AZERTY (مثل: &é"'( -è_çà). نحولها إلى أرقام.
const normalizeBarcodeInput = value => String(value ?? "")
  .replace(/[&é"'(-è_çà]/g, char => ({
    "&": "1", "é": "2", "\"": "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0",
  }[char] ?? char))
  .replace(/\D/g, "");

const productErrorMessage = (err, fallback = "تعذر تنفيذ العملية على السلعة") => {
  const message = String(err?.message || "");
  if (/products_barcode_key|duplicate key value.*barcode|duplicate.*barcode/i.test(message)) {
    return "الباركود موجود مسبقًا. يرجى إدخال باركود مختلف.";
  }
  if (/unique constraint|duplicate key value/i.test(message)) {
    return "هذه البيانات موجودة مسبقًا ولا يمكن تكرارها.";
  }
  if (/not-null|violates not-null/i.test(message)) return "يوجد حقل مطلوب لم يتم إدخاله.";
  if (/foreign key|violates foreign key/i.test(message)) return "لا يمكن تنفيذ العملية لأن البيانات المرتبطة غير صحيحة.";
  if (/timeout|timed out|انتهت مهلة/i.test(message)) return "انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.";
  return message && !/^HTTP \d+$/i.test(message) ? message : fallback;
};

export default function ProductsView({ autoOpen = false }) {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(autoOpen ? "add" : null);
  const [form, setForm] = useState(autoOpen ? { ...emptyProduct, barcode: "" } : emptyProduct);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [favorites, setFavorites] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const remote = apiEnabled();

  const refreshFavorites = async () => {
    if (!remote) { setProducts([]); return; }
    try {
      const rows = await api("/favorites");
      setFavorites((rows || []).map(x => String(x.id)));
    } catch {}
  };

  const refresh = async () => {
    if (!remote) return;
    setLoading(true);
    try {
      const rows = await api(`/products${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`);
      setProducts(rows.map(p => ({ id:p.id, name:p.name, barcode:p.barcode||"", category:p.category||"", categoryId:p.category_id, unit:p.unit||"", unitId:p.unit_id, purchase:Number(p.purchase_price||0), price:Number(p.sale_price||0), stock:Number(p.current_stock||0), min:Number(p.minimum_stock||0) })));
      await refreshFavorites();
    } catch {} finally { setLoading(false); }
  };
  useEffect(()=>{setPage(1); refresh();},[query, favoritesOnly]);
  const isFavorite = product => favorites.includes(String(product.id));
  const toggleFavorite = async product => {
    if (!remote) return;
    try {
      await api("/favorites/toggle", {
        method: "POST",
        body: JSON.stringify({ productId: product.id }),
      });
      await refreshFavorites();
    } catch {}
  };

  const filtered = useMemo(() => {
    const text = query.toLowerCase();
    const baseRows = products.filter(p => `${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(text));
    return favoritesOnly ? baseRows.filter(p => isFavorite(p)) : baseRows;
  }, [products, query, favorites, favoritesOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openAdd = () => { setForm({ ...emptyProduct, barcode: "" }); setModal("add"); };
  const openEdit = product => { setForm({ ...product }); setModal(product.id); };
  const save = async e => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    const payload = { name:form.name.trim(), barcode:form.barcode||null, purchasePrice:Number(form.purchase)||0, salePrice:Number(form.price)||0, stock:Number(form.stock)||0, minimumStock:Number(form.min)||0, active:true };
    try {
      if (modal === "add") await api("/products",{method:"POST",body:JSON.stringify(payload)});
      else await api(`/products/${encodeURIComponent(modal)}`,{method:"PUT",body:JSON.stringify(payload)});
      await refresh();
      setModal(null);
    } catch (err) { window.alert(productErrorMessage(err, "تعذر حفظ السلعة.")); }
  };
  const remove = async id => {
    if (!window.confirm("هل تريد حذف هذه السلعة؟")) return;
    try { await api(`/products/${encodeURIComponent(id)}`,{method:"DELETE"}); await refresh(); }
    catch(err){window.alert(productErrorMessage(err, "تعذر حذف السلعة."));}
  };

  return <div className="productsView" dir="rtl">
    <div className="productsHeader"><div><h1>قائمة السلع</h1><p>البيانات من PostgreSQL</p></div><div className="productsHeaderActions"><button className="quickAction" onClick={()=>window.dispatchEvent(new CustomEvent("app:navigate",{detail:{key:"categories"}}))}><Tags size={16}/> التصنيفات</button><button className="quickAction" onClick={()=>window.dispatchEvent(new CustomEvent("app:navigate",{detail:{key:"units"}}))}><Ruler size={16}/> الوحدات</button><button className="quickAction" onClick={()=>window.dispatchEvent(new CustomEvent("app:navigate",{detail:{key:"barcode"}}))}><ScanBarcode size={16}/> الباركود</button><button className="quickAction" onClick={()=>window.dispatchEvent(new CustomEvent("app:navigate",{detail:{key:"excel-import"}}))}><FileSpreadsheet size={16}/> Excel</button><button className="primaryAction" onClick={openAdd}><Plus size={18}/> إضافة سلعة</button></div></div>
    <div className="productsToolbar"><div className="searchBox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div><button
        type="button"
        className={favoritesOnly ? "favoritesFilter active" : "favoritesFilter"}
        onClick={() => setFavoritesOnly(v => !v)}
        disabled={!remote}
        title={remote ? "عرض السلع المفضلة فقط" : "المفضلة تتطلب الاتصال بقاعدة البيانات"}
      >
        <Star size={16} fill={favoritesOnly ? "currentColor" : "none"} /> المفضلة
      </button>
      <div className="productsCount">{loading?"جاري التحميل...":`${filtered.length} سلع`}</div></div>
    <section className="productsPanel"><div className="productsTableWrap"><table className="productsTable"><thead><tr><th>السلعة</th><th>الباركود</th><th>التصنيف</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>المخزون</th><th>إجراءات</th></tr></thead><tbody>{pageRows.map(p=><tr key={p.id}><td><div className="productName"><span className="productIcon"><Boxes size={18}/></span><strong>{p.name}</strong></div></td><td>{p.barcode||"—"}</td><td>{p.category||"—"}</td><td>{p.unit||"—"}</td><td>{Number(p.purchase||0).toFixed(2)} دج</td><td className="salePrice">{Number(p.price||0).toFixed(2)} دج</td><td><span className={Number(p.stock)<=Number(p.min)?"stockLow":"stockOk"}>{p.stock}</span></td><td>
          <div className="rowActions">
            <button
              className={isFavorite(p) ? "favoriteRow active" : "favoriteRow"}
              onClick={()=>toggleFavorite(p)}
              title={isFavorite(p) ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
              disabled={!remote}
            >
              <Star size={16} fill={isFavorite(p) ? "currentColor" : "none"} />
            </button>
            <button onClick={()=>openEdit(p)} title="تعديل"><Edit3 size={16}/></button>
            <button onClick={()=>remove(p.id)} title="حذف"><Trash2 size={16}/></button>
          </div>
        </td></tr>)}</tbody></table>{!filtered.length&&<div className="emptyProducts">لا توجد سلع مطابقة للبحث.</div>}{filtered.length>0&&<Pagination page={page} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} pageSize={pageSize}/>}</div></section>
    {modal&&<div className="modalBackdrop" onMouseDown={()=>setModal(null)}><form className="productModal" onSubmit={save} onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><h2>{modal==="add"?"إضافة سلعة":"تعديل السلعة"}</h2><button type="button" onClick={()=>setModal(null)}><X size={20}/></button></div><div className="formGrid">{[["name","اسم السلعة","text"],["barcode","الباركود","text"],["category","التصنيف","text"],["unit","الوحدة","text"],["purchase","سعر الشراء","number"],["price","سعر البيع","number"],["stock","الكمية الحالية","number"],["min","الحد الأدنى للمخزون","number"]].map(([key,label,type])=><label key={key}>{label}<input required={key==="name"||key==="price"} type={type} inputMode={key==="barcode" ? "numeric" : undefined} dir={key==="barcode" ? "ltr" : undefined} value={form[key]??""} onChange={e=>setForm({...form,[key]:key==="barcode" ? normalizeBarcodeInput(e.target.value) : e.target.value})}/></label>)}</div><div className="modalActions"><button type="button" className="cancelBtn" onClick={()=>setModal(null)}>إلغاء</button><button className="primaryAction" type="submit">حفظ السلعة</button></div></form></div>}
  </div>;
}
