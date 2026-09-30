import { HttpError, now } from './store.mjs';

export const roomReactionEmoji = Object.freeze(['👍', '❤️', '🙌', '😂', '😢', '😮']);

/** Local message reactions are annotations. They never rate an answer or start an Agent. */
export function saveRoomReaction(store, roomId, body) {
  if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 200) throw new HttpError(400, '会话标识无效。', 'invalid_room_reaction');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['messageId', 'emoji', 'active'].includes(key))) throw new HttpError(400, '消息表情字段无效。', 'invalid_room_reaction');
  if (typeof body.messageId !== 'string' || !body.messageId.trim() || body.messageId.length > 200 || !roomReactionEmoji.includes(body.emoji) || typeof body.active !== 'boolean') throw new HttpError(400, '请选择有效的消息和表情。', 'invalid_room_reaction');
  return store.transaction(() => {
    // Read inside the transaction so reactions cannot overwrite newly synced messages.
    const room = store.require('agentRooms', roomId);
    const message = room.messages.find(item => item.id === body.messageId);
    if (!message || !['user', 'assistant'].includes(message.role)) throw new HttpError(400, '只能回应当前会话中的用户或 Agent 消息。', 'room_reaction_message_scope');
    const reactions = message.reactions || [];
    const present = reactions.some(item => item.emoji === body.emoji && item.actor === 'self');
    if (present === body.active) return message;
    const stamp = now();
    const next = reactions.filter(item => item.emoji !== body.emoji || item.actor !== 'self');
    if (body.active) next.push({ emoji: body.emoji, actor: 'self', createdAt: stamp });
    if (next.length) message.reactions = next;
    else delete message.reactions;
    room.updatedAt = stamp;
    store.put('agentRooms', room);
    return message;
  });
}
