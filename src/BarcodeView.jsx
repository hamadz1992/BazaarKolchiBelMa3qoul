import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Printer, Search, ScanBarcode } from "lucide-react";
import "./barcode.css";
import { api, apiEnabled } from "./api-client.js";



const patterns = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","114131","311141","411131","211412","211214","211232","2331112"];

const EAN_L = [
  "0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"
];
const EAN_G = [
  "0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"
];
const EAN_R = [
  "1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"
];
const EAN_PARITY = [
  "LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"
];
const EAN8_PARITY = "LLLLLL";
const CODE128_PATTERNS = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

function normalizeBarcode(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 0x06F0))
    .trim()
    .toUpperCase();
}

function numericBarcode(value) {
  const clean = normalizeBarcode(value).replace(/\s+/g, "");
  return /^\d+$/.test(clean) ? clean : null;
}

function isValidCheckDigit(digits) {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return sum % 10 === 0;
}

function ean13Bits(ean) {
  const first = Number(ean[0]);
  const parity = EAN_PARITY[first];
  return `101${ean.slice(1, 7).split("").map((d, i) => parity[i] === "L" ? EAN_L[Number(d)] : EAN_G[Number(d)]).join("")}01010${ean.slice(7).split("").map(d => EAN_R[Number(d)]).join("")}101`;
}

function ean8Bits(ean) {
  const left = ean.slice(0, 4).split("").map(d => EAN_L[Number(d)]).join("");
  const right = ean.slice(4).split("").map(d => EAN_R[Number(d)]).join("");
  return `101${left}01010${right}101`;
}

function upcABits(upc) {
  const ean13 = `0${upc}`;
  return ean13Bits(ean13);
}

function normalizeStandardBarcode(value) {
  const numeric = numericBarcode(value);
  if (!numeric) return null;
  if (numeric.length === 8 && isValidCheckDigit(numeric)) return { kind: "EAN8", value: numeric, bits: ean8Bits(numeric) };
  if (numeric.length === 12 && isValidCheckDigit(numeric)) return { kind: "UPC-A", value: numeric, bits: upcABits(numeric) };
  if (numeric.length === 13 && isValidCheckDigit(numeric)) return { kind: "EAN13", value: numeric, bits: ean13Bits(numeric) };
  return null;
}

function code128Values(text) {
  const clean = normalizeBarcode(text);
  if (!clean || !/^[\x20-\x7E]+$/.test(clean)) return null;
  const values = Array.from(clean).map(ch => ch.charCodeAt(0) - 32);
  let checksum = 104;
  values.forEach((value, index) => { checksum += value * (index + 1); });
  return [104, ...values, checksum % 103, 106];
}

function BarcodeSvg({ value }) {
  const standard = normalizeStandardBarcode(value);
  const label = normalizeBarcode(value);
  if (standard) {
    const isEan13 = standard.kind === "EAN13";
    const isUpc = standard.kind === "UPC-A";
    const bits = standard.bits;
    const barWidth = 2;
    const quiet = 12;
    const width = bits.length * barWidth + quiet * 2;
    const guardStart = isEan13 ? [0, 48, bits.length - 3] : [0, 31, bits.length - 3];
    const bars = Array.from(bits).map((bit, i) => {
      if (bit !== "1") return null;
      const inGuard = guardStart.includes(i) || (i >= guardStart[1] && i < guardStart[1] + 5);
      return <rect key={i} x={quiet + i * barWidth} y={inGuard ? 8 : 12} width={barWidth} height={inGuard ? 82 : 72} />;
    });
    return <svg className={`barcodeSvg barcodeSvg${standard.kind.replace(/[^A-Za-z0-9]/g, "")}`} viewBox={`0 0 ${width} 108`} role="img" aria-label={`باركود ${label}`} preserveAspectRatio="xMidYMid meet">
      <rect width={width} height="108" fill="#fff" />
      <g fill="#111">{bars}</g>
      <text x="50%" y="103" textAnchor="middle" className="barcodeHumanText">
        {isEan13 ? `${label[0]} ${label.slice(1, 7)} ${label.slice(7)}` : isUpc ? `${label.slice(0, 1)} ${label.slice(1, 11)} ${label.slice(11)}` : `${label.slice(0, 4)} ${label.slice(4)}`}
      </text>
    </svg>;
  }

  const codes = code128Values(label);
  if (!codes) {
    return <div className="barcodeInvalid" role="status">الباركود غير صالح للطباعة — استخدم أرقامًا أو حروفًا إنجليزية فقط.</div>;
  }
  let x = 10;
  const bars = [];
  codes.forEach((code, codeIndex) => {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    let black = true;
    for (const char of pattern) {
      const width = Number(char) * 2;
      if (black) bars.push(<rect key={`${codeIndex}-${x}`} x={x} y="8" width={width} height="74" />);
      x += width;
      black = !black;
    }
  });
  return <svg className="barcodeSvg barcodeSvgCode128" viewBox={`0 0 ${x + 10} 108`} role="img" aria-label={`باركود ${label}`} preserveAspectRatio="xMidYMid meet">
    <rect width="100%" height="108" fill="#fff" />
    <g fill="#111">{bars}</g>
    <text x="50%" y="103" textAnchor="middle" className="barcodeHumanText">{label}</text>
  </svg>;
}

export default function BarcodeView() {
  const remote = apiEnabled();
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shopName, setShopName] = useState("كل شيء بالمعقول");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      if (!remote) return;
      try {
        const result = await api("/settings");
        const name = result?.data?.store?.store_name || result?.data?.store?.shop_name;
        if (active && name) setShopName(name);
      } catch {}
    };
    loadSettings();
    return () => { active = false; };
  }, [remote]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!remote) return;
      setLoading(true);
      try {
        const rows = await api("/products");
        if (!active) return;
        const normalized = rows.map(p => ({
          id: p.id,
          name: p.name || "",
          barcode: p.barcode || "",
          price: Number(p.sale_price || 0)
        }));
        setProducts(normalized);
        setSelectedId(prev => normalized.some(p => p.id === prev) ? prev : (normalized[0]?.id ?? null));
      } catch {}
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [remote]);

  const normalizedQuery = normalizeBarcode(query);
  const filtered = useMemo(() => {
    const q = normalizedQuery.replace(/\s+/g, "");
    return products.filter(p => {
      const name = normalizeBarcode(p.name);
      const barcode = normalizeBarcode(p.barcode).replace(/\s+/g, "");
      return !q || name.includes(q) || barcode.includes(q);
    });
  }, [products, normalizedQuery]);
  const selected = products.find(p => p.id === selectedId) || filtered[0] || products[0] || { name: "—", barcode: "", price: 0 };
  const exactMatch = products.find(p => normalizeBarcode(p.barcode).replace(/\s+/g, "") === normalizedQuery.replace(/\s+/g, ""));

  useEffect(() => {
    if (exactMatch) setSelectedId(exactMatch.id);
  }, [exactMatch?.id]);

  const copy = async () => { try { await navigator.clipboard.writeText(selected.barcode || ""); setMessage("تم نسخ الباركود"); setTimeout(() => setMessage(""), 1400); } catch {} };
  const handleSearchKeyDown = e => {
    if (e.key !== "Enter") return;
    const exact = products.find(p => normalizeBarcode(p.barcode).replace(/\s+/g, "") === normalizedQuery.replace(/\s+/g, ""));
    if (exact) { setSelectedId(exact.id); setMessage("تم اختيار السلعة"); setTimeout(() => setMessage(""), 1000); return; }
    if (filtered.length === 1) { setSelectedId(filtered[0].id); setMessage("تم اختيار السلعة"); setTimeout(() => setMessage(""), 1000); }
  };

  return <div className="barcodeView" dir="rtl">
    <div className="barcodeHeader">
      <div className="barcodeTitleRow">
        <button className="backToProducts" onClick={() => window.dispatchEvent(new CustomEvent("app:navigate", { detail: { key: "products" } }))}>
          <ArrowRight size={17}/> العودة إلى السلع
        </button>
        <div><h1><ScanBarcode /> الباركود</h1><p>باركود موحد وقابل للطباعة والمسح للسلع</p></div>
      </div>
    </div>
    <div className="barcodeLayout">
      <section className="barcodePanel">
        <div className="barcodePanelHead"><h2>اختيار السلعة</h2><div className="barcodeCount">{loading ? "جاري التحميل..." : `${filtered.length} سلع`}</div></div>
        <div className="barcodeSearch"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="ابحث باسم السلعة أو امسح الباركود..." aria-label="البحث بالاسم أو الباركود" autoComplete="off"/></div>
        <div className="barcodeSearchHint">يمكن إدخال الباركود يدويًا أو استخدام قارئ الباركود. اضغط Enter لاختيار النتيجة المطابقة.</div>
        <div className="barcodeProducts">{filtered.map(product => <button className={product.id === selected.id ? "barcodeProduct active" : "barcodeProduct"} key={product.id} onClick={() => setSelectedId(product.id)}><span><strong>{product.name}</strong><small>{product.barcode || "بدون باركود"}</small></span><b>{product.price.toFixed(2)} دج</b></button>)}</div>
        {!filtered.length && <div className="barcodeEmpty">لا توجد سلع مطابقة للبحث.</div>}
      </section>
      <section className="barcodePanel previewPanel">
        <div className="barcodePanelHead"><div><h2>معاينة الملصق</h2><small className="barcodeMeta">{normalizeStandardBarcode(selected.barcode)?.kind || "Code 128"}</small></div><div className="barcodeActions"><button onClick={copy} title="نسخ الباركود"><Copy size={17}/> نسخ</button><button onClick={() => window.print()} className="primaryAction" title="طباعة الباركود"><Printer size={17}/> طباعة</button></div></div>
        <div className="barcodeCard" id="print-barcode">
          <div className="printShopName">{shopName}</div>
          <strong className="printProductName">{selected.name}</strong>
          <BarcodeSvg value={selected.barcode || ""}/>
          <div className="barcodePrice">{selected.price.toFixed(2)} دج</div>
        </div>
        {message && <div className="barcodeToast">{message}</div>}
        <p className="barcodeHint">المحرك يختار معيار EAN/UPC عندما يكون الباركود صالحًا، وإلا يستخدم Code 128 للرموز النصية.</p>
      </section>
    </div>
  </div>;
}
