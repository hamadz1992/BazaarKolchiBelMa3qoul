import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardList, Search } from "lucide-react";
import { api, apiEnabled } from "./api-client.js";
import Pagination from "./Pagination.jsx";
import { subscribeDataChanged, affectsDomains, DATA_DOMAINS } from "./data-events.js";
import "./inventory-movements.css";

export default function InventoryHistoryView() {
  const remote = apiEnabled();
  const [movements, setMovements] = useState([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 10;

  const refresh = async () => {
    if (!remote) { setMovements([]); setLoading(false); return; }
    try {
      setLoading(true);
      const rows = await api('/inventory/movements');
      setMovements((Array.isArray(rows) ? rows : []).map(m => ({
        id: m.id,
        type: (m.type === 'ADJUSTMENT_IN' || m.type === 'OPENING' || m.type === 'RETURN' || Number(m.quantity || 0) > 0) ? 'in' : 'out',
        productName: m.product_name || '—',
        quantity: Math.abs(Number(m.quantity || 0)),
        note: m.note || '',
        time: m.created_at ? new Date(m.created_at).toLocaleString('ar-DZ') : '—',
      })));
    } catch {
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    if (!remote) return;
    const remove = subscribeDataChanged((event) => {
      if (affectsDomains(event, [DATA_DOMAINS.INVENTORY, DATA_DOMAINS.SALES, DATA_DOMAINS.PRODUCTS])) refresh();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { remove?.(); document.removeEventListener('visibilitychange', onVisible); };
  }, [remote]);

  const filtered = useMemo(
    () => movements.filter(m => `${m.productName} ${m.note} ${m.type}`.toLowerCase().includes(query.toLowerCase())),
    [movements, query]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div className="movementsView inventoryHistoryView" dir="rtl">
      <div className="movementsHeader">
        <div><h1><ClipboardList size={28}/> سجل حركات المخزون</h1><p>السجل الكامل لحركات الإدخال والإخراج والمرتجعات</p></div>
      </div>

      <section className="movementPanel historyOnly">
        <div className="movementToolbar">
          <div className="movementSearch"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم السلعة أو الملاحظة..." /></div>
        </div>

        {loading ? <div className="historyEmpty">جاري تحميل السجل...</div> : filtered.length ? (
          <div className="historyTable">
            <div className="historyTableHeader" aria-hidden="true">
              <div>السلعة</div>
              <div>التفاصيل</div>
              <div>الكمية</div>
              <div>التاريخ و الساعة</div>
            </div>

            <div className="historyList">
              {pageRows.map(m => (
                <div className="historyRow" key={m.id}>
                  <div className="historyProduct">
                    <span className={`historyIcon ${m.type}`}>
                      {m.type === 'in' ? <ArrowDownToLine size={16}/> : <ArrowUpFromLine size={16}/>}
                    </span>
                    <strong>{m.productName}</strong>
                  </div>

                  <div className="historyDetails">
                    <span>{m.type === 'in' ? 'إدخال مخزون' : 'إخراج مخزون'}</span>
                    <small>{m.note || 'بدون ملاحظة'}</small>
                  </div>

                  <b className={m.type}>{m.type === 'in' ? '+' : '−'}{m.quantity}</b>

                  <time>{m.time}</time>
                </div>
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              onChange={setPage}
              pageSize={pageSize}
            />
          </div>
        ) : <div className="historyEmpty">لا توجد حركات مخزون مطابقة.</div>}
      </section>
    </div>
  );
}
