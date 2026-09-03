/* Bazaar Kolchi Bel Ma3qoul - fixed cloud rendezvous loader.
 * Loaded before mobile.js. It refreshes the current Quick Tunnel URL and stores
 * it in localStorage so the existing automatic connection logic can use it.
 */
(function(){
  const URL='https://hamadz1992.github.io/BazaarKolchiBelMa3qoul/remote.json';
  const KEY='bazaar_cloud_api_url';
  const normalize=v=>String(v||'').trim().replace(/\/$/,'');
  async function refresh(){
    try{
      const r=await fetch(URL+'?t='+Date.now(),{cache:'no-store',headers:{Accept:'application/json'}});
      if(!r.ok)return;
      const d=await r.json();
      const raw=typeof d==='string'?d:(d?.url||d?.cloudUrl||d?.publicUrl||d?.apiUrl||'');
      const v=normalize(raw);
      if(!v)return;
      const api=v.endsWith('/api')?v:v+'/api';
      localStorage.setItem(KEY,api);
      try{window.AndroidAuth?.saveCloudApi?.(api)}catch(_){ }
    }catch(_){ }
  }
  window.__BAZAAR_REFRESH_RENDEZVOUS__=refresh;
  document.addEventListener('DOMContentLoaded',function(){
    const btn=document.getElementById('loginBtn');
    if(!btn)return;
    let busy=false;
    btn.addEventListener('click',async function(e){
      if(busy)return;
      busy=true;
      e.preventDefault();
      e.stopImmediatePropagation();
      try{await refresh();}finally{busy=false;btn.click();}
    },true);
  },true);
  refresh();
})();
