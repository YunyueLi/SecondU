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
 for(const [route,body,method] of [[`tasks/${task.id}/run`],[`tasks/${task.id}/message`,{content:'run'}],['tasks',{prompt:'real',mode:'live'}],['agent-rooms/missing/messages',{content:'run'}],['automations/missing/run'],['connectors/missing/test'],['connectors/missing/oauth/start'],['connectors/missing/oauth/refresh'],['connectors/missing/oauth/revoke'],['agent-resources/missing/probe'],['im-connections/missing/probe'],['im-connections/missing/preview'],['im-outbox/missing/send'],['model-connections/missing/test'],['settings/provider/test'],['projects/choose-directory'],['projects/missing/files',{},'GET'],['artifacts',{taskId:task.id,name:'file.md',content:'text'}],['automations',{title:'timer',prompt:'run',mode:'demo',trigger:'interval',intervalMinutes:1,enabled:true}]]){const response=await f.api(route,body??{},method);assert.equal(response.status,403,`${route}: ${JSON.stringify(response.value)}`);assert.equal(response.value.code,'showcase_read_only');}
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
