BEGIN;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created ON cash_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at DESC);
INSERT INTO store_settings(id,store_name,currency) VALUES(1,'كل شيء بالمعقول','DZD') ON CONFLICT(id) DO NOTHING;
COMMIT;
