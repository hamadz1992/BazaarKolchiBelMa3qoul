import React, { useState } from "react";
import { Edit3, Plus, Ruler, Tags, Trash2 } from "lucide-react";
import "./catalog.css";

const seed = {
  categories: ["ملابس نسائية", "ملابس رجالية", "أواني منزلية", "تنظيف", "مستحضرات تجميل"],
  units: ["قطعة", "علبة", "كرتون", "زوج", "كغ", "لتر"]
};

function Manager({ type }) {
  const isCategories = type === "categories";
  const [items, setItems] = useState(seed[isCategories ? "categories" : "units"]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const Icon = isCategories ? Tags : Ruler;
  const title = isCategories ? "تصنيفات السلع" : "الوحدات";
  const subtitle = isCategories ? "إدارة التصنيفات المستخدمة في السلع" : "إدارة وحدات قياس وبيع السلع";

  const save = (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    if (editing !== null) setItems(prev => prev.map((item, i) => i === editing ? value : item));
    else if (!items.includes(value)) setItems(prev => [...prev, value]);
    setName(""); setEditing(null);
  };
  const edit = (i) => { setEditing(i); setName(items[i]); };
  const remove = (i) => { if (window.confirm(`هل تريد حذف ${items[i]}؟`)) setItems(prev => prev.filter((_, index) => index !== i)); };

  return <div className="catalogView" dir="rtl">
    <div className="catalogHeader"><div><h1>{title}</h1><p>{subtitle}</p></div><span className="catalogIcon"><Icon size={24}/></span></div>
    <section className="catalogCard">
      <form className="catalogForm" onSubmit={save}><label>{editing === null ? `إضافة ${isCategories ? "تصنيف" : "وحدة"}` : `تعديل ${isCategories ? "التصنيف" : "الوحدة"}`}<input value={name} onChange={e => setName(e.target.value)} placeholder={isCategories ? "مثال: ملابس أطفال" : "مثال: صندوق"}/></label><button className="primaryAction" type="submit"><Plus size={18}/>{editing === null ? "إضافة" : "حفظ"}</button>{editing !== null && <button type="button" className="cancelBtn" onClick={() => {setEditing(null);setName("")}}>إلغاء</button>}</form>
      <div className="catalogList">{items.map((item,i)=><div className="catalogRow" key={`${item}-${i}`}><div><Icon size={18}/><strong>{item}</strong></div><span>{isCategories ? `${i + 1}` : "وحدة"}</span><div className="rowActions"><button onClick={() => edit(i)} title="تعديل"><Edit3 size={16}/></button><button onClick={() => remove(i)} title="حذف"><Trash2 size={16}/></button></div></div>)}</div>
    </section>
  </div>;
}

export function CategoriesView() { return <Manager type="categories"/>; }
export function UnitsView() { return <Manager type="units"/>; }
