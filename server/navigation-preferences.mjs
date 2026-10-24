import { HttpError } from './http-error.mjs';
import { OPTIONAL_WORKSPACE_IDS, defaultNavigationPreferences, normalizeNavigationPreferences, normalizePinnedModules } from '../shared/navigation-preferences.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new HttpError(400, '侧栏设置无效', 'invalid_navigation_preferences'); };
export function getNavigationPreferences(store) {
  const saved = store.get('meta', 'navigationPreferences')?.value;
  return saved == null ? null : normalizeNavigationPreferences(saved);
}

export function saveNavigationPreferences(store, body) {
  if (!object(body) || Object.keys(body).length !== 1) invalid();
  if (Object.hasOwn(body, 'pin')) {
    if (!object(body.pin) || Object.keys(body.pin).length !== 2 || !OPTIONAL_WORKSPACE_IDS.includes(body.pin.id) || typeof body.pin.pinned !== 'boolean') invalid();
  } else if (Object.hasOwn(body, 'financeExpanded')) {
    if (typeof body.financeExpanded !== 'boolean') invalid();
  } else if (Object.hasOwn(body, 'agentsExpanded')) {
    if (typeof body.agentsExpanded !== 'boolean') invalid();
  } else if (Object.hasOwn(body, 'migrate')) {
    const legacy = body.migrate;
    if (!object(legacy) || !Object.keys(legacy).length || Object.keys(legacy).some(key => !['pinned', 'financeExpanded', 'agentsExpanded'].includes(key))) invalid();
    if (Object.hasOwn(legacy, 'pinned') && (!Array.isArray(legacy.pinned) || legacy.pinned.some(id => !OPTIONAL_WORKSPACE_IDS.includes(id)))) invalid();
    if (Object.hasOwn(legacy, 'financeExpanded') && typeof legacy.financeExpanded !== 'boolean') invalid();
    if (Object.hasOwn(legacy, 'agentsExpanded') && typeof legacy.agentsExpanded !== 'boolean') invalid();
  } else invalid();

  return store.transaction(() => {
    const saved = getNavigationPreferences(store);
    if (body.migrate && saved) return saved;
    const next = { ...defaultNavigationPreferences, ...saved };
    if (body.migrate) Object.assign(next, body.migrate, { pinned: normalizePinnedModules(body.migrate.pinned) });
    else if (body.pin) next.pinned = normalizePinnedModules(body.pin.pinned ? [...next.pinned, body.pin.id] : next.pinned.filter(id => id !== body.pin.id));
    else if (Object.hasOwn(body, 'agentsExpanded')) next.agentsExpanded = body.agentsExpanded;
    else next.financeExpanded = body.financeExpanded;
    return store.setMeta('navigationPreferences', next);
  });
}
