# Bazaar Kolchi Bel Ma3qoul

نظام نقاط بيع وإدارة متجر لسطح المكتب على Windows.

## مصدر البيانات

PostgreSQL هو **المصدر الوحيد للحقيقة** للبيانات التشغيلية:
- المنتجات والمخزون
- العملاء والديون والدفعات
- الفواتير والمدفوعات والمرتجعات
- المصاريف والصندوق
- المستخدمون والصلاحيات
- إعدادات المتجر التشغيلية
- التقارير

`localStorage` لا يستخدم لتخزين البيانات التشغيلية. يُستخدم فقط لأغراض الجلسة/تفضيلات الواجهة غير المالية.

## التشغيل

أنشئ `.env` محليًا من `.env.example`:

```powershell
Copy-Item .env.example .env
```

ثم ضع `DATABASE_URL` و`ADMIN_PASSWORD` قويًا (12 محرفًا على الأقل ومتعدد الأنواع).

التثبيت:

```powershell
npm install
```

قاعدة البيانات:

```powershell
npm run db:migrate
```

فحص الأمان:

```powershell
npm run audit:security
npm run check
```

الاختبارات المالية التكاملية (تحتاج PostgreSQL اختبارية عبر `TEST_DATABASE_URL`):

```powershell
npm run test:financial
```

أو:

```powershell
npm test
```

البناء:

```powershell
npm run build
```

تشغيل سطح المكتب:

```powershell
npm run desktop:dev
```

## الاختبارات المالية

تشمل مجموعة الاختبارات:
- البيع مع دفعة جزئية
- دفعة العميل وإعادة توزيع `customer_payment_allocations`
- المرتجع الجزئي وتحديث الدين
- إلغاء الفاتورة وإرجاع المخزون
- ربط حركة البيع بجلسة الصندوق
- التسوية التاريخية عند غياب جلسة مفتوحة
- تعارض بيعين متزامنين على مخزون مقدارُه 1

شغّل الاختبارات على قاعدة بيانات مخصصة للاختبار فقط.

## الأمان

- Electron sandbox + contextIsolation
- `nodeIntegration: false`
- CSP وCORS allowlist
- Rate limiting لمحاولات تسجيل الدخول
- لا يتم شحن `.env`
- لا توجد migration إنتاجية تحذف الفواتير تلقائيًا
- فحص أمني آلي قبل البناء

## البنية

```text
src/                  واجهة React
src/pos/components/   مكونات POS
src/pos/hooks/        Hooks خاصة بـPOS
server/               API وطبقة PostgreSQL
database/migrations/  Migrations إنتاجية
tests/                اختبارات تكامل مالية
scripts/              فحوصات وأدوات البناء
docs/                 التوثيق التشغيلي والمعماري
electron/             Main/Preload/سطح المكتب
```

## ملاحظات البيانات

لا تستخدم أي أدوات import/reset القديمة في التشغيل. أي استيراد أو تنظيف تاريخي يجب أن يكون إجراءً منفصلًا ومدروسًا خارج مسار الإنتاج.


## Architecture rule

PostgreSQL is the only runtime source of truth for operational data. LocalStorage is limited to explicitly documented session and UI preferences. Legacy LocalStorage import/reset tooling is not part of production.


## تطبيق الهاتف

مجلد `mobile/` هو PWA مرتبط بنفس API وقاعدة PostgreSQL. يدعم:
- تسجيل الدخول بنفس المستخدمين والصلاحيات.
- البيع والعملاء والدفعات والمخزون والمصاريف.
- العمل Offline عبر IndexedDB مع طابور مزامنة.
- مزامنة تلقائية عند عودة الاتصال.
- منع تكرار العمليات عبر `deviceId + operationId`.

تشغيل خادم الهاتف المحلي:
```powershell
npm run mobile:serve
```

للوصول من الهاتف على الشبكة المحلية، اجعل `CORS_ORIGIN` في `.env` يتضمن أصل التطبيق الذي ستستخدمه.


### Password policy
Application user passwords and `ADMIN_PASSWORD` are exactly 6 digits.
