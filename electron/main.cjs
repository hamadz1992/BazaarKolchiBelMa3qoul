const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

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
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
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

  const printWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 1000,
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

  try {
    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);

    await new Promise((resolve) => {
      if (printWindow.webContents.isLoading()) {
        printWindow.webContents.once('did-finish-load', resolve);
      } else {
        resolve();
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    const options = {
      silent: payload.silent !== false,
      printBackground: true,
      color: false,
      copies: Math.max(1, Number(payload.copies) || 1)
    };

    if (typeof payload.deviceName === 'string' && payload.deviceName.trim()) {
      options.deviceName = payload.deviceName.trim();
    }

    const result = await new Promise((resolve) => {
      printWindow.webContents.print(options, (success, failureReason) => {
        resolve({ success, failureReason: failureReason || '' });
      });
    });

    return result.success
      ? { ok: true }
      : { ok: false, error: result.failureReason || 'فشلت عملية الطباعة.' };
  } catch (error) {
    return { ok: false, error: error?.message || 'تعذر تنفيذ الطباعة.' };
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
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
