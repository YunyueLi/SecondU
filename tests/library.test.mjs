import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipSync, strToU8 } from 'fflate';
import { Store } from '../server/store.mjs';
import { LibraryService } from '../server/library.mjs';
import { parseLibraryFile } from '../server/library-parser.mjs';

async function fixture(t, options = {}) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'secondu-library-')));
  const files = path.join(directory, 'Fictional materials'); await mkdir(files);
  const store = new Store(path.join(directory, 'data'), { seed: false });
  const library = new LibraryService(store, { automatic: false, ...options });
  t.after(async () => { if (!library.closed) await library.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, files, store, library };
}

test('folder ingestion, Chinese search, immutable versions, deduplication and missing originals', async t => {
  const { library, files } = await fixture(t);
  await mkdir(path.join(files, '项目甲'));
  await writeFile(path.join(files, '项目甲', '决定.md'), ['虚构材料', '2026-10-01 林宁：计划周五交付。', '2026-10-03 林宁：周五交付取消，等待预算确认。'].join('\n'));
  const root = await library.register({ path: files }); await library.settled();
  assert.equal(library.lastError, undefined);
  assert.equal(library.roots()[0].status, 'idle');
  const first = library.list({ rootId: root.id }); assert.equal(first.total, 1);
  const doc = first.items[0], revision = doc.revision;
  const result = library.search({ query: '周五交付取消' });
  assert.equal(result.items[0].id, doc.id); assert.match(result.items[0].excerpt, /取消/);
  assert.equal(library.search({ query: '林' }).items[0].id, doc.id);
  await writeFile(path.join(files, '项目甲', '决定.md'), '虚构材料\n2026-10-04 林宁：预算确认，改为周一交付。');
  library.action(root.id, 'scan'); await library.settled();
  assert.notEqual(library.read(doc.id).revision, revision);
  assert.match(library.read(doc.id, { revision }).items[0].text, /周五交付取消/);
  await writeFile(path.join(files, '副本.md'), await readFile(path.join(files, '项目甲', '决定.md')));
  library.action(root.id, 'scan'); await library.settled();
  assert.equal(library.list().total, 2);
  assert.equal(library.db.prepare('SELECT count(*) n FROM revisions').get().n, 2);
  await rm(path.join(files, '项目甲', '决定.md'));
  library.action(root.id, 'scan'); await library.settled();
  assert.equal(library.read(doc.id).document.available, false);
  assert.match(library.read(doc.id, { revision }).items[0].text, /取消/);
});

test('paused queue survives restart and does not require retaining full bodies in Store', async t => {
  const { library, files, store } = await fixture(t);
  for (let i = 0; i < 120; i++) await writeFile(path.join(files, `虚构-${i}.txt`), `虚构材料 ${i}，海边散步。`);
  const root = await library.register({ path: files }); library.action(root.id, 'pause'); await library.settled();
  assert.equal(library.roots()[0].status, 'paused'); await library.close();
  const resumed = new LibraryService(store, { automatic: false });
  try {
    assert.equal(resumed.roots()[0].status, 'paused'); resumed.action(root.id, 'resume'); await resumed.settled();
    assert.equal(resumed.lastError, undefined); assert.equal(resumed.list().total, 120);
    assert.equal(resumed.list().items.length, 40); assert.equal(resumed.list({ offset: 80 }).nextOffset, null);
    assert.equal(store.list('sources').length, 0);
  } finally { await resumed.close(); }
});

test('failed refresh retains last good evidence and retry advances only after successful parsing', async t => {
  let fail = false;
  const { library, files } = await fixture(t, { parse: async (name, bytes) => { if (fail) throw new Error('parser failed'); return parseLibraryFile(name, bytes); } });
  await writeFile(path.join(files, '记录.txt'), '虚构材料：第一版仍有效。');
  const root = await library.register({ path: files }); await library.settled(); const doc = library.list().items[0];
  fail = true; await writeFile(path.join(files, '记录.txt'), '虚构材料：第二版需要重新确认。');
  library.action(root.id, 'scan'); await library.settled();
  assert.equal(library.roots()[0].status, 'error'); assert.equal(library.read(doc.id).revision, doc.revision);
  assert.equal(library.list().items[0].status, 'error');
  fail = false; library.action(root.id, 'retry'); await library.settled();
  assert.equal(library.roots()[0].status, 'idle'); assert.notEqual(library.read(doc.id).revision, doc.revision);
});

test('symlinks, credentials and app data are excluded; partial directory failure does not mark everything deleted', async t => {
  const { library, files, store, directory } = await fixture(t);
  await writeFile(path.join(directory, 'outside.txt'), 'fictional outside');
  await symlink(path.join(directory, 'outside.txt'), path.join(files, 'alias.txt'));
  await writeFile(path.join(files, '.env'), 'fictional private');
  await writeFile(path.join(files, 'credentials.json'), '{}');
  await writeFile(path.join(files, 'safe.txt'), '虚构材料：可读取。');
  const root = await library.register({ path: files }); await library.settled(); assert.equal(library.list().total, 1);
  await assert.rejects(library.register({ path: store.directory }), /请选择具体/);
  await rename(files, files + '-moved'); library.action(root.id, 'scan'); await library.settled();
  assert.equal(library.roots()[0].status, 'error'); assert.equal(library.list().items[0].available, true);
  assert.throws(() => library.read(library.list().items[0].id, { revision: 'unowned-version' }), /没有这个版本/);
});

test('DOCX body, table cells and notes are local text; unsupported formats are not falsely indexed', async () => {
  const bytes = zipSync(Object.fromEntries(Object.entries({
    '[Content_Types].xml': '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>虚构文档标题</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>预算</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>100 元</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    'word/footnotes.xml': '<w:footnotes><w:p><w:r><w:t>虚构脚注</w:t></w:r></w:p></w:footnotes>',
  }).map(([name, value]) => [name, strToU8(value)])));
  const parsed = await parseLibraryFile('fiction.docx', bytes);
  assert.equal(parsed.status, 'ready'); assert.match(parsed.chunks[0].text, /预算[\s\S]*100 元/); assert.match(parsed.chunks[1].text, /虚构脚注/);
  assert.equal((await parseLibraryFile('voice.mp3', new Uint8Array())).status, 'original_only');
  assert.equal((await parseLibraryFile('bad.txt', new Uint8Array([0xff]))).status, 'needs_attention');
});

test('PDF extraction visits the last page and reports pages with no text', async () => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 6 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['Fictional first page', 'Fictional last page cancellation'].map(text => { const data = `BT /F1 12 Tf 10 200 Td (${text}) Tj ET`; return `<< /Length ${data.length} >>\nstream\n${data}\nendstream`; }),
  ];
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await parseLibraryFile('fictional.pdf', Buffer.from(pdf));
  assert.equal(result.pages, 3); assert.match(result.detail, /1 页未提取到文字/);
  assert.equal(result.chunks.at(-1).location, '第 3 页'); assert.match(result.chunks.at(-1).text, /last page cancellation/);
});

test('shutdown during parsing leaves a recoverable pending item', async t => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const block = new Promise(resolve => { release = resolve; });
  const { library, files, store } = await fixture(t, { parse: async (name, bytes) => { started(); await block; return parseLibraryFile(name, bytes); } });
  await writeFile(path.join(files, 'slow.txt'), 'Fictional delayed parsing record');
  await library.register({ path: files }); await ready;
  const closing = library.close(); release(); await closing;
  const restarted = new LibraryService(store, { automatic: false });
  try { restarted.kick(); await restarted.settled(); assert.equal(restarted.list().items[0].status, 'ready'); assert.equal(restarted.search({ query: 'delayed' }).items.length, 1); }
  finally { await restarted.close(); }
});
