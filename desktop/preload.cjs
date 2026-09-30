const { contextBridge, ipcRenderer } = require('electron');
// The renderer receives only the folder the user explicitly chooses.
contextBridge.exposeInMainWorld('hitherDesktop', Object.freeze({
  chooseDirectory: () => ipcRenderer.invoke('hither:choose-directory'),
  setLanguage: language => ipcRenderer.invoke('hither:set-language', language),
  screenShare: Object.freeze({status:()=>ipcRenderer.invoke('hither:screen-share-status')}),
}));
