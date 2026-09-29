export type FactKind = 'preference' | 'value' | 'capability' | 'constraint' | 'identity' | 'decision';
export type FactStatus = 'confirmed' | 'inferred' | 'candidate' | 'superseded';
export interface Source { id: string; title: string; kind: 'note'|'conversation'|'document'|'feedback'; text: string; createdAt: string; demo: boolean }
export interface FactRevision { kind?: FactKind; sourceIds?: string[]; version: number; statement: string; status: FactStatus; reason: string; recordedAt: string }
export interface Fact { id: string; kind: FactKind; statement: string; status: FactStatus; sourceIds: string[]; updatedAt: string; version: number; history: FactRevision[] }
export interface Person { id: string; name: string; role: string; description: string; sourceIds: string[] }
export interface Relationship { id: string; from: string; to: string; label: string; description: string; sourceIds: string[] }
export interface LifeEvent { id: string; date: string; title: string; description: string; category: string; personIds: string[]; sourceIds: string[] }
export interface ConversationMessage { id: string; senderId: string; content: string; time: string; sourceId: string }
export interface Conversation { id: string; title: string; personIds: string[]; kind: 'direct'|'group'; messages: ConversationMessage[] }
export interface Goal { id: string; title: string; description: string; status: 'active'|'done'|'paused'; dueDate?: string; sourceIds: string[] }
export interface AgentProfile { id: string; name: string; role: string; instructions: string; sourceUrl?: string; createdAt: string }
export type TaskStatus = 'queued'|'running'|'needs_input'|'awaiting_approval'|'completed'|'failed'|'cancelled'|'interrupted';
export interface TaskMessage { id: string; role: 'user'|'assistant'|'system'; content: string; createdAt: string; agentId?: string }
export interface TaskEvent { id: string; type: string; label: string; detail?: string; createdAt: string; agentId?: string }
export interface Approval { id: string; title: string; description: string; status: 'pending'|'approved'|'rejected'; details?: string }
export interface Task { id: string; title: string; prompt: string; agentIds: string[]; contextFactIds: string[]; mode: 'live'|'demo'; status: TaskStatus; createdAt: string; updatedAt: string; messages: TaskMessage[]; events: TaskEvent[]; artifactIds: string[]; approvals: Approval[]; error?: string; threadId?: string }
export interface ArtifactVersion { version: number; content: string; createdAt: string; author: string }
export interface Artifact { reviewStatus?: 'pending'|'ready'; id: string; taskId: string; name: string; type: 'markdown'|'text'|'html'|'code'; content: string; version: number; versions: ArtifactVersion[]; updatedAt: string }
export interface Automation { id: string; title: string; prompt: string; enabled: boolean; trigger: 'daily'|'interval'|'source_import'; time?: string; intervalMinutes?: number; agentIds: string[]; mode: 'live'|'demo'; nextRunAt?: string; lastRunAt?: string; lastTaskId?: string }
export interface ProviderSettings { provider: 'deepseek'|'openai'|'custom'; model: string; baseUrl: string; api: 'responses'; hasKey: boolean; keyHint?: string; reasoningEffort: 'low'|'medium'|'high'; lastTest?: { ok: boolean; at: string; message: string } }
export interface Computer { id: string; name: string; platform: string; status: 'online'|'offline'; workspace: string; codexAvailable: boolean; codexVersion?: string }
export interface Bootstrap { version: string; profile: { name: string; description: string; demo: boolean }; sources: Source[]; facts: Fact[]; people: Person[]; relationships: Relationship[]; events: LifeEvent[]; conversations: Conversation[]; goals: Goal[]; agents: AgentProfile[]; tasks: Task[]; artifacts: Artifact[]; automations: Automation[]; settings: ProviderSettings; computer: Computer }
export interface CreateTask { prompt: string; title?: string; agentIds?: string[]; contextFactIds?: string[]; mode: 'live'|'demo' }
