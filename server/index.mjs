import http from 'node:http';import dgram from 'node:dgram';import {URL} from 'node:url';import 'dotenv/config';import {query} from './db.mjs';import {sendJson,sendError,readJson,routeMatch} from './http.mjs';import {listProducts,getProduct,createProduct,updateProduct,deleteProduct} from './products.mjs';import {listCustomers,createCustomer,updateCustomer,listDebtors,customerDetails,addCustomerPayment} from './customers.mjs';import {createSale,cancelSale,listSales,updateSale} from './sales.mjs';import {createReturn} from './returns.mjs';import {listMovements,adjustStock} from './inventory.mjs';import {listExpenses,createExpense,deleteExpense} from './expenses.mjs';import {dashboard,topProducts,dailySales,expenseSummary,debtorSummary} from './reports.mjs';import {ensureAdmin,login,requireAuth,requirePermission,logout} from './auth.mjs';import {listUsers,upsertUser,setUserRoles,setRolePermissions} from './users.mjs';import {getCash,openCash,addCashMovement,closeCash} from './cash.mjs';import {importXlsx, previewXlsx} from './excel.mjs';import {getSettings,saveStoreSettings} from './settings.mjs';import {getBackupInfo,createBackup,restoreBackup,getBackupSchedule,saveBackupSchedule,startBackupScheduler,stopBackupScheduler} from './backup.mjs';import {listCategories,createCategory,updateCategory,deleteCategory,listUnits,createUnit,updateUnit,deleteUnit} from './catalog.mjs';import {listFavorites,toggleFavorite} from './favorites.mjs';
const port=Number(process.env.PORT||8787);
const corsOrigins = new Set(String(process.env.CORS_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4174,http://localhost:4174')
  .split(',').map(x => x.trim()).filter(Boolean));
function isAllowedCorsOrigin(origin){
  if (origin === 'null') return true;
  // Android WebView served through WebViewAssetLoader uses this HTTPS origin.
  // It must be explicitly allowed or fetch() fails with a generic 'Failed to fetch'.
  if (origin === 'https://appassets.androidplatform.net') return true;
  if (!origin) return false;
  if (corsOrigins.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (!['http:','https:'].includes(u.protocol)) return false;
    if (u.port !== '4174') return false;
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a,b] = parts;
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  } catch {
    return false;
  }
}
function applyCors(req,res){
  const origin = String(req.headers.origin || '');
  if (isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  }
}

const json=async req=>await readJson(req);
async function handler(req,res){applyCors(req,res);if(req.method==='OPTIONS')return sendJson(res,204,{});const url=new URL(req.url,`http://${req.headers.host||'localhost'}`),path=url.pathname;try{
if(req.method==='POST'&&path==='/api/sync'){
  const u=await requireAuth(req);
  const b=await json(req);
  const deviceId=String(b.deviceId||'unknown').slice(0,120);
  const operationId=String(b.operationId||'').slice(0,160);
  const entityType=String(b.entityType||'').trim();
  if(!operationId)throw Object.assign(new Error('operationId مفقود.'),{statusCode:400});
  if(!entityType)throw Object.assign(new Error('entityType مفقود.'),{statusCode:400});
  const existing=await query(`SELECT status,entity_id FROM sync_events WHERE device_id=$1 AND operation_id=$2`,[deviceId,operationId]);
  if(existing.rows[0])return sendJson(res,200,{ok:true,data:{applied:false,duplicate:true,entityId:existing.rows[0].entity_id||null}});
  const permissions={product:'products.create',sale:'sales.create',customer_payment:'sales.create',return:'sales.return',inventory_adjustment:'inventory.adjust',favorite:'products.view'};
  const requiresPermission=permissions[entityType]||null;
  if(!['product','customer','sale','customer_payment','return','inventory_adjustment','expense','cash_movement','favorite'].includes(entityType))throw Object.assign(new Error('نوع مزامنة غير مدعوم.'),{statusCode:400});
  const permitted=requiresPermission ? await requirePermission(req,requiresPermission) : await requireAuth(req);
  const bdata=b.payload||{};
  let data=bdata;
  if(entityType==='product') data=await createProduct(bdata,permitted.id);
  else if(entityType==='customer') data=await createCustomer(bdata,permitted.id);
  else if(entityType==='sale') {
    // Mobile never supplies an invoice number. createSale() allocates the
    // official number from the same PostgreSQL sequence used by desktop POS.
    const {invoiceNumber: _ignoredInvoiceNumber, ...salePayload}=bdata;
    data=await createSale({...salePayload,userId:permitted.id});
  }
  else if(entityType==='customer_payment') data=await addCustomerPayment(bdata.customerId,bdata.amount,bdata.note,permitted.id);
  else if(entityType==='return') data=await createReturn(bdata.saleId,bdata.items,bdata.reason,permitted.id);
  else if(entityType==='inventory_adjustment') data=await adjustStock(bdata.productId,bdata.quantity,bdata.type,bdata.note,permitted.id);
  else if(entityType==='expense') data=await createExpense(bdata,permitted.id);
  else if(entityType==='cash_movement') data=await addCashMovement(bdata.type,bdata.amount,bdata.note,permitted.id);
  else if(entityType==='favorite') data=await toggleFavorite(permitted.id,bdata.productId);
  await query(`INSERT INTO sync_events(device_id,operation_id,entity_type,entity_id,payload,status) VALUES($1,$2,$3,$4,$5,'applied')`,[deviceId,operationId,entityType,data?.id?String(data.id):null,JSON.stringify(bdata)]);
  return sendJson(res,200,{ok:true,data:{applied:true,entity:data}});
}
if(req.method==='GET'&&path==='/api/mobile/bootstrap'){
  const u=await requireAuth(req);
  const since=url.searchParams.get('since');
  const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||500),50),2000);
  const products=await listProducts({search:''});
  const customers=await listCustomers('');
  const sales=await listSales({limit});
  const debtors=await listDebtors();
  const cash=await getCash();
  const expenses=await listExpenses(null,null);
  const favorites=await listFavorites(u.id);
  return sendJson(res,200,{ok:true,data:{serverTime:new Date().toISOString(),since,products,customers,sales,debtors,cash,expenses,favorites,user:u}});
}
if(req.method==='GET'&&path==='/api/discovery'){return sendJson(res,200,{ok:true,service:'bazaar-pos',name:'بزار كل شيء بالمعقول',port,version:'1'});}
if(req.method==='GET'&&path==='/api/health'){await query('SELECT 1');return sendJson(res,200,{ok:true,service:'bazaar-api',database:'postgresql'});}
if(req.method==='POST'&&path==='/api/auth/login'){const b=await json(req);const clientIp=req.socket.remoteAddress || 'unknown';return sendJson(res,200,{ok:true,data:await login(b.username,b.password,clientIp)});}
if(req.method==='POST'&&path==='/api/auth/logout'){await logout(req);return sendJson(res,200,{ok:true});}
if(req.method==='GET'&&path==='/api/auth/me'){return sendJson(res,200,{ok:true,data:await requireAuth(req)});}
if(req.method==='GET'&&path==='/api/products'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await listProducts({search:url.searchParams.get('search')||''})});}
let m=routeMatch(path,'/api/products/:id');if(req.method==='GET'&&m){await requireAuth(req);const d=await getProduct(m.id);return d?sendJson(res,200,{ok:true,data:d}):sendError(res,404,'المنتج غير موجود.');}
if(req.method==='POST'&&path==='/api/products'){const u=await requirePermission(req,'products.create');return sendJson(res,201,{ok:true,data:await createProduct(await json(req),u.id)});}
if(req.method==='PUT'&&m){const u=await requirePermission(req,'products.update');return sendJson(res,200,{ok:true,data:await updateProduct(m.id,await json(req),u.id)});}
if(req.method==='DELETE'&&m){const u=await requirePermission(req,'products.delete');return sendJson(res,200,{ok:true,data:await deleteProduct(m.id,u.id)});}
if(req.method==='GET'&&path==='/api/catalog/categories'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await listCategories()});}
if(req.method==='POST'&&path==='/api/catalog/categories'){await requirePermission(req,'products.create');const b=await json(req);return sendJson(res,201,{ok:true,data:await createCategory(b.name)});}
m=routeMatch(path,'/api/catalog/categories/:id');if(req.method==='PUT'&&m){await requirePermission(req,'products.update');const b=await json(req);return sendJson(res,200,{ok:true,data:await updateCategory(m.id,b.name)});}
if(req.method==='DELETE'&&m){await requirePermission(req,'products.delete');return sendJson(res,200,{ok:true,data:await deleteCategory(m.id)});}
if(req.method==='GET'&&path==='/api/catalog/units'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await listUnits()});}
if(req.method==='POST'&&path==='/api/catalog/units'){await requirePermission(req,'products.create');const b=await json(req);return sendJson(res,201,{ok:true,data:await createUnit(b.name,b.symbol)});}
m=routeMatch(path,'/api/catalog/units/:id');if(req.method==='PUT'&&m){await requirePermission(req,'products.update');const b=await json(req);return sendJson(res,200,{ok:true,data:await updateUnit(m.id,b.name,b.symbol)});}
if(req.method==='DELETE'&&m){await requirePermission(req,'products.delete');return sendJson(res,200,{ok:true,data:await deleteUnit(m.id)});}
if(req.method==='GET'&&path==='/api/favorites'){const u=await requireAuth(req);return sendJson(res,200,{ok:true,data:await listFavorites(u.id)});}
if(req.method==='POST'&&path==='/api/favorites/toggle'){const u=await requirePermission(req,'products.view');const b=await json(req);return sendJson(res,200,{ok:true,data:await toggleFavorite(u.id,b.productId)});}
if(req.method==='GET'&&path==='/api/customers'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await listCustomers(url.searchParams.get('search')||'')});}
if(req.method==='POST'&&path==='/api/customers'){const u=await requireAuth(req);return sendJson(res,201,{ok:true,data:await createCustomer(await json(req),u.id)});}
if(req.method==='GET'&&path==='/api/customers/debts'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await listDebtors()});}
m=routeMatch(path,'/api/customers/:id');if(req.method==='GET'&&m){await requireAuth(req);return sendJson(res,200,{ok:true,data:await customerDetails(m.id)});}
m=routeMatch(path,'/api/customers/:id/payments');if(req.method==='POST'&&m){const u=await requireAuth(req);const b=await json(req);return sendJson(res,201,{ok:true,data:await addCustomerPayment(m.id,b.amount,b.note,u.id)});}
m=routeMatch(path,'/api/customers/:id');if(req.method==='PUT'&&m){const u=await requireAuth(req);return sendJson(res,200,{ok:true,data:await updateCustomer(m.id,await json(req),u.id)});}
if(req.method==='GET'&&path==='/api/sales'){await requirePermission(req,'sales.view');return sendJson(res,200,{ok:true,data:await listSales({limit:url.searchParams.get('limit')||100,from:url.searchParams.get('from'),to:url.searchParams.get('to'),search:url.searchParams.get('search')||''})});}
if(req.method==='POST'&&path==='/api/sales'){const u=await requirePermission(req,'sales.create');const body=await json(req);body.userId=u.id;return sendJson(res,201,{ok:true,data:await createSale(body)});}
m=routeMatch(path,'/api/sales/:id');if(req.method==='PATCH'&&m){const u=await requirePermission(req,'sales.create');const body=await json(req);body.userId=u.id;return sendJson(res,200,{ok:true,data:await updateSale(m.id,body)});}
m=routeMatch(path,'/api/sales/:id/cancel');if(req.method==='POST'&&m){const u=await requirePermission(req,'sales.cancel');return sendJson(res,200,{ok:true,data:await cancelSale(m.id,{...(await json(req)),userId:u.id})});}
m=routeMatch(path,'/api/sales/:id/return');if(req.method==='POST'&&m){const u=await requirePermission(req,'sales.return');const b=await json(req);return sendJson(res,201,{ok:true,data:await createReturn(m.id,b.items,b.reason,u.id)});}
if(req.method==='GET'&&path==='/api/inventory/movements'){await requirePermission(req,'inventory.view');return sendJson(res,200,{ok:true,data:await listMovements(url.searchParams.get('limit'))});}
if(req.method==='POST'&&path==='/api/inventory/adjust'){const u=await requirePermission(req,'inventory.adjust');const b=await json(req);return sendJson(res,201,{ok:true,data:await adjustStock(b.productId,b.quantity,b.type,b.note,u.id)});}
if(req.method==='POST'&&path==='/api/import/xlsx/preview'){await requirePermission(req,'products.import');const b=await json(req,16*1024*1024);if(!b.base64)throw Object.assign(new Error('ملف Excel مفقود.'),{statusCode:400});const result=await previewXlsx(Buffer.from(b.base64,'base64'));return sendJson(res,200,{ok:true,data:result});}
if(req.method==='POST'&&path==='/api/import/xlsx'){const u=await requirePermission(req,'products.import');const b=await json(req,16*1024*1024);if(!b.base64)throw Object.assign(new Error('ملف Excel مفقود.'),{statusCode:400});const result=await importXlsx(Buffer.from(b.base64,'base64'),u.id);return sendJson(res,200,{ok:true,data:result});}
if(req.method==='GET'&&path==='/api/cash'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await getCash()});}
if(req.method==='POST'&&path==='/api/cash/open'){const u=await requireAuth(req);const b=await json(req);return sendJson(res,201,{ok:true,data:await openCash(b.openingBalance,u.id)});}
if(req.method==='POST'&&path==='/api/cash/movement'){const u=await requireAuth(req);const b=await json(req);return sendJson(res,201,{ok:true,data:await addCashMovement(b.type,b.amount,b.note,u.id)});}
if(req.method==='POST'&&path==='/api/cash/close'){const u=await requireAuth(req);const b=await json(req);return sendJson(res,200,{ok:true,data:await closeCash(b.closingBalance,u.id)});}
if(req.method==='GET'&&path==='/api/expenses'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await listExpenses(url.searchParams.get('from'),url.searchParams.get('to'))});}
if(req.method==='POST'&&path==='/api/expenses'){const u=await requireAuth(req);return sendJson(res,201,{ok:true,data:await createExpense(await json(req),u.id)});}
m=routeMatch(path,'/api/expenses/:id');if(req.method==='DELETE'&&m){const u=await requireAuth(req);return sendJson(res,200,{ok:true,data:await deleteExpense(m.id,u.id)});}
if(req.method==='GET'&&path==='/api/reports/dashboard'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await dashboard(url.searchParams.get('from'),url.searchParams.get('to'))});}
if(req.method==='GET'&&path==='/api/reports/top-products'){await requirePermission(req,'reports.view');return sendJson(res,200,{ok:true,data:await topProducts(Number(url.searchParams.get('limit')||10),url.searchParams.get('from'),url.searchParams.get('to'))});}
if(req.method==='GET'&&path==='/api/reports/daily-sales'){await requirePermission(req,'reports.view');return sendJson(res,200,{ok:true,data:await dailySales(url.searchParams.get('from'),url.searchParams.get('to'))});}
if(req.method==='GET'&&path==='/api/reports/expense-summary'){await requirePermission(req,'reports.view');return sendJson(res,200,{ok:true,data:await expenseSummary(url.searchParams.get('from'),url.searchParams.get('to'))});}
if(req.method==='GET'&&path==='/api/reports/debtors'){await requirePermission(req,'reports.view');return sendJson(res,200,{ok:true,data:await debtorSummary(Number(url.searchParams.get('limit')||10))});}
if(req.method==='GET'&&path==='/api/backup'){await requirePermission(req,'users.manage');return sendJson(res,200,{ok:true,data:await getBackupInfo()});}
if(req.method==='POST'&&path==='/api/backup/create'){await requirePermission(req,'users.manage');return sendJson(res,201,{ok:true,data:await createBackup()});}
if(req.method==='POST'&&path==='/api/backup/restore'){await requirePermission(req,'users.manage');const b=await json(req);return sendJson(res,200,{ok:true,data:await restoreBackup(b.filename)});}
if(req.method==='GET'&&path==='/api/backup/schedule'){await requirePermission(req,'users.manage');return sendJson(res,200,{ok:true,data:await getBackupSchedule()});}
if(req.method==='PUT'&&path==='/api/backup/schedule'){await requirePermission(req,'users.manage');return sendJson(res,200,{ok:true,data:await saveBackupSchedule(await json(req))});}
if(req.method==='GET'&&path==='/api/settings'){await requireAuth(req);return sendJson(res,200,{ok:true,data:await getSettings()});}
if(req.method==='PUT'&&path==='/api/settings'){await requirePermission(req,'users.manage');const b=await json(req);return sendJson(res,200,{ok:true,data:await saveStoreSettings(b)});}
if(req.method==='GET'&&path==='/api/permissions'){await requirePermission(req,'permissions.manage');const rows=await query(`SELECT p.code,p.description,COALESCE(array_agg(r.name) FILTER(WHERE r.id IS NOT NULL),'{}') roles FROM permissions p LEFT JOIN role_permissions rp ON rp.permission_id=p.id LEFT JOIN roles r ON r.id=rp.role_id GROUP BY p.id ORDER BY p.code`);return sendJson(res,200,{ok:true,data:rows.rows});}
m=routeMatch(path,'/api/roles/:role/permissions');if(req.method==='POST'&&m){await requirePermission(req,'permissions.manage');const b=await json(req);return sendJson(res,200,{ok:true,data:await setRolePermissions(m.role,b.permissions||[])});}
if(req.method==='GET'&&path==='/api/users'){await requirePermission(req,'users.manage');return sendJson(res,200,{ok:true,data:await listUsers()});}
if(req.method==='POST'&&path==='/api/users'){await requirePermission(req,'users.manage');return sendJson(res,201,{ok:true,data:await upsertUser(await json(req))});}
m=routeMatch(path,'/api/users/:id/roles');if(req.method==='POST'&&m){await requirePermission(req,'permissions.manage');return sendJson(res,200,{ok:true,data:await setUserRoles(m.id,(await json(req)).roles||[])});}
return sendError(res,404,'المسار غير موجود.');}catch(e){console.error(e);return sendError(res,Number(e.statusCode)||(e.code==='23505'?409:500),e.message||'حدث خطأ غير متوقع.');}}
await ensureAdmin();
const server=http.createServer(handler);
const discoveryPort=Number(process.env.DISCOVERY_PORT||8788);
const discoverySocket=dgram.createSocket('udp4');
const discoveryPayload='BAZAAR_POS_DISCOVER_V1';
discoverySocket.on('message',(msg,rinfo)=>{
  if(String(msg).trim()!==discoveryPayload)return;
  const body=Buffer.from(JSON.stringify({service:'bazaar-pos',name:'بزار كل شيء بالمعقول',port,version:'1'}),'utf8');
  discoverySocket.send(body,0,body.length,rinfo.port,rinfo.address);
});
discoverySocket.on('error',err=>console.error(`[api] LAN discovery error: ${err.message}`));
discoverySocket.bind(discoveryPort,'0.0.0.0',()=>console.log(`[api] Bazaar LAN discovery listening on UDP ${discoveryPort}`));
server.listen(port,'0.0.0.0',()=>{console.log(`Bazaar API listening on http://0.0.0.0:${port} (LAN enabled)`);startBackupScheduler();});
process.on('SIGTERM',()=>{
  stopBackupScheduler();
  try{discoverySocket.close();}catch{}
  server.close(()=>process.exit(0));
});
