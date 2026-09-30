import type { ChatImportPlatform } from './contracts';
export interface ImConnection {
  id:string; revision:number; name:string; adapter:'openclaw'|'hither-cli'; command:string; channel:string; platform:ChatImportPlatform; accountId:string; target:string; selfId:string;
  status:'untested'|'ready'|'unavailable'|'error'; canRead:boolean; canSend:boolean; statusMessage?:string; lastCheckedAt?:string; lastSyncedAt?:string; conversationId?:string;
}
export interface ImDraft {
  id:string; connectionId:string; connectionName:string; channel:string; accountId:string; target:string; text:string; status:'draft'|'sending'|'accepted'|'failed'|'unknown'; createdAt:string; updatedAt:string; statusMessage?:string; messageId?:string;
  confirmation?:{token:string;digest:string;expiresAt:string};
}
