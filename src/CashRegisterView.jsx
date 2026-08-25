import React, { useEffect, useMemo, useState } from 'react';
import { WalletCards, Plus, Minus, Save, ShoppingCart, Receipt, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import './cash-register.css';
import { api, apiEnabled } from './api-client.js';
import {subscribeDataChanged,affectsDomains,emitDataChanged,DATA_DOMAINS} from './data-events.js';

const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, useGrouping: false });
const movementLabel = type => ({
  SALE: 'بيع نقدي',
  CUSTOMER_PAYMENT: 'دفعة من العميل',
  EXPENSE: 'مصروف',
  EXPENSE_REVERSAL: 'عكس مصروف',
  RETURN: 'مرتجع',
  CANCEL: 'إلغاء/عكس بيع',
  MANUAL_IN: 'إدخال نقدية',
  MANUAL_OUT: 'إخراج نقدية',
  HISTORICAL_ADJUSTMENT_IN: 'تسوية تاريخية (دخول)',
  HISTORICAL_ADJUSTMENT_OUT: 'تسوية تاريخية (خروج)',
}[type] || type || 'حركة نقدية');
const movementDirection = type => ['SALE', 'CUSTOMER_PAYMENT', 'MANUAL_IN', 'EXPENSE_REVERSAL', 'HISTORICAL_ADJUSTMENT_IN'].includes(type) ? 'in' : 'out';

export default function CashRegisterView() {
  const remote = apiEnabled();
  const [data, setData] = useState({ opening: 0, entries: [] });
  const [remoteCash, setRemoteCash] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState('in');
  const [opening, setOpening] = useState(String(data.opening || 0));
  const [closing, setClosing] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!remote) return;
    const result = await api('/cash');
    setRemoteCash(result);
    if (result?.session) {
      setOpening(String(Number(result.session.opening_balance || 0)));
      setClosing(String(Number(result.expectedBalance || 0)));
    }
  };

  useEffect(() => {
    refresh().catch(() => {});
    const onCashUpdated = () => refresh().catch(() => {});
    const onWindowMessage = (event) => {
      if (event?.origin === window.location.origin && event?.data?.type === 'bazaar-cash-updated') onCashUpdated();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh().catch(() => {}); };
    window.addEventListener('bazaar:cash-updated', onCashUpdated);
    window.addEventListener('storage', onCashUpdated);
    window.addEventListener('message', onWindowMessage);
    document.addEventListener('visibilitychange', onVisible);
    const removeDesktopListener = window.desktopAPI?.onCashUpdated?.(onCashUpdated) || (() => {});
    const removeUnified = subscribeDataChanged((event)=>{ if(affectsDomains(event,[DATA_DOMAINS.SALES,DATA_DOMAINS.CASH,DATA_DOMAINS.CUSTOMERS,DATA_DOMAINS.EXPENSES])) onCashUpdated(); });
    let channel = null;
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('bazaar-cash-updates');
        channel.onmessage = onCashUpdated;
      }
    } catch {}
    return () => {
      window.removeEventListener('bazaar:cash-updated', onCashUpdated);
      window.removeEventListener('storage', onCashUpdated);
      window.removeEventListener('message', onWindowMessage);
      document.removeEventListener('visibilitychange', onVisible);
      removeDesktopListener();
      removeUnified?.();
      try { channel?.close(); } catch {}
    };
  }, [remote]);

  const saveOpening = async () => {
    const value = Number(opening);
    if (!Number.isFinite(value) || value < 0) return;
    try {
      setBusy(true); setMessage('');
      if (remote) {
        await api('/cash/open', { method: 'POST', body: JSON.stringify({ openingBalance: value }) });
        await refresh();
        emitDataChanged([DATA_DOMAINS.CASH,DATA_DOMAINS.REPORTS], {source:'cash-open'});
      }
      setMessage('تم حفظ الصندوق.');
    } catch (err) { setMessage(err?.message || 'تعذر فتح الصندوق'); }
    finally { setBusy(false); }
  };

  const add = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      setBusy(true); setMessage('');
      if (remote) {
        await api('/cash/movement', { method: 'POST', body: JSON.stringify({ type, amount: n, note: note.trim() }) });
        await refresh();
        emitDataChanged([DATA_DOMAINS.CASH,DATA_DOMAINS.REPORTS], {source:'cash-movement'});
      }
      setAmount(''); setNote('');
    } catch (err) { setMessage(err?.message || 'تعذر حفظ الحركة'); }
    finally { setBusy(false); }
  };

  const close = async () => {
    const value = Number(closing);
    if (!remote || !Number.isFinite(value) || value < 0 || !remoteCash?.session) return;
    try {
      setBusy(true); setMessage('');
      const result = await api('/cash/close', { method: 'POST', body: JSON.stringify({ closingBalance: value }) });
      setRemoteCash({ session: null, balance: 0, expectedBalance: 0, sales: 0, customerPayments: 0, expenses: 0, returns: 0, cancels: 0, movements: [], closedSession: result });
      setOpening('0'); setClosing('0');
      setMessage(`تم إغلاق الصندوق. الفرق: ${money(result.difference)} دج`);
    } catch (err) { setMessage(err?.message || 'تعذر إغلاق الصندوق'); }
    finally { setBusy(false); }
  };

  const localBalance = useMemo(() => {
    const sales = 0;
    const manualIn = data.entries.filter(x => x.type === 'in').reduce((s, x) => s + Number(x.amount || 0), 0);
    const manualOut = data.entries.filter(x => x.type === 'out').reduce((s, x) => s + Number(x.amount || 0), 0);
    return Number(data.opening || 0) + sales + manualIn - manualOut;
  }, [data]);

  const balance = Number(remoteCash?.balance || 0);
  const sessionOpen = Boolean(remoteCash?.session);
  const movements = remoteCash?.movements || [];

  return <div className="cashView">
    <div className="cashHeader">
      <div>
        <h1><WalletCards/> الصندوق</h1>
        <p>متابعة الرصيد وحركات النقدية والمبالغ المرتبطة بالمبيعات والمصاريف.</p>
      </div>
    </div>

    {/* الشريط العلوي: 3 بطاقات في سطر واحد وعلى كامل العرض */}
    <section className="cashStats">
      <article>
        <span>الرصيد الحالي</span>
        <strong>{money(balance)} دج</strong>
      </article>
      <article>
        <span>مبيعات نقدية</span>
        <strong>{money(remoteCash?.sales || 0)} دج</strong>
      </article>
      <article>
        <span>مصاريف مسجلة</span>
        <strong>{money(remoteCash?.expenses || 0)} دج</strong>
      </article>
    </section>

    <div className="cashMainLayout">
      {/* اليسار: آخر الحركات */}
      <section className="cashHistoryColumn">
        <section className="cashCard history">
          <div className="cashSectionTitle">
            <h2>آخر الحركات</h2>
            <span>{movements.length}</span>
          </div>

          {movements.length === 0 ? (
            <p className="empty">لا توجد حركات نقدية في الجلسة الحالية.</p>
          ) : (
            <div className="cashTable">
              {movements.map(x => {
                const inMovement = movementDirection(x.type) === 'in';
                return (
                  <div className="cashLine" key={x.id}>
                    <span className={inMovement ? 'in' : 'out'}>
                      {inMovement ? <Plus size={15}/> : <Minus size={15}/>}
                    </span>
                    <div>
                      <strong>{movementLabel(x.type)}</strong>
                      <small>
                        {x.note || 'بدون ملاحظة'} · {new Date(x.created_at).toLocaleString('ar-DZ')}
                      </small>
                    </div>
                    <b className={inMovement ? 'positive' : 'negative'}>
                      {inMovement ? '+' : '-'}{money(x.amount)} دج
                    </b>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>

      {/* اليمين: الصندوق المفتوح ثم الرصيد الافتتاحي ثم إضافة حركة */}
      <section className="cashRightColumn">
        {remote && (
          <section className="cashCard cashSessionCard">
            <div className="cashSessionTop">
              <div>
                <h2>{sessionOpen ? 'الصندوق مفتوح' : 'لا يوجد صندوق مفتوح'}</h2>
                <p>
                  {sessionOpen
                    ? `فتح برصيد ${money(remoteCash?.session?.opening_balance)} دج`
                    : 'افتح صندوقًا جديدًا قبل تسجيل أي حركة نقدية.'}
                </p>
              </div>
              <span className={sessionOpen ? 'cashStatus open' : 'cashStatus closed'}>
                {sessionOpen ? <><UnlockKeyhole size={16}/> مفتوح</> : <><LockKeyhole size={16}/> مغلق</>}
              </span>
            </div>

            {sessionOpen && (
              <div className="cashCloseRow">
                <div>
                  <span>الرصيد المتوقع</span>
                  <strong>{money(remoteCash?.expectedBalance)} دج</strong>
                </div>
                <input
                  type="number"
                  min="0"
                  value={closing}
                  onChange={e => setClosing(e.target.value)}
                  aria-label="الرصيد الفعلي عند إغلاق الصندوق"
                />
                <button onClick={close} disabled={busy}>
                  <LockKeyhole size={17}/> إغلاق الصندوق
                </button>
              </div>
            )}
          </section>
        )}

        <section className="cashCard">
          <h2>الرصيد الافتتاحي</h2>
          <p>المبلغ الموجود في الصندوق عند بداية العمل.</p>
          <div className="cashRow">
            <input
              type="number"
              min="0"
              value={opening}
              onChange={e => setOpening(e.target.value)}
              disabled={remote && sessionOpen}
            />
            <button onClick={saveOpening} disabled={busy || (remote && sessionOpen)}>
              <Save size={17}/> {sessionOpen ? 'الصندوق مفتوح' : 'فتح الصندوق'}
            </button>
          </div>
        </section>

        <section className="cashCard">
          <h2>إضافة حركة نقدية</h2>
          <div className="cashType">
            <button className={type === 'in' ? 'active' : ''} onClick={() => setType('in')}>
              <Plus size={16}/> إدخال
            </button>
            <button className={type === 'out' ? 'active' : ''} onClick={() => setType('out')}>
              <Minus size={16}/> إخراج
            </button>
          </div>
          <div className="cashForm">
            <input
              type="number"
              min="0"
              placeholder="المبلغ"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={remote && !sessionOpen}
            />
            <input
              placeholder="ملاحظة (اختياري)"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={remote && !sessionOpen}
            />
            <button onClick={add} disabled={busy || (remote && !sessionOpen)}>
              حفظ الحركة
            </button>
          </div>
        </section>

        {message && <div className="cashMessage">{message}</div>}
      </section>
    </div>
  </div>;
}
