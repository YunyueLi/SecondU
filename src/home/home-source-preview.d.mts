import type { HomeSuggestion, HomeSuggestionSource } from './home-suggestions.mjs';
/** Extract a plain-text preview without changing or executing saved source content. */
export function homeSourcePreview(value: unknown, limit?: number): string;
export function homeSourceLabel(source: HomeSuggestionSource): string;
export function homeSuggestionSourcePreview(item: HomeSuggestion, source: HomeSuggestionSource, sourceText?: ReadonlyMap<string, string>): string;
