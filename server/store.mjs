import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, renameSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSeed } from './seed.mjs';

export const collections = ['sources','facts','people','relationships','events','conversations','goals','agents','tasks','artifacts','automations'];
export const now = () => new Date().toISOString();
export const id = prefix => `${prefix}-${randomUUID()}`;
export class HttpError extends Error { constructor(status, message, code = 'invalid_request') { super(message); this.status = status; this.code = code; } }
export function atomicWrite(file, content, mode = 0o600) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, content, { mode }); renameSync(tmp, file); chmodSync(file, mode);
}

export class Store {
  constructor(directory, { seed = true } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = realpathSync(directory); chmodSync(this.directory, 0o700);
    this.workspace = path.join(this.directory, 'workspaces'); mkdirSync(this.workspace, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.directory, 'hither.sqlite'));
    chmodSync(path.join(this.directory, 'hither.sqlite'), 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS entities (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id));');
    if (!this.get('meta','initialized')) {
      this.transaction(() => {
        const data = createSeed();
        for (const key of collections) for (const value of seed ? data[key] : []) this.put(key, value);
        this.put('meta', { id: 'profile', value: seed ? data.profile : { name: '我的 Hither', description: '', demo: false } });
        this.put('meta', { id: 'settings', value: data.settings });
        this.put('meta', { id: 'initialized', value: { version: 1, at: now() } });
      });
    }
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  get(collection, key) { const row = this.db.prepare('SELECT data FROM entities WHERE collection=? AND id=?').get(collection,key); return row ? JSON.parse(row.data) : undefined; }
  require(collection, key) { const entity=this.get(collection,key); if(!entity) throw new HttpError(404,'记录不存在','not_found'); return entity; }
  list(collection) { return this.db.prepare('SELECT data FROM entities WHERE collection=? ORDER BY rowid').all(collection).map(row=>JSON.parse(row.data)); }
  put(collection, entity) { this.db.prepare('INSERT INTO entities(collection,id,data) VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection,entity.id,JSON.stringify(entity)); return entity; }
  delete(collection,key) { this.require(collection,key); this.db.prepare('DELETE FROM entities WHERE collection=? AND id=?').run(collection,key); }
  meta(key) { return this.require('meta',key).value; }
  setMeta(key,value) { this.put('meta',{id:key,value}); return value; }
  settings() { const settings={...this.meta('settings')}; const key=this.getKey(settings); return {...settings,hasKey:!!key,keyHint:key ? '••••'+key.slice(-4) : undefined}; }
  keyId(settings) { return `${settings.provider}:${settings.baseUrl}`; }
  getKeys() { const file=path.join(this.directory,'credentials.json'); return existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : {}; }
  getKey(settings=this.meta('settings')) { return this.getKeys()[this.keyId(settings)]; }
  setKey(settings,key) { const keys=this.getKeys(); if(key) keys[this.keyId(settings)]=key; else delete keys[this.keyId(settings)]; atomicWrite(path.join(this.directory,'credentials.json'),JSON.stringify(keys)); }
  taskWorkspace(taskId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) throw new HttpError(400,'任务标识无效');
    const dir=path.join(this.workspace,taskId);
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new HttpError(400,'任务目录不能是符号链接');
    mkdirSync(dir,{recursive:true,mode:0o700});
    if (realpathSync(dir)!==dir) throw new HttpError(400,'任务目录超出工作区');
    return dir;
  }
  artifactPath(artifact) {
    const dir=this.taskWorkspace(artifact.taskId);
    if (!artifact.name || artifact.name!==path.basename(artifact.name) || artifact.name==='.' || artifact.name==='..' || /[\x00-\x1f]/.test(artifact.name)) throw new HttpError(400,'产物文件名无效');
    const file=path.join(dir,artifact.name);
    if(existsSync(file) && lstatSync(file).isSymbolicLink()) throw new HttpError(400,'不能编辑链接文件');
    return file;
  }
  writeArtifact(artifact) { atomicWrite(this.artifactPath(artifact),artifact.content); return this.put('artifacts',artifact); }
  close() { this.db.close(); }
}
