import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {Store,collections} from '../server/store.mjs';
import {createSeed} from '../server/seed.mjs';
import {createTask} from '../server/domain.mjs';

async function fixture(t,options={}){
  const directory=options.dataDir??mkdtempSync(path.join(os.tmpdir(),'hither-rooms-'));
  const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false},...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/api/`;let closed=false;
  const close=async()=>{if(!closed){closed=true;await app.close();}};
  t.after(async()=>{await close();if(!options.dataDir)rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(base+route,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
  return {app,api,directory,close};
}
async function until(fn,predicate){for(let i=0;i<150;i++){const value=await fn();if(predicate(value))return value;await new Promise(r=>setTimeout(r,10));}throw new Error('condition timed out');}
const document=(messages=[{id:'m1',senderId:'friend',text:'  原话保留 · 不修改  \n',time:'2026-09-28T12:00:00+08:00'}])=>({format:'hither.chat.v1',accountId:'fixture-account',people:[{id:'me',name:'导出中的自己',isSelf:true},{id:'friend',name:'文件中的联系人'}],conversations:[{id:'chat1',title:'外部记录',kind:'direct',participantIds:['me','friend'],messages}]});

test('Agent rooms persist distinct membership, real demo task messages and approvals',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('agent-rooms',{kind:'direct',agentIds:['agent-planner','agent-reviewer']})).status,400);
  const room=(await f.api('agent-rooms',{kind:'group',agentIds:['agent-planner','agent-reviewer'],title:'两人工作室'})).value;
  assert.equal(room.mode,'demo');assert.deepEqual(room.messages,[]);
  const sent=await f.api(`agent-rooms/${room.id}/messages`,{content:'为 Agent 工作台内测准备第一步，并保存计划文档',contextFactIds:['fact-budget']});assert.equal(sent.status,201);
  const task=sent.value.task;assert.equal(task.roomId,room.id);
  const waiting=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='awaiting_approval');
  const current=f.app.store.get('agentRooms',room.id);assert.equal(current.activeTaskId,task.id);assert.equal(current.messages.filter(m=>m.role==='assistant').length,2);
  assert.deepEqual(current.messages.filter(m=>m.role==='assistant').map(m=>m.agentId),['agent-planner','agent-reviewer']);assert.ok(current.messages.every(m=>m.taskId===task.id&&m.demo));
  assert.ok(current.messages.filter(m=>m.role==='assistant').every(m=>/没有调用语言模型/.test(m.content)));
  assert.equal(f.app.store.list('artifacts').filter(a=>a.taskId===task.id).length,0);
  assert.equal((await f.api(`agent-rooms/${room.id}/messages`,{content:'再来'})).status,409);
  assert.equal((await f.api(`agent-rooms/${room.id}`,{agentIds:['agent-planner']},'PUT')).status,409);
  await f.api(`tasks/${task.id}/approval`,{approvalId:waiting.approvals.at(-1).id,decision:'approve'});
  await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='completed');
  const finalRoom=f.app.store.get('agentRooms',room.id);assert.equal(finalRoom.activeTaskId,undefined);assert.equal(new Set(finalRoom.messages.map(m=>m.id)).size,finalRoom.messages.length);
  assert.equal((await f.api(`tasks/${task.id}`,{},'DELETE')).status,409);
  await f.close();const again=await fixture(t,{dataDir:f.directory});assert.deepEqual(again.app.store.get('agentRooms',room.id).messages,finalRoom.messages);
});

test('live missing key never fabricates room reply; task resume syncs the exact user correction',async t=>{
  let calls=0;const f=await fixture(t,{runCodex:async()=>{calls++;return {text:'fixture output'};}});
  const room=(await f.api('agent-rooms',{kind:'direct',agentIds:['agent-planner'],mode:'live'})).value;
  const sent=(await f.api(`agent-rooms/${room.id}/messages`,{content:'真实请求'})).value;
  assert.equal(sent.task.status,'needs_input');assert.equal(calls,0);assert.equal(sent.room.messages.filter(m=>m.role==='assistant').length,0);
  await f.api(`tasks/${sent.task.id}/message`,{content:'补充原请求'});
  const current=f.app.store.get('agentRooms',room.id);assert.deepEqual(current.messages.map(m=>m.content),['真实请求','补充原请求']);assert.equal(current.activeTaskId,sent.task.id);
  const capabilities=(await f.api('runtime/capabilities')).value;assert.equal(capabilities.openJarvis.installed,false);assert.equal(capabilities.provider.toolCompatibility,'not_verified');
});

test('derived room task is queued until explicit run and cannot overlap via another task endpoint',async t=>{
  const f=await fixture(t);const room=(await f.api('agent-rooms',{kind:'direct',agentIds:['agent-planner']})).value;
  const first=(await f.api(`agent-rooms/${room.id}/tasks`,{prompt:'草稿任务'})).value;
  assert.equal(first.task.status,'queued');assert.equal(first.room.activeTaskId,first.task.id);assert.equal(first.task.events.some(e=>e.type==='started'),false);
  await f.api(`tasks/${first.task.id}/cancel`,{});
  const second=(await f.api(`agent-rooms/${room.id}/tasks`,{prompt:'另一任务'})).value;
  assert.equal((await f.api(`tasks/${first.task.id}/run`,{})).status,409);
  assert.equal((await f.api(`tasks/${first.task.id}/message`,{content:'不能并行'})).status,409);
  assert.equal(f.app.store.get('agentRooms',room.id).activeTaskId,second.task.id);
});

test('preview is non-mutating; import preserves originals, deduplicates and retains every source mapping',async t=>{
  const f=await fixture(t,{seed:false});const content=JSON.stringify(document(),null,2);
  const preview=(await f.api('imports/chat/preview',{platform:'wechat',filename:'chat.json',content})).value;
  assert.equal(preview.counts.newMessages,1);assert.equal(f.app.store.list('sources').length,0);assert.equal(f.app.store.list('people').length,0);
  const result=(await f.api('imports/chat/commit',{previewId:preview.previewId})).value;
  assert.deepEqual(result.added,{people:2,conversations:1,messages:1});const source=f.app.store.get('sources',result.sourceId);assert.equal(source.text,content);assert.equal(source.demo,false);assert.equal(source.import.sha256,preview.sha256);
  const chat=f.app.store.get('conversations',result.conversationIds[0]);assert.equal(chat.messages[0].content,'  原话保留 · 不修改  \n');assert.equal(chat.messages[0].sourceId,source.id);assert.equal(f.app.store.list('facts').length,0);
  const repeat=(await f.api('imports/chat/commit',{previewId:preview.previewId})).value;assert.equal(repeat.alreadyImported,true);assert.equal(repeat.added.messages,0);
  const updated=document([...document().conversations[0].messages,{id:'m2',senderId:'me',text:'后续内容',time:'2026-09-28T12:01:00+08:00'}]);
  const p2=(await f.api('imports/chat/preview',{platform:'wechat',filename:'chat-new.json',content:JSON.stringify(updated)})).value;
  assert.equal(p2.counts.duplicates,1);assert.equal(p2.counts.newMessages,1);
  const r2=(await f.api('imports/chat/commit',{previewId:p2.previewId})).value;const merged=f.app.store.get('conversations',chat.id);
  assert.equal(merged.messages.length,2);assert.deepEqual(merged.messages[0].sourceIds,[source.id,r2.sourceId]);assert.equal(merged.messages[0].sourceId,source.id);
  assert.equal((await f.api(`conversations/${chat.id}`,{title:'不能覆盖原始记录'},'PUT')).status,405);
  assert.equal((await f.api(`sources/${source.id}`,{text:'替换'},'PUT')).status,405);
});

test('conflicting import is rejected atomically; malformed and expired previews do not write records',async t=>{
  const f=await fixture(t,{seed:false});const body={platform:'whatsapp',filename:'normalized.json',content:JSON.stringify(document())};
  const preview=(await f.api('imports/chat/preview',body)).value;await f.api('imports/chat/commit',{previewId:preview.previewId});
  const conflict=document([{...document().conversations[0].messages[0],text:'同 ID 的不同原话'}]);
  assert.equal((await f.api('imports/chat/preview',{...body,content:JSON.stringify(conflict)})).status,409);assert.equal(f.app.store.list('sources').length,1);
  const bad=document();bad.conversations[0].messages[0].senderId='unknown';assert.equal((await f.api('imports/chat/preview',{...body,content:JSON.stringify(bad)})).status,400);
  const malformed=document();malformed.people=[null];assert.equal((await f.api('imports/chat/preview',{...body,content:JSON.stringify(malformed)})).status,400);
  const expired=f.app.store.get('chatImportPreviews',preview.previewId);expired.expiresAt='2000-01-01T00:00:00.000Z';f.app.store.put('chatImportPreviews',expired);
  assert.equal((await f.api('imports/chat/commit',{previewId:preview.previewId})).status,409);assert.equal(f.app.store.list('sources').length,1);
});

test('Instagram native JSON keeps media references local and separates accounts',async t=>{
  const f=await fixture(t,{seed:false});const raw={title:'Friends',thread_path:'inbox/friends_123',participants:[{name:'A'},{name:'B'}],messages:[{sender_name:'A',timestamp_ms:1750000000000,content:'Hello'},{sender_name:'B',timestamp_ms:1750000000100,photos:[{uri:'media/photo.jpg'}]}]};
  const body={platform:'instagram',accountId:'account-a',filename:'message_1.json',content:JSON.stringify(raw)};
  const preview=(await f.api('imports/chat/preview',body)).value;assert.equal(preview.counts.messages,2);assert.match(preview.conversations[0].messages[1].content,/未下载/);
  const result=(await f.api('imports/chat/commit',{previewId:preview.previewId})).value;assert.equal(f.app.store.get('sources',result.sourceId).text,body.content);
  const second=(await f.api('imports/chat/preview',{...body,accountId:'account-b'})).value;assert.equal(second.counts.newMessages,2);assert.equal(second.counts.newPeople,2);
});

test('fictional expansion has coherent references and never replaces legacy edits, tasks or formal spaces',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-demo-migration-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const old=new Store(directory,{seed:false});const data=createSeed('2026-01-01T00:00:00.000Z');for(const c of collections)for(const item of data[c]??[])old.put(c,item);old.setMeta('profile',data.profile);
  const person=old.get('people','person-self');person.description='用户已经修改过的人物描述';old.put('people',person);
  const task=createTask(old,{prompt:'用户的旧任务',mode:'demo'});old.put('sources',{id:'user-source',title:'正式资料',kind:'note',text:'用户资料',demo:false,createdAt:new Date().toISOString()});old.close();
  const migrated=new Store(directory);const people=migrated.list('people'),conversations=migrated.list('conversations');assert.ok(people.length>=21);assert.ok(conversations.length>=12);assert.ok(conversations.reduce((n,c)=>n+c.messages.length,0)>=120);assert.ok(migrated.list('relationships').length>=30);assert.ok(migrated.list('events').length>=15);
  assert.equal(migrated.get('people','person-self').description,person.description);assert.deepEqual(migrated.get('tasks',task.id),task);assert.equal(migrated.get('sources','user-source').demo,false);
  for(const c of conversations)for(const m of c.messages){assert.ok(c.personIds.includes(m.senderId));assert.ok(migrated.get('people',m.senderId));assert.ok(migrated.get('sources',m.sourceId));}
  for(const r of migrated.list('relationships')){assert.ok(migrated.get('people',r.from));assert.ok(migrated.get('people',r.to));}
  const counts=collections.map(c=>migrated.list(c).length);const edited=migrated.get('people','demo-v2-person-lu');edited.name='用户新名字';migrated.put('people',edited);migrated.close();
  const again=new Store(directory);assert.deepEqual(collections.map(c=>again.list(c).length),counts);assert.equal(again.get('people',edited.id).name,'用户新名字');again.close();
  const formalDirectory=mkdtempSync(path.join(os.tmpdir(),'hither-formal-'));t.after(()=>rmSync(formalDirectory,{recursive:true,force:true}));let formal=new Store(formalDirectory,{seed:false});formal.close();formal=new Store(formalDirectory);assert.equal(formal.list('people').length,0);assert.equal(formal.list('agentRooms').length,0);formal.close();
});

test('trace reports measured local attempts and leaves unmeasured tokens/cost/quality explicit',async t=>{
  const f=await fixture(t);const task=(await f.api('tasks',{prompt:'本地轨迹',mode:'demo'})).value;await f.api(`tasks/${task.id}/run`,{});
  const waiting=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='awaiting_approval');await f.api(`tasks/${task.id}/approval`,{approvalId:waiting.approvals.at(-1).id,decision:'reject'});
  await until(()=>f.app.runner.active.has(task.id),v=>!v);
  const trace=(await f.api(`tasks/${task.id}/trace`)).value;assert.equal(trace.attempts.length,1);assert.equal(trace.attempts[0].runtime.adapter,'local-demo');assert.equal(trace.attempts[0].outcome,'write_rejected');assert.equal(trace.measurements.approvalRequestCount,1);assert.equal(trace.measurements.inputTokens,null);assert.equal(trace.measurements.costUsd,null);assert.equal(trace.measurements.quality,'not_assessed');assert.ok(trace.measurements.wallClockMs>=0);
});
