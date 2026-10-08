import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskActivityModel } from '../src/design-system/taskActivityModel.ts';

const at = seconds => new Date(Date.UTC(2026, 9, 8, 10, 0, seconds)).toISOString();
const event = (id, type, seconds, extra = {}) => ({ id, type, label: type, createdAt: at(seconds), ...extra });
const task = (events, status = 'running', extra = {}) => ({
  id: 'task', title: 'Review', prompt: 'Review', mode: 'live', status, events,
  createdAt: at(-3600), updatedAt: at(100000), messages: [], agentIds: [], contextFactIds: [], artifactIds: [], approvals: [], ...extra,
});
const action = (id, phase, seconds, extra = {}) => event(`${id}-${phase}-${seconds}`, phase === 'failed' ? 'runtime.action_failed' : 'runtime.action', seconds, {
  label: `Command ${phase}`, detail: 'actual command and output', agentId: 'lead',
  activity: { kind: 'command', phase, callId: id, name: 'Check output' }, ...extra,
});

test('all eight task states remain authoritative; terminal, approval and input states cannot expose a current tool', () => {
  for (const status of ['queued', 'running', 'needs_input', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'interrupted']) {
    const model = buildTaskActivityModel(task([event('start', 'started', 0), action('call', 'running', 1)], status), Date.parse(at(8)));
    assert.equal(model.status, status);
    assert.equal(model.activeActions.length, status === 'running' ? 1 : 0, status);
  }
  const stop = buildTaskActivityModel(task([event('start', 'started', 0), action('call', 'running', 1), event('stop', 'cancel_requested', 2)]), Date.parse(at(8)));
  assert.equal(stop.stopping, true); assert.deepEqual(stop.activeActions, []);
});

test('explicit call IDs pair start and receipt once, isolate agents and attempts, and never resurrect a finished call', () => {
  const events = [event('s1', 'started', 0), action('one', 'running', 1), action('one', 'completed', 2), action('one', 'running', 3),
    event('done', 'completed', 4), event('s2', 'started', 60), action('one', 'running', 61),
    action('one', 'running', 62, { agentId: 'worker' }), action('one', 'failed', 63, { agentId: 'worker' })];
  events.push(events[2]);
  const model = buildTaskActivityModel(task(events), Date.parse(at(65)));
  assert.equal(model.actions.length, 3);
  assert.deepEqual(model.actions.map(item => item.status), ['completed', 'running', 'failed']);
  assert.equal(model.activeActions.length, 1); assert.equal(model.activeActions[0].agentId, 'lead');
  assert.deepEqual(model.actionGroups.map(({ kind, count, completed, failed, active }) => ({ kind, count, completed, failed, active })), [
    { kind: 'command', count: 3, completed: 1, failed: 1, active: 1 },
  ]);
  assert.deepEqual(model.actions[0].eventIds, ['one-running-1', 'one-completed-2', 'one-running-3']);
});

test('legacy starts are history only; completed, failed and rejected receipts never become current work', () => {
  const events = [event('s', 'started', 0),
    event('legacy-start', 'runtime.action', 1, { label: '本机命令开始', detail: 'read README' }),
    event('legacy-end', 'runtime.action', 2, { label: '本机命令已结束', detail: 'read README\ncontent' }),
    event('connector', 'connector.result', 3, { label: '连接器返回错误', detail: '{"success":false}' }),
    event('rejected', 'connector.rejected', 4, { label: '用户未批准', activity: { kind: 'connector', phase: 'rejected', callId: 'r' } }),
    event('approved', 'approval_decided', 5, { label: '已批准这一次操作' })];
  const model = buildTaskActivityModel(task(events));
  assert.deepEqual(model.activeActions, []);
  assert.deepEqual(model.actions.map(item => item.status), ['unknown', 'completed', 'failed', 'rejected']);
  assert.equal(model.actionGroups[0].count, 1); assert.equal(model.actionGroups[0].unknown, 1);
  assert.deepEqual(model.actionGroups[1].eventIds, ['connector', 'rejected']);
});

test('elapsed sums only execution intervals, includes approval wait, and ignores createdAt, updatedAt and idle gaps', () => {
  const events = [event('s1', 'started', 0), event('approve', 'approval_requested', 1), event('decision', 'approval_decided', 8),
    event('done1', 'completed', 10), event('edit', 'artifact_edited', 45), event('s2', 'started', 60), event('done2', 'completed', 65)];
  const model = buildTaskActivityModel(task(events, 'completed'), Date.parse(at(9000)));
  assert.deepEqual(model.elapsed, { milliseconds: 15000, running: false, includesApprovalWait: true, startedAt: at(0), endedAt: at(65) });
  const waiting = buildTaskActivityModel(task(events.slice(0, 2), 'awaiting_approval'), Date.parse(at(12)));
  assert.equal(waiting.elapsed.milliseconds, 12000); assert.equal(waiting.elapsed.running, true);
});

test('missing, invalid or contradictory timestamps do not manufacture a duration or count an unbounded old attempt', () => {
  const cases = [[], [event('end', 'completed', 10)], [event('s', 'started', 0)],
    [event('s', 'started', 10), event('end', 'completed', 1)],
    [event('s', 'started', 0, { createdAt: 'invalid' }), event('end', 'completed', 1)],
    [event('s1', 'started', 0), event('s2', 'started', 60), event('done2', 'completed', 65)]];
  for (const events of cases) assert.equal(buildTaskActivityModel(task(events, 'completed')).elapsed.milliseconds, null);
  const needsInput = buildTaskActivityModel(task([event('s', 'started', 0), event('input', 'needs_input', 7)], 'needs_input'));
  assert.equal(needsInput.elapsed.milliseconds, 7000); assert.equal(needsInput.elapsed.running, false);
  assert.equal(buildTaskActivityModel(task([event('config', 'configuration_required', 0)], 'needs_input')).elapsed.milliseconds, null);
});

test('configuration-required is an input terminal, without inventing a start or extending a prior execution', () => {
  const noRun = buildTaskActivityModel(task([event('config', 'configuration_required', 10)], 'needs_input'), Date.parse(at(500)));
  assert.equal(noRun.status, 'needs_input'); assert.equal(noRun.elapsed.milliseconds, null); assert.equal(noRun.elapsed.running, false);
  const ended = [event('s', 'started', 0), action('call', 'running', 1), event('config', 'configuration_required', 5)];
  const model = buildTaskActivityModel(task(ended, 'needs_input'), Date.parse(at(500)));
  assert.deepEqual(model.activeActions, []); assert.equal(model.actions[0].status, 'unknown');
  assert.equal(model.elapsed.milliseconds, 5000); assert.equal(model.elapsed.running, false); assert.equal(model.elapsed.endedAt, at(5));
  const rerun = buildTaskActivityModel(task([...ended, event('new-start', 'started', 60), action('new-call', 'running', 61)]), Date.parse(at(63)));
  assert.equal(rerun.elapsed.milliseconds, 8000);
  assert.deepEqual(rerun.activeActions.map(item => item.id), ['new-call-running-61']);
  const failedToRestart = buildTaskActivityModel(task([event('old-start', 'started', 0), event('old-end', 'completed', 3), event('configuration', 'configuration_required', 600)], 'needs_input'));
  assert.equal(failedToRestart.elapsed.milliseconds, 3000);
});

test('only explicit public commentary or progress becomes work description; final and unclassified messages stay out', () => {
  const events = [event('public', 'runtime.message', 1, { detail: 'I am checking the source.', activity: { kind: 'message', phase: 'completed', callId: 'm1', messagePhase: 'commentary' } }),
    event('summary', 'runtime.reasoning_summary', 2, { detail: 'A separate summary' }),
    event('private', 'runtime.reasoning', 3, { detail: 'Do not expose this' }),
    event('unknown', 'runtime.message', 4, { detail: 'No recorded phase' }),
    event('final', 'runtime.message', 5, { detail: 'Final answer', activity: { kind: 'message', phase: 'completed', callId: 'm2', messagePhase: 'final_answer' } })];
  assert.deepEqual(buildTaskActivityModel(task(events)).progress, { text: 'I am checking the source.', eventIds: ['public'] });
  events.push(event('progress', 'runtime.progress', 6, { detail: 'Checking the result.' }));
  assert.deepEqual(buildTaskActivityModel(task(events)).progress, { text: 'Checking the result.', eventIds: ['progress'] });
  assert.deepEqual(buildTaskActivityModel(task(events)).actions, []);
});

test('latest plan keeps recorded step states and is not upgraded by a completed task', () => {
  const events = [event('plan1', 'runtime.plan', 1, { detail: JSON.stringify({ explanation: 'Inspect then verify', plan: [
    { step: 'Inspect', status: 'completed' }, { step: 'Verify', status: 'inProgress' }, { step: 'Ship', status: 'pending' }, { step: 'Unknown', status: 'invented' }, { step: 3, status: 'completed' },
  ] }) })];
  const plan = buildTaskActivityModel(task(events, 'completed')).plan;
  assert.deepEqual(plan.steps.map(step => step.status), ['completed', 'running', 'pending', 'unknown']);
  assert.equal(plan.explanation, 'Inspect then verify'); assert.deepEqual(plan.eventIds, ['plan1']);
  events.push(event('bad', 'runtime.plan', 2, { detail: '{invalid' }));
  assert.equal(buildTaskActivityModel(task(events)).plan, undefined);
});

test('retrying within the same user turn cannot inherit a previous attempt plan, progress or active collaborator', () => {
  const events = [event('s1', 'started', 0), event('plan', 'runtime.plan', 1, { detail: '{"plan":[{"step":"Old work","status":"inProgress"}]}' }),
    event('progress', 'runtime.progress', 2, { detail: 'Old explanation' }), event('done1', 'failed', 3), event('s2', 'started', 60)];
  const teamRuns = [{ id: 'old-run', startedAt: at(1), nodes: [{ id: 'old-worker', kind: 'worker', name: 'Old worker', status: 'running' }] }];
  const model = buildTaskActivityModel(task(events, 'running', { teamRuns }), Date.parse(at(65)));
  assert.equal(model.plan, undefined); assert.equal(model.progress, undefined);
  assert.equal(model.collaborators[0].status, 'unknown');
  assert.equal(model.elapsed.milliseconds, 8000);
});

test('team collaborators belong to the supplied execution interval and retain actual node states', () => {
  const teamRuns = [
    { id: 'old', startedAt: at(0), nodes: [{ id: 'old-worker', kind: 'worker', name: 'Old', agentId: 'old', status: 'completed' }] },
    { id: 'current', startedAt: at(61), nodes: [{ id: 'lead', kind: 'lead', name: 'Lead', status: 'running' }, { id: 'worker', kind: 'worker', name: 'Reviewer', agentId: 'reviewer', status: 'failed', objective: 'Review evidence', error: 'Connection failed' }] },
    { id: 'future', startedAt: at(120), nodes: [{ id: 'future-worker', kind: 'worker', name: 'Future', status: 'running' }] },
  ];
  const events = [event('start', 'started', 60), event('worker', 'team.worker_started', 62, { detail: '{"runId":"current","nodeId":"worker"}' }), event('end', 'failed', 70)];
  const model = buildTaskActivityModel(task(events, 'failed', { teamRuns }));
  assert.deepEqual(model.collaborators, [{ id: 'worker', name: 'Reviewer', agentId: 'reviewer', status: 'failed', objective: 'Review evidence', message: 'Connection failed', source: 'team', eventIds: ['worker'] }]);
  assert.deepEqual(buildTaskActivityModel(task([], 'queued', { teamRuns })).collaborators, []);
  assert.deepEqual(buildTaskActivityModel(task([event('s', 'started', 60)], 'completed', { teamRuns })).collaborators, []);
});

test('native child states come from child evidence, never from completion of the collaboration tool itself', () => {
  const events = [event('s', 'started', 0), event('spawn', 'runtime.collaboration', 1, { detail: JSON.stringify({ tool: 'spawnAgent', status: 'completed', prompt: 'Check citations', receiverThreadIds: ['child', 'unknown'], agentsStates: { child: { status: 'running', message: null } } }) }),
    event('activity', 'runtime.subagent_activity', 2, { detail: JSON.stringify({ agentThreadId: 'child', agentPath: '/root/reviewer', kind: 'completed' }) })];
  const model = buildTaskActivityModel(task(events));
  assert.equal(model.collaborators[0].status, 'completed'); assert.equal(model.collaborators[0].name, '/root/reviewer');
  assert.equal(model.collaborators[0].objective, 'Check citations');
  assert.equal(model.collaborators[1].status, 'unknown');
  events.push(event('second', 'started', 20));
  const later = buildTaskActivityModel(task(events));
  assert.equal(later.collaborators[0].status, 'completed');
  const unfinished = buildTaskActivityModel(task(events.slice(0, 2), 'interrupted'));
  assert.equal(unfinished.collaborators[0].status, 'unknown');
});

test('automatic review records do not imply tool execution, and unfinished review cannot outlive a terminal task', () => {
  const events = [event('s', 'started', 0), action('call', 'running', 1), event('review', 'runtime.auto_review', 2, { detail: '{"reviewId":"r","status":"inProgress"}' })];
  const model = buildTaskActivityModel(task(events));
  assert.equal(model.review.status, 'running'); assert.deepEqual(model.activeActions, []);
  assert.equal(buildTaskActivityModel(task(events, 'failed')).review.status, 'unknown');
  events.push(event('denied', 'runtime.auto_review', 3, { detail: '{"reviewId":"r","status":"denied"}' }));
  assert.equal(buildTaskActivityModel(task(events)).review.status, 'rejected');
});

test('denied, timed-out or aborted review cannot reactivate its old call; unrelated approval and duplicate start do not release it', () => {
  for (const status of ['denied', 'timedOut', 'aborted']) {
    const events = [event('s', 'started', 0), action('old-call', 'running', 1),
      event('review-start', 'runtime.auto_review', 2, { agentId: 'lead', detail: '{"reviewId":"review-old","status":"inProgress"}' }),
      event('review-end', 'runtime.auto_review', 3, { agentId: 'lead', detail: JSON.stringify({ reviewId: 'review-old', status }) }),
      event('unrelated', 'runtime.auto_review', 4, { agentId: 'lead', detail: '{"reviewId":"unrelated","status":"approved"}' }),
      action('old-call', 'running', 5)];
    let model = buildTaskActivityModel(task(events));
    assert.deepEqual(model.activeActions, [], status); assert.equal(model.actions[0].status, 'unknown');
    events.push(action('new-call', 'running', 6));
    model = buildTaskActivityModel(task(events));
    assert.deepEqual(model.activeActions.map(item => item.id), ['new-call-running-6']);
    events.push(event('same-review-approved', 'runtime.auto_review', 7, { agentId: 'lead', detail: '{"reviewId":"review-old","status":"approved"}' }));
    assert.deepEqual(buildTaskActivityModel(task(events)).activeActions.map(item => item.id), ['old-call-running-1', 'new-call-running-6']);
  }
});

const remote = (observation = 'connected', dispatch = 'submitted') => ({
  runId: 'remote-run', computerId: 'computer', computerName: 'Studio Mac', status: 'running', dispatch,
  observation: { status: observation }, cursor: 10, fileCount: 0, cancelRequested: false,
});
const remoteEvent = (id, type, seconds, extra) => event(id, `remote.${type}`, seconds, extra);

test('known remote lifecycle, public commentary, plan, review and child states share the model without altering source evidence', () => {
  const events = [remoteEvent('remote-start', 'remote.started', 0),
    remoteEvent('remote-message', 'runtime.message', 1, { detail: 'Checking the remote project.', activity: { kind: 'message', phase: 'completed', messagePhase: 'commentary' } }),
    remoteEvent('remote-plan', 'runtime.plan', 2, { detail: '{"plan":[{"step":"Inspect project","status":"inProgress"}]}' }),
    remoteEvent('remote-review', 'runtime.auto_review', 3, { detail: '{"reviewId":"remote-review","status":"approved"}' }),
    remoteEvent('remote-child', 'runtime.collaboration', 4, { detail: '{"receiverThreadIds":["child"],"agentsStates":{"child":{"status":"completed"}}}' }),
    remoteEvent('remote-end', 'remote.completed', 10)];
  const input = task(events, 'completed', { remoteExecution: remote() }), before = JSON.stringify(input);
  const model = buildTaskActivityModel(input, Date.parse(at(500)));
  assert.equal(model.elapsed.milliseconds, 10000); assert.equal(model.elapsed.running, false);
  assert.deepEqual(model.progress, { text: 'Checking the remote project.', eventIds: ['remote-message'] });
  assert.equal(model.plan.steps[0].text, 'Inspect project'); assert.equal(model.review.status, 'approved');
  assert.equal(model.collaborators[0].status, 'completed');
  assert.equal(JSON.stringify(input), before); assert.equal(input.events[0].type, 'remote.remote.started');
});

test('disconnection, pending observation or uncertain dispatch preserve known state without inventing current operations or elapsed time', () => {
  const events = [remoteEvent('start', 'remote.started', 0),
    remoteEvent('action', 'runtime.action', 1, { activity: { kind: 'command', phase: 'running', callId: 'remote-call' } }),
    remoteEvent('child', 'runtime.collaboration', 2, { detail: '{"receiverThreadIds":["child"],"agentsStates":{"child":{"status":"running"}}}' }),
    remoteEvent('review', 'runtime.auto_review', 3, { detail: '{"reviewId":"review","status":"inProgress"}' })];
  for (const [observation, dispatch] of [['disconnected', 'submitted'], ['pending', 'submitted'], ['connected', 'uncertain'], ['connected', 'pending']]) {
    const model = buildTaskActivityModel(task(events, 'running', { remoteExecution: remote(observation, dispatch) }), Date.parse(at(9999)));
    assert.equal(model.status, 'running'); assert.equal(model.remote.unconfirmed, true);
    assert.equal(model.remote.computerName, 'Studio Mac'); assert.deepEqual(model.activeActions, []);
    assert.equal(model.actions[0].status, 'unknown'); assert.equal(model.actionGroups[0].active, 0);
    assert.equal(model.review.status, 'unknown'); assert.equal(model.collaborators[0].status, 'unknown');
    assert.equal(model.elapsed.milliseconds, null); assert.equal(model.elapsed.running, false);
  }
});

test('confirmed remote terminal outcomes and their elapsed interval survive later disconnection', () => {
  for (const status of ['completed', 'failed', 'cancelled', 'interrupted']) {
    const events = [remoteEvent('start', 'remote.started', 0), remoteEvent('end', `remote.${status}`, 12)];
    const model = buildTaskActivityModel(task(events, status, { remoteExecution: remote('disconnected', 'uncertain') }), Date.parse(at(9999)));
    assert.equal(model.status, status); assert.equal(model.remote.unconfirmed, false);
    assert.equal(model.elapsed.milliseconds, 12000); assert.equal(model.elapsed.running, false);
  }
});

test('simple greeting lifecycle has no invented work, and input arrays are not mutated', () => {
  const input = task([event('s', 'started', 0), event('message', 'runtime.message', 1, { detail: 'Hello', activity: { kind: 'message', phase: 'completed', messagePhase: 'final_answer' } }), event('done', 'completed', 2)], 'completed');
  const before = JSON.stringify(input);
  const model = buildTaskActivityModel(input);
  assert.equal(model.hasWork, false); assert.equal(model.elapsed.milliseconds, 2000);
  assert.equal(JSON.stringify(input), before);
});
