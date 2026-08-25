export const money = n => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

export function formatInvoiceNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return String(value ?? "");
  return digits.slice(-6).padStart(6, "0");
}
export const esc = v => String(v ?? "").replace(/[&<>\"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
export const favoriteKey = p => String(p.id);
export const normalizeBarcode = value => String(value ?? "")
  .replace(/[٠-٩]/g, ch => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
  .replace(/[۰-۹]/g, ch => String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
  .replace(/[&é"'(-è_çà]/g, ch => ({ "&": "1", "é": "2", "\"": "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0" }[ch] || ch))
  .replace(/\s+/g, "")
  .replace(/[^0-9]/g, "");

export function normalizeInvoiceForDisplay(sale = {}) {
  const subtotalRaw = sale.subtotal;
  const total = Number(sale.total ?? 0);
  const subtotal = Number(subtotalRaw ?? total);
  const discount = Number(sale.discount ?? Math.max(0, subtotal - total));
  const paid = Number(sale.paid ?? 0);
  const change = Math.max(0, paid - total);
  const remaining = Math.max(0, total - paid);
  const customerName = sale.customer_name || sale.customer?.name || sale.customer || "زبون";
  const isDefaultCustomer = Boolean(
    sale.customer_is_default ?? sale.customerIsDefault ?? sale.is_default_customer ?? sale.isDefaultCustomer ??
    (customerName === "زبون" || customerName === "زبون نقدي")
  );
  return { ...sale, invoice: sale.invoice_number || sale.invoice || "", createdAt: sale.created_at || sale.createdAt || new Date().toISOString(), customer: customerName, isDefaultCustomer, customerPreviousDebt: Number(sale.customer_previous_debt ?? sale.customerPreviousDebt ?? 0), customerInvoiceDebt: Number(sale.customer_invoice_debt ?? sale.customerInvoiceDebt ?? remaining), customerDebtPaidFromOverpayment: Number(sale.customer_debt_paid_from_overpayment ?? sale.customerDebtPaidFromOverpayment ?? 0), customerTotalDebt: Number(sale.customer_total_debt ?? sale.customerTotalDebt ?? 0), subtotal, discount, total, paid, change, remaining };
}

export const emptyBarcodeEdit = { name: "", barcode: "", category: "", unit: "قطعة", purchase: "", price: "", stock: "", min: "" };


const EAN13_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN13_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN13_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const EAN13_PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

const CODE128_PATTERNS = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

export function code128Data(value = "") {
  // Code 128-C for numeric invoice numbers. Encoding two digits per symbol
  // makes the barcode shorter and significantly easier for handheld scanners
  // to read from thermal/phone-generated receipts.
  const clean = String(value ?? "").replace(/\D/g, "");
  if (!clean) return { bars: [], width: 0, text: "" };
  const digits = clean.length % 2 ? `0${clean}` : clean;
  const values = [];
  for (let i = 0; i < digits.length; i += 2) values.push(Number(digits.slice(i, i + 2)));
  let checksum = 105; // Start C
  values.forEach((v, i) => { checksum += v * (i + 1); });
  const codes = [105, ...values, checksum % 103, 106];
  const quiet = 12;
  const moduleWidth = 2;
  let x = quiet * moduleWidth;
  const bars = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;
    let black = true;
    for (const width of pattern) {
      const w = Number(width) * moduleWidth;
      if (black && w > 0) bars.push({ x, width: w });
      x += w;
      black = !black;
    }
  }
  return { bars, width: x + quiet * moduleWidth, text: clean };
}

export function ean13Data(value = "") {
  const digits = String(value ?? "").replace(/\D/g, "");
  const payload = digits.length >= 12 ? digits.slice(-12) : digits.padStart(12, "0");
  const first = Number(payload[0]);
  const parity = EAN13_PARITY[first];
  const left = payload.slice(1, 7).split("").map((d, i) => (parity[i] === "G" ? EAN13_G[Number(d)] : EAN13_L[Number(d)])).join("");
  const right = payload.slice(7, 12).split("").map(d => EAN13_R[Number(d)]).join("");
  const sum = payload.split("").reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const checksum = (10 - (sum % 10)) % 10;
  const full = `${payload}${checksum}`;
  const pattern = `101${left}01010${right.replace(/undefined/g,"")}101`;
  const bars = [];
  for (let i = 0; i < pattern.length; i++) if (pattern[i] === "1") bars.push({ x: i, width: 1 });
  return { full, pattern, bars, width: pattern.length };
}
