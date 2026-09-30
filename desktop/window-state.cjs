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
    // BrowserWindow.webContents is a native getter and throws after `closed`.
    // Keep the emitter reference while the window is alive for teardown.
    const contents = window.webContents;
    const publish = () => {
      if (!window.isDestroyed() && !contents.isDestroyed() && new URL(contents.getURL() || 'about:blank').origin === getOrigin()) contents.send('hither:window-state-changed', windowState(window, platform));
    };
    window.on('enter-full-screen', publish);
    window.on('leave-full-screen', publish);
    contents.on('did-finish-load', publish);
    window.once('closed', () => {
      window.removeListener('enter-full-screen', publish);
      window.removeListener('leave-full-screen', publish);
      contents.removeListener('did-finish-load', publish);
    });
  };
}
module.exports = { windowState, installWindowState };
