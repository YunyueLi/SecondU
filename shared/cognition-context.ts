import type { FactKind, FactStatus, PreferenceDomain } from './contracts';

export type ContextPurpose = 'auto'|'assistance'|'writing'|'planning'|'decision'|'relationship'|'verification';
export interface ContextRequest { domain?: 'auto'|'personal'|'project'; purpose?: ContextPurpose; budgetChars?: number }
export interface FeedbackScope { domain: 'personal'|'project'|'any'; purpose?: Exclude<ContextPurpose,'auto'>; projectId?: string }
export interface FeedbackArtifactSnapshot { id: string; name: string; version: number; content: string; sha256: string; createdAt: string; author: string }
export interface TaskFeedbackRecord {
  schema: 'secondu.task-feedback.v1'; id: string; taskId: string; requestId: string; createdAt: string; sourceId: string; factId: string; factStatus: FactStatus|'missing'; factVersion: number|null;
  context: { taskTitle: string; projectId?: string; userMessage?: {id: string; content: string; createdAt: string}; personalContext: {status: 'recorded'|'unavailable'; value?: unknown}; facts: {status: 'recorded'|'unavailable'; value?: unknown}; evidence: {status: 'recorded'|'unavailable'; value?: unknown} };
  original: { message?: {id: string; role: 'assistant'; content: string; sha256: string; createdAt: string; agentId?: string}; artifact?: FeedbackArtifactSnapshot };
  correction: {text: string; statement: string; kind: FactKind; preferenceDomain?: PreferenceDomain}; scope: FeedbackScope;
  adoption?: {confirmedBy: 'user'; recordedAt: string; text?: string; artifact?: FeedbackArtifactSnapshot};
  outcome?: {status: 'user_reported'; text: string; recordedAt: string};
}
