import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, collections } from '../server/store.mjs';
import { ensureDemoShowcase } from '../server/demo-showcase.mjs';
import { applyChineseDemoContent, DEMO_ZH_CONTENT_MARKER } from '../server/demo-zh-content.mjs';
import { applyDemoAgentSessions, DEMO_AGENT_SESSIONS_MARKER } from '../server/demo-agent-sessions.mjs';
import { demoAgentSessionBundles } from '../shared/demo-agent-sessions.mjs';
import before from '../server/fixtures/demo-zh-before-v1.json' with { type: 'json' };

const digest = record => createHash('sha256').update(JSON.stringify(record)).digest('hex');
const snapshot = store => store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();
const install = store => ensureDemoShowcase(store);
function fixture(t, legacy = false) {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'secondu-zh-content-')));
  const store = new Store(path.join(directory, 'data'), { seed: !legacy });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  if (!legacy) return { directory, store };
  const baseline = before.installed[0];
  for (const collection of collections) for (const record of baseline[collection] ?? []) store.put(collection, record);
  store.setMeta('profile', baseline.profile);
  store.setMeta('demo-engineer-v4', { version: 6, matcherVersion: 4 });
  store.setMeta('demo-person-portraits-v3', { appliedAt: before.installedStamp });
  const root = path.join(directory, 'examples'); mkdirSync(root);
  const data = structuredClone(before.showcase);
  for (const project of data.projects) {
    project.path = path.join(root, project.showcaseFolder); delete project.showcaseFolder; mkdirSync(project.path);
  }
  for (const artifact of data.artifacts) {
    const task = data.tasks.find(item => item.id === artifact.taskId), project = data.projects.find(item => item.id === task.projectId);
    writeFileSync(path.join(project.path, artifact.name), artifact.content);
  }
  const installation = { root, installedAt: before.stamp, records: [], preserved: [] };
  for (const [collection, records] of Object.entries(data)) for (const record of records) {
    store.put(collection, record); installation.records.push({ collection, id: record.id, sha256: digest(record) });
  }
  store.setMeta('demo-showcase-v1', installation);
  return { directory, store };
}
function assertFiles(store) {
  for (const artifact of store.list('artifacts')) {
    const task = store.require('tasks', artifact.taskId), project = store.require('projects', task.projectId);
    assert.equal(readFileSync(path.join(project.path, artifact.name), 'utf8'), artifact.content, artifact.id);
    assert.equal(artifact.versions.at(-1).content, artifact.content);
  }
}

test('Chinese examples have a coherent local biography, ordinary tasks and source-backed conversations', t => {
  const { store } = fixture(t); install(store);
  const profile = store.meta('profile');
  assert.equal(profile.name, '万叶'); assert.equal(profile.demoLocale, 'zh-CN'); assert.equal(profile.englishName, undefined);
  assert.equal(store.list('people').length, 22); assert.equal(store.list('conversations').length, 30);
  assert.equal(store.list('conversations').flatMap(room => room.messages).length, 268);
  assert.deepEqual(new Set(store.list('conversations').map(room => room.platform)), new Set(['wechat', 'feishu', 'email', 'sms', 'discord']));
  assert.equal(store.list('events').filter(event => event.scope === 'milestone').length, 8);
  const names = new Map(store.list('people').map(person => [person.id, person.name]));
  for (const room of store.list('conversations')) for (const message of room.messages) {
    assert.ok(room.personIds.includes(message.senderId), message.id);
    assert.ok(store.require('sources', message.sourceId).text.includes(`${names.get(message.senderId)}：${message.content}`), message.id);
  }
  for (const person of store.list('people')) {
    assert.ok(person.portrait.entries.length >= 3, person.id);
    for (const entry of person.portrait.entries) for (const id of entry.sourceIds) assert.ok(store.get('sources', id), entry.id);
  }
  const current = JSON.stringify({ profile, sources: store.list('sources'), people: store.list('people') });
  assert.doesNotMatch(current, /英文名 Caspian|代表这个人/);
  for (const id of profile.exampleTaskIds) assert.ok(store.require('tasks', id).artifactIds.length);
  assert.equal(store.require('tasks', profile.exampleTaskIds[0]).projectId, 'demo-showcase-project-hangzhou');
  assert.match(store.require('artifacts', 'demo-showcase-artifact-demo-story').content, /13 张/);
  assertFiles(store);
});

test('all six experts have direct histories; three groups link their work to projects and real example files', t => {
  const { store } = fixture(t); install(store);
  const rooms = store.list('agentRooms');
  assert.equal(rooms.length, 9); assert.equal(rooms.filter(room => room.kind === 'direct').length, 6);
  assert.equal(rooms.filter(room => room.kind === 'group').length, 3);
  assert.equal(store.list('tasks').length, 15); assert.equal(store.list('artifacts').length, 15);
  for (const agent of store.list('agents')) assert.ok(rooms.some(room => room.kind === 'direct' && room.agentIds.includes(agent.id)));
  for (const room of rooms) {
    assert.equal(room.mode, 'demo'); assert.equal(room.activeTaskId, undefined); assert.ok(room.messages.length >= 7);
    const task = store.require('tasks', room.taskIds[0]);
    assert.equal(task.roomId, room.id); assert.equal(task.projectId, room.projectId); assert.equal(task.status, 'completed');
    assert.deepEqual(task.agentIds, room.agentIds); assert.equal(task.events[0].type, 'showcase.recorded');
    for (const message of room.messages.slice(1)) {
      assert.equal(message.taskId, task.id); assert.ok(task.messages.some(item => item.id === message.taskMessageId && item.content === message.content));
      if (message.role === 'assistant') assert.ok(room.agentIds.includes(message.agentId));
    }
    if (room.kind === 'group') assert.ok(new Set(room.messages.map(message => message.agentId).filter(Boolean)).size > 1);
  }
  assert.equal(store.list('automations').every(automation => automation.enabled === false), true);
  assertFiles(store);
});

test('known older Chinese examples migrate with history and disk outputs, then remain unchanged on reopen', t => {
  const { directory, store } = fixture(t, true);
  const fact = store.require('facts', 'fact-clear');
  fact.history.push({ ...fact.history[0], version: 2, reason: '演示资料更新为万叶（Caspian）的工作与生活，旧版默认内容保存在基线存档。' }); fact.version = 2; store.put('facts', fact);
  install(store);
  const report = store.meta(DEMO_ZH_CONTENT_MARKER);
  assert.ok(report.updated.length > 150); assert.deepEqual(report.preserved, []);
  assert.equal(store.require('facts', fact.id).version, 3); assert.deepEqual(store.require('facts', fact.id).history.slice(0, 2), fact.history);
  assert.equal(store.require('people', 'person-self').portrait.version, 2);
  assert.equal(store.meta(DEMO_AGENT_SESSIONS_MARKER).installed.length, 9); assertFiles(store);
  const state = snapshot(store); install(store); assert.deepEqual(snapshot(store), state);
  const reopened = new Store(path.join(directory, 'data')); try { install(reopened); assert.deepEqual(snapshot(reopened), state); } finally { reopened.close(); }
});

test('user corrections, missing defaults and the sources used by corrected records are preserved', t => {
  const { store } = fixture(t, true);
  const person = store.require('people', 'demo-v2-person-jiang'); person.description = '这是用户自己改过的家庭资料'; person.portrait.entries[1].statement = '这条也经过本人修改'; store.put('people', person);
  const source = store.require('sources', 'demo-v2-source-chat-jiang');
  const conversation = store.require('conversations', 'demo-v2-chat-jiang');
  store.delete('conversations', 'demo-v2-chat-gao');
  const custom = { id: 'my-own-source', title: '个人资料', text: '保留原文', kind: 'note', demo: false, createdAt: before.stamp }; store.put('sources', custom);
  install(store);
  assert.deepEqual(store.require('people', person.id), person); assert.deepEqual(store.require('sources', source.id), source);
  assert.deepEqual(store.require('conversations', conversation.id), conversation); assert.deepEqual(store.require('sources', custom.id), custom);
  assert.equal(store.get('conversations', 'demo-v2-chat-gao'), undefined);
  assert.ok(store.meta(DEMO_ZH_CONTENT_MARKER).preserved.some(item => item.id === person.id));
});

test('edited tasks, changed output files, custom rooms and changed experts cannot be overwritten', t => {
  const { store } = fixture(t, true);
  const task = store.require('tasks', 'demo-showcase-task-family'); task.messages.push({ id: 'my-added-message', role: 'user', content: '我的新安排', createdAt: before.stamp }); store.put('tasks', task);
  const artifact = store.require('artifacts', 'demo-showcase-artifact-demo-story');
  const project = store.require('projects', store.require('tasks', artifact.taskId).projectId), file = path.join(project.path, artifact.name); writeFileSync(file, '用户自己在磁盘上改过');
  const room = store.require('agentRooms', 'demo-v2-room-planner'); room.messages.push({ id: 'my-room-message', role: 'user', content: '留住这段话', createdAt: before.stamp }); store.put('agentRooms', room);
  const budget = store.require('agents', 'demo-v2-agent-budget'); budget.instructions = '用户自己的预算规则'; store.put('agents', budget);
  install(store);
  assert.deepEqual(store.require('tasks', task.id), task); assert.deepEqual(store.require('artifacts', artifact.id), artifact); assert.equal(readFileSync(file, 'utf8'), '用户自己在磁盘上改过');
  assert.deepEqual(store.require('agentRooms', room.id), room); assert.deepEqual(store.require('agents', budget.id), budget);
  assert.equal(store.get('tasks', 'demo-agent-session-task-planner'), undefined);
  assert.equal(store.get('tasks', 'demo-agent-session-task-budget'), undefined); assert.equal(store.get('tasks', 'demo-agent-session-task-balance'), undefined);
});

test('session file collisions and symbolic links stay untouched and do not create partial task bundles', t => {
  const { directory, store } = fixture(t, true);
  applyChineseDemoContent(store);
  const target = demoAgentSessionBundles.find(bundle => bundle.key === 'care');
  const project = store.require('projects', target.task.projectId), outside = path.join(directory, 'own-file.md'); writeFileSync(outside, 'Do not touch');
  symlinkSync(outside, path.join(project.path, target.artifact.name));
  applyDemoAgentSessions(store);
  assert.equal(store.get('tasks', target.task.id), undefined); assert.equal(store.get('agentRooms', target.room.id), undefined);
  assert.equal(readFileSync(outside, 'utf8'), 'Do not touch');
  const installed = store.meta(DEMO_AGENT_SESSIONS_MARKER); assert.ok(installed.preserved.some(item => item.roomId === target.room.id && item.reason === 'file_changed'));
  store.delete('agentRooms', 'demo-agent-session-room-researcher'); applyDemoAgentSessions(store); assert.equal(store.get('agentRooms', 'demo-agent-session-room-researcher'), undefined);
});

test('a failed database update is retryable without losing the previous records', t => {
  const { store } = fixture(t, true); const state = snapshot(store), original = store.put.bind(store);
  store.put = (collection, record) => { if (collection === 'tasks') throw new Error('test write failure'); return original(collection, record); };
  assert.throws(() => applyChineseDemoContent(store), /test write failure/); assert.deepEqual(snapshot(store), state); assert.equal(store.get('meta', DEMO_ZH_CONTENT_MARKER), undefined);
  store.put = original; install(store); assertFiles(store); assert.ok(store.meta(DEMO_ZH_CONTENT_MARKER).updated.length > 150);
});

test('personal and American spaces receive no Chinese examples or migration markers', t => {
  const { store } = fixture(t, true);
  for (const profile of [{ name: '我', demo: false }, { name: 'Caspian', demo: true, demoLocale: 'en' }]) {
    store.setMeta('profile', profile); const state = snapshot(store);
    install(store); applyChineseDemoContent(store); applyDemoAgentSessions(store);
    assert.deepEqual(snapshot(store), state);
    assert.equal(store.get('meta', DEMO_ZH_CONTENT_MARKER), undefined); assert.equal(store.get('meta', DEMO_AGENT_SESSIONS_MARKER), undefined);
  }
});
