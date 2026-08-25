import { withTransaction, query } from './db.mjs';
import { recordCashMovement } from './cash.mjs';
import { rebalanceCustomerPaymentsTx, getCustomerBalanceTx } from './customers.mjs';
import { logAuditTx } from './audit.mjs';

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
    const defaultCustomer = (await client.query('SELECT id,name,is_default FROM customers WHERE is_default=true LIMIT 1')).rows[0] || null;
    const customerResult = payload.customerId
      ? await client.query('SELECT id,name,is_default FROM customers WHERE id = $1 AND active = true', [payload.customerId])
      : payload.customerName && String(payload.customerName).trim() !== 'زبون'
        ? await client.query('SELECT id,name,is_default FROM customers WHERE active=true AND is_default=false AND lower(name)=lower($1) LIMIT 1', [String(payload.customerName).trim()])
        : { rows: defaultCustomer ? [defaultCustomer] : [] };

    const selectedCustomer = customerResult.rows[0] || defaultCustomer;
    const customerId = selectedCustomer?.id || null;
    const isDefaultCustomer = !!selectedCustomer?.is_default;

    const invoiceNumber = payload.invoiceNumber?.trim() ||
      String((await client.query("SELECT nextval('invoice_number_seq') AS n")).rows[0].n).padStart(6, '0');
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
    const paid = money(payload.paid ?? total);
    if (paid < 0) throw Object.assign(new Error('المبلغ المدفوع غير صالح.'), { statusCode: 400 });
    if (!isDefaultCustomer && paid < total && !customerId) {
      throw Object.assign(new Error('اختر عميلًا حقيقيًا لتسجيل الدين.'), { statusCode: 400 });
    }
    const changeAmount = money(Math.max(0, paid - total));

    let previousCustomerDebt = 0;
    if (customerId && !isDefaultCustomer) {
      // Rebuild payment allocations first so an old customer payment is never
      // counted twice or left detached from the invoices it settles.
      await rebalanceCustomerPaymentsTx(client, customerId);

      previousCustomerDebt = await getCustomerBalanceTx(client,customerId);
    }

    const invoiceRemaining = money(Math.max(0, total - paid));
    const overpayment = money(Math.max(0, paid - total));
    const debtAppliedFromOverpayment = customerId && !isDefaultCustomer
      ? money(Math.min(overpayment, previousCustomerDebt))
      : 0;
    const customerDebtRemaining = customerId && !isDefaultCustomer
      ? money(Math.max(0, previousCustomerDebt - debtAppliedFromOverpayment + invoiceRemaining))
      : 0;
    // Only the amount not used to reduce an existing customer debt is actual change returned.
    const actualChangeAmount = money(Math.max(0, overpayment - debtAppliedFromOverpayment));

    const sale = await client.query(`
      INSERT INTO sales (invoice_number,customer_id,user_id,payment_method,subtotal,discount,total,paid,change_amount,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed')
      RETURNING *`, [
      invoiceNumber, customerId, payload.userId || null, payload.paymentMethod || 'cash',
      subtotal, discount, total, paid, actualChangeAmount
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

    if (debtAppliedFromOverpayment > 0 && customerId && !isDefaultCustomer) {
      const paymentRow = (await client.query(`
        INSERT INTO customer_payments(customer_id,amount,note,user_id)
        VALUES($1,$2,$3,$4)
        RETURNING *`, [customerId, debtAppliedFromOverpayment, `خصم فائض دفع الفاتورة ${invoiceNumber} من الدين`, payload.userId || null])).rows[0];
      await rebalanceCustomerPaymentsTx(client, customerId);
      if (['cash','نقدي'].includes(String(payload.paymentMethod || 'cash').toLowerCase())) {
        await recordCashMovement(client,{type:'CUSTOMER_PAYMENT',amount:debtAppliedFromOverpayment,referenceType:'customer_payment',referenceId:paymentRow.id,note:'خصم فائض دفع من دين العميل',userId:payload.userId||null});
      }
      await logAuditTx(client,{
        userId:payload.userId||null,
        action:'CUSTOMER_DEBT_REDUCED_FROM_SALE_OVERPAYMENT',
        entityType:'customer_payment',
        entityId:paymentRow.id,
        payload:{customer_id:customerId,sale_id:saleRow.id,amount:debtAppliedFromOverpayment,invoice_number:invoiceNumber,debt_before:previousCustomerDebt,debt_after:customerDebtRemaining}
      });
    }

    if (['cash','نقدي'].includes(String(payload.paymentMethod || 'cash').toLowerCase()) && paid > 0) {
      await recordCashMovement(client,{type:'SALE',amount:Math.min(paid,total),referenceType:'sale',referenceId:saleRow.id,note:'بيع',userId:payload.userId||null});
    }

    await logAuditTx(client,{userId:payload.userId||null,action:'SALE_CREATED',entityType:'sale',entityId:saleRow.id,payload:{invoice_number:invoiceNumber,customer_id:customerId,total,paid,overpayment:overpayment,debt_applied_from_overpayment:debtAppliedFromOverpayment,customer_total_debt:customerDebtRemaining}});
    return {
      ...saleRow,
      customer_name: isDefaultCustomer ? 'زبون' : (selectedCustomer?.name || null),
      customer_previous_debt: previousCustomerDebt,
      customer_invoice_debt: invoiceRemaining,
      customer_debt_paid_from_overpayment: debtAppliedFromOverpayment,
      customer_total_debt: customerDebtRemaining,
      items: normalized
    };
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
    if (['cash','نقدي'].includes(String(row.payment_method||'cash').toLowerCase()) && Number(row.paid) > 0) {
      await recordCashMovement(client,{type:'CANCEL',amount:Math.min(Number(row.paid),Number(row.total)),referenceType:'sale',referenceId:id,note:reason,userId});
    }
    if (row.customer_id) await rebalanceCustomerPaymentsTx(client, row.customer_id);
    await logAuditTx(client,{userId,action:'SALE_CANCELLED',entityType:'sale',entityId:id,payload:{invoice_number:row.invoice_number,reason}});
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
  const result = await query(`
    WITH sale_base AS (
      SELECT s.*,COALESCE(c.name,'زبون') customer_name,COALESCE(c.is_default,true) customer_is_default,
        GREATEST(s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0) outstanding
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ),
    customer_payment_totals AS (
      SELECT customer_id,COALESCE(SUM(amount),0) total_paid
      FROM customer_payments GROUP BY customer_id
    )
    SELECT sb.*,
      CASE WHEN sb.customer_id IS NULL OR sb.customer_is_default THEN 0 ELSE GREATEST(
        COALESCE((SELECT SUM(GREATEST(s2.total-s2.paid-COALESCE((SELECT SUM(r2.total) FROM returns r2 WHERE r2.sale_id=s2.id),0),0))
                  FROM sales s2 WHERE s2.customer_id=sb.customer_id AND s2.status<>'cancelled'),0)
        -COALESCE(cpt.total_paid,0),0
      ) END AS customer_total_debt,
      CASE WHEN sb.customer_id IS NULL OR sb.customer_is_default THEN 0 ELSE GREATEST(
        sb.outstanding-
        GREATEST(LEAST(
          COALESCE(cpt.total_paid,0)-COALESCE((SELECT SUM(GREATEST(s2.total-s2.paid-COALESCE((SELECT SUM(r2.total) FROM returns r2 WHERE r2.sale_id=s2.id),0),0))
                                                FROM sales s2
                                                WHERE s2.customer_id=sb.customer_id AND s2.status<>'cancelled'
                                                  AND (s2.created_at<sb.created_at OR (s2.created_at=sb.created_at AND s2.id<sb.id))),0),
          sb.outstanding
        ),0),0
      ) END AS customer_invoice_debt
    FROM sale_base sb
    LEFT JOIN customer_payment_totals cpt ON cpt.customer_id=sb.customer_id
    ORDER BY sb.created_at DESC
    LIMIT $${params.length}
  `, params);
  if (!result.rows.length) return [];
  const saleIds=result.rows.map(r=>r.id);
  const itemRows=(await query(`SELECT id,sale_id,product_id AS product_id,product_name AS name,barcode,unit_price AS price,purchase_price,quantity,line_total,item_type FROM sale_items WHERE sale_id = ANY($1::uuid[]) ORDER BY sale_id,id`, [saleIds])).rows;
  const itemsBySale=new Map();
  for(const item of itemRows){
    const key=String(item.sale_id);
    if(!itemsBySale.has(key)) itemsBySale.set(key,[]);
    itemsBySale.get(key).push(item);
  }
  return result.rows.map(s => ({
    ...s,
    customer_previous_debt: money(Math.max(0, Number(s.customer_total_debt||0) - Number(s.customer_invoice_debt||0))),
    customer_total_debt: money(s.customer_total_debt||0),
    customer_invoice_debt: money(s.customer_invoice_debt||0),
    items: itemsBySale.get(String(s.id)) || []
  }));
}

export async function updateSale(id,payload) {
  if (!Array.isArray(payload.items) || !payload.items.length) throw Object.assign(new Error('الفاتورة لا تحتوي على عناصر.'),{statusCode:400});
  return withTransaction(async client=>{
    const existing=(await client.query(`SELECT * FROM sales WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!existing) throw Object.assign(new Error('الفاتورة غير موجودة.'),{statusCode:404});
    const oldCustomerId=existing.customer_id;
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
    await client.query(`INSERT INTO payments(sale_id,method,amount,user_id) VALUES($1,$2,$3,$4)`,[id,payload.paymentMethod||existing.payment_method,paid,payload.userId||existing.user_id]);
    const oldIsCash = ['cash','نقدي'].includes(String(existing.payment_method||'cash').toLowerCase());
    const newIsCash = ['cash','نقدي'].includes(String(payload.paymentMethod||existing.payment_method||'cash').toLowerCase());
    if (oldIsCash && Number(existing.paid) > 0) {
      await recordCashMovement(client,{type:'CANCEL',amount:Math.min(Number(existing.paid),Number(existing.total)),referenceType:'sale',referenceId:id,note:'عكس قيمة الفاتورة قبل التعديل',userId:payload.userId||existing.user_id});
      if (newIsCash && Number(paid) > 0) await recordCashMovement(client,{type:'SALE',amount:Math.min(Number(paid),Number(total)),referenceType:'sale',referenceId:id,note:'قيمة الفاتورة بعد التعديل',userId:payload.userId||existing.user_id});
    } else if (newIsCash && Number(paid) > 0) {
      await recordCashMovement(client,{type:'SALE',amount:Math.min(Number(paid),Number(total)),referenceType:'sale',referenceId:id,note:'قيمة الفاتورة بعد التعديل',userId:payload.userId||existing.user_id});
    }
    if (oldCustomerId && oldCustomerId !== customerId) await rebalanceCustomerPaymentsTx(client, oldCustomerId);
    if (customerId) await rebalanceCustomerPaymentsTx(client, customerId);
    await logAuditTx(client,{userId:payload.userId||existing.user_id,action:'SALE_UPDATED',entityType:'sale',entityId:id,payload:{invoice_number:existing.invoice_number,old_customer_id:oldCustomerId,new_customer_id:customerId,total,paid}});
    return updated;
  });
}
