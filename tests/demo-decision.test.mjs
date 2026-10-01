import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/index.mjs';
import { ensureDecisionExample, DECISION_EXAMPLE_MARKER } from '../server/demo-decision.mjs';
import { decisionExampleTaskId } from '../shared/demo-decision.mjs';

async function fixture(t, language, { seed = true } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'secondu-decision-example-'));
  const deny = () => { throw new Error('An authored example must not execute anything.'); };
  const options = { dataDir: directory, seed, executionPolicy: seed ? 'showcase' : 'personal', seedLocale: language === 'en' ? 'en' : 'zh-CN', scheduler: false, computerInfo: { codexAvailable: false }, runCodex: deny, modelFetch: deny, runImCli: deny, runResourceCli: deny };
  let app = createApp(options);
  const start = async () => new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  await start();
  const api = async (route, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api${route}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200);return response.json();
  };
  t.after(async () => { await app.close();await rm(directory, { recursive: true, force: true }); });
  return { get app() { return app; }, api, async reopen() { await app.close();app = createApp(options);await start(); } };
}

for (const language of ['zh', 'en']) test(`${language} authored career discussion uses real task/context/artifact contracts and preserves edits after restart`, async t => {
  const f = await fixture(t, language), taskId = decisionExampleTaskId(language);
  const before = await f.api('/bootstrap'), task = before.tasks.find(item => item.id === taskId), artifact = before.artifacts.find(item => item.taskId === taskId);
  assert.equal(task.mode, 'demo');assert.equal(task.status, 'completed');assert.equal(task.messages.length, 8);
  assert.deepEqual(task.messages.map(message => message.role), ['user','assistant','user','assistant','user','assistant','user','assistant']);
  assert.deepEqual(task.artifactIds, [artifact.id]);assert.equal(artifact.origin.kind, 'demo');assert.equal(task.events.length, 1);assert.equal(task.events[0].type, 'showcase.recorded');
  assert.match(task.events[0].detail, language === 'zh' ? /未调用模型/ : /No model was called/);
  const context = await f.api(`/tasks/${task.id}/context`);assert.ok(JSON.stringify(context).includes(task.contextFactIds[0]));
  assert.deepEqual(before.facts, f.app.store.list('facts'));assert.equal(f.app.runner.active.size, 0);
  const updated = await f.api(`/artifacts/${artifact.id}`, 'PUT', { baseVersion: 1, content: artifact.content + '\nReader-owned follow-up question.\n' });
  assert.equal(updated.version, 2);assert.equal(updated.versions[0].content, artifact.content);assert.equal(await readFile(f.app.store.artifactPath(updated), 'utf8'), updated.content);
  await f.reopen();const after = await f.api('/bootstrap');
  assert.equal(after.tasks.filter(item => item.id === taskId).length, 1);assert.equal(after.artifacts.find(item => item.id === artifact.id).content, updated.content);
  assert.deepEqual(after.facts, before.facts);assert.equal(f.app.runner.active.size, 0);
  f.app.store.delete('artifacts', artifact.id);f.app.store.delete('tasks', task.id);await f.reopen();
  assert.equal(f.app.store.get('tasks', task.id), undefined);assert.equal(f.app.store.get('artifacts', artifact.id), undefined);
});

test('personal state and modified example context are never overwritten by the career installer', async t => {
  const personal = await fixture(t, 'zh', { seed: false });
  assert.equal(personal.app.store.get('meta', DECISION_EXAMPLE_MARKER), undefined);assert.equal(personal.app.store.list('tasks').length, 0);
  const example = await fixture(t, 'en'), store = example.app.store, taskId = decisionExampleTaskId('en'), artifactId = `demo-decision-artifact-en`;
  store.delete('tasks', taskId);store.delete('artifacts', artifactId);store.delete('meta', DECISION_EXAMPLE_MARKER);
  const fact = store.require('facts', 'demo-us-fact-music');store.put('facts', { ...fact, statement: 'A reader-owned correction.' });
  const report = ensureDecisionExample(store);assert.deepEqual(report.changedFacts, [fact.id]);assert.equal(report.installed.length, 0);assert.equal(store.get('tasks', taskId), undefined);assert.equal(store.require('facts', fact.id).statement, 'A reader-owned correction.');
});
