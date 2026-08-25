import { query } from './db.mjs';

function saleWhere(from, to, args = []) {
  let where = "WHERE s.status <> 'cancelled'";
  if (from) { args.push(from); where += ` AND s.created_at >= $${args.length}`; }
  if (to) { args.push(to); where += ` AND s.created_at < $${args.length}`; }
  return where;
}

export async function dashboard(from, to) {
  const args = [];
  const where = saleWhere(from, to, args);
  const sales = (await query(`
    SELECT COUNT(*)::int count,
      COALESCE(SUM(s.total),0) gross_total,
      COALESCE(SUM(COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0)),0) returned_total,
      COALESCE(SUM(s.total-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0)),0) total,
      COALESCE(SUM(s.subtotal-s.discount-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0)),0) net
    FROM sales s ${where}
  `, args)).rows[0];
  const items = (await query(`
    SELECT
      COALESCE(SUM(si.quantity-COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id=si.id),0)),0) quantity,
      COALESCE(SUM(si.line_total-COALESCE((SELECT SUM(ri.line_total) FROM return_items ri WHERE ri.sale_item_id=si.id),0)),0) revenue,
      COALESCE(SUM(si.purchase_price*(si.quantity-COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id=si.id),0))),0) cost
    FROM sale_items si JOIN sales s ON s.id=si.sale_id ${where} AND si.item_type='product'
  `, args)).rows[0];

  const low = (await query(`SELECT COUNT(*)::int count FROM products WHERE active=true AND current_stock>0 AND current_stock<=minimum_stock`)).rows[0].count;
  const out = (await query(`SELECT COUNT(*)::int count FROM products WHERE active=true AND current_stock<=0`)).rows[0].count;
  const inv = (await query(`SELECT COALESCE(SUM(current_stock*purchase_price),0) inventory_value FROM products WHERE active=true`)).rows[0];

  const expensesArgs = [];
  let expensesWhere = 'WHERE 1=1';
  if (from) { expensesArgs.push(from); expensesWhere += ` AND e.created_at >= $${expensesArgs.length}`; }
  if (to) { expensesArgs.push(to); expensesWhere += ` AND e.created_at < $${expensesArgs.length}`; }
  const expenses = (await query(`SELECT COALESCE(SUM(e.amount),0) total FROM expenses e ${expensesWhere}`, expensesArgs)).rows[0];

  const debts = (await query(`SELECT COALESCE(SUM(balance),0) total FROM (
    SELECT c.id,
      GREATEST(
      COALESCE(SUM(CASE WHEN s.status <> 'cancelled' THEN GREATEST(
        s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0
      ) ELSE 0 END),0)
      - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id=c.id),0),
      0
    ) AS balance
    FROM customers c
    LEFT JOIN sales s ON s.customer_id=c.id
    WHERE c.active=true AND c.is_default=false
    GROUP BY c.id
  ) x WHERE balance > 0`)).rows[0];

  const dailyArgs = [];
  let dailyWhere = "WHERE s.status <> 'cancelled'";
  if (from) { dailyArgs.push(from); dailyWhere += ` AND s.created_at >= $${dailyArgs.length}`; }
  if (to) { dailyArgs.push(to); dailyWhere += ` AND s.created_at < $${dailyArgs.length}`; }
  const daily = (await query(`
    SELECT DATE(s.created_at) AS sale_day, COALESCE(SUM(s.total),0) AS total
    FROM sales s ${dailyWhere}
    GROUP BY 1
    ORDER BY 1 ASC
  `, dailyArgs)).rows;

  const operations = (await query(`
    SELECT s.id, s.invoice_number, s.total, s.created_at
    FROM sales s
    WHERE s.status <> 'cancelled'
    ORDER BY s.created_at DESC
    LIMIT 5
  `)).rows.map(r => ({ id:r.id, invoice:r.invoice_number, amount:Number(r.total||0), createdAt:r.created_at }));

  const cashSession = (await query(`
    SELECT cs.id, cs.opened_at, cs.opening_balance,
      COALESCE(cs.opening_balance,0) + COALESCE(SUM(CASE
        WHEN cm.type IN ('SALE','CUSTOMER_PAYMENT','MANUAL_IN','EXPENSE_REVERSAL','CANCEL') THEN cm.amount
        WHEN cm.type IN ('EXPENSE','RETURN','MANUAL_OUT') THEN -cm.amount
        ELSE 0 END),0) balance
    FROM cash_sessions cs
    LEFT JOIN cash_movements cm ON cm.session_id=cs.id
    WHERE cs.status='open'
    GROUP BY cs.id, cs.opened_at, cs.opening_balance
    ORDER BY cs.opened_at DESC
    LIMIT 1
  `)).rows[0] || null;

  return {
    sales,
    items,
    grossSales: Number(sales.gross_total || 0),
    returnedSales: Number(sales.returned_total || 0),
    netSales: Number(sales.total || 0),
    grossProfit: Number(items.revenue) - Number(items.cost),
    profit: Number(items.revenue) - Number(items.cost),
    netProfit: Number(items.revenue) - Number(items.cost) - Number(expenses.total || 0),
    low: Number(low),
    out: Number(out),
    inventoryValue: Number(inv.inventory_value || 0),
    expenses: Number(expenses.total || 0),
    debt: Number(debts.total || 0),
    cashBalance: cashSession ? Number(cashSession.balance || 0) : 0,
    daily,
    operations
  };
}

export async function topProducts(limit=10, from, to) {
  const args = [limit];
  let where = "WHERE s.status <> 'cancelled' AND si.item_type='product'";
  if (from) { args.push(from); where += ` AND s.created_at >= $${args.length}`; }
  if (to) { args.push(to); where += ` AND s.created_at < $${args.length}`; }
  const r = await query(`
    SELECT si.product_id, si.product_name,
      SUM(si.quantity-COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id=si.id),0)) quantity,
      SUM(si.line_total-COALESCE((SELECT SUM(ri.line_total) FROM return_items ri WHERE ri.sale_item_id=si.id),0)) revenue
    FROM sale_items si
    JOIN sales s ON s.id=si.sale_id
    ${where}
    GROUP BY si.product_id, si.product_name
    ORDER BY quantity DESC
    LIMIT $1
  `, args);
  return r.rows;
}

export async function dailySales(from, to) {
  const args = [];
  const where = saleWhere(from, to, args);
  const r = await query(`
    SELECT DATE(s.created_at) AS sale_day,
      COUNT(*)::int AS count,
      COALESCE(SUM(s.total-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0)),0) AS total,
      COALESCE(SUM(s.paid),0) AS paid,
      COALESCE(SUM(GREATEST(s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0)),0) AS debt,
      COALESCE(SUM((SELECT COALESCE(SUM(si.purchase_price*(si.quantity-COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id=si.id),0))),0) FROM sale_items si WHERE si.sale_id=s.id AND si.item_type='product')),0) AS cost
    FROM sales s
    ${where}
    GROUP BY DATE(s.created_at)
    ORDER BY DATE(s.created_at) DESC
  `, args);
  return r.rows;
}

export async function expenseSummary(from, to) {
  const args = [];
  let where = 'WHERE 1=1';
  if (from) { args.push(from); where += ` AND e.created_at >= $${args.length}`; }
  if (to) { args.push(to); where += ` AND e.created_at < $${args.length}`; }
  const r = await query(`
    SELECT COALESCE(NULLIF(TRIM(e.category),''),'غير مصنف') category,
      COUNT(*)::int count,
      COALESCE(SUM(e.amount),0) amount
    FROM expenses e ${where}
    GROUP BY COALESCE(NULLIF(TRIM(e.category),''),'غير مصنف')
    ORDER BY amount DESC
  `, args);
  return r.rows;
}

export async function debtorSummary(limit=10) {
  const r = await query(`
    SELECT c.id, c.name,
      GREATEST(
      COALESCE(SUM(CASE WHEN s.status <> 'cancelled' THEN GREATEST(
        s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0
      ) ELSE 0 END),0)
      - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id=c.id),0),
      0
    ) AS balance
    FROM customers c
    LEFT JOIN sales s ON s.customer_id=c.id
    WHERE c.active=true AND c.is_default=false
    GROUP BY c.id, c.name
    HAVING (
      COALESCE(SUM(CASE WHEN s.status <> 'cancelled' THEN GREATEST(s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0) ELSE 0 END),0)
      - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id=c.id),0)
    ) > 0
    ORDER BY balance DESC
    LIMIT $1
  `, [limit]);
  return r.rows;
}
