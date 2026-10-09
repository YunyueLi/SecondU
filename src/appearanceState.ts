import type { Appearance } from './appearance';
import type { Locale } from './i18n';

/** Failed writes stay pending; a later edit retries every still-unsaved field. */
export function createAppearancePendingChanges() {
  let pending: Partial<Appearance> = {};
  return {
    stage(patch: Partial<Appearance>) { pending = { ...pending, ...patch }; },
    snapshot(locale: Locale) {
      // A newer shared locale wins over this window's queued language choice.
      if (pending.language && pending.language !== locale) delete pending.language;
      return { ...pending };
    },
    acknowledge(saved: Partial<Appearance>) {
      for (const key of Object.keys(saved) as Array<keyof Appearance>) if (pending[key] === saved[key]) delete pending[key];
    },
    get dirty() { return Object.keys(pending).length > 0; },
  };
}

// A window's cached appearance can lag behind the shared locale store.
export function appearanceAfterPatch(current: Appearance, patch: Partial<Appearance>, locale: Locale): Appearance {
  return { ...current, language: locale, ...patch };
}

export function reconcileAppearanceLoad(defaults: Appearance, saved: Appearance | null, cached: Appearance, edits: Partial<Appearance>, locale: Locale, localeChanged: boolean) {
  const appearance = { ...defaults, ...(saved || cached), ...edits };
  if (localeChanged || (!saved?.language && !edits.language)) appearance.language = locale;
  // Existing settings receive only this window's edits. An unrelated theme change
  // must not send a stale language (or another window's older preferences).
  const patch: Partial<Appearance> = saved ? { ...edits, ...(!saved.language ? { language: appearance.language } : {}) } : { ...appearance };
  if (localeChanged && patch.language) patch.language = locale;
  return { appearance, patch };
}
