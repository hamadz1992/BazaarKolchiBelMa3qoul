export const PRODUCT_STORAGE_KEY = "bazaar-kolchi-products";

export const BARCODE_PREFIX = "622100000";

export const initialProducts = [
  { id: 1, name: "حجاب نسائي", barcode: "622100000001", category: "ملابس نسائية", unit: "قطعة", purchase: 250, price: 400, stock: 18, min: 5 },
  { id: 2, name: "فندروب", barcode: "622100000002", category: "ملابس نسائية", unit: "قطعة", purchase: 700, price: 950, stock: 9, min: 4 },
  { id: 3, name: "علبة تخزين", barcode: "622100000003", category: "أواني منزلية", unit: "قطعة", purchase: 180, price: 300, stock: 3, min: 5 },
  { id: 4, name: "مناديل مبللة", barcode: "622100000004", category: "تنظيف", unit: "علبة", purchase: 90, price: 140, stock: 24, min: 6 }
];

export function loadProducts() {
  try {
    const raw = localStorage.getItem(PRODUCT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(initialProducts));
  return initialProducts;
}

export function saveProducts(products) {
  localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(products));
}

export function getNextBarcode(products) {
  const numbers = products
    .map(p => String(p.barcode || "").match(/^(?:622100000)(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = Math.max(0, ...numbers) + 1;
  return `${BARCODE_PREFIX}${String(next).padStart(3, "0")}`;
}
