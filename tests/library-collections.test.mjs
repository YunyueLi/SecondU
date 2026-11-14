import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, readdir, truncate, rename, link } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { LibraryService } from '../server/library.mjs';
import { libraryStorage } from '../server/library-storage.mjs';
import { parseLibraryFile } from '../server/library-parser.mjs';
import { saveAttachment, ATTACHMENT_COUNT } from '../server/attachments.mjs';
import { createFileChooser } from '../server/file-picker.mjs';

async function fixture(t) {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'secondu-collections-')));
  const files = path.join(dir, 'Fictional materials'); await mkdir(files);
  const store = new Store(path.join(dir, 'data'), { seed: false });
  const library = new LibraryService(store, { automatic: false, parse: parseLibraryFile });
  library.storage.disk = () => ({ bavail: 100 * 1024 ** 3, bsize: 1 });
  t.after(async () => { if (!library.closed) await library.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, files, store, library };
}

test('one selected-files collection persists 507 files, deduplicates retries, and never reads unselected siblings', async t => {
  const { library, files, store } = await fixture(t);
  const paths = [];
  for (let i = 0; i < 507; i++) { const file = path.join(files, `fictional-${i}.txt`); await writeFile(file, `虚构材料，批次编号 ${i}。`); paths.push(file); }
  await writeFile(path.join(files, 'unselected.txt'), '虚构：不在选择范围的鹦鹉。');
  const root = library.createCollection({ name: '虚构资料集' });
  await library.addCollectionFiles(root.id, paths.slice(0, 250));
  await library.close();
  const resumed = new LibraryService(store, { automatic: false, parse: parseLibraryFile });
  try {
    assert.equal(resumed.roots()[0].registeredFiles, 250); assert.equal(resumed.roots()[0].status, 'paused');
    assert.equal((await resumed.addCollectionFiles(root.id, paths.slice(0, 250))).duplicates, 250);
    for (let i = 250; i < paths.length; i += 250) await resumed.addCollectionFiles(root.id, paths.slice(i, i + 250));
    resumed.action(root.id, 'resume'); await resumed.settled();
    assert.equal(resumed.lastError, undefined); assert.equal(resumed.roots()[0].status, 'idle');
    assert.equal(resumed.list({ rootId: root.id, direct: true }).total, 507);
    assert.equal(resumed.list({ rootId: root.id }).items.length, 40);
    assert.equal(resumed.search({ query: '鹦鹉' }).items.length, 0);
    assert.equal(store.list('sources').length, 0); assert.equal(store.list('facts').length, 0);
    resumed.renameCollection(root.id, '虚构资料集新版'); assert.equal(resumed.roots()[0].name, '虚构资料集新版');
    await assert.rejects(resumed.safePath(resumed.root(root.id), 'unselected.txt'), /选择/);
  } finally { await resumed.close(); }
});

test('large text tail, same-name files, durable rejections and deleted originals keep usable evidence', async t => {
  const { library, files, dir } = await fixture(t);
  const a = path.join(files, 'note.txt'), other = path.join(dir, 'Other fictional'); await mkdir(other);
  const b = path.join(other, 'note.txt');
  await writeFile(a, '虚构内容。\n'.repeat(100000) + '末尾暗号是银色鲸鱼'); await writeFile(b, '虚构：另一个文件。');
  assert.ok((await readFile(a)).length > 1024 * 1024);
  await symlink(b, path.join(files, 'alias.txt'));
  const missing = path.join(files, 'missing.txt'), root = library.createCollection({ name: '虚构同名资料' });
  const result = await library.addCollectionFiles(root.id, [a, b, path.join(files, 'alias.txt'), missing]);
  assert.equal(result.added, 2); assert.equal(result.rejected.length, 2); assert.equal(library.collectionIssues(root.id).total, 2);
  library.scan(root.id); await library.settled();
  assert.equal(library.lastError, undefined); assert.deepEqual(library.list().items.map(x => x.name).sort(), ['note (2).txt', 'note.txt']);
  const hit = library.search({ query: '银色鲸鱼' }).items[0]; assert.ok(hit); assert.match(hit.excerpt, /银色鲸鱼/); assert.match(library.read(hit.id, { offset: hit.ordinal }).items[0].text, /银色鲸鱼/);
  await rm(a); library.scan(root.id); await library.settled(); assert.equal(library.read(hit.id).document.available, false);
  assert.match(library.read(hit.id, { offset: hit.ordinal }).items[0].text, /银色鲸鱼/);
  library.action(root.id, 'pause'); await writeFile(missing, '虚构：补齐文件'); await library.addCollectionFiles(root.id, [missing]); assert.equal(library.collectionIssues(root.id).total, 1);
});

test('copies deduplicate by content and remain usable after original deletion; altered copies never silently reused', async t => {
  const { library, files, store } = await fixture(t);
  const a = path.join(files, 'a.md'), b = path.join(files, 'b.md');
  await writeFile(a, '虚构资料：保存一份副本。'); await writeFile(b, await readFile(a));
  const root = library.createCollection({ name: '虚构副本', mode: 'copied' });
  await library.addCollectionFiles(root.id, [a, b]); library.scan(root.id); await library.settled();
  assert.equal(library.roots()[0].status, 'idle');
  const objects = path.join(store.directory, 'library-objects'); assert.equal((await readdir(objects)).length, 1);
  const doc = library.list().items[0]; await rm(a); library.scan(root.id); await library.settled();
  const original = await library.original(doc.id); try { assert.match(await original.handle.readFile('utf8'), /副本/); } finally { await original.handle.close(); }
  const object = path.join(objects, (await readdir(objects))[0]); const bytes = await readFile(object); await writeFile(object, Buffer.alloc(bytes.length, 65));
  await assert.rejects(library.original(doc.id), /副本/);
  const c = path.join(files, 'c.md'); await writeFile(c, await readFile(b)); library.action(root.id, 'pause');
  await library.addCollectionFiles(root.id, [c]); library.scan(root.id); await library.settled();
  assert.equal(library.list().items.find(x => x.name === 'c.md').status, 'error');
});

test('filename search is case-insensitive for originals without indexed text', async t => {
  const { library, files } = await fixture(t);
  const file = path.join(files, 'Fictional-Recording.WAV'); await writeFile(file, 'RIFFfictionalWAVE');
  const root = library.createCollection({ name: 'Fictional media' });
  await library.addCollectionFiles(root.id, [file]); library.scan(root.id); await library.settled();
  for (const query of ['recording', 'RECORDING', 'Recording.WAV']) {
    assert.equal(library.search({ query }).items[0]?.name, 'Fictional-Recording.WAV');
  }
});

test('opening a copied original rejects replaced directories and hard-linked objects', async t => {
  const { library, files, store, dir } = await fixture(t);
  const file = path.join(files, 'fictional.txt'); await writeFile(file, 'Fictional copy integrity.');
  const root = library.createCollection({ name: 'Fictional copies', mode: 'copied' });
  await library.addCollectionFiles(root.id, [file]); library.scan(root.id); await library.settled();
  const doc = library.list().items[0], objects = path.join(store.directory, 'library-objects');
  const moved = path.join(dir, 'Moved objects'); await rename(objects, moved); await symlink(moved, objects, 'dir');
  await assert.rejects(library.original(doc.id), /副本/);
  await rm(objects); await rename(moved, objects);
  await link(path.join(objects, (await readdir(objects))[0]), path.join(dir, 'alias.txt'));
  await assert.rejects(library.original(doc.id), /副本/);
});

test('disk reserve and adjustable budget pause durable jobs, resume safely and never delete prior data', async t => {
  const { library, files, store } = await fixture(t);
  const a = path.join(files, 'a.txt'); await writeFile(a, '虚构材料：磁盘预算恢复。');
  const root = library.createCollection({ name: '虚构容量' }); await library.addCollectionFiles(root.id, [a]);
  library.storage.disk = () => ({ bavail: 4 * 1024 ** 3, bsize: 1 });
  library.scan(root.id); await library.settled(); assert.equal(library.roots()[0].status, 'paused_storage');
  assert.ok(library.db.prepare("SELECT 1 FROM jobs WHERE state='pending'").get());
  library.updateStorage({ budgetGiB: 10, reserveGiB: 1 }); await library.settled(); assert.equal(library.roots()[0].status, 'idle');
  const doc = library.list().items[0], before = library.read(doc.id);
  await mkdir(path.join(store.directory, 'attachments'));
  const allocation = path.join(store.directory, 'attachments', 'fictional-sparse.bin'); await writeFile(allocation, ''); await truncate(allocation, 1100 * 1024 ** 2);
  library.updateStorage({ budgetGiB: 1, reserveGiB: 1 }); library.scan(root.id); await library.settled();
  assert.equal(library.roots()[0].status, 'paused_storage'); assert.deepEqual(library.read(doc.id).items, before.items);
  library.updateStorage({ budgetGiB: 2, reserveGiB: 1 }); await library.settled(); assert.equal(library.roots()[0].status, 'idle');
  library.action(root.id, 'pause'); library.updateStorage({ budgetGiB: 3, reserveGiB: 1 }); await library.settled(); assert.equal(library.roots()[0].status, 'paused');
  assert.throws(() => library.updateStorage({ budgetGiB: -1, reserveGiB: 1 }), /预算/);
});

test('legacy uploads share the adjustable disk budget, remove the old count ceiling, preserve model input bound', async t => {
  const { store } = await fixture(t);
  store.transaction(() => { for (let i = 0; i < 2001; i++) store.put('attachments', { id: `fictional-${i}`, name: 'old.txt', size: 1024 * 1024 }); });
  const storage = libraryStorage(store); storage.disk = () => ({ bavail: 100 * 1024 ** 3, bsize: 1 });
  assert.ok(saveAttachment(store, { name: 'new.txt', data: Buffer.from('虚构文件').toString('base64') }).id);
  assert.equal(store.list('attachments').length, 2002); assert.equal(ATTACHMENT_COUNT, 6);
  storage.disk = () => ({ bavail: 1, bsize: 1 });
  assert.throws(() => saveAttachment(store, { name: 'blocked.txt', data: 'YQ==' }), error => error.code === 'library_disk_reserve');
  assert.equal(store.list('attachments').length, 2002);
});

test('native picker preserves JSON paths, cancels cleanly, prevents overlapping dialogs and never interpolates inputs', async () => {
  let args; const paths = ['/fictional/one two.txt', '/fictional/quote".md', '/fictional/new\nline.txt'];
  const picker = createFileChooser({ platform: 'darwin', run: async (...values) => { args = values; return { stdout: JSON.stringify(paths) }; } });
  assert.deepEqual(await picker(), paths); assert.equal(args[0], '/usr/bin/osascript'); assert.equal(args[2].timeout, 120000);
  assert.deepEqual(await createFileChooser({ platform: 'darwin', run: async () => ({ stdout: '[]' }) })(), []);
  let finish; const pending = createFileChooser({ platform: 'darwin', run: () => new Promise(resolve => { finish = resolve; }) });
  const first = pending(); await assert.rejects(pending(), error => error.code === 'file_picker_busy'); finish({ stdout: '[]' }); await first;
});
