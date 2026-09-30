import brand from '../shared/brand.json' with {type:'json'};
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, renameSync, existsSync, realpathSync, lstatSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSeed } from './seed.mjs';
import { createUSSeed } from './demo-us.mjs';
import { applyDemoExpansion } from './demo-expansion.mjs';
import { applyDemoLifeTimeline } from './demo-life.mjs';
import { applyDemoNames } from './demo-names.mjs';
import { applyLegacyReplyClassification } from './artifact-provenance.mjs';
import { runnableProject } from './projects.mjs';
import { initializeGoalLists } from './goal-lists.mjs';
import { artifactBytes } from './artifact-content.mjs';

export const collections = ['projects','sources','facts','people','relationships','events','conversations','goals','goalLists','agents','agentRooms','tasks','artifacts','automations'];
export const now = () => new Date().toISOString();
export const id = prefix => `${prefix}-${randomUUID()}`;
import { HttpError } from './http-error.mjs';
export { HttpError } from './http-error.mjs';
export function atomicWrite(file, content, mode = 0o600) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(tmp, content, { mode }); chmodSync(tmp,mode); renameSync(tmp,file); }
  finally { try { unlinkSync(tmp); } catch(error) { if(error.code!=='ENOENT')throw error; } }
}

export class Store {
  constructor(directory, { seed = true, seedLocale = 'zh-CN', protectedDataDirectory } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = realpathSync(directory); chmodSync(this.directory, 0o700);
    // Child spaces must protect the enclosing app data, not just their own database.
    this.protectedDataDirectory = protectedDataDirectory ? realpathSync(protectedDataDirectory) : this.directory;
    this.workspace = path.join(this.directory, 'workspaces'); mkdirSync(this.workspace, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.directory, 'hither.sqlite'));
    chmodSync(path.join(this.directory, 'hither.sqlite'), 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS entities (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id));');
    if (!this.get('meta','initialized')) {
      this.transaction(() => {
        const data = seedLocale === 'en' ? createUSSeed(now()) : createSeed();
        for (const key of collections) for (const value of seed ? data[key]??[] : []) this.put(key, value);
        this.put('meta', { id: 'profile', value: seed ? data.profile : { name: `我的 ${brand.name}`, description: '', demo: false } });
        this.put('meta', { id: 'settings', value: data.settings });
        this.put('meta', { id: 'initialized', value: { version: 1, at: now() } });
      });
    }
    this.recoverCredentialChange();
    if(this.meta('profile').demoLocale !== 'en') {
      applyDemoExpansion(this,now());
      applyDemoLifeTimeline(this,now());
      applyDemoNames(this);
    }
    initializeGoalLists(this,now());
    this.migrateConnections();
    applyLegacyReplyClassification(this,now());
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  get(collection, key) { const row = this.db.prepare('SELECT data FROM entities WHERE collection=? AND id=?').get(collection,key); return row ? JSON.parse(row.data) : undefined; }
  require(collection, key) { const entity=this.get(collection,key); if(!entity) throw new HttpError(404,'记录不存在','not_found'); return entity; }
  list(collection) { return this.db.prepare('SELECT data FROM entities WHERE collection=? ORDER BY rowid').all(collection).map(row=>JSON.parse(row.data)); }
  put(collection, entity) { this.db.prepare('INSERT INTO entities(collection,id,data) VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection,entity.id,JSON.stringify(entity)); return entity; }
  delete(collection,key) { this.require(collection,key); this.db.prepare('DELETE FROM entities WHERE collection=? AND id=?').run(collection,key); }
  meta(key) { return this.require('meta',key).value; }
  setMeta(key,value) { this.put('meta',{id:key,value}); return value; }
  migrateConnections() {
    if(this.get('meta','defaultConnectionId'))return;
    const old=this.meta('settings'),stamp=now(),connection={id:'connection-default',name:'原有默认连接',provider:old.provider,model:old.model,baseUrl:new URL(old.baseUrl).href,api:old.api,reasoningEffort:old.reasoningEffort,createdAt:stamp,updatedAt:stamp,revision:1,...(old.lastTest?{lastTest:old.lastTest}:{})};
    const key=this.getKeys()[`${old.provider}:${old.baseUrl}`];
    // Copy the legacy credential under a connection identity. Keep the old record intact.
    this.credentialTransaction(()=>{if(key)this.setKey(connection,key);this.put('modelConnections',connection);this.setMeta('defaultConnectionId',connection.id);this.setMeta('settings',connection);});
  }
  defaultConnectionId() { return this.meta('defaultConnectionId'); }
  connection(connectionId=this.defaultConnectionId()) { return this.require('modelConnections',connectionId); }
  publicConnection(connection) {
    const {id,name,provider,model,baseUrl,api,appTitle,reasoningEffort,createdAt,updatedAt,lastTest}=connection;
    const key=this.getKey(connection);
    return {id,name,provider,model,baseUrl,api,...(appTitle?{appTitle}:{}),reasoningEffort,createdAt,updatedAt,...(lastTest?{lastTest}:{}),hasKey:!!key};
  }
  settings() { return this.publicConnection(this.connection()); }
  connectionList() { return this.list('modelConnections').map(connection=>this.publicConnection(connection)); }
  keyId(settings) { return settings.id ? `connection:${settings.id}:${settings.provider}:${settings.baseUrl}` : `${settings.provider}:${settings.baseUrl}`; }
  getKeys() { const file=path.join(this.directory,'credentials.json'); return existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : {}; }
  getKey(settings) { return this.getKeys()[this.keyId(settings??this.connection())]; }
  setKey(settings,key) { const keys=this.getKeys(); if(key) keys[this.keyId(settings)]=key; else delete keys[this.keyId(settings)]; atomicWrite(path.join(this.directory,'credentials.json'),JSON.stringify(keys)); }
  deleteConnectionKeys(connectionId) { const keys=this.getKeys();for(const key of Object.keys(keys))if(key.startsWith(`connection:${connectionId}:`))delete keys[key];atomicWrite(path.join(this.directory,'credentials.json'),JSON.stringify(keys)); }
  credentialJournalPath() { return path.join(this.directory,'credentials-recovery.json'); }
  restoreCredentials(before) {
    const file=path.join(this.directory,'credentials.json');
    if(before.existed)atomicWrite(file,JSON.stringify(before.keys));
    else if(existsSync(file))unlinkSync(file);
  }
  recoverCredentialChange() {
    const journal=this.credentialJournalPath();if(!existsSync(journal))return;
    const recovery=JSON.parse(readFileSync(journal,'utf8'));
    if(this.get('meta','credentialsCommit')?.value!==recovery.id)this.restoreCredentials(recovery.before);
    unlinkSync(journal);
  }
  credentialTransaction(fn) {
    // SQLite and a separate credential file cannot share one native transaction.
    // A local mode-600 undo record covers synchronous failure and process restart.
    this.recoverCredentialChange();
    const recovery={id:randomUUID(),before:{existed:existsSync(path.join(this.directory,'credentials.json')),keys:this.getKeys()}};
    atomicWrite(this.credentialJournalPath(),JSON.stringify(recovery));
    let result;
    try { result=this.transaction(()=>{const value=fn();this.setMeta('credentialsCommit',recovery.id);return value;}); }
    catch(error) {
      try { this.restoreCredentials(recovery.before);unlinkSync(this.credentialJournalPath()); }
      catch { throw new HttpError(503,'凭据更新未完成，恢复记录已保留。请恢复本地存储可写后重新启动应用。','credential_recovery_required'); }
      throw error;
    }
    // Commit already succeeded. Cleanup failure must not report a rolled-back save;
    // the persisted commit marker makes the remaining journal safe to recover.
    try { unlinkSync(this.credentialJournalPath()); } catch {}
    return result;
  }
  taskWorkspace(taskId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) throw new HttpError(400,'任务标识无效');
    const task=this.get('tasks',taskId);
    if(task?.projectId)return runnableProject(this,task.projectId).path;
    const dir=path.join(this.workspace,taskId);
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new HttpError(400,'任务目录不能是符号链接');
    mkdirSync(dir,{recursive:true,mode:0o700});
    if (realpathSync(dir)!==dir) throw new HttpError(400,'任务目录超出工作区');
    return dir;
  }
  artifactPath(artifact) {
    const dir=this.taskWorkspace(artifact.taskId);
    const parts=typeof artifact.name==='string'?artifact.name.split('/'):[];
    if(!parts.length||parts.some(part=>!part||part==='.'||part==='..'||/[\\\x00-\x1f]/.test(part))||path.isAbsolute(artifact.name))throw new HttpError(400,'产物文件名无效');
    let file=dir;
    for(const [index,part] of parts.entries()){
      file=path.join(file,part);
      let stat;try{stat=lstatSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(stat){if(stat.isSymbolicLink())throw new HttpError(400,'不能编辑链接文件');if(index<parts.length-1&&!stat.isDirectory())throw new HttpError(400,'产物父路径不是目录');}
      else if(index<parts.length-1)throw new HttpError(400,'产物父目录不存在');
    }
    return file;
  }
  writeArtifact(artifact) {
    const file=this.artifactPath(artifact);
    const mode=this.require('tasks',artifact.taskId).projectId&&existsSync(file)?lstatSync(file).mode&0o777:0o600;
    atomicWrite(file,artifactBytes(artifact).data,mode);return this.put('artifacts',artifact);
  }
  close() { this.db.close(); }
}
