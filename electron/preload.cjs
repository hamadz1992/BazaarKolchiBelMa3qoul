const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  getPrinters: () => ipcRenderer.invoke('desktop:printers'),
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target)
});
