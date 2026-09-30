export type AgentResourceKind = 'phone' | 'email' | 'payment' | 'im';
export type AgentResourceAdapter = 'unconnected' | 'local-cli' | 'im-connection';
export type AgentResourceAction = 'read' | 'draft' | 'send' | 'call' | 'pay';
export type AgentResourceState = 'pending' | 'ready' | 'simulated' | 'unavailable' | 'error' | 'disabled';
export interface AgentResourcePolicy {
  read: 'allow' | 'deny';
  draft: 'allow' | 'deny';
  send: 'confirm' | 'deny';
  call: 'confirm' | 'deny';
  pay: 'confirm' | 'deny';
  allowedTargets: string[];
  budget?: { currency: string; perPaymentLimit: string };
}
export interface AgentResourceInput {
  agentId: string;
  kind: AgentResourceKind;
  name: string;
  identifier: string;
  provider: string;
  adapter: AgentResourceAdapter;
  command?: string;
  connectionId?: string;
  policy: AgentResourcePolicy;
  enabled: boolean;
  revision?: number;
}
export interface AgentResource extends AgentResourceInput {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  status: AgentResourceState;
  statusMessage: string;
  capabilities: AgentResourceAction[];
  usableActions: AgentResourceAction[];
  checkedAt?: string;
  checkExpiresAt?: string;
  connectionName?: string;
  connectionTarget?: string;
}
export interface AgentResourceCheck {
  agentId: string;
  action: AgentResourceAction;
  target?: string;
  amount?: string;
  currency?: string;
}
export interface AgentResourceDecision {
  decision: 'blocked' | 'allowed' | 'confirmation_required';
  code: string;
  message: string;
  executed: false;
  resourceId: string;
  revision: number;
}
