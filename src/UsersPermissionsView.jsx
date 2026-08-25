import React,{useState} from "react";
import {Users,ShieldCheck} from "lucide-react";
import UsersView from "./UsersView.jsx";
import PermissionsView from "./PermissionsView.jsx";
import "./users-permissions.css";

export default function UsersPermissionsView(){
  const [tab,setTab]=useState("users");
  return <div className="usersPermissionsView" dir="rtl">
    <div className="usersPermissionsTabs" role="tablist" aria-label="المستخدمون والصلاحيات">
      <button type="button" className={tab==="users"?"active":""} onClick={()=>setTab("users")} role="tab" aria-selected={tab==="users"}>
        <Users size={18}/> المستخدمون
      </button>
      <button type="button" className={tab==="permissions"?"active":""} onClick={()=>setTab("permissions")} role="tab" aria-selected={tab==="permissions"}>
        <ShieldCheck size={18}/> الصلاحيات
      </button>
    </div>
    <div className="usersPermissionsContent">
      {tab==="users"?<UsersView/>:<PermissionsView/>}
    </div>
  </div>;
}
