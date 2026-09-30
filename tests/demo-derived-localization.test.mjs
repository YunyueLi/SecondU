import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {ensureDemoShowcase} from '../server/demo-showcase.mjs';
import {dailyActivity} from '../server/daily-activity.mjs';
import {localizeDemoBootstrap,canonicalDemoValue} from '../shared/demo-localization.mjs';

test('English sample activities follow their task or note while imported text and personal spaces remain unchanged',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-derived-'));const store=new Store(path.join(dir,'data'));
 try{
  ensureDemoShowcase(store);
  const data={profile:store.meta('profile'),tasks:store.list('tasks'),events:store.list('events'),agents:store.list('agents'),agentRooms:store.list('agentRooms'),dailyActivities:dailyActivity(store)};
  const imported={id:'import-owned',kind:'import',title:'用户原文',summary:'保持原样',sourceIds:['original']};data.dailyActivities.push(imported);
  const en=localizeDemoBootstrap(data,'en');
  const task=en.tasks.find(x=>x.id==='demo-showcase-task-launch'),activity=en.dailyActivities.find(x=>x.taskId===task.id);
  assert.equal(activity.title,task.title);assert.doesNotMatch(activity.title+activity.summary,/[\u3400-\u9fff]/);
  for(const a of en.dailyActivities.filter(x=>x.lifeEventId)){const note=en.events.find(x=>x.id===a.lifeEventId);assert.equal(a.title,note.title);assert.equal(a.summary,note.description);}
  assert.strictEqual(en.dailyActivities.find(x=>x.id===imported.id),imported);
  assert.match(data.tasks.find(x=>x.id===task.id).title,/[\u3400-\u9fff]/);
  const personal={...data,profile:{...data.profile,demo:false}};assert.strictEqual(localizeDemoBootstrap(personal,'en'),personal);
  for(const agent of en.agents)assert.doesNotMatch(agent.name+agent.role+agent.instructions,/[\u3400-\u9fff]/);
  const planner=en.agents.find(x=>x.id==='agent-planner');assert.equal(canonicalDemoValue('agents',planner.id,{role:planner.role}).role,'把目标拆成可执行的小步');
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
