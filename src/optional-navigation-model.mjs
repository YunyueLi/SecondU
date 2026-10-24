import { OPTIONAL_WORKSPACE_IDS, defaultNavigationPreferences, normalizeNavigationPreferences, normalizePinnedModules } from '../shared/navigation-preferences.mjs';
export { OPTIONAL_WORKSPACE_IDS, normalizePinnedModules };

/** Read the old browser values only when this space has no server preference yet. */
export function readLegacyNavigationPreferences(storage, pinnedKey) {
  const pinned = storage.getItem(pinnedKey);
  const expanded = storage.getItem('hither.financeNavigationOpen');
  const legacy = {};
  if (pinned !== null) {
    const parsed = JSON.parse(pinned);
    if (!Array.isArray(parsed)) throw new Error('旧侧栏固定设置无法读取');
    legacy.pinned = normalizePinnedModules(parsed);
  }
  if (expanded !== null) {
    if (!['true', 'false'].includes(expanded)) throw new Error('旧侧栏展开设置无法读取');
    legacy.financeExpanded = expanded === 'true';
  }
  return Object.keys(legacy).length ? legacy : null;
}

/** All mounted navigation surfaces observe the same server-confirmed snapshot. */
export function createNavigationPreferencesClient({ read, write, readLegacy }) {
  let snapshot = { value: defaultNavigationPreferences, ready: false, busy: false, error: null, errorOperation: null };
  let pending = null;
  const listeners = new Set();
  const publish = update => { snapshot = { ...snapshot, ...update }; for (const listener of listeners) listener(); };
  function run(operation, request) {
    if (pending) return pending;
    publish({ busy: true, error: null, errorOperation: null });
    pending = Promise.resolve().then(request).then(value => {
      publish({ value: normalizeNavigationPreferences(value), ready: true });
      return true;
    }).catch(error => {
      publish({ error, errorOperation: operation });
      return false;
    }).finally(() => { pending = null; publish({ busy: false }); });
    return pending;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh() {
      return run('load', async () => {
        const saved = await read();
        if (saved !== null) return saved;
        const legacy = readLegacy();
        return legacy ? write({ migrate: legacy }) : null;
      });
    },
    setPinned(id, pinned) {
      if (!snapshot.ready || !OPTIONAL_WORKSPACE_IDS.includes(id)) return Promise.resolve(false);
      return run('save', () => write({ pin: { id, pinned } }));
    },
    setFinanceExpanded(financeExpanded) {
      if (!snapshot.ready) return Promise.resolve(false);
      return run('save', () => write({ financeExpanded }));
    },
    setAgentsExpanded(agentsExpanded) {
      if (!snapshot.ready) return Promise.resolve(false);
      return run('save', () => write({ agentsExpanded }));
    },
  };
}
