import React, { useMemo, useState } from "react";
import { Copy, Printer, Search, ScanBarcode } from "lucide-react";
import "./barcode.css";

const products = [
  { id: 1, name: "حجاب نسائي", barcode: "622100000001", price: 400 },
  { id: 2, name: "فندروب", barcode: "622100000002", price: 950 },
  { id: 3, name: "علبة تخزين", barcode: "622100000003", price: 300 },
  { id: 4, name: "مناديل مبللة", barcode: "622100000004", price: 140 }
];

const patterns = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","114131","311141","411131","211412","211214","211232","2331112"];

function code128Values(text) {
  const values = Array.from(text).map(ch => ch.charCodeAt(0) - 32);
  let checksum = 104;
  values.forEach((value, index) => { checksum += value * (index + 1); });
  return [104, ...values, checksum % 103, 106];
}

function BarcodeSvg({ value }) {
  const codes = code128Values(value);
  let x = 8;
  const bars = [];
  codes.forEach((code, codeIndex) => {
    const pattern = patterns[code] || patterns[0];
    let black = true;
    for (const char of pattern) {
      const width = Number(char) * 2;
      if (black) bars.push(<rect key={`${codeIndex}-${x}`} x={x} y="8" width={width} height="72" />);
      x += width;
      black = !black;
    }
  });
  return <svg className="barcodeSvg" viewBox={`0 0 ${x + 8} 104`} role="img" aria-label={`باركود ${value}`}>
    <rect width="100%" height="100%" fill="white" />
    {bars}
    <text x={(x + 8) / 2} y="98" textAnchor="middle">{value}</text>
  </svg>;
}

export default function BarcodeView() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(products[0].id);
  const filtered = useMemo(() => products.filter(p => `${p.name} ${p.barcode}`.includes(query.trim())), [query]);
  const selected = products.find(p => p.id === selectedId) || filtered[0] || products[0];
  const copy = async () => { try { await navigator.clipboard.writeText(selected.barcode); } catch {} };

  return <div className="barcodeView" dir="rtl">
    <div className="barcodeHeader"><div><h1><ScanBarcode /> الباركود</h1><p>عرض وإدارة وطباعة باركود السلع</p></div></div>
    <div className="barcodeLayout">
      <section className="barcodePanel">
        <div className="barcodePanelHead"><h2>اختيار السلعة</h2><div className="barcodeCount">{filtered.length} سلع</div></div>
        <div className="barcodeSearch"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الباركود..."/></div>
        <div className="barcodeProducts">{filtered.map(product => <button className={product.id === selected.id ? "barcodeProduct active" : "barcodeProduct"} key={product.id} onClick={() => setSelectedId(product.id)}><span><strong>{product.name}</strong><small>{product.barcode}</small></span><b>{product.price.toFixed(2)} دج</b></button>)}</div>
      </section>
      <section className="barcodePanel previewPanel">
        <div className="barcodePanelHead"><h2>معاينة الباركود</h2><div className="barcodeActions"><button onClick={copy} title="نسخ الباركود"><Copy size={17}/> نسخ</button><button onClick={() => window.print()} className="primaryAction" title="طباعة الباركود"><Printer size={17}/> طباعة</button></div></div>
        <div className="barcodeCard" id="print-barcode">
          <div className="printShopName">كل شيء بالمعقول</div>
          <strong className="printProductName">{selected.name}</strong>
          <BarcodeSvg value={selected.barcode}/>
          <div className="barcodePrice">{selected.price.toFixed(2)} دج</div>
        </div>
        <p className="barcodeHint">زر «طباعة» يفتح طباعة الملصق فقط، مع اسم المحل والسلعة والباركود والسعر.</p>
      </section>
    </div>
  </div>;
}
