import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store.mjs';
import { LibraryService } from '../server/library.mjs';
import { ConnectorService, saveConnector } from '../server/connectors.mjs';

function fixture(t) {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'secondu-library-search-')));
  const store = new Store(path.join(directory, 'data'), { seed: false });
  const cleanup = [];
  t.after(async () => { for (const close of cleanup.reverse()) await close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, directory, cleanup };
}

async function harness(f, library) {
  const service = new ConnectorService(f.store, { library }); f.cleanup.push(() => service.close());
  const connector = saveConnector(f.store, { kind: 'library', name: 'Fictional search fixture' });
  const prepared = await service.prepare([connector.id]);
  const search = prepared.definitions.find(tool => tool.description.includes('/ search.'));
  const raw = args => prepared.call({ tool: search.name, arguments: args });
  return {
    definition: search,
    raw,
    async search(args) {
      const reply = await raw(args); assert.equal(reply.success, true, reply.contentItems[0].text);
      assert.ok(reply.contentItems[0].text.length <= 48000);
      const result = JSON.parse(reply.contentItems[0].text).result;
      assert.equal(result.count, result.items.length);
      assert.ok(result.count <= 30);
      return result;
    },
  };
}

function record(store, n, { text = '虚构记录：周末一起读书。', title = `Fictional note ${n}` } = {}) {
  const source = n % 2 === 0;
  return store.put(source ? 'sources' : 'artifacts', { id: `fixture-${n}`, ...(source ? { title, text } : { name: title, content: text }) });
}

test('all 35 saved records are reachable without repeats; cursor excludes later inserts', async t => {
  const f = fixture(t);
  for (let n = 0; n < 35; n++) record(f.store, n);
  const before = JSON.stringify([f.store.list('sources'), f.store.list('artifacts')]);
  const h = await harness(f);
  assert.ok(h.definition.inputSchema.properties.cursor);
  const first = await h.search({ query: '读书' });
  assert.equal(first.items.length, 18); assert.equal(first.nextOffset, 18); assert.equal(first.truncated, true);
  assert.equal(first.coverage.records.exhausted, false);
  record(f.store, 99);
  const second = await h.search({ query: '读书', cursor: first.nextCursor });
  assert.equal(second.items.length, 17); assert.equal(second.nextOffset, null); assert.equal(second.nextCursor, null);
  assert.equal(second.coverage.records.exhausted, true); assert.equal(second.truncated, false);
  const ids = [...first.items, ...second.items].map(item => item.id);
  assert.equal(new Set(ids).size, 35); assert.ok(!ids.includes('fixture-99'));
  assert.deepEqual(ids, Array.from({ length: 35 }, (_, n) => `fixture-${34 - n}`));
  const unchanged = JSON.stringify([f.store.list('sources').filter(item => item.id !== 'fixture-99'), f.store.list('artifacts').filter(item => item.id !== 'fixture-99')]);
  assert.equal(unchanged, before);
  assert.equal((await h.search({ query: '读书' })).items[0].id, 'fixture-99');
});

test('every alternative searches saved sources and artifacts and positions excerpts around the matching term', async t => {
  const f = fixture(t);
  record(f.store, 0, { text: '虚构前文。'.repeat(100) + '金色企鹅约在周末散步。' });
  record(f.store, 1, { text: '虚构另一份成果：蓝色海豚。' });
  record(f.store, 2, { text: '虚构无关键词正文。', title: '金色企鹅的计划' });
  const h = await harness(f);
  const result = await h.search({ query: '蓝色海豚', queries: ['没有这组词', '金色企鹅'] });
  assert.deepEqual(new Set(result.items.map(item => item.id)), new Set(['fixture-0', 'fixture-1', 'fixture-2']));
  const tail = result.items.find(item => item.id === 'fixture-0');
  assert.match(tail.excerpt, /金色企鹅/); assert.ok(tail.offset > 300);
  assert.equal((await h.search({ queries: ['没有这组词', '金色企鹅'] })).items.length, 2);
});

test('numeric offsets paginate unchanged data and counts remain page counts', async t => {
  const f = fixture(t); for (let n = 0; n < 35; n++) record(f.store, n);
  const h = await harness(f), first = await h.search({ query: '读书', pageSize: 20 });
  const second = await h.search({ query: '读书', pageSize: 20, offset: first.nextOffset });
  assert.equal(first.count, 20); assert.equal(second.count, 15);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 35);
  assert.equal(second.nextCursor, null);
});

test('filtered credential records cannot hide later safe records or leak content', async t => {
  const f = fixture(t);
  record(f.store, 0, { text: '虚构材料 searchable 可读取记录。' });
  record(f.store, 1, { text: 'searchable api_key="fixture-credential-secret"' });
  record(f.store, 2, { text: 'searchable harmless body', title: 'password="fictional-title-secret"' });
  const h = await harness(f), first = await h.search({ query: 'searchable', pageSize: 2 });
  assert.equal(first.count, 0); assert.equal(first.nextOffset, 2); assert.ok(first.nextCursor);
  assert.equal(first.coverage.records.excluded, 2);
  assert.equal(first.coverage.records.exhausted, false);
  assert.equal(first.coverage.documents.exhaustive, false);
  assert.doesNotMatch(JSON.stringify(first), /fixture-credential-secret|fictional-title-secret/);
  const second = await h.search({ query: 'searchable', pageSize: 2, cursor: first.nextCursor });
  assert.equal(second.count, 1); assert.equal(second.items[0].id, 'fixture-0'); assert.equal(second.nextCursor, null);
});

test('cursor is tied to queries and space; invalid parameters fail before searching', async t => {
  const f = fixture(t); for (let n = 0; n < 3; n++) record(f.store, n);
  const h = await harness(f), first = await h.search({ queries: ['读书', '周末'], pageSize: 1 });
  assert.equal((await h.search({ queries: ['周末', '读书'], cursor: first.nextCursor })).count, 2);
  for (const args of [
    { query: 'other', cursor: first.nextCursor }, { query: '读书', cursor: 'broken' },
    { query: '读书', cursor: first.nextCursor, offset: 1 }, { pageSize: 0 }, { offset: -1 },
    { queries: [] }, { queries: ['x', 2] }, { query: 'e', queries: ['a', 'b', 'c', 'd'] },
  ]) assert.equal((await h.raw(args)).success, false, JSON.stringify(args));
  const other = await harness(fixture(t));
  assert.equal((await other.raw({ queries: ['读书', '周末'], cursor: first.nextCursor })).success, false);
});

test('mixed indexed excerpts and saved records share a bounded response while every saved match remains reachable', async t => {
  const f = fixture(t);
  for (let n = 0; n < 35; n++) record(f.store, n, { title: '\u0001'.repeat(300), text: 'fixtureterm ' + '\u0001'.repeat(500) });
  let searched = 0;
  const library = { search({ queries, pageSize }) {
    searched++; assert.deepEqual(queries, ['fixtureterm']); assert.equal(pageSize, 12);
    return { items: Array.from({ length: 12 }, (_, n) => ({ id: `document_${n}`, name: 'Fictional large excerpt', revision: 'fixture-revision', ordinal: 0, excerpt: 'fixtureterm ' + '\\"'.repeat(1600), citation: `document_${n}@fixture-revision#0` })) };
  } };
  const h = await harness(f, library);
  let page = await h.search({ query: 'fixtureterm' }), pages = 0;
  const ids = [];
  assert.ok(page.coverage.documents.count > 0); assert.ok(page.coverage.documents.omitted > 0);
  assert.ok(page.coverage.records.count > 0); assert.ok(page.coverage.records.count < 18);
  while (true) {
    pages++; assert.ok(pages < 20); assert.equal(page.coverage.documents.exhaustive, false);
    ids.push(...page.items.filter(item => item.kind !== 'document').map(item => item.id));
    if (!page.nextCursor) break;
    page = await h.search({ query: 'fixtureterm', cursor: page.nextCursor });
    assert.equal(page.coverage.documents.searched, false); assert.equal(page.coverage.documents.count, 0);
  }
  assert.equal(searched, 1); assert.equal(ids.length, 35); assert.equal(new Set(ids).size, 35);
});

test('real folder index and legacy records both honor a later matching alternative', async t => {
  const f = fixture(t), files = path.join(f.directory, 'fictional'); mkdirSync(files);
  writeFileSync(path.join(files, 'note.txt'), '虚构材料：银色松鼠参加周末讨论。');
  const library = new LibraryService(f.store, { automatic: false }); f.cleanup.push(() => library.close());
  await library.register({ path: files }); await library.settled();
  record(f.store, 0, { text: '虚构来源：银色松鼠计划。' });
  const h = await harness(f, library), result = await h.search({ queries: ['不存在的开头', '银色松鼠'] });
  assert.deepEqual(new Set(result.items.map(item => item.kind)), new Set(['source', 'document']));
  assert.equal(result.coverage.documents.searched, true); assert.equal(result.coverage.documents.exhaustive, false);
  assert.equal(result.coverage.records.exhausted, true);
  assert.ok(result.items.find(item => item.kind === 'document').revision);
});
