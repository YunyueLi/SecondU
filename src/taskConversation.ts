import type { Fact, Task, TaskEvent, TaskMessage, TaskStatus } from '../shared/contracts';

export type ConversationContextFact = Pick<Fact, 'id'|'statement'|'status'|'sourceIds'|'version'>;
export type ConversationTurn = {
  id: string;
  messages: TaskMessage[];
  events: TaskEvent[];
  status: TaskStatus;
  latest: boolean;
  context: ConversationContextFact[];
};

function contextEntries(events: TaskEvent[]): ConversationContextFact[] {
  const entries = new Map<string, ConversationContextFact>();
  for (const event of events) {
    if (event.type !== 'context' || !event.detail) continue;
    try {
      const value: unknown = JSON.parse(event.detail);
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (!item || typeof item.id !== 'string' || typeof item.statement !== 'string' ||
            !Array.isArray(item.sourceIds) || !item.sourceIds.every((id: unknown) => typeof id === 'string')) continue;
        const fact: ConversationContextFact = {id:item.id, statement:item.statement, status:item.status,
          sourceIds:item.sourceIds, version:item.version};
        // Different recorded versions remain separate evidence, even for one fact.
        entries.set(JSON.stringify(fact), fact);
      }
    } catch { /* Malformed historical evidence must not be replaced by today's facts. */ }
  }
  return [...entries.values()];
}

/** Group presentation by user turn without rewriting messages or their evidence. */
export function taskConversationTurns(task: Task, facts: Fact[] = []): ConversationTurn[] {
  const groups: TaskMessage[][] = [];
  for (const message of task.messages) {
    if (!groups.length || message.role === 'user') groups.push([]);
    groups.at(-1)!.push(message);
  }
  if (!groups.length) groups.push([]);
  const byId = new Map(task.events.map(event => [event.id, event]));
  return groups.map((messages, index) => {
    const start = messages[0]?.createdAt || task.createdAt;
    const end = groups[index + 1]?.[0]?.createdAt;
    const events = task.events.filter(event => event.createdAt >= start && (!end || event.createdAt < end));
    const latest = index === groups.length - 1;
    const linkedMessages = messages.filter(message => message.role === 'assistant' && message.contextEventIds !== undefined);
    const contextEvents = linkedMessages.length
      ? linkedMessages.flatMap(message => {
        const event = message.contextEventIds?.context && byId.get(message.contextEventIds.context);
        return event ? [event] : [];
      })
      : events;
    let context = contextEntries(contextEvents);
    if (latest && task.status === 'queued' && !contextEvents.some(event => event.type === 'context') && !linkedMessages.length)
      context = facts.filter(fact => task.contextFactIds.includes(fact.id));
    const terminal = [...events].reverse().find(event => ['completed','failed','cancelled','interrupted','needs_input'].includes(event.type));
    return {id:messages[0]?.id || task.id, messages, events, latest,
      status:latest ? task.status : (terminal?.type as TaskStatus || 'completed'), context};
  });
}
