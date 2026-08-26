const https = require('https');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { shell, dialog, app } = require('electron');
const { spawn } = require('child_process');

const OWNER = 'hamadz1992';
const REPO = 'BazaarKolchiBelMa3qoul';
const RELEASES_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const RELEASE_TAG_URL = (tag) => `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tag)}`;
const API_BASE = (process.env.VITE_API_URL || 'http://localhost:8787/api').replace(/\/$/, '');

function appDataRoot() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'BazaarKolchiBelMa3qoul');
}
function versionsDir() { return path.join(appDataRoot(), 'Versions'); }
function statePath() { return path.join(appDataRoot(), 'update-state.json'); }

async function ensureDirs() {
  await fsp.mkdir(versionsDir(), { recursive: true });
  await fsp.mkdir(appDataRoot(), { recursive: true });
}

function versionTuple(v) {
  const clean = String(v || '').replace(/^v/i, '').split('-')[0];
  return clean.split('.').map((x) => Number.parseInt(x, 10) || 0).slice(0, 3);
}
function versionString(v) { return versionTuple(v).join('.'); }
function compareVersions(a, b) {
  const x = versionTuple(a), y = versionTuple(b);
  for (let i = 0; i < 3; i += 1) { if (x[i] !== y[i]) return x[i] - y[i]; }
  return 0;
}
function isNewer(remote, local) { return compareVersions(remote, local) > 0; }
function safeVersion(v) { return String(v || '').replace(/^v/i, '').replace(/[^0-9A-Za-z._-]/g, '_') || 'unknown'; }

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': `${app.getName()}/${app.getVersion()}`,
        'Accept': 'application/vnd.github+json'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Update server returned HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid update metadata')); }
      });
    });
    req.setTimeout(12000, () => req.destroy(new Error('Update check timed out')));
    req.on('error', reject);
  });
}

function requestJson(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.request(u, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {})
      },
      timeout: 12000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.error || data.message || `API HTTP ${res.statusCode}`));
          return;
        }
        resolve(data.data ?? data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الاتصال بخدمة البرنامج.')));
    req.on('error', reject);
    if (body != null) req.write(JSON.stringify(body));
    req.end();
  });
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const request = https.get(url, { headers: { 'User-Agent': `${app.getName()}/${app.getVersion()}` } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(destination, () => {});
        download(res.headers.location, destination).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destination, () => {});
        reject(new Error(`Download failed with HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      res.on('data', (chunk) => { received += chunk.length; });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ total, received })));
    });
    request.setTimeout(120000, () => request.destroy(new Error('انتهت مهلة تنزيل التحديث.')));
    request.on('error', (err) => { file.close(); fs.unlink(destination, () => {}); reject(err); });
  });
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function findInstallerAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return assets.find((a) => /BazaarKolchiBelMa3qoul-Setup-.*\.exe$/i.test(a.name))
    || assets.find((a) => /\.exe$/i.test(a.name));
}

function findChecksumAsset(release) {
  return (release.assets || []).find((a) => /sha256|checksums?/i.test(a.name));
}

async function verifyChecksum(target, release) {
  const checksumAsset = findChecksumAsset(release);
  if (!checksumAsset?.browser_download_url) return true;
  const checkFile = `${target}.sha256`;
  try {
    await download(checksumAsset.browser_download_url, checkFile);
    const expected = (await fsp.readFile(checkFile, 'utf8')).match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase();
    if (!expected) return true;
    const actual = (await sha256(target)).toLowerCase();
    if (expected !== actual) throw new Error('فشل التحقق من سلامة ملف التحديث.');
    return true;
  } finally { await fsp.rm(checkFile, { force: true }).catch(() => {}); }
}

async function readState() {
  try { return JSON.parse(await fsp.readFile(statePath(), 'utf8')); }
  catch { return { versions: [] }; }
}
async function writeState(state) {
  await ensureDirs();
  await fsp.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
}

async function listPreviousVersions() {
  await ensureDirs();
  const entries = await fsp.readdir(versionsDir(), { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const v = entry.name;
    const dir = path.join(versionsDir(), v);
    const manifest = path.join(dir, 'manifest.json');
    try {
      const meta = JSON.parse(await fsp.readFile(manifest, 'utf8'));
      out.push({ version: v, createdAt: meta.createdAt, installer: meta.installer || null, databaseBackup: meta.databaseBackup || null });
    } catch {}
  }
  out.sort((a,b) => compareVersions(b.version, a.version));
  return out.slice(0, 3);
}

async function prunePreviousVersions() {
  const versions = await listPreviousVersions();
  const keep = new Set(versions.slice(0, 3).map((v) => v.version));
  const entries = await fsp.readdir(versionsDir(), { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && !keep.has(e.name)) await fsp.rm(path.join(versionsDir(), e.name), { recursive: true, force: true });
  }
}
async function createDatabaseBackup(token, destination) {
  if (!token) throw new Error('لا توجد جلسة مصادقة لإنشاء نسخة قاعدة البيانات.');
  const result = await requestJson(`${API_BASE}/backup/create`, { method: 'POST', token });
  if (!result?.path || !fs.existsSync(result.path)) throw new Error('تعذر إنشاء نسخة قاعدة البيانات قبل التحديث.');
  await fsp.copyFile(result.path, destination);
  return { source: result.path, destination };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        family: 4,
        headers: {
          'User-Agent': `${app.getName()}/${app.getVersion()}`,
          Accept: 'application/vnd.github+json'
        }
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Update server returned HTTP ${res.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid update metadata'));
          }
        });
      }
    );

    req.setTimeout(30000, () => {
      req.destroy(new Error('Update check timed out'));
    });

    req.on('error', reject);
  });
}

async function prepareCurrentVersionBackup(token) {
  await ensureDirs();
  const current = versionString(app.getVersion());
  const dir = path.join(versionsDir(), current);
  await fsp.mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  let manifest = { version: current, createdAt: new Date().toISOString(), installer: null, databaseBackup: null };
  try { manifest = { ...manifest, ...(JSON.parse(await fsp.readFile(manifestPath, 'utf8')) || {}) }; } catch {}

  const currentRelease = await getJson(RELEASE_TAG_URL(`v${current}`)).catch(() => null);
  const asset = currentRelease && findInstallerAsset(currentRelease);
  if (asset?.browser_download_url) {
    const installer = path.join(dir, `BazaarKolchiBelMa3qoul-Setup-${current}.exe`);
    if (!fs.existsSync(installer) || fs.statSync(installer).size < 1024 * 1024) {
      await download(asset.browser_download_url, installer);
      await verifyChecksum(installer, currentRelease);
    }
    manifest.installer = installer;
  }

  const dbFile = path.join(dir, `database-${current}.dump`);
  if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0) {
    await createDatabaseBackup(token, dbFile);
  }
  manifest.databaseBackup = dbFile;
  manifest.createdAt = new Date().toISOString();
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  await prunePreviousVersions();
  return manifest;
}

async function performUpdate(remoteVersion, release, token) {
  if (!token) throw new Error('سجّل الدخول أولًا حتى يتم أخذ نسخة احتياطية من قاعدة البيانات.');

  await prepareCurrentVersionBackup(token);
  const asset = findInstallerAsset(release);
  if (!asset?.browser_download_url) throw new Error('لم يتم العثور على ملف تثبيت Windows للإصدار الجديد.');
  const target = path.join(os.tmpdir(), `BazaarKolchiBelMa3qoul-${safeVersion(remoteVersion)}.exe`);
  await fsp.rm(target, { force: true });
  await download(asset.browser_download_url, target);
  await verifyChecksum(target, release);

  const stagedDir = path.join(versionsDir(), safeVersion(remoteVersion));
  await fsp.mkdir(stagedDir, { recursive: true });
  await fsp.copyFile(target, path.join(stagedDir, path.basename(target)));
  await fsp.writeFile(path.join(stagedDir, 'pending.json'), JSON.stringify({ version: safeVersion(remoteVersion), stagedAt: new Date().toISOString() }, null, 2), 'utf8');
  return target;
}

async function checkForUpdates(options = {}) {
  if (!app.isPackaged || process.platform !== 'win32') return { ok: true, available: false, skipped: true, current: app.getVersion() };
  try {
    const release = await getJson(RELEASES_URL);
    const remoteVersion = versionString(release.tag_name || release.name || '');
    if (!remoteVersion || !isNewer(remoteVersion, app.getVersion())) return { ok: true, available: false, current: app.getVersion() };
    const token = options.token || '';
    if (!token) return { ok: true, available: true, version: remoteVersion, requiresLogin: true };

    const confirm = await dialog.showMessageBox({
      type: 'info',
      title: 'تحديث جديد متاح',
      message: `يتوفر إصدار جديد ${remoteVersion}.`,
      detail: `الإصدار الحالي: ${app.getVersion()}\n\nسيتم أولًا حفظ نسخة من قاعدة البيانات والإصدار الحالي، ثم تنزيل وتثبيت الإصدار الجديد وإعادة تشغيل البرنامج.\n\nهل تريد التحديث الآن؟`,
      buttons: ['تحديث الآن', 'لاحقًا'],
      defaultId: 0,
      cancelId: 1
    });
    if (confirm.response !== 0) return { ok: true, available: true, postponed: true, version: remoteVersion };

    const target = await performUpdate(remoteVersion, release, token);
    await installWithRestart(target);
    return { ok: true, available: true, updated: true, version: remoteVersion };
  } catch (error) {
    if (options.silent) return { ok: false, error: error?.message || String(error) };
    await dialog.showMessageBox({ type: 'warning', title: 'تعذر تحديث البرنامج', message: error?.message || 'حدث خطأ أثناء التحديث.' });
    return { ok: false, error: error?.message || String(error) };
  }
}

async function rollbackVersion(version, token) {
  if (!app.isPackaged || process.platform !== 'win32') throw new Error('الاستعادة متاحة على نسخة Windows المثبتة فقط.');
  if (!token) throw new Error('سجّل الدخول أولًا.');
  const dir = path.join(versionsDir(), safeVersion(version));
  const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  if (!manifest.installer || !fs.existsSync(manifest.installer)) throw new Error('ملف تثبيت هذا الإصدار غير متوفر محليًا.');
  if (!manifest.databaseBackup || !fs.existsSync(manifest.databaseBackup)) throw new Error('نسخة قاعدة البيانات المتوافقة مع هذا الإصدار غير متوفرة.');

  const confirm = await dialog.showMessageBox({
    type: 'warning', title: 'استعادة إصدار سابق',
    message: `استعادة الإصدار ${safeVersion(version)}؟`,
    detail: 'سيتم أولًا استعادة قاعدة البيانات المرتبطة بهذا الإصدار، ثم تثبيت البرنامج وإعادة تشغيله. هذا الإجراء لا يمكن التراجع عنه أثناء تنفيذه.',
    buttons: ['استعادة', 'إلغاء'], defaultId: 1, cancelId: 1
  });
  if (confirm.response !== 0) return { ok: true, cancelled: true };

  // Restore the matching database before downgrading the application.
  const backupDir = path.dirname(manifest.databaseBackup);
  const managedBackupDir = path.join(appDataRoot(), 'Backups');
  const target = path.join(managedBackupDir, path.basename(manifest.databaseBackup));
  await fsp.mkdir(managedBackupDir, { recursive: true });
  if (path.resolve(backupDir) !== path.resolve(managedBackupDir)) {
    await fsp.copyFile(manifest.databaseBackup, target);
  }
  await requestJson(`${API_BASE}/backup/restore`, { method: 'POST', token }, { filename: path.basename(target) });
  await installWithRestart(manifest.installer);
  return { ok: true, restoring: true, version: versionString(version) };
}

async function prepareRollbackManifest() { return listPreviousVersions(); }
module.exports = { checkForUpdates, listPreviousVersions: prepareRollbackManifest, rollbackVersion, appDataRoot };
