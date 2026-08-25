import { withTransaction } from './db.mjs';
import { recordCashMovement } from './cash.mjs';
import {rebalanceCustomerPaymentsTx} from './customers.mjs';
import {logAuditTx} from './audit.mjs';
export async function createReturn(saleId,items,reason,userId){return withTransaction(async c=>{const sale=await c.query(`SELECT * FROM sales WHERE id=$1 FOR UPDATE`,[saleId]);if(!sale.rows[0]){const e=new Error('الفاتورة غير موجودة.');e.statusCode=404;throw e;}if(sale.rows[0].status==='cancelled'){const e=new Error('لا يمكن إرجاع فاتورة ملغاة.');e.statusCode=409;throw e;}let total=0;const normalized=[];for(const x of (items||[])){const si=await c.query(`SELECT * FROM sale_items WHERE id=$1 AND sale_id=$2 FOR UPDATE`,[x.saleItemId,saleId]);if(!si.rows[0])continue;if(si.rows[0].item_type!=='product')continue;const returned=await c.query(`SELECT COALESCE(SUM(quantity),0) q FROM return_items WHERE sale_item_id=$1`,[x.saleItemId]);const already=Number(returned.rows[0].q||0);const qty=Number(x.quantity);if(qty<=0||already+qty>Number(si.rows[0].quantity)){const e=new Error('كمية المرتجع أكبر من الكمية المباعة.');e.statusCode=409;throw e;}const line=Number(si.rows[0].unit_price)*qty;total+=line;normalized.push({si:si.rows[0],qty,line});}
const ret=await c.query(`INSERT INTO returns(sale_id,customer_id,user_id,reason,total) VALUES($1,$2,$3,$4,$5) RETURNING *`,[saleId,sale.rows[0].customer_id,userId,reason||null,total]);
for(const x of normalized){await c.query(`INSERT INTO return_items(return_id,sale_item_id,product_id,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6)`,[ret.rows[0].id,x.si.id,x.si.product_id,x.qty,x.si.unit_price,x.line]);await c.query(`UPDATE products SET current_stock=current_stock+$1,updated_at=now() WHERE id=$2`,[x.qty,x.si.product_id]);await c.query(`INSERT INTO stock_movements(product_id,type,quantity,reference_type,reference_id,note,user_id) VALUES($1,'RETURN',$2,'return',$3,$4,$5)`,[x.si.product_id,x.qty,ret.rows[0].id,reason||'مرتجع',userId]);}
const all=await c.query(`SELECT si.quantity,COALESCE((SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.sale_item_id=si.id),0) returned FROM sale_items si WHERE si.sale_id=$1 AND si.item_type='product'`,[saleId]);const complete=all.rows.length && all.rows.every(x=>Number(x.returned)>=Number(x.quantity));await c.query(`UPDATE sales SET status=$2 WHERE id=$1`,[saleId,complete?'returned':'partially_returned']);

if(sale.rows[0].customer_id) await rebalanceCustomerPaymentsTx(c,sale.rows[0].customer_id);

if(total>0 && ['cash','نقدي'].includes(String(sale.rows[0].payment_method||'cash').toLowerCase())){
  const priorReturns=Number((await c.query(`SELECT COALESCE(SUM(r.total),0) v FROM returns r WHERE r.sale_id=$1 AND r.id<>$2`,[saleId,ret.rows[0].id])).rows[0]?.v||0);
  const cashPaid=Math.min(Number(sale.rows[0].paid||0),Number(sale.rows[0].total||0));
  const debtCoveredByReturns=Math.max(0,Number(sale.rows[0].total||0)-cashPaid);
  const cumulativeCashRefund=Math.max(0,priorReturns+total-debtCoveredByReturns);
  const priorCashRefunds=Number((await c.query(`SELECT COALESCE(SUM(CASE WHEN cm.type='RETURN' THEN cm.amount ELSE 0 END),0) v FROM cash_movements cm WHERE cm.reference_type='return' AND cm.reference_id IN (SELECT id FROM returns WHERE sale_id=$1 AND id<>$2)`,[saleId,ret.rows[0].id])).rows[0]?.v||0);
  const cashRefund=Math.max(0,cumulativeCashRefund-priorCashRefunds);
  if(cashRefund>0){
    await recordCashMovement(c,{type:'RETURN',amount:cashRefund,referenceType:'return',referenceId:ret.rows[0].id,note:'مرتجع نقدي',userId});
  }
}
await logAuditTx(c,{userId,action:'SALE_RETURN',entityType:'return',entityId:ret.rows[0].id,payload:{sale_id:saleId,total,reason:reason||null}});
return ret.rows[0];});}
