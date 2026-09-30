import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { createEntity, assertDeletable } from '../server/domain.mjs';
import { saveAttachment, getAttachment } from '../server/attachments.mjs';
import { createApp } from '../server/index.mjs';
import { timelineFeed } from '../shared/timeline-feed.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const image = { name: 'fictional-pixel.png', mime: 'image/png', data: png };
const event = { title: '虚构周末片段', date: '2026-09-30', description: '仅用于本地验收。', scope: 'note', category: 'life', platform: 'photos', location: '示例公园', personIds: [], sourceIds: [] };

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'hither-timeline-'));
  const store = new Store(directory, { seed: false });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, directory };
}

test('timeline photo edits persist order and can remove links without deleting the original', t => {
  const { store, directory } = fixture(t);
  const first = saveAttachment(store, image), second = saveAttachment(store, { ...image, name: 'second.png' });
  const saved = store.put('events', createEntity(store, 'events', { ...event, attachmentIds: [second.id, first.id] }));
  assert.deepEqual(saved.attachmentIds, [second.id, first.id]);
  assert.throws(() => assertDeletable(store, 'attachments', first.id), error => error.code === 'record_in_use');
  const reopened = new Store(directory, { seed: false });
  assert.deepEqual(reopened.require('events', saved.id), saved);
  assert.deepEqual(getAttachment(reopened, second.id).data, Buffer.from(png, 'base64'));
  reopened.close();
  const revised = store.put('events', createEntity(store, 'events', { attachmentIds: [first.id], location: '' }, saved));
  assert.deepEqual(revised.attachmentIds, [first.id]);
  assert.equal(revised.platform, 'photos');
  assert.equal(revised.location, undefined);
  assert.equal(getAttachment(store, second.id).name, 'second.png');
  assert.doesNotThrow(() => assertDeletable(store, 'attachments', second.id));
});

test('timeline photos enforce image type, space, file integrity, and bounded metadata', t => {
  const { store, directory } = fixture(t);
  const photo = saveAttachment(store, image), text = saveAttachment(store, { name: 'record.txt', mime: 'text/plain', data: Buffer.from('Synthetic note').toString('base64') });
  assert.throws(() => createEntity(store, 'events', { ...event, attachmentIds: [text.id] }), error => error.code === 'invalid_timeline_image');
  assert.throws(() => createEntity(store, 'events', { ...event, attachmentIds: Array(10).fill(photo.id) }), error => error.code === 'invalid_timeline_images');
  assert.throws(() => createEntity(store, 'events', { ...event, platform: 'https://unknown.example' }), error => error.code === 'invalid_timeline_platform');
  assert.throws(() => createEntity(store, 'events', { ...event, location: 'a'.repeat(301) }), error => error.code === 'invalid_timeline_location');
  const otherDirectory = mkdtempSync(path.join(os.tmpdir(), 'hither-timeline-other-'));
  const other = new Store(otherDirectory, { seed: false });
  try { assert.throws(() => createEntity(other, 'events', { ...event, attachmentIds: [photo.id] }), error => error.status === 404); }
  finally { other.close(); rmSync(otherDirectory, { recursive: true, force: true }); }
  writeFileSync(path.join(directory, 'attachments', `${photo.id}.bin`), 'changed');
  assert.throws(() => createEntity(store, 'events', { ...event, attachmentIds: [photo.id] }), error => error.code === 'attachment_changed');
});

test('the combined feed preserves provenance, partial dates and deduplicates manual activities', () => {
  const photo = { id: 'photo-1', name: 'fixture.png', kind: 'image', url: '/api/attachments/photo-1' };
  const items = timelineFeed({
    sources: [{ id: 'source-1', demo: true, import: { platform: 'wechat' } }], attachments: [photo],
    events: [{ ...event, id: 'event-1', attachmentIds: [photo.id], platform: undefined, sourceIds: ['source-1'] }, { ...event, id: 'event-2', date: '2024', scope: 'milestone', attachmentIds: [] }],
    dailyActivities: [{ id: 'activity-note', lifeEventId: 'event-1', kind: 'manual', date: '2026-09-30', title: 'duplicate', sourceIds: [] }, { id: 'external-1', kind: 'import', title: 'Saved note', summary: 'Original excerpt', date: '2026-09-29', app: 'Instagram', sourceIds: ['source-1'] }],
  });
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(item => item.id), ['event:event-1', 'activity:external-1', 'event:event-2']);
  assert.equal(items[0].platform, 'wechat'); assert.equal(items[0].origin, 'source'); assert.equal(items[0].demo, true);
  assert.deepEqual(items[0].attachments, [photo]); assert.equal(items[1].origin, 'import'); assert.equal(items[1].platform, 'instagram');
  assert.equal(items[2].date, '2024'); assert.equal(items[2].scope, 'milestone');
});

test('event and attachment API round trip survives server reopen without embedding image bytes in bootstrap', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'hither-timeline-api-'));
  let app;
  t.after(async () => { if (app) await app.close(); rmSync(directory, { recursive: true, force: true }); });
  async function open() { app = createApp({ dataDir: directory, seed: false, scheduler: false, computerInfo: { codexAvailable: false } }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${app.server.address().port}/api`; }
  let base = await open();
  async function request(route, body, method = 'POST') { const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const value = await res.json(); assert.ok(res.ok, JSON.stringify(value)); return value; }
  const photo = await request('/attachments', image);
  const saved = await request('/events', { ...event, attachmentIds: [photo.id] });
  await app.close(); app = undefined; base = await open();
  const bootstrap = await request('/bootstrap', undefined, 'GET');
  assert.deepEqual(bootstrap.events.find(item => item.id === saved.id).attachmentIds, [photo.id]);
  assert.equal(bootstrap.attachments.find(item => item.id === photo.id).kind, 'image');
  assert.doesNotMatch(JSON.stringify(bootstrap.attachments), /base64|sha256|\.bin/);
  const bytes = await fetch(base + `/attachments/${photo.id}`); assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), Buffer.from(png, 'base64'));
  const revised = await request(`/events/${saved.id}`, { ...event, title: '修改后的虚构片段', attachmentIds: [] }, 'PUT');
  assert.deepEqual(revised.attachmentIds, []);
  assert.equal((await fetch(base + `/attachments/${photo.id}`)).status, 200);
});
