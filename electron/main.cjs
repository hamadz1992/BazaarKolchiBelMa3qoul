const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

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
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isPosWindow = isDev
      ? (() => {
          try {
            const parsed = new URL(url);
            return parsed.origin === 'http://127.0.0.1:5173' && parsed.searchParams.get('pos') === '1';
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
        childWindow.once('ready-to-show', () => {
          childWindow.maximize();
          childWindow.show();
          childWindow.focus();
        });
      }
    } catch {}
  });

  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

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
  if (!requestedDevice) return { ok: false, error: 'لم يتم اختيار طابعة.' };

  if (process.platform !== 'win32') {
    return { ok: false, error: 'مسار الطباعة الحالي مخصص لـ Windows.' };
  }

  let printWindow;

  try {
    const printers = await sourceWindow.webContents.getPrintersAsync();
    const printer = printers.find((item) => item.name === requestedDevice);
    if (!printer) {
      return { ok: false, error: `الطابعة المحددة غير موجودة في Windows: ${requestedDevice}` };
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
    const printOptions = {
      silent: true,
      printBackground: true,
      deviceName: printer.name,
      copies,
      margins: { marginType: 'none' },
      usePrinterDefaultPageSize: true
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
