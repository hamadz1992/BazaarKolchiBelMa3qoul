// Barcode input normalization shared by POS, Products and Barcode screens.
// Some French AZERTY scanners send the symbols printed on the number row
// instead of the digits (for example & é " ' ( - è _ ç à).
const AZERTY_DIGIT_MAP = Object.freeze({
  '&': '1',
  'é': '2',
  '"': '3',
  "'": '4',
  '(': '5',
  '-': '6',
  'è': '7',
  '_': '8',
  'ç': '9',
  'à': '0',
});

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeBarcode(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[٠-٩]/g, ch => String(ARABIC_DIGITS.indexOf(ch)))
    .replace(/[۰-۹]/g, ch => String(PERSIAN_DIGITS.indexOf(ch)))
    .split('')
    .map(ch => AZERTY_DIGIT_MAP[ch] ?? ch)
    .join('')
    .replace(/[\s\u00A0]+/g, '')
    .toUpperCase();
}

export function normalizeBarcodeDigits(value) {
  const normalized = normalizeBarcode(value);
  return normalized.replace(/[^0-9]/g, '');
}

export function normalizeBarcodeInput(value) {
  const raw = String(value ?? '');
  const normalized = normalizeBarcode(raw);

  // For scanner-style input, show the corrected digits immediately in the field.
  // If the value contains letters or other barcode characters (e.g. Code 128),
  // preserve those characters while still correcting AZERTY digits.
  return normalized;
}

export function isLikelyScannerBarcode(value) {
  const raw = String(value ?? '');
  if (!raw) return false;
  const compact = raw.replace(/[\s\u00A0]+/g, '');
  return /^[0-9٠-٩۰-۹&é"'()\-è_çà=]+$/.test(compact);
}
