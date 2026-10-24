/** Session-local text drafts. Storage keys are supplied by the space owner. */
export function readComposerDrafts(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, text]) => id && typeof text === 'string'));
  } catch { return {}; }
}

export function saveComposerDrafts(storage, key, drafts) {
  try {
    const retained = Object.fromEntries(Object.entries(drafts).filter(([, text]) => typeof text === 'string' && text.length > 0));
    if (Object.keys(retained).length) storage.setItem(key, JSON.stringify(retained));
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}
