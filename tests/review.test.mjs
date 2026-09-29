import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createApp } from '../server/index.mjs';
import { evidenceFor } from '../server/runner.mjs';

// Independent review regressions. Every provider/runtime here is a local fixture.
// No real key, third-party model, or existing user data is used.
async function fixture(t, runCodex) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'hither-review-'));
  const app = createApp({ dataDir, seed: false, scheduler: false, runCodex, computerInfo: { codexAvailable: false } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); rmSync(dataDir, { recursive: true, force: true }); });
  async function request(route, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${base}/api/${route}`, { method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    return { response, value };
  }
  async function api(...args) {
    const { response, value } = await request(...args);
    assert.ok(response.ok, `fixture request failed: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  return { app, api, request };
}
async function localProvider(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/v1`;
}
function latch() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('review: an HTTP 200 empty object is not proof of a Responses text completion', async t => {
  const baseUrl = await localProvider(t, (req, res) => { req.resume(); res.setHeader('Content-Type', 'application/json'); res.end('{}'); });
  const f = await fixture(t);
  await f.api('settings/provider', { provider: 'custom', model: 'fixture-model', baseUrl, apiKey: 'review-fake-key' }, 'PUT');
  const result = await f.api('settings/provider/test', {});
  assert.equal(result.ok, false, 'an unrelated successful HTTP endpoint must not show a validated text request');
});

test('review: a provider test finishing late does not certify subsequently changed settings', async t => {
  const arrived = latch(); let pending;
  const baseUrl = await localProvider(t, (req, res) => { req.resume(); pending = res; arrived.resolve(); });
  const f = await fixture(t);
  await f.api('settings/provider', { provider: 'custom', model: 'model-A', baseUrl, apiKey: 'review-fake-key' }, 'PUT');
  const testing = f.request('settings/provider/test', {});
  await arrived.promise;
  await f.api('settings/provider', { model: 'model-B' }, 'PUT');
  pending.setHeader('Content-Type', 'application/json');
  pending.end(JSON.stringify({ id: 'resp-fixture', object: 'response', status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }] }));
  const outcome = await testing;
  assert.ok([200, 409].includes(outcome.response.status), 'a stale test may be explicitly rejected');
  const settings = await f.api('settings/provider');
  assert.equal(settings.model, 'model-B');
  assert.notEqual(settings.lastTest?.ok, true, 'the result belongs to model-A, which is no longer the saved configuration');
});

test('review: rotating only the key also invalidates an in-flight provider test', async t => {
  const arrived = latch(); let pending;
  const baseUrl = await localProvider(t, (req, res) => { req.resume(); pending = res; arrived.resolve(); });
  const f = await fixture(t);
  await f.api('settings/provider', { provider: 'custom', model: 'fixture-model', baseUrl, apiKey: 'review-old-fake-key' }, 'PUT');
  const testing = f.request('settings/provider/test', {});
  await arrived.promise;
  await f.api('settings/provider', { apiKey: 'review-new-fake-key' }, 'PUT');
  pending.setHeader('Content-Type', 'application/json');
  pending.end(JSON.stringify({ id: 'resp-fixture', object: 'response', status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }] }));
  const outcome = await testing;
  assert.ok([200, 409].includes(outcome.response.status), 'a stale test may be explicitly rejected');
  const settings = await f.api('settings/provider');
  assert.notEqual(settings.lastTest?.ok, true, 'the old key cannot certify the current key');
});

test('review: a concurrent model file write cannot survive a rejected artifact version conflict', async t => {
  const started = latch(), finish = latch(); let runtimeWorkspace;
  const f = await fixture(t, async ({ workspace, signal }) => { runtimeWorkspace = workspace; signal.addEventListener('abort', () => finish.resolve(), { once: true }); started.resolve(); await finish.promise; return { text: 'Fixture completed.' }; });
  await f.api('settings/provider', { apiKey: 'review-fake-key' }, 'PUT');
  const task = await f.api('tasks', { mode: 'live', prompt: 'Review fixture only.' });
  const artifact = await f.api('artifacts', { taskId: task.id, name: 'draft.md', content: 'original' });
  await f.api(`tasks/${task.id}/run`, {});
  await started.promise;
  const completion = f.app.runner.active.get(task.id).promise;
  const edit = await f.request(`artifacts/${artifact.id}`, { content: 'human revision', baseVersion: artifact.version }, 'PUT');
  if (edit.response.status === 409) {
    // Refusing edits while a live process owns the workspace is also a valid boundary.
    finish.resolve(); await completion;
    assert.equal(f.app.store.require('artifacts', artifact.id).content, 'original');
    return;
  }
  assert.equal(edit.response.status, 200);
  // Reproduce a tool writing after the user saved, before the runtime finishes.
  writeFileSync(path.join(runtimeWorkspace, 'draft.md'), 'late model write');
  finish.resolve(); await completion;
  const current = f.app.store.require('artifacts', artifact.id);
  assert.equal(current.content, 'human revision');
  assert.equal(f.app.store.require('tasks', task.id).status, 'failed');
  assert.equal(readFileSync(f.app.store.artifactPath(current), 'utf8'), current.content,
    'the rejected model file must not be left as the input to the next resumed run');
});

test('review: explicitly selected evidence is available to the task, not just a source identifier', async t => {
  let sentPrompt;
  const f = await fixture(t, async ({ prompt }) => { sentPrompt = prompt; return { text: 'Fixture completed.' }; });
  await f.api('settings/provider', { apiKey: 'review-fake-key' }, 'PUT');
  const source = await f.api('sources', { title: 'Evidence fixture', kind: 'note', text: 'I can only attend on Tuesday; Wednesday is unavailable.' });
  const fact = await f.api('facts', { statement: 'Prefer weekday appointments.', status: 'candidate', sourceIds: [source.id] });
  const task = await f.api('tasks', { mode: 'live', prompt: 'Which day can I attend? Check the selected evidence.', contextFactIds: [fact.id] });
  await f.api(`tasks/${task.id}/run`, {});
  const active = f.app.runner.active.get(task.id);
  if (active) await active.promise;
  assert.match(sentPrompt, /Wednesday is unavailable/u, 'the source cannot be retrieved later from the isolated runtime without an evidence channel');
});

test('review: evidence export is selected, bounded, and preserves fictional-source labels', async t => {
  const f = await fixture(t);
  const selected = [];
  for (let index = 0; index < 5; index++) {
    const source = await f.api('sources', { title: `Selected fixture ${index}`, kind: 'note', text: `${index}:` + 'e'.repeat(5000) });
    if (index === 0) { source.demo = true; f.app.store.put('sources', source); }
    selected.push(source.id);
  }
  const unrelated = await f.api('sources', { title: 'Unselected fixture', kind: 'note', text: 'UNSELECTED-PRIVATE-FIXTURE' });
  const evidence = evidenceFor(f.app.store, [{ sourceIds: selected }]);
  assert.ok(evidence.sources.every(source => selected.includes(source.id)));
  assert.ok(!evidence.sources.some(source => source.id === unrelated.id));
  assert.ok(!JSON.stringify(evidence).includes('UNSELECTED-PRIVATE-FIXTURE'));
  assert.equal(evidence.sources[0].demo, true, 'a fictional source must remain labelled after entering model context');
  assert.ok(evidence.sources.every(source => source.excerpt.length <= 3000 && source.truncated));
  assert.ok(evidence.sources.reduce((sum, source) => sum + source.excerpt.length, 0) <= 12000);
  assert.ok(evidence.omittedSourceCount > 0);
});

test('review: source originals cannot be overwritten and fact revisions retain their evidence association', async t => {
  const f = await fixture(t);
  const before = await f.api('sources', { title: 'Original evidence', kind: 'note', text: 'The original words.' });
  const later = await f.api('sources', { title: 'Correction evidence', kind: 'feedback', text: 'The later correction.' });
  const overwrite = await f.request(`sources/${before.id}`, { text: 'Overwritten words.' }, 'PUT');
  assert.equal(overwrite.response.status, 405);
  assert.equal(f.app.store.require('sources', before.id).text, 'The original words.');
  const fact = await f.api('facts', { kind: 'preference', statement: 'First interpretation.', sourceIds: [before.id], status: 'candidate' });
  const corrected = await f.api(`facts/${fact.id}`, { kind: 'constraint', statement: 'Corrected interpretation.', sourceIds: [later.id], status: 'confirmed', reason: 'Explicit correction.', baseVersion: fact.version }, 'PUT');
  assert.equal(corrected.history[0].kind, 'preference');
  assert.deepEqual(corrected.history[0].sourceIds, [before.id]);
  assert.equal(corrected.history.at(-1).kind, 'constraint');
  assert.deepEqual(corrected.history.at(-1).sourceIds, [later.id]);
});

for (const mode of ['demo', 'live']) {
  test(`review: ${mode} automation cannot accumulate a second task while the previous one awaits attention`, async t => {
    const f = await fixture(t);
    const automation = await f.api('automations', { title: 'Fixture schedule', prompt: 'Only run one at a time.', trigger: 'interval', intervalMinutes: 1, enabled: true, mode });
    const first = await f.api(`automations/${automation.id}/run`, {});
    assert.equal(first.status, mode === 'demo' ? 'awaiting_approval' : 'needs_input');
    const repeated = await f.request(`automations/${automation.id}/run`, {});
    assert.equal(repeated.response.status, 409);
    const current = f.app.store.require('automations', automation.id);
    f.app.store.put('automations', { ...current, nextRunAt: '2020-01-01T00:00:00.000Z' });
    f.app.runner.tick();
    assert.equal(f.app.store.list('tasks').length, 1, 'timer must not silently create a second pending task');
    assert.ok(new Date(f.app.store.require('automations', automation.id).nextRunAt).getTime() > Date.now());
  });
}

for (const endState of ['failed', 'cancelled']) {
  test(`review: files written before a ${endState} run remain inspectable without marking the task completed`, async t => {
    const f = await fixture(t, async ({ workspace, signal }) => {
      writeFileSync(path.join(workspace, 'partial.md'), 'Partial work, not a completed deliverable.');
      if (endState === 'failed') throw new Error('Deliberate fixture failure.');
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Fixture cancelled.'), { name: 'AbortError' })), { once: true }));
      return { text: 'unreachable' };
    });
    await f.api('settings/provider', { apiKey: 'review-fake-key' }, 'PUT');
    const task = await f.api('tasks', { mode: 'live', prompt: 'Fixture partial recovery.' });
    await f.api(`tasks/${task.id}/run`, {});
    if (endState === 'cancelled') await f.api(`tasks/${task.id}/cancel`, {});
    const active = f.app.runner.active.get(task.id); if (active) await active.promise;
    const ended = f.app.store.require('tasks', task.id);
    assert.equal(ended.status, endState);
    const partial = f.app.store.list('artifacts').find(a => a.taskId === task.id && a.name === 'partial.md');
    assert.ok(partial, 'the local file needs an inspectable recovery entry');
    assert.equal(partial.content, 'Partial work, not a completed deliverable.');
    assert.equal(partial.reviewStatus, 'pending');
    assert.ok(ended.events.some(event => event.type === 'artifact_pending'));
    assert.ok(ended.artifactIds.includes(partial.id));
  });
}
