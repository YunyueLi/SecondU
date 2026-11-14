import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { HttpError } from './http-error.mjs';
import { visibleWorkspaceEntry } from './workspace-files.mjs';
import { PARSER_VERSION } from './library-parser.mjs';

const stamp = () => new Date().toISOString();
const digest = text => createHash('sha256').update(text).digest('hex');
const contains = (root, file) => file === root || file.startsWith(root + path.sep);
const fingerprint = info => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const title = name => { if (typeof name !== 'string' || !name.trim() || name.length > 300 || /[\x00-\x1f]/.test(name)) throw new HttpError(400, '请为资料集填写不超过 300 字的名称。'); return name.trim(); };

/** Only explicitly selected files are capabilities. Choosing a file grants no
 * access to its siblings; the virtual collection never walks a parent folder. */
export class SelectedFiles {
  constructor(library) {
    this.library = library; this.db = library.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS library_collections(root_id TEXT PRIMARY KEY REFERENCES roots(id),name TEXT,kind TEXT,created_at TEXT);
      CREATE TABLE IF NOT EXISTS selected_files(root_id TEXT REFERENCES roots(id),file_key TEXT,path TEXT,display_path TEXT,PRIMARY KEY(root_id,file_key),UNIQUE(root_id,display_path));
      CREATE TABLE IF NOT EXISTS collection_import_issues(root_id TEXT REFERENCES roots(id),file_key TEXT,name TEXT,detail TEXT,created_at TEXT,PRIMARY KEY(root_id,file_key));`);
  }
  metadata(rootId) { return this.db.prepare('SELECT * FROM library_collections WHERE root_id=?').get(rootId); }
  isRoot(root) { return this.metadata(root.id)?.kind === 'files'; }
  setName(rootId, name, kind = 'folder') {
    this.library.root(rootId);
    this.db.prepare('INSERT INTO library_collections VALUES(?,?,?,?) ON CONFLICT(root_id) DO UPDATE SET name=excluded.name').run(rootId, title(name), kind, stamp());
  }
  create({ name, mode = 'linked' }) {
    if (!['linked', 'copied'].includes(mode)) throw new HttpError(400, '请选择引用原件或保存副本。');
    name = title(name); this.library.storage.assertAdditional(65536);
    const id = `collection_${randomUUID()}`;
    this.library.transaction(() => {
      this.db.prepare('INSERT INTO roots VALUES(?,?,?,?,?,?,?,?,?)').run(id, `selected-files:${id}`, mode, 'paused', '', null, 0, 30 * 60000, '');
      this.setName(id, name, 'files');
    });
    return this.library.roots().find(root => root.id === id);
  }
  async safeFile(requested) {
    if (typeof requested !== 'string' || !path.isAbsolute(requested) || requested.length > 4000 || /[\x00-\x1f]/.test(requested)) throw new HttpError(400, '请选择完整的本机文件路径。');
    const selected = path.resolve(requested), canonical = await realpath(selected);
    if (selected !== canonical && !(selected.startsWith('/tmp/') && canonical.startsWith('/private/tmp/'))) throw new HttpError(400, '不读取符号链接，请选择原文件。');
    if (canonical.split(path.sep).some(part => part && !visibleWorkspaceEntry(part)) || contains(this.library.store.protectedDataDirectory, canonical) ||
      ['/System', '/Library', '/Applications', '/usr', '/bin', '/sbin', '/dev'].some(dir => contains(dir, canonical)) || canonical === os.homedir()) throw new HttpError(400, '此文件位于系统、隐藏或应用数据范围，请选择具体资料原件。');
    const info = await lstat(canonical);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new HttpError(400, '只接入普通文件，不读取链接或目录。');
    return { file: canonical, info };
  }
  async add(rootId, paths) {
    const root = this.library.root(rootId);
    if (!this.isRoot(root)) throw new HttpError(400, '请选择文件资料集；文件夹中的新增资料由目录扫描接入。');
    if (root.status === 'running') throw new HttpError(409, '请先暂停此资料集，再添加文件。');
    if (!Array.isArray(paths) || !paths.length || paths.length > 250 || paths.some(p => typeof p !== 'string' || p.length > 4000)) throw new HttpError(400, '每次登记 1–250 个文件路径；更多文件由导入窗口分批登记。');
    this.library.storage.assertAdditional(paths.length * 8192);
    let added = 0, duplicates = 0; const rejected = [];
    for (const requested of [...new Set(paths)]) {
      const failedKey = digest(requested);
      try {
        const { file } = await this.safeFile(requested), fileKey = digest(file);
        if (this.db.prepare('SELECT 1 FROM selected_files WHERE root_id=? AND file_key=?').get(rootId, fileKey)) duplicates++;
        else {
          const original = path.basename(file), extension = path.extname(original), stem = original.slice(0, original.length - extension.length);
          let display = original, index = 2;
          while (this.db.prepare('SELECT 1 FROM selected_files WHERE root_id=? AND display_path=?').get(rootId, display)) display = `${stem} (${index++})${extension}`;
          this.db.prepare('INSERT INTO selected_files VALUES(?,?,?,?)').run(rootId, fileKey, file, display); added++;
        }
        this.db.prepare('DELETE FROM collection_import_issues WHERE root_id=? AND file_key IN (?,?)').run(rootId, failedKey, fileKey);
      } catch (error) {
        const name = path.basename(requested).replace(/[\x00-\x1f]/g, '').slice(0, 240) || '未命名文件';
        const detail = error instanceof HttpError ? error.message : ['ENOENT','ENOTDIR'].includes(error.code) ? '原文件不存在，请检查位置。' : '此文件无法读取，请检查本机权限。';
        this.db.prepare('INSERT OR REPLACE INTO collection_import_issues VALUES(?,?,?,?,?)').run(rootId, failedKey, name, detail, stamp());
        rejected.push({ name, detail });
      }
      await yieldTurn();
    }
    return { rootId, added, duplicates, rejected, registered: this.db.prepare('SELECT count(*) AS n FROM selected_files WHERE root_id=?').get(rootId).n };
  }
  issues(rootId, { offset = 0 } = {}) {
    this.library.root(rootId); offset = Math.max(0, Math.min(Number(offset) || 0, 100000000));
    const total = this.db.prepare('SELECT count(*) AS n FROM collection_import_issues WHERE root_id=?').get(rootId).n;
    return { items: this.db.prepare('SELECT name,detail FROM collection_import_issues WHERE root_id=? ORDER BY name LIMIT 40 OFFSET ?').all(rootId, offset), total, nextOffset: offset + 40 < total ? offset + 40 : null };
  }
  async safePath(root, relative) {
    const entry = this.db.prepare('SELECT path FROM selected_files WHERE root_id=? AND display_path=?').get(root.id, relative);
    if (!entry) throw new HttpError(404, '此文件不在已选择的资料范围。');
    return this.safeFile(entry.path);
  }
  async inventory(root, job) {
    const entries = this.db.prepare('SELECT * FROM selected_files WHERE root_id=? AND file_key>? ORDER BY file_key LIMIT 64').all(root.id, job.path);
    for (const entry of entries) {
      const current = this.library.root(root.id);
      if (this.library.closed || !this.library.canRun() || current.status !== 'running' || current.run !== job.run) return false;
      const previous = this.db.prepare('SELECT * FROM documents WHERE root_id=? AND path=?').get(root.id, entry.display_path);
      let info, detail = '';
      try { ({ info } = await this.safeFile(entry.path)); }
      catch { detail = '原位置不可用或已变成链接。已保存文字与引用仍保留。'; }
      this.db.prepare(`INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(root_id,path) DO UPDATE SET size=excluded.size,seen=excluded.seen,available=excluded.available,status=CASE WHEN excluded.available=0 THEN 'missing' ELSE documents.status END,detail=CASE WHEN excluded.available=0 THEN excluded.detail ELSE documents.detail END`)
        .run(previous?.id ?? `document_${randomUUID()}`, root.id, entry.display_path, info?.size ?? previous?.size ?? 0, previous?.fingerprint ?? '', previous?.revision ?? null,
          info ? previous?.status ?? 'pending' : 'missing', detail || previous?.detail || '', info ? 1 : 0, job.run, previous?.updated_at ?? stamp());
      if (info && (!previous || previous.fingerprint !== fingerprint(info) || previous.revision && !previous.revision.endsWith(`:${PARSER_VERSION}`) || ['error','pending','missing','waiting_storage'].includes(previous.status))) this.library.enqueue(root.id, job.run, 'file', entry.display_path);
      await yieldTurn();
    }
    if (entries.length === 64) this.library.enqueue(root.id, job.run, 'selection_inventory', entries.at(-1).file_key);
  }
}
