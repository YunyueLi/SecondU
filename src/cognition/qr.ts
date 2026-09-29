export interface AgentCard { name: string; role: string; instructions: string; sourceUrl?: string }
export function encodeCard(card: AgentCard) {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  return 'hither://agent/v1?data=' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeCard(text: string): AgentCard {
  if (text.length > 12000) throw new Error('代理名片过长，请使用较短的说明。');
  let value: unknown;
  if (text.trim().startsWith('{')) value = JSON.parse(text);
  else {
    const url = new URL(text.trim());
    if (url.protocol !== 'hither:' || url.hostname !== 'agent' || url.pathname !== '/v1') throw new Error('这不是支持的代理名片。');
    const encoded = url.searchParams.get('data');
    if (!encoded) throw new Error('名片缺少代理信息。');
    const raw = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    value = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
  }
  const card = value as Partial<AgentCard>;
  if (!card || typeof card.name !== 'string' || !card.name.trim() || card.name.length > 80 || typeof card.role !== 'string' || card.role.length > 200 || typeof card.instructions !== 'string' || !card.instructions.trim() || card.instructions.length > 3000) throw new Error('名片需要有效的名称、职责和工作说明。');
  if (card.sourceUrl && (typeof card.sourceUrl !== 'string' || !/^https?:\/\//.test(card.sourceUrl))) throw new Error('来源链接只支持 HTTP 或 HTTPS。');
  return { name: card.name.trim(), role: card.role.trim(), instructions: card.instructions.trim(), ...(card.sourceUrl ? { sourceUrl: card.sourceUrl } : {}) };
}
