import React, { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, AlertTriangle, Bell, Minus, Plus, Search, ShoppingCart, Trash2, X, UserRound, UserPlus, Printer, Barcode, Clock, Banknote, ChevronDown, ArrowLeft, ArrowRight, Edit3, Package, Save, Star, FileText, LogOut } from "lucide-react";
import { api, apiEnabled } from "./api-client.js";
import "./pos.css";
import "./pos-tuning.css";
import "./pos-extra.css";

import { money, normalizeBarcode, emptyBarcodeEdit, formatInvoiceNumber, normalizeInvoiceForDisplay } from "./pos/pos-utils.js";
import { useBarcodeFocus } from "./pos/hooks/useBarcodeFocus.js";
import BarcodeModal from "./pos/components/BarcodeModal.jsx";
import { printInvoice } from "./pos/pos-print.js";
import successSound from "./sounds/success.wav";
import errorSound from "./sounds/error.wav";
import warningSound from "./sounds/warning.wav";
import InvoiceReceiptPreview from "./pos/components/InvoiceReceiptPreview.jsx";

export default function POSView() {
  const remote = apiEnabled();
  const [products, setProducts] = useState([]);
  const [carts, setCarts] = useState(() => Array.from({ length: 5 }, () => []));
  const [activeCart, setActiveCart] = useState(0);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [notification, setNotification] = useState(null);
  const notificationTimerRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState("زبون");
  const [customerId, setCustomerId] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [directAmountValue, setDirectAmountValue] = useState("");
  const [quantityModalOpen, setQuantityModalOpen] = useState(false);
  const [directQuantityValue, setDirectQuantityValue] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [paidValue, setPaidValue] = useState(0);
  const paidEditedRef = useRef(false);
  const [customerDebts, setCustomerDebts] = useState([]);
  const [customerDebtLoading, setCustomerDebtLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [lastSale, setLastSale] = useState(null);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const [completingSale, setCompletingSale] = useState(false);
  const [todayInvoicesOpen, setTodayInvoicesOpen] = useState(false);
  const [todayInvoices, setTodayInvoices] = useState([]);
  const [pendingCancelInvoice, setPendingCancelInvoice] = useState(null);
  const [todayInvoiceSearch, setTodayInvoiceSearch] = useState("");
  const [todayInvoicesLoading, setTodayInvoicesLoading] = useState(false);
  const [todayInvoicePrintingId, setTodayInvoicePrintingId] = useState(null);
  const [todayInvoicePrintError, setTodayInvoicePrintError] = useState("");
  const [printError, setPrintError] = useState("");
  const [invoiceDetailsSale, setInvoiceDetailsSale] = useState(null);
  const [invoicePrintSettings, setInvoicePrintSettings] = useState({});
  const [invoiceStoreSettings, setInvoiceStoreSettings] = useState({});
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [barcodeEditMode, setBarcodeEditMode] = useState(false);
  const [barcodeEditForm, setBarcodeEditForm] = useState(emptyBarcodeEdit);
  const barcodeInputRef = useRef(null);
  const [liveClock, setLiveClock] = useState(new Date());
  const lastSoundAtRef = useRef(0);
  const barcodeModalInputRef = useRef(null);
  const cart = carts[activeCart] || [];

  const notify = (text, explicitType = null) => {
    const value = String(text || "").trim();
    if (!value) {
      setMessage("");
      setNotification(null);
      return;
    }
    let type = explicitType;
    if (!type) {
      if (/جاري|تحديث|تجهيز|تحميل|مزامن/.test(value)) type = "info";
      else if (/تم |✓|بنجاح|نجاح|استعادة/.test(value)) type = "success";
      else if (/غير موجود|غير متوفر|نافد|خطأ|تعذر|فشل|مطلوب|غير متصل|غير متاحة|غير متاحة|أكبر من المخزون|فارغة|لا توجد/.test(value)) type = "error";
      else if (/منخفض|تحذير|تنبيه|دين|تأكيد/.test(value)) type = "warning";
      else type = "info";
    }
    setMessage(value);
    setNotification({ text: value, type, id: Date.now() });
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    if (!/جاري|تحميل|تحديث|تجهيز|مزامن/.test(value)) {
      notificationTimerRef.current = setTimeout(() => setNotification(null), type === "error" ? 5500 : 3200);
    }
  };

  useEffect(() => () => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
  }, []);

  useEffect(() => {
    if (!remote) { notify('قاعدة البيانات PostgreSQL/API غير متصلة. البيانات التشغيلية لا تُحفظ محليًا.'); return; }
    let cancelled = false;
    Promise.all([api('/products'), api('/customers'), api('/favorites')]).then(([ps, cs, favs]) => {
      if (cancelled) return;
      setProducts(ps.map(p => ({ id:p.id, name:p.name, barcode:p.barcode||"", category:p.category||"", unit:p.unit||"", purchase:Number(p.purchase_price||0), price:Number(p.sale_price||0), stock:Number(p.current_stock||0), min:Number(p.minimum_stock||0) })));
      setCustomers(cs);
      setFavorites(favs.map(p => String(p.id)));
    }).catch(err => notify(err?.message || 'تعذر تحميل بيانات نقطة البيع'));
    return () => { cancelled = true; };
  }, [remote]);

  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const setCart = updater => setCarts(cs => cs.map((c, i) => i === activeCart ? (typeof updater === "function" ? updater(c) : updater) : c));
  const filtered = useMemo(() => {
    const raw = query.trim();
    if (!raw) return [];
    const q = raw.toLowerCase();
    // نطابق الأرقام بغض النظر عن رمز/لغة لوحة المفاتيح أو الجهاز (عربي، فارسي، AZERTY...)
    const qDigits = normalizeBarcode(raw);
    return products.filter(p => {
      if (`${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(q)) return true;
      if (qDigits) {
        const pDigits = normalizeBarcode(p.barcode);
        if (pDigits && pDigits.includes(qDigits)) return true;
      }
      return false;
    });
  }, [products, query]);
  const total = cart.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const discount = Math.max(0, Math.min(Number(discountValue) || 0, total));
  const netTotal = Math.max(0, total - discount);
  const paid = Math.max(0, Number(paidValue) || 0);
  const changeAmount = Math.max(0, paid - netTotal);
  const debtAmount = Math.max(0, netTotal - paid);

  // النقدي الافتراضي: عند بدء فاتورة جديدة يكون المدفوع مساويًا للصافي،
  // مع السماح للمستخدم بتغييره يدويًا إلى دفع جزئي أو صفر.
  useEffect(() => {
    if (!cart.length || paidEditedRef.current) return;
    setPaidValue(netTotal);
  }, [cart.length, netTotal]);
  const isFavorite = p => favorites.includes(String(p.id));
  const toggleFavorite = async p => {
    if (!remote) { notify('الاتصال بـ PostgreSQL/API مطلوب لإدارة المفضلة.'); return; }
    try { await api('/favorites/toggle',{method:'POST',body:JSON.stringify({productId:p.id})}); const rows=await api('/favorites'); setFavorites(rows.map(x=>String(x.id))); }
    catch(err){notify(err?.message||'تعذر تعديل المفضلة');}
  };
  const favoriteProducts = useMemo(() => products.filter(p => favorites.includes(String(p.id))), [products, favorites]);
  const loadCustomerDebts = async () => {
    setCustomerDebtLoading(true);
    try {
      if (!remote) { setCustomerDebts([]); return; }
      const data = await api('/customers/debts');
      setCustomerDebts(Array.isArray(data) ? data : []);
    } catch { setCustomerDebts([]); }
    finally { setCustomerDebtLoading(false); }
  };

  useEffect(() => { loadCustomerDebts(); }, [remote]);

  // تحديث ديون العملاء فور العودة إلى نافذة POS بعد تسجيل دفعة من شاشة أخرى.
  // لا نعتمد على إضافة منتج أو أي تغيير آخر في السلة لإظهار الرصيد الجديد.
  useEffect(() => {
    if (!remote) return;

    const refreshOnResume = () => {
      if (document.visibilityState !== "hidden") {
        loadCustomerDebts().catch(() => {});
      }
    };

    window.addEventListener("focus", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);

    return () => {
      window.removeEventListener("focus", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, [remote]);
  const playPOSSound = type => {
    try {
      const nowMs = Date.now();
      const minGap = type === "new" || type === "repeat" ? 70 : 0;
      if (minGap && nowMs - lastSoundAtRef.current < minGap) return;
      lastSoundAtRef.current = nowMs;

      // الأصوات المخصصة التي اختارها المستخدم: نجاح / خطأ / تحذير فقط.
      const soundMap = {
        success: successSound,
        new: successSound,
        repeat: successSound,
        error: errorSound,
        warning: warningSound
      };
      const src = soundMap[type] || null;
      if (!src) return;

      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = 1;
      audio.currentTime = 0;
      const result = audio.play();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {}
  };

  useEffect(() => { setSelectedIndex(cart.length ? Math.min(selectedIndex, cart.length - 1) : -1); }, [activeCart, cart.length]);
  const focusBarcode = useBarcodeFocus(barcodeInputRef);

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
    if (!found) notify("الباركود غير متوفر", "error");
    else notify("");
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
      notify("");
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

  const saveBarcodeEdit = async e => {
    e.preventDefault();
    if (!remote) { notify('الاتصال بـ PostgreSQL/API مطلوب لتعديل السلع.'); return; }
    if (!barcodeProduct || !String(barcodeEditForm.name).trim() || barcodeEditForm.price === '') return;
    try {
      const updated=await api(`/products/${barcodeProduct.id}`,{method:'PUT',body:JSON.stringify({
        name:String(barcodeEditForm.name).trim(),barcode:String(barcodeEditForm.barcode||'').trim()||null,
        purchase_price:Number(barcodeEditForm.purchase)||0,sale_price:Number(barcodeEditForm.price)||0,
        minimum_stock:Number(barcodeEditForm.min)||0
      })});
      const p={id:updated.id,name:updated.name,barcode:updated.barcode||'',category:updated.category||'',unit:updated.unit||'',purchase:Number(updated.purchase_price||0),price:Number(updated.sale_price||0),stock:Number(updated.current_stock||0),min:Number(updated.minimum_stock||0)};
      setProducts(v=>v.map(x=>x.id===p.id?p:x));setBarcodeProduct(p);setBarcodeValue(p.barcode);setBarcodeEditMode(false);notify('تم تعديل السلعة بنجاح');
    } catch(err){notify(err?.message||'تعذر تعديل السلعة');}
  };

  const openQuantityInput = () => {
    setDirectQuantityValue("");
    setQuantityModalOpen(true);
  };

  const addQuantityToSelectedProduct = e => {
    e?.preventDefault?.();

    const quantity = Math.floor(Number(String(directQuantityValue || "").replace(/[^0-9]/g, "")));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      notify("أدخل كمية صحيحة");
return;
    }

    // الاختصار * يعمل على السلعة المحددة داخل السلة، وليس على نتائج البحث.
    // إذا لم يوجد تحديد، نستخدم آخر منتج حقيقي في السلة.
    const selectedCartItem = selectedIndex >= 0 ? cart[selectedIndex] : null;
    const fallbackIndex = [...cart].map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => !item.isDirectAmount)?.index;
    const targetIndex = selectedCartItem && !selectedCartItem.isDirectAmount
      ? selectedIndex
      : fallbackIndex;
    const target = targetIndex === undefined ? null : cart[targetIndex];

    if (!target || target.isDirectAmount) {
      notify("حدد سلعة من السلة أولًا ثم اضغط *");
return;
    }

    const stock = Number(target.max ?? 0);
    const currentQty = Number(target.quantity || 0);
    const available = Math.max(0, stock - currentQty);

    if (quantity > available) {
      notify(`الكمية الإضافية أكبر من المخزون المتوفر (${available})`);
return;
    }

    setCart(c => c.map((item, index) =>
      index === targetIndex
        ? { ...item, quantity: Number(item.quantity || 0) + quantity }
        : item
    ));

    setSelectedIndex(targetIndex);
    setQuantityModalOpen(false);
    setDirectQuantityValue("");
    notify(`تمت إضافة ${quantity} إلى ${target.name}`);
setTimeout(() => focusBarcode(), 0);
  };

  const openDirectAmount = () => {
    setDirectAmountValue("");
    setAmountModalOpen(true);
  };

  const addDirectAmount = e => {
    e?.preventDefault?.();
    const normalized = String(directAmountValue || "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("أدخل مبلغًا صحيحًا");
return;
    }
    const item = {
      id: `direct-amount-${Date.now()}`,
      name: "سلعة",
      barcode: "",
      itemType: "direct_amount",
      price: amount,
      quantity: 1,
      max: Infinity,
      isDirectAmount: true
    };
    setCart(c => [...c, item]);
    setAmountModalOpen(false);
    setDirectAmountValue("");
    notify(`تمت إضافة مبلغ ${money(amount)} دج إلى السلة`);
setTimeout(() => focusBarcode(), 0);
  };

  const add = p => {
    if (Number(p.stock) <= 0) {
      notify("المنتج غير متوفر في المخزون");
setQuery("");
      focusBarcode();
      return false;
    }

    const alreadyInCart = cart.find(i => i.id === p.id);

    if (alreadyInCart && alreadyInCart.quantity >= Number(p.stock)) {
      notify("لا توجد كمية إضافية متوفرة من هذا المنتج");
setQuery("");
      focusBarcode();
      return false;
    }

    notify("");
    setCart(c => {
      const f = c.find(i => i.id === p.id);
      if (f) {
        return c.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...c, {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        quantity: 1,
        max: Number(p.stock)
      }];
    });
setQuery("");
    setSelectedIndex(c => {
      const idx = cart.findIndex(i => i.id === p.id);
      return idx >= 0 ? idx : cart.length;
    });
    focusBarcode();
    return true;
  };

  const changeQty = (id, d) => setCart(c => c.map(i => i.id === id ? { ...i, quantity: Math.max(1, Math.min(i.max, i.quantity + d)) } : i));

  const setQty = (id, value) => setCart(c => c.map(i => {
    if (i.id !== id) return i;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return { ...i, quantity: 1 };
    return { ...i, quantity: Math.min(i.max, Math.floor(n)) };
  }));

  const remove = id => {
    setCart(c => c.filter(i => i.id !== id));
};

  const switchCart = index => {
    if (index < 0 || index >= carts.length) return;
    setActiveCart(index);
    setSelectedIndex(-1);
    focusBarcode();
  };

  const startNewCart = () => {
    const idx = carts.findIndex((c, i) => i !== activeCart && c.length === 0);
    if (idx >= 0) switchCart(idx);
    else notify("جميع السلات الخمس مستخدمة");
  };

  const handleBarcodeChange = e => setQuery(e.target.value);

  const handleBarcodeKeyDown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const code = normalizeBarcode(query);
      if (!code) {
        requestAnimationFrame(() => barcodeInputRef.current?.focus());
        return;
      }
      const exact = products.find(p => normalizeBarcode(p.barcode) === code);
      if (exact) { add(exact); return; }
      const first = filtered[0];
      if (first) { add(first); return; }
      setQuery("");
      playPOSSound("error");
      notify("الباركود غير متوفر", "error");
      requestAnimationFrame(() => {
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select?.();
      });
      setTimeout(() => barcodeInputRef.current?.focus(), 40);
    }
  };

  useEffect(() => {
    const onKey = e => {
      if (barcodeModalOpen) return;

      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);

      // لا نتدخل في لوحة المفاتيح داخل أي حقل إدخال.
      // شريط البحث يعالج Enter محليًا في handleBarcodeKeyDown،
      // وباقي الحقول يجب أن تبقى قابلة للكتابة بشكل طبيعي.
      if (isInput) return;

      const isPlusShortcut =
        e.key === "+" ||
        e.code === "NumpadAdd" ||
        e.keyCode === 107 ||
        e.which === 107 ||
        ((e.code === "Equal" || e.key === "=" || e.keyCode === 187 || e.which === 187) && e.shiftKey);

      const isMultiplyShortcut =
        e.key === "*" ||
        e.code === "NumpadMultiply" ||
        e.keyCode === 106 ||
        e.which === 106 ||
        ((e.code === "Digit8" || e.key === "8" || e.keyCode === 56 || e.which === 56) && e.shiftKey);

      // الاختصارات تعمل فقط عندما لا يكون المستخدم يكتب داخل حقل.
      if (isPlusShortcut) {
        e.preventDefault();
        e.stopPropagation();
        openDirectAmount();
        return;
      }

      if (isMultiplyShortcut) {
        e.preventDefault();
        e.stopPropagation();
        openQuantityInput();
        return;
      }

      if (e.key === "Escape") {
        if (amountModalOpen) {
          e.preventDefault();
          setAmountModalOpen(false);
          setDirectAmountValue("");
          return;
        }
        if (quantityModalOpen) {
          e.preventDefault();
          setQuantityModalOpen(false);
          setDirectQuantityValue("");
          return;
        }
      }

      if (e.key === "F2") {
        e.preventDefault();
        focusBarcode();
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        setTodayInvoiceSearch(""); setTodayInvoicesOpen(true); loadTodayInvoices();
        return;
      }

      if (e.key === "F6") {
        e.preventDefault();
        openCustomerSelector();
        return;
      }

      if (e.key === "F7") {
        e.preventDefault();
        complete();
        return;
      }

      if (e.key === "F8") {
        e.preventDefault();
        if (lastSale) handlePrint();
        else notify("لا توجد فاتورة لطباعتها بعد");
        return;
      }

      if (e.key === "F12") {
        e.preventDefault();
        openBarcodeModal();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (lastSale) handlePrint();
        else notify("لا توجد فاتورة لطباعتها بعد");
        return;
      }

      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        complete();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        switchCart(activeCart >= carts.length - 1 ? 0 : activeCart + 1);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        switchCart(activeCart <= 0 ? carts.length - 1 : activeCart - 1);
        return;
      }

      if (e.key === "Delete") {
        if (selectedIndex < 0 || !cart.length || isInput) return;
        e.preventDefault();
        remove(cart[selectedIndex].id);
        setSelectedIndex(i => Math.max(-1, Math.min(i, cart.length - 2)));
        return;
      }

      if (e.key === "ArrowDown" && cart.length) {
        e.preventDefault();
        setSelectedIndex(i => Math.min(cart.length - 1, i < 0 ? 0 : i + 1));
      } else if (e.key === "ArrowUp" && cart.length) {
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i < 0 ? cart.length - 1 : i - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        focusBarcode();
      }
    };

    // capture=true حتى لا يمنع onKeyDown الموجود في شريط البحث الاختصار.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    cart,
    carts.length,
    activeCart,
    selectedIndex,
    barcodeModalOpen,
    lastSale,
    amountModalOpen,
    quantityModalOpen
  ]);

  const complete = async (customerOverride = customer, customerIdOverride = customerId) => {
    if (completingSale) return;
    if (!cart.length) { notify("السلة فارغة — أضف منتجًا أولًا"); focusBarcode(); return; }
    if (!remote) { notify("الاتصال بـ PostgreSQL/API مطلوب لإتمام البيع."); return; }
    try {
      setCompletingSale(true);
      notify('جاري إتمام البيع...');
      const selectedCustomer = customers.find(c => String(c.id) === String(customerIdOverride)) || null;
      const payload={customerId:selectedCustomer?.id || null,customerName:selectedCustomer?.name || 'زبون',items:cart.map(i=>({id:i.id,productId:i.isDirectAmount?null:i.id,name:i.name,price:Number(i.price||0),quantity:Number(i.quantity||1),itemType:i.isDirectAmount?'direct_amount':'product',isDirectAmount:!!i.isDirectAmount})),paymentMethod:'cash',discount,paid};
      const saved=editingInvoice
        ? await api(`/sales/${editingInvoice.id}`,{method:'PATCH',body:JSON.stringify(payload)})
        : await api('/sales',{method:'POST',body:JSON.stringify(payload)});
      const sale={id:saved.id,invoice:saved.invoice_number,createdAt:saved.created_at??new Date().toISOString(),customer:saved.customer_name??customerOverride??'زبون',customerId:saved.customer_id??customerIdOverride??null,customerIsDefault:Boolean(saved.customer_is_default ?? ((saved.customer_name??customerOverride??'زبون')==='زبون'||(saved.customer_name??customerOverride??'زبون')==='زبون نقدي')),customerPreviousDebt:Number(saved.customer_previous_debt??0),customerInvoiceDebt:Number(saved.customer_invoice_debt??Math.max(0,Number(saved.total??total)-Number(saved.paid??0))),customerDebtPaidFromOverpayment:Number(saved.customer_debt_paid_from_overpayment??0),customerTotalDebt:Number(saved.customer_total_debt??0),paymentMethod:saved.payment_method??'cash',subtotal:Number(saved.subtotal??total),discount:Number(saved.discount??0),total:Number(saved.total??total),paid:Number(saved.paid??0),change:Number(saved.change_amount??0),items:(saved.items||cart.map(i=>({id:i.id,name:i.name,barcode:i.barcode,price:i.price,quantity:i.quantity,isDirectAmount:!!i.isDirectAmount}))).map(i=>({id:i.product_id||i.id,name:i.name,barcode:i.barcode,price:Number(i.price??i.unit_price??0),quantity:Number(i.quantity??1),isDirectAmount:i.item_type==='direct_amount'||i.isDirectAmount})),status:'مكتملة'};
      // إظهار الفاتورة فورًا بمجرد نجاح تسجيل البيع، دون انتظار أي طلبات خلفية
      // (تحديث قائمة المنتجات، الإشعارات...) حتى لا يؤدي بطء أو تعطل أحدها
      // إلى بقاء الفاتورة بلا ظهور دون أي رسالة خطأ.
      setCart([]);setCustomer('زبون');setCustomerId(null);setDiscountValue(0);paidEditedRef.current=false;setPaidValue(0);
      notify(`${editingInvoice?'✓ تم تعديل الفاتورة':'✓ تم تسجيل البيع بنجاح'} — ${sale.invoice}`);playPOSSound('success');setPrintError('');setLastSale(sale);setEditingInvoice(null);setSelectedIndex(-1);focusBarcode();
      try {
        const cfg = await api('/settings');
      } catch (e) { console.error('autoPrint settings fetch failed', e); }
      try {
        const ps=await api('/products');
        setProducts(ps.map(p=>({id:p.id,name:p.name,barcode:p.barcode||'',category:p.category||'',unit:p.unit||'',purchase:Number(p.purchase_price||0),price:Number(p.sale_price||0),stock:Number(p.current_stock||0),min:Number(p.minimum_stock||0)})));
        await loadCustomerDebts();
        emitDataChanged([DATA_DOMAINS.SALES,DATA_DOMAINS.CASH,DATA_DOMAINS.INVENTORY,DATA_DOMAINS.CUSTOMERS,DATA_DOMAINS.REPORTS], {source:'sale-completed'});
        const inventoryEventAt=Date.now();
        try{localStorage.setItem('bazaar:cash-updated',String(inventoryEventAt));localStorage.setItem('bazaar:inventory-updated',String(inventoryEventAt));}catch{}
        window.dispatchEvent(new Event('bazaar:cash-updated'));window.dispatchEvent(new Event('bazaar:inventory-updated'));
        try{window.desktopAPI?.notifyCashUpdated?.();window.desktopAPI?.notifyInventoryUpdated?.();window.desktopAPI?.notifyReportsUpdated?.();try{window.__reportsBroadcastChannel ??= ('BroadcastChannel' in window ? new BroadcastChannel('bazaar-reports-updates') : null);window.__reportsBroadcastChannel?.postMessage({type:'reports-updated',at:inventoryEventAt});}catch{}}catch{}
        try{window.__cashBroadcastChannel ??= ('BroadcastChannel' in window ? new BroadcastChannel('bazaar-cash-updates') : null);window.__cashBroadcastChannel?.postMessage({type:'cash-updated',at:inventoryEventAt});}catch{}
        try{window.__inventoryBroadcastChannel ??= ('BroadcastChannel' in window ? new BroadcastChannel('bazaar-inventory-updates') : null);window.__inventoryBroadcastChannel?.postMessage({type:'inventory-updated',at:inventoryEventAt});}catch{}
        try{window.opener?.postMessage({type:'bazaar-cash-updated',at:inventoryEventAt}, window.location.origin);window.opener?.postMessage({type:'bazaar-inventory-updated',at:inventoryEventAt}, window.location.origin);}catch{}
      } catch (e) {
        console.error('post-sale background refresh failed', e);
      }
    } catch(err){notify(err?.message||'تعذر تسجيل العملية');focusBarcode();}
    finally { setCompletingSale(false); }
  };

  const handlePrint = async () => {
    if (!lastSale || printingInvoice) return;
    setPrintingInvoice(true); setPrintError("");
    try {
      await printInvoice(lastSale);
} catch (e) {
setPrintError(e?.message || "تعذرت طباعة الفاتورة");
    } finally {
      setPrintingInvoice(false);
    }
  };

  const handleTopPrint = () => {
    if (!lastSale) { notify("لا توجد فاتورة لطباعتها بعد"); return; }
    handlePrint();
  };

  // تحويل رموز صف الأرقام في لوحة AZERTY إلى أرقام داخل بحث فواتير اليوم،
  // مع الإبقاء على النص العربي/اللاتيني حتى يبقى البحث باسم العميل ممكنًا.
  const normalizeTodayInvoiceSearch = value => String(value ?? "")
    .replace(/[٠-٩]/g, ch => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
    .replace(/[۰-۹]/g, ch => String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
    .replace(/[&é"'(\-è_çà]/g, ch => ({ "&": "1", "é": "2", "\"": "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0" }[ch] || ch));

  const getTodayInvoices = () => todayInvoices.filter(sale => {
    const q = normalizeTodayInvoiceSearch(todayInvoiceSearch).trim().toLowerCase();
    if (!q) return true;
    const blob = `${sale.invoice_number||sale.invoice||''} ${sale.customer_name||sale.customer||''} ${(sale.items||[]).map(i=>i.barcode||'').join(' ')}`.toLowerCase();
    const qDigits = normalizeBarcode(q);
    if (blob.includes(q)) return true;
    if (qDigits) {
      const barcodeDigits = normalizeBarcode((sale.items||[]).map(i=>i.barcode||'').join(' '));
      const invoiceDigits = normalizeBarcode(sale.invoice_number || sale.invoice || '');
      if (barcodeDigits.includes(qDigits) || invoiceDigits.includes(qDigits)) return true;
    }
    return false;
  });

  const loadTodayInvoices = async () => {
    if (!remote) { notify('الاتصال بـ PostgreSQL/API مطلوب لعرض فواتير اليوم.'); return; }
    setTodayInvoicesLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1).toISOString();
      const searchValue = normalizeTodayInvoiceSearch(todayInvoiceSearch);
      const rows = await api(`/sales?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}&search=${encodeURIComponent(searchValue)}`);
      setTodayInvoices(rows);
    } catch (e) { notify(e?.message || 'تعذر تحميل فواتير اليوم'); }
    finally { setTodayInvoicesLoading(false); }
  };

  const loadSaleForTodayAction = async sale => {
    if (!remote || !sale?.id) return normalizeInvoiceForDisplay(sale);
    try {
      const search = sale.invoice_number || sale.invoice || String(sale.id);
      const rows = await api(`/sales?limit=500&search=${encodeURIComponent(search)}`);
      const fresh = (rows || []).find(x => String(x.id) === String(sale.id));
      return normalizeInvoiceForDisplay(fresh || sale);
    } catch {
      return normalizeInvoiceForDisplay(sale);
    }
  };

  const loadInvoiceSettings = async () => {
    try {
      const cfg = await api('/settings');
      return {
        print: cfg?.print || {},
        store: cfg?.store || {}
      };
    } catch {
      return { print: {}, store: {} };
    }
  };

  const openInvoiceView = async sale => {
    setPrintError("");
    setTodayInvoicePrintError("");
    // أظهر الوصل فورًا ثم حدّثه ببيانات الفاتورة الكاملة دون تعطيل النافذة.
    setInvoiceDetailsSale(normalizeInvoiceForDisplay(sale));
    if (!remote) return;

    const [freshSale, settings] = await Promise.all([
      loadSaleForTodayAction(sale),
      loadInvoiceSettings()
    ]);
    setInvoiceDetailsSale(freshSale);
    setInvoicePrintSettings(settings.print);
    setInvoiceStoreSettings(settings.store);
  };

  const editTodayInvoice = sale => {
    if (!remote) { notify('الاتصال بـ PostgreSQL/API مطلوب لتعديل الفاتورة.'); return; }
    const byId = new Map(products.map(p => [String(p.id), p]));
    const invoiceCart = (sale.items || []).map(item => {
      if (item.item_type === 'direct_amount') return { id:`direct-${item.id}`, name:'سلعة', price:Number(item.price||item.unit_price||0), quantity:Number(item.quantity||1), isDirectAmount:true };
      const p = byId.get(String(item.product_id));
      if (!p) return null;
      return { id:p.id, name:p.name, barcode:p.barcode, price:p.price, quantity:Number(item.quantity||1), max:Number(p.stock||0)+Number(item.quantity||0) };
    }).filter(Boolean);
    setCart(invoiceCart);
    setCustomer(sale.customer_name || sale.customer || 'زبون');setCustomerId(sale.customer_id || null);
    setDiscountValue(Number(sale.discount||0));
    setPaidValue(Number(sale.paid||0));
    setEditingInvoice({id:sale.id,invoice:sale.invoice_number||sale.invoice});
    setTodayInvoicesOpen(false);
    setLastSale(null);
    setSelectedIndex(-1);
    notify(`جاري تعديل الفاتورة ${sale.invoice_number||sale.invoice}`);
    focusBarcode();
  };

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!remote || !editId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await api(`/sales?limit=500&search=${encodeURIComponent(editId)}`);
        const sale = (rows || []).find(x => String(x.id) === String(editId));
        if (!cancelled && sale) editTodayInvoice(sale);
        else if (!cancelled) notify("تعذر العثور على الفاتورة المطلوب تعديلها.");
      } catch (e) {
        if (!cancelled) notify(e?.message || "تعذر تحميل الفاتورة للتعديل.");
      }
    })();
    return () => { cancelled = true; };
  }, [remote]);

  const printTodayInvoice = async sale => {
    const printId = sale?.id ?? sale?.invoice_number ?? sale?.invoice ?? `sale-${Date.now()}`;
    setTodayInvoicePrintingId(printId);
    setTodayInvoicePrintError("");
    setPrintError("");
    notify("جاري تجهيز الفاتورة للطباعة...");
    try {
      const fullSale = await loadSaleForTodayAction(sale);
      await printInvoice(fullSale);
notify(`تم إرسال الفاتورة ${formatInvoiceNumber(fullSale.invoice_number || fullSale.invoice)} إلى الطابعة.`);
    } catch (e) {
const msg = e?.message || "تعذرت طباعة الفاتورة";
      setTodayInvoicePrintError(msg);
      setPrintError(msg);
      notify(msg);
    } finally {
      setTodayInvoicePrintingId(null);
    }
  };

  const handleExitPOS = () => { window.close(); };

  const openCustomerSelector = () => {
    setCustomerSearch("");
    setNewCustomerName("");
    setCustomerModalOpen(true);
  };

  const selectCustomer = async (name, id = null) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) return;
    setCustomer(cleanName);
    setCustomerId(id || null);
    setCustomerSearch("");
    setNewCustomerName("");
    setCustomerModalOpen(false);
if (cart.length && cleanName !== 'زبون') {
      await complete(cleanName, id || null);
    } else {
      notify(`تم اختيار العميل: ${cleanName}`);
      setTimeout(() => focusBarcode(), 0);
    }
  };

  const saveAndSelectCustomer = async e => {
    e?.preventDefault?.();
    const name = String(customerSearch || newCustomerName).trim();
    if (!name) return;

    const existing = customers.find(
      c => String(c.name || "").trim().toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      selectCustomer(existing.name, existing.id);
      return;
    }

    if (remote) {
      try { const created=await api('/customers',{method:'POST',body:JSON.stringify({name})}); setCustomers(v=>[...v,created]); selectCustomer(created.name, created.id); }
      catch(err){notify(err?.message||'تعذر حفظ العميل');}
      return;
    }
    notify('الاتصال بـ PostgreSQL/API مطلوب لحفظ العميل.');
  };

  const filteredCustomers = customers.filter(c =>
    String(c.name || "").toLowerCase().includes(customerSearch.trim().toLowerCase())
  );

  const cancelTodayInvoice = async sale => {
    if (!sale) return;
    if (!remote) {
      notify('الاتصال بـ PostgreSQL/API مطلوب لإلغاء الفاتورة.');
      return;
    }

    // أغلق نافذة الفواتير فورًا، وأزل أي حالة واجهة قد تمنع التفاعل.
    setTodayInvoicesOpen(false);
    setTodayInvoices(prev => prev.filter(item => String(item.id) !== String(sale.id)));
    setTodayInvoicesLoading(false);
    setQuery('');
    setSelectedIndex(-1);
    setBarcodeModalOpen(false);
    setAmountModalOpen(false);
    setQuantityModalOpen(false);
    setCustomerModalOpen(false);
    notify('جاري إلغاء الفاتورة...');

    try {
      await api(`/sales/${sale.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'إلغاء الفاتورة' })
      });

      // أعد تحميل المنتجات من PostgreSQL حتى يعكس POS المخزون الذي عاد بعد الإلغاء.
      const ps = await api('/products');
      setProducts(ps.map(p => ({
        id: p.id, name: p.name, barcode: p.barcode || '',
        category: p.category || '', unit: p.unit || '',
        purchase: Number(p.purchase_price || 0), price: Number(p.sale_price || 0),
        stock: Number(p.current_stock || 0), min: Number(p.minimum_stock || 0)
      })));

      // جدد بيانات العميل في الخلفية فقط؛ لا تنتظر فواتير اليوم حتى لا تحبس الإدخال.
      loadCustomerDebts().catch(() => {});
      loadTodayInvoices().catch(() => {});

      notify(`تم إلغاء ${sale.invoice_number || sale.invoice}`);
// إعادة تركيز حقيقية بعد اكتمال تحديث الحالة والـDOM.
      const restoreFocus = () => {
        try { window.desktopAPI?.focusWindow?.().catch?.(() => {}); } catch {}
        try { window.focus?.(); } catch {}
        try { document.activeElement?.blur?.(); } catch {}
        const focusBarcode = () => {
          try {
            barcodeInputRef.current?.focus();
            barcodeInputRef.current?.select?.();
          } catch {}
        };
        requestAnimationFrame(focusBarcode);
        setTimeout(focusBarcode, 20);
        setTimeout(focusBarcode, 80);
      };
      restoreFocus();
      setTimeout(restoreFocus, 40);
      setTimeout(restoreFocus, 120);
    } catch (e) {
      notify(e?.message || 'تعذر إلغاء الفاتورة');
try { window.desktopAPI?.focusWindow?.().catch?.(() => {}); } catch {}
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
    } finally {
      setPendingCancelInvoice(null);
    }
  };

  const requestCancelTodayInvoice = sale => {
    if (!sale) return;
    setTodayInvoicesOpen(false);
    setPendingCancelInvoice(sale);
  };

  return <div className="posView" dir="rtl">
  {amountModalOpen && (
    <div className="amountOverlay" role="dialog" aria-modal="true" onMouseDown={e => {
      if (e.target === e.currentTarget) {
        setAmountModalOpen(false);
        setDirectAmountValue("");
      }
    }}>
      <form className="amountModal" onSubmit={addDirectAmount}>
        <button type="button" className="amountModalClose" onClick={() => {
          setAmountModalOpen(false);
          setDirectAmountValue("");
        }} aria-label="إغلاق"><X size={18} /></button>
        <h3>إضافة سلعة بالمبلغ</h3>
        <p>أدخل مبلغ السلعة ثم اضغط Enter</p>
        <input autoFocus inputMode="decimal" type="text" value={directAmountValue}
          onChange={e => setDirectAmountValue(e.target.value)} placeholder="500" />
        <div className="amountModalActions">
          <button type="button" className="customerCancelBtn" onClick={() => {
            setAmountModalOpen(false);
            setDirectAmountValue("");
          }}>إلغاء</button>
          <button type="submit" className="customerSaveBtn">إضافة إلى السلة</button>
        </div>
      </form>
    </div>
  )}

    {quantityModalOpen && (
      <div
        className="amountOverlay quantityOverlay"
        role="dialog"
        aria-modal="true"
        onMouseDown={e => {
          if (e.target === e.currentTarget) {
            setQuantityModalOpen(false);
            setDirectQuantityValue("");
          }
        }}
      >
        <form className="amountModal" onSubmit={addQuantityToSelectedProduct}>
          <button
            type="button"
            className="amountModalClose"
            onClick={() => {
              setQuantityModalOpen(false);
              setDirectQuantityValue("");
            }}
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>

          <h3>إدخال الكمية</h3>
          <p>
            {selectedIndex >= 0 && filtered[selectedIndex]
              ? filtered[selectedIndex].name
              : "اختر المنتج أولًا"}
          </p>

          <input
            autoFocus
            inputMode="numeric"
            type="text"
            value={directQuantityValue}
            onChange={e => setDirectQuantityValue(e.target.value.replace(/\D/g, ""))}
            placeholder="1"
            aria-label="الكمية"
          />

          <div className="amountModalActions">
            <button
              type="button"
              className="customerCancelBtn"
              onClick={() => {
                setQuantityModalOpen(false);
                setDirectQuantityValue("");
              }}
            >
              إلغاء
            </button>
            <button type="submit" className="customerSaveBtn">
              إضافة الكمية
            </button>
          </div>
        </form>
      </div>
    )}

    <div className="posSummary">
      <div className="summaryTotal digitalAmount"><div className="digitalAmountValue"><strong className="digitalAmountNumber">{money(total)}</strong><span className="digitalAmountUnit">دج</span></div></div>
    </div>

<div className="posMain">
      <section className="posLeft">
        <div className="cartTabs">
          {carts.slice(0, 5).map((c, i) => (
            <button
              key={i}
              type="button"
              className={i === activeCart ? "cartTab active" : "cartTab"}
              onClick={() => switchCart(i)}
              aria-label={`السلة ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="searchRow"><button type="button" className="barcodeBtn" onClick={openBarcodeModal}><Barcode size={27} /> باركود</button><div className="posSearch"><input ref={barcodeInputRef} autoFocus value={query} onChange={handleBarcodeChange} onKeyDown={handleBarcodeKeyDown} onFocus={e => { e.currentTarget.setSelectionRange?.(e.currentTarget.value.length, e.currentTarget.value.length); }} placeholder="إبحث باسم السلعة أو الكود أو الباركود" /><Search size={25} /></div></div>
        <div className={query.trim() ? "productResults show" : "productResults"}>{filtered.map(p => <button type="button" className="posProduct" key={p.id} onClick={() => add(p)} disabled={Number(p.stock) <= 0}><span className="posProductName">{p.name}</span><div className="posProductMeta">
                    <strong className="posProductPrice">{money(p.price)} دج</strong>
                    <span className="posProductStock">المتاح: {Number(p.stock) || 0}</span>
                  </div></button>)}</div>
        <div className="cartTable">
          <div className="cartTableHead"><span>#</span><span>السلعة</span><span>السعر</span><span>الكمية</span><span>الإجمالي</span><span>إجراءات</span></div>
          {cart.length ? cart.map((i, index) => (
            <div
              className={index === selectedIndex ? "cartRow selected" : "cartRow"}
              key={i.id}
              onClick={() => setSelectedIndex(index)}
            >
              <span>{index + 1}</span>

              <div className={i.isDirectAmount ? "cartProduct directAmountProduct" : "cartProduct"}>
                <strong>{i.isDirectAmount ? "سلعة" : i.name}</strong>
              </div>

              <span>{money(i.price)} دج</span>

              <div className="qtyControls">
                <button
                  type="button"
                  disabled={i.isDirectAmount}
                  onClick={e => {
                    e.stopPropagation();
                    if (!i.isDirectAmount) changeQty(i.id, -1);
                  }}
                >
                  <Minus />
                </button>

                <input
                  type="number"
                  min="1"
                  max={i.max}
                  value={i.quantity}
                  onClick={e => e.stopPropagation()}
                  disabled={i.isDirectAmount}
                  onChange={e => {
                  if (e.target.value === "") return;
                  if (!i.isDirectAmount) setQty(i.id, e.target.value);
                }}
                  onBlur={e => {
                    if (!e.target.value) setQty(i.id, 1);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  aria-label={`كمية ${i.name}`}
                />

                <button
                  type="button"
                  disabled={i.isDirectAmount}
                  onClick={e => {
                    e.stopPropagation();
                    if (!i.isDirectAmount) changeQty(i.id, 1);
                  }}
                >
                  <Plus />
                </button>
              </div>

              <strong>{money(i.price * i.quantity)} دج</strong>

              <button
                type="button"
                className="deleteRow"
                onClick={e => {
                  e.stopPropagation();
                  remove(i.id);
                  setSelectedIndex(-1);
                }}
              >
                <Trash2 />
              </button>
            </div>
          )) : <div className="cartEmpty"><ShoppingCart size={42} /><span>السلة فارغة</span><small>امسح باركود المنتج أو اختر سلعة لإضافتها</small></div>}
        </div>

        <section className="posFavoritesProductArea">
          <div className="posFavoritesHeader">
            <strong>المفضلة</strong>
            <Star size={15} fill="currentColor" />
          </div>

          {favoriteProducts.length ? (
            <div className="posFavoritesProducts">
              {favoriteProducts.map(p => (
                <button
                  type="button"
                  className="posFavoriteProduct"
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={Number(p.stock) <= 0}
                >
                  <span className="posProductName">{p.name}</span>
                  <strong className="posProductPrice">{money(p.price)} دج</strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="posFavoritesEmpty">
              لا توجد منتجات مفضلة حاليًا
            </div>
          )}
        </section>
      </section>

        <aside className="paymentPanel">

  <div className="posTopBar">
    <div className="posTopBarRow">

      <button
        type="button"
        className="posTopBtn"
       onClick={() => {
        if (!cart.length) {
          notify("السلة فارغة");
return;
        }
        if (window.confirm("هل تريد مسح جميع المنتجات من السلة؟")) {
          setCart([]);
          setCustomer("زبون");
          notify("تم مسح السلة");
setTimeout(() => focusBarcode(), 0);
        }
      }}>
        <Trash2 size={16} />
        مسح السلة
      </button>

      <button
        type="button"
        className="posTopBtn"
        onClick={openCustomerSelector}
      >
        <UserRound size={16} />
        العميل
      </button>

    </div>

    <button
      type="button"
      className="posTopBtn posExitBtn"
      onClick={handleExitPOS}
    >
      <LogOut size={16} />
      الخروج من نقطة البيع
    </button>
  </div>

  <div className="paymentTitle posTopSummary">
  <button
    type="button"
    className="posSummaryBtn"
    onClick={() => { setTodayInvoiceSearch(""); setTodayInvoicesOpen(true); loadTodayInvoices(); }}
  >
    <FileText size={20} />
    <span>فواتير اليوم</span>
  </button>
</div>
        <div className="paymentTitle"><h2>تفاصيل البيع</h2><Banknote /></div>
        <div className="payLine"><span>المجموع الكلي</span><strong>{money(total)} دج</strong></div>
        <div className="payLine"><label>الخصم (دج)</label><input type="number" min="0" max={total} value={discountValue} onChange={e=>setDiscountValue(e.target.value)} /></div>
        <div className="payLine"><span>بعد الخصم</span><strong>{money(netTotal)} دج</strong></div>
        <div className="payLine"><label>المدفوع</label><input type="number" min="0" value={paidValue} onChange={e=>{ paidEditedRef.current=true; setPaidValue(e.target.value); }} /></div>
        <div className="payLine"><span>{changeAmount > 0 ? 'الباقي' : 'المتبقي'}</span><strong>{money(changeAmount > 0 ? changeAmount : debtAmount)} دج</strong></div>
        <button className="completeBtn" onClick={() => complete()} disabled={!cart.length || completingSale}><CheckCircle2 size={22} /> {completingSale ? "جاري الإتمام..." : "إتمام البيع"}</button>
        <section className="customerDebtsPanel">
          <div className="customerDebtsHeader">
            <strong>ديون العملاء</strong>
            <span>{customerDebtLoading ? 'جارٍ التحديث...' : `${customerDebts.length} عميل`}</span>
          </div>
          <div className="customerDebtViewport">
            {customerDebts.length ? (
              <div className={`customerDebtTrack ${customerDebts.length > 3 ? 'autoScroll' : ''}`} style={{'--debt-count': customerDebts.length}}>
                {customerDebts.map((c,i)=>(
                  <button key={`d1-${c.id||c.name}-${i}`} type="button" className="customerDebtItem" onClick={()=>{setCustomer(c.name);setCustomerId(c.id||null);openCustomerSelector();}}>
                    <UserRound size={15}/><span>{c.name}</span><strong>{money(c.balance)} دج</strong>
                  </button>
                ))}
                {customerDebts.length > 3 && customerDebts.map((c,i)=>(
                  <button key={`d2-${c.id||c.name}-${i}`} type="button" className="customerDebtItem" onClick={()=>{setCustomer(c.name);setCustomerId(c.id||null);openCustomerSelector();}}>
                    <UserRound size={15}/><span>{c.name}</span><strong>{money(c.balance)} دج</strong>
                  </button>
                ))}
              </div>
            ) : <div className="customerDebtEmpty">لا توجد حسابات دين حاليًا</div>}
          </div>
        </section>

        {notification && (() => {
          const Icon = notification.type === "error" ? XCircle : notification.type === "warning" ? AlertTriangle : notification.type === "success" ? CheckCircle2 : Bell;
          const titles = { error: "خطأ", warning: "تنبيه", success: "تمت العملية", info: "معلومة" };
          const isCenterAlert = notification.type === "error" && /الباركود غير متوفر|المنتج غير متوفر/.test(notification.text);
          return (
            <div
              className={`appNotification ${notification.type}${isCenterAlert ? " center" : ""}`}
              role="alert"
              aria-live="assertive"
              style={isCenterAlert ? {
                position: "fixed",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 99999,
                width: "min(520px, calc(100vw - 40px))",
                minHeight: "180px",
                padding: "28px 30px",
                borderRadius: "22px",
                background: "linear-gradient(145deg, #7f1d1d, #dc2626)",
                color: "#fff",
                border: "2px solid rgba(255,255,255,.28)",
                boxShadow: "0 24px 70px rgba(0,0,0,.38), 0 0 0 9999px rgba(0,0,0,.28)",
                display: "flex",
                alignItems: "center",
                gap: "20px",
                direction: "rtl",
                textAlign: "right"
              } : undefined}
            >
              <div className="appNotificationIcon" style={isCenterAlert ? { width: 64, height: 64, minWidth: 64, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", color: "#fff" } : undefined}><Icon size={isCenterAlert ? 36 : 25} /></div>
              <div className="appNotificationBody" style={isCenterAlert ? { flex: 1, display: "flex", flexDirection: "column", gap: 8 } : undefined}><strong style={isCenterAlert ? { fontSize: 25, fontWeight: 800 } : undefined}>{titles[notification.type]}</strong><span style={isCenterAlert ? { fontSize: 18, fontWeight: 600, lineHeight: 1.7, opacity: .96 } : undefined}>{notification.text}</span>{isCenterAlert && <small style={{ opacity: .78, fontSize: 13 }}>تحقق من الباركود وحاول مرة أخرى</small>}</div>
              <button type="button" className="appNotificationClose" onClick={() => { setNotification(null); requestAnimationFrame(() => barcodeInputRef.current?.focus()); }} aria-label="إغلاق" style={isCenterAlert ? { width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", cursor: "pointer" } : undefined}><X size={18} /></button>
            </div>
          );
        })()}
      </aside>
    </div>

    <div className="posFooterActions"><button className="clearBtn" onClick={() => { setCart([]); setSelectedIndex(-1); }}><Trash2 /> إفراغ السلة</button><button className="printBtn" onClick={() => lastSale && handlePrint()} disabled={!lastSale || printingInvoice}><Printer /> {printingInvoice ? "جاري الطباعة..." : "طباعة الوصل"}</button><button className="holdBtn" onClick={() => notify("تم حفظ السلة مؤقتًا")}><Clock /> حفظ مؤقت</button><button className="newSaleBtn2" onClick={startNewCart}><ShoppingCart /> سلة أخرى</button></div>
    <div className="keyboardHint"><ArrowLeft /><ArrowRight /><span>للتنقل بين السلال</span><span className="hintArrows">↑ ↓</span><span>للتنقل بين عناصر السلة</span><b>Delete</b><span>لحذف العنصر</span><span>Esc</span><span>للعودة إلى الباركود</span></div>

    {pendingCancelInvoice && (
      <div className="cancelConfirmOverlay" role="dialog" aria-modal="true" aria-labelledby="cancelConfirmTitle">
        <div className="cancelConfirmModal" dir="rtl">
          <h3 id="cancelConfirmTitle">تأكيد إلغاء الفاتورة</h3>
          <p>هل تريد إلغاء الفاتورة <strong>{pendingCancelInvoice.invoice_number || pendingCancelInvoice.invoice}</strong>؟</p>
          <div className="cancelConfirmActions">
            <button type="button" className="cancelConfirmNo" onClick={() => setPendingCancelInvoice(null)}>إلغاء</button>
            <button type="button" className="cancelConfirmYes" onClick={() => cancelTodayInvoice(pendingCancelInvoice)}>تأكيد الإلغاء</button>
          </div>
        </div>
      </div>
    )}
    {todayInvoicesOpen && createPortal(<div className="todayInvoicesOverlay" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) setTodayInvoicesOpen(false); }}>
      <div className="todayInvoicesModal">
        <div className="todayInvoicesHeader">
          <div className="todayInvoicesClock" aria-label="الساعة">
            <Clock size={18} />
            <strong>{liveClock.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong>
          </div>
          <div className="todayInvoicesTitle">
            <h2>فواتير اليوم</h2>
            <span>{liveClock.toLocaleDateString("ar-DZ")}</span>
          </div>
          <button type="button" className="todayInvoicesClose" onClick={() => setTodayInvoicesOpen(false)} aria-label="إغلاق">
            <X size={22} />
          </button>
        </div>
        <div style={{padding:'10px 12px',borderBottom:'1px solid #e5eaf1',display:'flex',gap:'8px',alignItems:'center'}}>
          <Search size={17}/>
          <input value={todayInvoiceSearch} onChange={e=>{setTodayInvoiceSearch(normalizeTodayInvoiceSearch(e.target.value));}} onKeyDown={e=>{if(e.key==='Enter')loadTodayInvoices();}} placeholder="بحث برقم الفاتورة أو العميل أو الباركود" style={{flex:1,minHeight:36,border:'1px solid #dce4ef',borderRadius:8,padding:'0 10px'}}/>
          <button type="button" onClick={loadTodayInvoices} disabled={todayInvoicesLoading} style={{minHeight:36,padding:'0 12px'}}>{todayInvoicesLoading?'...':'بحث'}</button>
        </div>
        {todayInvoicePrintError && (
          <div role="alert" style={{margin:'10px 12px 0',padding:'9px 11px',border:'1px solid #f2b8b5',background:'#fff4f2',color:'#b42318',borderRadius:8,fontSize:12,lineHeight:1.5,whiteSpace:'pre-wrap'}}>
            {todayInvoicePrintError}
          </div>
        )}
        <div className="todayInvoicesList">
          {getTodayInvoices().length ? getTodayInvoices().map(sale => {
            const d = new Date(sale.created_at || sale.createdAt);
            const qty = (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return (
              <div className="todayInvoiceCard" key={sale.id}>
                <strong className="todayInvoiceNumber">{formatInvoiceNumber(sale.invoice_number || sale.invoice)}</strong>
                <span className="todayInvoiceDate">{d.toLocaleDateString("ar-DZ")}</span>
                <span className="todayInvoiceTime">{d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="todayInvoiceQty">عدد السلع: {qty}</span>
                <b className="todayInvoiceTotal">{money(sale.total)} دج</b>

                <div className="invoiceActionIcons">
                  <button type="button" className="invoiceViewBtn" onClick={e => { e.stopPropagation(); openInvoiceView(sale); }} title="تفاصيل الوصل" aria-label="تفاصيل الوصل"><FileText size={15} /></button>
                  <button type="button" className="invoiceEditBtn" onClick={() => editTodayInvoice(sale)} title="تعديل الوصل" aria-label="تعديل الوصل"><Edit3 size={15} /></button>
                  <button type="button" className="invoicePrintBtn" onClick={e => { e.stopPropagation(); printTodayInvoice(sale); }} disabled={todayInvoicePrintingId === sale.id} title="طباعة الفاتورة" aria-label="طباعة الفاتورة"><Printer size={15} />{todayInvoicePrintingId === sale.id ? <span style={{fontSize:10}}>...</span> : null}</button>
                  <button type="button" className="invoiceCancelBtn" onClick={() => requestCancelTodayInvoice(sale)} title="إلغاء الفاتورة" aria-label="إلغاء الفاتورة"><X size={15}/></button>
                </div>
              </div>
            );
          }) : (
            <div className="todayInvoicesEmpty">
              <FileText size={42} />
              <strong>لا توجد فواتير اليوم</strong>
              <span>ستظهر الفواتير هنا بعد إتمام عمليات البيع.</span>
            </div>
          )}
        </div>
      </div>
    </div>, document.body)}



    <BarcodeModal
      open={barcodeModalOpen}
      inputRef={barcodeModalInputRef}
      value={barcodeValue}
      product={barcodeProduct}
      editMode={barcodeEditMode}
      editForm={barcodeEditForm}
      onChange={handleBarcodeModalChange}
      onKeyDown={handleBarcodeModalKeyDown}
      onClose={closeBarcodeModal}
      onOpenEdit={openBarcodeEdit}
      onSaveEdit={saveBarcodeEdit}
      onCancelEdit={() => setBarcodeEditMode(false)}
      onEditFormChange={setBarcodeEditForm}
    />

    {invoiceDetailsSale && createPortal(<div className="invoiceDetailsOverlay" role="dialog" aria-modal="true" aria-labelledby="invoiceDetailsTitle" onMouseDown={e=>{if(e.target===e.currentTarget)setInvoiceDetailsSale(null);}}>
      <div className="invoiceDetailsModal" onMouseDown={e=>e.stopPropagation()}>
        <div className="invoiceDetailsHeader">
          <div><h2 id="invoiceDetailsTitle">تفاصيل الوصل</h2><span>{formatInvoiceNumber(invoiceDetailsSale.invoice)}</span></div>
          <button type="button" onClick={()=>setInvoiceDetailsSale(null)} aria-label="إغلاق"><X size={20}/></button>
        </div>
        <div className="invoiceDetailsBody invoiceDetailsBodyHtml">
          <InvoiceReceiptPreview sale={invoiceDetailsSale} printSettings={invoicePrintSettings} storeSettings={invoiceStoreSettings} />
        </div>
        {printError && (
          <div className="invoiceDetailsPrintError" role="alert">
            {printError}
          </div>
        )}
        <div className="invoiceDetailsActions">
          <button type="button" className="invoiceDetailsPrint" onClick={()=>printTodayInvoice(invoiceDetailsSale)}><Printer size={17}/> طباعة الفاتورة</button>
          <button type="button" className="invoiceDetailsClose" onClick={()=>setInvoiceDetailsSale(null)}>إغلاق</button>
        </div>
      </div>
    </div>, document.body)}

    {customerModalOpen && <div className="customerOverlay" role="dialog" aria-modal="true" aria-labelledby="customerDialogTitle" onMouseDown={e => { if (e.target === e.currentTarget) setCustomerModalOpen(false); }}>
      <div className="customerModal customerSelectorModal">
        <button className="customerModalClose" onClick={() => setCustomerModalOpen(false)} aria-label="إغلاق"><X size={20} /></button>

        <div className="customerModalHeader">
          <span className="customerModalIcon"><UserRound size={22} /></span>
          <h3 id="customerDialogTitle">اختيار العميل</h3>
        </div>

        <div className="customerSearchBox">
          <Search size={18} />
          <input
            autoFocus
            value={customerSearch}
            onChange={e => {
              setCustomerSearch(e.target.value);
              setNewCustomerName(e.target.value);
            }}
            placeholder="ابحث عن اسم العميل أو اكتب اسمًا جديدًا..."
          />
          {customerSearch && (
            <button type="button" onClick={() => { setCustomerSearch(""); setNewCustomerName(""); }} aria-label="مسح البحث">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="customerList">
          {filteredCustomers.map(c => (
            <button
              type="button"
              className={`customerOption ${customer === c.name ? "active" : ""}`}
              key={c.id || c.name}
              onClick={() => selectCustomer(c.name, c.id)}
            >
              <UserRound size={18} />
              <span>{c.name}</span>
              {customer === c.name && <CheckCircle2 size={18} />}
            </button>
          ))}

          {!filteredCustomers.length && customerSearch.trim() && (
            <div className="customerNoResult">
              لا يوجد عميل بهذا الاسم. يمكنك حفظه مباشرة.
            </div>
          )}
        </div>

        <form onSubmit={saveAndSelectCustomer}>
          <div className="customerModalActions">
            <button type="button" className="customerCancelBtn" onClick={() => setCustomerModalOpen(false)}>
              إلغاء
            </button>
            <button type="submit" className="customerSaveBtn" disabled={!customerSearch.trim()}>
              <Save size={16} /> حفظ واختيار العميل
            </button>
          </div>
        </form>
      </div>
    </div>}

  </div>;
}