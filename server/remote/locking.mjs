import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { runtimeDirectory, fail, inside, readRunState, terminal, stamp } from './common.mjs';

// A short SQLite transaction arbitrates processes and owner spaces. The lock
// outlives an SSH observer; only the worker or proven terminal recovery frees it.
function registry() {
  const file=path.join(runtimeDirectory(),'workspaces.sqlite');
  if(existsSync(file)&&(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()))throw fail('远端执行锁不可用。','remote_lock_unsafe',409);
  const db=new DatabaseSync(file);chmodSync(file,0o600);
  db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS workspaces (workspace TEXT PRIMARY KEY, ownerId TEXT NOT NULL, runId TEXT NOT NULL, directory TEXT NOT NULL, createdAt TEXT NOT NULL)');
  return db;
}
export function acquireWorkspace(workspace,{ownerId,runId,directory}) {
  const db=registry();
  try{
    db.exec('BEGIN IMMEDIATE');
    for(const row of db.prepare('SELECT * FROM workspaces').all()){
      let completed=false;
      if(existsSync(path.join(row.directory,'state.json'))){const state=readRunState(row.directory);completed=terminal(state.status)&&!state.executorUnconfirmed;}
      else completed=Date.now()-Date.parse(row.createdAt)>30000;
      if(completed){db.prepare('DELETE FROM workspaces WHERE workspace=?').run(row.workspace);continue;}
      if(row.ownerId===ownerId&&row.runId===runId&&row.workspace===workspace)continue;
      if(inside(row.workspace,workspace)||inside(workspace,row.workspace))throw fail('这个远端目录或重叠目录已有任务执行，请先完成或取消原任务。','remote_workspace_busy',409);
    }
    const existing=db.prepare('SELECT * FROM workspaces WHERE workspace=?').get(workspace);
    if(!existing)db.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?)').run(workspace,ownerId,runId,directory,stamp());
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}
export function assertWorkspaceLock(workspace,{ownerId,runId}) {
  const db=registry();try{const row=db.prepare('SELECT * FROM workspaces WHERE workspace=?').get(workspace);if(!row||row.ownerId!==ownerId||row.runId!==runId)throw fail('远端任务已失去工作目录的执行锁，未继续执行。','remote_workspace_lock_lost',409);}finally{db.close();}
}
export function releaseWorkspace(workspace,{ownerId,runId}) {
  const db=registry();try{db.prepare('DELETE FROM workspaces WHERE workspace=? AND ownerId=? AND runId=?').run(workspace,ownerId,runId);}finally{db.close();}
}
