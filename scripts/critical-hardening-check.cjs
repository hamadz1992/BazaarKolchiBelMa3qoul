const fs = require('node:fs');
const path = require('node:path');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const root = path.resolve(__dirname, '..');

function filesUnder(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(full, entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const migrationsDir = path.join(root, 'database', 'migrations');
const migrations = fs.readdirSync(migrationsDir);
assert(!migrations.some((name) => /^011_.*\.sql$/.test(name)), 'Destructive migration 011 is still present.');
assert(migrations.includes('012_security_hardening.sql'), 'Migration 012 security hardening is missing.');

const sourceFiles = [
  ...filesUnder(path.join(root, 'src'), (f, n) => /\.(jsx?|html|css)$/.test(n)),
  ...filesUnder(path.join(root, 'server'), (f, n) => /\.mjs$/.test(n)),
  ...filesUnder(path.join(root, 'electron'), (f, n) => /\.cjs$/.test(n)),
];
for (const full of sourceFiles) {
  const text = fs.readFileSync(full, 'utf8');
  assert(!/\.bak$/.test(full), `Backup source file present: ${path.relative(root, full)}`);
  if (/\/(?:PrinterManager\.jsx|pos-ui-fix\.js)$/.test(full.replaceAll('\\', '/'))) {
    assert(!/innerHTML|dangerouslySetInnerHTML/.test(text), `${path.relative(root, full)} still contains unsafe HTML injection APIs.`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
assert(pkg.devDependencies?.electron === '43.2.0', 'package.json is not pinned to Electron 43.2.0.');
assert(lock.packages?.['']?.devDependencies?.electron === '43.2.0', 'package-lock root does not pin Electron 43.2.0.');
assert(lock.packages?.['node_modules/electron']?.version === '43.2.0', 'package-lock Electron node is not 43.2.0.');
assert(fs.readFileSync(path.join(root, 'server/auth.mjs'), 'utf8').includes('auth_login_attempts'), 'Login rate limiting is missing.');

const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
assert(/sandbox\s*:\s*true/.test(main), 'Electron sandbox is not enabled in main window configuration.');
assert(/contextIsolation\s*:\s*true/.test(main), 'Electron contextIsolation is not enabled.');
assert(/nodeIntegration\s*:\s*false/.test(main), 'Electron nodeIntegration is not disabled.');

const serverIndex = fs.readFileSync(path.join(root, 'server/index.mjs'), 'utf8');
assert(!/CORS_ORIGIN\s*\|\|\s*'\*'/.test(serverIndex), 'Wildcard CORS is present.');
assert(serverIndex.includes('CORS_ORIGIN'), 'Explicit CORS allowlist handling is missing.');

const legacyRuntimeNames = [
  'reset-invoices.mjs',
  'import-localstorage.mjs',
  'validate-localstorage.mjs',
];
for (const name of legacyRuntimeNames) {
  assert(!fs.existsSync(path.join(root, 'scripts', name)) && !fs.existsSync(path.join(root, 'server/tools', name)),
    `Unused legacy runtime tool remains: ${name}`);
}
assert(!fs.existsSync(path.join(root, 'database/migrations/002_legacy_import.sql')), 'Legacy import migration remains in production migrations.');

const runtimeText = sourceFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const localStorageViolations = runtimeText
  .split(/\r?\n/)
  .filter(line => /localStorage\./.test(line) && !/bazaar_api_token|apiToken|setAuthToken|bazaar_current_user|bazaar:cash-updated|bazaar:inventory-updated/.test(line));
assert(localStorageViolations.length === 0, 'Operational localStorage usage remains in runtime sources.');

const cssFiles = filesUnder(path.join(root, 'src'), (f, n) => n.endsWith('.css'));
const importText = [...sourceFiles, path.join(root, 'index.html')]
  .filter(fs.existsSync)
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
const deadCss = cssFiles.filter(file => {
  const name = path.basename(file);
  return !importText.includes(name) && !['styles.css'].includes(name);
});
assert(deadCss.length === 0, `Unused CSS files remain: ${deadCss.map(f => path.relative(root, f)).join(', ')}`);

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert(readme.includes('PostgreSQL') && readme.includes('npm run test:financial'), 'README.md is not the current project guide.');

console.log('Critical hardening checks: PASS');
