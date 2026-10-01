import type { Fact, FactKind, FactStatus, PreferenceDomain } from './contracts';

export type MemoryLayer = 'facts'|'preferences'|'goals'|'constraints'|'values'|'capabilities'|'decisions'|'notes';
export interface MemoryCandidate {
  id: string; layer: MemoryLayer; kind: FactKind; statement: string;
  evidence: { excerpt: string; truncated?: boolean; lineStart?: number; lineEnd?: number; pointer?: string };
  alreadyImported: boolean;
}
export interface MemoryImportPreview {
  previewId: string; filename: string; sha256: string; format: 'markdown'|'json';
  candidates: MemoryCandidate[]; warnings: string[]; expiresAt: string;
}
export interface MemoryImportResult {
  sourceId: string; factIds: string[]; added: number; duplicates: number; alreadyImported: boolean;
}
export interface MemoryImportReviewResult extends MemoryImportResult { facts: Fact[] }
export interface DigitalTwinPackage {
  schema: 'secondu.digital-twin'; schemaVersion: 1; revision: string; exportedAt: string;
  subject: { name: string };
  entries: Array<{ id: string; layer: MemoryLayer; kind: FactKind; preferenceDomain?: PreferenceDomain; statement: string; status: FactStatus; revision: number; updatedAt: string; evidence: Array<{sourceId: string; excerpt?: string; truncated?: boolean; lineStart?: number; lineEnd?: number; pointer?: string}> }>;
  evidence: Array<{ id: string; title: string; kind: string; sha256: string; recordedAt?: string }>;
}
