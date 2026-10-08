import type { TaskEvent } from '../../shared/contracts';

const remoteRuntimeTypes = new Set([
  'runtime.collaboration', 'runtime.subagent_activity', 'runtime.auto_review', 'runtime.usage', 'runtime.plan',
  'runtime.message', 'runtime.reasoning_summary', 'runtime.action', 'runtime.action_failed', 'runtime.error',
  'runtime.approval_rejected', 'runtime.unsupported', 'runtime.approval', 'runtime.approval_resolved',
  'runtime.connecting', 'runtime.thread', 'runtime.completed', 'runtime.image_check', 'runtime.messages_bridge', 'runtime.chat_bridge',
]);
const remoteLifecycleTypes: Readonly<Record<string, string>> = {
  'remote.remote.started': 'started',
  'remote.remote.completed': 'completed',
  'remote.remote.failed': 'failed',
  'remote.remote.cancelled': 'cancelled',
  'remote.remote.interrupted': 'interrupted',
  'remote.remote.approval': 'approval_requested',
  'remote.remote.approval_resolved': 'approval_decided',
};

/** Only aliases emitted by RemoteTaskBridge and its current worker are known.
 * Keep unknown prefixes untouched and never rewrite the source event record. */
export function activityEventType(type: string): string {
  if (Object.hasOwn(remoteLifecycleTypes, type)) return remoteLifecycleTypes[type];
  if (type.startsWith('remote.') && remoteRuntimeTypes.has(type.slice(7))) return type.slice(7);
  return type;
}

// Lifecycle bookkeeping stays in the task trace. The conversation only exposes
// concrete work, selected evidence, public progress, and actionable problems.
export function visibleTaskEvents(events: TaskEvent[]): TaskEvent[] {
  return events.filter(event => {
    const type = activityEventType(event.type);
    if (type === 'runtime.message') return event.activity?.kind === 'message' && event.activity.phase === 'completed' && event.activity.messagePhase === 'commentary' && !!event.detail?.trim();
    if (type === 'context') {
      try { const facts = JSON.parse(event.detail || '[]'); return Array.isArray(facts) && facts.some(fact => typeof fact?.statement === 'string' && fact.statement.trim()); } catch { return !!event.detail?.trim(); }
    }
    if (type === 'evidence') {
      try { const evidence = JSON.parse(event.detail || '{}'); return Array.isArray(evidence.sources) && evidence.sources.some((source: {excerpt?: string}) => source?.excerpt?.trim()); } catch { return !!event.detail?.trim(); }
    }
    if (['connector.call','connector.result','connector.rejected','runtime.collaboration','runtime.subagent_activity','runtime.auto_review','team.worker_started','team.worker_finished'].includes(type)) return true;
    if (event.activity && event.activity.kind !== 'message') return true;
    if (type.startsWith('runtime.action') || type.startsWith('approval') || type.startsWith('runtime.approval')) return true;
    if (['runtime.reasoning_summary','runtime.progress','runtime.plan','progress'].includes(type)) return !!event.detail?.trim();
    return /(?:failed|error|warning|conflict)$/.test(type) || ['configuration_required','needs_input','runtime.unsupported','artifact_pending','interrupted','cancel_requested','cancelled','write_rejected'].includes(type);
  });
}
