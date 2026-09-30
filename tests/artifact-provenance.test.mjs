import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
import { TaskRunner } from '../server/runner.mjs';
import { createTask } from '../server/domain.mjs';
import { applyLegacyReplyClassification, legacyReplyProvenance } from '../server/artifact-provenance.mjs';

function fixture(t) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-provenance-'));
  let store=new Store(directory,{seed:false});
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {get store(){return store;},reopen(){store.close();store=new Store(directory,{seed:false});return store;}};
}
function legacy(store, suffix='one') {
  const task=createTask(store,{prompt:'hello',mode:'live'}),stamp='2026-09-29T10:00:00.000Z',later='2026-09-29T10:00:01.000Z';
  const artifact={id:`artifact-${suffix}`,taskId:task.id,name:'result-1.md',content:'你好，可以一起做点什么？',type:'markdown',version:1,versions:[{version:1,content:'你好，可以一起做点什么？',createdAt:stamp,author:'Fixture Agent'}],updatedAt:stamp,reviewStatus:'ready'};
  task.status='completed';task.artifactIds=[artifact.id];task.messages.push({id:`message-${suffix}`,role:'assistant',agentId:'fixture-agent',content:artifact.content,createdAt:stamp});
  task.events=[{id:`start-${suffix}`,type:'started',createdAt:stamp,label:'开始真实模型执行'},{id:`agent-${suffix}`,type:'agent_completed',agentId:'fixture-agent',createdAt:stamp,label:'Fixture Agent 本轮已结束'},{id:`save-${suffix}`,type:'artifact_saved',createdAt:stamp,label:'已保存 result-1.md',detail:'版本 1 · Fixture Agent'},{id:`complete-${suffix}`,type:'completed',createdAt:later,label:'本轮任务完成',detail:'请核对产物；模型返回不等于所有外部动作已验收。'}];
  store.put('tasks',task);store.writeArtifact(artifact);return {task,artifact};
}

test('legacy reply migration requires exact provenance, keeps files/history, and is idempotent on restart',t=>{
  const f=fixture(t),{task,artifact}=legacy(f.store),file=f.store.artifactPath(artifact),original=readFileSync(file);
  const result=f.reopen().require('artifacts',artifact.id);
  assert.equal(result.classification,'reply_snapshot');assert.equal(result.origin.kind,'legacy_reply');assert.equal(result.origin.messageId,'message-one');assert.equal(result.origin.sha256.length,64);assert.equal(result.origin.eventIds.length,3);
  assert.deepEqual(result.versions,artifact.versions);assert.equal(result.updatedAt,artifact.updatedAt);assert.deepEqual(readFileSync(file),original);assert.deepEqual(f.store.require('tasks',task.id).artifactIds,[artifact.id]);
  assert.equal(f.store.require('tasks',task.id).events.at(-1).type,'artifact_classified');
  f.reopen();assert.deepEqual(f.store.require('artifacts',artifact.id),result);assert.equal(f.store.require('tasks',task.id).events.filter(e=>e.type==='artifact_classified').length,1);
});

test('filename or matching reply alone never reclassifies user, edited, changed, resumed, or unsupported provenance',t=>{
  const f=fixture(t);let counter=0;
  const check=mutate=>{const {task,artifact}=legacy(f.store,String(++counter));mutate(task,artifact);f.store.put('tasks',task);f.store.put('artifacts',artifact);assert.equal(legacyReplyProvenance(f.store,artifact),undefined);};
  check((task,a)=>{a.versions[0].author='用户';});
  check((task,a)=>{a.origin={kind:'workspace'};});
  check((task,a)=>{a.version=2;a.versions.push({...a.versions[0],version:2,author:'用户'});});
  check((task,a)=>{writeFileSync(f.store.artifactPath(a),'Changed on disk');});
  check(task=>{task.messages.at(-1).content='Different reply';});
  check(task=>{task.events=task.events.filter(e=>e.type!=='artifact_saved');});
  check(task=>{task.events.at(-1).detail='已保存本轮回复；实际创建的工作区文件会单独收录。';});
  check(task=>{task.events.unshift({id:'second-start',type:'started'});});
  check(task=>{task.mode='demo';});
  check((task,a)=>{const file=f.store.artifactPath(a);writeFileSync(`${file}.outside`,a.content);rmSync(file);symlinkSync(`${file}.outside`,file);});
  assert.equal(applyLegacyReplyClassification(f.store,new Date().toISOString()),0);
});

test('unchanged reply snapshots stay out of file collection; actual edits restore a workspace artifact',t=>{
  const f=fixture(t),{task,artifact}=legacy(f.store);applyLegacyReplyClassification(f.store,new Date().toISOString());
  const runner=new TaskRunner(f.store,{scheduler:false}),versions=new Map([[artifact.name,1]]);
  assert.equal(runner.collectWorkspace(task.id,versions).count,0);assert.equal(f.store.require('artifacts',artifact.id).classification,'reply_snapshot');
  writeFileSync(f.store.artifactPath(artifact),'An actual edited document.');
  assert.equal(runner.collectWorkspace(task.id,versions).count,1);const changed=f.store.require('artifacts',artifact.id);
  assert.equal(changed.classification,'artifact');assert.equal(changed.origin.kind,'workspace');assert.equal(changed.version,2);assert.equal(changed.versions[0].content,artifact.content);
});


test('reply snapshots retain API download/history and user edits restore the ordinary artifact projection',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-provenance-api-'));
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const {artifact}=legacy(app.store);applyLegacyReplyClassification(app.store,new Date().toISOString());
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}/api`;
  const downloaded=await fetch(`${base}/artifacts/${artifact.id}/download`);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),artifact.content);
  const bootstrap=await (await fetch(`${base}/bootstrap`)).json();assert.equal(bootstrap.artifacts.find(a=>a.id===artifact.id).classification,'reply_snapshot');
  const edited=await fetch(`${base}/artifacts/${artifact.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseVersion:1,content:'User-authored document.'})});
  assert.equal(edited.status,200);const value=await edited.json();assert.equal(value.classification,'artifact');assert.equal(value.origin.kind,'user');assert.equal(value.version,2);assert.equal(value.versions[0].content,artifact.content);assert.equal(readFileSync(app.store.artifactPath(value),'utf8'),'User-authored document.');
});

test('all three old group reply files classify together without rewriting files or user revisions',t=>{
  const f=fixture(t),{task,artifact}=legacy(f.store);task.roomId='legacy-group';task.agentIds=['one','two','three'];task.artifactIds=[];task.messages=task.messages.filter(m=>m.role==='user');const started=task.events[0],complete=task.events.at(-1),agentEvents=[],saveEvents=[],files=[];
  for(let i=0;i<3;i++){
    const name=`Member ${i+1}`,content=`Unique old reply ${i+1}`,a={...artifact,id:`old-group-${i}`,name:`result-${i+1}.md`,content,versions:[{...artifact.versions[0],author:name,content}]};
    task.artifactIds.push(a.id);task.messages.push({id:`group-message-${i}`,role:'assistant',agentId:task.agentIds[i],content,createdAt:artifact.updatedAt});
    agentEvents.push({id:`group-agent-${i}`,type:'agent_completed',agentId:task.agentIds[i],label:`${name} 本轮已结束`,createdAt:artifact.updatedAt});saveEvents.push({id:`group-save-${i}`,type:'artifact_saved',label:`已保存 ${a.name}`,detail:`版本 1，${name}`,createdAt:artifact.updatedAt});f.store.writeArtifact(a);files.push(a);
  }
  f.store.delete('artifacts',artifact.id);task.events=[started,...agentEvents,...saveEvents,complete];f.store.put('tasks',task);
  assert.equal(applyLegacyReplyClassification(f.store,new Date().toISOString()),3);
  for(const a of files){assert.equal(f.store.require('artifacts',a.id).classification,'reply_snapshot');assert.equal(readFileSync(f.store.artifactPath(a),'utf8'),a.content);assert.deepEqual(f.store.require('artifacts',a.id).versions,a.versions);}
});
