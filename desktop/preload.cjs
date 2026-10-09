const { contextBridge, ipcRenderer } = require('electron');
const quitReaders = new Set();
ipcRenderer.on('hither:prepare-to-quit', (_event, value) => {
  if (typeof value?.requestId !== 'string') return;
  let unsaved = false, busy = quitReaders.size === 0;
  for (const read of quitReaders) {
    try {
      const state = read();
      unsaved ||= state?.unsaved !== false; busy ||= state?.busy !== false;
    } catch { unsaved = true; busy = true; }
  }
  ipcRenderer.send('hither:quit-readiness', { requestId: value.requestId, unsaved, busy });
});
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('A callback is required.');
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
// The renderer receives only the folder the user explicitly chooses.
contextBridge.exposeInMainWorld('hitherDesktop', Object.freeze({
  platform: process.platform,
  updates: Object.freeze({
    get: () => ipcRenderer.invoke('hither:updates-get'),
    check: () => ipcRenderer.invoke('hither:updates-check'),
    show: () => ipcRenderer.invoke('hither:updates-show'),
    onChange: callback => subscribe('hither:updates-changed', callback),
    onPrepareToQuit: callback => { if (typeof callback !== 'function') throw new TypeError('A quit callback is required.'); quitReaders.add(callback); return () => quitReaders.delete(callback); },
    onQuitCancelled: callback => subscribe('hither:quit-cancelled', callback),
  }),
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
