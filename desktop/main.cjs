const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

app.setName('Hither');
const ROOT = path.resolve(__dirname, '..');
const packaged = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).hitherPackaged === true;
const userData = path.join(app.getPath('appData'), 'Hither');
fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
app.setPath('userData', userData);
let port = 58645;
let origin = `http://127.0.0.1:${port}`;
let backend;
let mainWindow;
let backendReady = false;
let quitting = false;

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
  let availablePort;
  for (let candidate = 58645; candidate <= 58649; candidate++) {
    const state = await health(candidate);
    if (state.value?.application === 'hither-desktop' && state.value.version === '0.1.0' && state.value.spaceId === spaceId) { port = candidate; origin = `http://127.0.0.1:${port}`; return; }
    if (!state.occupied && availablePort === undefined) availablePort = candidate;
  }
  if (availablePort === undefined) throw new Error('本机应用端口 58645–58649 已被占用，请关闭不再使用的 Hither 实例后重试。');
  port = availablePort; origin = `http://127.0.0.1:${port}`;
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
    if (backendReady && !quitting) dialog.showErrorBox('本机服务已停止', '已经保存的资料仍在本机。请退出并重新打开 Hither。正在执行的任务会在下次启动时标记为中断。');
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await health();
    if (state.value?.spaceId === spaceId && state.value?.application === 'hither-desktop') { backendReady = true; return; }
    if (!backend || backend.exitCode !== null) throw new Error(`本机服务无法启动。请检查端口 ${port} 是否被其他程序占用。`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('本机服务启动超时。运行日志保存在 Hither 本地资料目录。');
}

function openWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 900, minHeight: 640,
    title: 'Hither', backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 },
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) { event.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  mainWindow.loadURL(`${origin}/?desktop=1`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Hither', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '显示', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
    ]));
    try { await ensureBackend(); openWindow(); } catch (error) { dialog.showErrorBox('Hither 未能启动', error.message); app.quit(); }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { quitting = true; if (backend) backend.kill('SIGTERM'); });
}
