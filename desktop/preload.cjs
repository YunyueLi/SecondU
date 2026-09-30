const { contextBridge, ipcRenderer } = require('electron');
// The renderer receives only the folder the user explicitly chooses.
contextBridge.exposeInMainWorld('hitherDesktop', Object.freeze({
  platform: process.platform,
  windowState: Object.freeze({
    get: () => ipcRenderer.invoke('hither:window-state'),
    onChange: callback => {
      if (typeof callback !== 'function') throw new TypeError('A window-state callback is required.');
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('hither:window-state-changed', listener);
      return () => ipcRenderer.removeListener('hither:window-state-changed', listener);
    },
  }),
  chooseDirectory: () => ipcRenderer.invoke('hither:choose-directory'),
  setLanguage: language => ipcRenderer.invoke('hither:set-language', language),
  screenShare: Object.freeze({status:()=>ipcRenderer.invoke('hither:screen-share-status')}),
}));
