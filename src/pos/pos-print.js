import { api, apiEnabled } from "../api-client.js";
import { esc, formatInvoiceNumber, money, normalizeInvoiceForDisplay, code128Data } from "./pos-utils.js";

export function buildInvoiceHtml(sale, printSettings = {}, storeSettings = {}) {
  sale = normalizeInvoiceForDisplay(sale);
  const ps = {
    showLogo:true, showInvoice:true, showDate:true, showEmployee:true, showItems:true,
    showDiscount:true, showPaid:true, showChange:true,
    shopName:"كل شيء بالمعقول", shopSubtitle:"نقطة بيع", address:"", phone:"",
    footer:"شكراً لتسوقكم معنا\nنتمنى لكم يوماً سعيداً", logo:"",
    barcodeEnabled:true, barcodeText:"رقم الفاتورة",
    paper:"58mm", ...printSettings
  };
  const ss = { store_name: ps.shopName || "كل شيء بالمعقول", address: ps.address || "", phone: ps.phone || "", ...storeSettings };
  const items = (sale.items || []).map(i => `
    <tr><td>${esc(i.name || "سلعة")}</td><td>${Number(i.quantity || 1)}</td><td>${money(i.price)}</td><td>${money((Number(i.price) || 0) * (Number(i.quantity) || 1))}</td></tr>`).join("");
  const d = new Date(sale.createdAt);
  const paper = ps.paper === "A4" ? "210mm auto" : ps.paper === "80mm" ? "80mm auto" : "58mm auto";
  const bodyWidth = ps.paper === "A4" ? "200mm" : ps.paper === "80mm" ? "74mm" : "52mm";
  const invoiceNumber = formatInvoiceNumber(sale.invoice);
  const barcodeData = code128Data(invoiceNumber);
  const barcode = ps.barcodeEnabled ? `<div class="codeBox"><svg class="barcodeSvg" viewBox="0 0 ${barcodeData.width} 82" preserveAspectRatio="xMidYMid meet" role="img" aria-label="باركود الفاتورة" shape-rendering="crispEdges"><rect class="barcodeBg" width="${barcodeData.width}" height="82"/>${barcodeData.bars.map(b => `<rect class="barcodeBar" x="${b.x}" y="3" width="${b.width}" height="72"/>`).join("")}</svg></div>` : "";
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    @page{size:${paper};margin:0}*{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Tahoma,sans-serif}
    body{width:${bodyWidth};margin:0 auto;padding:${ps.paper === "A4" ? "4mm 3mm" : "3mm 2.5mm"};font-size:${ps.paper === "A4" ? "11px" : "8.5px"}}
    .receipt{width:100%;text-align:right}.top{text-align:center}.logo{width:42px;height:42px;margin:0 auto 6px;border-radius:8px;background:#6f2bd9;color:#fff;display:grid;place-items:center;font-size:22px;font-weight:900}.logo img{max-width:40px;max-height:40px;object-fit:contain}.store{font-size:${ps.paper === "A4" ? "18px" : "15px"};font-weight:800}.pos{font-size:${ps.paper === "A4" ? "11px" : "8px"};font-weight:700;margin-top:2px}.address,.phone{font-size:${ps.paper === "A4" ? "9px" : "7px"};line-height:1.5;margin-top:4px}.dash{border-top:1px dashed #111;margin:5px 0}.meta{font-size:${ps.paper === "A4" ? "9px" : "7.5px"};line-height:1.45}.meta b{font-size:${ps.paper === "A4" ? "10px" : "8px"}}.table{width:100%;border-collapse:collapse;font-size:${ps.paper === "A4" ? "11px" : "7.5px"}}.table th,.table td{padding:${ps.paper === "A4" ? "4px 1px" : "2.5px 1px"};text-align:right;vertical-align:top}.table th{border-bottom:1px solid #111}.table th:nth-child(n+2),.table td:nth-child(n+2){text-align:center}.paymentSummary{margin:3px 0}.totalLine{display:flex;justify-content:space-between;align-items:center;font-size:${ps.paper === "A4" ? "10px" : "8px"};margin:2.5px 0}.totalLine b{font-weight:800}.final{font-size:${ps.paper === "A4" ? "13px" : "10px"};font-weight:900}.thanks{text-align:center;font-size:${ps.paper === "A4" ? "9px" : "7.5px"};line-height:1.5;margin-top:8px;color:#4b5563}.codes{display:flex;justify-content:center;align-items:center;margin-top:9px;padding-top:8px;border-top:1px dashed #c7cdd4}.codeBox{text-align:center;width:100%;min-width:0}.barcodeSvg{display:block;height:${ps.paper === "A4" ? "72px" : "64px"};width:${ps.paper === "A4" ? "180mm" : ps.paper === "80mm" ? "68mm" : "48mm"};max-width:100%;margin:0 auto;background:#fff;shape-rendering:crispEdges}@media print{body{width:${bodyWidth};padding:5mm 3mm}}
  .barcodeSvg .barcodeBg{fill:#fff}.barcodeSvg .barcodeBar{fill:#000}</style></head><body><div class="receipt">
    <div class="top">${ps.showLogo ? `<div class="logo">${ps.logo && /^data:image\/(png|jpeg|webp);base64,/i.test(ps.logo) ? `<img src="${esc(ps.logo)}" alt="شعار"/>` : `▰`}</div>` : ""}
      <div class="store">${esc(ss.store_name || ps.shopName)}</div><div class="pos">نقطة بيع</div>
      ${ss.address ? `<div class="address">${esc(ss.address).replace(/\n/g,"<br>")}</div>` : ""}${ss.phone ? `<div class="phone">☎ ${esc(ss.phone)}</div>` : ""}
    </div><div class="dash"></div><div class="meta">
      ${ps.showInvoice ? `<div>رقم الفاتورة: <b>${esc(invoiceNumber)}</b></div>` : ""}
      ${ps.showDate ? `<div>التاريخ: ${d.toLocaleDateString("ar-DZ")}</div>` : ""}
      ${!sale.isDefaultCustomer ? `<div>اسم العميل: <b>${esc(sale.customer)}</b></div>` : ""}
    </div>
    ${ps.showItems ? `<div class="dash"></div><table class="table"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table>` : ""}
    <div class="dash"></div><div class="paymentSummary">
      <div class="totalLine"><span>المجموع</span><b>${money(sale.subtotal)} دج</b></div>
      ${!sale.isDefaultCustomer && ps.showDiscount ? `<div class="totalLine"><span>الخصم</span><b>${money(sale.discount)} دج</b></div>` : ""}
      ${!sale.isDefaultCustomer ? `<div class="totalLine"><span>بعد الخصم</span><b>${money(sale.total)} دج</b></div>` : ""}
      ${ps.showPaid ? `<div class="totalLine"><span>المدفوع</span><b>${money(sale.paid)} دج</b></div>` : ""}
      ${ps.showChange ? `<div class="totalLine final"><span>المتبقي من الفاتورة</span><b>${money(sale.remaining)} دج</b></div>` : ""}
      ${!sale.isDefaultCustomer ? `<div class="dash"></div><div class="totalLine"><span>الدين السابق</span><b>${money(sale.customerPreviousDebt)} دج</b></div><div class="totalLine final"><span>إجمالي الدين على العميل</span><b>${money(sale.customerTotalDebt)} دج</b></div>` : ""}
    </div><div class="dash"></div><div class="thanks">${String(ps.footer || "").replace(/\n/g,"<br>")}<br><span class="heart">♡</span></div>
    ${barcode ? `<div class="codes">${barcode}</div>` : ""}
  </div></body></html>`;
}

export async function printInvoice(sale) {
  if (!window.desktopAPI?.printHtml) throw new Error("خدمة الطباعة في Desktop غير متاحة");
  let printer = "";
  let printSettings = {};
  let storeSettings = {};
  try {
    if (apiEnabled()) {
      const cfg = await api('/settings');
      printSettings = cfg?.print || {};
      storeSettings = cfg?.store || {};
      printer = printSettings.printer || "";
    }
  } catch {}
  if (window.desktopAPI?.getPrinters) {
    const list = await window.desktopAPI.getPrinters();
    if (!Array.isArray(list) || !list.length) throw new Error('لم يتم العثور على أي طابعة مثبتة في Windows.');
    // Keep the manually selected printer whenever it is connected.
    // Only fall back to the Windows default/first printer when that saved printer is unavailable.
    if (printer && printer !== '__AUTO__' && !list.some(p => p.name === printer)) {
      printer = list.find(p => p.isDefault)?.name || list[0]?.name || '__AUTO__';
    }
    if (!printer || printer === '__AUTO__') {
      printer = list.find(p => p.isDefault)?.name || list[0]?.name || '__AUTO__';
    }
  } else {
    printer = printer || '__AUTO__';
  }

  const copies = Math.max(1, Number(printSettings.copies || 1));
  const result = await window.desktopAPI.printHtml({ html: buildInvoiceHtml(sale, printSettings, storeSettings), deviceName: printer, copies, paper: printSettings.paper || "58mm" });
  if (!result?.ok) throw new Error(result?.error || "تعذرت طباعة الفاتورة");
  return result;
}



