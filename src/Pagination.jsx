import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, totalPages, onChange, totalItems, pageSize = 10 }) {
  if (totalItems <= pageSize || totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  return <div className="paginationBar" dir="rtl">
    <button className="paginationBtn" disabled={page === 1} onClick={() => onChange(page - 1)} title="السابق"><ChevronRight size={16}/> السابق</button>
    <div className="paginationPages">
      {start > 1 && <><button className="paginationPage" onClick={() => onChange(1)}>1</button>{start > 2 && <span>…</span>}</>}
      {pages.map(n => <button key={n} className={`paginationPage ${n === page ? "active" : ""}`} onClick={() => onChange(n)}>{n}</button>)}
      {end < totalPages && <>{end < totalPages - 1 && <span>…</span>}<button className="paginationPage" onClick={() => onChange(totalPages)}>{totalPages}</button></>}
    </div>
    <button className="paginationBtn" disabled={page === totalPages} onClick={() => onChange(page + 1)} title="التالي">التالي <ChevronLeft size={16}/></button>
    <span className="paginationMeta">عرض {Math.min(totalItems, (page - 1) * pageSize + 1)}–{Math.min(totalItems, page * pageSize)} من {totalItems}</span>
  </div>;
}
