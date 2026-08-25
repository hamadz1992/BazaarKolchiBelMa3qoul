import { query, withTransaction } from './db.mjs';

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function isCashType(type) {
  return ['cash', 'نقدي'].includes(String(type || 'cash').toLowerCase());
}

function movementDeltaSql(alias = '') {
  const a = alias ? `${alias}.` : '';
  return `CASE
    WHEN ${a}type IN ('SALE','CUSTOMER_PAYMENT','MANUAL_IN') THEN ${a}amount
    WHEN ${a}type IN ('EXPENSE','RETURN','CANCEL','MANUAL_OUT') THEN -${a}amount
    WHEN ${a}type='EXPENSE_REVERSAL' THEN ${a}amount
    ELSE 0
  END`;
}

export async function getOpenCashSession(client, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const r = await client.query(`SELECT * FROM cash_sessions WHERE status='open' ORDER BY opened_at DESC LIMIT 1${suffix}`);
  return r.rows[0] || null;
}


export async function getCashSessionForMovement(client,{lock=false}={}){
  const session=await getOpenCashSession(client,{lock});
  return session || null;
}

export async function recordCashMovement(client,{type,amount,referenceType=null,referenceId=null,note=null,userId=null,sessionId=null}){
  const value=money(amount);
  if(!(value>0)) return null;
  const session=sessionId ? {id:sessionId} : await getCashSessionForMovement(client,{lock:true});
  const hasSession=Boolean(session?.id);
  const effectiveType=hasSession ? type : (type==='EXPENSE' || type==='RETURN' || type==='CANCEL' || type==='MANUAL_OUT' || type==='EXPENSE_REVERSAL' ? 'HISTORICAL_ADJUSTMENT_OUT' : 'HISTORICAL_ADJUSTMENT_IN');
  const movementNote=hasSession ? note : `تسوية تاريخية: ${note || type}`;
  return (await client.query(`INSERT INTO cash_movements(session_id,type,amount,reference_type,reference_id,note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[session?.id||null,effectiveType,value,referenceType,referenceId,movementNote,userId])).rows[0];
}

export async function requireOpenCashSession(client, options = {}) {
  const session = await getOpenCashSession(client, options);
  if (!session) {
    const error = new Error('لا توجد جلسة صندوق مفتوحة. استخدم الحركة كـتسوية تاريخية.');
    error.statusCode = 409;
    throw error;
  }
  return session;
}

async function getSessionSummary(client, sessionId) {
  const r = await client.query(`
    SELECT
      COALESCE(SUM(${movementDeltaSql('cm')}),0) AS movement_delta,
      COALESCE(SUM(CASE WHEN cm.type='SALE' THEN cm.amount ELSE 0 END),0) AS sales,
      COALESCE(SUM(CASE WHEN cm.type='CUSTOMER_PAYMENT' THEN cm.amount ELSE 0 END),0) AS customer_payments,
      COALESCE(SUM(CASE WHEN cm.type='EXPENSE' THEN cm.amount ELSE 0 END),0) AS expenses,
      COALESCE(SUM(CASE WHEN cm.type='RETURN' THEN cm.amount ELSE 0 END),0) AS returns,
      COALESCE(SUM(CASE WHEN cm.type='CANCEL' THEN cm.amount ELSE 0 END),0) AS cancels
    FROM cash_movements cm
    WHERE cm.session_id=$1
      AND NOT (cm.type='MANUAL_IN' AND cm.reference_type='cash_session')`,
    [sessionId]
  );
  const x = r.rows[0] || {};
  return {
    movementDelta: money(x.movement_delta),
    sales: money(x.sales),
    customerPayments: money(x.customer_payments),
    expenses: money(x.expenses),
    returns: money(x.returns),
    cancels: money(x.cancels),
  };
}

export async function getCash() {
  const open = await query(`SELECT * FROM cash_sessions WHERE status='open' ORDER BY opened_at DESC LIMIT 1`);
  const session = open.rows[0] || null;
  if (!session) {
    const historicalMovements = await query(`SELECT id,type,amount,reference_type,reference_id,note,user_id,created_at FROM cash_movements WHERE session_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`);
    return {
      session: null,
      balance: 0,
      expectedBalance: 0,
      sales: 0,
      customerPayments: 0,
      expenses: 0,
      returns: 0,
      cancels: 0,
      movements: [],
      historicalMovements: historicalMovements.rows,
    };
  }

  const summary = await query(`
    SELECT
      COALESCE(SUM(${movementDeltaSql('cm')}),0) AS movement_delta,
      COALESCE(SUM(CASE WHEN cm.type='SALE' THEN cm.amount ELSE 0 END),0) AS sales,
      COALESCE(SUM(CASE WHEN cm.type='CUSTOMER_PAYMENT' THEN cm.amount ELSE 0 END),0) AS customer_payments,
      COALESCE(SUM(CASE WHEN cm.type='EXPENSE' THEN cm.amount ELSE 0 END),0) AS expenses,
      COALESCE(SUM(CASE WHEN cm.type='RETURN' THEN cm.amount ELSE 0 END),0) AS returns,
      COALESCE(SUM(CASE WHEN cm.type='CANCEL' THEN cm.amount ELSE 0 END),0) AS cancels
    FROM cash_movements cm
    WHERE cm.session_id=$1
      AND NOT (cm.type='MANUAL_IN' AND cm.reference_type='cash_session')`,
    [session.id]
  );
  const x = summary.rows[0] || {};
  const movements = await query(`
    SELECT id,type,amount,reference_type,reference_id,note,user_id,created_at
    FROM cash_movements
    WHERE session_id=$1
    ORDER BY created_at DESC, id DESC
    LIMIT 200`, [session.id]);
  const historicalMovements = await query(`SELECT id,type,amount,reference_type,reference_id,note,user_id,created_at FROM cash_movements WHERE session_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`);
  const opening = money(session.opening_balance);
  const expectedBalance = money(opening + Number(x.movement_delta || 0));
  return {
    session,
    balance: expectedBalance,
    expectedBalance,
    sales: money(x.sales),
    customerPayments: money(x.customer_payments),
    expenses: money(x.expenses),
    returns: money(x.returns),
    cancels: money(x.cancels),
    movements: movements.rows,
    historicalMovements: historicalMovements.rows,
  };
}

export async function openCash(openingBalance, userId) {
  return withTransaction(async c => {
    const existing = await getOpenCashSession(c, { lock: true });
    if (existing) return existing;
    const opening = money(openingBalance);
    if (opening < 0) {
      const e = new Error('الرصيد الافتتاحي غير صالح.');
      e.statusCode = 400;
      throw e;
    }
    const s = await c.query(`
      INSERT INTO cash_sessions(opened_by,opening_balance,status)
      VALUES($1,$2,'open') RETURNING *`, [userId, opening]);
    if (opening > 0) {
      await c.query(`
        INSERT INTO cash_movements(session_id,type,amount,reference_type,note,user_id)
        VALUES($1,'MANUAL_IN',$2,'cash_session','رصيد افتتاحي',$3)`,
        [s.rows[0].id, opening, userId]);
    }
    return s.rows[0];
  });
}

export async function addCashMovement(type, amount, note, userId) {
  return withTransaction(async c => {
    const session = await requireOpenCashSession(c, { lock: true });
    const value = money(amount);
    if (!(value > 0)) {
      const e = new Error('مبلغ الحركة غير صالح.');
      e.statusCode = 400;
      throw e;
    }
    const sign = type === 'out' ? 'MANUAL_OUT' : 'MANUAL_IN';
    return (await c.query(`
      INSERT INTO cash_movements(session_id,type,amount,note,user_id)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [session.id, sign, value, note || null, userId])).rows[0];
  });
}

export async function closeCash(closingBalance, userId) {
  return withTransaction(async c => {
    const session = await requireOpenCashSession(c, { lock: true });
    const actual = money(closingBalance);
    if (actual < 0) {
      const e = new Error('الرصيد الفعلي غير صالح.');
      e.statusCode = 400;
      throw e;
    }
    const summary = await getSessionSummary(c, session.id);
    const expected = money(Number(session.opening_balance) + summary.movementDelta);
    const difference = money(actual - expected);
    const updated = (await c.query(`
      UPDATE cash_sessions
      SET status='closed',closed_at=now(),closed_by=$2,closing_balance=$3
      WHERE id=$1 RETURNING *`, [session.id, userId, actual])).rows[0];
    return { ...updated, expected_balance: expected, difference };
  });
}
