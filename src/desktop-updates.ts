export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'extracting' | 'ready' | 'awaiting-relaunch' | 'installing' | 'up-to-date' | 'no-update' | 'error' | 'unavailable';
export type NoUpdateReason = 'latest' | 'newer-than-feed' | 'system-too-old' | 'system-too-new' | 'unsupported-architecture' | 'unknown';
export type UpdateErrorReason = 'network' | 'signature' | 'configuration' | 'install-location' | 'permission' | 'installation' | 'updater-unavailable' | 'invalid-state' | 'relaunch' | 'unknown';
export type UpdateState = {
  supported: boolean;
  currentVersion: string;
  phase: UpdatePhase;
  canCheckForUpdates: boolean;
  canShow: boolean;
  sessionInProgress: boolean;
  lastCheckedAt?: string;
  updateVersion?: string;
  error?: string;
  errorReason?: UpdateErrorReason;
  noUpdateReason?: NoUpdateReason;
  downloadedBytes?: number;
  totalBytes?: number;
};
export type UnsavedChanges = { unsaved: boolean; busy: boolean };
export type DesktopUpdatesBridge = {
  get: () => Promise<UpdateState>;
  check: () => Promise<UpdateState>;
  show: () => Promise<UpdateState>;
  onChange: (callback: (state: UpdateState) => void) => () => void;
  onPrepareToQuit: (callback: () => UnsavedChanges) => () => void;
  onQuitCancelled: (callback: () => void) => () => void;
};

export const unavailableUpdateState: UpdateState = { supported: false, currentVersion: '', phase: 'unavailable', canCheckForUpdates: false, canShow: false, sessionInProgress: false };

/** One native subscription feeds the settings area and the persistent sidebar icon. */
export function createDesktopUpdateStore(getBridge: () => DesktopUpdatesBridge | undefined) {
  let state = unavailableUpdateState;
  let connected = false;
  let revision = 0;
  let disconnect: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: UpdateState) => { state = next; revision++; for (const listener of listeners) listener(); };
  async function invoke(method: 'get' | 'check' | 'show') {
    const bridge = getBridge();
    if (!bridge) return state;
    const startedAt = revision;
    try {
      const result = await bridge[method]();
      // Native events can arrive before an older request resolves.
      if (revision === startedAt) publish(result);
    } catch (error) {
      if (revision === startedAt) publish({ ...state, supported: true, phase: 'error', error: error instanceof Error ? error.message : String(error) });
    }
    return state;
  }
  function connect() {
    if (connected) return;
    const bridge = getBridge();
    if (!bridge) return;
    connected = true;
    disconnect = bridge.onChange(publish);
    void invoke('get');
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); connect(); return () => { listeners.delete(listener); }; },
    check: () => invoke('check'),
    show: () => invoke('show'),
    refresh: () => invoke('get'),
    dispose() { disconnect?.(); connected = false; disconnect = undefined; listeners.clear(); },
  };
}
export const desktopUpdates = createDesktopUpdateStore(() => typeof window === 'undefined' ? undefined : window.hitherDesktop?.updates);

export function downloadPercent(state: UpdateState): number | undefined {
  const { downloadedBytes, totalBytes } = state;
  if (typeof downloadedBytes !== 'number' || !Number.isFinite(downloadedBytes) || downloadedBytes < 0 || typeof totalBytes !== 'number' || !Number.isFinite(totalBytes) || totalBytes <= 0) return;
  return Math.min(100, Math.floor(downloadedBytes / totalBytes * 100));
}
export function updateAction(state: UpdateState): 'check' | 'show' | 'refresh' | undefined {
  if (!state.supported) return;
  if (state.canShow && (state.sessionInProgress || ['available', 'downloading', 'downloaded', 'extracting', 'ready', 'awaiting-relaunch', 'installing'].includes(state.phase))) return 'show';
  if (state.sessionInProgress || ['downloading', 'downloaded', 'extracting', 'ready', 'awaiting-relaunch', 'installing'].includes(state.phase)) return;
  if (state.canCheckForUpdates) return 'check';
  if (state.phase === 'error') return 'refresh';
}
export function updateIndicatorVisible(state: UpdateState): boolean {
  return state.supported && ['available', 'downloading', 'downloaded', 'extracting', 'ready', 'awaiting-relaunch', 'installing'].includes(state.phase);
}

export function createUnsavedChangesRegistry() {
  const readers = new Set<() => UnsavedChanges>();
  return {
    register(read: () => UnsavedChanges) { readers.add(read); return () => { readers.delete(read); }; },
    read(): UnsavedChanges {
      let unsaved = false, busy = false;
      for (const read of readers) {
        try { const value = read(); unsaved ||= value.unsaved === true; busy ||= value.busy === true; }
        catch { unsaved = true; busy = true; }
      }
      // This object is the entire renderer-to-main quit response. No draft text or keys.
      return { unsaved, busy };
    },
  };
}
export const unsavedChanges = createUnsavedChangesRegistry();

/** Session drafts may outlive their editor, but are not durable across app restarts. */
export function hasSessionDrafts(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): boolean {
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key) continue;
    let draftKey = key;
    const namespace = /^hither\.space\.([^:]+):(.+)$/.exec(key);
    if (namespace) {
      try { currentSpace(`?space=${encodeURIComponent(namespace[1])}`); } catch { continue; }
      draftKey = namespace[2];
    }
    const match = /^hither\.(artifact|agent-room\.draft)\.(.+)$/.exec(draftKey);
    if (!match) continue;
    const value = storage.getItem(key);
    if (!value?.trim()) continue;
    if (match[1] === 'agent-room.draft') return true;
    try {
      // Match ArtifactEditor's recoverable draft schema, not historical or
      // malformed values that the editor itself cannot reopen.
      const draft = JSON.parse(value);
      if (draft && typeof draft.content === 'string' && typeof draft.baseContent === 'string' && Number.isInteger(draft.baseVersion) && draft.content !== draft.baseContent) return true;
    } catch { /* An invalid cache entry is not a recoverable editor draft. */ }
  }
  return false;
}

export function prepareDesktopQuit(read: () => UnsavedChanges, freeze: () => void): UnsavedChanges {
  try {
    const state = read();
    if (!state.unsaved && !state.busy) freeze();
    return { unsaved: state.unsaved === true, busy: state.busy === true };
  } catch { return { unsaved: true, busy: true }; }
}
import { currentSpace } from './space.ts';
