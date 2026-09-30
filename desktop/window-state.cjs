// Read-only native chrome state. Only the trusted top-level application frame
// can request it; the renderer receives no BrowserWindow or IPC event object.
function windowState(window, platform = process.platform) {
  return { platform, fullscreen: window.isFullScreen() };
}
function installWindowState({ ipcMain, getWindow, getOrigin, platform = process.platform }) {
  ipcMain.handle('hither:window-state', event => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== getOrigin()) throw new Error('This frame cannot read native window state.');
    return windowState(window, platform);
  });
  return window => {
    const publish = () => {
      if (!window.isDestroyed() && new URL(window.webContents.getURL() || 'about:blank').origin === getOrigin()) window.webContents.send('hither:window-state-changed', windowState(window, platform));
    };
    window.on('enter-full-screen', publish);
    window.on('leave-full-screen', publish);
    window.webContents.on('did-finish-load', publish);
    window.once('closed', () => {
      window.removeListener('enter-full-screen', publish);
      window.removeListener('leave-full-screen', publish);
      window.webContents.removeListener('did-finish-load', publish);
    });
  };
}
module.exports = { windowState, installWindowState };
