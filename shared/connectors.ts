export type ConnectorKind = 'library' | 'project' | 'mcp_http';
export type ConnectorStatus = 'ready' | 'untested' | 'error' | 'unavailable' | 'disabled';
export type ConnectorAuthMode = 'none' | 'bearer' | 'oauth';
export interface ConnectorOAuthConfig {
  clientId?: string;
  issuerUrl?: string;
  resourceUrl?: string;
  scopes?: string[];
  callbackPort?: number;
}
export interface ConnectorOAuthPublic extends ConnectorOAuthConfig {
  hasClientSecret: boolean;
  authorized: boolean;
  issuer?: string;
  authorizedAt?: string;
  expiresAt?: string;
  grantedScopes?: string[];
}
export interface ConnectorOAuthStart {authorizationUrl:string;attemptId:string;expiresAt:string;redirectUri:string}
export interface ConnectorOAuthStatus {status:'pending'|'connected'|'error'|'expired';message:string;connector?:Connector}
export interface ConnectorTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}
export interface Connector {
  id: string;
  kind: ConnectorKind;
  name: string;
  enabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  status: ConnectorStatus;
  statusMessage: string;
  projectId?: string;
  url?: string;
  allowLocalhost?: boolean;
  authMode?: ConnectorAuthMode;
  catalogId?: string;
  oauth?: ConnectorOAuthPublic;
  hasToken: boolean;
  tools: ConnectorTool[];
  lastTest?: { ok: boolean; at: string; message: string; latencyMs: number };
}
export interface SaveConnector {
  kind?: ConnectorKind;
  name?: string;
  enabled?: boolean;
  projectId?: string;
  url?: string;
  allowLocalhost?: boolean;
  token?: string;
  clearToken?: boolean;
  authMode?: ConnectorAuthMode;
  catalogId?: string;
  oauth?: Omit<ConnectorOAuthConfig,'scopes'|'callbackPort'> & {scopes?:string[]|null;callbackPort?:number|null;clientSecret?:string;clearClientSecret?:boolean};
}
export interface ConnectorTestResult {
  ok: boolean;
  message: string;
  connector: Connector;
  stale?: boolean;
}
