import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './http-error.mjs';
import { ENGINEER_SPACE, LEGACY_ENGINEER_SPACE, PERSONAL_SPACE, US_SPACE, localSpaceDirectory } from './demo-space.mjs';
import { terminal as remoteTerminal } from './remote/common.mjs';

const activeLocal = new Set(['running', 'awaiting_approval']);
const activeDelegation = new Set(['TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING', 'TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_INPUT_REQUIRED']);
const validRequestId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function storedActivity(store, runtime = {}) {
  const local = new Set(store.list('tasks').filter(task => !task.remoteExecution && activeLocal.has(task.status)).map(task => task.id));
  for (const id of runtime.runner?.active.keys() ?? []) local.add(id);
  const delegated = new Set(store.list('delegationCalls').filter(call => activeDelegation.has(call.task?.status?.state)).map(call => call.id));
  for (const id of runtime.delegations?.active.keys() ?? []) delegated.add(id);
  const remote = new Set(store.list('remoteRuns').filter(run => !remoteTerminal(run.status) || run.executorUnconfirmed).map(run => run.id));
  for (const id of runtime.remoteComputers?.pending.keys() ?? []) remote.add(id);
  const pending = [...(runtime.imSetup?.operations.values() ?? [])].filter(op => op.status === 'running').length
    + [...(runtime.connectors?.oauth?.attempts.values() ?? [])].filter(attempt => attempt.status === 'pending').length
    + (runtime.connectors?.oauth?.starting.size ?? 0) + (runtime.connectors?.oauth?.refreshing.size ?? 0)
    + (runtime.remoteComputers?.observing.size ?? 0);
  return { activeCount: local.size + delegated.size + remote.size, pendingCount: pending };
}

/** Shared by every loaded space and its separate delegation listener. Admission
 * is recorded before reading a request body, so a slow POST cannot cross a quit
 * readiness check unnoticed. Read requests also drain before databases close. */
export class UpdateLifecycle {
  constructor({ prepareTimeoutMs = 10000, leaseMs = 10000 } = {}) {
    this.prepareTimeoutMs = prepareTimeoutMs;
    this.leaseMs = leaseMs;
    this.phase = 'running';
    this.spaces = new Set();
    this.requests = new Set();
    this.admitted = new WeakSet();
    this.idleWaiters = new Set();
  }
  get accepting() { return this.phase === 'running'; }
  register(space) { this.spaces.add(space); }
  runRequest(request, work) {
    // A root request forwarded to a child space already owns admission.
    if (this.admitted.has(request)) return Promise.resolve().then(work);
    if (!this.accepting) return Promise.reject(new HttpError(503, '应用正在准备退出，请稍后重试。', 'app_quit_pending'));
    this.admitted.add(request);
    this.requests.add(request);
    return Promise.resolve().then(work).finally(() => {
      this.requests.delete(request);
      this.admitted.delete(request);
      if (!this.requests.size) for (const notify of this.idleWaiters) notify();
    });
  }
  activity() {
    let activeCount = 0, pendingCount = this.requests.size;
    const directories = new Set();
    for (const space of this.spaces) {
      directories.add(space.store.directory);
      const count = storedActivity(space.store, space);
      activeCount += count.activeCount; pendingCount += count.pendingCount;
    }
    // Do not instantiate a dormant space: constructors recover old tasks and
    // start listeners. Inspect its saved state through a read-only connection.
    const root = this.spaces.values().next().value?.store.directory;
    if (root) for (const id of [PERSONAL_SPACE, ENGINEER_SPACE, US_SPACE, LEGACY_ENGINEER_SPACE]) {
      const directory = localSpaceDirectory(root, id);
      if (!directory || directories.has(directory)) continue;
      const file = path.join(directory, 'hither.sqlite');
      if (!existsSync(file)) continue;
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        const count = storedActivity({ list: collection => db.prepare('SELECT data FROM entities WHERE collection=?').all(collection).map(row => JSON.parse(row.data)) });
        activeCount += count.activeCount; pendingCount += count.pendingCount;
      } finally { db.close(); }
    }
    return { activeCount, pendingCount };
  }
  release(reason) {
    const attempt = this.attempt;
    if (!attempt || !['preparing', 'prepared'].includes(this.phase)) return false;
    clearTimeout(attempt.timer);
    this.phase = 'running'; this.attempt = undefined;
    this.idleWaiters.delete(attempt.inspect);
    attempt.reply({ ready: false, activeCount: 0, pendingCount: this.requests.size, reason });
    return true;
  }
  prepare(requestId, reply) {
    if (!validRequestId(requestId)) return;
    if (this.attempt?.requestId === requestId) {
      if (this.phase === 'prepared') reply({ ready: true, activeCount: 0, pendingCount: 0 });
      return;
    }
    if (!this.accepting) { reply({ ready: false, activeCount: 0, pendingCount: this.requests.size, reason: 'quit_busy' }); return; }
    this.phase = 'preparing';
    const attempt = { requestId, reply };
    this.attempt = attempt;
    attempt.inspect = () => {
      if (this.attempt !== attempt || this.phase !== 'preparing' || this.requests.size) return;
      let count;
      try { count = this.activity(); }
      catch { this.release('inspection_failed'); return; }
      clearTimeout(attempt.timer);
      this.idleWaiters.delete(attempt.inspect);
      if (count.activeCount || count.pendingCount) {
        this.phase = 'running'; this.attempt = undefined;
        reply({ ready: false, ...count, reason: count.activeCount ? 'active_tasks' : 'pending_operations' });
        return;
      }
      this.phase = 'prepared';
      attempt.timer = setTimeout(() => this.release('prepare_expired'), this.leaseMs);
      attempt.timer.unref?.();
      reply({ ready: true, ...count });
    };
    attempt.timer = setTimeout(() => this.release('prepare_timeout'), this.prepareTimeoutMs);
    attempt.timer.unref?.();
    this.idleWaiters.add(attempt.inspect);
    attempt.inspect();
  }
  cancel(requestId) {
    if (this.attempt?.requestId === requestId) return this.release('cancelled');
    return false;
  }
  async commit(requestId, { close, status, exit }) {
    if (this.phase !== 'prepared' || this.attempt?.requestId !== requestId) return false;
    // A synchronous recheck closes the prepare/commit gap without admitting
    // work or letting an automation tick run between the check and close.
    const attempt = this.attempt;
    let count;
    try { count = this.activity(); } catch { this.release('inspection_failed'); return false; }
    if (count.activeCount || count.pendingCount) {
      clearTimeout(attempt.timer); this.phase = 'running'; this.attempt = undefined;
      attempt.reply({ ready: false, ...count, reason: 'activity_changed' });
      return false;
    }
    clearTimeout(attempt.timer); this.phase = 'closing';
    status({ phase: 'closing' });
    try {
      await close();
      this.phase = 'closed';
      exit(0);
      return true;
    } catch {
      // Resource closure is not transactional. Never reopen admission to a
      // partly closed application or report that it is safe to restart.
      this.phase = 'failed';
      attempt.reply({ ready: false, activeCount: 0, pendingCount: 0, reason: 'shutdown_failed', recoverable: false });
      return false;
    }
  }
  dispose() {
    if (this.attempt) clearTimeout(this.attempt.timer);
    this.idleWaiters.clear();
  }
}

/** No HTTP surface and no behavior change for ordinary node server launches.
 * Only Node's parent/child IPC channel can reach this two-phase protocol. */
export function installQuitIpc(app, channel = process) {
  if (typeof channel.send !== 'function' || !channel.connected) return () => {};
  const lifecycle = app.updateLifecycle;
  const send = value => { try { if (channel.connected) channel.send(value, () => {}); } catch { lifecycle.release('parent_disconnected'); } };
  const onMessage = message => {
    if (!message || !validRequestId(message.requestId)) return;
    const { requestId } = message;
    if (message.type === 'second-u:prepare-quit') lifecycle.prepare(requestId, value => send({ type: 'second-u:quit-readiness', requestId, ...value }));
    else if (message.type === 'second-u:cancel-quit') lifecycle.cancel(requestId);
    else if (message.type === 'second-u:commit-quit') void lifecycle.commit(requestId, {
      close: () => app.close(), status: value => send({ type: 'second-u:quit-status', requestId, ...value }), exit: code => channel.exit(code),
    });
  };
  const onDisconnect = () => lifecycle.release('parent_disconnected');
  channel.on('message', onMessage);
  channel.on('disconnect', onDisconnect);
  return () => { channel.off('message', onMessage); channel.off('disconnect', onDisconnect); lifecycle.dispose(); };
}
