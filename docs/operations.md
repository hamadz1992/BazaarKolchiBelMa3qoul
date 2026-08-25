# Operations

## Daily
1. Open cash session if the shop uses a session for current-day cash control.
2. Use POS and barcode scanner.
3. Record customer payments from the Customers area.
4. Record expenses.
5. Review cash movements and reports.

## Before release
```powershell
npm run audit:security
npm run check
npm run test:financial
npm run build
```

Run integration tests against a dedicated PostgreSQL test database.


## PostgreSQL setup on Windows

1. Install PostgreSQL (supported version used by the project).
2. Create a dedicated application database and role.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, `ADMIN_PASSWORD`, `CORS_ORIGIN`, and other required production secrets.
4. Run `npm run db:migrate`.
5. Verify with `npm run db:check`.

Never distribute `.env` or commit secrets to source control.

## Backups and recovery

The application backups are PostgreSQL dumps. Keep multiple recent copies outside the application directory. A backup is not considered valid until a restore has been tested on a separate PostgreSQL database. Recommended operational retention is the latest three known-good backups (and any longer retention required by the business).

## Automatic updates

Automatic updates are optional for self-managed deployments. When enabled, the updater verifies the published SHA-256 checksum before installing a package. For Windows distribution without code signing, keep update distribution under administrative control and verify the release artifact before publishing it.

## Allowed LocalStorage exceptions

LocalStorage is not a source of operational data. The allowed runtime exceptions are session/UI preferences such as `bazaar_api_token`, printer preferences, and non-financial UI state. Products, customers, sales, payments, debts, expenses, cash, inventory, and reports must be read from PostgreSQL/API.

## Legacy migration decision

The old LocalStorage migration path (`002_legacy_import.sql` and related import/validation scripts) is intentionally removed from production. Existing pre-PostgreSQL deployments must be migrated using a separate, controlled one-time migration process before adopting this release; the production runtime contains no automatic LocalStorage import or fallback.
