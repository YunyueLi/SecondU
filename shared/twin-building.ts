export type CapturePurpose = 'session' | 'personal';
export type CaptureOrigin = 'manual' | 'share' | 'screen' | 'connector' | 'wearable';
export type CaptureStatus = 'queued' | 'running' | 'review' | 'completed' | 'failed';
export type TwinCandidateKind = 'fact' | 'person' | 'event';
export interface TwinEvidence { sourceId: string; excerpt?: string; attachmentId?: string }
export interface TwinFactValue { statement: string; kind: 'preference' | 'value' | 'capability' | 'constraint' | 'identity' | 'decision'; preferenceDomain?: 'work' | 'taste' | 'general' }
export interface TwinPersonValue { name: string; role: string; description: string }
export interface TwinEventValue { date: string; title: string; description: string; category: string; scope: 'note' | 'milestone' }
export type TwinCandidateValue = TwinFactValue | TwinPersonValue | TwinEventValue;
export interface TwinCandidate { id: string; kind: TwinCandidateKind; value: TwinCandidateValue; evidence: TwinEvidence[]; status: 'pending' | 'accepted' | 'corrected' | 'rejected'; entityId?: string }
export interface TwinProcessingEvent { id: string; type: 'received' | 'started' | 'review_ready' | 'failed' | 'reviewed' | 'corrected'; label: string; at: string; captureRevision: number; taskId?: string }
export interface TwinCapture {
  id: string; title: string; text: string; attachmentIds: string[]; origin: CaptureOrigin; purpose: CapturePurpose;
  sourceId: string; upstreamSourceId?: string; status: CaptureStatus; revision: number; taskIds: string[]; activeTaskId?: string;
  candidates: TwinCandidate[]; events: TwinProcessingEvent[]; createdAt: string; updatedAt: string; error?: string; errorCode?: string; summary?: string;
  connectionId?: string; textTruncated?: boolean; reviewHistory: TwinReviewRecord[];
}
export interface TwinReviewDecision { candidateId: string; action: 'accept' | 'correct' | 'reject'; value?: TwinCandidateValue; targetId?: string; baseVersion?: number }
export interface TwinReviewRecord { id: string; at: string; revision: number; decisions: TwinReviewDecision[]; feedbackSourceId?: string }
export interface TwinSourceChange { id: string; sourceId: string; sourceTitle: string; kind: 'added' | 'updated'; fingerprint: string; at: string }
export interface TwinProactiveSettings { enabled: boolean; revision: number; updatedAt: string; enabledAt?: string }
export interface TwinProactiveTask { suggestionId: string; sourceId: string; changeId: string; goalId?: string; relatedTaskId?: string; evaluationTaskId?: string }
export interface TwinProactiveMessageOrigin { kind: 'proactive'; generator: 'application' | 'model'; suggestionId: string; sourceIds: string[]; evaluationTaskId?: string }
export interface TwinSuggestion {
  id: string; kind: 'review_source' | 'help_goal' | 'help_task'; title: string; description: string; changeId: string; sourceId: string;
  status: 'pending' | 'accepted' | 'dismissed' | 'corrected'; createdAt: string; updatedAt: string; revision: number; captureId?: string;
  goalId?: string; taskId?: string; followUpTaskId?: string; matchTerms?: string[]; relevanceMethod?: 'shared_terms' | 'model_evaluation'; evaluationId?: string;
  feedback?: { action: 'accept' | 'dismiss' | 'correct'; text?: string; at: string };
}
export interface TwinBuildingSnapshot { captures: TwinCapture[]; suggestions: TwinSuggestion[]; changes: TwinSourceChange[]; proactive: TwinProactiveSettings }
