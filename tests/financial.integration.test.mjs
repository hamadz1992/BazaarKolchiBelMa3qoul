
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for financial tests");
  process.env.DATABASE_URL = databaseUrl;

  const { query, pool } = await import('../server/db.mjs');
  const { createSale, cancelSale } = await import('../server/sales.mjs');
  const { createReturn } = await import('../server/returns.mjs');
  const { addCustomerPayment, getCustomerBalanceTx } = await import('../server/customers.mjs');
  const { openCash, closeCash } = await import('../server/cash.mjs');

  const tag = `TEST-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  let productId, customerId, cashSessionId;
  const saleIds = [];
  const returnIds = [];

  async function cleanup() {
    await query('BEGIN');
    try {
      if (returnIds.length) {
        await query('DELETE FROM cash_movements WHERE reference_type=$1 AND reference_id = ANY($2::uuid[])', ['return', returnIds]);
        await query('DELETE FROM audit_logs WHERE entity_type=$1 AND entity_id = ANY($2::uuid[])', ['return', returnIds]);
        await query('DELETE FROM return_items WHERE return_id = ANY($1::uuid[])', [returnIds]);
        await query('DELETE FROM returns WHERE id = ANY($1::uuid[])', [returnIds]);
      }
      if (saleIds.length) {
        await query('DELETE FROM cash_movements WHERE reference_type=$1 AND reference_id = ANY($2::uuid[])', ['sale', saleIds]);
        await query('DELETE FROM cash_movements WHERE reference_type=$1 AND reference_id IN (SELECT id FROM customer_payments WHERE customer_id=$2)', ['customer_payment', customerId]);
        await query('DELETE FROM customer_payment_allocations WHERE customer_payment_id IN (SELECT id FROM customer_payments WHERE customer_id=$1)', [customerId]);
        await query('DELETE FROM audit_logs WHERE entity_type=$1 AND entity_id = ANY($2::uuid[])', ['sale', saleIds]);
        await query('DELETE FROM payments WHERE sale_id = ANY($1::uuid[])', [saleIds]);
        await query('DELETE FROM sale_items WHERE sale_id = ANY($1::uuid[])', [saleIds]);
        await query('DELETE FROM sales WHERE id = ANY($1::uuid[])', [saleIds]);
      }
      if (customerId) await query('DELETE FROM customer_payments WHERE customer_id=$1', [customerId]);
      if (cashSessionId) await query('DELETE FROM cash_movements WHERE session_id=$1', [cashSessionId]);
      if (cashSessionId) await query('DELETE FROM cash_sessions WHERE id=$1', [cashSessionId]);
      if (productId) {
        await query('DELETE FROM stock_movements WHERE product_id=$1', [productId]);
        await query('DELETE FROM favorite_products WHERE product_id=$1', [productId]);
        await query('DELETE FROM products WHERE id=$1', [productId]);
      }
      if (customerId) await query('DELETE FROM customers WHERE id=$1', [customerId]);
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    } finally {
      await pool.end();
    }
  }

  test('sale -> payment -> partial return keeps debt and allocations consistent', async () => {
    const p = (await query(`
      INSERT INTO products(name,barcode,purchase_price,sale_price,current_stock,minimum_stock,active)
      VALUES($1,$2,10,100,10,0,true) RETURNING id
    `, [`${tag}-product`, `${tag}-barcode`])).rows[0];
    productId = p.id;
    const c = (await query(`
      INSERT INTO customers(name,phone,is_default,active) VALUES($1,$2,false,true) RETURNING id
    `, [`${tag}-customer`, tag])).rows[0];
    customerId = c.id;

    const sale = await createSale({
      invoiceNumber: `${tag}-SALE-1`,
      customerId,
      items: [{ productId, quantity: 1, price: 100, itemType: 'product' }],
      paid: 50,
      discount: 0,
      paymentMethod: 'cash',
      userId: null,
    });
    saleIds.push(sale.id);
    assert.equal(Number(sale.total), 100);
    assert.equal(Number(sale.paid), 50);
    assert.equal(Number(sale.customer_invoice_debt), 50);
    assert.equal(Number((await query('SELECT current_stock FROM products WHERE id=$1',[productId])).rows[0].current_stock), 9);

    const payment = await addCustomerPayment(customerId, 30, 'test payment', null);
    assert(payment.id);

    const afterPayment = Number(await getCustomerBalanceTx({ query }, customerId));
    assert.equal(afterPayment, 20);

    const itemId = (await query('SELECT id FROM sale_items WHERE sale_id=$1 LIMIT 1',[sale.id])).rows[0].id;
    const ret = await createReturn(sale.id, [{ saleItemId: itemId, quantity: 0.3 }], 'partial test', null);
    returnIds.push(ret.id);
    assert.equal(Number(ret.total), 30);

    const balanceAfterReturn = Number(await getCustomerBalanceTx({ query }, customerId));
    assert.equal(balanceAfterReturn, 0);

    const allocation = Number((await query(
      'SELECT COALESCE(SUM(amount),0) AS v FROM customer_payment_allocations WHERE customer_payment_id=$1',[payment.id]
    )).rows[0].v);
    assert.equal(allocation, 20);

    const returnedStock = Number((await query('SELECT current_stock FROM products WHERE id=$1',[productId])).rows[0].current_stock);
    assert.equal(returnedStock, 9.3);
  });

  test('cash session links cash sale and later historical return adjustment', async () => {
    const session = await openCash(1000, null);
    cashSessionId = session.id;
    const sale = await createSale({
      invoiceNumber: `${tag}-SALE-CASH`,
      customerId: null,
      items: [{ productId, quantity: 1, price: 100, itemType: 'product' }],
      paid: 100,
      discount: 0,
      paymentMethod: 'cash',
      userId: null,
    });
    saleIds.push(sale.id);
    const cashSale = (await query(
      `SELECT session_id,type,amount FROM cash_movements WHERE reference_type='sale' AND reference_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [sale.id]
    )).rows[0];
    assert.equal(String(cashSale.session_id), String(cashSessionId));
    assert.equal(cashSale.type, 'SALE');
    assert.equal(Number(cashSale.amount), 100);

    const itemId = (await query('SELECT id FROM sale_items WHERE sale_id=$1 LIMIT 1',[sale.id])).rows[0].id;
    const closedExpected = Number(session.opening_balance) + 100;
    await closeCash(closedExpected, null);

    const ret = await createReturn(sale.id, [{ saleItemId: itemId, quantity: 1 }], 'historical return', null);
    returnIds.push(ret.id);
    const hist = (await query(
      `SELECT session_id,type,amount FROM cash_movements WHERE reference_type='return' AND reference_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [ret.id]
    )).rows[0];
    assert.equal(hist.session_id, null);
    assert.equal(hist.type, 'HISTORICAL_ADJUSTMENT_OUT');
    assert.equal(Number(hist.amount), 100);
    cashSessionId = null;
  });


  test('cancel reverses stock and records a cash cancellation movement', async () => {
    await query('UPDATE products SET current_stock=1, updated_at=now() WHERE id=$1', [productId]);
    const sale = await createSale({
      invoiceNumber: `${tag}-SALE-CANCEL`,
      customerId: null,
      items: [{ productId, quantity: 1, price: 100, itemType: 'product' }],
      paid: 100,
      discount: 0,
      paymentMethod: 'cash',
      userId: null,
    });
    saleIds.push(sale.id);
    const before = Number((await query('SELECT current_stock FROM products WHERE id=$1',[productId])).rows[0].current_stock);
    assert.equal(before, 0);
    const cancelled = await cancelSale(sale.id, { userId: null, reason: 'test cancel' });
    assert.equal(cancelled.status, 'cancelled');
    const after = Number((await query('SELECT current_stock FROM products WHERE id=$1',[productId])).rows[0].current_stock);
    assert.equal(after, 1);
    const movement = (await query(
      `SELECT type, amount FROM cash_movements WHERE reference_type='sale' AND reference_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [sale.id]
    )).rows[0];
    assert.equal(movement.type, 'HISTORICAL_ADJUSTMENT_OUT');
    assert.equal(Number(movement.amount), 100);
  });

  test('inventory concurrency allows only one sale when stock is one', async () => {
    const row = (await query(`
      UPDATE products SET current_stock=1, updated_at=now() WHERE id=$1 RETURNING id
    `, [productId])).rows[0];
    assert(row.id);

    const results = await Promise.allSettled([
      createSale({invoiceNumber:`${tag}-CON-1`,items:[{productId,quantity:1,price:100,itemType:'product'}],paid:100,paymentMethod:'cash'}),
      createSale({invoiceNumber:`${tag}-CON-2`,items:[{productId,quantity:1,price:100,itemType:'product'}],paid:100,paymentMethod:'cash'})
    ]);
    const fulfilled = results.filter(x=>x.status==='fulfilled');
    const rejected = results.filter(x=>x.status==='rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    saleIds.push(fulfilled[0].value.id);
    const stock = Number((await query('SELECT current_stock FROM products WHERE id=$1',[productId])).rows[0].current_stock);
    assert.equal(stock, 0);
  });

  test.after(async () => {
    await cleanup();
  });
