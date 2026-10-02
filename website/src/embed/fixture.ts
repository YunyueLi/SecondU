import canonical from 'virtual:secondu-canonical-examples';
import type { Bootstrap } from '../../../shared/contracts';

export type ExampleLanguage = 'zh' | 'en';
export type CanonicalExample = { space: string; bootstrap: Bootstrap; responses: Record<string, unknown> };

/** Generated from the same initializer as the desktop's example spaces. */
export function createWebsiteExample(language: ExampleLanguage): CanonicalExample {
  return structuredClone(canonical[language]);
}

/** Loaded only when the development page asks for a public record. This is a
 * same-origin script chunk, preserving the embed's connect-src 'none' boundary.
 */
export async function loadWebsiteDevelopment(language: ExampleLanguage): Promise<Record<string, unknown>> {
  const { default: development } = await import('virtual:secondu-development-examples');
  return structuredClone(development[language].responses);
}
