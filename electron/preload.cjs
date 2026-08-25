const { contextBridge, ipcRenderer } = require('electron');

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

contextBridge.exposeInMainWorld('desktopAPI', {
  focusWindow: () => withTimeout(
    ipcRenderer.invoke('desktop:focus-window'),
    3000,
    'تعذر إعادة تركيز نافذة نقطة البيع.'
  ),
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  setAuthToken: (token) => ipcRenderer.invoke('desktop:set-auth-token', token),
  checkForUpdates: () => ipcRenderer.invoke('desktop:update-check'),
  listPreviousVersions: () => ipcRenderer.invoke('desktop:update-versions'),
  rollbackVersion: (version) => ipcRenderer.invoke('desktop:rollback-version', version),
  getPrinters: () => withTimeout(
    ipcRenderer.invoke('desktop:printers'),
    10000,
    'انتهت مهلة اكتشاف الطابعات.'
  ),
  printHtml: (payload) => withTimeout(
    ipcRenderer.invoke('desktop:print-html', payload),
    18000,
    'انتهت مهلة الطباعة. لم يستجب نظام الطباعة في Windows.'
  ),
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target),
  notifyCashUpdated: () => ipcRenderer.send('desktop:cash-updated'),
  notifyInventoryUpdated: () => ipcRenderer.send('desktop:inventory-updated'),
  notifyReportsUpdated: () => ipcRenderer.send('desktop:reports-updated'),
  notifyDataChanged: (domains, meta = {}) => ipcRenderer.send('desktop:data-changed', { domains, meta }),
  onInventoryUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:inventory-updated', listener);
    return () => ipcRenderer.removeListener('desktop:inventory-updated', listener);
  },
  onReportsUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:reports-updated', listener);
    return () => ipcRenderer.removeListener('desktop:reports-updated', listener);
  },
  onDataChanged: (callback) => {
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('desktop:data-changed', listener);
    return () => ipcRenderer.removeListener('desktop:data-changed', listener);
  },
  onCashUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:cash-updated', listener);
    return () => ipcRenderer.removeListener('desktop:cash-updated', listener);
  },
  onAppCloseRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:app-close-request', listener);
    return () => ipcRenderer.removeListener('desktop:app-close-request', listener);
  },
  confirmAppClose: () => ipcRenderer.send('desktop:confirm-app-close')
});
