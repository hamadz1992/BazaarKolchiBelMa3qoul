/**
 * Display invoice numbers in a fixed six-digit format.
 * The original invoice_number remains unchanged in PostgreSQL/API.
 */
export function displayInvoiceNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return String(value ?? '');
  return digits.slice(-6).padStart(6, '0');
}
