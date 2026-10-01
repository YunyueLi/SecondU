import type { MemoryLayer } from './memory-import';

export interface TwinMcpGrant {
  id: string; revision: number; clientName: string; enabled: boolean;
  scopes: MemoryLayer[]; entryIds: string[]; includeName: boolean; includeEvidence: boolean;
  maxChars: number; packageRevision: string; sourceRevision: string; createdAt: string; updatedAt: string;
  configuration: { mcpServers: { secondu: { command: string; args: string[]; env?: Record<string,string> } } };
}
