import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, symlink, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { saveAttachment } from '../server/attachments.mjs';
import { LibraryService } from '../server/library.mjs';
import { parseLibraryFile } from '../server/library-parser.mjs';

async function fixture(t, options = {}) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'secondu-legacy-fiction-')));
  const store = new Store(directory, { seed: false });
  const library = new LibraryService(store, { automatic: false, ...options });
  t.after(async () => { if (!library.closed) await library.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  const attachment = (name, text, mime = 'text/plain') => saveAttachment(store, { name, mime, data: Buffer.from(text).toString('base64') });
  const source = (id, ids) => store.put('sources', { id, title: `虚构来源 ${id}`, text: '保留旧摘要和引用', kind: 'document', attachmentIds: ids });
  const file = id => path.join(directory, 'attachments', `${id}.bin`);
  return { directory, store, library, attachment, source, file };
}

test('referenced originals become full searchable documents without reimport or changing sources', async t => {
  const { store, library, attachment, source, file, directory } = await fixture(t);
  const fullText = '虚构内容：定期散步。\n'.repeat(45000) + '\n最后一行：雪鹭项目最终定为周二交付。';
  const saved = attachment('虚构完整历史.txt', fullText);
  const orphan = attachment('未被来源引用.txt', 'OrphanNeedleUnique 不应索引。');
  source('source-a', [saved.id]); source('source-b', [saved.id]);
  store.put('facts', { id: 'fact-a', sourceIds: ['source-a'], text: '既有引用保持不变' });
  const before = JSON.stringify({ sources: store.list('sources'), facts: store.list('facts'), attachments: store.list('attachments') });
  assert.equal(library.existingAttachmentsStatus().enabled, false);
  assert.equal(library.roots().length, 0);
  assert.equal(library.enumerateExistingAttachments().total, 1);
  library.scanExistingAttachments(); await library.settled();
  assert.equal(library.lastError, undefined);
  const status = library.existingAttachmentsStatus();
  assert.equal(status.status, 'idle'); assert.equal(status.counts.indexed, 1); assert.equal(status.references, 2);
  const entry = library.enumerateExistingAttachments({ sourceId: 'source-a' }).items[0];
  assert.match(entry.documentId, /^document_attachment_/);
  assert.deepEqual(entry.sourceIds, ['source-a', 'source-b']);
  assert.equal(library.list({ rootId: status.rootId, direct: true }).total, 1);
  assert.equal(library.list({ rootId: status.rootId, direct: true }).items.length, 1);
  assert.equal(library.roots()[0].path, ''); assert.equal(library.roots()[0].kind, 'saved_attachments');
  assert.equal(library.search({ query: '雪鹭项目' }).items[0].id, entry.documentId);
  assert.equal(library.search({ query: 'OrphanNeedleUnique' }).items.length, 0);
  const text = []; let offset = 0;
  do { const page = library.read(entry.documentId, { offset, pageSize: 8 }); text.push(...page.items.map(item => item.text)); offset = page.nextOffset; } while (offset !== null);
  assert.match(text.at(-1), /周二交付/); assert.ok(text.join('').length > 200000);
  const original = await library.original(entry.documentId);
  assert.equal((await original.handle.readFile()).toString(), fullText); await original.handle.close();
  assert.equal(JSON.stringify({ sources: store.list('sources'), facts: store.list('facts'), attachments: store.list('attachments') }), before);
  assert.equal((await readFile(file(saved.id))).toString(), fullText);
  await assert.rejects(readFile(path.join(directory, 'library-objects', 'anything')), { code: 'ENOENT' });
  assert.equal(library.enumerateExistingAttachments().items.some(item => item.attachmentId === orphan.id), false);
  assert.equal(library.read(entry.documentId).document.origins.length, 2);
  await assert.rejects(library.safePath(library.root(status.rootId), saved.id), /只可按资料引用读取/);
});

test('same content reuses a parsed revision; attachment identity and source attribution stay distinct', async t => {
  let parses = 0;
  const { library, attachment, source } = await fixture(t, { parse: async (...args) => { parses++; return parseLibraryFile(...args); } });
  const first = attachment('同名.txt', '虚构同一正文，阅读原件。'), second = attachment('同名.txt', '虚构同一正文，阅读原件。');
  source('source-first', [first.id]); source('source-second', [second.id]);
  library.scanExistingAttachments(); await library.settled();
  const items = library.enumerateExistingAttachments().items;
  assert.equal(items.length, 2); assert.notEqual(items[0].documentId, items[1].documentId);
  assert.equal(items[0].revision, items[1].revision); assert.equal(parses, 1);
  library.scanExistingAttachments(); await library.settled(); assert.equal(parses, 1);
  assert.equal(library.db.prepare('SELECT count(*) AS n FROM revisions').get().n, 1);
});

test('pause and restart resume the persistent queue with at most one parser', async t => {
  let running = 0, maximum = 0;
  const { library, store, attachment, source } = await fixture(t, { canRun: () => false });
  for (let i = 0; i < 70; i++) source(`source-${i}`, [attachment(`虚构-${i}.txt`, `虚构分段 ${i}，按序处理。`).id]);
  library.scanExistingAttachments(); library.action('saved_attachments', 'pause'); await library.close();
  const resumed = new LibraryService(store, { automatic: false, parse: async (...args) => {
    running++; maximum = Math.max(maximum, running);
    try { return await parseLibraryFile(...args); } finally { running--; }
  } });
  try {
    assert.equal(resumed.existingAttachmentsStatus().status, 'paused');
    resumed.action('saved_attachments', 'resume'); await resumed.settled();
    assert.equal(resumed.lastError, undefined); assert.equal(resumed.existingAttachmentsStatus().counts.indexed, 70); assert.equal(maximum, 1);
    assert.equal(resumed.enumerateExistingAttachments({ pageSize: 50 }).nextOffset, 50);
    assert.equal(resumed.enumerateExistingAttachments({ offset: 50 }).items.length, 20);
  } finally { await resumed.close(); }
});

test('corrupt original fails verification, remains visible, and retries without changing old evidence', async t => {
  const { library, attachment, source, file } = await fixture(t);
  const saved = attachment('虚构核验.txt', '虚构甲版'); source('source-a', [saved.id]);
  library.scanExistingAttachments(); await library.settled();
  const entry = library.enumerateExistingAttachments().items[0];
  await writeFile(file(saved.id), '虚构乙版');
  library.scanExistingAttachments(); await library.settled();
  assert.equal(library.existingAttachmentsStatus().status, 'error');
  assert.equal(library.existingAttachmentsStatus().counts.missing, 1);
  assert.match(library.read(entry.documentId).items[0].text, /甲版/);
  await assert.rejects(library.original(entry.documentId), /登记版本不一致/);
  await writeFile(file(saved.id), '虚构甲版');
  library.action('saved_attachments', 'retry'); await library.settled();
  assert.equal(library.existingAttachmentsStatus().counts.indexed, 1);
});

test('metadata updates retain original-version citations and removed source links do not grant original access', async t => {
  const { library, store, attachment, source, file } = await fixture(t);
  const saved = attachment('虚构第一版.txt', '虚构记录：第一版。'); source('source-a', [saved.id]);
  library.scanExistingAttachments(); await library.settled();
  const old = library.enumerateExistingAttachments().items[0], bytes = Buffer.from('虚构记录：第二版。');
  await writeFile(file(saved.id), bytes);
  store.put('attachments', { ...store.get('attachments', saved.id), name: '虚构第二版.txt', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length });
  await assert.rejects(library.original(old.documentId), /先更新附件索引/);
  library.scanExistingAttachments(); await library.settled();
  assert.notEqual(library.read(old.documentId).revision, old.revision);
  const previous = library.read(old.documentId, { revision: old.revision });
  assert.match(previous.items[0].text, /第一版/); assert.equal(previous.document.origins[0].name, '虚构第一版.txt');
  assert.equal(previous.document.origins[0].sourceId, 'source-a');
  source('source-a', []);
  assert.equal(library.search({ query: '第二版' }).items.length, 0);
  assert.equal(library.search({ query: '虚构第二版.txt' }).items.length, 0);
  library.scanExistingAttachments(); await library.settled();
  assert.equal(library.existingAttachmentsStatus().counts.total, 0);
  assert.equal(library.read(old.documentId).document.available, false);
  assert.equal(library.read(old.documentId, { revision: old.revision }).document.origins[0].sourceId, 'source-a');
  await assert.rejects(library.original(old.documentId), /不再引用/);
});

test('missing records, symlinks and unsupported formats report honest coverage', async t => {
  const { library, attachment, source, file, directory } = await fixture(t);
  const linked = attachment('虚构链接.txt', '虚构内容'), unsupported = attachment('虚构音频.mp3', Buffer.from([1, 2, 3]), 'audio/mpeg');
  source('source-linked', [linked.id]); source('source-unsupported', [unsupported.id]);
  source('source-missing', ['attachment-00000000-0000-0000-0000-000000000000']);
  source('source-invalid', ['../../credentials.json']);
  const outside = path.join(directory, 'outside-fiction.txt'); await writeFile(outside, '虚构内容');
  await unlink(file(linked.id)); await symlink(outside, file(linked.id));
  library.scanExistingAttachments(); await library.settled();
  const status = library.existingAttachmentsStatus();
  assert.equal(status.counts.total, 4); assert.equal(status.counts.unsupported, 1); assert.equal(status.counts.missing, 3);
  assert.equal(status.status, 'error'); assert.equal(library.search({ query: '虚构内容' }).items.length, 0);
  await assert.rejects(library.register({ path: path.join(directory, 'attachments') }), /应用数据/);
});

test('completed OCR and empty outcomes are not mislabeled as pending work', async t => {
  const { library, attachment, source } = await fixture(t, { parse: async name => name.includes('扫描')
    ? { status: 'needs_ocr', detail: '扫描页没有可提取文字。', chunks: [] }
    : { status: 'empty', detail: '文件没有正文。', chunks: [] } });
  source('source-scan', [attachment('虚构扫描.txt', '虚构扫描占位').id]);
  source('source-empty', [attachment('虚构空白.txt', '').id]);
  library.scanExistingAttachments(); await library.settled();
  assert.deepEqual(library.existingAttachmentsStatus().counts, { total: 2, indexed: 0, pending: 0, failed: 0, unsupported: 1, needsAttention: 1, missing: 0 });
});

test('withdrawn attachments do not consume the candidate budget for text or filename search', async t => {
  const { library, attachment, source } = await fixture(t);
  for (let i = 0; i < 50; i++) source(`source-${i}`, [attachment('fictional-filenameneedle.txt', '虚构正文 textneedle 仍有一个来源引用。').id]);
  library.scanExistingAttachments(); await library.settled();
  const entries = library.enumerateExistingAttachments({ pageSize: 100 }).items;
  assert.equal(entries.length, 50);
  const byDocument = new Map(entries.map(entry => [entry.documentId, entry]));
  const keepOnly = entry => {
    for (const item of entries) source(item.sourceIds[0], item.documentId === entry.documentId ? [item.attachmentId] : []);
    assert.equal(library.existingAttachmentsStatus().counts.total, 1);
    assert.equal(library.read(entry.documentId).items.length, 1);
  };
  // Identical text has equal rank, so the surviving document comes after the
  // former 48-row text window. Revocations are checked before the next scan.
  const lastText = byDocument.get(library.db.prepare('SELECT id FROM documents ORDER BY id DESC LIMIT 1').get().id);
  keepOnly(lastText);
  assert.deepEqual(library.search({ query: 'textneedle' }).items.map(item => item.id), [lastText.documentId]);
  // Filename candidates have their own ordering and former 12-row window.
  const lastName = byDocument.get(library.db.prepare('SELECT id FROM documents ORDER BY path DESC,id DESC LIMIT 1').get().id);
  keepOnly(lastName);
  const named = library.search({ query: 'filenameneedle' }).items;
  assert.deepEqual(named.map(item => item.id), [lastName.documentId]);
  assert.equal(named[0].location, '文件名匹配');
});
