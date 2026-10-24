export type AgentSection = 'mine' | 'discover' | 'market' | 'dating';
export const AGENTS_SECTIONS: readonly { id: AgentSection; zh: string; en: string; development: boolean }[];
export function agentSection(value?: string): AgentSection;
export function isAgentRoomRoute(value?: string): boolean;
export function agentHref(section?: string): string;
