import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';

async function fixture(t, executionPolicy) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-room-reactions-'));
  let app, executions = 0;
  const start = async () => {
    app = createApp({ dataDir: directory, seed: false, scheduler: false, executionPolicy, computerInfo: { codexAvailable: false }, runCodex: async () => { executions += 1; } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  };
  await start();
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const api = async (route, body, method = body === undefined ? 'GET' : 'PUT') => {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  };
  const room = (id = 'room-fixture', mode = 'live') => {
    const stamp = '2026-09-30T00:00:00.000Z';
    return app.store.put('agentRooms', { id, title: 'Synthetic conversation', kind: 'direct', agentIds: [], mode, createdAt: stamp, updatedAt: stamp, taskIds: [], messages: ['user', 'assistant', 'system'].map(role => ({ id: `${id}-${role}`, role, content: `Synthetic ${role} message`, createdAt: stamp })) });
  };
  return { get app() { return app; }, get executions() { return executions; }, api, room, restart: async () => { await app.close(); await start(); } };
}

test('message reactions add, persist, coexist, and revoke idempotently without changing messages or starting tasks', async t => {
  const f = await fixture(t), room = f.room(), message = room.messages[1], route = `agent-rooms/${room.id}/reactions`;
  const counts = ['tasks', 'facts', 'sources', 'taskFeedback'].map(name => f.app.store.list(name).length);
  let response = await f.api(route, { messageId: message.id, emoji: '👍', active: true });
  assert.equal(response.status, 200);
  assert.deepEqual(response.value.reactions.map(({ emoji, actor }) => ({ emoji, actor })), [{ emoji: '👍', actor: 'self' }]);
  const afterFirst = f.app.store.require('agentRooms', room.id);
  response = await f.api(route, { messageId: message.id, emoji: '👍', active: true });
  assert.equal(response.status, 200);
  assert.deepEqual(f.app.store.require('agentRooms', room.id), afterFirst);
  await Promise.all(['❤️', '🙌'].map(emoji => f.api(route, { messageId: message.id, emoji, active: true })));
  assert.equal(f.app.store.require('agentRooms', room.id).messages[1].reactions.length, 3);
  // A later message and unrelated fields must survive a reaction write.
  const latest = f.app.store.require('agentRooms', room.id);
  latest.title = 'Updated title'; latest.messages.push({ id: 'later-message', role: 'assistant', content: 'Later synthetic message', createdAt: latest.updatedAt });
  f.app.store.put('agentRooms', latest);
  response = await f.api(route, { messageId: message.id, emoji: '👍', active: false });
  assert.equal(response.value.reactions.length, 2);
  await f.restart();
  const reopened = (await f.api(`agent-rooms/${room.id}`)).value;
  assert.equal(reopened.title, 'Updated title');
  assert.equal(reopened.messages.at(-1).id, 'later-message');
  assert.deepEqual({ ...reopened.messages[1], reactions: undefined }, { ...message, reactions: undefined });
  assert.deepEqual(reopened.messages[1].reactions, response.value.reactions);
  for (const emoji of ['❤️', '🙌']) assert.equal((await f.api(route, { messageId: message.id, emoji, active: false })).status, 200);
  const cleared = f.app.store.require('agentRooms', room.id);
  assert.equal(cleared.messages[1].reactions, undefined);
  await f.api(route, { messageId: message.id, emoji: '🙌', active: false });
  assert.deepEqual(f.app.store.require('agentRooms', room.id), cleared);
  assert.equal((await f.api(route, { messageId: room.messages[0].id, emoji: '😂', active: true })).status, 200);
  assert.deepEqual(['tasks', 'facts', 'sources', 'taskFeedback'].map(name => f.app.store.list(name).length), counts);
  assert.equal(f.executions, 0);
});

test('invalid reactions, forged actors, system messages, and other-room messages are rejected without mutation', async t => {
  const f = await fixture(t), room = f.room(), other = f.room('room-other'), message = room.messages[1], route = `agent-rooms/${room.id}/reactions`;
  const valid = { messageId: message.id, emoji: '👍', active: true };
  for (const body of [null, [], {}, { ...valid, active: 1 }, { ...valid, active: 'true' }, { ...valid, emoji: 'unsupported' }, { ...valid, messageId: 3 }, { ...valid, messageId: 'x'.repeat(201) }, { ...valid, messageId: other.messages[1].id }, { ...valid, messageId: room.messages[2].id }, { ...valid, actor: 'agent' }, { ...valid, value: 'up' }]) {
    const result = await f.api(route, body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.deepEqual(f.app.store.require('agentRooms', room.id), room);
  }
  assert.equal((await f.api('agent-rooms/missing/reactions', valid)).status, 404);
  assert.equal((await f.api(`${route}/extra`, valid)).status, 405);
  assert.equal((await f.api(route, valid, 'POST')).status, 405);
});

test('reactions remain isolated between workspaces and work in editable fictional examples without execution', async t => {
  const f = await fixture(t), original = f.room(), originalRoute = `agent-rooms/${original.id}/reactions`;
  assert.equal((await f.api('spaces/demo-engineer-v4', {}, 'POST')).status, 200);
  const prefix = 'spaces/demo-engineer-v4/';
  const before = (await f.api(`${prefix}bootstrap`)).value;
  const demoRoom = before.agentRooms.find(room => room.messages.some(message => message.role === 'assistant'));
  assert.ok(demoRoom);
  const demoMessage = demoRoom.messages.find(message => message.role === 'assistant');
  const body = { messageId: demoMessage.id, emoji: '😮', active: true };
  assert.equal((await f.api(`agent-rooms/${demoRoom.id}/reactions`, body)).status, 404);
  assert.equal((await f.api(prefix + originalRoute, { messageId: original.messages[1].id, emoji: '👍', active: true })).status, 404);
  assert.equal((await f.api(prefix + `agent-rooms/${demoRoom.id}/reactions`, body)).status, 200);
  const after = (await f.api(`${prefix}bootstrap`)).value;
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.facts, before.facts);
  assert.deepEqual(after.sources, before.sources);
  assert.deepEqual(f.app.store.require('agentRooms', original.id), original);
  await f.restart();
  const saved = (await f.api(`${prefix}agent-rooms/${demoRoom.id}`)).value.messages.find(message => message.id === demoMessage.id);
  assert.equal(saved.reactions[0].emoji, '😮');
  assert.equal(f.executions, 0);
});
