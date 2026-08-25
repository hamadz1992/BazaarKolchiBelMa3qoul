const AZERTY_BARCODE_MAP = {
  "&": "1", "é": "2", "\"": "3", "'": "4", "(": "5",
  "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0"
};

const normalizeScannerValue = value => String(value ?? "")
  .replace(/[٠-٩]/g, ch => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
  .replace(/[۰-۹]/g, ch => String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
  .replace(/[&é"'(-è_çà]/g, ch => AZERTY_BARCODE_MAP[ch] || ch)
  .replace(/\s+/g, "")
  .replace(/[^0-9]/g, "");

const isBarcodeInput = input => input?.matches?.(
  ".posSearch input, .barcodeModalSearch input, .barcodeSearch input, " +
  ".productsToolbar .searchBox input, .inventorySearch input, .salesToolbar .searchBox input, " +
  ".productModal .barcodeField"
);
const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

window.addEventListener("input", event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !isBarcodeInput(input) || !nativeValueSetter) return;

  const value = String(input.value ?? "");
  if (!/[&é"'(-è_çà٠-٩۰-۹]/.test(value)) return;

  const normalized = normalizeScannerValue(value);
  if (normalized === value) return;

  nativeValueSetter.call(input, normalized);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, true);
