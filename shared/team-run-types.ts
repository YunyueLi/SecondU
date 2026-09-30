import type { TaskStatus } from './contracts';
export interface TeamConfiguration { leadAgentId: string }
export interface TeamRunNode {
  id: string; parentId?: string; kind: 'lead'|'worker'; agentId: string;
  name: string; role: string; objective: string; status: TaskStatus;
  createdAt: string; startedAt?: string; finishedAt?: string; result?: string; resultTruncated?: boolean; resultOriginalChars?: number; error?: string;
}
export interface TeamRun { id: string; leadAgentId: string; status: TaskStatus; startedAt: string; finishedAt?: string; nodes: TeamRunNode[] }
