import React from "react";
import { Barcode, Edit3, Package, Save, X } from "lucide-react";
import { money } from "../pos-utils.js";

export default function BarcodeModal({
  open,
  inputRef,
  value,
  product,
  editMode,
  editForm,
  onChange,
  onKeyDown,
  onClose,
  onOpenEdit,
  onSaveEdit,
  onCancelEdit,
  onEditFormChange,
}) {
  if (!open) return null;
  return (
    <div className="barcodeOverlay" role="dialog" aria-modal="true" aria-labelledby="barcodeDialogTitle"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="barcodeModal">
        <button className="barcodeModalClose" onClick={onClose} aria-label="إغلاق"><X size={23} /></button>
        <div className="barcodeModalHeader">
          <span className="barcodeModalIcon"><Barcode size={28} /></span>
          <div><h2 id="barcodeDialogTitle">البحث بالباركود</h2><p>أدخل أو امسح رمز السلعة بالماسح</p></div>
        </div>
        <div className="barcodeModalSearch">
          <Barcode size={22} />
          <input ref={inputRef} value={value} onChange={onChange} onKeyDown={onKeyDown}
            placeholder="امسح الباركود هنا..." autoComplete="off" inputMode="numeric" />
        </div>
        {!product && <div className="barcodeModalHint"><Package size={38} /><strong>بانتظار قراءة الباركود</strong><span>بعد القراءة ستظهر بيانات السلعة هنا</span></div>}
        {product && !editMode && <div className="barcodeProductCard">
          <div className="barcodeProductIcon"><Package size={34} /></div>
          <div className="barcodeProductInfo">
            <h3>{product.name}</h3><span>الباركود: {product.barcode}</span>
            <div className="barcodeProductMeta"><b>{money(product.price)} دج</b><span>المخزون: {product.stock}</span><span>{product.category || "بدون تصنيف"}</span></div>
          </div>
          <button className="barcodeEditBtn" onClick={onOpenEdit}><Edit3 size={18} /> تعديل السلعة</button>
        </div>}
        {product && editMode && <form className="barcodeEditForm" onSubmit={onSaveEdit}>
          <div className="barcodeEditTitle"><Edit3 size={20} /><strong>تعديل السلعة</strong></div>
          <div className="barcodeEditGrid">
            <label>اسم السلعة<input required value={editForm.name} onChange={e => onEditFormChange({ ...editForm, name: e.target.value })} /></label>
            <label>الباركود<input value={editForm.barcode} onChange={e => onEditFormChange({ ...editForm, barcode: e.target.value })} /></label>
            <label>التصنيف<input value={editForm.category} onChange={e => onEditFormChange({ ...editForm, category: e.target.value })} /></label>
            <label>الوحدة<input value={editForm.unit} onChange={e => onEditFormChange({ ...editForm, unit: e.target.value })} /></label>
            <label>سعر الشراء<input type="number" min="0" value={editForm.purchase} onChange={e => onEditFormChange({ ...editForm, purchase: e.target.value })} /></label>
            <label>سعر البيع<input required type="number" min="0" value={editForm.price} onChange={e => onEditFormChange({ ...editForm, price: e.target.value })} /></label>
            <label>الكمية الحالية<input type="number" min="0" value={editForm.stock} onChange={e => onEditFormChange({ ...editForm, stock: e.target.value })} /></label>
            <label>الحد الأدنى<input type="number" min="0" value={editForm.min} onChange={e => onEditFormChange({ ...editForm, min: e.target.value })} /></label>
          </div>
          <div className="barcodeEditActions">
            <button type="button" className="barcodeCancelEdit" onClick={onCancelEdit}>إلغاء</button>
            <button type="submit" className="barcodeSaveEdit"><Save size={18} /> حفظ التعديل</button>
          </div>
        </form>}
      </div>
    </div>
  );
}
