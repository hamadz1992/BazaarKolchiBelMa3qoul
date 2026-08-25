const fs = require('node:fs');
const path = require('node:path');
const assert = (c,m)=>{if(!c)throw new Error(m)};
const root=path.resolve(__dirname,'..');
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
const envExample=read('.env.example');
const localEnvPresent=fs.existsSync(path.join(root,'.env'));
if(localEnvPresent) console.warn('Security audit: local .env detected; it is allowed for runtime but must be excluded from release archives.');
assert(/DATABASE_URL=/.test(envExample),'DATABASE_URL missing from .env.example');
assert(!envExample.includes('admin123'),'Default admin password leaked in .env.example.');

const packageJson=JSON.parse(read('package.json'));
assert(packageJson.devDependencies?.electron==='43.2.0','Electron version mismatch.');
assert(!packageJson.scripts?.['db:reset-invoices'],'reset-invoices must not be a production npm script.');
assert(!packageJson.scripts?.['db:import'] && !packageJson.scripts?.['db:validate-import'],'Legacy localStorage import scripts must not be production scripts.');

const migrations=fs.readdirSync(path.join(root,'database/migrations'));
assert(!migrations.some(n=>/^011_.*\.sql$/.test(n)),'Destructive migration 011 remains.');
assert(!migrations.includes('002_legacy_import.sql'),'Legacy import migration remains.');
assert(migrations.includes('012_security_hardening.sql'),'Security hardening migration missing.');

const targets=['src/pos-ui-fix.js','src/PrinterManager.jsx'].filter(rel=>fs.existsSync(path.join(root,rel)));
for(const rel of targets){
 const t=read(rel);
 assert(!/innerHTML|dangerouslySetInnerHTML/.test(t),`${rel} contains unsafe HTML APIs.`);
}
const auth=read('server/auth.mjs');
assert(auth.includes('LOGIN_MAX_FAILURES')&&auth.includes('blocked_until'),'Login rate limiting/lockout is missing.');
const server=read('server/index.mjs');
assert(server.includes('CORS_ORIGIN') && !server.includes("CORS_ORIGIN || '*'"),'CORS is not restricted.');

for(const rel of ['src/CustomersView.jsx.bak','scripts/reset-invoices.mjs','server/tools/import-localstorage.mjs','server/tools/validate-localstorage.mjs']){
 assert(!fs.existsSync(path.join(root,rel)),`Unused legacy file remains: ${rel}`);
}

const cssFiles=fs.readdirSync(path.join(root,'src')).filter(n=>n.endsWith('.css'));
const allSources=[...fs.readdirSync(path.join(root,'src')).filter(n=>/\.(jsx?|html)$/.test(n)).map(n=>read('src/'+n)),read('index.html')].join('\n');
const dead=cssFiles.filter(n=>!allSources.includes(n) && n!=='styles.css');
assert(dead.length===0,`Unused CSS remain: ${dead.join(', ')}`);

const runtimeFiles=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(jsx?|mjs|cjs)$/.test(e.name))runtimeFiles.push(p)}}walk(path.join(root,'src'));walk(path.join(root,'server'));walk(path.join(root,'electron'));
const local=runtimeFiles.flatMap(f=>read(path.relative(root,f)).split(/\r?\n/).filter(x=>/localStorage\./.test(x)));
const operational=local.filter(x=>!/(bazaar_api_token|apiToken|setAuthToken|bazaar_current_user|bazaar:cash-updated|bazaar:inventory-updated)/.test(x));
assert(operational.length===0,'Operational localStorage usage remains.');

console.log('Security audit: PASS');
