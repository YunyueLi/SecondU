import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';

for(const status of ['needs_input','interrupted'])test(`group ${status} continuation and the next new turn keep the saved digital twin choice`,async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-room-settings-')),calls=[];
  const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:true},runCodex:async input=>{calls.push(input.prompt);return {text:'Fixture answer',threadId:`fixture-${calls.length}`};}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method='POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,`${route}: ${r.status} ${JSON.stringify(value)}`);return value;};
  const settle=async id=>{for(let n=0;n<200;n++){if(!app.runner.active.has(id))return app.store.require('tasks',id);await new Promise(resolve=>setTimeout(resolve,5));}throw Error('fixture did not settle');};
  await api('settings/provider',{apiKey:'fixture-not-a-real-key'},'PUT');
  app.store.put('facts',{id:'fixture-identity',kind:'identity',statement:'仅供测试的确认身份',status:'confirmed',version:1,sourceIds:[]});
  const room=await api('agent-rooms',{kind:'group',agentIds:['agent-planner','agent-reviewer'],mode:'live',digitalTwinEnabled:true});
  const initial=await api(`agent-rooms/${room.id}/tasks`,{prompt:'你好',digitalTwinEnabled:true});
  // A persisted idle checkpoint represents an interrupted or input-waiting run.
  app.store.put('tasks',{...initial.task,status,threadId:'old-context-thread'});
  const messagesBefore=app.store.require('agentRooms',room.id).messages;
  await api(`tasks/${initial.task.id}`,{digitalTwinEnabled:false},'PUT');
  await api(`agent-rooms/${room.id}`,{digitalTwinEnabled:false},'PUT');
  assert.equal(app.store.require('tasks',initial.task.id).threadId,undefined);
  assert.deepEqual(app.store.require('agentRooms',room.id).messages,messagesBefore);
  assert.deepEqual(app.store.require('agentRooms',room.id).agentIds,room.agentIds);
  await api(`tasks/${initial.task.id}/message`,{content:'解释一下'});
  const continued=await settle(initial.task.id);
  assert.equal(continued.digitalTwinEnabled,false);
  assert.deepEqual(JSON.parse(continued.events.filter(e=>e.type==='context').at(-1).detail),[]);
  assert.equal(calls.length,2,'both group members ran through the local fixture');
  calls.forEach(prompt=>assert.doesNotMatch(prompt,/仅供测试的确认身份|用户档案（/));
  const next=await api(`agent-rooms/${room.id}/messages`,{content:'你好'});
  await settle(next.task.id);
  assert.notEqual(next.task.id,initial.task.id);
  assert.equal(next.task.digitalTwinEnabled,false,'the next task inherits the room setting');
  assert.deepEqual(app.store.require('agentRooms',room.id).agentIds,room.agentIds);
});
