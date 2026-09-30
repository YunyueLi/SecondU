import { useSyncExternalStore } from 'react';

export type Locale = 'zh-CN' | 'en';
const storageKey = 'hither.locale';
const listeners = new Set<() => void>();
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'zh-CN') return saved;
    const appearance = JSON.parse(localStorage.getItem('hither.appearance.v2') || '{}');
    return appearance.language === 'en' ? 'en' : 'zh-CN';
  } catch { return 'zh-CN'; }
}
let locale = initialLocale();
export function getLocale(): Locale { return locale; }
export function t(zh: string, en: string): string { return locale === 'en' ? en : zh; }
export function setLocale(next: Locale): void {
  if (next !== 'zh-CN' && next !== 'en') return;
  const changed = next !== locale;
  locale = next;
  try { localStorage.setItem(storageKey, next); } catch { /* The service remains the durable source. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (changed) for (const listener of listeners) listener();
}
export function subscribeLocale(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useLocale(): Locale { return useSyncExternalStore(subscribeLocale, getLocale, () => 'zh-CN'); }
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => { if (event.key === storageKey && (event.newValue === 'en' || event.newValue === 'zh-CN')) setLocale(event.newValue); });
  document.documentElement.lang = locale;
}
