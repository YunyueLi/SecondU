export const ENGINEER_SPACE = 'demo-engineer-v4';
export function currentSpace(search = typeof location === 'undefined' ? '' : location.search): 'main' | typeof ENGINEER_SPACE {
  const value = new URLSearchParams(search).get('space');
  if (!value || value === 'main') return 'main';
  if (value === ENGINEER_SPACE) return ENGINEER_SPACE;
  throw new Error('Unknown Hither space'); // Never silently write to the original space.
}
export function apiUrl(path: string, search?: string): string {
  const suffix = path.startsWith('/api/') ? path.slice(4) : path;
  if (!suffix.startsWith('/') || suffix.startsWith('//')) throw new Error('Invalid local API path');
  const space = currentSpace(search);
  return `${space === 'main' ? '/api' : `/api/spaces/${ENGINEER_SPACE}`}${suffix}`;
}
export function spaceStorageKey(key: string, search?: string): string {
  return currentSpace(search) === 'main' ? key : `hither.space.${ENGINEER_SPACE}:${key}`;
}
export function spaceHref(space: 'main' | typeof ENGINEER_SPACE, href = location.href): string {
  const url = new URL(href);
  if (space === 'main') url.searchParams.delete('space'); else url.searchParams.set('space', space);
  url.hash = 'settings/personal';
  return `${url.pathname}${url.search}${url.hash}`;
}
