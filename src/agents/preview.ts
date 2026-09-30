import { t } from '../i18n.ts';
import type { AgentRoom } from '../../shared/contracts';

// List summaries only. Stored message content and the conversation renderer are untouched.
export function plainTextPreview(value: string, limit = 100): string {
  const text = value
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[entity] || entity))
    .replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  return characters.length > limit ? t('查看对话', 'View conversation') : text;
}

export function roomMessagePreview(room: AgentRoom): string {
  const message = [...room.messages].reverse().find(message => message.role !== 'system');
  return message ? plainTextPreview(message.content) || t("还没有消息", "No messages yet") : t("开始一段对话", "Start a conversation");
}
