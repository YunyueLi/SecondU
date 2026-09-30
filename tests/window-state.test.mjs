import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { installWindowState } = createRequire(import.meta.url)('../desktop/window-state.cjs');
function fixture() {
  const window = new EventEmitter(), contents = new EventEmitter(), sent = [];
  let full = false, destroyed = false;
  const frame = { url: 'http://127.0.0.1:58645/?desktop=1' };
  Object.assign(contents, { mainFrame: frame, getURL: () => frame.url, send: (...args) => sent.push(args) });
  Object.assign(window, { webContents: contents, isFullScreen: () => full, isDestroyed: () => destroyed });
  const handlers = new Map();
  const watch = installWindowState({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, getWindow: () => destroyed ? undefined : window, getOrigin: () => 'http://127.0.0.1:58645', platform: 'darwin' });
  watch(window);
  return { window, contents, frame, sent, read: (event = { sender: contents, senderFrame: frame }) => handlers.get('hither:window-state')(event), setFull: value => { full = value; }, destroy: () => { destroyed = true; window.emit('closed'); } };
}
test('native chrome state follows actual fullscreen and reloads without exposing window handles', () => {
  const f = fixture();
  assert.deepEqual(f.read(), { platform: 'darwin', fullscreen: false });
  f.setFull(true); f.window.emit('enter-full-screen');
  assert.deepEqual(f.sent.at(-1), ['hither:window-state-changed', { platform: 'darwin', fullscreen: true }]);
  f.contents.emit('did-finish-load'); assert.equal(f.sent.length, 2);
  f.setFull(false); f.window.emit('leave-full-screen');
  assert.deepEqual(f.sent.at(-1)[1], { platform: 'darwin', fullscreen: false });
  f.destroy(); assert.equal(f.contents.listenerCount('did-finish-load'), 0); assert.equal(f.window.listenerCount('enter-full-screen'), 0);
});
test('native state rejects foreign windows, child frames, external origins and closed windows', () => {
  const f = fixture();
  assert.throws(() => f.read({ sender: {}, senderFrame: f.frame }), /cannot read/);
  assert.throws(() => f.read({ sender: f.contents, senderFrame: { ...f.frame } }), /cannot read/);
  f.frame.url = 'https://example.com/'; assert.throws(() => f.read(), /cannot read/);
  f.window.emit('enter-full-screen'); assert.equal(f.sent.length, 0);
  f.destroy(); assert.throws(() => f.read(), /cannot read/);
});
