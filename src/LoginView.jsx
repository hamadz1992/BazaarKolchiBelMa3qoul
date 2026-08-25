import React, { useState } from "react";
import { LogIn, Store } from "lucide-react";
import { login } from "./api-client.js";
import "./login.css";

export default function LoginView({ onSuccess }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true); setError("");
    try { const result = await login(username.trim(), password); onSuccess?.(result.user); }
    catch (err) { setError(err?.message || "تعذر تسجيل الدخول."); }
    finally { setBusy(false); }
  };
  return <div className="loginView" dir="rtl"><form className="loginCard" onSubmit={submit}>
    <div className="loginLogo"><Store size={30}/></div><h1>كل شيء بالمعقول</h1><p>تسجيل الدخول إلى نقطة البيع</p>
    <label>اسم المستخدم<input autoFocus value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label>
    <label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
    {error&&<div className="loginError">{error}</div>}
    <button disabled={busy} type="submit"><LogIn size={18}/>{busy?"جاري الدخول...":"دخول"}</button>
  </form></div>;
}
