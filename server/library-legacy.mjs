import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { HttpError } from './http-error.mjs';

export const EXISTING_ATTACHMENTS_ROOT = 'saved_attachments';
const MAX_BYTES = 64 * 1024 * 1024;
const stamp = () => new Date().toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
const fingerprint = info => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const bounded = (value, fallback, max) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Math.min(Number(value), max) : fallback;
// This relation reads identifiers only. Source bodies never enter the catalogue
// or a worker merely because a source has an attachment.
const sourceRefs = `SELECT s.id AS source_id,j.value AS attachment_id FROM entities s,
  json_each(CASE WHEN json_type(s.data,'$.attachmentIds')='array' THEN json_extract(s.data,'$.attachmentIds') ELSE '[]' END) j
  WHERE s.collection='sources' AND j.type='text'`;

/** A capability scoped to attachment IDs already referenced by saved sources.
 * Its virtual root is deliberately not a filesystem root. Never enumerate the
 * application's attachment directory or infer a file from a supplied name. */
export class ExistingAttachments {
  constructor(library) {
    this.library = library; this.store = library.store; this.db = library.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS legacy_attachment_documents(
      attachment_id TEXT PRIMARY KEY,document_id TEXT UNIQUE REFERENCES documents(id),
      name TEXT,metadata_revision TEXT,indexed_metadata_revision TEXT,seen TEXT);
      CREATE TABLE IF NOT EXISTS legacy_attachment_sources(attachment_id TEXT,source_id TEXT,seen TEXT,PRIMARY KEY(attachment_id,source_id));
      CREATE TABLE IF NOT EXISTS legacy_attachment_versions(document_id TEXT REFERENCES documents(id),revision TEXT REFERENCES revisions(id),
        source_id TEXT,attachment_id TEXT,name TEXT,sha256 TEXT,observed_at TEXT,PRIMARY KEY(document_id,revision,source_id,attachment_id,name));`);
  }
  isRoot(root) { return root.id === EXISTING_ATTACHMENTS_ROOT && root.mode === 'stored'; }
  sources(id) {
    // Scan jobs establish candidate owners; subsequent reads recheck only those
    // source IDs, avoiding repeated walks over every saved source body.
    return this.db.prepare('SELECT source_id FROM legacy_attachment_sources WHERE attachment_id=? ORDER BY source_id').all(id)
      .filter(row => this.store.db.prepare(`SELECT 1 FROM entities s,json_each(s.data,'$.attachmentIds') j
        WHERE s.collection='sources' AND s.id=? AND j.type='text' AND j.value=? LIMIT 1`).get(row.source_id, id)).map(row => row.source_id);
  }
  rows({ sourceId, offset = 0, pageSize = 40, after } = {}) {
    const conditions = [], values = [];
    if (after !== undefined) { conditions.push('attachment_id>?'); values.push(after); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    if (sourceId) values.push(sourceId);
    return this.store.db.prepare(`SELECT attachment_id,json_group_array(DISTINCT source_id) AS source_ids FROM (${sourceRefs}) ${where}
      GROUP BY attachment_id ${sourceId ? 'HAVING max(source_id=?)' : ''} ORDER BY attachment_id LIMIT ? OFFSET ?`)
      .all(...values, pageSize, offset);
  }
  enumerate({ sourceId, offset = 0, pageSize = 40 } = {}) {
    offset = bounded(offset, 0, 100000000); pageSize = Math.max(1, bounded(pageSize, 40, 100));
    const total = this.store.db.prepare(`SELECT count(DISTINCT attachment_id) AS n FROM (${sourceRefs}) ${sourceId ? 'WHERE source_id=?' : ''}`).get(...(sourceId ? [sourceId] : [])).n;
    const items = this.rows({ sourceId, offset, pageSize }).map(({ attachment_id: id, source_ids }) => {
      const metadata = this.store.get('attachments', id);
      const row = this.db.prepare('SELECT a.*,d.status,d.detail,d.revision,d.available FROM legacy_attachment_documents a JOIN documents d ON d.id=a.document_id WHERE attachment_id=?').get(id);
      const sourceIds = JSON.parse(source_ids).sort();
      return { attachmentId: id, name: metadata?.name ?? row?.name ?? '缺失的附件', size: metadata?.size ?? null,
        sourceIds: sourceIds.slice(0, 100), sourceCount: sourceIds.length, documentId: row?.document_id ?? null,
        status: metadata ? row?.status ?? 'pending' : 'missing', detail: metadata ? row?.detail ?? '' : '附件登记已缺失；保留原来源引用。',
        revision: row?.revision ?? null, available: metadata ? !!row?.available : false };
    });
    return { items, total, offset, nextOffset: offset + items.length < total ? offset + items.length : null };
  }
  status() {
    const root = this.db.prepare('SELECT * FROM roots WHERE id=?').get(EXISTING_ATTACHMENTS_ROOT);
    const counts = { total: 0, indexed: 0, pending: 0, failed: 0, unsupported: 0, needsAttention: 0, missing: 0 };
    const sources = this.store.db.prepare(`SELECT count(DISTINCT source_id) AS n,count(*) AS reference_count FROM (${sourceRefs})`).get();
    for (const row of this.store.db.prepare(`SELECT DISTINCT attachment_id FROM (${sourceRefs})`).iterate()) {
      counts.total++;
      const metadata = this.store.get('attachments', row.attachment_id);
      const item = this.db.prepare('SELECT d.status,d.available FROM documents d JOIN legacy_attachment_documents a ON a.document_id=d.id WHERE a.attachment_id=?').get(row.attachment_id);
      if (!metadata || item && !item.available) counts.missing++;
      else if (item?.status === 'ready') counts.indexed++;
      else if (item?.status === 'error') counts.failed++;
      else if (['original_only', 'empty'].includes(item?.status)) counts.unsupported++;
      else if (['needs_attention', 'needs_ocr', 'too_large'].includes(item?.status)) counts.needsAttention++;
      else counts.pending++;
    }
    return { rootId: EXISTING_ATTACHMENTS_ROOT, enabled: !!root, status: root?.status ?? 'not_started', lastScan: root?.last_scan ?? null,
      counts, sources: sources.n, references: sources.reference_count, error: root?.error ?? '',
      progress: root ? Object.fromEntries(this.db.prepare('SELECT state,count(*) AS n FROM jobs WHERE root_id=? AND run=? GROUP BY state').all(root.id, root.run).map(row => [row.state, row.n])) : {} };
  }
  scan() {
    this.db.prepare('INSERT OR IGNORE INTO roots VALUES(?,?,?,?,?,?,?,?,?)').run(EXISTING_ATTACHMENTS_ROOT, 'saved-attachments:', 'stored', 'idle', '', null, 0, 30 * 60000, '');
    this.library.scan(EXISTING_ATTACHMENTS_ROOT);
    return this.status();
  }
  decorate(row, revision = row.revision) {
    const attachment = this.db.prepare('SELECT attachment_id,name FROM legacy_attachment_documents WHERE document_id=?').get(row.id);
    if (!attachment) return {};
    const sourceIds = this.sources(attachment.attachment_id);
    const origins = revision ? this.db.prepare(`SELECT source_id AS sourceId,attachment_id AS attachmentId,name,sha256,observed_at AS observedAt
      FROM legacy_attachment_versions WHERE document_id=? AND revision=? ORDER BY source_id,name LIMIT 100`).all(row.id, revision) : [];
    const originsCount = revision ? this.db.prepare('SELECT count(*) AS n FROM legacy_attachment_versions WHERE document_id=? AND revision=?').get(row.id, revision).n : 0;
    return { kind: 'saved_attachment', path: attachment.name, name: attachment.name, attachmentId: attachment.attachment_id,
      sourceIds: sourceIds.slice(0, 100), sourceCount: sourceIds.length, origins, originsCount };
  }
  searchable(row) {
    if (row.root_id !== EXISTING_ATTACHMENTS_ROOT) return true;
    const link = this.db.prepare('SELECT attachment_id FROM legacy_attachment_documents WHERE document_id=?').get(row.id);
    return !!link && this.sources(link.attachment_id).length > 0;
  }
  async inventory(root, job) {
    const rows = this.rows({ after: job.path, pageSize: 64 });
    for (const { attachment_id: id, source_ids } of rows) {
      if (this.library.closed || !this.library.canRun() || this.library.root(root.id).status !== 'running' || this.library.root(root.id).run !== job.run) return false;
      const metadata = this.store.get('attachments', id);
      const name = typeof metadata?.name === 'string' ? metadata.name : '缺失的附件';
      const metadataRevision = digest(JSON.stringify(metadata ?? null));
      const previous = this.db.prepare('SELECT d.* FROM documents d JOIN legacy_attachment_documents a ON a.document_id=d.id WHERE a.attachment_id=?').get(id);
      const documentId = previous?.id ?? `document_attachment_${digest(id).slice(0, 32)}`;
      const sourceIds = JSON.parse(source_ids);
      this.library.transaction(() => {
        this.db.prepare(`INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,size=excluded.size,seen=excluded.seen,available=excluded.available`)
          .run(documentId, root.id, `${id}/${name}`, Number.isSafeInteger(metadata?.size) ? metadata.size : 0, previous?.fingerprint ?? '', previous?.revision ?? null,
            previous?.status ?? 'pending', previous?.detail ?? '', metadata ? 1 : 0, job.run, previous?.updated_at ?? stamp());
        this.db.prepare(`INSERT INTO legacy_attachment_documents VALUES(?,?,?,?,?,?) ON CONFLICT(attachment_id) DO UPDATE SET name=excluded.name,metadata_revision=excluded.metadata_revision,seen=excluded.seen`)
          .run(id, documentId, name, metadataRevision, '', job.run);
        this.db.prepare('DELETE FROM legacy_attachment_sources WHERE attachment_id=?').run(id);
        for (const sourceId of sourceIds) this.db.prepare('INSERT INTO legacy_attachment_sources VALUES(?,?,?)').run(id, sourceId, job.run);
        this.library.enqueue(root.id, job.run, 'attachment', id);
      });
      await yieldTurn();
    }
    if (rows.length === 64) this.library.enqueue(root.id, job.run, 'attachment_inventory', rows.at(-1).attachment_id);
  }
  validateMetadata(id) {
    // An indexed history does not grant access to an orphaned or task attachment.
    if (!this.sources(id).length) throw new HttpError(404, '当前资料来源不再引用此附件。');
    const value = this.store.get('attachments', id);
    if (!value) throw new HttpError(404, '附件登记已缺失；原来源和已建立的索引仍保留。', 'attachment_unavailable');
    if (!/^attachment-[a-f0-9-]{36}$/.test(id) || value.id !== id || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(value.name)
      || !Number.isSafeInteger(value.size) || value.size < 0 || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new HttpError(409, '附件登记不完整，未读取原件。', 'attachment_metadata_invalid');
    if (value.size > MAX_BYTES) throw new HttpError(413, '原件超过单文件 64 MiB 处理上限。', 'attachment_too_large');
    return value;
  }
  async openVerified(id, { read = false } = {}) {
    const metadata = this.validateMetadata(id), directory = path.join(this.store.directory, 'attachments'), file = path.join(directory, `${id}.bin`);
    const directoryInfo = await lstat(directory);
    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || await realpath(directory) !== directory) throw new HttpError(409, '附件存储目录不可用。', 'attachment_unavailable');
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || await realpath(file) !== file || info.size !== metadata.size) throw new HttpError(409, '附件原件缺失、已变化或被替换。', 'attachment_unavailable');
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      if (fingerprint(await handle.stat()) !== fingerprint(info)) throw new HttpError(409, '附件正在变化，请稍后重试。');
      const hash = createHash('sha256'), bytes = read ? Buffer.alloc(info.size) : undefined, buffer = read ? bytes : Buffer.alloc(Math.min(info.size || 1, 65536));
      let position = 0;
      while (position < info.size) {
        const length = Math.min(65536, info.size - position), offset = read ? position : 0;
        const result = await handle.read(buffer, offset, length, position);
        if (!result.bytesRead) throw new HttpError(409, '附件读取不完整，请重试。');
        hash.update(buffer.subarray(offset, offset + result.bytesRead)); position += result.bytesRead;
      }
      if (hash.digest('hex') !== metadata.sha256 || fingerprint(await handle.stat()) !== fingerprint(info) || fingerprint(await lstat(file)) !== fingerprint(info)
        || await realpath(directory) !== directory || digest(JSON.stringify(this.validateMetadata(id))) !== digest(JSON.stringify(metadata))) throw new HttpError(409, '附件原件与登记版本不一致，未使用变化后的内容。', 'attachment_changed');
      return { handle, bytes, metadata, info };
    } catch (error) { await handle.close(); throw error; }
  }
  async index(root, job) {
    const link = this.db.prepare('SELECT * FROM legacy_attachment_documents WHERE attachment_id=?').get(job.path);
    const doc = this.library.document(link.document_id);
    if (!this.sources(job.path).length) { this.db.prepare('UPDATE documents SET available=0 WHERE id=?').run(doc.id); return; }
    const { handle, bytes, metadata, info } = await this.openVerified(job.path, { read: true });
    await handle.close();
    const result = await this.library.indexBytes(root, job, doc, bytes, info, metadata.name);
    if (result === false) return false;
    // Persist attribution with the immutable text version, even if a later edit
    // removes a source attachment reference. This does not mutate those sources.
    const revision = this.library.document(doc.id).revision, metadataRevision = digest(JSON.stringify(metadata));
    this.library.transaction(() => {
      this.db.prepare('UPDATE legacy_attachment_documents SET indexed_metadata_revision=? WHERE attachment_id=?').run(metadataRevision, job.path);
      for (const sourceId of this.sources(job.path)) this.db.prepare('INSERT OR IGNORE INTO legacy_attachment_versions VALUES(?,?,?,?,?,?,?)').run(doc.id, revision, sourceId, job.path, metadata.name, metadata.sha256, stamp());
    });
  }
  fail(job, detail, error) {
    const unavailable = ['ENOENT', 'attachment_unavailable', 'attachment_metadata_invalid', 'attachment_changed'].includes(error.code);
    this.db.prepare(`UPDATE documents SET status='error',detail=?,available=CASE WHEN ? THEN 0 ELSE available END WHERE id=(SELECT document_id FROM legacy_attachment_documents WHERE attachment_id=?)`).run(detail, unavailable ? 1 : 0, job.path);
  }
  async original(documentId) {
    const link = this.db.prepare('SELECT * FROM legacy_attachment_documents WHERE document_id=?').get(documentId);
    if (!link) throw new HttpError(404, '此资料没有已保存附件。');
    const result = await this.openVerified(link.attachment_id);
    const doc = this.library.document(documentId);
    const indexedHash = doc.revision && this.db.prepare('SELECT hash FROM revisions WHERE id=?').get(doc.revision)?.hash;
    if (indexedHash && indexedHash !== result.metadata.sha256) { await result.handle.close(); throw new HttpError(409, '附件版本已变化，请先更新附件索引。'); }
    return { handle: result.handle, size: result.info.size, name: result.metadata.name };
  }
}
