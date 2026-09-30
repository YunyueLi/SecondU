import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {createTask} from '../server/domain.mjs';
import {createRoom,syncRoomTask} from '../server/rooms.mjs';

async function fixture(t,options={}){
 const directory=mkdtempSync(path.join(os.tmpdir(),'second-u-revision-'));let app;
 const start=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},...options});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));};await start();
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const api=async(route,body,method=body===undefined?'GET':'POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,value:await r.json()};};
 const task=(mode='live')=>{const task=createTask(app.store,{prompt:'Original user question',mode,approvalMode:'ask'});task.status='completed';task.threadId='original-private-runtime';task.events.push({id:'runtime-event',type:'runtime',detail:'private-provider-wire-data',createdAt:task.createdAt});task.messages.push({id:'answer-before',role:'assistant',content:'Answer before edit target',createdAt:task.createdAt},{id:'edit-target',role:'user',content:'User question to change',createdAt:task.createdAt},{id:'answer-after',role:'assistant',content:'DO-NOT-COPY-AFTER-EDIT',createdAt:task.createdAt});app.store.put('tasks',task);return task;};
 return {get app(){return app;},api,task,restart:async()=>{await app.close();await start();}};
}
const body=(extra={})=>({requestId:'request-fixture-0001',messageId:'edit-target',content:'Edited user question',run:false,...extra});

test('editing forks bounded history, keeps originals and artifacts, persists lineage, and is idempotent',async t=>{
 const f=await fixture(t),source=f.task();source.artifactIds=['original-artifact'];f.app.store.put('tasks',source);f.app.store.put('artifacts',{id:'original-artifact',taskId:source.id,name:'original.md',content:'Original artifact',version:1});
 const result=await f.api(`tasks/${source.id}/revise`,body());assert.equal(result.status,201);const fork=result.value.task;assert.notEqual(fork.id,source.id);assert.equal(fork.status,'queued');assert.deepEqual(fork.forkedFrom,{taskId:source.id,messageId:'edit-target'});assert.deepEqual(fork.messages.map(m=>m.content),['Original user question','Answer before edit target','Edited user question']);assert.equal(fork.threadId,undefined);assert.deepEqual(fork.artifactIds,[]);assert.deepEqual(fork.approvals,[]);assert.doesNotMatch(JSON.stringify(fork),/DO-NOT-COPY|private-runtime|private-provider/);
 const original=f.app.store.require('tasks',source.id);assert.deepEqual({...original,revisionTaskIds:undefined},{...source,revisionTaskIds:undefined});assert.deepEqual(original.revisionTaskIds,[fork.id]);assert.equal(f.app.store.require('artifacts','original-artifact').content,'Original artifact');
 await f.restart();const replay=await f.api(`tasks/${source.id}/revise`,body());assert.equal(replay.value.reused,true);assert.equal(replay.value.task.id,fork.id);assert.equal(f.app.store.list('tasks').length,2);
 assert.equal((await f.api(`tasks/${source.id}/revise`,body({content:'Different content'}))).status,409);
 assert.equal((await f.api(`tasks/${source.id}`,{},'DELETE')).status,409);assert.equal((await f.api(`tasks/${fork.id}`,{},'DELETE')).status,409);
});

test('first-message edits change the prompt and do not inherit any later conversation',async t=>{
 const f=await fixture(t),source=f.task();const response=await f.api(`tasks/${source.id}/revise`,body({messageId:source.messages[0].id,content:'New first question'}));assert.equal(response.status,201);assert.equal(response.value.task.prompt,'New first question');assert.deepEqual(response.value.task.messages.map(m=>m.content),['New first question']);
});

test('room branches retain the exact earlier prefix without duplicates or later adjacent messages',async t=>{
 const f=await fixture(t),stamp=new Date().toISOString();f.app.store.put('agents',{id:'fixture-agent',name:'Fixture',role:'Review',instructions:'Synthetic',createdAt:stamp});
 const room=createRoom(f.app.store,{agentIds:['fixture-agent'],mode:'live'});room.messages.push({id:'prior-room-message',role:'user',content:'An earlier room task',createdAt:stamp,taskId:'prior-task',taskMessageId:'prior-user'});f.app.store.put('agentRooms',room);
 const source=f.task();source.roomId=room.id;source.agentIds=['fixture-agent'];f.app.store.put('tasks',source);syncRoomTask(f.app.store,source);
 const full=f.app.store.require('agentRooms',room.id);full.messages.push({id:'unrelated-after',role:'user',content:'AFTER-ROOM-TARGET',createdAt:stamp});f.app.store.put('agentRooms',full);
 const response=await f.api(`tasks/${source.id}/revise`,body());assert.equal(response.status,201);const fork=response.value;
 assert.notEqual(fork.room.id,room.id);assert.equal(fork.task.roomId,fork.room.id);assert.deepEqual(fork.room.forkedFrom,{roomId:room.id,messageId:'room-edit-target'});assert.deepEqual(fork.room.messages.map(m=>m.content),['An earlier room task','Original user question','Answer before edit target','Edited user question']);assert.equal(new Set(fork.room.messages.map(m=>m.id)).size,4);assert.equal(fork.room.messages.at(-1).taskId,fork.task.id);assert.deepEqual(f.app.store.require('agentRooms',room.id),full);
});

test('permissions are fixed to the stricter original policy and mutable runtime state is never copied',async t=>{
 const f=await fixture(t),source=f.task();source.approvalMode=null;source.resolvedApprovalMode='ask';source.contextUsage={private:'DO-NOT-COPY'};source.teamRuns=[{id:'old-team-run'}];f.app.store.put('tasks',source);f.app.store.setMeta('executionSettings',{approvalMode:'full'});
 const response=await f.api(`tasks/${source.id}/revise`,body());assert.equal(response.status,201);assert.equal(response.value.task.approvalMode,'ask');assert.equal(response.value.task.resolvedApprovalMode,undefined);assert.equal(response.value.task.contextUsage,undefined);assert.equal(response.value.task.teamRuns,undefined);
});

test('bad scope, active/remote tasks and credential-bearing input fail without creating a branch',async t=>{
 const f=await fixture(t),source=f.task();f.app.store.setKey(f.app.store.connection(),'fixture-sensitive-revision-key');const originalCount=f.app.store.list('tasks').length;
 for(const extra of [{messageId:'not-this-task'},{messageId:'answer-before'},{content:'fixture-sensitive-revision-key'},{content:''},{apiKey:'not-allowed'},{approvalMode:'full'},{run:'true'},{requestId:'x'}])assert.equal((await f.api(`tasks/${source.id}/revise`,body(extra))).status,400,JSON.stringify(extra));
 for(const status of ['running','awaiting_approval']){f.app.store.put('tasks',{...source,status});assert.equal((await f.api(`tasks/${source.id}/revise`,body())).status,409);}
 f.app.store.put('tasks',{...source,remoteExecution:{runId:'remote'}});assert.equal((await f.api(`tasks/${source.id}/revise`,body())).status,409);assert.equal(f.app.store.list('tasks').length,originalCount);
 assert.equal((await f.api('tasks/not-in-this-space/revise',body())).status,404);
});

test('demo branches are previewable but cannot execute, including with an undefined fixture policy',async t=>{
 const f=await fixture(t),source=f.task('demo');const attempt=await f.api(`tasks/${source.id}/revise`,body({run:true}));assert.equal(attempt.status,409);
 const preview=await f.api(`tasks/${source.id}/revise`,body());assert.equal(preview.status,201);assert.equal(preview.value.task.mode,'demo');assert.equal((await f.api(`tasks/${preview.value.task.id}/run`,{})).status,409);
});

test('showcase policy permits an edit draft but rejects execution before creating a branch',async t=>{
 const f=await fixture(t,{executionPolicy:'showcase'}),source=f.task();const denied=await f.api(`tasks/${source.id}/revise`,body({run:true}));assert.equal(denied.status,403);assert.equal(f.app.store.list('tasks').length,1);assert.equal((await f.api(`tasks/${source.id}/revise`,body())).status,201);
});

test('a start failure preserves one retryable draft and repeated requests never execute it again',async t=>{
 const f=await fixture(t),source=f.task();let attempts=0;const originalStart=f.app.runner.start.bind(f.app.runner);f.app.runner.start=()=>{attempts++;throw Object.assign(new Error('Synthetic unavailable runtime'),{status:409,code:'fixture_unavailable'});};
 const first=await f.api(`tasks/${source.id}/revise`,body({run:true}));assert.equal(first.status,201);assert.equal(first.value.task.status,'queued');assert.equal(first.value.startError.code,'fixture_unavailable');assert.equal(attempts,1);
 const second=await f.api(`tasks/${source.id}/revise`,body({run:true}));assert.equal(second.value.reused,true);assert.equal(second.value.task.id,first.value.task.id);assert.equal(attempts,1);
 f.app.runner.start=originalStart;const retry=await f.api(`tasks/${first.value.task.id}/run`,{});assert.equal(retry.status,200);assert.equal(retry.value.status,'needs_input');assert.equal(f.app.store.list('tasks').length,2);
});

test('a revised live question starts once with fresh runtime context and the original bounded configuration',async t=>{
 const calls=[];const f=await fixture(t,{runCodex:async args=>{calls.push(args);return {text:'New branch answer',threadId:'new-thread'};}}),source=f.task();f.app.store.setKey(f.app.store.connection(),'synthetic-revision-key');
 const response=await f.api(`tasks/${source.id}/revise`,body({run:true}));assert.equal(response.status,201);await f.app.runner.active.get(response.value.task.id)?.promise;
 const task=f.app.store.require('tasks',response.value.task.id);assert.equal(task.status,'completed',task.error);assert.equal(calls.length,1);assert.equal(calls[0].threadId,undefined);assert.equal(calls[0].approvalMode,'ask');assert.match(calls[0].prompt,/Edited user question/);assert.doesNotMatch(calls[0].prompt,/DO-NOT-COPY-AFTER-EDIT/);assert.equal(task.messages.at(-1).content,'New branch answer');
 const repeated=await f.api(`tasks/${source.id}/revise`,body({run:true}));assert.equal(repeated.value.task.id,task.id);assert.equal(calls.length,1);assert.equal(f.app.store.require('tasks',source.id).messages.at(-1).content,'DO-NOT-COPY-AFTER-EDIT');
});

test('credential-bearing historical context is not copied even when the edit itself is harmless',async t=>{
 const f=await fixture(t),source=f.task();f.app.store.setKey(f.app.store.connection(),'synthetic-context-secret');source.roomContext=[{role:'user',content:'synthetic-context-secret'}];f.app.store.put('tasks',source);
 assert.equal((await f.api(`tasks/${source.id}/revise`,body())).status,400);assert.equal(f.app.store.list('tasks').length,1);
});
