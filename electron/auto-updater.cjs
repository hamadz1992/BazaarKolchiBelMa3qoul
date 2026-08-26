const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const https = require('https');
const http = require('http');
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const API_BASE = (process.env.VITE_API_URL || 'http://127.0.0.1:8787/api').replace(/\/$/, '');
const UPDATE_LOG = path.join(app.getPath('userData'), 'update.log');

function log(level, message, error) {
  const text = `[${new Date().toISOString()}] [${level}] ${message}${error ? ` ${error.stack || error.message || error}` : ''}\n`;
  try {
    fs.mkdirSync(path.dirname(UPDATE_LOG), { recursive: true });
    fs.appendFileSync(UPDATE_LOG, text, 'utf8');
  } catch {}
  if (level === 'ERROR') console.error(text.trim());
  else console.log(text.trim());
}

autoUpdater.logger = {
  info: (message) => log('INFO', String(message)),
  warn: (message) => log('WARN', String(message)),
  error: (message, error) => log('ERROR', String(message), error),
  debug: (message) => log('DEBUG', String(message))
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.autoRunAppAfterInstall = true;
autoUpdater.disableDifferentialDownload = true;

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      timeout: 15000
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
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
    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الاتصال بخدمة النسخ الاحتياطي.')));
    req.on('error', reject);
    req.end();
  });
}

async function backupDatabase(token) {
  if (!token) throw new Error('سجّل الدخول أولًا حتى يتم أخذ نسخة احتياطية من قاعدة البيانات.');
  const result = await requestJson(`${API_BASE}/backup/create`, token);
  if (!result?.path || !fs.existsSync(result.path)) {
    throw new Error('تعذر إنشاء نسخة قاعدة البيانات قبل التحديث.');
  }
  const backupDir = path.join(app.getPath('userData'), 'Backups');
  await fsp.mkdir(backupDir, { recursive: true });
  const destination = path.join(backupDir, `database-before-update-${app.getVersion()}.dump`);
  await fsp.copyFile(result.path, destination);
  log('INFO', `Database backup created: ${destination}`);
  return destination;
}

function waitForDownloadedUpdate() {
  return new Promise((resolve, reject) => {
    const onDownloaded = (info) => {
      cleanup();
      resolve(info);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('انتهت مهلة تنزيل التحديث.'));
    }, 30 * 60 * 1000);
    function cleanup() {
      clearTimeout(timer);
      autoUpdater.removeListener('update-downloaded', onDownloaded);
      autoUpdater.removeListener('error', onError);
    }
    autoUpdater.once('update-downloaded', onDownloaded);
    autoUpdater.once('error', onError);
  });
}

async function checkForUpdates(options = {}) {
  if (!app.isPackaged || process.platform !== 'win32') {
    return { ok: true, available: false, skipped: true, current: app.getVersion() };
  }

  try {
    log('INFO', `Checking for updates. Current version: ${app.getVersion()}`);
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      return {
        ok: true,
        available: false,
        current: app.getVersion(),
        remote: result?.updateInfo?.version || null
      };
    }

    const remoteVersion = result.updateInfo.version;
    const token = options.token || '';
    if (!token) {
      return { ok: true, available: true, version: remoteVersion, requiresLogin: true };
    }

    const confirm = await dialog.showMessageBox({
      type: 'info',
      title: 'تحديث جديد متاح',
      message: `يتوفر إصدار جديد ${remoteVersion}.`,
      detail: `الإصدار الحالي: ${app.getVersion()}\n\nسيتم حفظ نسخة من قاعدة البيانات، ثم تنزيل التحديث الرسمي وتثبيته وإعادة تشغيل البرنامج تلقائيًا.`,
      buttons: ['تحديث الآن', 'لاحقًا'],
      defaultId: 0,
      cancelId: 1
    });

    if (confirm.response !== 0) {
      return { ok: true, available: true, postponed: true, version: remoteVersion };
    }

    await backupDatabase(token);
    log('INFO', `Starting official electron-updater download: ${remoteVersion}`);

    const downloadedPromise = waitForDownloadedUpdate();
    await autoUpdater.downloadUpdate();
    const info = await downloadedPromise;
    log('INFO', `Update downloaded: ${info?.version || remoteVersion}`);

    // electron-updater 6.x: silent NSIS install + force relaunch after installation.
    // This replaces the custom PowerShell installer that previously failed to relaunch.
    autoUpdater.quitAndInstall(true, true);
    return { ok: true, available: true, updated: true, version: remoteVersion };
  } catch (error) {
    log('ERROR', 'Update failed', error);
    if (options.silent) return { ok: false, error: error?.message || String(error) };
    await dialog.showMessageBox({
      type: 'warning',
      title: 'تعذر تحديث البرنامج',
      message: error?.message || 'حدث خطأ أثناء التحديث.',
      detail: `يمكن مراجعة سجل التحديث هنا:\n${UPDATE_LOG}`
    });
    return { ok: false, error: error?.message || String(error) };
  }
}

module.exports = { checkForUpdates, updateLogPath: UPDATE_LOG };
