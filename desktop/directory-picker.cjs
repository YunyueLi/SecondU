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
  for (const kind of ['directory', 'files']) ipcMain.handle(`hither:choose-${kind}`, async event => {
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
      const files = kind === 'files';
      const result = await dialog.showOpenDialog(window, { title: files ? (english?'Choose library files':'选择资料文件（可多选）') : (english?'Choose a folder':'选择文件夹'), buttonLabel: english?'Choose':'选择', properties: files ? ['openFile', 'multiSelections'] : ['openDirectory'] });
      // A window reload or navigation must not receive the previous page's choice.
      if (pageChanged || getWindow() !== window || !trustedPickerRequest(window, event, origin)) throw new Error('The requesting project window changed.');
      return files ? (result.canceled ? [] : result.filePaths) : (result.canceled ? null : result.filePaths[0] || null);
    } finally { window.webContents.removeListener('did-start-navigation', navigation); selecting = false; }
  });
}

module.exports = { installDirectoryPicker, trustedPickerRequest };
