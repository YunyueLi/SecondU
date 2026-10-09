import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/index.mjs';
import { Store } from '../server/store.mjs';
import { localSpaceDirectory } from '../server/demo-space.mjs';
import { UpdateLifecycle, installQuitIpc } from '../server/update-lifecycle.mjs';

async function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-quit-'));
  const app = createApp({ dataDir: directory, seed: false, scheduler: false, computerInfo: { codexAvailable: false }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.updateLifecycle.dispose(); await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const api = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: response.status, value: await response.json() };
  };
  return { app, directory, api };
}
function prepare(lifecycle, id = 'fixture-quit') {
  const replies = [];
  lifecycle.prepare(id, value => replies.push(value));
  return replies;
}
async function until(predicate) {
  for (let index = 0; index < 100; index++) { if (predicate()) return; await delay(5); }
  assert.fail('Fixture condition did not become true');
}

test('admission freezes before body work, drains accepted work and permits child forwarding', async t => {
  const lifecycle = new UpdateLifecycle(); t.after(() => lifecycle.dispose());
  const request = {}, deferred = Promise.withResolvers();
  let entered = false;
  const work = lifecycle.runRequest(request, async () => {
    entered = true; await deferred.promise;
    await lifecycle.runRequest(request, () => assert.equal(lifecycle.requests.size, 1));
  });
  const replies = prepare(lifecycle);
  assert.equal(entered, false, 'admission must happen synchronously, before the handler microtask');
  assert.equal(lifecycle.accepting, false);
  assert.deepEqual(replies, []);
  await assert.rejects(lifecycle.runRequest({}, () => assert.fail('new mutation admitted')), error => error.code === 'app_quit_pending');
  deferred.resolve(); await work;
  assert.deepEqual(replies, [{ ready: true, activeCount: 0, pendingCount: 0 }]);
  assert.equal(lifecycle.phase, 'prepared');
  assert.equal(lifecycle.cancel('different-id'), false);
  assert.equal(lifecycle.cancel('fixture-quit'), true);
  assert.equal(lifecycle.accepting, true);
  await lifecycle.runRequest({}, () => {});
});

test('slow HTTP POST finishes before readiness and newly arriving mutations are rejected', async t => {
  const { app, api } = await fixture(t), body = JSON.stringify({ prompt: 'Synthetic draft', mode: 'demo' });
  const response = Promise.withResolvers();
  const request = http.request({ hostname: '127.0.0.1', port: app.server.address().port, path: '/api/tasks', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
    let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => response.resolve({ status: res.statusCode, value: JSON.parse(text) }));
  });
  request.on('error', response.reject); request.write(body.slice(0, 5));
  t.after(() => request.destroy());
  await until(() => app.updateLifecycle.requests.size === 1);
  const replies = prepare(app.updateLifecycle);
  assert.equal(app.updateLifecycle.phase, 'preparing');
  const rejected = await api('tasks', { prompt: 'Must not be saved', mode: 'demo' });
  assert.equal(rejected.status, 503); assert.equal(rejected.value.code, 'app_quit_pending');
  assert.deepEqual(replies, []);
  request.end(body.slice(5));
  assert.equal((await response.promise).status, 201);
  await until(() => replies.length > 0);
  assert.equal(replies[0].ready, true);
  assert.equal(app.store.list('tasks').length, 1);
  app.updateLifecycle.cancel('fixture-quit');
  assert.equal((await api('health')).status, 200);
});

test('local approval, delegation and remote execution all deny exit without cancelling work', async t => {
  const { app, api } = await fixture(t);
  const task = (await api('tasks', { prompt: 'Synthetic plan document', mode: 'demo' })).value;
  await api(`tasks/${task.id}/run`, {});
  await until(() => app.store.get('tasks', task.id).status === 'awaiting_approval');
  const local = prepare(app.updateLifecycle)[0];
  assert.equal(local.ready, false); assert.equal(local.activeCount, 1);
  assert.equal(local.reason, 'active_tasks'); assert.equal(app.updateLifecycle.accepting, true);
  assert.equal(app.runner.active.get(task.id).controller.signal.aborted, false);
  assert.equal(app.store.get('tasks', task.id).status, 'awaiting_approval');
  await api(`tasks/${task.id}/cancel`, {});
  await until(() => !app.runner.active.size);
  app.store.put('delegationCalls', { id: 'private-call-id', input: 'PRIVATE_INPUT', task: { status: { state: 'TASK_STATE_AUTH_REQUIRED' } } });
  app.store.put('remoteRuns', { id: 'private-remote-id', status: 'awaiting_approval', prompt: 'PRIVATE_PROMPT' });
  app.store.put('remoteRuns', { id: 'unconfirmed', status: 'interrupted', executorUnconfirmed: true });
  const reply = prepare(app.updateLifecycle)[0];
  assert.equal(reply.ready, false); assert.equal(reply.activeCount, 3);
  assert.doesNotMatch(JSON.stringify(reply), /PRIVATE|private-|unconfirmed/);
});

test('all loaded and dormant spaces are inspected without recovering dormant task state', async t => {
  const { app, api, directory } = await fixture(t);
  assert.equal((await api('spaces/personal', {})).status, 200);
  const child = [...app.updateLifecycle.spaces].find(space => space.store !== app.store);
  child.store.put('tasks', { id: 'loaded-approval', status: 'awaiting_approval' });
  const dormant = new Store(localSpaceDirectory(directory, 'demo-us-v1', { create: true }), { seed: false });
  t.after(() => dormant.close());
  dormant.put('delegationCalls', { id: 'dormant-working', task: { status: { state: 'TASK_STATE_WORKING' } } });
  const reply = prepare(app.updateLifecycle)[0];
  assert.equal(reply.ready, false); assert.equal(reply.activeCount, 2);
  assert.equal(dormant.get('delegationCalls', 'dormant-working').task.status.state, 'TASK_STATE_WORKING');
  assert.equal(app.updateLifecycle.spaces.size, 2, 'inspection must not instantiate the dormant space');
});

test('timed automation remains due while frozen and resumes after cancelled exit', async t => {
  const { app, api } = await fixture(t);
  const automation = (await api('automations', { title: 'Synthetic timer', prompt: 'Synthetic draft', trigger: 'interval', intervalMinutes: 5, enabled: true, mode: 'demo' })).value;
  app.store.put('automations', { ...automation, nextRunAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(prepare(app.updateLifecycle)[0].ready, true);
  app.runner.tick();
  assert.equal(app.store.list('tasks').length, 0);
  assert.equal(app.store.get('automations', automation.id).nextRunAt, '2020-01-01T00:00:00.000Z');
  app.updateLifecycle.cancel('fixture-quit'); app.runner.tick();
  assert.equal(app.store.list('tasks').length, 1);
});

test('public delegation listener shares the same admission gate', async t => {
  const { app } = await fixture(t);
  await app.delegations.start();
  const url = `${app.delegations.origin()}/not-an-api`;
  assert.equal((await fetch(url)).status, 404);
  assert.equal(prepare(app.updateLifecycle)[0].ready, true);
  const response = await fetch(url);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'app_quit_pending');
  app.updateLifecycle.cancel('fixture-quit');
  assert.equal((await fetch(url)).status, 404);
});

test('prepare timeouts, abandoned leases and disconnects release the freeze without closing', async t => {
  const lifecycle = new UpdateLifecycle({ prepareTimeoutMs: 15, leaseMs: 15 }); t.after(() => lifecycle.dispose());
  const deferred = Promise.withResolvers(), work = lifecycle.runRequest({}, () => deferred.promise);
  const pending = prepare(lifecycle); await delay(25);
  assert.equal(pending[0].reason, 'prepare_timeout'); assert.equal(lifecycle.accepting, true);
  deferred.resolve(); await work;
  const expired = prepare(lifecycle); assert.equal(expired[0].ready, true); await delay(25);
  assert.equal(expired[1].reason, 'prepare_expired'); assert.equal(lifecycle.accepting, true);
  const channel = Object.assign(new EventEmitter(), { connected: true, send: () => {}, exit: () => assert.fail('must not exit') });
  t.after(installQuitIpc({ updateLifecycle: lifecycle, close: () => assert.fail('must not close') }, channel));
  channel.emit('message', { type: 'second-u:prepare-quit', requestId: 'ipc-prepare' });
  assert.equal(lifecycle.accepting, false);
  channel.connected = false; channel.emit('disconnect');
  assert.equal(lifecycle.accepting, true);
});

test('commit rechecks activity, awaits closure, consumes its ID once and fails closed', async t => {
  const lifecycle = new UpdateLifecycle(); t.after(() => lifecycle.dispose());
  let activeCount = 0; lifecycle.activity = () => ({ activeCount, pendingCount: 0 });
  const changed = prepare(lifecycle); activeCount = 1;
  assert.equal(await lifecycle.commit('fixture-quit', { close: () => assert.fail('active work must not close') }), false);
  assert.equal(changed[1].reason, 'activity_changed'); assert.equal(lifecycle.accepting, true);
  activeCount = 0; prepare(lifecycle);
  const deferred = Promise.withResolvers(), phases = []; let exited = false, closed = 0;
  const options = { close: () => { closed++; return deferred.promise; }, status: value => phases.push(value.phase), exit: code => { assert.equal(code, 0); exited = true; } };
  const commit = lifecycle.commit('fixture-quit', options);
  assert.deepEqual(phases, ['closing']); assert.equal(exited, false);
  assert.equal(lifecycle.cancel('fixture-quit'), false);
  assert.equal(await lifecycle.commit('fixture-quit', options), false); assert.equal(closed, 1);
  deferred.resolve(); assert.equal(await commit, true); assert.equal(exited, true);
  const failed = new UpdateLifecycle(); t.after(() => failed.dispose()); const replies = prepare(failed);
  await failed.commit('fixture-quit', { close: async () => { throw new Error('Synthetic close failure'); }, status: () => {}, exit: () => assert.fail('failed close must not exit') });
  assert.equal(failed.phase, 'failed'); assert.equal(failed.accepting, false);
  assert.equal(replies.at(-1).reason, 'shutdown_failed'); assert.equal(replies.at(-1).recoverable, false);
});

test('pending authorization and setup work block exit even without a running task', t => {
  const lifecycle = new UpdateLifecycle(); t.after(() => lifecycle.dispose());
  lifecycle.register({ store: { list: () => [] }, connectors: { oauth: { attempts: new Map([['auth', { status: 'pending' }]]), starting: new Set(), refreshing: new Map() } }, imSetup: { operations: new Map([['setup', { status: 'running' }]]) } });
  const reply = prepare(lifecycle)[0];
  assert.equal(reply.ready, false); assert.equal(reply.activeCount, 0); assert.equal(reply.pendingCount, 2);
  assert.equal(reply.reason, 'pending_operations'); assert.equal(lifecycle.accepting, true);
});

test('IPC validates messages and has no effect without a parent channel', async t => {
  const lifecycle = new UpdateLifecycle(); t.after(() => lifecycle.dispose());
  const channel = Object.assign(new EventEmitter(), { connected: true, sent: [], send(value) { this.sent.push(value); }, exit: () => {} });
  let closes = 0; const app = { updateLifecycle: lifecycle, close: async () => { closes++; } };
  assert.doesNotThrow(() => installQuitIpc(app, {})());
  t.after(installQuitIpc(app, channel));
  for (const message of [null, {}, { type: 'second-u:prepare-quit', requestId: 'bad id' }, { type: 'second-u:commit-quit', requestId: 'unsolicited' }]) channel.emit('message', message);
  assert.equal(lifecycle.accepting, true); assert.equal(channel.sent.length, 0); assert.equal(closes, 0);
  channel.emit('message', { type: 'second-u:prepare-quit', requestId: 'valid' });
  assert.deepEqual(channel.sent[0], { type: 'second-u:quit-readiness', requestId: 'valid', ready: true, activeCount: 0, pendingCount: 0 });
  assert.equal(closes, 0, 'prepare alone must keep databases and listeners open');
  channel.emit('message', { type: 'second-u:cancel-quit', requestId: 'valid' });
  assert.equal(lifecycle.accepting, true); assert.equal(closes, 0);
});

test('a real forked backend stays alive after prepare and exits only after commit', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-quit-process-'));
  const child = fork(new URL('./fixtures/quit-ipc-child.mjs', import.meta.url), [], { env: { ...process.env, QUIT_FIXTURE_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill(); rmSync(directory, { recursive: true, force: true }); });
  const messages = []; child.on('message', value => messages.push(value));
  const exited = once(child, 'exit');
  await until(() => messages.some(value => value.type === 'fixture-ready'));
  child.send({ type: 'second-u:prepare-quit', requestId: 'real-process' });
  await until(() => messages.some(value => value.ready === true));
  assert.equal(child.exitCode, null);
  child.send({ type: 'second-u:commit-quit', requestId: 'real-process' });
  const [code, signal] = await exited;
  assert.equal(code, 0); assert.equal(signal, null);
  assert.ok(messages.some(value => value.type === 'second-u:quit-status' && value.phase === 'closing'));
  const store = new Store(directory, { seed: false }); store.close();
});
