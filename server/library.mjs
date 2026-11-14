import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, lstat, realpath, opendir, stat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { HttpError } from './http-error.mjs';
import { visibleWorkspaceEntry, sensitiveWorkspaceContent } from './workspace-files.mjs';
import { PARSER_VERSION, PARSE_EXTENSIONS } from './library-parser.mjs';
import { searchTokens, matchQuery } from './library-text.mjs';
import { SelectedFiles } from './library-selection.mjs';
import { libraryStorage, storageBlocked } from './library-storage.mjs';
import { ExistingAttachments } from './library-legacy.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const uid = prefix => `${prefix}_${randomUUID()}`;
const timestamp = () => new Date().toISOString();
const contains = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const fingerprint = value => `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
const limit = (value, fallback, max) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Math.min(Number(value), max) : fallback;
const publicDoc = row => row && ({ id: row.id, rootId: row.root_id, path: row.path, name: path.basename(row.path), size: row.size,
  status: row.status, detail: row.detail, revision: row.revision, available: !!row.available, updatedAt: row.updated_at });
const errorMessage = error => error instanceof HttpError ? error.message : ({ ENOENT: '原位置不可用，请检查文件是否移动。', EACCES: '没有读取权限，请检查文件权限。', EPERM: '没有读取权限，请检查系统隐私权限。', ENOSPC: '本机空间不足，请清理后重试。' }[error.code] || '文件处理未完成，请检查格式后重试。');
function searchExcerpt(text, query) {
  const lower = text.toLowerCase();
  const terms = [query.trim(), ...query.trim().split(/\s+/)].map(term => term.replace(/^"|"$/g, '').toLowerCase()).filter(Boolean);
  const hit = terms.map(term => lower.indexOf(term)).find(index => index >= 0) ?? 0;
  const offset = Math.max(0, Math.min(hit - 200, text.length - 1200));
  return { excerpt: text.slice(offset, offset + 1200), excerptOffset: offset, excerptTruncated: text.length > 1200 };
}

function parseInWorker(name, bytes) {
  return new Promise((resolve, reject) => {
    const buffer = Uint8Array.from(bytes);
    const worker = new Worker(new URL('./library-parser-worker.mjs', import.meta.url), {
      workerData: { name, bytes: buffer }, transferList: [buffer.buffer], resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const timer = setTimeout(() => { void worker.terminate(); reject(new HttpError(408, '此文件处理超时；可重试或拆分后接入。')); }, 60000);
    worker.once('message', result => { clearTimeout(timer); void worker.terminate(); result.error ? reject(new HttpError(422, result.error.message, result.error.code)) : resolve(result.result); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('parser exited')); });
  });
}

/** Each space owns a disk-backed catalogue, queue and index. No document body is
 * added to bootstrap; one parser runs at a time, independent of model execution. */
export class LibraryService {
  constructor(store, { automatic = true, canRun = () => true, parse = parseInWorker } = {}) {
    this.store = store; this.canRun = canRun; this.parse = parse;
    this.db = new DatabaseSync(path.join(store.directory, 'library.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS roots(id TEXT PRIMARY KEY,path TEXT UNIQUE,mode TEXT,status TEXT,run TEXT,last_scan TEXT,next_scan INTEGER,interval_ms INTEGER,error TEXT);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,root_id TEXT REFERENCES roots(id),path TEXT,size INTEGER,fingerprint TEXT,revision TEXT,status TEXT,detail TEXT,available INTEGER,seen TEXT,updated_at TEXT,UNIQUE(root_id,path));
      CREATE INDEX IF NOT EXISTS documents_root_path ON documents(root_id,path);
      CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,hash TEXT,parser TEXT,status TEXT,detail TEXT,pages INTEGER,created_at TEXT);
      CREATE TABLE IF NOT EXISTS document_versions(document_id TEXT REFERENCES documents(id),revision TEXT REFERENCES revisions(id),observed_at TEXT,PRIMARY KEY(document_id,revision));
      CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY,revision TEXT REFERENCES revisions(id),ordinal INTEGER,location TEXT,line INTEGER,start INTEGER,end INTEGER,text TEXT,UNIQUE(revision,ordinal));
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(tokens,content='');
      CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,root_id TEXT REFERENCES roots(id),run TEXT,kind TEXT,path TEXT,state TEXT,error TEXT,UNIQUE(root_id,run,kind,path));
      CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(state,root_id,id);
      CREATE INDEX IF NOT EXISTS documents_revision ON documents(revision);`);
    this.storage = libraryStorage(store);
    this.existingAttachments = new ExistingAttachments(this);
    this.selection = new SelectedFiles(this);
    this.db.prepare("UPDATE jobs SET state='pending' WHERE state='active'").run();
    this.closed = false; this.pending = undefined;
    if (automatic) { this.timer = setInterval(() => this.kick(), 5000); this.timer.unref(); this.kick(); }
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  root(id) { const root = this.db.prepare('SELECT * FROM roots WHERE id=?').get(id); if (!root) throw new HttpError(404, '此文件夹未连接。'); return root; }
  document(id) { const document = this.db.prepare('SELECT * FROM documents WHERE id=?').get(id); if (!document) throw new HttpError(404, '资料不存在。'); return document; }
  publicDocument(row, revision) { return { ...publicDoc(row), ...this.existingAttachments.decorate(row, revision) }; }
  enumerateExistingAttachments(options) { return this.existingAttachments.enumerate(options); }
  existingAttachmentsStatus() { return this.existingAttachments.status(); }
  scanExistingAttachments() { return this.existingAttachments.scan(); }
  createCollection(options) { return this.selection.create(options); }
  addCollectionFiles(id, paths) { return this.selection.add(id, paths); }
  collectionIssues(id, options) { return this.selection.issues(id, options); }
  renameCollection(id, name) { this.selection.setName(id, name); return this.roots().find(root => root.id === id); }
  storageStatus() { return this.storage.status({ refresh: true }); }
  updateStorage(value) {
    const result = this.storage.save(value);
    if (result.state === 'ready') for (const root of this.db.prepare("SELECT id FROM roots WHERE status='paused_storage'").all()) this.action(root.id, 'resume');
    return result;
  }
  roots() {
    return this.db.prepare('SELECT * FROM roots ORDER BY path').all().map(root => ({ id: root.id, path: this.existingAttachments.isRoot(root) || this.selection.isRoot(root) ? '' : root.path,
      name: this.selection.metadata(root.id)?.name ?? (this.existingAttachments.isRoot(root) ? '已保存的资料附件' : path.basename(root.path)), kind: this.existingAttachments.isRoot(root) ? 'saved_attachments' : this.selection.isRoot(root) ? 'files' : 'folder',
      importIssues: this.db.prepare('SELECT count(*) AS n FROM collection_import_issues WHERE root_id=?').get(root.id).n,
      registeredFiles: this.selection.isRoot(root) ? this.db.prepare('SELECT count(*) AS n FROM selected_files WHERE root_id=?').get(root.id).n : undefined, mode: root.mode, status: root.status,
      lastScan: root.last_scan, intervalMinutes: root.interval_ms / 60000, error: root.error,
      documents: this.db.prepare('SELECT count(*) AS n FROM documents WHERE root_id=?').get(root.id).n,
      progress: Object.fromEntries(this.db.prepare('SELECT state,count(*) AS n FROM jobs WHERE root_id=? AND run=? GROUP BY state').all(root.id, root.run).map(row => [row.state, row.n])) }));
  }
  async register({ path: requested, mode = 'linked', intervalMinutes = 30, name }) {
    if (typeof requested !== 'string' || !path.isAbsolute(requested) || requested.length > 4000 || /[\x00-\x1f]/.test(requested)) throw new HttpError(400, '请选择完整的本机文件夹路径。');
    if (!['linked', 'copied'].includes(mode) || ![15, 30, 60, 120, 360, 1440].includes(intervalMinutes)) throw new HttpError(400, '保存方式或更新间隔无效。');
    const selected = path.resolve(requested), canonical = await realpath(selected);
    if (!(await lstat(selected)).isDirectory() || selected !== canonical && !(selected.startsWith('/tmp/') && canonical.startsWith('/private/tmp/'))) throw new HttpError(400, '请选择真实文件夹，不使用符号链接。');
    if (canonical === path.parse(canonical).root || canonical === os.homedir() || ['/System', '/Library', '/Applications', '/private', '/usr', '/bin', '/sbin', '/dev'].includes(canonical)
      || contains(this.store.protectedDataDirectory, canonical) || contains(canonical, this.store.protectedDataDirectory)
      || canonical.split(path.sep).some(part => part && !visibleWorkspaceEntry(part))) throw new HttpError(400, '请选择具体资料文件夹，避免系统目录、应用数据和凭据目录。');
    const existing = this.db.prepare('SELECT * FROM roots WHERE path=?').get(canonical);
    if (existing) { if (existing.mode !== mode) throw new HttpError(409, '此文件夹已连接，请从原资料集查看其保存方式。'); return this.roots().find(root => root.id === existing.id); }
    // Overlapping registrations make deletion and freshness ambiguous.
    if (this.db.prepare('SELECT path FROM roots').all().some(root => contains(root.path, canonical) || contains(canonical, root.path))) throw new HttpError(409, '此文件夹已包含在另一处连接中，请从现有目录浏览。');
    this.storage.assertAdditional(65536);
    const rootId = uid('folder');
    this.transaction(() => {
      this.db.prepare('INSERT INTO roots VALUES(?,?,?,?,?,?,?,?,?)').run(rootId, canonical, mode, 'idle', '', null, 0, intervalMinutes * 60000, '');
      if (name) this.selection.setName(rootId, name);
    });
    this.scan(rootId); return this.roots().find(root => root.id === rootId);
  }
  scan(rootId) {
    const root = this.root(rootId);
    if (root.status === 'running') return;
    const run = uid('scan');
    this.transaction(() => {
      this.db.prepare('DELETE FROM jobs WHERE root_id=?').run(rootId);
      this.db.prepare("UPDATE roots SET status='running',run=?,error='' WHERE id=?").run(run, rootId);
      this.enqueue(rootId, run, this.existingAttachments.isRoot(root) ? 'attachment_inventory' : this.selection.isRoot(root) ? 'selection_inventory' : 'directory', '');
    });
    this.kick();
  }
  action(rootId, action) {
    const root = this.root(rootId);
    if (action === 'pause') this.db.prepare("UPDATE roots SET status='paused' WHERE id=?").run(rootId);
    else if (action === 'cancel') this.db.prepare("UPDATE roots SET status='cancelled' WHERE id=?").run(rootId);
    else if (action === 'resume' || action === 'retry') {
      if (!root.run) { this.scan(rootId); return; }
      this.db.prepare("UPDATE roots SET status='running',error='' WHERE id=?").run(rootId);
      if (action === 'retry') this.db.prepare("UPDATE jobs SET state='pending',error='' WHERE root_id=? AND state='failed'").run(rootId);
    } else if (action === 'scan') { this.scan(rootId); return; }
    else throw new HttpError(400, '未知的文件夹操作。');
    this.kick();
  }
  enqueue(rootId, run, kind, relative) { this.db.prepare("INSERT OR IGNORE INTO jobs(root_id,run,kind,path,state,error) VALUES(?,?,?,?,'pending','')").run(rootId, run, kind, relative); }
  async safePath(root, relative, directory = false) {
    if (this.selection.isRoot(root)) { if (directory) throw new HttpError(400, '文件资料集不读取其父目录。'); return this.selection.safePath(root, relative); }
    if (this.existingAttachments.isRoot(root)) throw new HttpError(400, '已保存附件只可按资料引用读取，不能作为文件夹浏览。');
    const parts = relative ? relative.split('/') : [];
    if (parts.some(part => !part || part === '.' || part === '..' || !visibleWorkspaceEntry(part))) throw new HttpError(400, '此路径不在可读取资料范围内。');
    if (await realpath(root.path) !== root.path || !(await lstat(root.path)).isDirectory()) throw new HttpError(400, '原文件夹已移动或变成链接，请重新检查。');
    let file = root.path;
    for (const part of parts) { file = path.join(file, part); if ((await lstat(file)).isSymbolicLink()) throw new HttpError(400, '不跟随资料中的符号链接。'); }
    if (await realpath(file) !== file || !contains(root.path, file)) throw new HttpError(400, '文件超出已连接目录。');
    const info = await stat(file);
    if (directory ? !info.isDirectory() : !info.isFile() || info.nlink > 1) throw new HttpError(400, '只读取普通文件和真实目录。');
    return { file, info };
  }
  kick() {
    if (this.closed || this.pending || !this.canRun()) return;
    this.pending = Promise.resolve().then(() => this.drain()).catch(error => { this.lastError = errorMessage(error); }).finally(() => { this.pending = undefined; });
  }
  async settled() { while (this.pending) await this.pending; }
  async drain() {
    for (const root of this.db.prepare("SELECT id FROM roots WHERE status IN ('idle','error') AND next_scan<=?").all(Date.now())) this.scan(root.id);
    while (!this.closed && this.canRun()) {
      const job = this.db.prepare("SELECT j.* FROM jobs j JOIN roots r ON r.id=j.root_id AND r.run=j.run WHERE r.status='running' AND j.state='pending' ORDER BY j.kind IN ('file','attachment'),j.id LIMIT 1").get();
      if (!job) break;
      const root = this.root(job.root_id);
      this.db.prepare("UPDATE jobs SET state='active' WHERE id=?").run(job.id);
      try {
        this.storage.assertAdditional(0);
        const finished = job.kind === 'selection_inventory' ? await this.selection.inventory(root, job)
          : job.kind === 'attachment_inventory' ? await this.existingAttachments.inventory(root, job)
          : job.kind === 'attachment' ? await this.existingAttachments.index(root, job)
          : job.kind === 'directory' ? await this.scanDirectory(root, job) : await this.indexFile(root, job);
        if (this.root(root.id).run === job.run) this.db.prepare("UPDATE jobs SET state=?,error='' WHERE id=?").run(finished === false ? 'pending' : 'done', job.id);
      } catch (error) {
        if (this.root(root.id).run === job.run) {
          const detail = errorMessage(error);
          if (storageBlocked(error)) {
            this.db.prepare("UPDATE jobs SET state='pending',error=? WHERE id=?").run(detail, job.id);
            this.db.prepare("UPDATE roots SET status='paused_storage',error=? WHERE id=?").run(detail, root.id);
            if (job.kind === 'file') this.db.prepare("UPDATE documents SET status='waiting_storage',detail=? WHERE root_id=? AND path=?").run(detail, root.id, job.path);
            continue;
          }
          this.db.prepare("UPDATE jobs SET state='failed',error=? WHERE id=?").run(detail, job.id);
          if (job.kind === 'file') this.db.prepare("UPDATE documents SET status='error',detail=? WHERE root_id=? AND path=?").run(detail, root.id, job.path);
          if (job.kind === 'attachment') this.existingAttachments.fail(job, detail, error);
        }
      }
      await yieldTurn();
    }
    for (const root of this.db.prepare("SELECT * FROM roots WHERE status='running'").all()) {
      if (this.db.prepare("SELECT 1 FROM jobs WHERE root_id=? AND run=? AND state IN ('pending','active') LIMIT 1").get(root.id, root.run)) continue;
      const failedDirectories = this.db.prepare("SELECT count(*) AS n FROM jobs WHERE root_id=? AND run=? AND kind IN ('directory','attachment_inventory','selection_inventory') AND state='failed'").get(root.id, root.run).n;
      const failures = this.db.prepare("SELECT count(*) AS n FROM jobs WHERE root_id=? AND run=? AND state='failed'").get(root.id, root.run).n;
      this.transaction(() => {
        // Only a complete directory walk is evidence that a former file vanished.
        if (!failedDirectories) this.db.prepare('UPDATE documents SET available=0 WHERE root_id=? AND seen!=?').run(root.id, root.run);
        this.db.prepare('UPDATE roots SET status=?,last_scan=?,next_scan=?,error=? WHERE id=?').run(failures ? 'error' : 'idle', timestamp(), Date.now() + root.interval_ms,
          failures ? `${failures} 项未完成；已完成的资料仍可查询。` : '', root.id);
      });
    }
  }
  async scanDirectory(root, job) {
    const { file } = await this.safePath(root, job.path, true);
    let processed = 0;
    for await (const entry of await opendir(file)) {
      const current = this.root(root.id);
      if (this.closed || current.run !== job.run || current.status !== 'running' || !this.canRun()) return false;
      if (!visibleWorkspaceEntry(entry.name) || entry.isSymbolicLink()) continue;
      const relative = job.path ? `${job.path}/${entry.name}` : entry.name;
      if (entry.isDirectory()) this.enqueue(root.id, job.run, 'directory', relative);
      else if (entry.isFile()) {
        const info = await lstat(path.join(file, entry.name));
        if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) continue;
        const previous = this.db.prepare('SELECT * FROM documents WHERE root_id=? AND path=?').get(root.id, relative);
        this.db.prepare(`INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(root_id,path) DO UPDATE SET size=excluded.size,seen=excluded.seen,available=1`).run(
          previous?.id ?? uid('document'), root.id, relative, info.size, previous?.fingerprint ?? '', previous?.revision ?? null, previous?.status ?? 'pending', previous?.detail ?? '', 1, job.run, previous?.updated_at ?? timestamp());
        if (!previous || previous.fingerprint !== fingerprint(info) || previous.revision && !previous.revision.endsWith(`:${PARSER_VERSION}`) || ['error', 'pending', 'waiting_storage'].includes(previous.status)) this.enqueue(root.id, job.run, 'file', relative);
      }
      if (++processed % 32 === 0) await yieldTurn();
    }
  }
  async indexFile(root, job) {
    const { file, info } = await this.safePath(root, job.path);
    const doc = this.db.prepare('SELECT * FROM documents WHERE root_id=? AND path=?').get(root.id, job.path);
    if (info.size > MAX_BYTES) { this.db.prepare("UPDATE documents SET status='too_large',detail=?,fingerprint=? WHERE id=?").run('原件已登记；超过单文件 64 MB 处理上限，请拆分后重试。', fingerprint(info), doc.id); return; }
    this.storage.assertAdditional(0);
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    let bytes;
    try {
      if (fingerprint(await handle.stat()) !== fingerprint(info)) throw new HttpError(409, '文件正在变化，请稍后重试。');
      const bounded = Buffer.alloc(info.size + 1); let length = 0;
      while (length < bounded.length) { const result = await handle.read(bounded, length, bounded.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
      bytes = bounded.subarray(0, length);
      if (length !== info.size) throw new HttpError(409, '文件正在变化，请稍后重试。');
      if (fingerprint(await handle.stat()) !== fingerprint(info) || fingerprint((await this.safePath(root, job.path)).info) !== fingerprint(info)) throw new HttpError(409, '读取期间文件发生变化，请稍后重试。');
    } finally { await handle.close(); }
    return this.indexBytes(root, job, doc, bytes, info, job.path);
  }
  async indexBytes(root, job, doc, bytes, info, name) {
    const hash = createHash('sha256').update(bytes).digest('hex'), revision = `${hash}:${path.extname(name).toLowerCase()}:${PARSER_VERSION}`;
    let parsed = this.db.prepare('SELECT * FROM revisions WHERE id=?').get(revision);
    if (!parsed) {
      parsed = PARSE_EXTENSIONS.has(path.extname(name).toLowerCase()) ? await this.parse(name, bytes) : { status: 'original_only', detail: '原件已登记；此格式尚未提取正文。', chunks: [] };
      const secrets = Object.values(this.store.getKeys());
      if (parsed.chunks.some(chunk => sensitiveWorkspaceContent(chunk.text, secrets))) throw new HttpError(400, '文件含疑似凭据，未建立正文索引。');
    }
    if (this.closed || this.root(root.id).run !== job.run) return false;
    let copyNeeded = root.mode === 'copied';
    if (copyNeeded) {
      const directory = path.join(this.store.directory, 'library-objects');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new HttpError(409, '原件副本目录不可用，暂停处理。');
      const destination = path.join(directory, hash);
      const saved = await lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (saved) {
        if (!saved.isFile() || saved.isSymbolicLink() || saved.nlink > 1 || saved.size !== bytes.length) throw new HttpError(409, '已有原件副本异常，暂停处理此文件。');
        const handle = await open(destination, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try {
          if (fingerprint(await handle.stat()) !== fingerprint(saved)) throw new HttpError(409, '已有副本正在变化，请重试。');
          const checksum = createHash('sha256');
          for await (const chunk of handle.createReadStream({ autoClose: false })) checksum.update(chunk);
          if (checksum.digest('hex') !== hash) throw new HttpError(409, '已有原件副本校验未通过，暂停处理此文件。');
          copyNeeded = false;
        } finally { await handle.close(); }
      }
    }
    const indexAllowance = parsed.chunks?.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.text) * 12 + 8192, 262144) ?? 8192;
    this.storage.assertAdditional(indexAllowance + (copyNeeded ? bytes.length * 2 : 0));
    if (copyNeeded) {
      const directory = path.join(this.store.directory, 'library-objects'); await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = path.join(directory, `${hash}.${randomUUID()}.tmp`), destination = path.join(directory, hash);
      const copy = await open(temporary, 'wx', 0o600);
      try { await copy.writeFile(bytes); await copy.sync(); } finally { await copy.close(); }
      try { await rename(temporary, destination); this.storage.addedOriginal('copies', bytes.length); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    }
    this.transaction(() => {
      if (parsed.chunks) {
        this.db.prepare('INSERT OR IGNORE INTO revisions VALUES(?,?,?,?,?,?,?)').run(revision, hash, PARSER_VERSION, parsed.status, parsed.detail, parsed.pages ?? null, timestamp());
        const chunkInsert = this.db.prepare('INSERT INTO chunks(revision,ordinal,location,line,start,end,text) VALUES(?,?,?,?,?,?,?)');
        const ftsInsert = this.db.prepare('INSERT INTO search(rowid,tokens) VALUES(?,?)');
        for (const [ordinal, chunk] of parsed.chunks.entries()) {
          const inserted = chunkInsert.run(revision, ordinal, chunk.location, chunk.line, chunk.start, chunk.end, chunk.text);
          ftsInsert.run(inserted.lastInsertRowid, searchTokens(chunk.text, { indexing: true }).join(' '));
        }
      }
      this.db.prepare('UPDATE documents SET revision=?,fingerprint=?,status=?,detail=?,updated_at=?,available=1 WHERE id=?').run(revision, fingerprint(info), parsed.status, parsed.detail, timestamp(), doc.id);
      this.db.prepare('INSERT OR IGNORE INTO document_versions VALUES(?,?,?)').run(doc.id, revision, timestamp());
    });
  }
  list({ rootId, prefix = '', query = '', offset = 0, pageSize = 40, direct = false } = {}) {
    offset = limit(offset, 0, 100000000); pageSize = Math.max(1, limit(pageSize, 40, 100));
    const conditions = [], values = [];
    if (rootId) { this.root(rootId); conditions.push('root_id=?'); values.push(rootId); }
    if (prefix) { conditions.push('substr(path,1,?)=?'); values.push(prefix.length, prefix); }
    if (direct && !(rootId && (this.existingAttachments.isRoot(this.root(rootId)) || this.selection.isRoot(this.root(rootId))))) { conditions.push("instr(substr(path,?),'/')=0"); values.push(prefix.length + 1); }
    if (query) { conditions.push('instr(lower(path),lower(?))>0'); values.push(String(query).slice(0, 300)); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT count(*) AS n FROM documents ${where}`).get(...values).n;
    const items = this.db.prepare(`SELECT * FROM documents ${where} ORDER BY path,id LIMIT ? OFFSET ?`).all(...values, pageSize, offset).map(row => this.publicDocument(row));
    return { items, total, offset, nextOffset: offset + items.length < total ? offset + items.length : null };
  }
  folders({ rootId, prefix = '', folderOffset = 0 }) {
    if (this.existingAttachments.isRoot(this.root(rootId)) || this.selection.isRoot(this.root(rootId))) return { items: [], nextOffset: null };
    folderOffset = limit(folderOffset, 0, 100000000);
    const items = this.db.prepare(`SELECT substr(path,?,instr(substr(path,?),'/')-1) AS name,count(*) AS documents FROM documents
      WHERE root_id=? AND substr(path,1,?)=? AND instr(substr(path,?),'/')>0 GROUP BY name ORDER BY name LIMIT 51 OFFSET ?`)
      .all(prefix.length + 1, prefix.length + 1, rootId, prefix.length, prefix, prefix.length + 1, folderOffset);
    return { items: items.slice(0, 50).map(item => ({ ...item, prefix: prefix + item.name + '/' })), nextOffset: items.length > 50 ? folderOffset + 50 : null };
  }
  versions(documentId) {
    this.document(documentId);
    return this.db.prepare('SELECT v.revision,v.observed_at AS observedAt,r.status,r.detail FROM document_versions v JOIN revisions r ON r.id=v.revision WHERE v.document_id=? ORDER BY v.observed_at DESC LIMIT 100').all(documentId);
  }
  async original(documentId) {
    const doc = this.document(documentId), root = this.root(doc.root_id);
    if (this.existingAttachments.isRoot(root)) return this.existingAttachments.original(documentId);
    if (root.mode === 'copied' && doc.revision) {
      const version = this.db.prepare('SELECT hash FROM revisions WHERE id=?').get(doc.revision);
      const directory = path.join(this.store.directory, 'library-objects');
      const file = path.join(directory, version.hash), directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || await realpath(directory) !== directory) throw new HttpError(409, '原件副本目录不可读取。');
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_BYTES || await realpath(file) !== file) throw new HttpError(409, '原件副本不可读取。');
      const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        if (fingerprint(await handle.stat()) !== fingerprint(info)) throw new HttpError(409, '原件副本正在变化，请重试。');
        const checksum = createHash('sha256'), buffer = Buffer.alloc(65536); let position = 0;
        while (position < info.size) {
          const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, info.size - position), position);
          if (!bytesRead) throw new HttpError(409, '原件副本读取不完整。');
          checksum.update(buffer.subarray(0, bytesRead)); position += bytesRead;
        }
        if (checksum.digest('hex') !== version.hash || fingerprint(await handle.stat()) !== fingerprint(info) ||
            fingerprint(await lstat(file)) !== fingerprint(info) || await realpath(directory) !== directory) throw new HttpError(409, '原件副本校验未通过，请检查本机文件。');
        return { handle, size: info.size, name: path.basename(doc.path) };
      } catch (error) { await handle.close(); throw error; }
    }
    const { file, info } = await this.safePath(root, doc.path);
    if (doc.revision && fingerprint(info) !== doc.fingerprint) throw new HttpError(409, '原文件已变化，请先刷新文件夹再打开新版本。');
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    if (fingerprint(await handle.stat()) !== fingerprint(info)) { await handle.close(); throw new HttpError(409, '原文件正在变化，请稍后重试。'); }
    return { handle, size: info.size, name: path.basename(doc.path) };
  }
  evidence(documentId, { revision, offset = 0, pageSize = 3 } = {}) {
    const read = this.read(documentId, { revision, offset, pageSize });
    if (!read.items.length) throw new HttpError(400, '这部分没有可用的文字证据。');
    const sourceId = `library-evidence_${createHash('sha256').update(JSON.stringify([documentId, read.revision, read.items.map(item => item.ordinal)])).digest('hex').slice(0, 32)}`;
    const existing = this.store.get('sources', sourceId); if (existing) return existing;
    const source = { id: sourceId, title: `${read.document.name} · ${read.items[0].location}`.slice(0, 300), kind: 'document', demo: false, createdAt: timestamp(),
      text: read.items.map(item => `【${item.location}，第 ${item.line} 行起；${item.citation}】\n${item.text}`).join('\n\n'),
      libraryEvidence: { documentId, revision: read.revision, path: read.document.path, citations: read.items.map(item => item.citation) } };
    return this.store.put('sources', source);
  }
  search({ query, queries, rootId, pageSize = 12 } = {}) {
    if (queries !== undefined) {
      if (!Array.isArray(queries) || !queries.length || queries.length > 4 || queries.some(value => typeof value !== 'string' || !value.trim() || value.length > 300)) throw new HttpError(400, '一次可搜索 1 至 4 组关键词，每组不超过 300 字。');
      const combined = new Map();
      for (const term of [...new Set(queries)]) this.search({ query: term, rootId, pageSize: 30 }).items.forEach((item, rank) => {
        const key = `${item.revision ?? item.id}#${item.ordinal}`, previous = combined.get(key);
        combined.set(key, { item, score: (previous?.score ?? 0) + 1 / (60 + rank + 1) });
      });
      const items = [...combined.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit(pageSize, 12, 30))).map(row => row.item);
      return { items, queries, method: 'lexical_multiquery_rrf', trust: 'untrusted_evidence', note: '多组词语合并的原文线索；不是事实确认或语义向量相似度。' };
    }
    if (typeof query !== 'string' || !query.trim() || query.length > 300) throw new HttpError(400, '请输入不超过 300 字的搜索词。');
    const match = matchQuery(query);
    const count = Math.max(1, limit(pageSize, 12, 30)), values = [match];
    if (rootId) { this.root(rootId); values.push(rootId); }
    const seen = new Set(), secrets = Object.values(this.store.getKeys()), items = [], named = [];
    // Consume one SQLite row at a time and retain at most `count` accepted hits.
    // Revoked references, duplicate revisions and excluded content must not use
    // up a fixed candidate window and hide later, still-readable evidence.
    if (match) for (const row of this.db.prepare(`SELECT d.*,c.ordinal,c.text,c.location,c.line,c.start,c.end,bm25(search) AS rank
      FROM search JOIN chunks c ON c.id=search.rowid JOIN documents d ON d.revision=c.revision
      WHERE search MATCH ? ${rootId ? 'AND d.root_id=?' : ''} ORDER BY rank,d.id,c.ordinal`).iterate(...values)) {
      const key = `${row.revision}#${row.ordinal}`;
      if (seen.has(key) || !this.existingAttachments.searchable(row) || sensitiveWorkspaceContent(row.text, secrets)) continue;
      seen.add(key);
      items.push({ ...this.publicDocument(row), ordinal: row.ordinal, location: row.location, line: row.line, start: row.start, end: row.end, ...searchExcerpt(row.text, query),
        citation: `${row.id}@${row.revision}#${row.ordinal}`, href: `#artifacts/${row.id}~${encodeURIComponent(row.revision)}~${row.ordinal}` });
      if (items.length === count) break;
    }
    for (const row of this.db.prepare(`SELECT * FROM documents WHERE instr(lower(path),lower(?))>0 ${rootId ? 'AND root_id=?' : ''} ORDER BY available DESC,path,id`)
      .iterate(query, ...(rootId ? [rootId] : []))) {
      if (!this.existingAttachments.searchable(row) || items.some(item => item.id === row.id)) continue;
      named.push({ ...this.publicDocument(row), ordinal: 0, excerpt: '', location: '文件名匹配',
        citation: row.revision ? `${row.id}@${row.revision}#0` : undefined, href: `#artifacts/${row.id}` });
      if (named.length === count) break;
    }
    return { items: [...named, ...items].slice(0, count), method: 'lexical_fts5_and_filename', trust: 'untrusted_evidence', note: '结果是原文线索，并非已确认事实；文件名命中不表示已读取内容。核对身份、时间、后续变更与上下文。' };
  }
  read(documentId, { revision, offset = 0, pageSize = 3 } = {}) {
    const doc = this.document(documentId); revision ??= doc.revision;
    // A version must have belonged to this document. The history table below is
    // populated on commit; arbitrary hashes are never a read capability.
    if (revision !== doc.revision && !this.db.prepare('SELECT 1 FROM document_versions WHERE document_id=? AND revision=?').get(documentId, revision)) throw new HttpError(404, '此文档没有这个版本。');
    if (!revision) return { document: this.publicDocument(doc), items: [], nextOffset: null };
    offset = limit(offset, 0, 100000000); pageSize = Math.max(1, limit(pageSize, 3, 8));
    const total = this.db.prepare('SELECT count(*) AS n FROM chunks WHERE revision=?').get(revision).n;
    const items = this.db.prepare('SELECT ordinal,location,line,start,end,text FROM chunks WHERE revision=? AND ordinal>=? ORDER BY ordinal LIMIT ?').all(revision, offset, pageSize);
    const version = this.db.prepare('SELECT status,detail,pages,created_at AS createdAt FROM revisions WHERE id=?').get(revision);
    return { document: this.publicDocument(doc, revision), revision, version, total, items: items.map(item => ({ ...item, citation: `${doc.id}@${revision}#${item.ordinal}` })), nextOffset: offset + items.length < total ? offset + items.length : null };
  }
  async close() { this.closed = true; clearInterval(this.timer); await this.settled(); this.db.close(); }
}
