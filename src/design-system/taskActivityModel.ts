import type { Task, TaskEvent, TaskStatus } from '../../shared/contracts';
import { activityEventType } from './taskActivityEvents.ts';

export type ActivityKind = 'command' | 'file_change' | 'tool' | 'web_search' | 'connector' | 'other';
export type ActivityActionStatus = 'running' | 'completed' | 'failed' | 'rejected' | 'unknown';
export interface ActivityAction {
  id: string; kind: ActivityKind; name: string; status: ActivityActionStatus;
  eventIds: string[]; agentId?: string; startedAt?: string; endedAt?: string;
}
export interface ActivityActionGroup {
  kind: ActivityKind; count: number; completed: number; failed: number; rejected: number;
  active: number; unknown: number; eventIds: string[];
}
export interface ActivityProgress { text: string; eventIds: string[] }
export interface ActivityPlanStep { text: string; status: 'pending' | 'running' | 'completed' | 'unknown' }
export interface ActivityPlan { steps: ActivityPlanStep[]; explanation?: string; eventIds: string[] }
export interface ActivityCollaborator {
  id: string; name: string; status: TaskStatus | 'unknown'; objective?: string;
  message?: string; agentId?: string; rawStatus?: string; eventIds: string[]; source: 'team' | 'runtime';
}
export interface ActivityElapsed {
  milliseconds: number | null; running: boolean; includesApprovalWait: true;
  startedAt?: string; endedAt?: string;
}
export interface ActivityRemote {
  computerName: string;
  observation: 'pending' | 'connected' | 'disconnected';
  dispatch: 'pending' | 'submitted' | 'uncertain';
  unconfirmed: boolean;
}
export interface TaskActivityModel {
  status: TaskStatus; stopping: boolean; activeActions: ActivityAction[];
  actions: ActivityAction[]; actionGroups: ActivityActionGroup[];
  progress?: ActivityProgress; plan?: ActivityPlan; collaborators: ActivityCollaborator[];
  review?: { status: 'running' | 'approved' | 'rejected' | 'failed' | 'cancelled' | 'unknown'; eventIds: string[] };
  remote?: ActivityRemote;
  elapsed: ActivityElapsed; hasWork: boolean;
}

const taskStates = new Set<TaskStatus>(['queued', 'running', 'needs_input', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'interrupted']);
const terminalTypes = new Set(['completed', 'failed', 'interrupted', 'cancelled', 'needs_input', 'configuration_required', 'write_rejected']);
const actionKinds = new Set<ActivityKind>(['command', 'file_change', 'tool', 'web_search', 'connector']);
const actionPhases = new Set<ActivityActionStatus>(['running', 'completed', 'failed', 'rejected']);
const activeTask = (status: TaskStatus) => status === 'running' || status === 'awaiting_approval';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function detail(event: TaskEvent) {
  try { return object(JSON.parse(event.detail || '')); } catch { return undefined; }
}
function timestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
function appendId(ids: string[], id: string) { if (!ids.includes(id)) ids.push(id); }

type Attempt = { startedAt: string; endedAt?: string; closed: boolean };
function attemptsFor(events: TaskEvent[]) {
  const attempts: Attempt[] = [];
  let current: Attempt | undefined;
  for (const event of events) {
    if (event.type === 'started') {
      // A missing terminal is incomplete evidence. The next start does not
      // prove when the earlier process ended or justify counting idle time.
      current = { startedAt: event.createdAt, closed: false };
      attempts.push(current);
    } else if (current && !current.closed && terminalTypes.has(event.type)) {
      current.endedAt = event.createdAt; current.closed = true;
    }
  }
  return attempts;
}
function elapsedFor(attempts: Attempt[], status: TaskStatus, now: number): ActivityElapsed {
  const result: ActivityElapsed = { milliseconds: null, running: false, includesApprovalWait: true };
  if (!attempts.length) return result;
  result.startedAt = attempts[0].startedAt;
  result.endedAt = attempts.at(-1)?.endedAt;
  let milliseconds = 0;
  for (const [index, attempt] of attempts.entries()) {
    const start = timestamp(attempt.startedAt);
    const live = !attempt.closed && index === attempts.length - 1 && activeTask(status);
    const end = attempt.closed ? timestamp(attempt.endedAt) : live && Number.isFinite(now) ? now : undefined;
    if (start === undefined || end === undefined || end < start) return result;
    milliseconds += end - start;
    result.running ||= live;
  }
  result.milliseconds = milliseconds;
  return result;
}

function legacyAction(event: TaskEvent): ActivityAction | undefined {
  if (!['runtime.action', 'runtime.action_failed', 'connector.call', 'connector.result', 'connector.error', 'connector.rejected'].includes(event.type)) return;
  const value = detail(event);
  const kind: ActivityKind = event.type.startsWith('connector.') ? 'connector'
    : value?.type === 'commandExecution' || /本机命令|command/i.test(event.label) ? 'command'
    : value?.type === 'fileChange' || /文件修改|file change/i.test(event.label) ? 'file_change'
    : value?.type === 'webSearch' || /网页检索|web search/i.test(event.label) ? 'web_search'
    : value?.type === 'mcpToolCall' || /工具调用|tool call/i.test(event.label) ? 'tool' : 'other';
  const status: ActivityActionStatus = event.type === 'connector.rejected' || /拒绝|declined|rejected/i.test(event.label) ? 'rejected'
    : event.type === 'runtime.action_failed' || event.type === 'connector.error' || value?.success === false ? 'failed'
    : event.type === 'connector.result' || /已结束|已返回|已完成|completed|ended|returned/i.test(event.label) ? 'completed' : 'unknown';
  // Historical labels remain inspectable, but never pair calls or assert that
  // a last recorded "start" is still the current operation.
  return { id: event.id, kind, name: event.label, status, eventIds: [event.id], agentId: event.agentId,
    ...(status !== 'unknown' ? { endedAt: event.createdAt } : {}) };
}

function actionsFor(events: TaskEvent[], status: TaskStatus, stopping: boolean, observable = true) {
  const actions: ActivityAction[] = [];
  const keyed = new Map<string, ActivityAction>();
  const attemptByAction = new Map<ActivityAction, number>();
  const reviewed = new Map<string, Set<ActivityAction>>();
  let attempt = 0, closed = false;
  for (const event of events) {
    if (event.type === 'started') { attempt++; closed = false; }
    if (terminalTypes.has(event.type)) closed = true;
    if (event.type === 'runtime.auto_review') {
      const review = detail(event), reviewId = text(review?.reviewId);
      const key = JSON.stringify([attempt, event.agentId || '', reviewId || event.id]);
      if (['inProgress', 'denied', 'timedOut', 'aborted'].includes(String(review?.status))) {
        const calls = reviewed.get(key) || new Set<ActivityAction>();
        for (const action of actions) if (action.status === 'running' && (!event.agentId || action.agentId === event.agentId) && attemptByAction.get(action) === attempt) calls.add(action);
        reviewed.set(key, calls);
      } else if (review?.status === 'approved' && reviewId) {
        // A generic approval or another call's review cannot revive a denied
        // operation. Only the same recorded review can release these calls.
        reviewed.delete(key);
      }
    }
    const activity = object(event.activity);
    const kind = activity?.kind as ActivityKind;
    const phase = activity?.phase as ActivityActionStatus;
    if (!activity || !actionKinds.has(kind) || !actionPhases.has(phase)) {
      const historical = legacyAction(event);
      if (historical) actions.push(historical);
      continue;
    }
    const callId = text(activity.callId);
    const key = callId ? JSON.stringify([attempt, event.agentId || '', kind, callId]) : event.id;
    let action = keyed.get(key);
    if (!action) {
      action = { id: event.id, kind, name: text(activity.name) || event.label, status: 'unknown', eventIds: [], agentId: event.agentId };
      keyed.set(key, action); actions.push(action); attemptByAction.set(action, attempt);
    }
    appendId(action.eventIds, event.id);
    if (text(activity.name)) action.name = text(activity.name);
    // Repeated delivery of a start cannot turn a terminal receipt into a live call.
    if (phase === 'running') {
      if (!action.endedAt) { action.status = callId ? 'running' : 'unknown'; action.startedAt ??= event.createdAt; }
    } else {
      action.status = phase; action.endedAt = event.createdAt;
    }
  }
  for (const action of actions) {
    const blocked = [...reviewed.values()].some(calls => calls.has(action));
    if (action.status === 'running' && (attemptByAction.get(action) !== attempt || closed || !activeTask(status) || !observable || blocked)) action.status = 'unknown';
  }
  // Awaiting approval and cancellation are explicit task states. Do not turn
  // an unresolved tool receipt into a competing "currently executing" label.
  const activeActions = status === 'running' && !stopping ? actions.filter(action => action.status === 'running') : [];
  const groups = new Map<ActivityKind, ActivityActionGroup>();
  for (const action of actions) {
    let group = groups.get(action.kind);
    if (!group) { group = { kind: action.kind, count: 0, completed: 0, failed: 0, rejected: 0, active: 0, unknown: 0, eventIds: [] }; groups.set(action.kind, group); }
    const bucket = action.status === 'running' ? 'active' : action.status;
    group[bucket]++;
    // Unknown legacy starts are records, not proven extra executions.
    if (action.status !== 'unknown') group.count++;
    for (const id of action.eventIds) appendId(group.eventIds, id);
  }
  return { actions, activeActions, actionGroups: [...groups.values()] };
}

function latestProgress(events: TaskEvent[]): ActivityProgress | undefined {
  for (const event of [...events].reverse()) {
    const activity = object(event.activity);
    const commentary = event.type === 'runtime.message' && activity?.kind === 'message' && activity.phase === 'completed' && activity.messagePhase === 'commentary';
    if ((commentary || event.type === 'runtime.progress' || event.type === 'progress') && text(event.detail)) return { text: text(event.detail), eventIds: [event.id] };
  }
}
function latestPlan(events: TaskEvent[]): ActivityPlan | undefined {
  const event = [...events].reverse().find(item => item.type === 'runtime.plan');
  if (!event) return;
  const value = detail(event);
  if (!Array.isArray(value?.plan)) return;
  const steps = value.plan.flatMap(item => {
    const step = object(item);
    if (!text(step?.step)) return [];
    const status: ActivityPlanStep['status'] = step?.status === 'pending' ? 'pending' : step?.status === 'inProgress' || step?.status === 'in_progress' ? 'running' : step?.status === 'completed' ? 'completed' : 'unknown';
    return [{ text: text(step?.step), status }];
  });
  return steps.length ? { steps, explanation: text(value.explanation) || undefined, eventIds: [event.id] } : undefined;
}
function collaboratorStatus(value: unknown): TaskStatus | 'unknown' {
  if (taskStates.has(value as TaskStatus)) return value as TaskStatus;
  if (value === 'pendingInit') return 'queued';
  if (value === 'inProgress' || value === 'started') return 'running';
  if (value === 'errored') return 'failed';
  return 'unknown';
}
function collaboratorsFor(task: Task, events: TaskEvent[], attempts: Attempt[]) {
  const result: ActivityCollaborator[] = [];
  const runEvents = new Map<string, TaskEvent[]>();
  for (const event of events) if (event.type.startsWith('team.')) {
    const runId = text(detail(event)?.runId);
    if (runId) runEvents.set(runId, [...(runEvents.get(runId) || []), event]);
  }
  for (const run of task.teamRuns || []) {
    const start = timestamp(run.startedAt);
    const included = runEvents.has(run.id) || start !== undefined && attempts.some(attempt => {
      const lower = timestamp(attempt.startedAt), upper = timestamp(attempt.endedAt);
      return lower !== undefined && start >= lower && (attempt.closed ? upper !== undefined && start <= upper : activeTask(task.status) && attempt === attempts.at(-1));
    });
    if (!included) continue;
    const latestAttempt = attempts.at(-1), latestStart = timestamp(latestAttempt?.startedAt);
    const currentRun = activeTask(task.status) && latestAttempt && !latestAttempt.closed && start !== undefined && latestStart !== undefined && start >= latestStart;
    for (const node of run.nodes.filter(node => node.kind === 'worker')) result.push({
      id: node.id, name: node.name, status: !currentRun && ['queued', 'running', 'awaiting_approval'].includes(node.status) ? 'unknown' : collaboratorStatus(node.status), objective: node.objective,
      message: node.error || node.result, agentId: node.agentId, source: 'team',
      eventIds: (runEvents.get(run.id) || []).filter(event => detail(event)?.nodeId === node.id).map(event => event.id),
    });
  }
  const native = new Map<string, ActivityCollaborator>();
  for (const event of events) {
    if (event.type === 'started') {
      for (const item of native.values()) if (['queued', 'running', 'awaiting_approval'].includes(item.status)) item.status = 'unknown';
    }
    if (event.type !== 'runtime.collaboration' && event.type !== 'runtime.subagent_activity') continue;
    const value = detail(event); if (!value) continue;
    const state = (id: string) => {
      let item = native.get(id);
      if (!item) { item = { id, name: id, status: 'unknown', source: 'runtime', eventIds: [] }; native.set(id, item); }
      appendId(item.eventIds, event.id); return item;
    };
    if (event.type === 'runtime.collaboration') {
      const states = object(value.agentsStates) || {};
      const ids = new Set([...(Array.isArray(value.receiverThreadIds) ? value.receiverThreadIds.filter(id => typeof id === 'string') : []), ...Object.keys(states)]);
      for (const id of ids) {
        const item = state(id), recorded = object(states[id]);
        if (recorded) { item.status = collaboratorStatus(recorded.status); item.rawStatus = text(recorded.status) || undefined; item.message = text(recorded.message) || undefined; }
        if (['spawnAgent', 'spawn_agent'].includes(String(value.tool)) && text(value.prompt)) item.objective = text(value.prompt);
      }
    } else if (text(value.agentThreadId)) {
      const item = state(text(value.agentThreadId));
      if (text(value.agentPath)) item.name = text(value.agentPath);
      const status = collaboratorStatus(value.kind);
      if (status !== 'unknown') { item.status = status; item.rawStatus = text(value.kind); }
    }
  }
  result.push(...native.values());
  if (!activeTask(task.status)) for (const item of result) if (['queued', 'running', 'awaiting_approval'].includes(item.status)) item.status = 'unknown';
  return result;
}

/** Pass the events and status belonging to one displayed conversation turn. */
export function buildTaskActivityModel(task: Task, now = Date.now()): TaskActivityModel {
  const seen = new Set<string>();
  const events = task.events.filter(event => !seen.has(event.id) && !!seen.add(event.id)).map(event => {
    const type = activityEventType(event.type);
    return type === event.type ? event : { ...event, type };
  });
  const remote: ActivityRemote | undefined = task.remoteExecution ? {
    computerName: task.remoteExecution.computerName,
    observation: task.remoteExecution.observation.status,
    dispatch: task.remoteExecution.dispatch,
    unconfirmed: !['completed', 'failed', 'cancelled', 'interrupted'].includes(task.status)
      && (task.remoteExecution.observation.status !== 'connected' || task.remoteExecution.dispatch !== 'submitted'),
  } : undefined;
  const attempts = attemptsFor(events);
  let lastStart = -1;
  for (let index = events.length - 1; index >= 0; index--) if (events[index].type === 'started') { lastStart = index; break; }
  const current = events.slice(Math.max(0, lastStart));
  const stopping = activeTask(task.status) && (current.some(event => event.type === 'cancel_requested') || !!task.remoteExecution?.cancelRequested) && !current.some(event => terminalTypes.has(event.type));
  const activity = actionsFor(events, task.status, stopping, !remote?.unconfirmed);
  const progress = latestProgress(current), plan = latestPlan(current), collaborators = collaboratorsFor(task, events, attempts);
  const reviewEvent = [...current].reverse().find(event => event.type === 'runtime.auto_review');
  const reviewStatus = reviewEvent ? detail(reviewEvent)?.status : undefined;
  const reviewStates = { inProgress: 'running', approved: 'approved', denied: 'rejected', timedOut: 'failed', aborted: 'cancelled' } as const;
  const review: TaskActivityModel['review'] = reviewEvent && typeof reviewStatus === 'string' && Object.hasOwn(reviewStates, reviewStatus)
    ? { status: reviewStates[reviewStatus as keyof typeof reviewStates], eventIds: [reviewEvent.id] } : undefined;
  if (review?.status === 'running' && (!activeTask(task.status) || remote?.unconfirmed)) review.status = 'unknown';
  if (review?.status === 'running') activity.activeActions = [];
  if (remote?.unconfirmed) for (const person of collaborators) if (['queued', 'running', 'awaiting_approval'].includes(person.status)) person.status = 'unknown';
  const elapsed = elapsedFor(attempts, task.status, now);
  if (remote?.unconfirmed && attempts.some(attempt => !attempt.closed)) { elapsed.milliseconds = null; elapsed.running = false; }
  const hasProblem = events.some(event => /(?:failed|error|warning|conflict)$/.test(event.type) || ['configuration_required', 'needs_input', 'runtime.unsupported', 'artifact_pending', 'interrupted', 'cancel_requested', 'cancelled', 'write_rejected', 'approval_requested', 'approval_decided', 'runtime.approval', 'runtime.approval_resolved', 'runtime.approval_rejected'].includes(event.type));
  return { status: task.status, stopping, ...activity, progress, plan, collaborators, review, remote,
    elapsed, hasWork: !!(activity.actions.length || progress || plan || collaborators.length || review || hasProblem) };
}
