export const ENGINEER_SPACE = 'demo-engineer-v4';
export const PERSONAL_SPACE = 'personal';
export type SpaceId = 'main' | typeof ENGINEER_SPACE | typeof PERSONAL_SPACE;
export function currentSpace(search = typeof location === 'undefined' ? '' : location.search): SpaceId {
  const value = new URLSearchParams(search).get('space');
  if (!value || value === 'main') return 'main';
  if (value === ENGINEER_SPACE) return ENGINEER_SPACE;
  if (value === PERSONAL_SPACE) return PERSONAL_SPACE;
  throw new Error('Unknown SecondU space'); // Never silently write to the original space.
}
export function apiUrl(path: string, search?: string): string {
  const suffix = path.startsWith('/api/') ? path.slice(4) : path;
  if (!suffix.startsWith('/') || suffix.startsWith('//')) throw new Error('Invalid local API path');
  const space = currentSpace(search);
  return `${space === 'main' ? '/api' : `/api/spaces/${space}`}${suffix}`;
}
export function spaceStorageKey(key: string, search?: string): string {
  const space = currentSpace(search);
  return space === 'main' ? key : `hither.space.${space}:${key}`;
}
export function spaceHref(space: SpaceId, href = location.href): string {
  const url = new URL(href);
  url.searchParams.set('space', space);
  url.hash = 'settings/personal';
  return `${url.pathname}${url.search}${url.hash}`;
}
