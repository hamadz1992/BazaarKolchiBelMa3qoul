# Architecture

## Runtime data flow

```text
React / Electron
      ↓
HTTP API
      ↓
server/*.mjs
      ↓
PostgreSQL
```

The API/server layer is authoritative for operational data. The frontend must not fall back to LocalStorage for products, customers, sales, debts, expenses, inventory, cash, users, or reports.

## Financial transaction boundary

Sales, payments, returns, customer ledger rebalancing, stock movements, and cash movements that belong to one business operation are executed inside the same PostgreSQL transaction whenever the operation requires multiple writes.

## Cash sessions

If an operation is historical and no open cash session exists, cash movement is recorded as a historical adjustment with a null session rather than silently rejecting the financial operation.

## POS modularization

`POSView.jsx` owns orchestration/state; reusable POS UI is extracted under `src/pos/components/` and focused behavior under `src/pos/hooks/`.
