const { app, BrowserWindow, dialog, shell, Menu, ipcMain, desktopCapturer, systemPreferences, nativeTheme, screen } = require('electron');
const { installScreenShare } = require('./screen-share.cjs');
const { installDirectoryPicker } = require('./directory-picker.cjs');
const { installWindowState } = require('./window-state.cjs');
const { createAppUpdater } = require('./updater.cjs');
const { createQuitCoordinator, QuitBlocked } = require('./quit-coordinator.cjs');
const { writeStartupDocument, initialWindowBounds, readStartupAppearance, backendIdentityMatches, selectBackendPort, RETRY_URL } = require('./startup.cjs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
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
let updater;
let allowQuit = false;
let expectedBackendExit = false;
let quitAttempt;
let pendingRelaunchToken;
let fatalQuitError;
let updateChecksScheduled = false;
const nt=(zh,en)=>nativeLanguage==='en'?en:zh;
function isTrustedFrame(event) {
  try { return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && new URL(event.senderFrame.url).origin === origin; }
  catch { return false; }
}
function sendToRenderer(channel, value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const contents = mainWindow.webContents;
  if (!contents.isDestroyed() && new URL(contents.getURL() || 'about:blank').origin === origin) contents.send(channel, value);
}
function checkRendererForQuit() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve({ unsaved: false, busy: false });
  const contents = mainWindow.webContents;
  // Startup/error documents have no editor. A loaded app must answer itself.
  if (new URL(contents.getURL() || 'about:blank').origin !== origin) return Promise.resolve({ unsaved: false, busy: false });
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (error, state) => { clearTimeout(timer); ipcMain.off('hither:quit-readiness', reply); error ? reject(error) : resolve(state); };
    const reply = (event, value) => {
      if (!isTrustedFrame(event) || value?.requestId !== requestId) return;
      if (typeof value.unsaved !== 'boolean' || typeof value.busy !== 'boolean') return;
      finish(null, { unsaved: value.unsaved, busy: value.busy });
    };
    const timer = setTimeout(() => finish(new QuitBlocked('renderer_unavailable')), 5000);
    ipcMain.on('hither:quit-readiness', reply);
    contents.send('hither:prepare-to-quit', { requestId });
  });
}
const quitCoordinator = createQuitCoordinator({
  checkRenderer: checkRendererForQuit,
  getBackend: () => backend,
  isBackendReused: () => backendReady && !backend && !expectedBackendExit,
  cancelRenderer: () => sendToRenderer('hither:quit-cancelled'),
  onCommitting: () => { expectedBackendExit = true; },
});
function quitProblem(error) {
  if (error.reason === 'unsaved_changes') return nt('还有未保存的修改或未发送的草稿。请先保存或处理后再退出。', 'There are unsaved changes or unsent drafts. Save or resolve them before quitting.');
  if (['active_tasks', 'activity_changed'].includes(error.reason)) return nt(`还有 ${error.activeCount || ''} 项任务正在执行或等待授权。请完成或停止任务后再退出。`, 'Tasks are running or waiting for approval. Finish or stop them before quitting.');
  if (error.reason === 'pending_operations') return nt('还有保存、上传或连接操作未完成。请等待它们结束后重试。', 'A save, upload or connection operation is still in progress. Wait for it to finish and try again.');
  if (error.reason === 'backend_reused') return nt('当前窗口连接了另一个 SecondU 实例的服务。请关闭其他实例后重新打开，再安装更新。', 'This window is connected to another SecondU instance. Close the other instance and reopen this app before updating.');
  if (error.recoverable === false) return nt('本机服务尚未确认安全退出，已暂停更新。请保留当前窗口；已经保存的资料仍在本机。', 'The local service has not confirmed a safe shutdown. The update is paused. Keep this window open; saved data remains on this computer.');
  return nt('暂时无法确认退出是否安全，已保留当前工作。请稍后重试。', 'It is not yet possible to confirm a safe shutdown. Your work has been kept open. Try again shortly.');
}
function requestQuit({ token } = {}) {
  if (token) {
    if (!updater.isRelaunchPending(token)) return Promise.resolve();
    pendingRelaunchToken = token;
  }
  if (quitAttempt) return quitAttempt;
  quitAttempt = (async () => {
    try {
      if (fatalQuitError) throw fatalQuitError;
      if (startupAttempt) await startupAttempt;
      const expectedToken = pendingRelaunchToken;
      await quitCoordinator.prepare({ updating: !!expectedToken || ['ready', 'awaiting-relaunch', 'installing'].includes(updater?.getState().phase), mayCommit: () => !expectedToken || updater.isRelaunchPending(expectedToken) });
      if (expectedToken && !updater.isRelaunchPending(expectedToken)) { fatalQuitError = new QuitBlocked('relaunch_failed', { recoverable: false }); throw fatalQuitError; }
      allowQuit = true; quitting = true;
      if (expectedToken) {
        pendingRelaunchToken = undefined;
        try { updater.resumeRelaunch(expectedToken); }
        catch { fatalQuitError = new QuitBlocked('relaunch_failed', { recoverable: false }); throw fatalQuitError; }
      } else app.quit();
    } catch (error) {
      allowQuit = false; quitting = false;
      if (error.recoverable === false) fatalQuitError = error;
      else expectedBackendExit = false;
      const options = { type: 'info', message: nt('暂未退出 SecondU', 'SecondU is still open'), detail: quitProblem(error), buttons: [nt('返回', 'Return')], noLink: true };
      if (mainWindow && !mainWindow.isDestroyed()) await dialog.showMessageBox(mainWindow, options);
      else await dialog.showMessageBox(options);
    } finally { quitAttempt = undefined; }
  })();
  return quitAttempt;
}
function updateMenuItem() {
  const state = updater?.getState();
  const waiting = ['ready', 'awaiting-relaunch'].includes(state?.phase);
  return { label: waiting ? nt('重启并更新…', 'Restart and Update…') : state?.phase === 'downloading' ? nt('正在下载更新…', 'Downloading Update…') : state?.phase === 'checking' ? nt('正在检查更新…', 'Checking for Updates…') : nt('检查更新…', 'Check for Updates…'),
    enabled: !!state?.supported && (state.canShow || state.canCheckForUpdates),
    click: () => { if (state.canShow && state.phase !== 'idle' && state.phase !== 'up-to-date') updater.show(); else updater.check(); },
  };
}
function scheduleUpdateChecks() {
  if (updateChecksScheduled || !updater?.getState().supported) return;
  updateChecksScheduled = true;
  const check = () => {
    if (quitAttempt || quitting || fatalQuitError) return;
    const state = updater.getState();
    // Discovery never presents a modal, downloads a package or interrupts
    // work. Preserve a known update until the user opens its native window.
    if (!state.sessionInProgress && ['idle', 'up-to-date', 'error', 'no-update'].includes(state.phase)) updater.checkInBackground();
  };
  setTimeout(check, 10000).unref();
  setInterval(check, 6 * 60 * 60 * 1000).unref();
}
function startupAppearance(){return readStartupAppearance(process.env.HITHER_DATA_DIR || (packaged ? path.join(userData,'data') : path.join(ROOT,'.hither')));}
function setApplicationLanguage(language){
  nativeLanguage=language==='en'?'en':'zh-CN';
  const item=(role,zh,en)=>({role,label:nt(zh,en)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:brand.name,submenu:[item('about',`关于 ${brand.name}`,`About ${brand.name}`),updateMenuItem(),{type:'separator'},item('hide',`隐藏 ${brand.name}`,`Hide ${brand.name}`),item('hideOthers','隐藏其他','Hide Others'),item('unhide','全部显示','Show All'),{type:'separator'},item('quit',`退出 ${brand.name}`,`Quit ${brand.name}`)]},
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

async function reuseOwnedBackend(expected) {
  const owned = backend;
  if (!owned || owned.exitCode !== null) return false;
  const state = await health();
  if (backend !== owned || owned.exitCode !== null) return false;
  if (backendIdentityMatches(state.value, expected)) { backendReady = true; return true; }
  throw new Error(nt('本机服务进程仍在运行，但尚未返回匹配的就绪状态。为保留现有任务，未启动另一个服务；请稍后重试或安全退出应用。', 'The owned local service is still running but has not reported a matching ready state. To preserve existing tasks, another service was not started. Retry later or safely quit the app.'));
}

async function ensureBackend() {
  const dataDir = process.env.HITHER_DATA_DIR || (packaged ? path.join(userData, 'data') : path.join(ROOT, '.hither'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const spaceId = createHash('sha256').update(fs.realpathSync(dataDir)).digest('hex').slice(0, 24);
  const { computeRuntimeRevision } = await import(pathToFileURL(path.join(ROOT,'server/runtime-revision.mjs')).href);
  const expected = { application: brand.compatibility.applicationId, version: manifest.version, spaceId, revision: computeRuntimeRevision(ROOT) };
  if (await reuseOwnedBackend(expected)) return;
  const selected = await selectBackendPort([58645,58646,58647,58648,58649], health, expected);
  if (!selected) throw new Error(nt(`本机应用端口 58645–58649 已被占用，请关闭不再使用的 ${brand.name} 实例后重试。`,`Local ports 58645–58649 are in use. Close unused ${brand.name} windows and try again.`));
  port = selected.port; origin = `http://127.0.0.1:${port}`;
  if (selected.reuse) { backendReady = true; return; }
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const log = fs.openSync(path.join(dataDir, 'desktop.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(ROOT, 'server/index.mjs')], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', HITHER_DATA_DIR: dataDir, PORT: String(port) },
    stdio: ['ignore', log, log, 'ipc'],
  });
  backend = child;
  fs.closeSync(log);
  child.once('exit', () => {
    if (backend !== child) return;
    backend = undefined;
    if (backendReady && !quitting && !expectedBackendExit) dialog.showErrorBox(nt('本机服务已停止','Local service stopped'), nt(`已经保存的资料仍在本机。请退出并重新打开 ${brand.name}。正在执行的任务会在下次启动时标记为中断。`,`Saved data remains on this computer. Quit and reopen ${brand.name}. Running tasks will be marked as interrupted.`));
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
  if (quitAttempt || quitting || fatalQuitError) return;
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
  mainWindow.on('close', event => {
    if (allowQuit) return;
    if (quitAttempt || fatalQuitError) { event.preventDefault(); return; }
    if (process.platform === 'darwin') { event.preventDefault(); mainWindow.hide(); }
  });
}
function restoreMainWindow() {
  if (quitAttempt || quitting || fatalQuitError || !mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
  return true;
}
async function showStartup(error = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const document = writeStartupDocument(ROOT,userData,{...startupAppearance(),error});
  startupUrl = document.url;
  await mainWindow.loadFile(document.file);
}
function startWindow() {
  if (startupAttempt) return startupAttempt;
  if (quitAttempt || quitting || fatalQuitError) return Promise.resolve();
  startupAttempt = (async () => {
    try {
      await showStartup();
      await ensureBackend();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      screenShare = installScreenShare(mainWindow,{origin,BrowserWindow,ipcMain,desktopCapturer,systemPreferences,getLanguage:()=>nativeLanguage});
      await mainWindow.loadURL(`${origin}/?desktop=1`);
      scheduleUpdateChecks();
    } catch (error) { await showStartup(error.message || String(error)); }
    finally { startupAttempt = undefined; }
  })();
  return startupAttempt;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', restoreMainWindow);
  app.whenReady().then(async () => {
    updater = createAppUpdater({ packaged, platform: process.platform, version: app.getVersion(),
      onChange: state => { if (state.phase !== 'awaiting-relaunch') pendingRelaunchToken = undefined; sendToRenderer('hither:updates-changed', state); setApplicationLanguage(nativeLanguage); },
      onPrepareRelaunch: token => requestQuit({ token }),
    });
    updater.start();
    setApplicationLanguage(startupAppearance().appearance.language);
    for (const [channel, method] of [['hither:updates-get', 'getState'], ['hither:updates-check', 'check'], ['hither:updates-show', 'show']]) {
      ipcMain.handle(channel, event => { if (!isTrustedFrame(event)) throw new Error('This frame cannot access application updates.'); return updater[method](); });
    }
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
    app.on('activate', () => { if (!quitAttempt && !quitting && !fatalQuitError && !restoreMainWindow() && BrowserWindow.getAllWindows().length === 0) { openWindow(); void startWindow(); } });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (allowQuit) { quitting = true; return; }
    event.preventDefault();
    void requestQuit();
  });
}
