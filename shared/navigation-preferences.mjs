export const OPTIONAL_WORKSPACE_IDS = Object.freeze(['agents', 'artifacts', 'finance']);
export const defaultNavigationPreferences = Object.freeze({ pinned: Object.freeze([]), financeExpanded: false, agentsExpanded: true });

export function normalizeNavigationPreferences(value) {
  return { ...defaultNavigationPreferences, ...value, agentsExpanded: value?.agentsExpanded ?? true };
}

export function normalizePinnedModules(value) {
  return Array.isArray(value) ? OPTIONAL_WORKSPACE_IDS.filter(id => value.includes(id)) : [];
}
