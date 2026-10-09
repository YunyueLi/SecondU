const path = require('node:path');

const phases = new Set(['idle','checking','available','downloading','downloaded','extracting','ready','awaiting-relaunch','installing','up-to-date','no-update','error']);
const noUpdateReasons = new Set(['latest','newer-than-feed','system-too-old','system-too-new','unsupported-architecture','unknown']);
const errors = Object.freeze({
  network: 'The update service could not be reached. Check your connection and try again.',
  signature: 'The update could not be verified and was not installed.',
  configuration: 'The update configuration is unavailable. Install a verified release of SecondU.',
  'install-location': 'Move SecondU to a writable Applications folder before updating.',
  permission: 'SecondU could not obtain permission to install the update.',
  installation: 'The update could not be installed. Try again from the update window.',
  'updater-unavailable': 'The native update service could not start. Reopen SecondU and try again.',
  'invalid-state': 'The update state could not be read. Reopen the update window and try again.',
  relaunch: 'SecondU could not safely restart. Finish active work and try again.',
  unknown: 'The update could not be completed. Try again from the update window.',
});
const versionText = value => typeof value === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(value) ? value : undefined;
const tokenText = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function errorReason(error) {
  if (!error || typeof error !== 'object') return 'unknown';
  if (error.domain === 'NSURLErrorDomain') return 'network';
  if (error.domain !== 'SUSparkleErrorDomain') return 'unknown';
  if ([3001,3002].includes(error.code)) return 'signature';
  if ([1003,1005].includes(error.code)) return 'install-location';
  if ([4001,4012].includes(error.code)) return 'permission';
  if (error.code === 4004) return 'relaunch';
  if ([1000,1002,1007,2001].includes(error.code)) return 'network';
  if (Number.isInteger(error.code) && error.code >= 1 && error.code <= 7) return 'configuration';
  if ([2000,3000].includes(error.code) || Number.isInteger(error.code) && error.code >= 4000 && error.code < 5000) return 'installation';
  return 'unknown';
}
function checkedAt(value) {
  const milliseconds = typeof value === 'number' ? value : typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 8.64e15 ? new Date(milliseconds).toISOString() : undefined;
}
function sanitizeState(raw, currentVersion) {
  const valid = raw && typeof raw === 'object' && phases.has(raw.phase);
  const state = {supported:true,currentVersion,phase:valid ? raw.phase : 'error',canCheckForUpdates:valid && raw.canCheckForUpdates === true,canShow:valid && raw.canShow === true,sessionInProgress:valid && raw.sessionInProgress === true};
  if (!valid) return {...state,errorReason:'invalid-state',error:errors['invalid-state']};
  const lastCheckedAt = checkedAt(raw.lastCheckedAt), updateVersion = versionText(raw.updateVersion);
  if (lastCheckedAt) state.lastCheckedAt = lastCheckedAt;
  if (updateVersion) state.updateVersion = updateVersion;
  if (noUpdateReasons.has(raw.noUpdateReason)) state.noUpdateReason = raw.noUpdateReason;
  for (const field of ['downloadedBytes','totalBytes']) if (Number.isSafeInteger(raw[field]) && raw[field] >= (field === 'totalBytes' ? 1 : 0)) state[field] = raw[field];
  if (state.totalBytes !== undefined && state.downloadedBytes > state.totalBytes) delete state.totalBytes;
  if (raw.phase === 'error') { state.errorReason = errorReason(raw.error); state.error = errors[state.errorReason]; }
  return state;
}

function createAppUpdater({packaged,platform=process.platform,version='',loadNative=()=>require(path.join(__dirname,'native/updater.node')),onChange=()=>{},onPrepareRelaunch}={}) {
  const supported = packaged === true && platform === 'darwin', currentVersion = versionText(version) ?? '';
  let native, started = false, starting = false, pendingToken, consumedToken, generation = 0;
  const handling = new Set();
  let state = Object.freeze({supported,currentVersion,phase:supported?'idle':'unavailable',canCheckForUpdates:false,canShow:false,sessionInProgress:false});
  function publish(next) {
    const candidate = Object.freeze(next);
    if (JSON.stringify(candidate) !== JSON.stringify(state)) {
      state = candidate;
      try { onChange(state); } catch { console.error('[updater] Could not publish native update state.'); }
    }
    return state;
  }
  function fail(reason) { pendingToken = undefined; return publish({...state,phase:'error',canCheckForUpdates:false,canShow:false,errorReason:reason,error:errors[reason]}); }
  function accept(raw) {
    if (raw?.awaitingRelaunch !== true) pendingToken = undefined;
    return publish(sanitizeState(raw,currentVersion));
  }
  function receive(event) {
    if (!event || typeof event !== 'object' || !['state','error','prepare-relaunch'].includes(event.type)) return;
    accept(event.state);
    // The renderer only receives the whitelist above. Tokens, error objects,
    // paths, native domains and install callbacks never leave the main process.
    if (event.type !== 'prepare-relaunch' || event.state?.phase !== 'awaiting-relaunch' || event.state?.awaitingRelaunch !== true || !tokenText(event.token) || event.token === consumedToken) return;
    // Thread-safe native notifications are queued. Do not begin shutdown from
    // a preparation that Sparkle has already canceled before delivery.
    try {
      const current = native.getState();
      if (current.phase !== 'awaiting-relaunch' || current.awaitingRelaunch !== true) { accept(current); return; }
    } catch { fail('invalid-state'); return; }
    pendingToken = event.token;
    if (handling.has(event.token) || typeof onPrepareRelaunch !== 'function') return;
    const token = event.token; handling.add(token);
    Promise.resolve().then(()=>{
      if (pendingToken === token && consumedToken !== token) return onPrepareRelaunch(token);
    }).catch(()=>{
      if (pendingToken === token) fail('relaunch');
    }).finally(()=>handling.delete(token));
  }
  function start() {
    if (!supported || started || starting) return state;
    starting = true;
    const session = ++generation;
    try {
      native = loadNative();
      for (const method of ['start','getState','checkForUpdates','checkInBackground','show','resumeRelaunch']) if (typeof native?.[method] !== 'function') throw new Error('Incomplete native updater API.');
      const result = native.start({onEvent:event=>{if(session === generation && (started || starting)) receive(event);}}); started = true; return accept(result);
    } catch { generation++; native = undefined; started = false; return fail('updater-unavailable'); }
    finally { starting = false; }
  }
  function getState() {
    if (!supported || !started) return state;
    try { return accept(native.getState()); } catch { return fail('invalid-state'); }
  }
  function invoke(method,allowed,predicate=()=>true) {
    if (!supported) return state;
    if (!started) start();
    if (!started) return state;
    getState();
    if (!state[allowed] || !predicate(state)) return state;
    try { return accept(native[method]()); } catch { return fail('unknown'); }
  }
  function isRelaunchPending(token) {
    if (!started || !tokenText(token) || token !== pendingToken || token === consumedToken) return false;
    try {
      const raw = native.getState(); accept(raw);
      return token === pendingToken && raw.phase === 'awaiting-relaunch' && raw.awaitingRelaunch === true;
    } catch { fail('invalid-state'); return false; }
  }
  function resumeRelaunch(token) {
    if (!isRelaunchPending(token)) {
      const error = new Error('The restart request is no longer active.'); error.code = 'updater_stale_relaunch'; throw error;
    }
    // Consume before crossing into Sparkle, whose continuation can immediately
    // ask Electron to quit. An older asynchronous approval cannot resume anew.
    consumedToken = token; pendingToken = undefined;
    try { return accept(native.resumeRelaunch(token)); }
    catch { fail('relaunch'); const error = new Error(errors.relaunch); error.code = 'updater_relaunch_failed'; throw error; }
  }
  return {start,getState,check:()=>invoke('checkForUpdates','canCheckForUpdates'),checkInBackground:()=>invoke('checkInBackground','canCheckForUpdates',state=>!state.sessionInProgress && ['idle','up-to-date','no-update','error'].includes(state.phase)),show:()=>invoke('show','canShow'),isRelaunchPending,resumeRelaunch};
}
module.exports = {createAppUpdater};
