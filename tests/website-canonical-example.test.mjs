import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { exportCanonicalExamples } from '../website/export-examples.mjs';
import { ExampleRuntime } from '../website/src/embed/memory-runtime.mjs';
import { scrollConversationEnd } from '../website/src/embed/scroll.mjs';
import { replaceExampleRoute } from '../website/src/embed/navigation.mjs';
import { reconcileAppearanceLoad } from '../src/appearanceState.ts';
import { defaultAppearance } from '../server/local-appearance.mjs';
import { createHash } from 'node:crypto';
import { portableMemoryDomain } from '../website/browser-memory.mjs';
import { createDecisionExample } from '../server/demo-decision.mjs';
import { partitionCanonicalExampleData } from '../website/example-module.mjs';

let examples;
test.before(async () => {
  const fetch = globalThis.fetch, listen = Server.prototype.listen;
  globalThis.fetch = () => { throw new Error('Export attempted network access'); };
  Server.prototype.listen = () => { throw new Error('Export attempted to bind a socket'); };
  try { examples = await exportCanonicalExamples(); }
  finally { globalThis.fetch = fetch; Server.prototype.listen = listen; }
});

test('website exports the complete desktop canonical spaces without user state or machine paths', () => {
  assert.equal(examples.zh.bootstrap.profile.name, '万叶');
  assert.equal(examples.en.bootstrap.profile.name, 'Caspian');
  for (const [language, example] of Object.entries(examples)) {
    const d = example.bootstrap;
    assert.equal(d.executionPolicy, 'showcase'); assert.equal(d.profile.demo, true);
    assert.ok(d.people.length >= 22); assert.ok(d.conversations.length >= 30); assert.ok(d.agentRooms.length >= 9);
    assert.equal(d.tasks.length, language === 'zh' ? 16 : 18);
    assert.equal(d.artifacts.length, language === 'zh' ? 16 : 7);
    assert.ok(d.artifacts.some(artifact => artifact.versions.length > 1));
    assert.ok(Object.keys(example.responses).some(route => route.startsWith('/development/documents?')));
    assert.ok(d.projects.every(project => project.path.startsWith(`/examples/${example.space}/`)));
    assert.ok(d.modelConnections.every(connection => !connection.hasKey));
    assert.equal(d.computer.status, 'offline'); assert.equal(d.computer.workspace, '');
    assert.doesNotMatch(JSON.stringify(example), /secondu-public-examples-|\/Users\/|\/private\/var\/|website-weekend|website-planner/);
  }
});

test('career-discussion routes use the exact canonical authored tasks and editable outlines', () => {
  for (const [language, example] of Object.entries(examples)) {
    const { task, artifact } = createDecisionExample(language);
    assert.deepEqual(example.bootstrap.tasks.find(item => item.id === task.id), task);
    assert.deepEqual(example.bootstrap.artifacts.find(item => item.id === artifact.id), artifact);
    assert.ok(example.responses[`/tasks/${task.id}/context`]);
    assert.equal(example.responses[`/tasks/${task.id}/trace`].taskId, task.id);
    const runtime = new ExampleRuntime(example), facts = structuredClone(runtime.data.facts);
    const edited = runtime.response(`/artifacts/${artifact.id}`, 'PUT', { baseVersion: 1, content: artifact.content + '\nA question to discuss next.\n' });
    assert.equal(edited.version, 2);assert.equal(edited.versions[0].content, artifact.content);
    assert.deepEqual(runtime.data.facts, facts);
  }
});

test('initial example data omits deferred and unreachable responses without changing live task results', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-02T00:00:00.000Z') });
  const original = structuredClone(examples), { initial, development } = partitionCanonicalExampleData(examples);
  for (const language of ['zh', 'en']) {
    const complete = new ExampleRuntime(examples[language]), first = new ExampleRuntime(initial[language]);
    assert.deepEqual(first.data, complete.data);
    assert.ok(!Object.keys(initial[language].responses).some(route => route.startsWith('/development/') || /^\/tasks\/[^/]+\/(?:context|trace|feedback)$/.test(route)));
    const compareTasks = () => { for (const task of complete.data.tasks) for (const action of ['context', 'trace', 'feedback']) assert.deepEqual(first.response(`/tasks/${task.id}/${action}`), complete.response(`/tasks/${task.id}/${action}`)); };
    compareTasks();
    for (const store of [complete, first]) {
      const fact = store.data.facts.find(item => item.status === 'confirmed');
      fact.statement += ' — synthetic reviewed correction'; fact.version++;
      const task = store.data.tasks[0];
      task.contextFactIds = [fact.id]; task.events.push({ id: 'synthetic-review-event', type: 'note', title: 'Synthetic observation', createdAt: '2026-10-02T00:00:00.000Z' });
      store.put('taskFeedback', { id: 'synthetic-live-feedback', taskId: task.id, factId: fact.id, createdAt: '2026-10-02T00:00:00.000Z' });
    }
    compareTasks();
    assert.throws(() => first.response('/development/review'), error => error.code === 'not_found');
    first.loadDevelopmentResponses(development[language].responses);
    for (const [route, value] of Object.entries(development[language].responses)) assert.deepEqual(first.response(route), value);
    assert.throws(() => first.loadDevelopmentResponses({ '/bootstrap': {} }), /Invalid development/);
    assert.throws(() => first.response('/development/review', 'PUT', {}), error => error.code === 'showcase_read_only');
  }
  assert.deepEqual(examples, original);
});

test('canonical pages read records, project files and current context through the same disposable store', () => {
  for (const example of Object.values(examples)) {
    const runtime = new ExampleRuntime(example), task = runtime.data.tasks[0];
    for (const route of ['/bootstrap', '/people', '/facts', '/conversations', '/agent-rooms', '/goal-lists', '/agent-resources', '/im-connections', '/computers', '/delegations', '/development/review', '/runtime/capabilities']) assert.ok(runtime.response(route));
    assert.equal(runtime.response(`/tasks/${task.id}/trace`).taskId, task.id);
    assert.ok(runtime.response(`/tasks/${task.id}/context`));
    for (const project of runtime.data.projects) assert.ok(runtime.response(`/projects/${project.id}/files?path=`).entries.length);
    assert.throws(() => runtime.response(`/projects/${runtime.data.projects[0].id}/files?path=..%2Fprivate`), /Invalid project path/);
    const outsider = runtime.response('/bootstrap'); outsider.profile.name = 'Changed clone';
    assert.notEqual(runtime.response('/bootstrap').profile.name, outsider.profile.name);
  }
});

test('website messaging catalogue is the canonical showcase response and cannot install, authorize or start a runtime', () => {
  for (const example of Object.values(examples)) {
    const runtime = new ExampleRuntime(example), before = runtime.response('/bootstrap');
    const status = runtime.response('/im-setup');
    assert.deepEqual(status, example.responses['/im-setup']);
    assert.equal(status.showcase, true);
    assert.equal(status.managed.installed, false);
    assert.equal(status.managed.gateway, 'stopped');
    assert.equal(status.existing, null);
    assert.ok(['slack', 'discord', 'telegram', 'feishu', 'qqbot', 'wecom'].every(channel => status.supported.some(item => item.channel === channel)));
    for (const action of ['detect', 'select', 'install', 'channels', 'configure', 'login', 'probe', 'gateway', 'connection']) assert.throws(() => runtime.response(`/im-setup/${action}`, 'POST', { channel: 'slack', confirmed: true }), error => error.status === 403 && error.code === 'showcase_read_only');
    assert.throws(() => runtime.response('/im-setup/operations/example-operation', 'DELETE'), error => error.status === 403);
    assert.deepEqual(runtime.response('/bootstrap'), before);
  }
});

test('browser SHA matches desktop import and export hashes', { skip: !existsSync(new URL('../website/node_modules/@noble/hashes/package.json', import.meta.url)) && 'Install website dependencies to validate browser hashing' }, async () => {
  const { createHash: browserHash } = await import('../website/src/embed/runtime-hash.mjs');
  for (const value of ['', '中文与 emoji 📷', 'a'.repeat(256 * 1024)]) assert.equal(browserHash('sha256').update(value).digest('hex'), createHash('sha256').update(value).digest('hex'));
});

test('isolated browser fact validation preserves canonical revisions', async () => {
  const module = portableMemoryDomain(readFileSync(new URL('../server/domain.mjs', import.meta.url), 'utf8'), new URL('../website/src/embed/runtime-store.mjs', import.meta.url).href);
  const { createEntity } = await import(`data:text/javascript;base64,${Buffer.from(module).toString('base64')}`);
  const runtime = new ExampleRuntime(examples.zh), source = runtime.data.sources[0];
  const candidate = createEntity(runtime, 'facts', { statement: 'Synthetic reviewed preference', sourceIds: [source.id] });
  const confirmed = createEntity(runtime, 'facts', { baseVersion: 1, statement: 'Synthetic revised preference', status: 'confirmed' }, candidate);
  assert.equal(confirmed.version, 2); assert.equal(confirmed.history[0].status, 'candidate'); assert.equal(confirmed.history[1].status, 'confirmed');
  assert.throws(() => createEntity(runtime, 'tasks', {}), /only create facts/);
  assert.throws(() => createEntity(runtime, 'facts', { baseVersion: 1, statement: 'Stale' }, confirmed), error => error.code === 'version_conflict');
});

test('website memory review saves edited selections only, exports current evidence, and never executes a task', () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Memory import attempted network access'); };
  try {
    const runtime = new ExampleRuntime(examples.zh), original = structuredClone(runtime.data);
    const layers = ['facts', 'preferences', 'goals', 'constraints', 'values', 'capabilities', 'decisions', 'notes'];
    const entries = layers.map(layer => ({ layer, statement: `Synthetic memory ${layer}` }));
    const input = { filename: 'synthetic-memory.json', content: JSON.stringify({ schema: 'secondu.memory', schemaVersion: 1, entries }) };
    const preview = runtime.response('/imports/memory/preview', 'POST', input);
    assert.deepEqual(runtime.data, original);
    const review = { previewId: preview.previewId, confirmed: true, entries: preview.candidates.slice(0, 7).map(({ id, statement, layer }) => ({ id, statement: statement + ' reviewed', layer })) };
    const result = runtime.response('/imports/memory/review', 'POST', review);
    assert.equal(result.added, 7); assert.ok(result.facts.every(fact => fact.status === 'confirmed' && fact.version === 2));
    assert.deepEqual(runtime.data.tasks, original.tasks);
    const again = runtime.response('/imports/memory/review', 'POST', review);
    assert.equal(again.added, 0); assert.equal(again.alreadyImported, true);
    const exported = runtime.response('/digital-twin/export?format=json');
    assert.equal(exported.schema, 'secondu.digital-twin');
    const imported = exported.entries.filter(item => result.factIds.includes(item.id));
    assert.deepEqual(new Set(imported.map(item => item.layer)), new Set(layers.slice(0, 7)));
    assert.ok(imported.every(item => item.statement.endsWith(' reviewed') && item.evidence[0].pointer));
    assert.ok(!exported.entries.some(item => item.id === preview.candidates[7].id));
    assert.ok(!JSON.stringify(exported).includes(input.content));
    assert.match(runtime.response('/digital-twin/export?format=markdown'), /Synthetic memory preferences reviewed/);
    const draft = runtime.response('/tasks', 'POST', { prompt: 'Use the reviewed photography preferences', contextFactIds: result.factIds, digitalTwinEnabled: true });
    assert.equal(draft.status, 'queued'); assert.equal(draft.messages.length, 1); assert.equal(draft.events.length, 0);
    assert.throws(() => runtime.response(`/tasks/${draft.id}/run`, 'POST', {}), error => error.code === 'showcase_read_only');
    assert.equal(new ExampleRuntime(examples.zh).data.facts.length, original.facts.length);
    const fresh = runtime.response('/imports/memory/preview', 'POST', { filename: 'rollback.md', content: '# Preferences\n- Synthetic rollback only.' });
    const before = structuredClone(runtime.data), put = runtime.put;
    runtime.put = function (collection, value) { if (collection === 'memoryImportReviews') throw new Error('Synthetic late failure'); return put.call(this, collection, value); };
    assert.throws(() => runtime.response('/imports/memory/review', 'POST', { previewId: fresh.previewId, confirmed: true, entries: fresh.candidates.map(({ id, statement, layer }) => ({ id, statement, layer })) }), /Synthetic late failure/);
    assert.deepEqual(runtime.data, before);
  } finally { globalThis.fetch = fetch; }
});

test('initial conversation scrolling stays inside the product viewport', () => {
  const calls = [], viewport = { scrollHeight: 1800, scrollTo: value => calls.push(value) };
  const target = { closest: selector => selector === '.conversation-scroll' ? viewport : null, scrollIntoView: () => { throw new Error('Ancestor scrolling would move the website hero'); } };
  scrollConversationEnd(target, { behavior: 'smooth', block: 'end' });
  assert.deepEqual(calls, [{ top: 1800, behavior: 'smooth' }]);
  assert.doesNotThrow(() => scrollConversationEnd(null));
});

test('fresh website preferences do not write desktop defaults back over the host theme', () => {
  for (const example of Object.values(examples)) {
    const saved = new ExampleRuntime(example).response('/settings/appearance');
    assert.ok(saved, 'The website must provide initialized appearance preferences');
    for (const theme of ['light', 'dark', 'system']) {
      const result = reconcileAppearanceLoad(defaultAppearance, { ...saved, theme }, defaultAppearance, {}, saved.language, false);
      assert.equal(result.appearance.theme, theme);
      assert.deepEqual(result.patch, {}, 'Loading must not issue an automatic preference PUT');
    }
  }
});

test('parent navigation changes the real app route without browser fragment scrolling', () => {
  const events = [], location = { href: 'https://example.com/SecondU/product/embed.html?lang=zh#example-chat' };
  Object.defineProperty(location, 'hash', { set() { throw new Error('Native fragment navigation could scroll the host'); } });
  const target = { location, history: { state: { existing: true }, replaceState(state, _title, url) { assert.deepEqual(state, { existing: true }); location.href = url.href; } }, HashChangeEvent: class extends Event { constructor(type, init) { super(type); Object.assign(this, init); } }, dispatchEvent: event => events.push(event) };
  assert.equal(replaceExampleRoute(target, 'task/demo-task'), true);
  assert.equal(new URL(location.href).hash, '#task/demo-task');
  assert.equal(events.length, 1); assert.equal(events[0].type, 'hashchange');
  assert.equal(replaceExampleRoute(target, 'task/demo-task'), false);
  assert.equal(events.length, 1, 'Repeated preference messages must not repeat app navigation');
});

test('website forms dispatch local submit handlers while native destinations and network remain blocked', () => {
  const frame = readFileSync(new URL('../website/src/EmbeddedProduct.tsx', import.meta.url), 'utf8').match(/<iframe\b[^>]+\bsandbox="([^"]+)"/);
  assert.ok(frame, 'The real product iframe must keep an explicit sandbox');
  const permissions = new Set(frame[1].split(/\s+/));
  // HTML's submission algorithm returns before dispatching submit without this
  // permission, so even React handlers that preventDefault never get called.
  assert.ok(permissions.has('allow-forms'));
  assert.ok(![...permissions].some(value => value.startsWith('allow-top-navigation') || value.startsWith('allow-popups')));
  const document = readFileSync(new URL('../website/embed.html', import.meta.url), 'utf8');
  const policy = document.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
  assert.ok(policy, 'Form and network restrictions must remain in the embedded document');
  const directives = new Map(policy.split(';').map(part => { const [name, ...values] = part.trim().split(/\s+/); return [name, values]; }));
  assert.deepEqual(directives.get('form-action'), ["'none'"]);
  assert.deepEqual(directives.get('connect-src'), ["'none'"]);
});

test('artifact editing preserves authored versions and downloads the selected saved version', () => {
  const runtime = new ExampleRuntime(examples.zh), original = structuredClone(runtime.data.artifacts[0]);
  const content = '# Edited only in this page\n';
  const saved = runtime.response(`/artifacts/${original.id}`, 'PUT', { baseVersion: original.version, content });
  assert.equal(saved.version, original.version + 1); assert.equal(saved.versions.at(-1).content, content);
  assert.equal(new TextDecoder().decode(runtime.download(original.id, saved.version).bytes), content);
  assert.equal(new TextDecoder().decode(runtime.download(original.id, original.version).bytes), original.content);
  assert.equal(examples.zh.bootstrap.artifacts[0].content, original.content);
  assert.throws(() => runtime.response(`/artifacts/${original.id}`, 'PUT', { baseVersion: original.version, content: 'stale' }), error => error.code === 'version_conflict');
  assert.throws(() => runtime.download(original.id, 0), error => error.code === 'invalid_artifact_version');
  assert.throws(() => runtime.download(original.id, 999999), error => error.code === 'artifact_version_missing');
});

test('editing a canonical room message forks a retry-safe history without copying later results', () => {
  const runtime = new ExampleRuntime(examples.zh);
  const task = runtime.data.tasks.find(task => task.roomId && task.messages.some(message => message.role === 'user'));
  const original = structuredClone(task), room = structuredClone(runtime.require('agentRooms', task.roomId));
  const message = task.messages.find(message => message.role === 'user');
  const body = { requestId: 'test-request-001', messageId: message.id, content: 'Only this revised request changes', run: false };
  const result = runtime.response(`/tasks/${task.id}/revise`, 'POST', body);
  assert.equal(result.task.status, 'queued'); assert.deepEqual(result.task.artifactIds, []);
  assert.equal(result.task.messages.at(-1).content, body.content);
  assert.ok(result.room.id !== room.id); assert.equal(result.room.forkedFrom.roomId, room.id);
  assert.deepEqual(runtime.require('agentRooms', room.id), room);
  assert.deepEqual(runtime.require('tasks', task.id).messages, original.messages);
  assert.deepEqual(runtime.require('tasks', task.id).artifactIds, original.artifactIds);
  const retry = runtime.response(`/tasks/${task.id}/revise`, 'POST', body);
  assert.equal(retry.task.id, result.task.id); assert.equal(retry.reused, true);
  assert.ok(runtime.response('/bootstrap').dailyActivities.some(activity => activity.taskId === result.task.id && activity.status === 'queued'));
  assert.throws(() => runtime.response(`/tasks/${task.id}/revise`, 'POST', { ...body, content: 'different' }), error => error.code === 'revision_request_conflict');
});

test('every authored English room user message opens a revision of its indexed historical task', () => {
  const runtime = new ExampleRuntime(examples.en);
  let edited = 0;
  for (const room of [...runtime.data.agentRooms]) for (const message of room.messages.filter(message => message.role === 'user')) {
    assert.ok(message.taskId && message.taskMessageId);
    const source = runtime.require('tasks', message.taskId);
    assert.equal(source.messages.find(item => item.id === message.taskMessageId)?.content, message.content);
    const revised = runtime.response(`/tasks/${source.id}/revise`, 'POST', { requestId: `english-history-${edited++}`, messageId: message.taskMessageId, content: `${message.content}\nA page-local revision.`, run: false });
    assert.equal(revised.room.forkedFrom.roomId, room.id);
    assert.equal(revised.task.artifactIds.length, 0);
    assert.equal(runtime.require('agentRooms', room.id).messages.find(item => item.id === message.id).content, message.content);
  }
  assert.equal(edited, 24);
});

test('canonical team settings validate leaders, clear teams explicitly and annotate existing messages', () => {
  const runtime = new ExampleRuntime(examples.zh), room = runtime.data.agentRooms.find(room => room.kind === 'group');
  const saved = runtime.response(`/agent-rooms/${room.id}`, 'PUT', { team: { leadAgentId: room.agentIds[0] } });
  assert.equal(saved.team.leadAgentId, room.agentIds[0]);
  assert.throws(() => runtime.response(`/agent-rooms/${room.id}`, 'PUT', { team: { leadAgentId: 'not-a-member' } }), error => error.code === 'invalid_team_lead');
  assert.equal(runtime.response(`/agent-rooms/${room.id}`, 'PUT', { team: null }).team, undefined);
  const message = room.messages.find(message => ['assistant', 'user'].includes(message.role));
  runtime.response(`/agent-rooms/${room.id}/reactions`, 'PUT', { messageId: message.id, emoji: '👍', active: true });
  assert.equal(runtime.require('agentRooms', room.id).messages.find(item => item.id === message.id).reactions.length, 1);
  runtime.response(`/agent-rooms/${room.id}/reactions`, 'PUT', { messageId: message.id, emoji: '👍', active: false });
  assert.equal(runtime.require('agentRooms', room.id).messages.find(item => item.id === message.id).reactions, undefined);
});

test('facts and goals are editable while execution, credentials and external operations stay unavailable', () => {
  const runtime = new ExampleRuntime(examples.zh), fact = runtime.data.facts[0];
  const next = runtime.response(`/facts/${fact.id}`, 'PUT', { baseVersion: fact.version, statement: 'A page-local correction', reason: 'Example review' });
  assert.equal(next.version, fact.version + 1); assert.equal(next.history.at(-1).statement, next.statement);
  assert.throws(() => runtime.response(`/facts/${fact.id}`, 'PUT', { baseVersion: fact.version, statement: 'stale' }), error => error.status === 409);
  const goal = runtime.data.goals[0]; assert.equal(runtime.response(`/goals/${goal.id}`, 'PUT', { status: 'done' }).status, 'done');
  for (const [path, body] of [[`/tasks/${runtime.data.tasks[0].id}/run`, {}], ['/model-connections', { apiKey: 'do-not-store' }], ['/computers', {}], ['/delegations', {}], ['/automations', { enabled: true }], ['/projects/choose-directory', {}]]) assert.throws(() => runtime.response(path, 'POST', body), error => error.code === 'showcase_read_only');
  assert.throws(() => runtime.response('https://private.example/bootstrap'), /Invalid example route/);
  assert.throws(() => runtime.response('/not-an-endpoint'), error => error.status === 404);
});

test('a revised historical room keeps the task roster after the current room membership changes', () => {
  const runtime = new ExampleRuntime(examples.zh);
  const task = runtime.data.tasks.find(task => task.roomId && task.agentIds.length > 2 && task.messages.some(message => message.role === 'user'));
  assert.ok(task);
  const source = runtime.require('agentRooms', task.roomId);
  runtime.response(`/agent-rooms/${source.id}`, 'PUT', { agentIds: source.agentIds.slice(0, 2), team: null });
  const result = runtime.response(`/tasks/${task.id}/revise`, 'POST', { requestId: 'roster-revision-01', messageId: task.messages.find(message => message.role === 'user').id, content: 'Keep the original assignment', run: false });
  assert.deepEqual(result.room.agentIds, task.agentIds);
  assert.equal(runtime.require('agentRooms', source.id).agentIds.length, 2);
});

test('task feedback preserves its original answer and creates only a candidate fact until confirmation', async () => {
  const runtime = new ExampleRuntime(examples.zh);
  const task = runtime.data.tasks.find(task => task.status === 'completed' && task.messages.some(message => message.role === 'assistant'));
  const message = task.messages.find(message => message.role === 'assistant');
  const body = { requestId: 'feedback-request-001', messageId: message.id, feedback: 'Leave more time between the planned activities.', statement: 'Prefers some time between activities.', kind: 'preference' };
  const [first, retry] = await Promise.all([runtime.response(`/tasks/${task.id}/feedback`, 'POST', body), runtime.response(`/tasks/${task.id}/feedback`, 'POST', body)]);
  assert.equal(first.id, retry.id); assert.equal(runtime.list('taskFeedback').length, 1);
  assert.equal(first.original.message.content, message.content); assert.match(first.original.message.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.factStatus, 'candidate'); assert.equal(runtime.require('facts', first.factId).status, 'candidate');
  runtime.response(`/facts/${first.factId}`, 'PUT', { baseVersion: first.factVersion, status: 'confirmed', reason: 'Confirmed in this example' });
  assert.equal(runtime.response(`/task-feedback/${first.id}`).factStatus, 'confirmed');
  assert.equal(runtime.require('tasks', task.id).messages.find(item => item.id === message.id).content, message.content);
  assert.throws(() => runtime.response(`/tasks/${task.id}/feedback`, 'POST', { ...body, statement: 'A different claim' }), error => error.code === 'feedback_request_conflict');
});
