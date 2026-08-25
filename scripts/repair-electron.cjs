const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronDir = path.dirname(require.resolve('electron/package.json', { paths: [projectRoot] }));
const electronVersion = require(path.join(electronDir, 'package.json')).version;
const distDir = path.join(electronDir, 'dist');
const electronExe = path.join(distDir, 'electron.exe');
const installScript = path.join(electronDir, 'install.js');

function log(...args) { console.log('[electron:repair]', ...args); }

log('Electron package:', electronDir);
log('Version:', electronVersion);
log('Binary:', electronExe);

if (fs.existsSync(electronExe)) {
  log('Electron binary already exists.');
  process.exit(0);
}

function runInstaller() {
  if (!fs.existsSync(installScript)) return false;
  log('Running Electron installer directly...');
  const result = cp.spawnSync(process.execPath, [installScript], {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: false,
    shell: false,
  });
  if (result.error) log('Installer error:', result.error.message);
  return fs.existsSync(electronExe);
}

function findCachedZip() {
  if (process.platform !== 'win32') return null;
  const base = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'electron', 'Cache');
  if (!base || !fs.existsSync(base)) return null;
  const wanted = `electron-v${electronVersion}-win32-x64.zip`;
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === wanted) return full;
    }
  }
  return null;
}

function extractCachedZip(zipPath) {
  if (!zipPath || process.platform !== 'win32') return false;
  fs.mkdirSync(distDir, { recursive: true });
  log('Using cached Electron ZIP:', zipPath);
  const ps = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(distDir)} -Force`
  ];
  const result = cp.spawnSync('powershell.exe', ps, { stdio: 'inherit', windowsHide: false });
  if (result.error) log('PowerShell extraction error:', result.error.message);
  return fs.existsSync(electronExe);
}

if (runInstaller()) {
  log('Electron binary OK.');
  process.exit(0);
}

const cachedZip = findCachedZip();
if (extractCachedZip(cachedZip)) {
  log('Electron binary restored from cache.');
  process.exit(0);
}

console.error('[electron:repair] Electron binary is still missing.');
if (cachedZip) console.error('[electron:repair] Cached ZIP was found but could not be extracted.');
else console.error(`[electron:repair] No cached Electron ${electronVersion} ZIP was found.`);
// Do not make npm install fail solely because Electron could not be restored.
process.exit(0);
