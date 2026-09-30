import type { ModelConnection } from './contracts';
export type DelegationPurpose='consultation'|'collaboration'|'matching'|'transaction';
export interface DelegationDraft {name:string;description:string;instructions:string;approvedContext:string;serviceRules:string;purposes:DelegationPurpose[];approvalPolicy:'every_call'|'automatic';connectionId:string;expiresAt:string;maxCalls:number;maxInputChars:number;maxOutputTokens:number}
export interface DelegationGrant {id:string;shareId:string;version:number;label:string;purposes:DelegationPurpose[];allowCalls:boolean;maxCalls:number;usedCalls:number;expiresAt:string;createdAt:string;revokedAt:string|null}
export interface DelegationTask {id:string;contextId:string;status:{state:string;timestamp:string;message?:{parts:{text:string}[]}};artifacts?:{artifactId:string;parts:{text:string}[]}[];history?:{parts:{text:string}[]}[]}
export interface DelegationCall {id:string;shareId:string;grantId:string;version:number;input:string;purpose:DelegationPurpose;task:DelegationTask;createdAt:string;updatedAt:string}
export interface Delegation {id:string;originAgentId:string;draft:DelegationDraft;draftRevision:number;publishedDraftRevision?:number;version:number;status:'draft'|'published'|'revoked';snapshot?:DelegationDraft&{version:number};grants:DelegationGrant[];calls:DelegationCall[];createdAt:string;updatedAt:string}
export interface DelegationList {delegations:Delegation[];service:{status:string;origin:string|null;error?:string;scope:'this_device'};connections:ModelConnection[];readOnly:boolean}
export interface DelegationAccess {grant:DelegationGrant;url:string;token:string;cardUrl:string;rpcUrl:string}
