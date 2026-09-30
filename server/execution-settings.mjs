import { HttpError } from './http-error.mjs';

export const APPROVAL_MODES = ['ask', 'auto', 'full'];
export function approvalMode(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!APPROVAL_MODES.includes(value)) throw new HttpError(400, 'approvalMode 必须为 ask、auto 或 full。', 'invalid_approval_mode');
  return value;
}
export function executionSettings(store) {
  const saved = store.get('meta', 'executionSettings')?.value;
  return { approvalMode: APPROVAL_MODES.includes(saved?.approvalMode) ? saved.approvalMode : 'ask' };
}
export function saveExecutionSettings(store, body) {
  const value = { approvalMode: approvalMode(body.approvalMode) };
  store.setMeta('executionSettings', value);
  return value;
}
/** Legacy tasks retain their previous policy; an explicit null opts into inheritance. */
export function resolveApprovalMode(store, task) {
  if (!Object.hasOwn(task, 'approvalMode')) return 'ask';
  return task.approvalMode === null ? executionSettings(store).approvalMode : approvalMode(task.approvalMode);
}
export function runtimePolicy(mode) {
  approvalMode(mode);
  return { approvalPolicy: mode === 'full' ? 'never' : 'on-request', approvalsReviewer: mode === 'auto' ? 'auto_review' : 'user', access: mode === 'full' ? 'full' : 'task-directory' };
}
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
/** last is a runtime-reported context measurement; total is cumulative usage. */
export function contextUsageFromRuntime(tokenUsage, stamp = new Date().toISOString()) {
  if (!tokenUsage || typeof tokenUsage !== 'object') return null;
  const usage = {
    usedTokens: count(tokenUsage.last?.totalTokens),
    contextWindow: count(tokenUsage.modelContextWindow) || null,
    inputTokens: count(tokenUsage.total?.inputTokens),
    outputTokens: count(tokenUsage.total?.outputTokens),
    totalTokens: count(tokenUsage.total?.totalTokens),
    updatedAt: stamp, source: 'runtime',
  };
  return [usage.usedTokens, usage.contextWindow, usage.inputTokens, usage.outputTokens, usage.totalTokens].every(value => value === null) ? null : usage;
}
/** Do not persist arbitrary adapter payloads or estimates as runtime measurements. */
export function measuredContextUsage(usage) {
  if (usage?.source !== 'runtime' || typeof usage.updatedAt !== 'string' || !Number.isFinite(Date.parse(usage.updatedAt))) return null;
  const result = Object.fromEntries(['usedTokens', 'contextWindow', 'inputTokens', 'outputTokens', 'totalTokens'].map(key => [key, count(usage[key])]));
  if (!result.contextWindow) result.contextWindow = null;
  if (Object.values(result).every(value => value === null)) return null;
  return { ...result, updatedAt: usage.updatedAt, source: 'runtime' };
}
