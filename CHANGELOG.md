## إصلاح جلسة المصادقة والصندوق
- عند انتهاء Token المحفوظ، يعيد التطبيق إظهار تسجيل الدخول بدل إبقاء الواجهة مفتوحة ثم رفض عمليات الصندوق برسالة «يجب تسجيل الدخول».
- مسح Token القديم من واجهة Electron عند استلام HTTP 401.
- توحيد انتقال التطبيق إلى شاشة تسجيل الدخول عند انتهاء الجلسة.
- لم يتم تغيير كلمة مرور المدير أو بيانات PostgreSQL.

# Mobile update — 2026-08-19

## تطبيق الهاتف
- إعادة بناء واجهة الهاتف لتسجيل الدخول والبيع والعملاء والمخزون والمزيد.
- إضافة IndexedDB محلي لطابور العمليات والبيانات المخزنة للعمل Offline.
- إضافة مزامنة آمنة بالـ `deviceId + operationId` لمنع التكرار.
- إضافة مزامنة للمنتجات والعملاء والمبيعات ودفعات العملاء والمصاريف وحركات الصندوق والمرتجعات وتعديلات المخزون والمفضلة.
- إضافة `/api/mobile/bootstrap` لتحميل لقطة تشغيلية أولية للهاتف.
- تشديد CORS الافتراضي ليشمل خادم الهاتف المحلي.
- إضافة شاشة Online/Offline ومزامنة تلقائية عند عودة الاتصال.
- إضافة Service Worker/PWA cache للتطبيق المحمول.


## 2026-08-19 — Receipt, barcode, and invoice numbering fixes
- Unified receipt preview in POS and printing using the same React preview component.
- Added machine-readable EAN-13 barcode generation for invoice numbers.
- Added PostgreSQL-backed sequential invoice numbering starting from 1 for new invoices when no numeric invoice exists.
- Applied explicit Windows paper sizes for silent printing.

# Changelog

## 1.0.0 — Runtime hardening baseline
- PostgreSQL as the single runtime source of truth.
- Removed destructive invoice-reset migration from production migrations.
- Removed unused legacy import/reset runtime tools.
- Added transaction-safe customer payment rebalance during returns.
- Added historical cash adjustments when no open cash session exists.
- Restricted CORS to an explicit allowlist.
- Added login rate limiting and temporary lockout.
- Added automated critical security checks.
- Added automated financial integration tests.
- Split POS barcode modal into a component and barcode focus into a hook.
- Removed four confirmed unused CSS files.
- Consolidated project documentation into README + docs + changelog.

## 0.2.x — Previous development iterations
See repository history for prior feature patches and prototype notes.

- Updated application password policy to exactly 6 digits.

## Mobile LAN login fix
- Allow PWA origins on private LAN IPv4 addresses using port 4174 for development.
- Show explicit API/network error in mobile login instead of silently failing.

- Fixed desktop POS popup URL handling so the POS window loads correctly in development and packaged mode.


## Invoice receipt polish / barcode fix — 2026-08-22
- Removed duplicate invoice number printed below the barcode in Desktop receipts.
- Removed barcode label and human-readable duplicate text from the barcode area.
- Enlarged Code 128 barcode with quiet zones and crisp rendering for scanner readability on Desktop and Mobile.
- Cleaned up receipt footer/barcode presentation without changing accounting logic.
