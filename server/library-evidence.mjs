import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Read only catalogue metadata. A changed file is a reason to recheck an old
 * memory, not permission to rewrite a user-confirmed fact or its source. */
export function libraryEvidenceState(store, source) {
  const reference = source.libraryEvidence;
  if (!reference) return undefined;
  const result = { documentId: reference.documentId, citedRevision: reference.revision, state: 'unverified', note: '原文版本状态尚未核验。' };
  const file = path.join(store.directory, 'library.sqlite'); if (!existsSync(file)) return result;
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const document = db.prepare('SELECT d.revision,d.status,d.available,r.status AS root_status,r.last_scan FROM documents d JOIN roots r ON r.id=d.root_id WHERE d.id=?').get(reference.documentId);
    if (!document) return result;
    const unverified = document.status === 'error' || document.root_status === 'error';
    return { ...result, currentRevision: document.revision, checkedAt: document.last_scan, originalAvailable: !!document.available,
      state: unverified ? 'unverified' : document.revision !== reference.revision ? 'newer_version' : 'same_indexed_version',
      note: unverified ? '最新读取未完成，不可把旧证据当成已核验的现状。' : document.revision !== reference.revision ? '原文已有新版本；确认当前结论前，须检索新版本或请用户核对。旧个人记忆没有被自动修改。' : '与最近一次索引的版本一致；不代表此刻原文件一定未变化。' };
  } catch { return result; } finally { db?.close(); }
}
