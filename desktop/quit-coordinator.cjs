const { randomUUID } = require('node:crypto');

class QuitBlocked extends Error {
  constructor(reason, { recoverable = true, activeCount = 0 } = {}) {
    super(reason); this.reason = reason; this.recoverable = recoverable; this.activeCount = activeCount;
  }
}

// Prepare and commit travel only over the owned Node child IPC channel. A
// readiness reply is not proof of shutdown: only a successful exit is.
function stopOwnedBackend(child, { timeoutMs = 15000, onCommitting = () => {}, mayCommit = () => true } = {}) {
  if (!child) return Promise.resolve();
  if (child.exitCode !== null) return Promise.reject(new QuitBlocked('backend_exit_failed', { recoverable: false }));
  if (!child.connected) return Promise.reject(new QuitBlocked('backend_unavailable'));
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    let committed = false, done = false;
    const send = type => {
      if (!child.connected) return false;
      child.send({ type, requestId }, error => {
        if (error) finish(new QuitBlocked('backend_unavailable', { recoverable: !committed }));
      });
      return true;
    };
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exited); child.off('error', failed); };
    const finish = error => {
      if (done) return;
      done = true; cleanup();
      if (error) {
        if (!committed && child.connected) child.send({ type: 'second-u:cancel-quit', requestId }, () => {});
        reject(error);
      } else resolve();
    };
    const message = value => {
      if (!value || value.requestId !== requestId) return;
      if (value.type === 'second-u:quit-readiness') {
        if (value.ready !== true) {
          // A failed commit recheck releases the server's gate. An actual
          // partial close explicitly says recoverable:false.
          if (value.recoverable !== false) committed = false;
          finish(new QuitBlocked(value.reason || 'backend_unavailable', { recoverable: value.recoverable !== false, activeCount: Number.isSafeInteger(value.activeCount) ? value.activeCount : 0 }));
        } else if (!committed) {
          if (!mayCommit()) { finish(new QuitBlocked('update_cancelled')); return; }
          committed = true; onCommitting();
          if (!send('second-u:commit-quit')) finish(new QuitBlocked('backend_unavailable', { recoverable: false }));
        }
      }
    };
    const exited = (code, signal) => finish(committed && code === 0 && signal == null ? undefined : new QuitBlocked('backend_exit_failed', { recoverable: false }));
    const failed = () => finish(new QuitBlocked('backend_unavailable', { recoverable: !committed }));
    const timer = setTimeout(() => finish(new QuitBlocked(committed ? 'shutdown_timeout' : 'prepare_timeout', { recoverable: !committed })), timeoutMs);
    child.on('message', message); child.once('exit', exited); child.once('error', failed);
    if (!send('second-u:prepare-quit')) finish(new QuitBlocked('backend_unavailable'));
  });
}

function createQuitCoordinator({ checkRenderer, getBackend, isBackendReused, cancelRenderer, onCommitting, timeoutMs }) {
  let pending, terminalFailure;
  return {
    prepare({ updating = false, mayCommit = () => true } = {}) {
      if (terminalFailure) return Promise.reject(terminalFailure);
      if (pending) return pending;
      pending = (async () => {
        try {
          const state = await checkRenderer();
          if (state?.unsaved !== false || state?.busy !== false) throw new QuitBlocked(state?.busy ? 'pending_operations' : 'unsaved_changes');
          if (updating && isBackendReused()) throw new QuitBlocked('backend_reused');
          if (!mayCommit()) throw new QuitBlocked('update_cancelled');
          await stopOwnedBackend(getBackend(), { timeoutMs, onCommitting, mayCommit });
        } catch (error) {
          if (error.recoverable !== false) cancelRenderer();
          else terminalFailure = error;
          throw error;
        } finally { pending = undefined; }
      })();
      return pending;
    },
  };
}
module.exports = { QuitBlocked, stopOwnedBackend, createQuitCoordinator };
