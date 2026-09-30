import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {createTask} from '../server/domain.mjs';
import {buildPrompt} from '../server/runner.mjs';

async function fixture(t,executionPolicy){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-reactions-'));let app;
  const start=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,executionPolicy});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};
  await start();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'PUT')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
  const task=(mode='live')=>{const task=createTask(app.store,{prompt:'Synthetic rating fixture',mode});task.status='completed';task.messages.push({id:`reply-${task.id}`,role:'assistant',content:'Synthetic answer',createdAt:task.updatedAt});app.store.put('tasks',task);return task;};
  return {get app(){return app;},api,task,restart:async()=>{await app.close();await start();}};
}

test('reply reactions switch, persist, and revoke without creating personal knowledge or changing original output',async t=>{
  const f=await fixture(t),task=f.task(),message=task.messages.at(-1),route=`tasks/${task.id}/reaction`;
  const counts=['facts','sources','taskFeedback'].map(name=>f.app.store.list(name).length);
  let result=await f.api(route,{messageId:message.id,value:'up'});assert.equal(result.status,200);assert.equal(result.value.reaction.value,'up');
  result=await f.api(route,{messageId:message.id,value:'down',reason:'personal_context',comment:'private-rating-only'});assert.equal(result.status,200);assert.equal(result.value.reaction.value,'down');assert.equal(result.value.reaction.reason,'personal_context');
  await f.restart();const reopened=(await f.api(`tasks/${task.id}`)).value,reply=reopened.messages.at(-1);
  assert.deepEqual({...reply,reaction:undefined},{...message,reaction:undefined});assert.deepEqual(reply.reaction,result.value.reaction);
  assert.doesNotMatch(buildPrompt(reopened,[],{name:'fixture'}),/private-rating-only|personal_context/);
  assert.deepEqual(['facts','sources','taskFeedback'].map(name=>f.app.store.list(name).length),counts);
  result=await f.api(route,{messageId:message.id,value:null});assert.equal(result.status,200);assert.equal(result.value.reaction,undefined);
  await f.restart();assert.equal((await f.api(`tasks/${task.id}`)).value.messages.at(-1).reaction,undefined);
});

test('ratings reject unrelated messages, active tasks, malformed fields, and credentials without mutation',async t=>{
  const f=await fixture(t),task=f.task(),other=f.task(),message=task.messages.at(-1),route=`tasks/${task.id}/reaction`;
  await f.api('settings/provider',{apiKey:'fixture-reaction-secret'},'PUT');
  const original=structuredClone(f.app.store.require('tasks',task.id));
  const invalid=[{messageId:other.messages.at(-1).id,value:'up'},{messageId:task.messages[0].id,value:'up'},{messageId:message.id,value:'maybe'},{messageId:message.id,value:'up',reason:'other'},{messageId:message.id,value:'down',reason:'made-up'},{messageId:message.id,value:'down',comment:'fixture-reaction-secret'},{messageId:message.id,value:'down',comment:'a'.repeat(5001)},{messageId:message.id,value:'down',statement:'do not create facts'}];
  for(const body of invalid){const response=await f.api(route,body);assert.equal(response.status,400,JSON.stringify(response));assert.deepEqual(f.app.store.require('tasks',task.id),original);}
  for(const status of ['queued','running','awaiting_approval']){const active={...original,status};f.app.store.put('tasks',active);assert.equal((await f.api(route,{messageId:message.id,value:'up'})).status,409);assert.deepEqual(f.app.store.require('tasks',task.id),active);}
  f.app.store.put('tasks',original);
});

test('personal-space historical demo remains read only for reply ratings',async t=>{
  const f=await fixture(t,'personal'),task=f.task('demo');
  const result=await f.api(`tasks/${task.id}/reaction`,{messageId:task.messages.at(-1).id,value:'up'});
  assert.equal(result.status,409);assert.equal(result.value.code,'historical_demo_read_only');assert.equal(f.app.store.require('tasks',task.id).messages.at(-1).reaction,undefined);
});
