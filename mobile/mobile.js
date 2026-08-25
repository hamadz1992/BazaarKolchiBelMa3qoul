
const DB_NAME='bazaar-mobile-v2';
const $ = (id) => document.getElementById(id);
const API_KEY='bazaar_api_url';
const CLOUD_API_KEY='bazaar_cloud_api_url';
const TOKEN_KEY='bazaar_api_token';
const DEVICE_KEY='bazaar_device_id';
const MOBILE_CONFIG=window.__BAZAAR_MOBILE_CONFIG__||{};
const normalizeApi=(value)=>String(value||'').trim().replace(/\/$/,'');
const LOCAL_API_KEY='bazaar_local_api_url';
const WIFI_API_KEY='bazaar_wifi_api_url';
const CONNECTION_MODE_KEY='bazaar_connection_mode';
const configuredCloudApi=()=>normalizeApi(localStorage.getItem(CLOUD_API_KEY)||MOBILE_CONFIG.cloudApiUrl||'');
const configuredLocalApi=()=>normalizeApi(localStorage.getItem(LOCAL_API_KEY)||'');
const configuredWifiApi=()=>normalizeApi(localStorage.getItem(WIFI_API_KEY)||'');
const isLocalMobileHost=()=>['localhost','127.0.0.1','::1'].includes(location.hostname)||location.port==='4174';
const localApi=()=>'/api';
const connectionMode=()=>localStorage.getItem(CONNECTION_MODE_KEY)||'auto';
const privateHost=h=>{try{const a=String(h||'').split('.').map(Number);if(a.length!==4||a.some(n=>!Number.isInteger(n)||n<0||n>255))return false;return a[0]===10||(a[0]===192&&a[1]===168)||(a[0]===172&&a[1]>=16&&a[1]<=31)}catch{return false}};
const hostApi=(host)=>privateHost(host)?`http://${host}:8787/api`:'';
const currentHostApi=()=>hostApi(location.hostname);
const currentOriginApi=()=>isLocalMobileHost()?localApi():`${location.origin}/api`;
const discoveryCandidates=()=>uniqueCandidates([currentHostApi(),configuredLocalApi(),configuredWifiApi()]);
let discoveryBusy=false;
function nativeDiscoverComputer(){
  try{
    if(location.protocol!=='file:'||!window.AndroidAuth?.discoverComputer)return '';
    const base=String(window.AndroidAuth.discoverComputer()||'').trim().replace(/\/$/,'');
    if(!base)return '';
    const apiBase=base.endsWith('/api')?base:`${base}/api`;
    localStorage.setItem(WIFI_API_KEY,apiBase);
    localStorage.setItem(LOCAL_API_KEY,apiBase);
    return apiBase;
  }catch{return ''}
}
async function discoverComputer(){
  if(discoveryBusy)return null;
  const native=nativeDiscoverComputer();
  if(native)return native;
  discoveryBusy=true;
  try{
    const list=discoveryCandidates();
    for(const base of list){
      try{
        const c=new AbortController(); const t=setTimeout(()=>c.abort(),1800);
        const r=await fetch(`${base}/discovery`,{signal:c.signal,cache:'no-store'});
        clearTimeout(t);
        if(r.ok){
          const d=await r.json();
          if(d?.data?.service==='bazaar-pos'||d?.service==='bazaar-pos'){
            localStorage.setItem(WIFI_API_KEY,base);
            localStorage.setItem(LOCAL_API_KEY,base);
            return base;
          }
        }
      }catch{}
    }
  }finally{discoveryBusy=false;}
  return null;
}
const uniqueCandidates=list=>[...new Set(list.map(normalizeApi).filter(Boolean))];
const apiCandidates=()=>{
  const mode=connectionMode();
  const local= configuredLocalApi();
  const wifi= configuredWifiApi();
  const cloud=configuredCloudApi();
  if(mode==='local') return uniqueCandidates([local,currentOriginApi()]);
  if(mode==='wifi') return uniqueCandidates([wifi,local,currentOriginApi()]);
  if(mode==='cloud') return uniqueCandidates([cloud]);
  // Auto: prefer the currently reachable/local connection, then saved LAN,
  // then Wi-Fi address, and finally the cloud server.
  return uniqueCandidates([currentHostApi(),currentOriginApi(),local,wifi,cloud]);
};
const connectionLabel=base=>{
  if(!base)return 'غير متصل';
  const n=normalizeApi(base);
  if(n===normalizeApi(configuredCloudApi()))return 'سحابي';
  if(n===normalizeApi(configuredWifiApi()))return 'Wi-Fi';
  return 'محلي';
};
const money=v=>{const n=Number(v||0);if(!Number.isFinite(n))return '0.00';return n.toFixed(2);};
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const deviceId=()=>{let v=localStorage.getItem(DEVICE_KEY);if(!v){v=uid();localStorage.setItem(DEVICE_KEY,v)}return v};

let state={products:[],customers:[],sales:[],debtors:[],expenses:[],favorites:[],cash:null,user:null,online:navigator.onLine,connection:navigator.onLine?'unknown':'offline'};

// Hardware barcode scanners act as keyboards: on a non-QWERTY layout (AZERTY, Arabic digits, etc.)
// the digit keys they send can arrive as symbols instead of numbers. Normalize scanner input
// on the fields a scanner actually types into, the same way the desktop app already does.
const AZERTY_BARCODE_MAP={"&":"1","é":"2","\"":"3","'":"4","(":"5","-":"6","è":"7","_":"8","ç":"9","à":"0"};
const normalizeScannerValue=value=>String(value??'')
  .replace(/[٠-٩]/g,ch=>String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
  .replace(/[۰-۹]/g,ch=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))
  .replace(/[&é"'(-è_çà]/g,ch=>AZERTY_BARCODE_MAP[ch]||ch)
  .replace(/\s+/g,'')
  .replace(/[^0-9]/g,'');
const nativeInputValueSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
let barcodeScannerKeyBuffer='';
let barcodeScannerKeyTimer=null;
function normalizeScannerKey(ch){
  const map={"&":"1","é":"2",'"':"3","'":"4","(":"5","-":"6","è":"7","_":"8","ç":"9","à":"0"};
  if(/[0-9]/.test(ch)) return ch;
  if(/[٠-٩]/.test(ch)) return String("٠١٢٣٤٥٦٧٨٩".indexOf(ch));
  if(/[۰-۹]/.test(ch)) return String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch));
  return map[ch]||'';
}
function installScannerKeyNormalization(){
  document.addEventListener('keydown',e=>{
    const el=e.target;
    if(!(el instanceof HTMLInputElement))return;
    if(el.id!=='productSearch' && el.id!=='productBarcode')return;
    if(e.key==='Enter'){
      barcodeScannerKeyBuffer='';
      return;
    }
    if(e.key.length!==1)return;
    const n=normalizeScannerKey(e.key);
    if(!n)return;
    // Replace the scanner's layout-dependent character with the numeric digit.
    const start=el.selectionStart??el.value.length;
    const end=el.selectionEnd??el.value.length;
    const next=el.value.slice(0,start)+n+el.value.slice(end);
    if(next!==el.value){
      e.preventDefault();
      if(nativeInputValueSetter)nativeInputValueSetter.call(el,next);else el.value=next;
      el.setSelectionRange(start+1,start+1);
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }
  },true);
}

function fixScannerInput(id){
  const el=$(id);
  if(!el)return;
  el.addEventListener('input',()=>{
    const value=String(el.value??'');
    if(!/[&é"'(-è_çà٠-٩۰-۹]/.test(value))return;
    const normalized=normalizeScannerValue(value);
    if(normalized===value)return;
    if(nativeInputValueSetter)nativeInputValueSetter.call(el,normalized);else el.value=normalized;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  },true);
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{
      const db=r.result;
      for(const name of ['queue','products','customers','sales','debtors','expenses','favorites','meta']) if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath:'id'});
    };
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
async function put(store, value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function clear(store){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function all(store){const db=await openDB();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function del(store,id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}

function token(){return localStorage.getItem(TOKEN_KEY)||''}
let statusTimer=null;
function setStatus(msg,kind='info',options={}){const el=$('status');if(!el)return;clearTimeout(statusTimer);el.textContent=msg;el.dataset.kind=kind;el.classList.toggle('actionStatus',!!options.action || kind==='ok');if(options.autoHide!==false && (options.action || kind==='ok')) statusTimer=setTimeout(()=>{el.textContent='';el.dataset.kind='';el.classList.remove('actionStatus')},1800)}
async function api(path,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token()) headers.Authorization=`Bearer ${token()}`;
  const candidates=apiCandidates();
  let lastError=null;
  for(let i=0;i<candidates.length;i++){
    const base=candidates[i];
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(options.timeoutMs||10000));
    try {
      const r=await fetch(`${base}${path}`,{...options,headers,signal:controller.signal});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||data.message||`HTTP ${r.status}`);
      state.connection=connectionLabel(base);
      state.online=true;
      return data.data;
    } catch(e) {
      lastError=e?.name==='AbortError'?new Error('انتهت مهلة الاتصال بالخادم.'):e;
    } finally { clearTimeout(timer); }
  }
  // Android: if the saved IP is stale (router/PC changed), rediscover the desktop
  // on the current Wi-Fi and retry the exact request once.
  const discovered=nativeDiscoverComputer();
  if(discovered){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(options.timeoutMs||10000));
    try{
      const r=await fetch(`${discovered}${path}`,{...options,headers,signal:controller.signal});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||data.message||`HTTP ${r.status}`);
      state.connection='Wi-Fi'; state.online=true; return data.data;
    }catch(e){lastError=e?.name==='AbortError'?new Error('انتهت مهلة الاتصال بالخادم.'):e;}
    finally{clearTimeout(timer);}
  }
  state.online=false;
  state.connection='offline';
  throw new Error(lastError?.message||'تعذر الاتصال بالخادم.');
}

async function login(){
  const username=$('username').value.trim(), password=$('password').value;
  if(!username||!password)return setStatus('أدخل اسم المستخدم وكلمة المرور.','error');
  try{
    const data=await api('/auth/login',{method:'POST',body:JSON.stringify({username,password})});
    localStorage.setItem(TOKEN_KEY,data.token); state.user=data.user; if($('userLabel'))$('userLabel').textContent=data.user?.name||data.user?.username||'حساب المستخدم';
    $('loginView').hidden=true; $('appView').hidden=false;
    setStatus('تم تسجيل الدخول. جارٍ تحميل البيانات…','ok');
    await bootstrap(true); renderAll();
  }catch(e){setStatus(e.message,'error')}
}
async function bootstrap(force=false,silent=false){
  if(!token())return;
  try{
    const data=await api('/mobile/bootstrap?limit=500');
    state={...state,...data,online:true};
    for(const s of ['products','customers','sales','debtors','expenses','favorites']){await clear(s);for(const row of (data[s]||[])) await put(s,{...row,id:row.id})}
    await put('meta',{id:'bootstrap',at:data.serverTime||new Date().toISOString()});
    if(!silent)setStatus('تم','ok',{action:true});
  }catch(e){loadCartLocal();renderCart();
    state.online=navigator.onLine;if(!silent)setStatus(navigator.onLine?e.message:'وضع عدم الاتصال — البيانات المحلية قيد الاستخدام.','warn');await loadLocal()}
}
async function loadLocal(){
  for(const s of ['products','customers','sales','debtors','expenses','favorites']) state[s]=await all(s);
}
async function enqueue(entityType,payload){
  const row={id:uid(),entityType,payload,createdAt:new Date().toISOString(),deviceId:deviceId()};
  await put('queue',row); return row;
}
async function syncQueue(silent=false){
  const rows=(await all('queue')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  let ok=0;
  for(const row of rows){
    try{
      let result;
      try{
        result=await api('/sync',{method:'POST',body:JSON.stringify({deviceId:row.deviceId,operationId:row.id,entityType:row.entityType,payload:row.payload})});
      }catch(e){
        // A customer balance can be stale locally while the server has the
        // current balance. Refresh once and retry the payment before marking it
        // as failed. Other queue items must never be blocked by this failure.
        if(row.entityType==='customer_payment' && navigator.onLine){
          await bootstrap(true,true);
          result=await api('/sync',{method:'POST',body:JSON.stringify({deviceId:row.deviceId,operationId:row.id,entityType:row.entityType,payload:row.payload})});
        }else{
          throw e;
        }
      }
      if(result?.applied||result?.duplicate){await del('queue',row.id);ok++;}
    }catch(e){
      if(!silent)setStatus(`تعذر مزامنة ${row.entityType==='customer_payment'?'دفعة الدين':'العملية'}: ${e.message}`,'warn');
      // Keep this operation queued, but continue with the remaining operations.
      continue;
    }
  }
  if(ok) await bootstrap(false,silent);
  renderQueue();
  return ok;
}
async function syncNow(){
  if(!navigator.onLine)return setStatus('لا يوجد اتصال بالإنترنت. ستتم المزامنة تلقائيًا عند عودته.','warn');
  await syncQueue(false);if(navigator.onLine)await bootstrap(false,true);renderAll();setStatus('تم','ok',{action:true})
}

function renderAll(){
  // Preserve the debt-payment form while background sync refreshes the data.
  const paymentCustomer=$('paymentCustomer')?.value||'';
  const paymentAmount=$('paymentAmount')?.value??'';
  const paymentNote=$('paymentNote')?.value??'';
  renderProducts();renderInventory();renderCustomers();renderSales();renderDebtors();renderHomeExtras();renderExpenses();renderFavorites();renderQueue();renderCash();renderOnline();renderStats();populateSelectors();
  if($('paymentCustomer') && paymentCustomer && [...$('paymentCustomer').options].some(o=>o.value===paymentCustomer)) $('paymentCustomer').value=paymentCustomer;
  if($('paymentAmount')) $('paymentAmount').value=paymentAmount;
  if($('paymentNote')) $('paymentNote').value=paymentNote;
}

function renderHomeExtras(){
  const rows=(state.products||[]).filter(p=>{
    const stock=Number(p.current_stock||0), min=Number(p.minimum_stock||0);
    return stock<=min;
  }).sort((a,b)=>Number(a.current_stock||0)-Number(b.current_stock||0)).slice(0,5);
  const alert=$('homeLowStock');
  if(alert) alert.innerHTML=rows.length
    ? rows.map(p=>`<div class="lowStockHomeItem"><span>${esc(p.name)}</span><b>${Number(p.current_stock||0)<=0?'نفذ':`متبقي ${Number(p.current_stock||0)}`}</b></div>`).join('')
    : 'لا توجد تنبيهات.';

  const today=todaySales();
  const salesTotal=today.reduce((s,x)=>s+Number(x.total||0),0);
  const debtTotal=(state.debtors||[]).reduce((s,x)=>s+Math.max(0,Number(x.balance||0)),0);
  if($('homeSalesTotal')) $('homeSalesTotal').textContent=`${money(salesTotal)} دج`;
  if($('homeInvoiceTotal')) $('homeInvoiceTotal').textContent=String(today.length);
  if($('homeDebtTotal')) $('homeDebtTotal').textContent=`${money(debtTotal)} دج`;
}

function renderStats(){
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v)};
  set('statSales',state.sales.length);
  set('statProducts',state.products.length);
  set('statCustomers',state.customers.length);
  const c=state.cash; set('statCash',c?`${money(c.balance||c.current_balance||0)} دج`:'—');
  set('inventoryCount',state.products.length);
}

function renderOnline(){
  const label=state.online
    ? (state.connection==='Wi-Fi'?'Wi-Fi':state.connection==='سحابي'?'سحابي':'محلي')
    : 'غير متصل';
  $('online').textContent=label;
  $('online').className=state.online?'pill ok':'pill warn';
  if($('connectionModeLabel')) $('connectionModeLabel').textContent=`الوضع: ${connectionMode()==='auto'?'تلقائي':connectionMode()==='local'?'محلي':connectionMode()==='wifi'?'Wi-Fi':'سحابي'}`;
}
async function renderQueue(){$('queueCount').textContent=String((await all('queue')).length)}
function renderProducts(){
  const q=($('productSearch')?.value||'').trim().toLowerCase();
  const rows=q?state.products.filter(p=>`${p.name} ${p.barcode||''}`.toLowerCase().includes(q)):[];
  $('productsList').innerHTML=rows.map(p=>{
    const stock=Number(p.current_stock||0);
    const minimum=Number(p.minimum_stock||0);
    const availability=stock<=0?'نفذ':(stock<=minimum?'قريبًا ينفذ':'متوفر');
    const availabilityClass=stock<=0||stock<=minimum?'low':'available';
    return `<button class="productRow" data-id="${p.id}" type="button"><span class="productRowName">${esc(p.name)}</span><span class="productRowPrice">${money(p.sale_price)} دج</span><span class="productRowStock ${availabilityClass}">${availability}</span></button>`;
  }).join('');
}
function renderInventory(){
  const q=($('inventorySearch')?.value||'').toLowerCase();
  const rows=state.products.filter(p=>!q||`${p.name} ${p.barcode||''}`.toLowerCase().includes(q));
  $('productsListInventory').innerHTML=rows.map(p=>`<button class="row inventoryProductRow" data-edit-id="${p.id}"><span><b>${esc(p.name)}</b><small>${esc(p.barcode||'بدون باركود')} · ${esc(p.category||'بدون تصنيف')}</small></span><strong>${money(p.sale_price)} دج<br><small>المخزون ${p.current_stock}</small></strong></button>`).join('')||'<p class="empty">لا توجد منتجات.</p>';
}
function renderCustomers(){
  const q=($('customerSearch')?.value||'').toLowerCase();
  const rows=state.customers.filter(c=>!q||`${c.name} ${c.phone||''}`.toLowerCase().includes(q));
  $('customersList').innerHTML=rows.map(c=>`<button class="row customerRow" data-id="${c.id}"><span><b>${esc(c.name)}</b><small>${esc(c.phone||'')}</small></span><span>${money(debtFor(c.id))} دج</span></button>`).join('')||'<p class="empty">لا يوجد عملاء.</p>';
}
function debtFor(id){return Number((state.debtors||[]).find(x=>String(x.id)===String(id))?.balance||0)}
function todaySales(){
  const now=new Date();
  const y=now.getFullYear(),m=now.getMonth(),d=now.getDate();
  return (state.sales||[]).filter(s=>{const dt=new Date(s.created_at||s.createdAt||0);return dt.getFullYear()===y&&dt.getMonth()===m&&dt.getDate()===d});
}
let invoiceFilterMode='all';
function renderSales(){
  const allRows=todaySales();
  const search=($('invoiceSearch')?.value||'').trim().toLowerCase();
  const rows=allRows.filter(s=>{
    const customerId=s.customer_id||s.customerId;
    const kind=customerId?'customer':'guest';
    if(invoiceFilterMode!=='all' && kind!==invoiceFilterMode)return false;
    if(!search)return true;
    return `${s.invoice_number||s.id||''} ${s.customer_name||'زبون'}`.toLowerCase().includes(search);
  });
  const count=$('todayInvoiceCount');if(count)count.textContent=String(rows.length);
  const label=$('invoiceCountLabel');if(label)label.textContent=`${rows.length} فاتورة`;
  $('salesList').innerHTML=allRows.slice(0,30).map(s=>`<div class="row"><span><b>#${esc(s.invoice_number||s.id)}</b><small>${esc(s.customer_name||'زبون')}</small></span><span>${money(s.total)} دج<br><small>${money(s.paid)} مدفوع</small></span></div>`).join('')||'<p class="empty">لا توجد مبيعات محلية.</p>';
  const list=$('todayInvoicesList');
  if(list) list.innerHTML=rows.map(s=>{
    const kind=(s.customer_id||s.customerId)?'عميل':'زبون';
    return `<div class="invoiceRow"><button class="viewInvoice" data-invoice-id="${esc(s.id)}" data-invoice-number="${esc(s.invoice_number||'')}" type="button">⌕</button><div class="invoiceMeta"><strong>#${esc(s.invoice_number||s.id)}</strong><small>${esc(kind)} · ${esc(s.customer_name||'زبون')}</small></div><div class="invoiceAmount">${money(s.total)} دج</div></div>`
  }).join('')||'<p class="empty">لا توجد فواتير مطابقة.</p>';
}
function openInvoiceList(){
  showScreen('todayInvoicesScreen');renderSales();
}
function code128Svg(value){
  // Invoice barcode only: real Code 128-B, numeric payload, scanner-friendly.
  // This is intentionally separate from product barcodes.
  const clean=String(value??'').replace(/\D/g,'');
  if(!clean)return '';
  const patterns=[
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];
  // Code 128-B ASCII values: space=0 ... underscore=95. Digits are ASCII 48..57.
  const codes=[104,...clean.split('').map(ch=>48<=ch.charCodeAt(0)&&ch.charCodeAt(0)<=57?ch.charCodeAt(0)-32:0)];
  let checksum=codes[0];
  for(let i=1;i<codes.length;i++)checksum+=codes[i]*i;
  checksum%=103;
  codes.push(checksum,106);
  const module=2.5, quiet=24, barHeight=96, top=4;
  let x=quiet, bars='';
  for(const code of codes){
    const pat=patterns[code];
    let black=true;
    for(const n of pat){
      const w=Number(n)*module;
      if(black)bars+=`<rect class="barcodeBar" x="${x}" y="${top}" width="${w}" height="${barHeight}"/>`;
      x+=w; black=!black;
    }
  }
  const width=x+quiet, height=barHeight+top*2;
  return `<svg class="invoiceBarcodeSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="باركود الفاتورة ${esc(clean)}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect class="barcodeBg" x="0" y="0" width="${width}" height="${height}"/>${bars}</svg>`;
}
async function openInvoiceDetail(id){
  let s=state.sales.find(x=>String(x.id)===String(id));
  // The invoice list may contain only the summary row. When that happens,
  // fetch the full sale by its invoice number (the API search does not search
  // PostgreSQL UUIDs). This keeps receipt viewing reliable on the phone.
  if((!s || !Array.isArray(s.items)) && navigator.onLine){
    try{
      const invoiceNo=s?.invoice_number||s?.invoiceNumber||'';
      const search=invoiceNo||String(id||'');
      const rows=await api(`/sales?limit=500&search=${encodeURIComponent(search)}`);
      const fresh=(rows||[]).find(x=>
        String(x.id)===String(id) ||
        (invoiceNo && String(x.invoice_number||x.invoiceNumber)===String(invoiceNo))
      );
      if(fresh) s=fresh;
    }catch(e){
      // Keep any complete local invoice usable even if the network request fails.
    }
  }
  if(!s)return setStatus('الفاتورة غير موجودة.','error');
  const items=Array.isArray(s.items)?s.items:[];
  const card=$('invoiceDetailCard');
  // The presence of a real customer id is the single source of truth.
  // A textual invoice_type value must never turn a guest receipt into a customer invoice.
  const customerId=s.customer_id||s.customerId||null;
  const explicitType=String(s.invoice_type||s.invoiceType||'').trim().toLowerCase();
  const guestName=/^(زبون|زبون نقدي|نقدي|cash|guest)$/i.test(String(s.customer_name||'').trim());
  // Guest invoices must never show customer debt fields, even if an old/server
  // record contains a placeholder customer_id or the name "زبون".
  const isCustomer=explicitType==='customer'
    ? true
    : explicitType==='guest'
      ? false
      : Boolean(customerId) && !guestName;
  const invoiceType=isCustomer?'فاتورة عميل':'فاتورة زبون';
  const invoiceNo=String(s.invoice_number||s.id||'').padStart(6,'0');
  const total=Number(s.total||0), paid=Number(s.paid||0), remaining=Math.max(0,total-paid);
  const invoiceDebt=Number(s.customer_invoice_debt??remaining);
  const currentDebt=customerId?Number(debtFor(customerId)||0):0;
  const previousDebt=s.customer_previous_debt!=null?Number(s.customer_previous_debt):Math.max(0,currentDebt-invoiceDebt);
  const totalDebt=s.customer_total_debt!=null?Number(s.customer_total_debt):currentDebt;
  const customerName=esc(s.customer_name||'');
  const dateOnly=(()=>{try{const d=new Date(s.created_at);return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`}catch{return esc(fmtDate(s.created_at))}})();
  const rows=items.map(i=>`<tr><td>${esc(i.name||'سلعة')}</td><td>${esc(i.quantity)}</td><td>${money(i.price??i.unit_price)} دج</td><td>${money(i.line_total)} دج</td></tr>`).join('');
  const customerInfo=isCustomer?`<div class="invoiceInfoRow"><span>اسم العميل</span><b>${customerName||'—'}</b></div>`:'';
  const totals=isCustomer
    ? `<div class="invoiceTotalRow"><span>المجموع</span><strong>${money(s.subtotal??total)} دج</strong></div>
       <div class="invoiceTotalRow"><span>الخصم</span><strong>${money(s.discount||0)} دج</strong></div>
       <div class="invoiceTotalRow"><span>بعد الخصم</span><strong>${money(total)} دج</strong></div>
       <div class="invoiceTotalRow"><span>المدفوع</span><strong>${money(paid)} دج</strong></div>
       <div class="invoiceTotalRow"><span>المتبقي من الفاتورة</span><strong>${money(remaining)} دج</strong></div>
       <div class="invoiceTotalDivider"></div>
       <div class="invoiceTotalRow"><span>الدين السابق</span><strong>${money(previousDebt)} دج</strong></div>
       <div class="invoiceTotalRow invoiceDebtTotal"><span>إجمالي الدين على العميل</span><strong>${money(totalDebt)} دج</strong></div>`
    : `<div class="invoiceTotalRow"><span>المجموع</span><strong>${money(total)} دج</strong></div>
       <div class="invoiceTotalRow"><span>المدفوع</span><strong>${money(paid)} دج</strong></div>
       <div class="invoiceTotalRow"><span>المتبقي من الفاتورة</span><strong>${money(remaining)} دج</strong></div>`;
  card.innerHTML=`<div class="invoiceBrand"><h1>بزار كل شيء بالمعقول</h1><p>${invoiceType}</p></div>
    <div class="invoiceInfo">
      <div class="invoiceInfoRow"><span>رقم الفاتورة</span><b>${esc(invoiceNo)}</b></div>
      <div class="invoiceInfoRow"><span>التاريخ</span><b>${esc(dateOnly)}</b></div>
      ${customerInfo}
    </div>
    <table class="invoiceTable"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="invoiceTotals">${totals}</div>
    <div class="invoiceThanks">شكرا لتسوقكم معنا<br>نتمنى لكم يوما سعيدا</div>
    <div class="invoiceBarcode">${code128Svg(invoiceNo)}</div>`;
  showScreen('invoiceDetailScreen');
}
function showScreen(id,push=true){
  document.querySelectorAll('.screen').forEach(x=>x.hidden=true);
  const target=$(id);if(target)target.hidden=false;
  const home=id==='homeScreen';document.body.classList.toggle('nonHomeView',!home);
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',home&&x.dataset.tab===id));
  if(push&&history.pushState)history.pushState({screen:id},'',`#${id}`);
  window.scrollTo({top:0,behavior:'smooth'});
}
window.addEventListener('popstate',()=>{const id=location.hash.slice(1)||'homeScreen';showScreen($(id)?id:'homeScreen',false)});
function renderDebtors(){$('debtorsList').innerHTML=(state.debtors||[]).map(d=>`<div class="row"><span><b>${esc(d.name)}</b></span><strong>${money(d.balance)} دج</strong></div>`).join('')||'<p class="empty">لا توجد ديون.</p>'}
function renderExpenses(){$('expensesList').innerHTML=(state.expenses||[]).slice(0,30).map(e=>`<div class="row"><span><b>${esc(e.description||e.note||'مصروف')}</b><small>${fmtDate(e.created_at)}</small></span><strong>${money(e.amount)} دج</strong></div>`).join('')||'<p class="empty">لا توجد مصاريف.</p>'}
function renderFavorites(){$('favoritesList').innerHTML=(state.favorites||[]).map(f=>`<div class="row"><span>${esc(f.name||f.product_name||'منتج')}</span></div>`).join('')||'<p class="empty">لا توجد مفضلات.</p>'}
function renderCash(){const c=state.cash;$('cashInfo').textContent=c?`الرصيد الحالي: ${money(c.balance||c.current_balance||0)} دج`:'لا توجد جلسة صندوق متاحة.'}


const CART_KEY='bazaar_mobile_cart';
async function saveCartLocal(){
  try{
    localStorage.setItem(CART_KEY,JSON.stringify(cart));
    if($('cartSavedInfo')) $('cartSavedInfo').textContent=cart.length?'السلة محفوظة مؤقتًا':'';
  }catch{}
}
function loadCartLocal(){
  try{
    const saved=JSON.parse(localStorage.getItem(CART_KEY)||'[]');
    if(Array.isArray(saved)) cart=saved;
  }catch{cart=[]}
}

let cart=[];
let saleSubmitting=false;
function addToCart(productId){
  const p=state.products.find(x=>String(x.id)===String(productId));if(!p)return;
  if(Number(p.current_stock)<=0)return setStatus(`المخزون غير كافٍ للمنتج: ${p.name}`,'warn');
  const item=cart.find(x=>String(x.productId)===String(productId));
  if(item){if(item.quantity>=Number(p.current_stock))return setStatus(`المخزون غير كافٍ للمنتج: ${p.name}`,'warn');item.quantity+=1;}
  else cart.push({productId:p.id,name:p.name,price:Number(p.sale_price),quantity:1});
  renderCart();
}
function renderCart(){
  const total=cart.reduce((s,x)=>s+x.quantity*x.price,0),count=cart.reduce((s,x)=>s+x.quantity,0);
  $('cartList').innerHTML=cart.map((x,i)=>`<div class="cartItem"><div class="cartProductName"><b>${esc(x.name)}</b></div><button class="cartQtyButton" data-qty="${i}" type="button" title="تعديل الكمية">${x.quantity}</button><div class="cartUnitPrice">${money(x.price)} دج</div></div>`).join('');
  $('cartTotal').textContent=`${money(total)} دج`;
  $('cartCount').textContent=String(count);
  const empty=$('cartEmpty');if(empty)empty.hidden=cart.length>0;
  void saveCartLocal();
}
let quantityEditIndex=null;
function openQuantityModal(index){
  const item=cart[index];if(!item)return;
  quantityEditIndex=index;
  $('quantityProductName').textContent=item.name;
  $('quantityInput').value=String(item.quantity);
  $('quantityModal').hidden=false;
  setTimeout(()=>{$('quantityInput').focus();$('quantityInput').select()},50);
}
function closeQuantityModal(){quantityEditIndex=null;$('quantityModal').hidden=true}
function saveQuantity(){
  if(quantityEditIndex===null)return;
  const item=cart[quantityEditIndex];if(!item)return closeQuantityModal();
  const p=state.products.find(x=>String(x.id)===String(item.productId));
  const max=Math.max(0,Number(p?.current_stock||0));
  const qty=Math.floor(Number($('quantityInput').value||0));
  if(qty<1)return setStatus('أدخل كمية صحيحة.','error');
  if(qty>max)return setStatus(`المخزون المتاح: ${max}.`,'warn');
  item.quantity=qty;renderCart();closeQuantityModal();
}
function clearCart(){cart=[];localStorage.removeItem(CART_KEY);renderCart();setStatus('تم','ok',{action:true});}
function openPaymentModal(){
  if(!cart.length)return setStatus('أضف منتجًا إلى السلة.','error');
  const total=cart.reduce((sum,x)=>sum+x.quantity*x.price,0);
  $('salePaid').value=money(total).replace('.00','');
  $('saleDiscount').value='';
  $('saleMethod').value='cash';
  $('paymentModal').hidden=false;
}
function closePaymentModal(){$('paymentModal').hidden=true}
async function createSale(){
  if(saleSubmitting)return;
  if(!cart.length)return setStatus('أضف منتجًا إلى السلة.','error');
  saleSubmitting=true;
  const confirmBtn=$('confirmSaleBtn'); if(confirmBtn) confirmBtn.disabled=true;
  const customerId=$('saleCustomer').value||null, paid=Number($('salePaid').value||0);
  const payload={customerId,invoiceType:customerId?'customer':'guest',items:cart.map(x=>({productId:x.productId,quantity:x.quantity,price:x.price})),discount:Number($('saleDiscount').value||0),paid,paymentMethod:$('saleMethod').value||'cash'};
  const op=await enqueue('sale',payload);
  // Optimistic local stock update.
  for(const item of payload.items){const p=state.products.find(x=>String(x.id)===String(item.productId));if(p)p.current_stock=Number(p.current_stock)-Number(item.quantity)}
  cart=[];localStorage.removeItem(CART_KEY);renderCart();setStatus('تم البيع','ok',{action:true});renderProducts();
  if(navigator.onLine)await syncQueue(true);
  saleSubmitting=false;
  if(confirmBtn) confirmBtn.disabled=false;
}
async function addCustomer(){
  const name=$('newCustomerName').value.trim();if(!name)return;
  await enqueue('customer',{name,phone:$('newCustomerPhone').value.trim()||null,address:null,note:null});
  $('newCustomerName').value='';$('newCustomerPhone').value='';setStatus('تم','ok',{action:true});if(navigator.onLine)await syncQueue(true);
}
async function payDebt(){
  const customerId=$('paymentCustomer').value, amount=Number($('paymentAmount').value||0);
  if(!customerId||amount<=0)return setStatus('اختر العميل وأدخل مبلغًا صحيحًا.','error');
  await enqueue('customer_payment',{customerId,amount,note:$('paymentNote').value.trim()||null});
  $('paymentAmount').value='';$('paymentNote').value='';setStatus('تم الدفع','ok',{action:true});if(navigator.onLine)await syncQueue(true);
}
async function addExpense(){
  const amount=Number($('expenseAmount').value||0),description=$('expenseDescription').value.trim();
  if(amount<=0||!description)return setStatus('أدخل وصفًا ومبلغًا صحيحًا.','error');
  await enqueue('expense',{amount,description,note:description});
  $('expenseAmount').value='';$('expenseDescription').value='';setStatus('تم','ok',{action:true});if(navigator.onLine)await syncQueue(true);
}
let productEditId=null;
async function loadCatalogs(){
  try{
    const [categories,units]=await Promise.all([api('/catalog/categories'),api('/catalog/units')]);
    $('productCategory').innerHTML='<option value="">بدون تصنيف</option>'+(categories||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
    $('productUnit').innerHTML='<option value="">بدون وحدة</option>'+(units||[]).map(x=>`<option value="${x.id}">${esc(x.name)}${x.symbol?` (${esc(x.symbol)})`:''}</option>`).join('');
  }catch(e){setStatus(`تعذر تحميل التصنيفات والوحدات: ${e.message}`,'warn')}
}
function resetProductForm(){
  productEditId=null;
  $('productFormTitle').textContent='إضافة سلعة';
  $('productSaveBtn').textContent='حفظ السلعة';
  ['productName','productBarcode','productPurchase','productSale','productStock','productMinimum'].forEach(id=>$(id).value='');
  $('productCategory').value='';$('productUnit').value='';$('productForm').hidden=true;
}
async function openProductForm(id=null){
  await loadCatalogs();
  productEditId=id?String(id):null;
  const p=id?state.products.find(x=>String(x.id)===String(id)):null;
  $('productFormTitle').textContent=p?'تعديل السلعة':'إضافة سلعة';
  $('productSaveBtn').textContent=p?'حفظ التعديل':'حفظ السلعة';
  $('productName').value=p?.name||'';
  $('productBarcode').value=p?.barcode||'';
  $('productPurchase').value=p?.purchase_price??'';
  $('productSale').value=p?.sale_price??'';
  $('productStock').value=p?.current_stock??'';
  $('productMinimum').value=p?.minimum_stock??'';
  $('productCategory').value=p?.category_id||'';
  $('productUnit').value=p?.unit_id||'';
  $('productForm').hidden=false;
  $('productForm').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveProduct(){
  const name=$('productName').value.trim();
  if(!name)return setStatus('أدخل اسم السلعة.','error');
  const payload={
    name,barcode:$('productBarcode').value.trim()||null,
    categoryId:$('productCategory').value||null,unitId:$('productUnit').value||null,
    purchasePrice:Number($('productPurchase').value||0),salePrice:Number($('productSale').value||0),
    stock:Number($('productStock').value||0),minimumStock:Number($('productMinimum').value||0),active:true
  };
  try{
    if(productEditId){
      if(!navigator.onLine)return setStatus('تعديل السلعة يحتاج اتصالًا بالخادم.','warn');
      const data=await api(`/products/${encodeURIComponent(productEditId)}`,{method:'PUT',body:JSON.stringify(payload)});
      const i=state.products.findIndex(x=>String(x.id)===productEditId);
      if(i>=0)state.products[i]={...state.products[i],...data};
      await put('products',state.products[i]);
      setStatus('تم','ok',{action:true});
    }else{
      const op=await enqueue('product',payload);
      const temp={id:`local-${op.id}`,...payload,current_stock:payload.stock,purchase_price:payload.purchasePrice,sale_price:payload.salePrice,minimum_stock:payload.minimumStock,category_id:payload.categoryId,unit_id:payload.unitId,category:'',unit:'',active:true};
      state.products=[temp,...state.products];await put('products',temp);
      setStatus('تم','ok',{action:true});
      if(navigator.onLine)await syncQueue(true);
    }
    resetProductForm();renderAll();
  }catch(e){setStatus(e.message,'error')}
}

let selectedExcelBase64='';
async function fileToBase64(file){
  const buf=await file.arrayBuffer();
  let binary='';const bytes=new Uint8Array(buf);const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary);
}
async function chooseExcel(file){
  if(!file)return;
  if(!/\.xlsx$/i.test(file.name))return setStatus('اختر ملف Excel بصيغة XLSX.','error');
  try{
    setStatus('جارٍ قراءة ملف Excel…');
    selectedExcelBase64=await fileToBase64(file);
    $('excelFileName').textContent=file.name;
    const preview=await api('/import/xlsx/preview',{method:'POST',body:JSON.stringify({base64:selectedExcelBase64})});
    $('excelPreview').textContent=`الصفوف: ${preview.rows} · صالحة: ${preview.validRows} · أخطاء: ${preview.errorCount}`;
    $('excelImportBtn').disabled=preview.validRows===0;
    if(preview.errorCount) setStatus(`تمت المعاينة: ${preview.errorCount} صف به أخطاء.`,'warn');
    else setStatus(`المعاينة جاهزة: ${preview.validRows} صف.`,'ok');
  }catch(e){selectedExcelBase64='';$('excelImportBtn').disabled=true;setStatus(e.message,'error')}
}
async function importExcel(){
  if(!selectedExcelBase64)return setStatus('اختر ملف Excel أولاً.','error');
  if(!confirm('استيراد ملف Excel الآن؟ سيتم تحديث السلع التي لها نفس الباركود وإضافة السلع الجديدة.'))return;
  try{
    $('excelImportBtn').disabled=true;setStatus('جارٍ استيراد Excel…');
    const result=await api('/import/xlsx',{method:'POST',body:JSON.stringify({base64:selectedExcelBase64})});
    $('excelPreview').textContent=`تم الاستيراد: ${result.created} جديدة · ${result.updated} محدثة · ${result.skipped} متجاوزة`;
    setStatus('تم','ok',{action:true});
    selectedExcelBase64='';$('excelFile').value='';$('excelImportBtn').disabled=true;
    await bootstrap(true,true);renderAll();
  }catch(e){$('excelImportBtn').disabled=false;setStatus(e.message,'error')}
}

function populateSelectors(){
  // Preserve the user's current selection. Background synchronization must
  // never reset the customer while the "إتمام البيع" dialog is open.
  const saleCustomer=$('saleCustomer');
  const paymentCustomer=$('paymentCustomer');
  const saleValue=saleCustomer?.value||'';
  const paymentValue=paymentCustomer?.value||'';

  saleCustomer.innerHTML='<option value="">زبون / نقدي</option>'+state.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  paymentCustomer.innerHTML='<option value="">اختر العميل</option>'+state.customers.map(c=>`<option value="${c.id}">${esc(c.name)} — ${money(debtFor(c.id))}</option>`).join('');

  if(saleValue && [...saleCustomer.options].some(o=>o.value===saleValue)) saleCustomer.value=saleValue;
  if(paymentValue && [...paymentCustomer.options].some(o=>o.value===paymentValue)) paymentCustomer.value=paymentValue;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmtDate(v){try{return new Date(v).toLocaleString('ar-DZ')}catch{return ''}}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  e.preventDefault();
  if(b.dataset.id&&b.classList.contains('productRow')){
    addToCart(b.dataset.id);
    const search=$('productSearch');
    if(search){search.value='';search.focus();}
    renderProducts();
  }
  if(b.dataset.editId)openProductForm(b.dataset.editId);
  if(b.id==='addProductBtn')openProductForm();
  if(b.id==='cancelProductBtn')resetProductForm();
  if(b.dataset.qty!==undefined)openQuantityModal(Number(b.dataset.qty));
  if(b.dataset.invoiceId)void openInvoiceDetail(b.dataset.invoiceId);
  if(b.dataset.tab)showScreen(b.dataset.tab);
});

let scannerStream=null,scannerTimer=null;
async function handleScannedValue(rawValue){
  const v=String(rawValue??'').trim();
  if(!v)return false;

  // 1) Product barcode keeps its existing behavior.
  const p=state.products.find(x=>String(x.barcode||'').trim()===v);
  if(p){
    addToCart(p.id);
    $('productSearch').value='';
    renderProducts();
    setStatus('تم','ok',{action:true});
    return true;
  }

  // 2) A receipt barcode is the invoice number, not a product barcode.
  // Try local sales first so scanning a receipt works even when offline.
  const invoiceNo=v.replace(/\D/g,'');
  if(invoiceNo){
    let sale=(state.sales||[]).find(x=>String(x.invoice_number||x.invoiceNumber||'').replace(/\D/g,'')===invoiceNo);
    if(sale){
      closeScanner();
      await openInvoiceDetail(sale.id);
      return true;
    }

    // If it is not cached locally, ask the server for the invoice by number.
    if(navigator.onLine){
      try{
        const rows=await api(`/sales?limit=10&search=${encodeURIComponent(invoiceNo)}`);
        sale=(rows||[]).find(x=>String(x.invoice_number||x.invoiceNumber||'').replace(/\D/g,'')===invoiceNo);
        if(sale){
          const existing=(state.sales||[]).find(x=>String(x.id)===String(sale.id));
          if(!existing)state.sales=[...(state.sales||[]),sale];
          closeScanner();
          await openInvoiceDetail(sale.id);
          return true;
        }
      }catch{}
    }
  }

  return false;
}
async function openScanner(){
  const modal=$('scannerModal'),video=$('scannerVideo');modal.hidden=false;
  try{
    scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    video.srcObject=scannerStream;
    if('BarcodeDetector' in window){
      const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf','qr_code']});
      const scan=async()=>{
        if(modal.hidden)return;
        try{
          const codes=await detector.detect(video);
          if(codes.length&&codes[0].rawValue){
            const v=codes[0].rawValue;
            const handled=await handleScannedValue(v);
            if(!handled)$('scannerHint').textContent=`الباركود: ${v} — لم يتم العثور على السلعة أو الفاتورة.`;
            if(!modal.hidden)return;
          }
        }catch{}
        scannerTimer=requestAnimationFrame(scan);
      };
      scan();
    }else $('scannerHint').textContent='المتصفح لا يدعم قراءة الباركود تلقائياً. استخدم البحث بالباركود.';
  }catch(e){modal.hidden=true;setStatus('تعذر فتح الكاميرا. اسمح بالوصول إلى الكاميرا.','error')}
}
function closeScanner(){const modal=$('scannerModal');modal.hidden=true;if(scannerTimer)cancelAnimationFrame(scannerTimer);scannerTimer=null;if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null}const v=$('scannerVideo');if(v)v.srcObject=null}


async function autoDiscoverComputer(){
  const status=$('autoDiscoverStatus');
  if(status)status.textContent='جاري البحث عن كمبيوتر نقطة البيع...';
  const candidates=apiCandidates();
  for(const base of candidates){
    try{
      const r=await fetch(`${normalizeApi(base)}/health`,{method:'GET',cache:'no-store'});
      if(r.ok){
        localStorage.setItem(LOCAL_API_KEY,normalizeApi(base));
        localStorage.setItem(CONNECTION_MODE_KEY,'auto');
        if(status)status.textContent=`تم العثور على الكمبيوتر — ${connectionLabel(base)}`;
        renderConnectionModes();
        await bootstrap(true,true);
        renderAll();
        return true;
      }
    }catch{}
  }
  if(status)status.textContent='لم يتم العثور على الكمبيوتر. تأكد أن الهاتف والكمبيوتر على نفس الشبكة وأن API يعمل.';
  return false;
}

function renderConnectionModes(){
  const mode=connectionMode();
  document.querySelectorAll('.connectionModeBtn').forEach(b=>b.classList.toggle('active',b.dataset.connectionMode===mode));
  const li=$('localApiInput'), wi=$('wifiApiInput'), cl=$('cloudApiInput');
  if(li)li.value=configuredLocalApi();
  if(wi)wi.value=configuredWifiApi();
  if(cl)cl.value=configuredCloudApi();
  if($('connectionModeLabel'))$('connectionModeLabel').textContent=`الوضع: ${mode==='auto'?'تلقائي':mode==='local'?'محلي':mode==='wifi'?'Wi-Fi':'سحابي'}`;
}
function initConnectionModes(){
  const adb=$('autoDiscoverBtn'); if(adb) adb.onclick=autoDiscoverComputer;
  renderConnectionModes();
  document.addEventListener('click',e=>{
    const b=e.target.closest('.connectionModeBtn');
    if(!b)return;
    localStorage.setItem(CONNECTION_MODE_KEY,b.dataset.connectionMode);
    renderConnectionModes();
    setStatus('تم تغيير طريقة الاتصال.','ok',{action:true});
    if(navigator.onLine) void bootstrap(true,true).then(()=>renderAll()).catch(()=>{});
  });
  const discover=$('discoverComputerBtn');
  if(discover)discover.onclick=async()=>{discover.disabled=true;setStatus('جاري البحث عن كمبيوتر نقطة البيع…','info',{action:true});const found=await discoverComputer();discover.disabled=false;if(found){renderConnectionModes();setStatus('تم العثور على الكمبيوتر تلقائيًا.','ok',{action:true});try{await bootstrap(true,true);renderAll()}catch{}}else setStatus('لم يتم العثور عليه على الشبكة الحالية.','warn',{action:true})};
  const save=$('saveConnectionBtn');
  if(save)save.onclick=()=>{
    const li=$('localApiInput'),wi=$('wifiApiInput'),cl=$('cloudApiInput');
    if(li)localStorage.setItem(LOCAL_API_KEY,normalizeApi(li.value));
    if(wi)localStorage.setItem(WIFI_API_KEY,normalizeApi(wi.value));
    if(cl)localStorage.setItem(CLOUD_API_KEY,normalizeApi(cl.value));
    renderConnectionModes();
    setStatus('تم حفظ إعدادات الاتصال.','ok',{action:true});
  };
}

async function initMobile(){
  try{
    initConnectionModes();
     if(connectionMode()==='auto'&&!configuredLocalApi()&&!configuredWifiApi()) void discoverComputer();
     fixScannerInput('productSearch');
     installScannerKeyNormalization();
    fixScannerInput('productBarcode');
    $('loginBtn').addEventListener('click',e=>{e.preventDefault();login()});
    $('loginBtn').type='button';
    $('syncBtn').onclick=syncNow;
    $('saleBtn').onclick=openPaymentModal;
    $('confirmSaleBtn').onclick=async()=>{closePaymentModal();await createSale()};
    $('closePaymentBtn').onclick=closePaymentModal;
    $('closeQuantityBtn').onclick=closeQuantityModal;
    $('saveQuantityBtn').onclick=saveQuantity;
    $('quantityInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveQuantity();if(e.key==='Escape')closeQuantityModal()});
    $('newCustomerBtn').onclick=addCustomer;
    $('paymentBtn').onclick=payDebt;
    $('expenseBtn').onclick=addExpense;
    let productSearchTimer=null;
    $('productSearch').oninput=e=>{
      renderProducts();
      const value=e.currentTarget.value.trim();
      if(productSearchTimer)clearTimeout(productSearchTimer);
      if(!value)return;
      productSearchTimer=setTimeout(()=>{
        const q=value.toLowerCase();
        const exact=state.products.find(p=>String(p.barcode||'')===value||String(p.name||'').trim().toLowerCase()===q);
        const matches=state.products.filter(p=>`${p.name} ${p.barcode||''}`.toLowerCase().includes(q));
        const p=exact || (matches.length===1 && value.length>=2 ? matches[0] : null);
        if(p){addToCart(p.id);e.currentTarget.value='';renderProducts();}
      },350);
    };
    $('inventorySearch').oninput=renderInventory;
    $('addProductBtn').onclick=()=>openProductForm();
    $('productSaveBtn').onclick=saveProduct;
    $('cancelProductBtn').onclick=resetProductForm;
    $('excelPickBtn').onclick=()=>$('excelFile').click();
    $('excelFile').onchange=()=>chooseExcel($('excelFile').files[0]);
    $('excelImportBtn').onclick=importExcel;
    $('customerSearch').oninput=renderCustomers;
    $('barcodeBtn').onclick=openScanner;
    $('clearCartBtn').onclick=clearCart;
    $('todayInvoicesBtn').onclick=openInvoiceList;
     if($('invoiceSearch')) $('invoiceSearch').oninput=renderSales;
    $('invoiceBackBtn').onclick=()=>showScreen('saleScreen');
    $('invoiceDetailBackBtn').onclick=()=>showScreen('todayInvoicesScreen');
    $('continueSaleBtn').onclick=()=>showScreen('saleScreen');
    $('printInvoiceBtn').onclick=()=>window.print();
    $('closeScannerBtn').onclick=closeScanner;
    $('productSearch').addEventListener('keydown',async e=>{
      if(e.key==='Enter'){
        const v=e.currentTarget.value.trim();
        if(!v)return;
        const handled=await handleScannedValue(v);
        if(!handled)setStatus('لم يتم العثور على السلعة أو الفاتورة.','error');
        e.currentTarget.value='';
        renderProducts();
      }
    });

    $('logoutBtn').onclick=()=>{localStorage.removeItem(TOKEN_KEY);location.reload()};
    window.addEventListener('online',async()=>{state.online=true;renderOnline();setStatus('عاد الاتصال. جارٍ المزامنة…','ok');await syncQueue(true);await bootstrap(false,true);renderAll()});
    window.addEventListener('offline',async()=>{state.online=false;renderOnline();setStatus('انقطع الاتصال — سيستمر العمل محليًا.','warn')});
    state.online=navigator.onLine;
    if(token()){
      $('loginView').hidden=true;$('appView').hidden=false;
      showScreen($(location.hash.slice(1))?location.hash.slice(1):'homeScreen',false);
      await loadLocal();renderAll();await bootstrap();
      // تحديث تلقائي للبيانات من السيرفر بدون الضغط على زر المزامنة.
      setInterval(async()=>{
        if(!document.hidden && navigator.onLine && token()){
          try{
            await bootstrap(true,true);
            // Never rebuild the whole UI while the payment dialog is being edited.
            // Rebuilding it every 5 seconds was resetting the customer selector.
            if($('paymentModal')?.hidden!==false) renderAll();
            else populateSelectors();
          }catch{}
        }
      },5000);
      document.addEventListener('visibilitychange',async()=>{
        if(!document.hidden && navigator.onLine && token()){
          try{
            await bootstrap(true,true);
            if($('paymentModal')?.hidden!==false) renderAll();
            else populateSelectors();
          }catch{}
        }
      });
      window.addEventListener('focus',async()=>{
        if(navigator.onLine && token()){
          try{
            await bootstrap(true,true);
            if($('paymentModal')?.hidden!==false) renderAll();
            else populateSelectors();
          }catch{}
        }
      });
    }
    else {$('loginView').hidden=false;$('appView').hidden=true}
    if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
    setStatus('جاهز لتسجيل الدخول.');
  }catch(e){console.error(e);setStatus(`خطأ في تشغيل التطبيق: ${e.message}`,'error')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMobile);else initMobile();

(function(){
  const open=()=>{const d=document.getElementById('moreDrawer');if(d)d.hidden=false};
  const close=()=>{const d=document.getElementById('moreDrawer');if(d)d.hidden=true};
  document.addEventListener('click',e=>{
    const b=e.target.closest('#moreMenuBtn');
    if(b){e.preventDefault();open();return;}
    if(e.target.closest('#closeMoreDrawer')||e.target.closest('#moreDrawerBackdrop')){e.preventDefault();close();return;}

    const item=e.target.closest('[data-more-action]');
    if(item){
      e.preventDefault();
      const action=item.dataset.moreAction;
      close();
      if(typeof showScreen==='function'){
        if(action==='sales'||action==='cash'||action==='expenses'||action==='favorites') showScreen('moreScreen');
      }
      return;
    }

    if(e.target.closest('#moreSyncBtn')){
      e.preventDefault();close();
      if(typeof syncNow==='function') void syncNow();
      return;
    }

    if(e.target.closest('#moreLogoutBtn')){
      e.preventDefault();close();
      if(typeof $==='function') localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }
  });
})();


document.addEventListener('click',e=>{
  const b=e.target.closest('#homeInvoicesBtn');
  if(!b)return;
  e.preventDefault();
  if(typeof openInvoiceList==='function') openInvoiceList();
});

document.addEventListener('click',e=>{
  const f=e.target.closest('.invoiceFilter');
  if(!f)return;
  invoiceFilterMode=f.dataset.invoiceFilter||'all';
  document.querySelectorAll('.invoiceFilter').forEach(x=>x.classList.toggle('active',x===f));
  renderSales();
});
