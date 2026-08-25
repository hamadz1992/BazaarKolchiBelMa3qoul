import React from "react";
import { code128Data, formatInvoiceNumber, money, normalizeInvoiceForDisplay } from "../pos-utils.js";
import "./invoice-receipt-preview.css";

export default function InvoiceReceiptPreview({ sale = {}, printSettings = {}, storeSettings = {} }) {
  const s = normalizeInvoiceForDisplay(sale);
  const ps = {
    showLogo:true, showInvoice:true, showDate:true, showEmployee:true, showItems:true,
    showDiscount:true, showPaid:true, showChange:true,
    shopName:"كل شيء بالمعقول", shopSubtitle:"نقطة بيع", address:"", phone:"",
    footer:"شكراً لتسوقكم معنا\nنتمنى لكم يوماً سعيداً", logo:"",
    barcodeEnabled:true, barcodeText:"رقم الفاتورة", paper:"58mm",
    ...printSettings
  };
  const shopName = storeSettings.store_name || ps.shopName || "كل شيء بالمعقول";
  const address = storeSettings.address || ps.address || "";
  const phone = storeSettings.phone || ps.phone || "";
  const date = new Date(s.createdAt);
  const invoiceNumber = formatInvoiceNumber(s.invoice);
  const barcode = code128Data(invoiceNumber);
  const customer = !s.isDefaultCustomer ? s.customer : null;
  const paperClass = ps.paper === "A4" ? "receiptA4" : ps.paper === "80mm" ? "receipt80" : "receipt58";

  return (
    <div className={`receiptPreview ${paperClass}`} dir="rtl">
      <div className="rpTop">
        {ps.showLogo && <div className="rpLogo">
          {ps.logo && /^data:image\/(png|jpeg|webp);base64,/i.test(ps.logo) ? <img src={ps.logo} alt="شعار المحل" /> : <span>▰</span>}
        </div>}
        <div className="rpStore">{shopName}</div>
        <div className="rpPos">{ps.shopSubtitle || "نقطة بيع"}</div>
        {address && <div className="rpSmall">{address}</div>}
        {phone && <div className="rpSmall">☎ {phone}</div>}
      </div>

      <div className="rpDash" />
      <div className="rpMeta">
        {ps.showInvoice && <div>رقم الفاتورة: <b>{invoiceNumber}</b></div>}
        {ps.showDate && <div>التاريخ: {date.toLocaleDateString("ar-DZ")}</div>}
        {customer && <div>اسم العميل: <b>{customer}</b></div>}
      </div>

      {ps.showItems && (
        <>
          <div className="rpDash" />
          <div className="rpTable">
            <div className="rpRow rpHead"><span>المنتج</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span></div>
            {(s.items || []).map((item, idx) => (
              <div className="rpRow" key={item.id || idx}>
                <span className="rpName">{item.name || "سلعة"}</span>
                <span>{Number(item.quantity || 1)}</span>
                <span>{money(item.price ?? item.unit_price)} دج</span>
                <span>{money((Number(item.price ?? item.unit_price) || 0) * (Number(item.quantity) || 1))} دج</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="rpDash" />
      <div className="rpTotals">
        <div><span>المجموع</span><b>{money(s.subtotal)} دج</b></div>
        {!s.isDefaultCustomer && ps.showDiscount && <div><span>الخصم</span><b>{money(s.discount)} دج</b></div>}
        {!s.isDefaultCustomer && <div><span>بعد الخصم</span><b>{money(s.total)} دج</b></div>}
        {ps.showPaid && <div><span>المدفوع</span><b>{money(s.paid)} دج</b></div>}
        {ps.showChange && <div className="rpFinal"><span>المتبقي من الفاتورة</span><b>{money(s.remaining)} دج</b></div>}
        {!s.isDefaultCustomer && <>
          <div className="rpDebtSep"><span>الدين السابق</span><b>{money(s.customerPreviousDebt)} دج</b></div>
          
          <div className="rpFinal"><span>إجمالي الدين على العميل</span><b>{money(s.customerTotalDebt)} دج</b></div>
        </>}
      </div>

      <div className="rpDash" />
      <div className="rpThanks">{String(ps.footer || "").split("\n").map((x,i)=><React.Fragment key={i}>{x}{i < String(ps.footer || "").split("\n").length-1 ? <br/> : null}</React.Fragment>)}<div>♡</div></div>

      {ps.barcodeEnabled && barcode.width > 0 && (
        <div className="rpBarcodeBox">
          <svg className="rpBarcode" viewBox={`0 0 ${barcode.width} 82`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="باركود الفاتورة" shapeRendering="crispEdges">
            <rect className="rpBarcodeBg" width={barcode.width} height="82" />
            {barcode.bars.map((b, idx) => <rect className="rpBarcodeBar" key={`${b.x}-${idx}`} x={b.x} y="4" width={b.width} height="70" />)}
          </svg>
        </div>
      )}
    </div>
  );
}
