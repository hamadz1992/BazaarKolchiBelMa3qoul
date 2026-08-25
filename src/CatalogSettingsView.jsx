import React, { useEffect, useState } from "react";
import { ArrowRight, Edit3, Plus, Ruler, Tags, Trash2 } from "lucide-react";
import "./catalog.css";
import { api, apiEnabled } from "./api-client.js";

function Manager({ type }) {
  const isCategories = type === "categories";
  const remote = apiEnabled();
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const Icon = isCategories ? Tags : Ruler;
  const title = isCategories ? "تصنيفات السلع" : "الوحدات";
  const subtitle = isCategories ? "إدارة التصنيفات المستخدمة في السلع" : "إدارة وحدات قياس وبيع السلع";

  const refresh = async () => {
    setLoadError("");
    try {
      const data = await api(isCategories ? "/catalog/categories" : "/catalog/units");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
      setLoadError(e?.message || "تعذر تحميل البيانات من PostgreSQL.");
    }
  };

  useEffect(() => {
    refresh();
  }, [remote, isCategories]);

  const save = async (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    try {
      if (editing) {
        await api(`${isCategories ? "/catalog/categories" : "/catalog/units"}/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: value, symbol: value }),
        });
      } else {
        await api(isCategories ? "/catalog/categories" : "/catalog/units", {
          method: "POST",
          body: JSON.stringify({ name: value, symbol: value }),
        });
      }
      await refresh();
      setName("");
      setEditing(null);
    } catch (err) {
      window.alert(err?.message || "تعذر الحفظ");
    }
  };

  const edit = (index) => {
    const item = items[index];
    setEditing(item);
    setName(item?.name || "");
  };

  const remove = async (index) => {
    const item = items[index];
    if (!item || !window.confirm(`هل تريد حذف ${item.name}؟`)) return;
    try {
      await api(`${isCategories ? "/catalog/categories" : "/catalog/units"}/${item.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      window.alert(err?.message || "تعذر الحذف");
    }
  };

  return (
    <div className="catalogView" dir="rtl">
      <div className="catalogHeader">
        <div className="catalogTitleRow">
          <button className="backToProducts" onClick={() => window.dispatchEvent(new CustomEvent("app:navigate", { detail: { key: "products" } }))}>
            <ArrowRight size={17} /> العودة إلى السلع
          </button>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <span className="catalogIcon"><Icon size={24} /></span>
      </div>

      {loadError && <div className="catalogError">{loadError}<button onClick={refresh}>إعادة المحاولة</button></div>}

      <section className="catalogCard">
        <form className="catalogForm" onSubmit={save}>
          <label>
            {editing ? `تعديل ${isCategories ? "التصنيف" : "الوحدة"}` : `إضافة ${isCategories ? "تصنيف" : "وحدة"}`}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isCategories ? "مثال: ملابس أطفال" : "مثال: صندوق"} />
          </label>
          <button className="primaryAction" type="submit"><Plus size={18} />{editing ? "حفظ" : "إضافة"}</button>
          {editing && <button type="button" className="cancelBtn" onClick={() => { setEditing(null); setName(""); }}>إلغاء</button>}
        </form>

        <div className="catalogList">
          {items.map((item, index) => (
            <div className="catalogRow" key={item.id || `${item.name}-${index}`}>
              <div><Icon size={18} /><strong>{item.name}</strong></div>
              <span>{isCategories ? index + 1 : "وحدة"}</span>
              <div className="rowActions">
                <button onClick={() => edit(index)} title="تعديل"><Edit3 size={16} /></button>
                <button onClick={() => remove(index)} title="حذف"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CategoriesView() {
  return <Manager type="categories" />;
}

export function UnitsView() {
  return <Manager type="units" />;
}
