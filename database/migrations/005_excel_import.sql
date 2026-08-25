BEGIN;
INSERT INTO permissions(code,description) VALUES('products.import','استيراد المنتجات من Excel'),('customers.view','عرض العملاء') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('products.import','customers.view') WHERE r.name='مدير'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='customers.view' WHERE r.name IN ('موظف','بائع')
ON CONFLICT DO NOTHING;
COMMIT;
