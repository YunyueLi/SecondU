import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {saveConnector} from '../server/connectors.mjs';

async function fixture(t){
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-task-config-'));
  const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method='POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  return {app,api};
}

test('task and room creation preserve explicit personal-context choice and legacy absence',async t=>{
  const {api,app}=await fixture(t);
  for(const value of [undefined,true,false]){
    const task=await api('tasks',{prompt:'fixture',mode:'demo',...(value===undefined?{}:{digitalTwinEnabled:value})});
    assert.equal(task.status,201);assert.equal(task.value.digitalTwinEnabled,value);
    assert.equal(Object.hasOwn(task.value,'digitalTwinEnabled'),value!==undefined);
    const room=await api('agent-rooms',{agentIds:['agent-planner'],digitalTwinEnabled:value});
    assert.equal(room.status,201);
    const sent=await api(`agent-rooms/${room.value.id}/tasks`,{prompt:'fixture'});
    assert.equal(sent.status,201);assert.equal(sent.value.task.digitalTwinEnabled,value);
  }
  assert.equal((await api('tasks',{prompt:'fixture',mode:'demo',digitalTwinEnabled:'false'})).status,400);
  assert.equal((await api('agent-rooms',{agentIds:['agent-planner'],digitalTwinEnabled:1})).status,400);
  const connector=saveConnector(app.store,{kind:'library',name:'Local sources'});
  const room=(await api('agent-rooms',{agentIds:['agent-planner'],digitalTwinEnabled:true,connectorIds:[connector.id]})).value;
  const sent=await api(`agent-rooms/${room.id}/tasks`,{prompt:'fixture',digitalTwinEnabled:false});
  assert.equal(sent.value.task.digitalTwinEnabled,false);assert.deepEqual(sent.value.task.connectorIds,[connector.id]);
});

test('idle configuration changes clear only runtime bindings and retain conversation history',async t=>{
  const {api,app}=await fixture(t),store=app.store;
  const task=(await api('tasks',{prompt:'original message',mode:'demo'})).value;
  task.status='completed';task.threadId='old-thread';task.artifactIds=['preserved-artifact'];
  store.put('tasks',task);store.put('runtime',{id:`${task.id}:agent-planner`,threadId:'old-thread'});store.put('runtime',{id:'other-task:agent-planner',threadId:'other-thread'});
  const connection=(await api('model-connections',{name:'Test only',provider:'custom',model:'fixture',baseUrl:'https://example.com/v1',api:'responses',reasoningEffort:'low'})).value;
  const connector=saveConnector(store,{kind:'library',name:'Sources'});
  const edited=await api(`tasks/${task.id}`,{mode:'live',connectionId:connection.id,digitalTwinEnabled:false,connectorIds:[connector.id]},'PUT');
  assert.equal(edited.status,200);assert.equal(edited.value.connectionId,connection.id);assert.equal(edited.value.mode,'live');assert.equal(edited.value.digitalTwinEnabled,false);
  assert.equal(edited.value.threadId,undefined);assert.equal(store.get('runtime',`${task.id}:agent-planner`),undefined);assert.equal(store.require('runtime','other-task:agent-planner').threadId,'other-thread');
  assert.deepEqual(edited.value.messages,task.messages);assert.deepEqual(edited.value.artifactIds,task.artifactIds);
  assert.equal((await api(`tasks/${task.id}`,{connectionId:null},'PUT')).value.connectionId,undefined);
  const before=store.require('tasks',task.id);
  assert.equal((await api(`tasks/${task.id}`,{title:'must not partially save',digitalTwinEnabled:'false'},'PUT')).status,400);
  assert.deepEqual(store.require('tasks',task.id),before);
});

test('running and approval-waiting tasks reject configuration edits',async t=>{
  const {api,app}=await fixture(t);
  const task=(await api('tasks',{prompt:'fixture',mode:'demo'})).value;
  for(const status of ['running','awaiting_approval']){
    task.status=status;app.store.put('tasks',task);
    const result=await api(`tasks/${task.id}`,{mode:'live',digitalTwinEnabled:true},'PUT');
    assert.equal(result.status,409);assert.equal(result.value.code,'task_active');assert.equal(app.store.require('tasks',task.id).mode,'demo');
  }
});


test('a room awaiting input can update only future-turn configuration while preserving pending membership',async t=>{
 const {api,app}=await fixture(t);
 const room=(await api('agent-rooms',{agentIds:['agent-planner'],mode:'live'})).value;
 const task=(await api(`agent-rooms/${room.id}/messages`,{content:'fixture'})).value.task;
 assert.equal(task.status,'needs_input');
 const result=await api(`agent-rooms/${room.id}`,{mode:'demo',digitalTwinEnabled:false},'PUT');
 assert.equal(result.status,200);assert.equal(result.value.digitalTwinEnabled,false);assert.equal(result.value.mode,'demo');
 assert.equal((await api(`agent-rooms/${room.id}`,{title:'blocked structural change'},'PUT')).status,409);
 for(const status of ['running','awaiting_approval']){app.store.put('tasks',{...task,status});assert.equal((await api(`agent-rooms/${room.id}`,{digitalTwinEnabled:true},'PUT')).status,409);}
});
