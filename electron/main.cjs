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
  let pdfPath;

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
    await new Promise((resolve) => {
      if (!printWindow.webContents.isLoading()) return resolve();
      const done = () => { printWindow.webContents.removeListener('did-finish-load', done); resolve(); };
      printWindow.webContents.once('did-finish-load', done);
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const pdfBytes = await printWindow.webContents.printToPDF({
      printBackground: true,
      marginsType: 1,
      pageSize: { width: 210000, height: 297000 }
    });

    const tempDir = path.join(app.getPath('temp'), 'bazaar-kolchi-belma3qoul');
    fs.mkdirSync(tempDir, { recursive: true });
    pdfPath = path.join(tempDir, `print-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    const { print } = require('pdf-to-printer');
    await print(pdfPath, {
      printer: printer.name,
      copies: Math.max(1, Number(payload.copies) || 1),
      silent: true,
      printDialog: false
    });

    return { ok: true, printer: printer.name };
  } catch (error) {
    return { ok: false, error: error?.message || 'تعذر تنفيذ الطباعة.' };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.close();
    if (pdfPath) {
      try { fs.unlinkSync(pdfPath); } catch {}
    }
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
