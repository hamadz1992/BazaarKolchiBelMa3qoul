# قاعدة بيانات Bazaar Kolchi

هذه المرحلة تضيف PostgreSQL وطبقة API أولية بدون تغيير واجهة React.

## 1. إنشاء القاعدة

أنشئ قاعدة باسم `bazaar_kolchi` ثم نفذ:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
```

## 2. تشغيل API

```bash
npm install
npm run api
```

الاختبار:

```text
GET http://localhost:8787/api/health
```

## 3. قواعد البيانات المهمة

- العميل الافتراضي اسمه `زبون`.
- `sale_items.item_type = direct_amount` للمبلغ المباشر، ولا يغير المخزون.
- المنتج العادي ينقص من `products.current_stock` داخل Transaction.
- كل تغيير مخزون يسجل في `stock_movements`.
- إلغاء البيع يعيد المخزون داخل Transaction.
- أسعار وبيانات `sale_items` تحفظ كـ snapshot حتى لا تتغير الفواتير القديمة عند تعديل المنتج.

## 4. المرحلة التالية

لن يتم حذف `localStorage` الآن. سنبني migration منفصلة لنقل المنتجات والعملاء والمبيعات والمخزون، ثم نبدل الواجهة تدريجيًا إلى API.
