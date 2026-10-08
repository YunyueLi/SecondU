const kinds = new Set(['command', 'file_change', 'tool', 'web_search', 'connector', 'message']);
const phases = new Set(['running', 'completed', 'failed', 'rejected']);

/** Display-only lifecycle metadata. Unknown fields and malformed values are
 * dropped; nothing here grants permission or changes a task's runtime state. */
export function taskEventActivity(value, redact = text => text) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !kinds.has(value.kind) || !phases.has(value.phase)) return;
  if (value.kind === 'message' && value.phase !== 'completed') return;
  const activity = { kind: value.kind, phase: value.phase };
  // Do not shorten IDs: truncation could merge two independent tool calls.
  if (typeof value.callId === 'string' && value.callId.length > 0 && value.callId.length <= 512 && !/[\x00-\x20\x7f]/.test(value.callId)) {
    const callId = redact(value.callId);
    if (typeof callId === 'string' && callId.length > 0 && callId.length <= 512) activity.callId = callId;
  }
  if (typeof value.name === 'string' && value.name.length <= 4096) {
    const name = String(redact(value.name)).replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 160);
    if (name) activity.name = name;
  }
  if (value.kind === 'message' && ['commentary', 'final_answer'].includes(value.messagePhase)) activity.messagePhase = value.messagePhase;
  return activity;
}
