import { t } from '../i18n.ts';
import { AgentSourceError, normalizeAgentSourceUrl } from '../../shared/agent-source.mjs';
export interface AgentCard { name: string; role: string; instructions: string; sourceUrl?: string }
export function validateCardSource(value:unknown):string {
  try{return normalizeAgentSourceUrl(value);}catch(error){
    if(error instanceof AgentSourceError&&error.code==='source_url_credentials')throw new Error(t('来源链接不能包含用户名或密码。','Source links cannot contain a username or password.'));
    throw new Error(t('请使用有效的 HTTP 或 HTTPS 来源链接。','Use a valid HTTP or HTTPS source link.'));
  }
}
export function encodeCard(card: AgentCard) {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  return 'hither://agent/v1?data=' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeCard(text: string): AgentCard {
  if (text.length > 12000) throw new Error(t("代理名片过长，请使用较短的说明。", "The agent card is too long. Use shorter instructions."));
  let value: unknown;
  if (text.trim().startsWith('{')) value = JSON.parse(text);
  else {
    const url = new URL(text.trim());
    if (url.protocol !== 'hither:' || url.hostname !== 'agent' || url.pathname !== '/v1') throw new Error(t("这不是支持的代理名片。", "This agent card format is not supported."));
    const encoded = url.searchParams.get('data');
    if (!encoded) throw new Error(t("名片缺少代理信息。", "The card is missing agent information."));
    const raw = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    value = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
  }
  const card = value as Partial<AgentCard>;
  if (!card || typeof card.name !== 'string' || !card.name.trim() || card.name.length > 80 || typeof card.role !== 'string' || card.role.length > 200 || typeof card.instructions !== 'string' || !card.instructions.trim() || card.instructions.length > 3000) throw new Error(t("名片需要有效的名称、职责和工作说明。", "The card needs a valid name, role and instructions."));
  const sourceUrl=card.sourceUrl!==undefined&&card.sourceUrl!==''?validateCardSource(card.sourceUrl):undefined;
  return { name: card.name.trim(), role: card.role.trim(), instructions: card.instructions.trim(), ...(sourceUrl ? { sourceUrl } : {}) };
}
