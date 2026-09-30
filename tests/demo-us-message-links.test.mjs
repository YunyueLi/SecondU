import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/index.mjs';
import {createUSSeed,ensureUSDemoFiles} from '../server/demo-us.mjs';
import {ensureUSMessageLinks,US_MESSAGE_LINKS_MARKER} from '../server/demo-us-message-links.mjs';

function fixture(t,options={seedLocale:'en'}){
 const root=mkdtempSync(path.join(os.tmpdir(),'secondu-us-history-')),store=new Store(path.join(root,'data'),options);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return {root,store};
}
const rows=store=>store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();

test('US initialization indexes all original messages without adding replies, execution or artifacts',t=>{
 const {store}=fixture(t),originalRooms=store.list('agentRooms');
 ensureUSDemoFiles(store);
 const report=store.meta(US_MESSAGE_LINKS_MARKER);
 assert.equal(report.kind,'authored_room_history_index');assert.equal(report.indexed.length,9);assert.equal(report.preserved.length,0);
 assert.equal(store.list('tasks').length,17);assert.equal(store.list('artifacts').length,6);
 let users=0;
 for(const original of originalRooms){
  const room=store.require('agentRooms',original.id),record=report.indexed.find(item=>item.roomId===room.id),task=store.require('tasks',record.taskId);
  assert.equal(task.mode,'demo');assert.equal(task.status,'completed');assert.equal(task.interaction,'chat');assert.equal(task.roomId,room.id);
  assert.equal(task.createdAt,original.createdAt);assert.equal(task.updatedAt,original.updatedAt);
  assert.deepEqual(task.events,[]);assert.deepEqual(task.artifactIds,[]);assert.deepEqual(task.approvals,[]);
  assert.deepEqual(room.taskIds,[...original.taskIds,task.id]);assert.equal(room.activeTaskId,original.activeTaskId);
  assert.deepEqual(room.messages.map(({taskId,taskMessageId,...message})=>message),original.messages);
  for(const message of room.messages){
   const target=task.messages.find(item=>item.id===message.taskMessageId);
   assert.ok(target);assert.equal(message.taskId,task.id);assert.equal(target.role,message.role);assert.equal(target.content,message.content);assert.equal(target.createdAt,message.createdAt);
   if(message.role==='user')users++;
  }
 }
 assert.equal(users,24);
 const before=rows(store);ensureUSDemoFiles(store);assert.deepEqual(rows(store),before);
});

test('index migration preserves changed or removed conversations, occupied IDs and original tasks',t=>{
 const {store}=fixture(t),original=createUSSeed(),rooms=original.agentRooms;
 store.setMeta('demo-us-files-v1',{root:'/unused-synthetic-root'});
 const changed=structuredClone(rooms[0]);changed.messages[0].content='User-authored correction';store.put('agentRooms',changed);
 const appended=structuredClone(rooms[1]);appended.messages.push({id:'user-added',role:'user',content:'Keep this appended message',createdAt:'2026-10-01T00:00:00.000Z'});store.put('agentRooms',appended);
 store.delete('agentRooms',rooms[2].id);
 const occupiedId=`demo-us-history-${rooms[3].id.slice('demo-us-room-'.length)}`,occupied={id:occupiedId,title:'Existing record must remain',messages:[]};store.put('tasks',occupied);
 const originals=store.list('tasks');
 const report=ensureUSMessageLinks(store);
 assert.deepEqual(store.require('agentRooms',changed.id),changed);assert.deepEqual(store.require('agentRooms',appended.id),appended);
 assert.equal(store.get('agentRooms',rooms[2].id),undefined);assert.deepEqual(store.require('tasks',occupiedId),occupied);
 assert.equal(report.preserved.find(item=>item.roomId===rooms[2].id).reason,'room_removed');
 assert.equal(report.preserved.find(item=>item.roomId===rooms[3].id).reason,'task_id_collision');
 for(const task of originals)assert.deepEqual(store.require('tasks',task.id),task);
 // A later removal is never reconstructed during startup or re-entry.
 const indexed=report.indexed[0];store.delete('tasks',indexed.taskId);const before=rows(store);ensureUSMessageLinks(store);assert.deepEqual(rows(store),before);
});

test('personal and Chinese stores receive no US index records or marker',t=>{
 for(const options of [{seed:false,seedLocale:'en'},{seedLocale:'zh-CN'}]){
  const {store}=fixture(t,options),before=rows(store);assert.equal(ensureUSMessageLinks(store),undefined);assert.deepEqual(rows(store),before);assert.equal(store.get('meta',US_MESSAGE_LINKS_MARKER),undefined);
 }
});

test('a linked English room message forks through the real API at the selected turn without changing originals',async t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'secondu-us-history-api-'));let calls=0;
 const app=createApp({dataDir:path.join(root,'data'),seedLocale:'en',executionPolicy:'showcase',scheduler:false,computerInfo:{codexAvailable:false},runCodex:async()=>{calls++;throw Error('Must not execute');}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
 const room=app.store.list('agentRooms').find(room=>room.kind==='group'),task=app.store.require('tasks',room.messages[0].taskId);
 const selected=room.messages.filter(message=>message.role==='user')[1],cut=room.messages.findIndex(message=>message.id===selected.id);
 const beforeTasks=app.store.list('tasks').length,beforeArtifacts=app.store.list('artifacts');
 const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/tasks/${task.id}/revise`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'us-history-branch-check',messageId:selected.taskMessageId,content:'Only the selected question changes.',run:false})});
 assert.equal(response.status,201);const result=await response.json();
 assert.equal(result.task.mode,'demo');assert.equal(result.task.status,'queued');assert.equal(result.task.messages.length,cut+1);
 assert.equal(result.task.messages.at(-1).content,'Only the selected question changes.');
 assert.deepEqual(result.task.messages.slice(0,-1).map(message=>[message.role,message.content]),task.messages.slice(0,cut).map(message=>[message.role,message.content]));
 assert.equal(result.room.messages.length,cut+1);assert.equal(result.room.forkedFrom.roomId,room.id);assert.equal(result.room.forkedFrom.messageId,selected.id);
 assert.deepEqual(result.task.artifactIds,[]);assert.deepEqual(app.store.list('artifacts'),beforeArtifacts);assert.equal(app.store.list('tasks').length,beforeTasks+1);
 assert.deepEqual(app.store.require('agentRooms',room.id),room);assert.deepEqual(app.store.require('tasks',task.id).messages,task.messages);assert.equal(calls,0);
});
