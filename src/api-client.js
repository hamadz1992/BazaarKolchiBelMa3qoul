const API_BASE=(import.meta.env.VITE_API_URL||'http://127.0.0.1:8787/api').replace(/\/$/,'');
const TOKEN_KEY='bazaar_api_token';
export const apiToken=()=>localStorage.getItem(TOKEN_KEY)||'';
export async function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};const token=apiToken();if(token)headers.Authorization=`Bearer ${token}`;const controller=new AbortController();const timeoutMs=options.timeoutMs||15000;const timer=setTimeout(()=>controller.abort(),timeoutMs);let r;try{r=await fetch(`${API_BASE}${path}`,{...options,headers,signal:controller.signal});}catch(e){if(e?.name==='AbortError')throw new Error(`انتهت مهلة الاتصال بالخادم (${path})`);throw new Error(e?.message||'تعذر الاتصال بالخادم');}finally{clearTimeout(timer);}let body={};try{body=await r.json()}catch{}
if(!r.ok){
  // A saved desktop token can expire while the UI still considers the user
  // authenticated. Clear it on a 401 and notify the React shell so protected
  // gates (especially the cash register) never get stuck on "يجب تسجيل الدخول".
  if(r.status===401 && token){
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('bazaar_current_user');
    try{window.desktopAPI?.setAuthToken?.('')}catch{}
    try{window.dispatchEvent(new CustomEvent('auth:expired'))}catch{}
  }
  throw new Error(body.error||body.message||`HTTP ${r.status}`);
}
return body.data;}
export async function login(username,password){const d=await api('/auth/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem(TOKEN_KEY,d.token);localStorage.setItem('bazaar_current_user',JSON.stringify(d.user));try{window.desktopAPI?.setAuthToken?.(d.token)}catch{};return d;}
export async function logout(){try{await api('/auth/logout',{method:'POST'})}finally{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem('bazaar_current_user')}}
export const apiEnabled=()=>true;
export {API_BASE};
