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
  const eventsByTurn: TaskEvent[][] = groups.map(() => []);
  let activeRunOwner: number | undefined;
  let lastRunOwner: number | undefined;
  for (const event of task.events) {
    let owner = 0;
    for (let index = 1; index < groups.length; index++) {
      if ((groups[index][0]?.createdAt || task.createdAt) <= event.createdAt) owner = index;
    }
    if (event.type === 'started') { activeRunOwner = owner; lastRunOwner = owner; }
    // A follow-up is recorded before the previous run finishes aborting. Keep
    // that run's late tool results and terminal event with its original turn.
    const closingRecord = ['artifact_pending','artifact_collection_warning','artifact_conflict'].includes(event.type);
    const executionOwner = event.type === 'correction' ? owner : activeRunOwner ?? (closingRecord ? lastRunOwner : undefined) ?? owner;
    eventsByTurn[executionOwner].push(event);
    if (['completed','failed','cancelled','interrupted','needs_input','configuration_required','write_rejected'].includes(event.type)) activeRunOwner = undefined;
  }
  return groups.map((messages, index) => {
    const events = eventsByTurn[index];
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
    const terminal = [...events].reverse().find(event => ['completed','failed','cancelled','interrupted','needs_input','configuration_required','write_rejected'].includes(event.type));
    const awaitingNewRun = latest && events.some(event => event.type === 'correction') && !events.some(event => event.type === 'started')
      && ['running','awaiting_approval','interrupted'].includes(task.status);
    const historicalStatus = terminal?.type === 'write_rejected' ? 'cancelled' : terminal?.type === 'configuration_required' ? 'needs_input' : terminal?.type as TaskStatus | undefined;
    return {id:messages[0]?.id || task.id, messages, events, latest,
      status:latest ? awaitingNewRun ? 'queued' : task.status : historicalStatus || (activeRunOwner === index ? 'running' : 'completed'), context};
  });
}
