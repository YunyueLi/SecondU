import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,collections} from '../server/store.mjs';
import {createUSSeed,ensureUSDemoFiles} from '../server/demo-us.mjs';
import {publicProject} from '../server/projects.mjs';

const stamp='2026-09-30T08:30:00.000Z';
function fixture(t,options={seedLocale:'en'}){
 const root=mkdtempSync(path.join(os.tmpdir(),'secondu-us-')),store=new Store(path.join(root,'data'),options);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return {root,store};
}
test('the American life is independently authored and every example reference resolves',()=>{
 const d=createUSSeed(stamp),ids=Object.fromEntries(collections.map(key=>[key,new Set(d[key].map(row=>row.id))]));
 assert.equal(d.profile.demoLocale,'en');assert.equal(d.profile.nationality,'American');assert.equal(d.profile.selfPersonId,'demo-us-person-self');
 assert.equal(d.people.length,22);assert.equal(d.conversations.length,30);assert.equal(d.agentRooms.length,9);assert.equal(d.projects.length,4);
 assert.doesNotMatch(JSON.stringify(d),/[\p{Script=Han}]|Caspian.*(?:Hangzhou|Moonshot)|Kimi|Harness/u);
 for(const key of collections)for(const row of d[key]){
  assert.ok(row.id.startsWith('demo-us-'),`${key}/${row.id}`);
  for(const id of row.sourceIds??[])assert.ok(ids.sources.has(id),`${row.id}: source ${id}`);
  for(const id of row.personIds??[])assert.ok(ids.people.has(id),`${row.id}: person ${id}`);
  for(const id of row.agentIds??[])assert.ok(ids.agents.has(id),`${row.id}: agent ${id}`);
  for(const id of row.artifactIds??[])assert.ok(ids.artifacts.has(id),`${row.id}: artifact ${id}`);
  for(const id of row.taskIds??[])assert.ok(ids.tasks.has(id),`${row.id}: task ${id}`);
  if(row.projectId)assert.ok(ids.projects.has(row.projectId));
  if(row.listId)assert.ok(ids.goalLists.has(row.listId));
  if(row.from){assert.ok(ids.people.has(row.from));assert.ok(ids.people.has(row.to));}
  for(const entry of row.portrait?.entries??[])for(const id of entry.sourceIds)assert.ok(ids.sources.has(id));
 }
 for(const c of d.conversations){
  assert.ok(c.messages.length>=6);assert.equal(new Set(c.messages.map(m=>m.id)).size,c.messages.length);
  for(const m of c.messages){assert.ok(c.personIds.includes(m.senderId));assert.ok(ids.sources.has(m.sourceId));assert.ok(m.time<=stamp);assert.ok(d.sources.find(s=>s.id===m.sourceId).text.includes(m.content));}
 }
 for(const task of d.tasks){assert.equal(task.mode,'demo');assert.equal(task.status,'completed');assert.ok(task.updatedAt<=stamp);assert.ok(task.messages.every(m=>m.createdAt>=task.createdAt&&m.createdAt<=task.updatedAt));}
 assert.ok(d.automations.every(item=>!item.enabled&&item.mode==='demo'));
 assert.deepEqual(new Set(d.conversations.map(c=>c.platform)),new Set(['imessage','slack','whatsapp','discord','sms']));
 for(const id of d.profile.exampleTaskIds)assert.ok(ids.tasks.has(id));
});
test('six experts have individual conversations and three groups contain distinct contributions',()=>{
 const d=createUSSeed(stamp);
 for(const agent of d.agents){const rooms=d.agentRooms.filter(room=>room.kind==='direct'&&room.agentIds.includes(agent.id));assert.ok(rooms.length>=1,agent.name);assert.ok(rooms.every(room=>room.messages.some(message=>message.agentId===agent.id)&&room.messages.length>=6));}
 const groups=d.agentRooms.filter(room=>room.kind==='group');assert.equal(groups.length,3);
 for(const room of groups){assert.ok(room.agentIds.length>=3);for(const id of room.agentIds)assert.ok(room.messages.some(message=>message.agentId===id));assert.ok(room.messages.every(m=>m.createdAt<=stamp));}
});
test('personal constraints change the travel and community results and remain traceable to sources',()=>{
 const d=createUSSeed(stamp);
 for(const key of ['birthday','repair-cafe']){
  const task=d.tasks.find(t=>t.id===`demo-us-task-${key}`),event=task.events.find(e=>e.type==='context'),context=JSON.parse(event.detail);
  assert.deepEqual(context.map(item=>item.id),task.contextFactIds);
  for(const item of context)for(const id of item.sourceIds)assert.ok(d.sources.find(source=>source.id===id)?.text.length);
 }
 const birthday=d.artifacts.find(a=>a.id==='demo-us-artifact-birthday');assert.match(birthday.content,/\$592/);assert.match(birthday.content,/Sunday.*optional|Lunch is optional/s);assert.match(birthday.content,/Nothing is booked/);
 const repair=d.artifacts.find(a=>a.id==='demo-us-artifact-repair-cafe');assert.match(repair.content,/\$153/);assert.match(repair.content,/\$213/);assert.match(repair.content,/\$107/);
 for(const a of d.artifacts){assert.equal(a.versions.length,2);assert.notEqual(a.versions[0].content,a.content);assert.equal(a.versions.at(-1).content,a.content);assert.equal(a.origin.kind,'demo');}
 const draft=d.tasks.find(t=>t.id==='demo-us-task-volunteer-note');assert.equal(draft.approvals[0].status,'rejected');assert.match(draft.messages.at(-1).content,/Nothing has been sent/);
});
test('American seed and its project files persist without Chinese data or overwriting local edits',t=>{
 const {store}=fixture(t);const report=ensureUSDemoFiles(store);assert.equal(report.files.length,10);
 assert.equal(store.get('meta','demo-engineer-v4'),undefined);assert.equal(store.get('people','person-self'),undefined);
 for(const project of store.list('projects'))assert.equal(publicProject(project,store.directory).execution.status,'ready');
 for(const artifact of store.list('artifacts')){const task=store.require('tasks',artifact.taskId),project=store.require('projects',task.projectId);assert.equal(readFileSync(path.join(project.path,artifact.name),'utf8'),artifact.content);}
 const artifact=store.list('artifacts')[0],project=store.require('projects',store.require('tasks',artifact.taskId).projectId),file=path.join(project.path,artifact.name);
 writeFileSync(file,'My own notes.');const snapshot=store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();assert.equal(ensureUSDemoFiles(store),undefined);assert.equal(readFileSync(file,'utf8'),'My own notes.');assert.deepEqual(store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all(),snapshot);
});
test('American file installation does nothing in a personal space',t=>{
 const {store}=fixture(t,{seed:false,seedLocale:'en'});assert.equal(ensureUSDemoFiles(store),undefined);assert.equal(store.list('projects').length,0);assert.equal(store.get('meta','demo-us-files-v1'),undefined);
});
