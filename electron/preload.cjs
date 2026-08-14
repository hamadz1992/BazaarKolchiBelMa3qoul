const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  getPrinters: () => ipcRenderer.invoke('desktop:printers'),
  printHtml: (payload) => ipcRenderer.invoke('desktop:print-html', payload),
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target)
});
