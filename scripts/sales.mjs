import { withTransaction, query } from './db.mjs';
import { requireOpenCashSession } from './cash.mjs';
import {getCustomerBalanceTx,rebalanceCustomerPaymentsTx} from './customers.mjs';

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

export async function createSale(payload) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    const error = new Error('الفاتورة لا تحتوي على عناصر.');
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(async (client) => {
    const customerResult = payload.customerId
      ? await client.query('SELECT id FROM customers WHERE id = $1 AND active = true', [payload.customerId])
      : payload.customerName
        ? await client.query('SELECT id FROM customers WHERE active=true AND lower(name)=lower($1) ORDER BY is_default DESC LIMIT 1', [String(payload.customerName).trim()])
        : await client.query('SELECT id FROM customers WHERE is_default = true LIMIT 1');
    const customerId = customerResult.rows[0]?.id || (await client.query('SELECT id FROM customers WHERE is_default=true LIMIT 1')).rows[0]?.id || null;
    const customer = customerId ? (await client.query('SELECT id,name,is_default FROM customers WHERE id=$1 FOR UPDATE',[customerId])).rows[0] : null;
    const previousCustomerDebt = customer && !customer.is_default ? await getCustomerBalanceTx(client,customerId) : 0;

    const invoiceNumber = payload.invoiceNumber?.trim() || `INV-${Date.now()}`;
    let subtotal = 0;
    const normalized = [];

    for (const raw of payload.items) {
      const quantity = Number(raw.quantity);
      const requestedPrice = money(raw.price ?? raw.unitPrice);
      const unitPrice = requestedPrice;
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        const error = new Error('عنصر فاتورة غير صالح.');
        error.statusCode = 400;
        throw error;
      }

      const isDirectAmount = raw.itemType === 'direct_amount' || raw.isDirectAmount === true;
      if (isDirectAmount) {
        const lineTotal = money(unitPrice * quantity);
        subtotal += lineTotal;
        normalized.push({ productId: null, name: raw.name || 'مبلغ مباشر', barcode: raw.barcode || null, unitPrice, purchasePrice: 0, quantity, lineTotal, itemType: 'direct_amount' });
        continue;
      }

      const product = await client.query(`
        SELECT id, barcode, name, sale_price, purchase_price, current_stock
        FROM products WHERE id = $1 AND active = true FOR UPDATE`, [raw.productId || raw.id]);
      if (!product.rows[0]) {
        const error = new Error(`المنتج غير موجود: ${raw.name || raw.id}`);
        error.statusCode = 404;
        throw error;
      }
      const p = product.rows[0];
      // The database is authoritative for regular product pricing.
      // Frontend-supplied price is ignored for normal products.
      const authoritativeUnitPrice = money(p.sale_price);
      if (Number(p.current_stock) < quantity) {
        const error = new Error(`المخزون غير كافٍ للمنتج: ${p.name}`);
        error.statusCode = 409;
        throw error;
      }

      const lineTotal = money(authoritativeUnitPrice * quantity);
      subtotal += lineTotal;
      normalized.push({ productId: p.id, name: p.name, barcode: p.barcode, unitPrice: authoritativeUnitPrice, purchasePrice: Number(p.purchase_price), quantity, lineTotal, itemType: 'product' });
    }

    const discount = money(payload.discount);
    if (discount < 0 || discount > subtotal) throw Object.assign(new Error('الخصم غير صالح.'), { statusCode: 400 });
    const total = money(subtotal - discount);
    let paid = money(payload.paid ?? 0);
    if (paid < 0) throw Object.assign(new Error('المبلغ المدفوع غير صالح.'), { statusCode: 400 });

    // POS normal cash sale without a selected customer:
    // the payment field may stay visually empty/0, but the transaction is
    // considered fully paid. A partial payment still requires a real customer.
    if (customer?.is_default && paid <= 0) {
      paid = total;
    } else if (customer?.is_default && paid + 0.01 < total) {
      throw Object.assign(
        new Error('عند الدفع الجزئي يجب اختيار عميل حقيقي حتى يُسجّل الدين عليه.'),
        { statusCode: 400 }
      );
    }

    const changeAmount = money(Math.max(0, paid-total));

    const sale = await client.query(`
      INSERT INTO sales (invoice_number,customer_id,user_id,payment_method,subtotal,discount,total,paid,change_amount,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed')
      RETURNING *`, [
      invoiceNumber, customerId, payload.userId || null, payload.paymentMethod || 'cash',
      subtotal, discount, total, paid, changeAmount
    ]);
    const saleRow = sale.rows[0];

    for (const item of normalized) {
      const inserted = await client.query(`
        INSERT INTO sale_items
          (sale_id,product_id,product_name,barcode,unit_price,purchase_price,quantity,line_total,item_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id`, [saleRow.id, item.productId, item.name, item.barcode, item.unitPrice, item.purchasePrice, item.quantity, item.lineTotal, item.itemType]);

      if (item.itemType === 'product') {
        await client.query(`UPDATE products SET current_stock = current_stock - $1, updated_at = now() WHERE id = $2`, [item.quantity, item.productId]);
        await client.query(`
          INSERT INTO stock_movements (product_id,type,quantity,reference_type,reference_id,note,user_id)
          VALUES ($1,'SALE',$2,'sale',$3,'بيع', $4)`, [item.productId, -item.quantity, saleRow.id, payload.userId || null]);
      }
    }

    await client.query(`INSERT INTO payments (sale_id,method,amount,user_id) VALUES ($1,$2,$3,$4)`, [saleRow.id, payload.paymentMethod || 'cash', paid, payload.userId || null]);

    if (['cash','نقدي'].includes(String(payload.paymentMethod || 'cash').toLowerCase()) && paid > 0) {
      const session = await requireOpenCashSession(client, { lock: true });
      await client.query(`
        INSERT INTO cash_movements (session_id,type,amount,reference_type,reference_id,note,user_id)
        VALUES ($1,'SALE',$2,'sale',$3,'بيع',$4)`, [session.id, Math.min(paid, total), saleRow.id, payload.userId || null]);
    }

    const customerInvoiceDebt=money(Math.max(0,total-Math.min(paid,total)));
    return {...saleRow,items:normalized,customer_previous_debt:previousCustomerDebt,customer_invoice_debt:customerInvoiceDebt,customer_total_debt:money(previousCustomerDebt+customerInvoiceDebt)};
  });
}

export async function cancelSale(id, { userId = null, reason = 'إلغاء الفاتورة' } = {}) {
  return withTransaction(async (client) => {
    const sale = await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [id]);
    if (!sale.rows[0]) throw Object.assign(new Error('الفاتورة غير موجودة.'), { statusCode: 404 });
    const row = sale.rows[0];
    if (row.status === 'cancelled') return row;

    const items = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1 FOR UPDATE`, [id]);
    for (const item of items.rows) {
      if (item.item_type !== 'product' || !item.product_id) continue;
      await client.query(`UPDATE products SET current_stock = current_stock + $1, updated_at = now() WHERE id = $2`, [item.quantity, item.product_id]);
      await client.query(`INSERT INTO stock_movements (product_id,type,quantity,reference_type,reference_id,note,user_id) VALUES ($1,'CANCEL',$2,'sale',$3,$4,$5)`, [item.product_id, item.quantity, id, reason, userId]);
    }

    const updated = await client.query(`UPDATE sales SET status='cancelled',cancelled_at=now(),cancelled_by=$2,cancel_reason=$3 WHERE id=$1 RETURNING *`, [id, userId, reason]);
    if(row.customer_id) await rebalanceCustomerPaymentsTx(client,row.customer_id);
    if (['cash','نقدي'].includes(String(row.payment_method||'cash').toLowerCase()) && Number(row.paid) > 0) {
      const session = await requireOpenCashSession(client, { lock: true });
      await client.query(`INSERT INTO cash_movements (session_id,type,amount,reference_type,reference_id,note,user_id) VALUES ($1,'CANCEL',$2,'sale',$3,$4,$5)`, [session.id, Math.min(Number(row.paid), Number(row.total)), id, reason, userId]);
    }
    return updated.rows[0];
  });
}

export async function listSales({ limit = 100, from = null, to = null, search = '' } = {}) {
  const params = [];
  const where = [`s.status <> 'cancelled'`];
  if (from) { params.push(from); where.push(`s.created_at >= $${params.length}`); }
  if (to) { params.push(to); where.push(`s.created_at < $${params.length}`); }
  const q = String(search || '').trim();
  if (q) {
    params.push(`%${q}%`);
    const n = params.length;
    where.push(`(s.invoice_number ILIKE $${n} OR COALESCE(c.name,'') ILIKE $${n} OR EXISTS (SELECT 1 FROM sale_items si2 WHERE si2.sale_id=s.id AND COALESCE(si2.barcode,'') ILIKE $${n}))`);
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  const result = await query(`SELECT s.*,COALESCE(c.name,'زبون') customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.created_at DESC LIMIT $${params.length}`, params);
  return Promise.all(result.rows.map(async s=>{
    const items=(await query(`SELECT id,product_id AS product_id,product_name AS name,barcode,unit_price AS price,purchase_price,quantity,line_total,item_type FROM sale_items WHERE sale_id=$1 ORDER BY id`,[s.id])).rows;
    const returned=Number((await query(`SELECT COALESCE(SUM(total),0) v FROM returns WHERE sale_id=$1`,[s.id])).rows[0]?.v||0);
    const allocated=Number((await query(`SELECT COALESCE(SUM(amount),0) v FROM customer_payment_allocations WHERE sale_id=$1`,[s.id])).rows[0]?.v||0);
    const remaining=Math.max(0,Number(s.total||0)-Number(s.paid||0)-returned-allocated);
    let customerBalance=0;
    if(s.customer_id){
      customerBalance=Number((await query(`
        SELECT GREATEST(
          COALESCE(SUM(GREATEST(
            sx.total-sx.paid-
            COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=sx.id),0)-
            COALESCE((SELECT SUM(cpa.amount) FROM customer_payment_allocations cpa WHERE cpa.sale_id=sx.id),0),
            0
          )),0),0
        ) balance
        FROM sales sx
        WHERE sx.customer_id=$1 AND sx.status<>'cancelled'
      `,[s.customer_id])).rows[0]?.balance||0);
    }
    return {...s,items,remaining,customer_balance:customerBalance,customer_previous_debt:Math.max(0,customerBalance-remaining)};
  }));
}

export async function updateSale(id,payload) {
  if (!Array.isArray(payload.items) || !payload.items.length) throw Object.assign(new Error('الفاتورة لا تحتوي على عناصر.'),{statusCode:400});
  return withTransaction(async client=>{
    const existing=(await client.query(`SELECT * FROM sales WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!existing) throw Object.assign(new Error('الفاتورة غير موجودة.'),{statusCode:404});
    if(existing.status==='cancelled') throw Object.assign(new Error('لا يمكن تعديل فاتورة ملغاة.'),{statusCode:409});
    const oldItems=(await client.query(`SELECT * FROM sale_items WHERE sale_id=$1 FOR UPDATE`,[id])).rows;
    for(const item of oldItems){if(item.item_type==='product'&&item.product_id){await client.query(`UPDATE products SET current_stock=current_stock+$1,updated_at=now() WHERE id=$2`,[item.quantity,item.product_id]);await client.query(`INSERT INTO stock_movements(product_id,type,quantity,reference_type,reference_id,note,user_id) VALUES($1,'EDIT_RESTORE',$2,'sale',$3,'إرجاع كمية قبل تعديل الفاتورة',$4)`,[item.product_id,item.quantity,id,payload.userId||null]);}}
    const customerResult=payload.customerId?await client.query(`SELECT id FROM customers WHERE id=$1 AND active=true`,[payload.customerId]):payload.customerName?await client.query(`SELECT id FROM customers WHERE active=true AND lower(name)=lower($1) LIMIT 1`,[String(payload.customerName).trim()]):await client.query(`SELECT id FROM customers WHERE is_default=true LIMIT 1`);
    const customerId=customerResult.rows[0]?.id||null;let subtotal=0;const normalized=[];
    for(const raw of payload.items){const quantity=Number(raw.quantity);const unitPrice=money(raw.price??raw.unitPrice);if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0)throw Object.assign(new Error('عنصر فاتورة غير صالح.'),{statusCode:400});const direct=raw.itemType==='direct_amount'||raw.isDirectAmount===true;if(direct){const line=money(unitPrice*quantity);subtotal+=line;normalized.push({productId:null,name:'سلعة',barcode:null,unitPrice,purchasePrice:0,quantity,lineTotal:line,itemType:'direct_amount'});continue;}const pr=(await client.query(`SELECT id,barcode,name,sale_price,purchase_price,current_stock FROM products WHERE id=$1 AND active=true FOR UPDATE`,[raw.productId||raw.id])).rows[0];if(!pr)throw Object.assign(new Error(`المنتج غير موجود: ${raw.name||raw.id}`),{statusCode:404});if(Number(pr.current_stock)<quantity)throw Object.assign(new Error(`المخزون غير كافٍ للمنتج: ${pr.name}`),{statusCode:409});const authoritativeUnitPrice=money(pr.sale_price);const line=money(authoritativeUnitPrice*quantity);subtotal+=line;normalized.push({productId:pr.id,name:pr.name,barcode:pr.barcode,unitPrice:authoritativeUnitPrice,purchasePrice:Number(pr.purchase_price),quantity,lineTotal:line,itemType:'product'});}
    const discount=money(payload.discount);if(discount<0||discount>subtotal)throw Object.assign(new Error('الخصم غير صالح.'),{statusCode:400});const total=money(subtotal-discount);const paid=money(payload.paid??total);if(paid<0)throw Object.assign(new Error('المبلغ المدفوع غير صالح.'),{statusCode:400});const changeAmount=money(Math.max(0,paid-total));
    await client.query(`DELETE FROM sale_items WHERE sale_id=$1`,[id]);await client.query(`DELETE FROM payments WHERE sale_id=$1`,[id]);
    const updated=(await client.query(`UPDATE sales SET customer_id=$2,user_id=$3,payment_method=$4,subtotal=$5,discount=$6,total=$7,paid=$8,change_amount=$9,status='completed',updated_at=now() WHERE id=$1 RETURNING *`,[id,customerId,payload.userId||existing.user_id,payload.paymentMethod||existing.payment_method,subtotal,discount,total,paid,changeAmount])).rows[0];
    for(const item of normalized){const inserted=(await client.query(`INSERT INTO sale_items(sale_id,product_id,product_name,barcode,unit_price,purchase_price,quantity,line_total,item_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[id,item.productId,item.name,item.barcode,item.unitPrice,item.purchasePrice,item.quantity,item.lineTotal,item.itemType])).rows[0];if(item.itemType==='product'){await client.query(`UPDATE products SET current_stock=current_stock-$1,updated_at=now() WHERE id=$2`,[item.quantity,item.productId]);await client.query(`INSERT INTO stock_movements(product_id,type,quantity,reference_type,reference_id,note,user_id) VALUES($1,'EDIT_SALE',$2,'sale',$3,'تطبيق الكمية الجديدة بعد تعديل الفاتورة',$4)`,[item.productId,-item.quantity,id,payload.userId||null]);}}
    await client.query(`DELETE FROM payments WHERE sale_id=$1`,[id]);
    await client.query(`INSERT INTO payments(sale_id,method,amount,user_id) VALUES($1,$2,$3,$4)`,[id,payload.paymentMethod||existing.payment_method,paid,payload.userId||existing.user_id]);
    if(customerId) await rebalanceCustomerPaymentsTx(client,customerId);
    const oldIsCash = ['cash','نقدي'].includes(String(existing.payment_method||'cash').toLowerCase());
    const newIsCash = ['cash','نقدي'].includes(String(payload.paymentMethod||existing.payment_method||'cash').toLowerCase());
    if (oldIsCash && Number(existing.paid) > 0) {
      const session = await requireOpenCashSession(client, { lock: true });
      await client.query(`INSERT INTO cash_movements(session_id,type,amount,reference_type,reference_id,note,user_id) VALUES($1,'CANCEL',$2,'sale',$3,'عكس قيمة الفاتورة قبل التعديل',$4)`,[session.id,Math.min(Number(existing.paid),Number(existing.total)),id,payload.userId||existing.user_id]);
      if (newIsCash && Number(paid) > 0) await client.query(`INSERT INTO cash_movements(session_id,type,amount,reference_type,reference_id,note,user_id) VALUES($1,'SALE',$2,'sale',$3,'قيمة الفاتورة بعد التعديل',$4)`,[session.id,Math.min(Number(paid),Number(total)),id,payload.userId||existing.user_id]);
    } else if (newIsCash && Number(paid) > 0) {
      const session = await requireOpenCashSession(client, { lock: true });
      await client.query(`INSERT INTO cash_movements(session_id,type,amount,reference_type,reference_id,note,user_id) VALUES($1,'SALE',$2,'sale',$3,'قيمة الفاتورة بعد التعديل',$4)`,[session.id,Math.min(Number(paid),Number(total)),id,payload.userId||existing.user_id]);
    }
    return updated;
  });
}
