import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { QuitBlocked } = require('../desktop/quit-coordinator.cjs');
const mainSource = readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');

// Run the actual main-process handlers against inert Electron surfaces. No app,
// backend process, updater or user-data directory is created by these tests.
async function mainFixture({ prepare = async () => {}, ready } = {}) {
  const windows = [], dialogs = [];
  let readyHandler, healthValue = ready;
  class Window extends EventEmitter {
    visible = true; destroyed = false; minimized = false; shows = 0; focuses = 0; restores = 0;
    constructor() {
      super(); windows.push(this);
      this.webContents = Object.assign(new EventEmitter(), {
        getURL: () => 'about:blank', isDestroyed: () => false,
        setWindowOpenHandler() {}, send() {},
      });
    }
    static getAllWindows() { return windows.filter(window => !window.destroyed); }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    hide() { this.visible = false; }
    show() { this.visible = true; this.shows++; }
    focus() { this.focuses++; }
    restore() { this.minimized = false; this.restores++; }
    close() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      this.emit('close', event);
      if (!event.prevented) { this.destroyed = true; this.emit('closed'); }
      return event;
    }
  }
  const app = Object.assign(new EventEmitter(), {
    quits: 0, setName() {}, setPath() {}, getPath: () => '/fixture', getVersion: () => '0.1.5',
    requestSingleInstanceLock: () => true, whenReady: () => ({ then: callback => { readyHandler = callback; } }),
    quit() { this.quits++; },
  });
  const electron = {
    app, BrowserWindow: Window, ipcMain: Object.assign(new EventEmitter(), { handle() {} }),
    dialog: { showMessageBox: async (...args) => { dialogs.push(args.at(-1)); }, showErrorBox() {} },
    shell: {}, Menu: { buildFromTemplate: value => value, setApplicationMenu() {} },
    nativeTheme: {}, screen: { getCursorScreenPoint: () => ({}), getDisplayNearestPoint: () => ({ workArea: {} }) },
  };
  const updater = { start() {}, getState: () => ({ supported: false, phase: 'idle' }) };
  const context = vm.createContext({
    __dirname: '/fixture/desktop', process: { platform: 'darwin', env: {} }, URL, AbortSignal, setTimeout, clearTimeout,
    fetch: async () => ({ json: async () => healthValue }),
    require: name => {
      if (name === 'electron') return electron;
      if (name === 'node:fs') return { mkdirSync() {}, readFileSync: () => JSON.stringify({ version: '0.1.5' }) };
      if (name === '../shared/brand.json') return { name: 'SecondU', compatibility: { userDataDirectory: 'Hither' }, desktop: { iconImage: 'app.png' } };
      if (name === './updater.cjs') return { createAppUpdater: () => updater };
      if (name === './quit-coordinator.cjs') return { QuitBlocked, createQuitCoordinator: () => ({ prepare }) };
      if (name === './startup.cjs') return { initialWindowBounds: () => ({}), readStartupAppearance: () => ({ appearance: {} }), backendIdentityMatches: (value, expected) => value?.identity === expected.identity };
      if (name === './window-state.cjs') return { installWindowState: () => () => {} };
      if (name === './screen-share.cjs') return { installScreenShare() {} };
      if (name === './directory-picker.cjs') return { installDirectoryPicker() {} };
      return require(name);
    },
  });
  vm.runInContext(`${mainSource}\n;globalThis.fixture = { requestQuit, reuseOwnedBackend, openWindow, setBackend(value) { backend = value; }, setQuitAttempt(value) { quitAttempt = value; }, getState() { return { mainWindow, backend, fatalQuitError, allowQuit }; } };`, context);
  // Register the real window and activation handlers without starting a server.
  vm.runInContext('startupAttempt = Promise.resolve()', context);
  await readyHandler();
  vm.runInContext('startupAttempt = undefined', context);
  return { app, windows, dialogs, api: context.fixture, setHealth: value => { healthValue = value; } };
}

test('closing the macOS window preserves its renderer and Dock/second-instance restores it', async () => {
  const { app, windows } = await mainFixture();
  const window = windows[0];
  assert.equal(window.close().prevented, true);
  assert.equal(window.destroyed, false); assert.equal(window.visible, false);
  app.emit('activate');
  assert.equal(windows.length, 1); assert.equal(window.visible, true); assert.equal(window.focuses, 1);
  window.close(); window.minimized = true;
  app.emit('second-instance');
  assert.equal(window.visible, true); assert.equal(window.restores, 1); assert.equal(window.focuses, 2);
});

test('normal quit needs no pending update, and only a completed safe quit releases window closure', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const { api, app, windows } = await mainFixture({ prepare: () => pending });
  const attempt = api.requestQuit();
  assert.equal(windows[0].close().prevented, true);
  assert.equal(windows[0].visible, true);
  release(); await attempt;
  assert.equal(app.quits, 1); assert.equal(api.getState().allowQuit, true);
  assert.equal(windows[0].close().prevented, false);
});

test('a recoverable refusal can retry, but a partial backend shutdown keeps the window frozen', async () => {
  let calls = 0;
  const recoverable = await mainFixture({ prepare: async () => { if (++calls === 1) throw new QuitBlocked('active_tasks'); } });
  await recoverable.api.requestQuit();
  assert.equal(recoverable.api.getState().fatalQuitError, undefined);
  await recoverable.api.requestQuit(); assert.equal(recoverable.app.quits, 1);

  let fatalCalls = 0;
  const failure = new QuitBlocked('shutdown_timeout', { recoverable: false });
  const fatal = await mainFixture({ prepare: async () => { fatalCalls++; throw failure; } });
  await fatal.api.requestQuit();
  assert.equal(fatal.api.getState().fatalQuitError, failure);
  assert.equal(fatal.windows[0].close().prevented, true); assert.equal(fatal.windows[0].visible, true);
  fatal.app.emit('activate'); fatal.api.openWindow();
  assert.equal(fatal.windows.length, 1); assert.equal(fatal.windows[0].shows, 0);
  await fatal.api.requestQuit(); assert.equal(fatalCalls, 1); assert.equal(fatal.app.quits, 0);
});

test('a startup retry retains its live owned child until matching health or confirmed exit', async () => {
  const { api, setHealth } = await mainFixture({ ready: { identity: 'unexpected' } });
  const child = { exitCode: null };
  api.setBackend(child);
  await assert.rejects(api.reuseOwnedBackend({ identity: 'expected' }), /仍在运行/);
  assert.equal(api.getState().backend, child);
  setHealth({ identity: 'expected' });
  assert.equal(await api.reuseOwnedBackend({ identity: 'expected' }), true);
  child.exitCode = 1;
  assert.equal(await api.reuseOwnedBackend({ identity: 'expected' }), false);
});
