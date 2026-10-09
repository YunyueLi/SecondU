import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { stopOwnedBackend, createQuitCoordinator } = require('../desktop/quit-coordinator.cjs');
class Child extends EventEmitter {
  connected = true;
  exitCode = null;
  sent = [];
  send(value, callback) { this.sent.push(value); callback?.(); }
  reply(value) { this.emit('message', { requestId: this.sent[0].requestId, type: 'second-u:quit-readiness', ...value }); }
}
test('safe readiness never substitutes for the owned backend exiting', async () => {
  const child = new Child(); let completed = false;
  const promise = stopOwnedBackend(child).then(() => { completed = true; });
  child.emit('message', { requestId: 'wrong', type: 'second-u:quit-readiness', ready: true });
  assert.equal(child.sent.length, 1);
  child.reply({ ready: true });
  assert.equal(child.sent[1].type, 'second-u:commit-quit');
  await Promise.resolve(); assert.equal(completed, false);
  child.emit('exit', 0, null); await promise;
  assert.equal(completed, true); assert.equal(child.listenerCount('message'), 0);
});
test('active tasks and prepare timeouts cancel without stopping the child', async () => {
  const child = new Child();
  const promise = stopOwnedBackend(child);
  child.reply({ ready: false, reason: 'active_tasks', activeCount: 2 });
  await assert.rejects(promise, error => error.reason === 'active_tasks' && error.activeCount === 2 && error.recoverable);
  assert.equal(child.sent.at(-1).type, 'second-u:cancel-quit');
  const slow = new Child();
  await assert.rejects(stopOwnedBackend(slow, { timeoutMs: 10 }), error => error.reason === 'prepare_timeout' && error.recoverable);
  assert.equal(slow.sent.at(-1).type, 'second-u:cancel-quit');
});
test('canceling the native update while preparing never commits a backend shutdown', async () => {
  const child = new Child(); let valid = true;
  const promise = stopOwnedBackend(child, { mayCommit: () => valid });
  valid = false; child.reply({ ready: true });
  await assert.rejects(promise, /update_cancelled/);
  assert.deepEqual(child.sent.map(value => value.type), ['second-u:prepare-quit', 'second-u:cancel-quit']);
});
test('a failed or stalled committed shutdown cannot resume normal editing or install', async () => {
  for (const fail of ['error', 'exit', 'timeout']) {
    const child = new Child(); const promise = stopOwnedBackend(child, { timeoutMs: 10 });
    child.reply({ ready: true });
    if (fail === 'error') child.reply({ ready: false, reason: 'shutdown_failed', recoverable: false });
    if (fail === 'exit') child.emit('exit', 1, null);
    await assert.rejects(promise, error => !error.recoverable);
    assert.equal(child.sent.filter(value => value.type === 'second-u:cancel-quit').length, 0);
  }
});
test('renderer drafts block even before backend admission, and updates never stop a reused backend', async () => {
  let called = 0, released = 0;
  const options = { checkRenderer: async () => ({ unsaved: true, busy: false }), getBackend: () => { called++; return undefined; }, isBackendReused: () => true, cancelRenderer: () => { released++; } };
  await assert.rejects(createQuitCoordinator(options).prepare({ updating: true }), /unsaved_changes/);
  assert.equal(called, 0); assert.equal(released, 1);
  options.checkRenderer = async () => ({ unsaved: false, busy: false });
  await assert.rejects(createQuitCoordinator(options).prepare({ updating: true }), /backend_reused/);
  assert.equal(called, 0);
});
test('unconfirmed backend failure remains a stop even if the child later disappears', async () => {
  let child = new Child(); let releases = 0;
  const coordinator = createQuitCoordinator({ checkRenderer: async () => ({ unsaved: false, busy: false }), getBackend: () => child, isBackendReused: () => false, cancelRenderer: () => { releases++; }, timeoutMs: 10 });
  const attempt = coordinator.prepare();
  await Promise.resolve();
  child.reply({ ready: true });
  await assert.rejects(attempt, /shutdown_timeout/);
  child = undefined;
  await assert.rejects(coordinator.prepare(), /shutdown_timeout/);
  assert.equal(releases, 0);
});
test('preload exports only update actions and booleans, never native events or relaunch tokens', () => {
  const ipcRenderer = new EventEmitter(); const sent = []; let exposed;
  ipcRenderer.send = (name, value) => sent.push({ name, value });
  ipcRenderer.invoke = async name => ({ name });
  vm.runInNewContext(readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8'), { require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } }, ipcRenderer }), process: { platform: 'darwin' } });
  assert.equal(exposed.updates.resumeRelaunch, undefined);
  ipcRenderer.emit('hither:prepare-to-quit', { sender: 'native' }, { requestId: 'first' });
  assert.equal(sent[0].value.busy, true);
  const stop = exposed.updates.onPrepareToQuit(() => ({ unsaved: false, busy: false, privateDraft: 'not shared' }));
  ipcRenderer.emit('hither:prepare-to-quit', {}, { requestId: 'second' });
  assert.deepEqual(JSON.parse(JSON.stringify(sent[1].value)), { requestId: 'second', unsaved: false, busy: false });
  stop();
});
