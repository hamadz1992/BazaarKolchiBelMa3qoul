import React, { useMemo, useRef, useState, useEffect } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2, X, UserRound, Printer, Barcode, Clock, Banknote, ChevronDown, ArrowLeft, ArrowRight, Edit3, Package, Save } from "lucide-react";
import { loadProducts, saveProducts } from "./products-data.js";
import "./pos.css";

const SALES_KEY = "bazaar_sales";
const CUSTOMERS_KEY = "bazaar-kolchi-customers";
const money = n => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0 });
const esc = v => String(v ?? "").replace(/[&<>\"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
const loadSales = () => { try { const v = JSON.parse(localStorage.getItem(SALES_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const loadCustomers = () => { try { const v = JSON.parse(localStorage.getItem(CUSTOMERS_KEY) || "[]"); return Array.isArray(v) && v.length ? v : [{ id: 1, name: "زبون نقدي" }]; } catch { return [{ id: 1, name: "زبون نقدي" }]; } };

const normalizeBarcode = value => String(value ?? "")
  .replace(/[٠-٩]/g, ch => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
  .replace(/[۰-۹]/g, ch => String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
  .replace(/[&é"'(-è_çà]/g, ch => ({ "&": "1", "é": "2", "\"": "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0" }[ch] || ch))
  .replace(/\s+/g, "")
  .replace(/[^0-9]/g, "");

function buildInvoiceHtml(sale) {
  const items = (sale.items || []).map(i => `<tr><td>${esc(i.name || "سلعة")}</td><td>${i.quantity || 1}</td><td>${money(i.price)}</td><td>${money((i.price || 0) * (i.quantity || 1))}</td></tr>`).join("");
  const d = new Date(sale.createdAt);
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Tahoma,sans-serif}body{width:80mm;padding:4mm 3mm;font-size:10px}.receipt{width:100%;text-align:right}.top{text-align:center}.logo{width:38px;height:38px;margin:0 auto 5px;border-radius:8px;background:#6f2bd9;color:#fff;display:grid;place-items:center;font-size:22px;font-weight:900}.store{font-size:18px;font-weight:800}.pos{font-size:12px;font-weight:700;margin-top:2px}.address,.phone{font-size:9px;line-height:1.5;margin-top:4px}.dash{border-top:1px dashed #111;margin:8px 0}.meta{font-size:9px;line-height:1.65}.meta b{font-size:10px}.table{width:100%;border-collapse:collapse;font-size:9px}.table th,.table td{padding:3px 1px;text-align:right;vertical-align:top}.table th{border-bottom:1px solid #111}.table th:nth-child(n+2),.table td:nth-child(n+2){text-align:center}.totalLine{display:flex;justify-content:space-between;align-items:center;font-size:10px;margin:4px 0}.final{font-size:14px;font-weight:900}.thanks{text-align:center;font-size:10px;line-height:1.6;margin-top:8px}.heart{font-size:22px;color:#6f2bd9}.codes{display:grid;grid-template-columns:1fr 1.5fr;gap:10px;align-items:end;margin-top:9px}.codeBox{text-align:center;font-size:8px}.barcode{height:30px;margin-top:4px;background:repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 5px,#fff 5px 8px,#111 8px 11px,#fff 11px 13px);border:1px solid #111}.invoiceCode{font-size:9px;font-weight:700;margin-top:2px}.qr{width:50px;height:50px;margin:4px auto 0;border:4px solid #111;background:repeating-linear-gradient(45deg,#111 0 3px,#fff 3px 6px),repeating-linear-gradient(-45deg,transparent 0 4px,#111 4px 7px);position:relative}.qr:before,.qr:after{content:"";position:absolute;width:13px;height:13px;background:#fff;border:3px solid #111}.qr:before{top:-4px;left:-4px}.qr:after{bottom:-4px;right:-4px}@media print{body{width:80mm;padding:4mm 3mm}}</style></head><body><div class="receipt"><div class="top"><div class="logo">▰</div><div class="store">كل شيء بالمعقول</div><div class="pos">نقطة بيع</div><div class="address">طريق التكوين المهني - بالزڨم<br>حساني عبد الكريم - ولاية الوادي</div><div class="phone">☎ 07XX XXX XXX</div></div><div class="dash"></div><div class="meta"><div>رقم الفاتورة: <b>${esc(sale.invoice)}</b></div><div>التاريخ: ${d.toLocaleDateString("ar-DZ")} &nbsp;&nbsp; الوقت: ${d.toLocaleTimeString("ar-DZ",{hour:"2-digit",minute:"2-digit"})}</div><div>العميل: <b>${esc(sale.customer || "زبون نقدي")}</b></div></div><div class="dash"></div><table class="table"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table><div class="dash"></div><div class="totalLine final"><span>الإجمالي</span><b>${money(sale.total)} دج</b></div><div class="dash"></div><div class="thanks">شكراً لتسوقكم معنا<br>نتمنى لكم يوماً سعيداً<br><span class="heart">♡</span></div><div class="codes"><div class="codeBox">المزيد من العروض<div class="qr"></div></div><div class="codeBox">رمز الفاتورة<div class="barcode"></div><div class="invoiceCode">${esc(sale.invoice)}</div></div></div></div></body></html>`;
}

async function printInvoice(sale) {
  if (!window.desktopAPI?.printHtml) throw new Error("خدمة الطباعة في Desktop غير متاحة");
  let printer = localStorage.getItem("bazaar_default_printer") || "";
  if (!printer && window.desktopAPI?.getPrinters) {
    const list = await window.desktopAPI.getPrinters();
    printer = list?.find(p => p.isDefault)?.name || list?.[0]?.name || "";
  }
  if (!printer) throw new Error("لم يتم اختيار طابعة. اذهب إلى قسم الطباعة واختر الطابعة الافتراضية.");
  const result = await window.desktopAPI.printHtml({ html: buildInvoiceHtml(sale), deviceName: printer, copies: 1 });
  if (!result?.ok) throw new Error(result?.error || "تعذرت طباعة الفاتورة");
  return result;
}

const emptyBarcodeEdit = { name: "", barcode: "", category: "", unit: "قطعة", purchase: "", price: "", stock: "", min: "" };

export default function POSView() {
  const [products, setProducts] = useState(() => loadProducts());
  const [carts, setCarts] = useState(() => Array.from({ length: 5 }, () => []));
  const [activeCart, setActiveCart] = useState(0);
  const [cartMenuOpen, setCartMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [customers] = useState(loadCustomers);
  const [customer, setCustomer] = useState("زبون نقدي");
  const [lastSale, setLastSale] = useState(null);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const [printError, setPrintError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [barcodeEditMode, setBarcodeEditMode] = useState(false);
  const [barcodeEditForm, setBarcodeEditForm] = useState(emptyBarcodeEdit);
  const barcodeInputRef = useRef(null);
  const barcodeModalInputRef = useRef(null);
  const cart = carts[activeCart] || [];

  const setCart = updater => setCarts(cs => cs.map((c, i) => i === activeCart ? (typeof updater === "function" ? updater(c) : updater) : c));
  const filtered = useMemo(() => products.filter(p => `${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  useEffect(() => { setSelectedIndex(cart.length ? Math.min(selectedIndex, cart.length - 1) : -1); }, [activeCart, cart.length]);
  const focusBarcode = () => requestAnimationFrame(() => barcodeInputRef.current?.focus());

  const openBarcodeModal = () => {
    setBarcodeModalOpen(true);
    setBarcodeValue("");
    setBarcodeProduct(null);
    setBarcodeEditMode(false);
    setBarcodeEditForm(emptyBarcodeEdit);
    requestAnimationFrame(() => barcodeModalInputRef.current?.focus());
  };

  const closeBarcodeModal = () => {
    setBarcodeModalOpen(false);
    setBarcodeValue("");
    setBarcodeProduct(null);
    setBarcodeEditMode(false);
    setBarcodeEditForm(emptyBarcodeEdit);
    focusBarcode();
  };

  const lookupBarcode = value => {
    const code = normalizeBarcode(value);
    if (!code) { setBarcodeProduct(null); return null; }
    const found = products.find(p => normalizeBarcode(p.barcode) === code) || null;
    setBarcodeProduct(found);
    setBarcodeEditMode(false);
    if (!found) setMessage("المنتج غير موجود");
    else setMessage("");
    return found;
  };

  const handleBarcodeModalChange = e => {
    const value = e.target.value;
    setBarcodeValue(value);
    const code = normalizeBarcode(value);
    if (!code) { setBarcodeProduct(null); return; }
    const found = products.find(p => normalizeBarcode(p.barcode) === code) || null;
    if (found) {
      setBarcodeProduct(found);
      setBarcodeEditMode(false);
      setMessage("");
    }
  };

  const handleBarcodeModalKeyDown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode(barcodeValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeBarcodeModal();
    }
  };

  const openBarcodeEdit = () => {
    if (!barcodeProduct) return;
    setBarcodeEditForm({
      name: barcodeProduct.name ?? "",
      barcode: barcodeProduct.barcode ?? "",
      category: barcodeProduct.category ?? "",
      unit: barcodeProduct.unit ?? "قطعة",
      purchase: barcodeProduct.purchase ?? "",
      price: barcodeProduct.price ?? "",
      stock: barcodeProduct.stock ?? "",
      min: barcodeProduct.min ?? ""
    });
    setBarcodeEditMode(true);
  };

  const saveBarcodeEdit = e => {
    e.preventDefault();
    if (!barcodeProduct || !String(barcodeEditForm.name).trim() || !barcodeEditForm.price) return;
    const normalized = {
      ...barcodeEditForm,
      purchase: Number(barcodeEditForm.purchase) || 0,
      price: Number(barcodeEditForm.price) || 0,
      stock: Number(barcodeEditForm.stock) || 0,
      min: Number(barcodeEditForm.min) || 0
    };
    const nextProducts = products.map(p => p.id === barcodeProduct.id ? { ...p, ...normalized } : p);
    saveProducts(nextProducts);
    setProducts(nextProducts);
    const updated = nextProducts.find(p => p.id === barcodeProduct.id);
    setBarcodeProduct(updated || null);
    setBarcodeValue(updated?.barcode || barcodeValue);
    setBarcodeEditMode(false);
    setMessage("تم تعديل السلعة بنجاح");
  };

  const add = p => {
    if (Number(p.stock) <= 0) { setMessage("المنتج غير متوفر في المخزون"); setQuery(""); focusBarcode(); return false; }
    setMessage("");
    setCart(c => {
      const f = c.find(i => i.id === p.id);
      if (f) {
        if (f.quantity >= Number(p.stock)) { setMessage("لا توجد كمية إضافية متوفرة من هذا المنتج"); return c; }
        return c.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...c, { id: p.id, name: p.name, barcode: p.barcode, price: p.price, quantity: 1, max: Number(p.stock) }];
    });
    setQuery("");
    setSelectedIndex(c => { const idx = cart.findIndex(i => i.id === p.id); return idx >= 0 ? idx : cart.length; });
    focusBarcode();
    return true;
  };

  const changeQty = (id, d) => setCart(c => c.map(i => i.id === id ? { ...i, quantity: Math.max(1, Math.min(i.max, i.quantity + d)) } : i));
  const remove = id => setCart(c => c.filter(i => i.id !== id));

  const switchCart = index => {
    if (index < 0 || index >= carts.length) return;
    setActiveCart(index);
    setSelectedIndex(-1);
    setCartMenuOpen(false);
    focusBarcode();
  };

  const startNewCart = () => {
    const idx = carts.findIndex((c, i) => i !== activeCart && c.length === 0);
    if (idx >= 0) switchCart(idx);
    else setMessage("جميع السلات الخمس مستخدمة");
  };

  const handleBarcodeChange = e => setQuery(e.target.value);

  const handleBarcodeKeyDown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = normalizeBarcode(query);
      if (!code) return;
      const exact = products.find(p => normalizeBarcode(p.barcode) === code);
      if (exact) { add(exact); return; }
      const first = filtered[0];
      if (first) { add(first); return; }
      setMessage("المنتج غير موجود"); setQuery(""); focusBarcode();
    }
  };

  useEffect(() => {
    const onKey = e => {
      if (barcodeModalOpen) return;
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
      if (e.key === "ArrowLeft") { e.preventDefault(); switchCart(activeCart >= carts.length - 1 ? 0 : activeCart + 1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); switchCart(activeCart <= 0 ? carts.length - 1 : activeCart - 1); return; }
      if (e.key === "Delete") {
        if (selectedIndex < 0 || !cart.length) return;
        e.preventDefault();
        remove(cart[selectedIndex].id);
        setSelectedIndex(i => Math.max(-1, Math.min(i, cart.length - 2)));
        return;
      }
      if (isInput && e.target !== barcodeInputRef.current) return;
      if (e.key === "ArrowDown" && cart.length) { e.preventDefault(); setSelectedIndex(i => Math.min(cart.length - 1, i < 0 ? 0 : i + 1)); }
      else if (e.key === "ArrowUp" && cart.length) { e.preventDefault(); setSelectedIndex(i => Math.max(0, i < 0 ? cart.length - 1 : i - 1)); }
      else if (e.key === "Escape") { focusBarcode(); setCartMenuOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart, carts.length, activeCart, selectedIndex, barcodeModalOpen]);

  const complete = () => {
    if (!cart.length) return;
    const nextProducts = products.map(p => {
      const item = cart.find(i => i.id === p.id);
      return item ? { ...p, stock: Math.max(0, Number(p.stock) - item.quantity) } : p;
    });
    const sales = loadSales();
    const sale = {
      id: Date.now(),
      invoice: `INV-${String(sales.length + 1).padStart(5, "0")}`,
      createdAt: new Date().toISOString(),
      customer,
      paymentMethod: "نقدي",
      subtotal: total,
      discount: 0,
      total,
      paid: total,
      change: 0,
      items: cart.map(i => ({ id: i.id, name: i.name, barcode: i.barcode, price: i.price, quantity: i.quantity })),
      status: "مكتملة"
    };
    saveProducts(nextProducts);
    setProducts(nextProducts);
    localStorage.setItem(SALES_KEY, JSON.stringify([sale, ...sales]));
    setCart([]);
    setCustomer("زبون نقدي");
    setMessage(`تم تسجيل البيع بنجاح — ${sale.invoice}`);
    setPrintError("");
    setLastSale(sale);
    setSelectedIndex(-1);
  };

  const handlePrint = async () => {
    if (!lastSale || printingInvoice) return;
    setPrintingInvoice(true); setPrintError("");
    try { await printInvoice(lastSale); } catch (e) { setPrintError(e?.message || "تعذرت طباعة الفاتورة"); }
    finally { setPrintingInvoice(false); }
  };

  const activeCartLabel = activeCart === 0 ? "السلة الحالية" : `سلة ${activeCart + 1}`;

  return <div className="posView" dir="rtl">
    <div className="posSummary">
      <div className="summaryBox summaryQty"><div className="summaryIcon"><Banknote /></div><div><span>إجمالي الكمية</span><strong>{totalQty}</strong><small>قطعة</small></div></div>
      <div className="summaryTotal"><span>المجموع الكلي</span><strong>{money(total)} <small>دج</small></strong></div>
      <div className="summaryBox summaryProducts"><div className="summaryIcon"><ShoppingCart /></div><div><span>عدد المنتجات</span><strong>{cart.length}</strong><small>منتجات</small></div></div>
    </div>

    <div className="cartTabs">
      <div className="cartSelector">
        <button className="cartSelectorButton" onClick={() => setCartMenuOpen(v => !v)}><ShoppingCart size={24} /><div className="cartSelectorText"><small>نقطة البيع</small><b>{activeCartLabel}</b></div><span>{totalQty}</span><ChevronDown className={cartMenuOpen ? "rotated" : ""} /></button>
        {cartMenuOpen && <div className="cartMenu">
          <div className="cartMenuHeader"><strong>السلات المفتوحة</strong><small>اختر السلة التي تريد العمل عليها</small></div>
          {carts.map((c, i) => <button key={i} className={i === activeCart ? "cartMenuItem active" : "cartMenuItem"} onClick={() => switchCart(i)}><span className="cartMenuIcon"><ShoppingCart size={17} /></span><span className="cartMenuName">{i === 0 ? "السلة الحالية" : `سلة ${i + 1}`}</span><small>{c.length ? `${c.length} منتجات` : "فارغة"}</small><b>{c.reduce((s, x) => s + x.quantity, 0)}</b></button>)}
        </div>}
      </div>
      <button className="newCartTab" onClick={startNewCart}><Plus /> سلة جديدة</button>
    </div>

    <div className="posMain">
      <section className="posLeft">
        <div className="searchRow"><button className="barcodeBtn" onClick={openBarcodeModal}><Barcode size={27} /> باركود</button><div className="posSearch"><input ref={barcodeInputRef} autoFocus value={query} onChange={handleBarcodeChange} onKeyDown={handleBarcodeKeyDown} placeholder="إبحث باسم السلعة أو الكود أو الباركود" /><Search size={25} /></div></div>
        <div className="productResults">{filtered.map(p => <button className="posProduct" key={p.id} onClick={() => add(p)} disabled={Number(p.stock) <= 0}><strong>{p.name}</strong><small>{p.barcode}</small><span>{money(p.price)} دج</span><em>{p.stock > 0 ? `متوفر: ${p.stock}` : "نافد"}</em></button>)}</div>
        <div className="cartTable">
          <div className="cartTableHead"><span>#</span><span>السلعة</span><span>السعر</span><span>الكمية</span><span>الإجمالي</span><span>إجراءات</span></div>
          {cart.length ? cart.map((i, index) => <div className={index === selectedIndex ? "cartRow selected" : "cartRow"} key={i.id} onClick={() => setSelectedIndex(index)}><span>{index + 1}</span><div className="cartProduct"><strong>{i.name}</strong><small>{i.barcode}</small></div><span>{money(i.price)} دج</span><div className="qtyControls"><button onClick={e => { e.stopPropagation(); changeQty(i.id, -1); }}><Minus /></button><b>{i.quantity}</b><button onClick={e => { e.stopPropagation(); changeQty(i.id, 1); }}><Plus /></button></div><strong>{money(i.price * i.quantity)} دج</strong><button className="deleteRow" onClick={e => { e.stopPropagation(); remove(i.id); setSelectedIndex(-1); }}><Trash2 /></button></div>) : <div className="cartEmpty"><ShoppingCart size={42} /><span>السلة فارغة</span><small>امسح باركود المنتج أو اختر سلعة لإضافتها</small></div>}
          <div className="cartTotals"><div><span>إجمالي المنتجات</span><b>{cart.length}</b></div><div><span>إجمالي الكمية</span><b>{totalQty}</b></div></div>
        </div>
      </section>

      <aside className="paymentPanel">
        <div className="paymentTitle"><h2>تفاصيل البيع</h2><Banknote /></div>
        <div className="payLine"><span>المجموع الكلي</span><strong>{money(total)} دج</strong></div>
        <label className="customerField"><UserRound size={16} /><span>العميل</span><select value={customer} onChange={e => setCustomer(e.target.value)}>{customers.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}</select><ChevronDown size={16} /></label>
        <button className="completeBtn" onClick={complete} disabled={!cart.length}><CheckCircle2 size={22} /> إتمام البيع</button>
        {message && <div className="posMessage">{message}</div>}
      </aside>
    </div>

    <div className="posFooterActions"><button className="clearBtn" onClick={() => { setCart([]); setSelectedIndex(-1); }}><Trash2 /> إفراغ السلة</button><button className="printBtn" onClick={() => lastSale && handlePrint()} disabled={!lastSale || printingInvoice}><Printer /> {printingInvoice ? "جاري الطباعة..." : "طباعة الوصل"}</button><button className="holdBtn" onClick={() => setMessage("تم حفظ السلة مؤقتًا")}><Clock /> حفظ مؤقت</button><button className="newSaleBtn2" onClick={startNewCart}><ShoppingCart /> سلة أخرى</button></div>
    <div className="keyboardHint"><ArrowLeft /><ArrowRight /><span>للتنقل بين السلال</span><span className="hintArrows">↑ ↓</span><span>للتنقل بين عناصر السلة</span><b>Delete</b><span>لحذف العنصر</span><span>Esc</span><span>للعودة إلى الباركود</span></div>

    {barcodeModalOpen && <div className="barcodeOverlay" role="dialog" aria-modal="true" aria-labelledby="barcodeDialogTitle" onMouseDown={e => { if (e.target === e.currentTarget) closeBarcodeModal(); }}>
      <div className="barcodeModal">
        <button className="barcodeModalClose" onClick={closeBarcodeModal} aria-label="إغلاق"><X size={23} /></button>
        <div className="barcodeModalHeader"><span className="barcodeModalIcon"><Barcode size={28} /></span><div><h2 id="barcodeDialogTitle">البحث بالباركود</h2><p>أدخل أو امسح رمز السلعة بالماسح</p></div></div>
        <div className="barcodeModalSearch"><Barcode size={22} /><input ref={barcodeModalInputRef} value={barcodeValue} onChange={handleBarcodeModalChange} onKeyDown={handleBarcodeModalKeyDown} placeholder="امسح الباركود هنا..." autoComplete="off" inputMode="numeric" /></div>
        {!barcodeProduct && <div className="barcodeModalHint"><Package size={38} /><strong>بانتظار قراءة الباركود</strong><span>بعد القراءة ستظهر بيانات السلعة هنا</span></div>}
        {barcodeProduct && !barcodeEditMode && <div className="barcodeProductCard">
          <div className="barcodeProductIcon"><Package size={34} /></div>
          <div className="barcodeProductInfo"><h3>{barcodeProduct.name}</h3><span>الباركود: {barcodeProduct.barcode}</span><div className="barcodeProductMeta"><b>{money(barcodeProduct.price)} دج</b><span>المخزون: {barcodeProduct.stock}</span><span>{barcodeProduct.category || "بدون تصنيف"}</span></div></div>
          <button className="barcodeEditBtn" onClick={openBarcodeEdit}><Edit3 size={18} /> تعديل السلعة</button>
        </div>}
        {barcodeProduct && barcodeEditMode && <form className="barcodeEditForm" onSubmit={saveBarcodeEdit}>
          <div className="barcodeEditTitle"><Edit3 size={20} /><strong>تعديل السلعة</strong></div>
          <div className="barcodeEditGrid">
            <label>اسم السلعة<input required value={barcodeEditForm.name} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, name: e.target.value })} /></label>
            <label>الباركود<input value={barcodeEditForm.barcode} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, barcode: e.target.value })} /></label>
            <label>التصنيف<input value={barcodeEditForm.category} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, category: e.target.value })} /></label>
            <label>الوحدة<input value={barcodeEditForm.unit} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, unit: e.target.value })} /></label>
            <label>سعر الشراء<input type="number" min="0" value={barcodeEditForm.purchase} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, purchase: e.target.value })} /></label>
            <label>سعر البيع<input required type="number" min="0" value={barcodeEditForm.price} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, price: e.target.value })} /></label>
            <label>الكمية الحالية<input type="number" min="0" value={barcodeEditForm.stock} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, stock: e.target.value })} /></label>
            <label>الحد الأدنى<input type="number" min="0" value={barcodeEditForm.min} onChange={e => setBarcodeEditForm({ ...barcodeEditForm, min: e.target.value })} /></label>
          </div>
          <div className="barcodeEditActions"><button type="button" className="barcodeCancelEdit" onClick={() => setBarcodeEditMode(false)}>إلغاء</button><button type="submit" className="barcodeSaveEdit"><Save size={18} /> حفظ التعديل</button></div>
        </form>}
      </div>
    </div>}

    {lastSale && <div className="invoiceOverlay" dir="rtl"><div className="invoiceModal invoiceBasic"><button className="invoiceClose" onClick={() => setLastSale(null)} aria-label="إغلاق"><X size={26} /></button><div className="invoiceSuccess"><span className="successIcon"><CheckCircle2 size={30} /></span><h2>تمت عملية البيع بنجاح</h2></div><div className="invoiceNumber">رقم الفاتورة: <b>{lastSale.invoice}</b></div><div className="basicSale"><div><span>العميل</span><b>{lastSale.customer || "زبون نقدي"}</b></div><div><span>الإجمالي</span><strong>{money(lastSale.total)} دج</strong></div></div><p className="printHint">اضغط «طباعة الفاتورة» لإخراج الوصل بالتفاصيل الكاملة.</p>{printError && <div className="posMessage" style={{ color: "#d7194b" }}>{printError}</div>}<div className="invoiceActions"><button className="newSaleBtn" onClick={() => setLastSale(null)}>عملية جديدة ↻</button><button className="printInvoiceBtn" onClick={handlePrint} disabled={printingInvoice}>{printingInvoice ? <><Printer size={19} /> جاري الطباعة...</> : <><Printer size={19} /> طباعة الفاتورة</>}</button></div></div></div>}
  </div>;
}
