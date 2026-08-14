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

window.addEventListener("input", event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.placeholder !== "امسح الباركود هنا...") return;

  const normalized = normalizeScannerValue(input.value);
  if (normalized === input.value) return;

  input.value = normalized;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, true);
