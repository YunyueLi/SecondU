import type { ModelConnection, ProviderSettings } from './contracts';

export type RemoteRunStatus = 'starting' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export interface RemoteError { code: string; message: string }
export interface RemoteProbe {
  protocol: number;
  node: string;
  nodePath: string;
  platform: 'darwin' | 'linux';
  codex: string;
  codexPath: string;
  workspaceRoot: string;
  checkedAt: string;
}
export interface RemoteComputer {
  id: string;
  name: string;
  host: string;
  user?: string;
  port: number;
  workspaceRoot: string;
  revision: number;
  status: 'saved' | 'checking' | 'ready' | 'unavailable';
  probe?: RemoteProbe;
  runtime?: { version: string; protocol: number; runtimePath: string; installedAt: string };
  lastError?: RemoteError;
  createdAt: string;
  updatedAt: string;
}
export interface RemoteInputFile { attachmentId: string; path: string; size: number; sha256: string }
export interface RemoteArtifactFile { path: string; size: number; sha256: string; modifiedAt: string }
export interface RemoteRunEvent { sequence: number; at: string; type: string; label: string; detail: string }
export interface RemoteApproval { id: string; title: string; description: string; details: string; createdAt: string }
export interface RemoteRun {
  id: string;
  computerId: string;
  computerRevision: number;
  computer: { name: string; host: string; user?: string; port: number };
  requestId: string;
  taskId?: string;
  prompt: string;
  workspace: string;
  modelConnectionId: string;
  modelRevision: number;
  model: Pick<ModelConnection, 'id' | 'name' | 'provider' | 'model' | 'baseUrl' | 'api' | 'reasoningEffort'>;
  filesInput: RemoteInputFile[];
  durationMs: number;
  status: RemoteRunStatus;
  dispatch: 'pending' | 'submitted' | 'uncertain';
  observation: { status: 'pending' | 'connected' | 'disconnected'; checkedAt?: string; error?: RemoteError };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  sequence: number;
  cursor: number;
  events: RemoteRunEvent[];
  eventsTruncated: boolean;
  approvals: RemoteApproval[];
  files: RemoteArtifactFile[];
  filesTruncated: boolean;
  cancelRequested: boolean;
  executorUnconfirmed: boolean;
  result?: string;
  error?: RemoteError;
}
export interface RemoteRunStart {
  requestId: string;
  prompt: string;
  modelConnectionId: string;
  modelRevision: number;
  computerRevision: number;
  credentialConsent: true;
  files?: Array<{ attachmentId: string; path: string }>;
  durationMs?: number;
}
export interface RemoteComputersResponse {
  computers: RemoteComputer[];
  connections: Array<ModelConnection & { revision: number }>;
  readOnly: boolean;
  protocol: number;
}
export interface RemotePollResponse { run: RemoteRun; events: RemoteRunEvent[]; cursor: number; hasMore: boolean }
export interface RemoteFileResponse { path: string; size: number; sha256: string; dataBase64: string }
export type RemoteModelSettings = Pick<ProviderSettings, 'provider' | 'model' | 'baseUrl' | 'api' | 'reasoningEffort' | 'appTitle'>;
