import type { Bootstrap } from '../../shared/contracts';

export type HomeSuggestionData = Pick<Bootstrap, 'profile' | 'tasks' | 'goals' | 'projects' | 'sources' | 'facts' | 'dailyActivities' | 'twinBuilding'>;
export type HomeExternalLink = { href: string; host: string; label: string; brand?: string };
export type HomeSuggestionSource = {
  id: string; kind: 'source' | 'task' | 'goal' | 'project'; sourceId?: string;
  title: string; displayTitle?: string; label: string; excerpt: string; date: string; href: string;
  dueDate?: string; external?: HomeExternalLink;
};
export type HomeSuggestionAction = { type: 'draft'; label: string; prompt: string; projectId?: string } | { type: 'navigate'; label: string; href: string };
export type HomeSuggestion = {
  id: string; dismissKey: string; kind: 'pending' | 'task' | 'goal' | 'project' | 'recent' | 'example' | 'starter';
  title: string; label: string; detail: string; previewPrompt: string; iconKind?: string; sources: HomeSuggestionSource[];
  action: HomeSuggestionAction; dedupe: string[]; time: number;
};
type HomeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function homeExternalLink(value: unknown): HomeExternalLink | undefined;
export function homeSuggestionStorageKey(space: string): string;
export function readHomeDismissals(storage: HomeStorage | undefined, key: string): string[];
export function writeHomeDismissals(storage: HomeStorage | undefined, key: string, values: string[]): boolean;
export function dismissHomeSuggestion(values: string[], suggestion: HomeSuggestion): string[];
export function buildHomeSuggestionCandidates(data: HomeSuggestionData, options?: { locale?: string; now?: number }): HomeSuggestion[];
export function selectHomeSuggestions(candidates: HomeSuggestion[], dismissed?: string[], limit?: number): HomeSuggestion[];
