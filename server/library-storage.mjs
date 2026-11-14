import { statfsSync, statSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './http-error.mjs';

const GiB = 1024 ** 3;
const defaults = { budgetGiB: 10, reserveGiB: 5 };
const budgets = new WeakMap();
const size = file => { try { return lstatSync(file).isSymbolicLink() ? 0 : statSync(file).size; } catch (e) { if (e.code === 'ENOENT') return 0; throw e; } };

/** Disk budget for library originals and indexes. Model input budgets are separate.
 * Large object inventories are cached; SQLite/WAL sizes and free space are live.
 * One shared instance per Store accounts for attachment uploads during parsing. */
export class LibraryStorage {
  constructor(store, { disk = statfsSync, now = Date.now } = {}) { this.store = store; this.disk = disk; this.now = now; this.cache = null; }
  policy() { return { ...defaults, ...this.store.get('meta', 'libraryStorage')?.value }; }
  save(value) {
    if (!value || Object.keys(value).some(key => !['budgetGiB', 'reserveGiB'].includes(key)) ||
        !Number.isInteger(value.budgetGiB) || value.budgetGiB < 1 || value.budgetGiB > 10240 ||
        !Number.isInteger(value.reserveGiB) || value.reserveGiB < 1 || value.reserveGiB > 1024) throw new HttpError(400, '资料预算须为 1–10240 GiB，磁盘保留空间须为 1–1024 GiB。');
    this.store.setMeta('libraryStorage', { budgetGiB: value.budgetGiB, reserveGiB: value.reserveGiB });
    return this.status({ refresh: true });
  }
  originals(refresh = false) {
    if (refresh || !this.cache || this.now() - this.cache.at > 15000) {
      const counts = { attachments: 0, copies: 0 };
      for (const [key, name] of [['attachments', 'attachments'], ['copies', 'library-objects']]) {
        const directory = path.join(this.store.directory, name);
        try {
          if (lstatSync(directory).isSymbolicLink()) throw new HttpError(409, '资料存储目录已被替换，暂停写入。', 'library_storage_unavailable');
          for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isFile()) counts[key] += size(path.join(directory, entry.name));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      this.cache = { ...counts, at: this.now() };
    }
    return this.cache;
  }
  status({ refresh = false } = {}) {
    const policy = this.policy(), originals = this.originals(refresh);
    const indexBytes = ['library.sqlite', 'library.sqlite-wal', 'library.sqlite-shm'].reduce((sum, name) => sum + size(path.join(this.store.directory, name)), 0);
    const disk = this.disk(this.store.directory), freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const usedBytes = originals.attachments + originals.copies + indexBytes;
    return { ...policy, budgetBytes: policy.budgetGiB * GiB, reserveBytes: policy.reserveGiB * GiB, usedBytes, freeBytes,
      remainingBytes: Math.max(0, Math.min(policy.budgetGiB * GiB - usedBytes, freeBytes - policy.reserveGiB * GiB)),
      breakdown: { attachmentsBytes: originals.attachments, copiedOriginalBytes: originals.copies, indexBytes },
      state: freeBytes < policy.reserveGiB * GiB ? 'disk_low' : usedBytes >= policy.budgetGiB * GiB ? 'budget_reached' : 'ready' };
  }
  assertAdditional(bytes = 0) {
    const status = this.status();
    if (status.freeBytes - bytes < status.reserveBytes) throw new HttpError(507, '磁盘剩余空间不足，已暂停新增处理。请释放空间后继续；已有资料仍可读取。', 'library_disk_reserve');
    if (status.usedBytes + bytes > status.budgetBytes) throw new HttpError(507, '资料存储预算不足，已暂停新增处理。可到资料库调整预算后继续；已有资料仍保留。', 'library_budget_exceeded');
    return status;
  }
  addedOriginal(kind, bytes) { if (this.cache) this.cache[kind] += bytes; }
}
export function libraryStorage(store) { let value = budgets.get(store); if (!value) { value = new LibraryStorage(store); budgets.set(store, value); } return value; }
export const storageBlocked = error => ['library_disk_reserve', 'library_budget_exceeded', 'ENOSPC'].includes(error?.code);
