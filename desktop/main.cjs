const { app, BrowserWindow, dialog, shell, Menu, ipcMain, desktopCapturer, systemPreferences, nativeTheme, screen } = require('electron');
const { installScreenShare } = require('./screen-share.cjs');
const { installDirectoryPicker } = require('./directory-picker.cjs');
const { installWindowState } = require('./window-state.cjs');
const { writeStartupDocument, initialWindowBounds, readStartupAppearance, backendIdentityMatches, selectBackendPort, RETRY_URL } = require('./startup.cjs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const brand = require('../shared/brand.json');

app.setName(brand.name);
const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const packaged = manifest.hitherPackaged === true;
// The visible name must not move existing tasks, browser drafts or credentials.
const userData = path.join(app.getPath('appData'), brand.compatibility.userDataDirectory);
fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
app.setPath('userData', userData);
let port = 58645;
let origin = `http://127.0.0.1:${port}`;
let backend;
let mainWindow;
let screenShare;
let backendReady = false;
let quitting = false;
let startupUrl = '';
let startupAttempt;
let nativeLanguage='zh-CN';
let observeWindowState = () => {};
const nt=(zh,en)=>nativeLanguage==='en'?en:zh;
function startupAppearance(){return readStartupAppearance(process.env.HITHER_DATA_DIR || (packaged ? path.join(userData,'data') : path.join(ROOT,'.hither')));}
function setApplicationLanguage(language){
  nativeLanguage=language==='en'?'en':'zh-CN';
  const item=(role,zh,en)=>({role,label:nt(zh,en)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:brand.name,submenu:[item('about',`关于 ${brand.name}`,`About ${brand.name}`),{type:'separator'},item('hide',`隐藏 ${brand.name}`,`Hide ${brand.name}`),item('hideOthers','隐藏其他','Hide Others'),item('unhide','全部显示','Show All'),{type:'separator'},item('quit',`退出 ${brand.name}`,`Quit ${brand.name}`)]},
    {label:nt('编辑','Edit'),submenu:[item('undo','撤销','Undo'),item('redo','重做','Redo'),{type:'separator'},item('cut','剪切','Cut'),item('copy','复制','Copy'),item('paste','粘贴','Paste'),item('selectAll','全选','Select All')]},
    {label:nt('显示','View'),submenu:[item('reload','重新载入','Reload'),item('resetZoom','实际大小','Actual Size'),item('zoomIn','放大','Zoom In'),item('zoomOut','缩小','Zoom Out'),item('togglefullscreen','切换全屏','Toggle Full Screen')]},
    {label:nt('窗口','Window'),submenu:[item('minimize','最小化','Minimize'),item('zoom','缩放','Zoom')]},
  ]));
}

async function health(candidatePort = port) {
  try {
    const response = await fetch(`http://127.0.0.1:${candidatePort}/api/health`, { signal: AbortSignal.timeout(800) });
    const value = await response.json();
    return { occupied: true, value };
  } catch (error) { return { occupied: error.cause?.code !== 'ECONNREFUSED' }; }
}

async function ensureBackend() {
  const dataDir = process.env.HITHER_DATA_DIR || (packaged ? path.join(userData, 'data') : path.join(ROOT, '.hither'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const spaceId = createHash('sha256').update(fs.realpathSync(dataDir)).digest('hex').slice(0, 24);
  const { computeRuntimeRevision } = await import(pathToFileURL(path.join(ROOT,'server/runtime-revision.mjs')).href);
  const expected = { application: brand.compatibility.applicationId, version: manifest.version, spaceId, revision: computeRuntimeRevision(ROOT) };
  const selected = await selectBackendPort([58645,58646,58647,58648,58649], health, expected);
  if (!selected) throw new Error(nt(`本机应用端口 58645–58649 已被占用，请关闭不再使用的 ${brand.name} 实例后重试。`,`Local ports 58645–58649 are in use. Close unused ${brand.name} windows and try again.`));
  port = selected.port; origin = `http://127.0.0.1:${port}`;
  if (selected.reuse) { backendReady = true; return; }
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const log = fs.openSync(path.join(dataDir, 'desktop.log'), 'a', 0o600);
  backend = spawn(process.execPath, [path.join(ROOT, 'server/index.mjs')], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', HITHER_DATA_DIR: dataDir, PORT: String(port) },
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  backend.once('exit', () => {
    backend = undefined;
    if (backendReady && !quitting) dialog.showErrorBox(nt('本机服务已停止','Local service stopped'), nt(`已经保存的资料仍在本机。请退出并重新打开 ${brand.name}。正在执行的任务会在下次启动时标记为中断。`,`Saved data remains on this computer. Quit and reopen ${brand.name}. Running tasks will be marked as interrupted.`));
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await health();
    if (backendIdentityMatches(state.value,expected)) { backendReady = true; return; }
    if (!backend || backend.exitCode !== null) throw new Error(nt(`本机服务无法启动。请检查端口 ${port} 是否被其他程序占用。`,`The local service could not start. Check whether another application is using port ${port}.`));
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(nt(`本机服务启动超时。运行日志保存在 ${brand.name} 本地资料目录。`,`The local service took too long to start. Logs are in the ${brand.name} local data directory.`));
}

function openWindow() {
  mainWindow = new BrowserWindow({
    ...initialWindowBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea),
    title: brand.name, icon: path.join(__dirname, 'assets', brand.desktop.iconImage), backgroundColor: (startupAppearance().appearance.theme==='dark'||(startupAppearance().appearance.theme!=='light'&&nativeTheme.shouldUseDarkColors))?'#212121':'#ffffff',
    // 14px native buttons centre at y=28, matching the 56px workspace toolbar.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 21 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  observeWindowState(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === RETRY_URL && mainWindow.webContents.getURL() === startupUrl) { event.preventDefault(); void startWindow(); return; }
    if (new URL(url).origin !== origin) { event.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url.startsWith(origin + '/')) void showStartup(description);
  });
  mainWindow.on('closed', () => { mainWindow = undefined; startupUrl = ''; });
}
async function showStartup(error = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const document = writeStartupDocument(ROOT,userData,{...startupAppearance(),error});
  startupUrl = document.url;
  await mainWindow.loadFile(document.file);
}
function startWindow() {
  if (startupAttempt) return startupAttempt;
  startupAttempt = (async () => {
    try {
      await showStartup();
      await ensureBackend();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      screenShare = installScreenShare(mainWindow,{origin,BrowserWindow,ipcMain,desktopCapturer,systemPreferences,getLanguage:()=>nativeLanguage});
      await mainWindow.loadURL(`${origin}/?desktop=1`);
    } catch (error) { await showStartup(error.message || String(error)); }
    finally { startupAttempt = undefined; }
  })();
  return startupAttempt;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    setApplicationLanguage(startupAppearance().appearance.language);
    ipcMain.handle('hither:set-language',(event,language)=>{
      if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw new Error('This frame cannot change the application language.');
      if(!['zh-CN','en'].includes(language))throw new Error('Unsupported application language.');
      setApplicationLanguage(language);
    });
    ipcMain.handle('hither:screen-share-status',event=>{
      if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw new Error('This frame cannot access screen-sharing status.');
      return screenShare?.getStatus()??{available:false,remoteControl:false};
    });
    observeWindowState = installWindowState({ ipcMain, getWindow: () => mainWindow, getOrigin: () => origin });
    installDirectoryPicker({ ipcMain, dialog, getWindow: () => mainWindow, getOrigin: () => origin, getLanguage: () => nativeLanguage });
    openWindow();
    void startWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { openWindow(); void startWindow(); } });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { quitting = true; if (backend) backend.kill('SIGTERM'); });
}
