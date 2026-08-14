const { contextBridge, ipcRenderer } = require('electron');

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

contextBridge.exposeInMainWorld('desktopAPI', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
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
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target)
});
