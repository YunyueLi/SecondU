function trustedPickerRequest(window, event, origin) {
  try {
    return !!window && !window.isDestroyed()
      && event.sender === window.webContents
      && event.senderFrame === window.webContents.mainFrame
      && new URL(event.senderFrame.url).origin === origin
      && new URL(window.webContents.getURL()).origin === origin;
  } catch { return false; }
}

function installDirectoryPicker({ ipcMain, dialog, getWindow, getOrigin, getLanguage = () => 'zh-CN' }) {
  let selecting = false;
  ipcMain.handle('hither:choose-directory', async event => {
    const window = getWindow();
    const origin = getOrigin();
    if (!trustedPickerRequest(window, event, origin)) throw new Error('This window cannot choose a project folder.');
    if (selecting) throw new Error('A project folder picker is already open.');
    selecting = true;
    let pageChanged = false;
    const navigation = details => { if (details.isMainFrame) pageChanged = true; };
    window.webContents.on('did-start-navigation', navigation);
    try {
      const english=getLanguage()==='en';
      const result = await dialog.showOpenDialog(window, { title: english?'Choose a project folder':'选择项目文件夹', buttonLabel: english?'Choose folder':'选择文件夹', properties: ['openDirectory'] });
      // A window reload or navigation must not receive the previous page's choice.
      if (pageChanged || getWindow() !== window || !trustedPickerRequest(window, event, origin)) throw new Error('The requesting project window changed.');
      return result.canceled ? null : result.filePaths[0] || null;
    } finally { window.webContents.removeListener('did-start-navigation', navigation); selecting = false; }
  });
}

module.exports = { installDirectoryPicker, trustedPickerRequest };
