import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {planTurn,demoTopic} from '../server/turn-policy.mjs';
const agents=[{id:'a',name:'筹划伙伴'},{id:'b',name:'复核伙伴'},{id:'c',name:'文字伙伴'}];
const task=content=>({roomId:'room',interaction:'chat',prompt:content,messages:[{role:'user',content}]});
test('addressed greetings stay social while explicit recipients still control participation',()=>{
 const turn=planTurn({...task('@筹划伙伴 @复核伙伴 hi'),recipientIds:['a','b']},agents);
 assert.equal(turn.kind,'greeting');assert.deepEqual(turn.agents.map(agent=>agent.id),['a','b']);assert.equal(turn.useContext,false);assert.equal(turn.conversationOnly,true);
 assert.equal(planTurn(task('@everyone 你们好'),agents).kind,'greeting');
 assert.equal(planTurn(task('@未知用户 hi'),agents).kind,'discussion');
 assert.equal(planTurn(task('@筹划伙伴 帮我制定一份计划'),agents).kind,'discussion');
});
async function fixture(t,runCodex){const directory=mkdtempSync(path.join(os.tmpdir(),'hither-group-turn-'));const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false},runCodex});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});const api=async(route,body,method='POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;};const settled=async id=>{await app.runner.active.get(id)?.promise;return app.store.require('tasks',id);};return {app,api,settled};}

test('room routing defaults to a coordinator, keeps group questions/mentions, and reads only the current turn for intent',()=>{
 for(const content of ['你们好','大家好！','Hello everyone!','谢谢你们','今天先随便聊聊','我今天有点累'])assert.equal(planTurn(task(content),agents).agents.length,1,content);
 for(const content of ['大家觉得先做什么比较好？','请各位分别复核这份计划','一起讨论中断恢复','How should we test this?'])assert.equal(planTurn(task(content),agents).agents.length,3,content);
 assert.deepEqual(planTurn(task('@复核伙伴 请看一下'),agents).agents.map(a=>a.id),['b']);
 assert.equal(planTurn({...task('今天先随便聊聊'),interaction:'task'},agents).agents.length,3);
 const continued={...task('准备社区声音展计划'),messages:[{role:'user',content:'准备社区声音展计划'},{role:'user',content:'今天先随便聊聊'}]};
 assert.equal(demoTopic(continued),'今天先随便聊聊');assert.equal(planTurn(continued,agents).conversationOnly,true);
 assert.equal(planTurn(task('讨论这份文件，不要保存文档'),agents).conversationOnly,true);
 assert.equal(planTurn(task('整理后保存 Markdown 文件'),agents).conversationOnly,false);
});

test('live group greetings and ordinary discussion make one actual call each, ignore historical task intent, and create no files',async t=>{
 const calls=[];const f=await fixture(t,async args=>{calls.push(args);return {text:'A brief fixture reply.'};});
 await f.api('settings/provider',{apiKey:'fixture-not-a-real-key'},'PUT');
 const room=await f.api('agent-rooms',{kind:'group',agentIds:['agent-planner','agent-reviewer','demo-v2-agent-writer'],mode:'live'});
 f.app.store.put('agentRooms',{...room,messages:[{id:'historical-project',role:'user',content:'OLD PROJECT: write a very long launch plan and create three files.',createdAt:new Date().toISOString()}]});
 for(const [index,content] of ['你们好','我想先随便聊一会儿'].entries()){
  const sent=await f.api(`agent-rooms/${room.id}/messages`,{content,contextFactIds:['fact-budget']});const done=await f.settled(sent.task.id);
  assert.equal(done.status,'completed',done.error);assert.equal(done.messages.filter(m=>m.role==='assistant').length,1);assert.deepEqual(done.artifactIds,[]);assert.deepEqual(done.approvals,[]);assert.deepEqual(readdirSync(f.app.store.taskWorkspace(done.id)),[]);
  assert.equal(calls.length,index+1);assert.ok(calls[index].prompt.endsWith(`用户当前消息：${JSON.stringify(content)}`));assert.match(calls[index].prompt,/用户当前消息决定本轮任务|不得自动恢复旧计划|问候、致谢和闲聊用一至两句/);
 }
 assert.deepEqual(JSON.parse(f.app.store.list('tasks')[0].events.find(e=>e.type==='context').detail),[]);
 assert.equal(f.app.store.list('artifacts').length,0);
});

test('explicit live group questions run each role with bounded prior replies and collect only actual files on a later file request',async t=>{
 const calls=[];const f=await fixture(t,async args=>{calls.push(args);const current=JSON.parse(args.prompt.split('用户当前消息：').at(-1));if(current.includes('保存')){writeFileSync(path.join(args.workspace,`actual-${calls.length}.md`),'An actual fixture file.');await args.onEvent({type:'runtime.action',label:'已写入 fixture 文件'});return {text:'The requested fixture file is written.'};}return {text:'x'.repeat(5000)+'DO_NOT_FORWARD_THIS_TAIL'};});
 await f.api('settings/provider',{apiKey:'fixture-not-a-real-key'},'PUT');
 const room=await f.api('agent-rooms',{kind:'group',agentIds:['agent-planner','agent-reviewer','demo-v2-agent-writer'],mode:'live'});
 const sent=await f.api(`agent-rooms/${room.id}/messages`,{content:'大家分别说说，你们建议先验证哪个环节？'});const first=await f.settled(sent.task.id);
 assert.equal(first.status,'completed',first.error);assert.equal(calls.length,3);assert.equal(first.messages.filter(m=>m.role==='assistant').length,3);assert.deepEqual(first.artifactIds,[]);assert.doesNotMatch(calls[1].prompt,/DO_NOT_FORWARD_THIS_TAIL/);assert.match(calls[1].prompt,/"truncated":true/);
 const next=await f.api(`agent-rooms/${room.id}/messages`,{content:'请分别保存 Markdown 文件，写下测试建议。'});const second=await f.settled(next.task.id);
 assert.equal(second.status,'completed',second.error);assert.equal(calls.length,6);assert.equal(second.artifactIds.length,3);
 for(const id of second.artifactIds){const a=f.app.store.require('artifacts',id);assert.match(a.name,/^actual-/);assert.equal(a.content,'An actual fixture file.');assert.equal(a.origin.kind,'workspace');}
});

test('demo group chats remain clearly local, complete without approval/files, and do not revive an old project',async t=>{
 const f=await fixture(t,()=>{throw Error('Demo must not call a model');});
 const room=await f.api('agent-rooms',{kind:'group',agentIds:['agent-planner','agent-reviewer','demo-v2-agent-writer'],mode:'demo'});
 f.app.store.put('agentRooms',{...room,messages:[{id:'historical-project',role:'user',content:'准备社区声音展计划并保存文档。',createdAt:new Date().toISOString()}]});
 for(const content of ['你们好','我今天想先聊聊需求研究']){
  const sent=await f.api(`agent-rooms/${room.id}/messages`,{content});const done=await f.settled(sent.task.id);
  assert.equal(done.status,'completed');assert.equal(done.messages.filter(m=>m.role==='assistant').length,1);assert.deepEqual(done.artifactIds,[]);assert.deepEqual(done.approvals,[]);assert.match(done.messages.at(-1).content,/演示/);assert.doesNotMatch(done.messages.at(-1).content,/声音展/);assert.ok(done.messages.at(-1).content.length<200);
 }
});

test('structured recipients route an explicit greeting and quoted context survives room persistence',async t=>{
 const calls=[];const f=await fixture(t,async args=>{calls.push(args);return {text:'A targeted reply.'};});
 await f.api('settings/provider',{apiKey:'fixture-not-a-real-key'},'PUT');
 const room=await f.api('agent-rooms',{kind:'group',agentIds:['agent-planner','agent-reviewer','demo-v2-agent-writer'],mode:'live'});
 const source={id:'quote-message',role:'assistant',agentId:'agent-planner',content:'先验证用户最常用的流程。',createdAt:new Date().toISOString()};
 f.app.store.put('agentRooms',{...room,messages:[source]});
 const sent=await f.api(`agent-rooms/${room.id}/messages`,{content:'hi',recipientIds:['agent-reviewer','demo-v2-agent-writer'],replyToMessageId:source.id});
 const done=await f.settled(sent.task.id);
 assert.equal(calls.length,2);assert.deepEqual(done.messages.filter(m=>m.role==='assistant').map(m=>m.agentId),['agent-reviewer','demo-v2-agent-writer']);
 assert.match(calls[0].prompt,/先验证用户最常用的流程/);assert.match(calls[0].prompt,/用户引用的会话消息/);
 const persisted=f.app.store.require('agentRooms',room.id).messages.find(m=>m.taskId===done.id&&m.role==='user');
 assert.deepEqual(persisted.recipientIds,['agent-reviewer','demo-v2-agent-writer']);assert.equal(persisted.replyToMessageId,source.id);assert.deepEqual(done.artifactIds,[]);
});

test('room recipients and quotes cannot cross a room boundary',async t=>{
 const f=await fixture(t);const room=await f.api('agent-rooms',{kind:'direct',agentIds:['agent-planner'],mode:'demo'});
 const before=f.app.store.list('tasks').length;
 for(const body of [{content:'hi',recipientIds:['agent-reviewer']},{content:'hi',replyToMessageId:'outside-message'}]){
  const response=await fetch(`http://127.0.0.1:${f.app.server.address().port}/api/agent-rooms/${room.id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(response.status,400);
 }
 assert.equal(f.app.store.list('tasks').length,before);
});
