import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {createTask} from '../server/domain.mjs';
import {ENGINEER_SPACE} from '../server/demo-space.mjs';

async function fixture(t,executionPolicy,seed=true){const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-policy-'));let calls=0;const app=createApp({dataDir:directory,seed,executionPolicy,scheduler:true,computerInfo:{codexAvailable:true},runCodex:async()=>{calls++;return{text:'must not run'};},runImCli:async()=>{calls++;throw Error('must not run');},runResourceCli:async()=>{calls++;throw Error('must not run');},chooseDirectory:async()=>{calls++;return '/tmp';}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});const api=async(route,body={},method='POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};return {app,api,get calls(){return calls;}};}

test('showcase blocks every execution boundary before model, OAuth, connectors, communication, files, or schedules run',async t=>{
 const f=await fixture(t,'showcase'),task=createTask(f.app.store,{prompt:'Fixture',mode:'demo'});
 for(const [route,body,method] of [[`tasks/${task.id}/run`],[`tasks/${task.id}/message`,{content:'run'}],['tasks',{prompt:'real',mode:'live'}],['agent-rooms/missing/messages',{content:'run'}],['automations/missing/run'],['connectors/missing/test'],['connectors/missing/oauth/start'],['connectors/missing/oauth/refresh'],['connectors/missing/oauth/revoke'],['agent-resources/missing/probe'],['im-connections/missing/probe'],['im-connections/missing/preview'],['im-outbox/missing/send'],['model-connections/missing/test'],['settings/provider/test'],['projects/choose-directory'],['projects/missing/files',{},'GET'],['automations',{title:'timer',prompt:'run',mode:'demo',trigger:'interval',intervalMinutes:1,enabled:true}]]){const response=await f.api(route,body??{},method);assert.equal(response.status,403,`${route}: ${JSON.stringify(response.value)}`);assert.equal(response.value.code,'showcase_read_only');}
 const exampleProject=f.app.store.list('projects').find(project=>project.id.startsWith('showcase-'))??f.app.store.list('projects')[0];assert.equal((await f.api(`projects/${exampleProject.id}/files`,{},'GET')).status,200);
 assert.equal(f.app.runner.timer,undefined);f.app.store.put('automations',{id:'old-enabled',enabled:true,mode:'live',trigger:'interval',nextRunAt:'2020-01-01T00:00:00.000Z',intervalMinutes:1,title:'old',prompt:'run',agentIds:[]});const before=f.app.store.list('tasks').length;f.app.runner.tick();f.app.runner.sourceImported({title:'source',text:'data'});assert.equal(f.app.store.list('tasks').length,before);assert.equal(f.calls,0);assert.throws(()=>f.app.runner.start(task.id),error=>error.code==='showcase_read_only');assert.equal((await f.api('bootstrap',{},'GET')).value.executionPolicy,'showcase');
});

test('personal space creates live tasks only and never executes or converts historical demo records',async t=>{
 const f=await fixture(t,'personal',false);assert.equal((await f.api('tasks',{prompt:'real'})).value.mode,'live');assert.equal((await f.api('tasks',{prompt:'example',mode:'demo'})).status,400);
 const old=createTask(f.app.store,{prompt:'old fixture',mode:'demo'});
 for(const [route,body,method] of [[`tasks/${old.id}/run`],[`tasks/${old.id}/message`,{content:'continue'}],[`tasks/${old.id}`,{mode:'live'},'PUT']])assert.equal((await f.api(route,body??{},method)).status,409);
 f.app.store.put('automations',{id:'old-demo',enabled:true,mode:'demo',trigger:'interval',nextRunAt:'2020-01-01T00:00:00.000Z',intervalMinutes:1,title:'old',prompt:'run',agentIds:[]});const before=f.app.store.list('tasks').length;f.app.runner.tick();assert.equal(f.app.store.list('tasks').length,before);assert.equal((await f.api('automations/old-demo/run')).status,409);assert.equal(f.calls,0);assert.equal(f.app.store.require('tasks',old.id).mode,'demo');
});

test('production auto policy and nested spaces expose explicit, separate boundaries',async t=>{
 const f=await fixture(t,'auto');assert.equal((await f.api('bootstrap',{},'GET')).value.executionPolicy,'showcase');await f.api('spaces/personal',{});const personal=await f.api('spaces/personal/bootstrap',{},'GET');assert.equal(personal.value.executionPolicy,'personal');assert.equal(personal.value.profile.demo,false);assert.equal((await f.api('spaces/personal/tasks',{prompt:'no demo',mode:'demo'})).status,400);
 await f.api(`spaces/${ENGINEER_SPACE}`,{});assert.equal((await f.api(`spaces/${ENGINEER_SPACE}/bootstrap`,{},'GET')).value.executionPolicy,'showcase');assert.equal((await f.api(`spaces/${ENGINEER_SPACE}/connectors/missing/oauth/start`)).status,403);
 assert.equal((await f.api('spaces/not-a-space/tasks',{prompt:'run',mode:'live'})).status,404);
});


test('showcase configuration and document editing stay interactive while all execution remains blocked',async t=>{
 const f=await fixture(t,'showcase');
 const beforeTasks=f.app.store.list('tasks').length;
 const saved=await f.api('model-connections',{name:'Preview model',provider:'openai',model:'gpt-4.1',baseUrl:'https://api.openai.com/v1',api:'responses',apiKey:'fixture-preview-key'});
 assert.equal(saved.status,201);assert.equal(saved.value.hasKey,true);assert.equal(saved.value.apiKey,undefined);
 const task=createTask(f.app.store,{prompt:'Editable example',mode:'demo'});
 const configured=await f.api(`tasks/${task.id}`,{connectionId:saved.value.id,digitalTwinEnabled:false},'PUT');
 assert.equal(configured.status,200);assert.equal(configured.value.connectionId,saved.value.id);assert.equal(configured.value.digitalTwinEnabled,false);assert.equal(configured.value.mode,'demo');
 const artifact=await f.api('artifacts',{taskId:task.id,name:'preview-plan.md',content:'# Draft\nReview before execution.'});
 assert.equal(artifact.status,201);
 const revised=await f.api(`artifacts/${artifact.value.id}`,{content:'# Revised plan',baseVersion:artifact.value.version},'PUT');
 assert.equal(revised.status,200);assert.equal(revised.value.content,'# Revised plan');
 const automation=await f.api('automations',{title:'Editable schedule',prompt:'Prepare a project report',mode:'demo',trigger:'daily',time:'09:00',enabled:false});
 assert.equal(automation.status,201);assert.equal(automation.value.enabled,false);
 for(const [route,body] of [[`tasks/${task.id}/message`,{content:'Please execute'}],[`tasks/${task.id}/run`,{}],[`model-connections/${saved.value.id}/test`,{}],[`automations/${automation.value.id}/run`,{}]]){
  const response=await f.api(route,body);assert.equal(response.status,403,route);assert.equal(response.value.code,'showcase_read_only');
 }
 assert.equal(f.app.store.list('tasks').length,beforeTasks+1);assert.equal(f.app.store.require('tasks',task.id).messages.length,1);assert.equal(f.calls,0);assert.equal(f.app.runner.timer,undefined);
 assert.doesNotMatch(JSON.stringify((await f.api('export',{},'GET')).value),/fixture-preview-key/);
});

test('example direct and team rooms save local configuration without creating tasks or enabling execution',async t=>{
 const f=await fixture(t,'showcase');
 const agents=f.app.store.list('agents').slice(0,3);assert.equal(agents.length,3);
 const beforeTasks=f.app.store.list('tasks');
 const direct=await f.api('agent-rooms',{kind:'direct',agentIds:[agents[0].id],mode:'demo'});
 assert.equal(direct.status,201);assert.equal(direct.value.mode,'demo');assert.deepEqual(direct.value.messages,[]);
 const group=await f.api('agent-rooms',{title:'Synthetic configurable team',kind:'group',agentIds:agents.slice(0,2).map(x=>x.id),mode:'demo',team:{leadAgentId:agents[1].id}});
 assert.equal(group.status,201);assert.equal(group.value.team.leadAgentId,agents[1].id);
 const edited=await f.api(`agent-rooms/${group.value.id}`,{title:'Updated synthetic team',kind:'group',agentIds:agents.map(x=>x.id),mode:'demo',team:{leadAgentId:agents[2].id}},'PUT');
 assert.equal(edited.status,200);assert.equal(edited.value.title,'Updated synthetic team');assert.equal(edited.value.team.leadAgentId,agents[2].id);
 assert.deepEqual((await f.api(`agent-rooms/${group.value.id}`,{},'GET')).value,edited.value);
 for(const room of [direct.value,group.value]){
  for(const action of ['messages','tasks']){const result=await f.api(`agent-rooms/${room.id}/${action}`,{content:'Execute',prompt:'Execute',run:true});assert.equal(result.status,403);assert.equal(result.value.code,'showcase_read_only');}
  assert.equal((await f.api(`agent-rooms/${room.id}`,{mode:'live'},'PUT')).status,403);
 }
 assert.deepEqual(f.app.store.list('tasks'),beforeTasks);assert.equal(f.calls,0);
 assert.equal((await f.api(`spaces/personal/agent-rooms/${group.value.id}`,{},'GET')).status,404);
});
