export class AgentSourceError extends Error { readonly code: 'invalid_source_url'|'source_url_credentials'; constructor(code:'invalid_source_url'|'source_url_credentials'); }
export function normalizeAgentSourceUrl(value:unknown):string;
