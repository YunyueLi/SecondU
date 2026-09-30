import canonical from 'virtual:secondu-canonical-examples';
import type { Bootstrap } from '../../../shared/contracts';

export type ExampleLanguage = 'zh' | 'en';
export type CanonicalExample = { space: string; bootstrap: Bootstrap; responses: Record<string, unknown> };

/** Generated from the same initializer as the desktop's example spaces. */
export function createWebsiteExample(language: ExampleLanguage): CanonicalExample {
  return structuredClone(canonical[language]);
}
