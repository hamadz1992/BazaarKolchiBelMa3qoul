const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const { checkForUpdates, listPreviousVersions, rollbackVersion } = require('./updater.cjs');
const path = require('path');

const isDev = !app.isPackaged;
let appCloseApproved = false;
let mainWindow = null;
let authToken = '';

let apiProcess = null;
let apiStarting = false;
let appQuitting = false;

function apiScriptPath() {
  return path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'server', 'index.mjs');
}

function checkLocalApi() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8787/api/health', { timeout: 1200 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function startApiServer() {
  if (apiStarting || apiProcess) return;
  apiStarting = true;
  try {
    if (await checkLocalApi()) {
      console.log('[desktop] API already running on 127.0.0.1:8787');
      return;
    }

    const script = apiScriptPath();
    const fs = require('fs');
    if (!fs.existsSync(script)) {
      console.error('[desktop] API script not found:', script);
      return;
    }

    const apiRoot = path.dirname(path.dirname(script));
   const env = {
  ...process.env,
  PORT: String(process.env.PORT || 8787),
  ELECTRON_RUN_AS_NODE: '1',
  DOTENV_CONFIG_PATH: app.isPackaged
    ? path.join(app.getPath('userData'), '.env')
    : path.join(apiRoot, '.env')
};

    apiProcess = spawn(process.execPath, [script], {
      cwd: apiRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    apiProcess.stdout?.on('data', (chunk) => console.log(`[api] ${String(chunk).trimEnd()}`));
    apiProcess.stderr?.on('data', (chunk) => console.error(`[api] ${String(chunk).trimEnd()}`));

    apiProcess.on('error', (error) => {
      console.error('[desktop] API process error:', error?.message || error);
      apiProcess = null;
    });

    apiProcess.on('exit', (code, signal) => {
      console.log(`[desktop] API exited (code=${code}, signal=${signal || 'none'})`);
      apiProcess = null;
      if (!appQuitting) {
        setTimeout(() => { startApiServer().catch(() => {}); }, 1200);
      }
    });

    // Wait for the API to become ready. DB initialization can take a few seconds;
    // avoid reporting a false failure while the child process is still starting.
    const deadline = Date.now() + 15000;
    const waitForApi = async () => {
      while (!appQuitting && Date.now() < deadline) {
        if (await checkLocalApi()) {
          console.log('[desktop] API ready on 127.0.0.1:8787');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!appQuitting) {
        console.warn('[desktop] API did not become ready on 127.0.0.1:8787');
      }
    };
    waitForApi().catch(error => console.warn('[desktop] API readiness check failed:', error?.message || error));
  } finally {
    apiStarting = false;
  }
}

function stopApiServer() {
  appQuitting = true;
  if (apiProcess && !apiProcess.killed) {
    try { apiProcess.kill(); } catch {}
    apiProcess = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#061426',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => win.show());
  if (!mainWindow) mainWindow = win;
  win.on('close', (event) => {
    if (win !== mainWindow || appCloseApproved) return;
    appCloseApproved = true;
  });
  win.on('closed', () => { if (win === mainWindow) mainWindow = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isPosWindow = isDev
      ? (() => {
          try {
            const parsed = new URL(url);
            return (parsed.origin === 'http://127.0.0.1:5173' || parsed.origin === 'http://localhost:5173') && parsed.searchParams.get('pos') === '1';
          } catch {
            return false;
          }
        })()
      : url.startsWith('file://') && /index\.html\?pos=1(?:#.*)?$/.test(url);

    if (isPosWindow) {
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          width: 1400,
          height: 850,
          minWidth: 900,
          minHeight: 600,
          title: 'نقطة البيع — كل شيء بالمعقول',
          backgroundColor: '#061426',
          autoHideMenuBar: true,
          resizable: true,
          maximizable: true,
          minimizable: true,
          fullscreen: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
          }
        }
      };
    }

    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-create-window', (childWindow, details) => {
    try {
      const parsed = new URL(details.url);
      if (parsed.searchParams.get('pos') === '1') {
        childWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
          console.error('[desktop] POS window failed to load:', errorCode, errorDescription, validatedURL);
        });
        childWindow.once('ready-to-show', () => {
          childWindow.setFullScreen(true);
          childWindow.show();
          childWindow.focus();
        });
      }
    } catch (error) {
      console.error('[desktop] POS window setup failed:', error?.message || error);
    }
  });

  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}


ipcMain.handle('desktop:set-auth-token', async (_event, token) => {
  authToken = typeof token === 'string' ? token.trim() : '';
  if (authToken && app.isPackaged) {
    setTimeout(() => { checkForUpdates({ silent: true, token: authToken }).catch(() => {}); }, 1200);
  }
  return true;
});
ipcMain.handle('desktop:update-check', async () => checkForUpdates({ silent: false, token: authToken }));
ipcMain.handle('desktop:update-versions', async () => listPreviousVersions());
ipcMain.handle('desktop:rollback-version', async (_event, version) => rollbackVersion(version, authToken));

ipcMain.on('desktop:cash-updated', (event) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('desktop:cash-updated');
  }
});

ipcMain.on('desktop:inventory-updated', () => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('desktop:inventory-updated');
  }
});

ipcMain.on('desktop:reports-updated', () => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('desktop:reports-updated');
  }
});

ipcMain.on('desktop:data-changed', (event, payload = {}) => {
  const domains = Array.isArray(payload.domains) ? [...new Set(payload.domains.map(String).filter(Boolean))] : [];
  if (!domains.length) return;
  const message = { domains, at: Number(payload.meta?.at || Date.now()), source: payload.meta?.source || 'ui' };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('desktop:data-changed', message);
  }
});

ipcMain.on('desktop:confirm-app-close', () => {
  appCloseApproved = true;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.close();
  }
  app.quit();
});

ipcMain.handle('desktop:focus-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (typeof win.moveTop === 'function') win.moveTop();
  return true;
});

ipcMain.handle('desktop:get-info', () => ({
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion(),
  isPackaged: app.isPackaged
}));

ipcMain.handle('desktop:printers', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName,
    description: printer.description || '',
    status: printer.status,
    isDefault: Boolean(printer.isDefault),
    options: printer.options || {}
  }));
});

ipcMain.handle('desktop:print-html', async (event, payload = {}) => {
  if (!payload || typeof payload.html !== 'string' || !payload.html.trim()) {
    return { ok: false, error: 'محتوى الطباعة غير صالح.' };
  }

  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (!sourceWindow) return { ok: false, error: 'نافذة البرنامج غير متاحة.' };

  const requestedDevice = typeof payload.deviceName === 'string' ? payload.deviceName.trim() : '';

  if (process.platform !== 'win32') {
    return { ok: false, error: 'مسار الطباعة الحالي مخصص لـ Windows.' };
  }

  let printWindow;

  try {
    const printers = await sourceWindow.webContents.getPrintersAsync();
    if (!Array.isArray(printers) || !printers.length) {
      return { ok: false, error: 'لم يتم العثور على أي طابعة مثبتة في Windows.' };
    }

    // Automatic mode: use the Windows default printer at print time.
    // If Windows has no default, use the first available printer.
    const printer = requestedDevice && requestedDevice !== '__AUTO__'
      ? printers.find((item) => item.name === requestedDevice)
      : (printers.find((item) => item.isDefault) || printers[0]);

    if (!printer) {
      return { ok: false, error: requestedDevice ? `الطابعة المحددة غير موجودة في Windows: ${requestedDevice}` : 'تعذر اختيار طابعة تلقائيًا.' };
    }

    printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 1100,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const html = `<!doctype html><html dir="rtl"><head><meta charset="UTF-8"><style>
      html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Tahoma,sans-serif}
      @page{margin:0}
      *{box-sizing:border-box}
    </style></head><body>${payload.html}</body></html>`;

    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      if (!printWindow.webContents.isLoading()) return resolve();
      const done = () => {
        printWindow.webContents.removeListener('did-finish-load', done);
        printWindow.webContents.removeListener('did-fail-load', failed);
        resolve();
      };
      const failed = (_event, errorCode, errorDescription) => {
        printWindow.webContents.removeListener('did-finish-load', done);
        printWindow.webContents.removeListener('did-fail-load', failed);
        reject(new Error(`فشل تحميل محتوى الطباعة: ${errorDescription || errorCode}`));
      };
      printWindow.webContents.once('did-finish-load', done);
      printWindow.webContents.once('did-fail-load', failed);
      setTimeout(() => {
        printWindow.webContents.removeListener('did-finish-load', done);
        printWindow.webContents.removeListener('did-fail-load', failed);
        resolve();
      }, 5000);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const copies = Math.max(1, Number(payload.copies) || 1);
    const paper = String(payload.paper || '58mm');
    const pageSize = paper === 'A4'
      ? { width: 210000, height: 297000 }
      : paper === '80mm'
        ? { width: 80000, height: 200000 }
        : { width: 58000, height: 200000 };
    const printOptions = {
      silent: true,
      printBackground: true,
      deviceName: printer.name,
      copies,
      margins: { marginType: 'none' },
      pageSize
    };

    const result = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('انتهت مهلة الطباعة الصامتة في Electron.'));
      }, 15000);

      printWindow.webContents.print(printOptions, (success, failureReason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolve({ success: true });
        else reject(new Error(failureReason || 'رفض Electron عملية الطباعة.'));
      });
    });

    return { ok: true, printer: printer.name, ...result };
  } catch (error) {
    return { ok: false, error: error?.message || 'تعذر تنفيذ الطباعة.' };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.close();
  }
});

ipcMain.handle('desktop:open-path', async (_event, target) => {
  if (typeof target !== 'string') return false;
  await shell.openPath(target);
  return true;
});

app.whenReady().then(async () => {
  await startApiServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { stopApiServer(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
