# Bazaar API

API أولية لربط تطبيق POS مع PostgreSQL.

## تشغيل

1. انسخ `.env.example` إلى `.env` واضبط `DATABASE_URL`.
2. نفذ migration:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
```

3. ثبّت اعتماديات المشروع:

```bash
npm install
```

4. شغّل API:

```bash
npm run api
```

## Endpoints الحالية

- `GET /api/health`
- `GET /api/products?search=`
- `GET /api/products/:id`
- `POST /api/products`
- `GET /api/customers?search=`
- `GET /api/sales?limit=100`
- `POST /api/sales`
- `POST /api/sales/:id/cancel`

## ملاحظات

هذه طبقة البيانات الأولى فقط. الواجهة الحالية لم تُربط بها بعد. ربط الواجهة سيتم بعد اختبار PostgreSQL وعمليات البيع/الإلغاء والمخزون.
