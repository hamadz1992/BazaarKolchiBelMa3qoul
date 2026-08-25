import {query, withTransaction} from './db.mjs';
import { recordCashMovement } from './cash.mjs';
import { logAuditTx } from './audit.mjs';

function money(value){return Number(Number(value||0).toFixed(2));}

export async function getCustomerBalanceTx(db,customerId){
  if(!customerId)return 0;
  const r=await db.query(`
    SELECT GREATEST(
      COALESCE((SELECT SUM(GREATEST(
        s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0
      )) FROM sales s WHERE s.customer_id=$1 AND s.status<>'cancelled'),0)
      -COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id=$1),0),0
    ) AS balance
  `,[customerId]);
  return money(r.rows[0]?.balance||0);
}

export async function rebalanceCustomerPaymentsTx(client,customerId){
  if(!customerId)return;
  await client.query(`SELECT id FROM customers WHERE id=$1 FOR UPDATE`,[customerId]);

  await client.query(`
    DELETE FROM customer_payment_allocations
    WHERE customer_payment_id IN(
      SELECT id FROM customer_payments WHERE customer_id=$1
    )
  `,[customerId]);

  const payments=(await client.query(`
    SELECT id,amount
    FROM customer_payments
    WHERE customer_id=$1
    ORDER BY created_at,id
  `,[customerId])).rows;

  const sales=(await client.query(`
    SELECT s.id,
      GREATEST(
        s.total-s.paid-
        COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),
        0
      ) outstanding
    FROM sales s
    WHERE s.customer_id=$1
      AND s.status<>'cancelled'
    ORDER BY s.created_at,s.id
    FOR UPDATE
  `,[customerId])).rows;

  const remaining=new Map(
    sales.map(s=>[String(s.id),money(s.outstanding)])
  );

  for(const payment of payments){
    let left=money(payment.amount);

    for(const sale of sales){
      if(left<=0)break;

      const available=remaining.get(String(sale.id))||0;
      if(available<=0)continue;

      const amount=money(Math.min(left,available));
      if(amount<=0)continue;

      await client.query(`
        INSERT INTO customer_payment_allocations(customer_payment_id,sale_id,amount)
        VALUES($1,$2,$3)
      `,[payment.id,sale.id,amount]);

      remaining.set(String(sale.id),money(available-amount));
      left=money(left-amount);
    }
  }
}

export async function listCustomers(search=''){return (await query(`SELECT id,name,phone,address,note,is_default,active,created_at,updated_at FROM customers WHERE active=true AND is_default=false AND ($1='' OR name ILIKE $2 OR COALESCE(phone,'') ILIKE $2) ORDER BY name`,[search.trim(),`%${search.trim()}%`])).rows;}
export async function createCustomer(d){return (await query(`INSERT INTO customers(name,phone,address,note,is_default,active) VALUES($1,$2,$3,$4,false,true) RETURNING *`,[String(d.name||'').trim(),d.phone||null,d.address||null,d.note||null])).rows[0];}
export async function updateCustomer(id,d){return (await query(`UPDATE customers SET name=COALESCE($1,name),phone=$2,address=$3,note=$4,updated_at=now() WHERE id=$5 RETURNING *`,[d.name||null,d.phone||null,d.address||null,d.note||null,id])).rows[0];}

export async function listDebtors(){
  const customers=(await query(`SELECT id,name FROM customers WHERE active=true AND is_default=false ORDER BY name`)).rows;
  const result=[];
  for(const customer of customers){const balance=await getCustomerBalanceTx({query},customer.id);if(balance>0)result.push({...customer,balance});}
  return result.sort((a,b)=>Number(b.balance)-Number(a.balance)||String(a.name).localeCompare(String(b.name)));
}
async function customerLedgerSnapshot(id, clientLike = null) {
  const db = clientLike || { query };
  const rows = (await db.query(`
    WITH sale_base AS (
      SELECT s.id,s.invoice_number,s.created_at,s.total,s.paid,s.status,
        COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0) returned_total,
        GREATEST(s.total-s.paid-COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=s.id),0),0) outstanding
      FROM sales s
      WHERE s.customer_id=$1
    ),
    payment_totals AS (
      SELECT COALESCE(SUM(cp.amount),0) total_paid
      FROM customer_payments cp WHERE cp.customer_id=$1
    )
    SELECT sb.*,
      GREATEST(
        sb.outstanding-
        GREATEST(
          LEAST(
            pt.total_paid-COALESCE((
              SELECT SUM(sb2.outstanding) FROM sale_base sb2
              WHERE sb2.status<>'cancelled'
                AND (sb2.created_at<sb.created_at OR (sb2.created_at=sb.created_at AND sb2.id<sb.id))
            ),0),
            sb.outstanding
          ),0
        ),0
      ) AS remaining
    FROM sale_base sb CROSS JOIN payment_totals pt
    ORDER BY sb.created_at,sb.id
  `,[id])).rows;
  const payments = (await db.query(`
    SELECT id,amount,note,created_at
    FROM customer_payments
    WHERE customer_id=$1
    ORDER BY created_at,id
  `,[id])).rows;

  const ledger=[];
  let running=0;
  for(const sale of rows){
    if(sale.status==='cancelled'){
      ledger.push({type:'invoice',id:sale.id,invoice_number:sale.invoice_number,created_at:sale.created_at,description:`إلغاء الفاتورة ${sale.invoice_number}`,debit:0,credit:0,balance:money(running),status:sale.status});
      continue;
    }
    const returned=Number(sale.returned_total||0);
    const invoiceDebt=Math.max(0,Number(sale.total||0)-Number(sale.paid||0)-returned);
    const allocated=Math.max(0,invoiceDebt-Number(sale.remaining||0));
    const debit=money(invoiceDebt);
    running=money(running+debit);
    ledger.push({type:'invoice',id:sale.id,invoice_number:sale.invoice_number,created_at:sale.created_at,description:`فاتورة ${sale.invoice_number}`,debit,credit:0,balance:running,status:sale.status,total:money(sale.total),paid:money(sale.paid),returned:money(returned),allocated_payment:money(allocated),remaining:money(sale.remaining)});
  }
  // Payments reduce the running customer balance in chronological order.
  for(const payment of payments){
    const amount=money(payment.amount);
    running=money(Math.max(0,running-amount));
    ledger.push({type:'payment',id:payment.id,created_at:payment.created_at,description:'دفعة نقدية من العميل',debit:0,credit:amount,balance:running,note:payment.note||null});
  }
  // Keep all movements chronological for the UI, while retaining the balance calculated above.
  ledger.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
  let chronologicalBalance=0;
  for(const row of ledger){
    chronologicalBalance=money(Math.max(0,chronologicalBalance+Number(row.debit||0)-Number(row.credit||0)));
    row.balance=chronologicalBalance;
  }
  return {rows,payments,ledger,balance:money(chronologicalBalance)};
}

export async function customerDetails(id){
  const c=(await query(`SELECT id,name,phone,address,note,is_default,active FROM customers WHERE id=$1`,[id])).rows[0];
  if(!c) return null;
  const snapshot=await customerLedgerSnapshot(id);
  const sales=snapshot.rows;
  const payments=snapshot.payments;
  const balance=await getCustomerBalanceTx({query},id);
  return {...c,sales,payments,ledger:snapshot.ledger,balance};
}
export async function addCustomerPayment(id,amount,note,userId){
  return withTransaction(async c=>{
    const customer=(await c.query(`SELECT id,name,is_default FROM customers WHERE id=$1 AND active=true`,[id])).rows[0];
    if(!customer) throw Object.assign(new Error('العميل غير موجود.'),{statusCode:404});
    if(customer.is_default) throw Object.assign(new Error('العميل الافتراضي لا يملك حساب دين.'),{statusCode:400});
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0) throw Object.assign(new Error('مبلغ الدفعة غير صالح.'),{statusCode:400});
    const currentBalance=await getCustomerBalanceTx(c,id);
    if(value>currentBalance+0.009) throw Object.assign(new Error('مبلغ الدفعة أكبر من الدين المستحق.'),{statusCode:400});
    const r=await c.query(`INSERT INTO customer_payments(customer_id,amount,note,user_id) VALUES($1,$2,$3,$4) RETURNING *`,[id,value,note||null,userId||null]);
    // Re-allocate the payment immediately so invoice-level remaining debt and
    // any subsequent printed receipt reflect the new payment.
    await rebalanceCustomerPaymentsTx(c, id);
    await recordCashMovement(c,{type:'CUSTOMER_PAYMENT',amount:value,referenceType:'customer_payment',referenceId:r.rows[0].id,note:note||'دفعة من العميل',userId:userId||null});
    await logAuditTx(c,{userId,action:'CUSTOMER_PAYMENT',entityType:'customer_payment',entityId:r.rows[0].id,payload:{customer_id:id,amount:value,note:note||null}});
    return r.rows[0];
  });
}
