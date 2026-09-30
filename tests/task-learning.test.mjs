import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server/index.mjs';
import {personalContextFor} from '../server/personal-context.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-feedback-'));let app;const calls=[];
 const start=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:true},runCodex:async input=>{calls.push(input);return{text:'  Fixture original reply.\n',threadId:`fixture-${calls.length}`};}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};
 await start();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
 const task=async(prompt='帮我写活动介绍',extra={})=>{const response=await api('tasks',{prompt,mode:'live',digitalTwinEnabled:true,...extra});assert.equal(response.status,201);await api(`tasks/${response.value.id}/run`,{});for(let n=0;n<200&&app.runner.active.has(response.value.id);n++)await new Promise(resolve=>setTimeout(resolve,5));return app.store.require('tasks',response.value.id);};
 await api('settings/provider',{apiKey:'fixture-feedback-key'},'PUT');
 return {get app(){return app;},api,task,calls,restart:async()=>{await app.close();await start();}};
}

test('feedback keeps four exact layers, remains candidate until confirmation, then informs a scoped new task after restart',async t=>{
 const f=await fixture(t),task=await f.task(),original=task.messages.at(-1);
 const first=(await f.api('artifacts',{taskId:task.id,name:'draft.txt',content:'  Original artifact\n'})).value;
 const second=(await f.api(`artifacts/${first.id}`,{baseVersion:1,content:'  Adopted revision\n'},'PUT')).value;
 const body={requestId:'four-layers',messageId:original.id,artifact:{id:first.id,version:1},feedback:'  开头太长，先写行动。\n',statement:'活动文案开头直接给一个行动，不写背景铺垫。',kind:'preference',preferenceDomain:'work',scope:{domain:'personal',purpose:'writing'},adoption:{confirmed:true,artifact:{id:second.id,version:2}},outcome:{text:'  我已经采用第二版。\n'}};
 const response=await f.api(`tasks/${task.id}/feedback`,body);assert.equal(response.status,201,JSON.stringify(response.value));const saved=response.value;
 assert.equal(saved.original.message.content,original.content);assert.equal(saved.original.message.sha256,hash(original.content));assert.equal(saved.original.artifact.content,first.content);assert.equal(saved.original.artifact.sha256,hash(first.content));assert.equal(saved.adoption.artifact.content,second.content);assert.equal(saved.adoption.confirmedBy,'user');assert.equal(saved.outcome.status,'user_reported');assert.equal(saved.correction.text,body.feedback);assert.equal(saved.context.userMessage.content,task.prompt);assert.equal(saved.context.personalContext.status,'recorded');assert.equal(saved.context.personalContext.eventId,original.contextEventIds.personal_context);assert.equal(saved.factStatus,'candidate');
 const counts=['sources','facts','taskFeedback'].map(name=>f.app.store.list(name).length);
 assert.equal((await f.api(`tasks/${task.id}/feedback`,body)).value.id,saved.id);assert.deepEqual(['sources','facts','taskFeedback'].map(name=>f.app.store.list(name).length),counts);
 assert.equal((await f.api(`tasks/${task.id}/feedback`,{...body,statement:'修改后的内容'})).status,409);
 assert.ok(!personalContextFor(f.app.store,task).facts.some(fact=>fact.id===saved.factId));
 const confirmed=await f.api(`facts/${saved.factId}`,{status:'confirmed',baseVersion:1,reason:'本人确认'},'PUT');assert.equal(confirmed.status,200);
 await f.restart();const persisted=(await f.api(`task-feedback/${saved.id}`)).value;assert.deepEqual(persisted.original,saved.original);assert.equal(persisted.factStatus,'confirmed');assert.equal(persisted.factVersion,2);
 await f.task('写一个无关主题的简短介绍');const snapshot=JSON.parse(f.calls.at(-1).prompt.split('用户档案与个人上下文（本轮版本）：')[1].split('\n\n')[0]);assert.ok(snapshot.facts.some(fact=>fact.id===saved.factId&&fact.version===2));assert.ok(snapshot.learnings.some(record=>record.id===saved.id));assert.match(f.calls.at(-1).prompt,/活动文案开头直接给一个行动/);
 const projectTask={...task,prompt:'修复代码接口',messages:[{role:'user',content:'修复代码接口'}],contextRequest:{domain:'project',purpose:'assistance'}};assert.ok(!personalContextFor(f.app.store,projectTask).facts.some(fact=>fact.id===saved.factId));
 assert.equal((await f.api(`tasks/${task.id}`,{},'DELETE')).status,409);assert.equal((await f.api(`artifacts/${first.id}`,{},'DELETE')).status,409);assert.equal((await f.api(`facts/${saved.factId}`,{},'DELETE')).status,409);
 assert.equal((await f.api('export')).value.taskFeedback.length,1);
});

test('invalid references, adoption, kind, and credential content roll back feedback atomically',async t=>{
 const f=await fixture(t),task=await f.task(),other=await f.task('另一个任务'),artifact=(await f.api('artifacts',{taskId:other.id,name:'other.txt',content:'Different task'})).value;
 const base={requestId:'invalid',messageId:task.messages.at(-1).id,feedback:'纠正',statement:'以后简短'};
 const before=['sources','facts','taskFeedback'].map(name=>f.app.store.list(name).length);
 for(const body of [{...base,messageId:other.messages.at(-1).id},{...base,messageId:task.messages[0].id},{...base,artifact:{id:artifact.id,version:1}},{...base,adoption:{text:'采用',confirmed:false}},{...base,kind:'constraint',preferenceDomain:'work'},{...base,feedback:'fixture-feedback-key'}]){const result=await f.api(`tasks/${task.id}/feedback`,body);assert.equal(result.status,400,JSON.stringify(result));assert.deepEqual(['sources','facts','taskFeedback'].map(name=>f.app.store.list(name).length),before);}
 const originalTask=f.app.store.require('tasks',task.id);f.app.store.put('tasks',{...originalTask,status:'running'});assert.equal((await f.api(`tasks/${task.id}/feedback`,base)).status,409);f.app.store.put('tasks',originalTask);
});
