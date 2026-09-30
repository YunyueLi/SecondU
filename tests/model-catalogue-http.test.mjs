import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';

test('model discovery reaches both draft and saved connection routes in the personal space', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-catalogue-http-'));
  const requests = [];
  const app = createApp({ dataDir: directory, seed: false, scheduler: false, computerInfo: { codexAvailable: false }, modelFetch: async (url, options) => {
    requests.push({ url, credential: options.headers.Authorization });
    return Response.json({ data: [{ id: 'fixture-chat', name: 'Fixture chat' }] });
  }});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const api = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await api('spaces/personal', {})).status, 200);
  const prefix = 'spaces/personal/';
  const missing = await api(prefix + 'model-catalogue', { provider: 'deepseek' });
  assert.equal(missing.status, 409);
  assert.equal(missing.data.code, 'key_required');
  assert.equal(requests.length, 0);
  const draft = await api(prefix + 'model-catalogue', { provider: 'deepseek', apiKey: 'synthetic-draft' });
  assert.equal(draft.status, 200);
  assert.deepEqual(draft.data.models, [{ id: 'fixture-chat', name: 'Fixture chat' }]);
  const connection = await api(prefix + 'model-connections', { name: 'Local fixture', provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'fixture-chat', api: 'chat_completions', reasoningEffort: 'medium', apiKey: 'synthetic-saved' });
  assert.equal(connection.status, 201);
  assert.equal((await api(`${prefix}model-connections/${connection.data.id}/models`)).status, 200);
  assert.deepEqual(requests, [
    { url: 'https://api.deepseek.com/v1/models', credential: 'Bearer synthetic-draft' },
    { url: 'https://api.deepseek.com/v1/models', credential: 'Bearer synthetic-saved' },
  ]);
  const bootstrap = await api(prefix + 'bootstrap');
  assert.doesNotMatch(JSON.stringify(bootstrap), /synthetic-(draft|saved)/);
  assert.equal(app.store.connectionList().length, 1);
  assert.equal(app.store.settings().hasKey, false);
});
