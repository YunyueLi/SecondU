import type { TaskEvent } from '../../shared/contracts';

// Lifecycle bookkeeping stays in the task trace. The conversation only exposes
// concrete work, selected evidence, public progress, and actionable problems.
export function visibleTaskEvents(events: TaskEvent[]): TaskEvent[] {
  return events.filter(event => {
    if (event.type === 'context') {
      try { const facts = JSON.parse(event.detail || '[]'); return Array.isArray(facts) && facts.some(fact => typeof fact?.statement === 'string' && fact.statement.trim()); } catch { return !!event.detail?.trim(); }
    }
    if (event.type === 'evidence') {
      try { const evidence = JSON.parse(event.detail || '{}'); return Array.isArray(evidence.sources) && evidence.sources.some((source: {excerpt?: string}) => source?.excerpt?.trim()); } catch { return !!event.detail?.trim(); }
    }
    if (['connector.call','connector.result'].includes(event.type)) return true;
    if (event.type.startsWith('runtime.action') || event.type.startsWith('approval') || event.type.startsWith('runtime.approval')) return true;
    if (['runtime.reasoning_summary','runtime.progress','runtime.plan','progress'].includes(event.type)) return !!event.detail?.trim();
    return /(?:failed|error|warning|conflict)$/.test(event.type) || ['configuration_required','needs_input','runtime.unsupported','artifact_pending','interrupted','cancel_requested','cancelled','write_rejected'].includes(event.type);
  });
}
