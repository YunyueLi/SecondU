import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {TaskRunner} from '../server/runner.mjs';
import {TeamCoordinator,teamConfiguration} from '../server/team-runs.mjs';
import {saveConnector} from '../server/connectors.mjs';
const lead='agent-planner',worker='agent-reviewer',third='demo-v2-agent-writer';
const unpack=result=>JSON.parse(result.contentItems[0].text);
const tool=(args,name,body={})=>args.onDynamicTool({tool:name,arguments:body});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,runCodex){
 const directory=mkdtempSync(path.join(os.tmpdir(),'second-u-team-'));const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false},runCodex});
 const connection={...app.store.connection(),provider:'openai',api:'responses',baseUrl:'https://api.openai.com/v1',model:'fixture-model'};app.store.put('modelConnections',connection);app.store.setKey(connection,'synthetic-team-key');
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const api=async(route,body,method='POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,value:await r.json()};};
 const room=await api('agent-rooms',{kind:'group',agentIds:[lead,worker,third],mode:'live',team:{leadAgentId:lead}});assert.equal(room.status,201);
 return {app,directory,api,room:room.value,settled:async taskId=>{await app.runner.active.get(taskId)?.promise;return app.store.require('tasks',taskId);}};
}
test('team config is explicit, membership-bound and removable; existing rooms remain ordinary groups',()=>{
 assert.equal(teamConfiguration(undefined,[lead,worker],'group'),undefined);assert.equal(teamConfiguration(null,[lead,worker],'group'),undefined);
 assert.deepEqual(teamConfiguration({leadAgentId:lead},[lead,worker],'group'),{leadAgentId:lead});
 for(const value of [{leadAgentId:'stranger'},{leadAgentId:lead,parallel:100},'team'])assert.throws(()=>teamConfiguration(value,[lead,worker],'group'));
 assert.throws(()=>teamConfiguration({leadAgentId:lead},[lead],'direct'));
});
test('lead delegates on demand, collects real worker result, persists a bounded tree and alone replies to the room',async t=>{
 const calls=[];const f=await fixture(t,async args=>{calls.push(args);assert.equal(args.allowSubagents,false);
  await args.onEvent({type:'runtime.action',label:'Recorded tool',detail:'Fixture operation',activity:{kind:'command',phase:'running',callId:'same-native-id',name:'synthetic-team-key',permissions:'all'}});
  await args.onEvent({type:'runtime.message',label:'Public progress',detail:'Checking this assigned scope.',activity:{kind:'message',phase:'completed',callId:'public-message',messagePhase:'commentary'}});
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'检查提供的两条验收要求'}));const result=unpack(await tool(args,'team_wait',{nodeIds:[node.nodeId]}));assert.equal(result.nodes[0].result,'Worker evidence.');return {text:'Lead checked the worker evidence.'};}
  assert.deepEqual(args.dynamicTools,[]);assert.match(args.prompt,/临时专家/);return {text:'Worker evidence.'};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'负责人安排一项复核并汇总。'});assert.equal(sent.status,201);const task=await f.settled(sent.value.task.id);
 assert.equal(task.status,'completed',task.error);assert.equal(calls.length,2);assert.notEqual(calls[0].workspace,calls[1].workspace);assert.ok(calls[1].workspace.startsWith(path.join(f.app.store.directory,'team-workspaces')));
 const run=task.teamRuns[0];assert.equal(run.status,'completed');assert.equal(run.nodes.length,2);assert.equal(run.nodes[1].parentId,run.nodes[0].id);assert.ok(run.nodes.every(n=>n.status==='completed'&&n.startedAt&&n.finishedAt));
 assert.equal(task.messages.filter(m=>m.role==='assistant').length,1);assert.equal(task.messages.at(-1).agentId,lead);assert.equal(f.app.store.require('agentRooms',f.room.id).messages.at(-1).content,'Lead checked the worker evidence.');
 assert.ok(!JSON.stringify(run).includes('synthetic-team-key'));
 const recorded=task.events.filter(event=>event.activity?.kind==='command');assert.deepEqual(recorded.map(event=>event.agentId),[lead,worker]);assert.ok(recorded.every(event=>event.activity.name==='[redacted]'&&!Object.hasOwn(event.activity,'permissions')));
 assert.equal(task.events.filter(event=>event.activity?.messagePhase==='commentary').length,2);assert.ok(!JSON.stringify(task).includes('synthetic-team-key'));
 const saved=await f.api(`agent-rooms/${f.room.id}`,{team:null},'PUT');assert.equal(saved.value.team,undefined);assert.deepEqual(task.team,{leadAgentId:lead});
});
test('lead and worker connector lifecycles both reach the task with separate call IDs and agent ownership',async t=>{
 const f=await fixture(t,async args=>{
  const read=args.dynamicTools.find(item=>item.description.includes('/ search.'));
  assert.ok(read);assert.equal((await args.onDynamicTool({tool:read.name,arguments:{query:'fixture'}})).success,true);
  if(args.dynamicTools.some(item=>item.name==='team_delegate')){
   const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Check selected source'}));await tool(args,'team_wait',{nodeIds:[node.nodeId]});return {text:'Lead collected the checked source.'};
  }
  return {text:'Worker checked the selected source.'};
 });
 const connector=saveConnector(f.app.store,{kind:'library',name:'Selected fixture library'});
 assert.equal((await f.api(`agent-rooms/${f.room.id}`,{connectorIds:[connector.id]},'PUT')).status,200);
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'检查所选资料'}),task=await f.settled(sent.value.task.id);
 assert.equal(task.status,'completed',task.error);
 const events=task.events.filter(event=>event.activity?.kind==='connector');assert.equal(events.length,4);
 for(const agentId of [lead,worker]){const own=events.filter(event=>event.agentId===agentId);assert.deepEqual(own.map(event=>event.activity.phase),['running','completed']);assert.equal(own[0].activity.callId,own[1].activity.callId);}
 assert.notEqual(events[0].activity.callId,events[2].activity.callId);
});
test('unsupported protocol rejects before a model starts and does not fabricate a team run',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return {text:'unexpected'};});const connection=f.app.store.connection();f.app.store.put('modelConnections',{...connection,provider:'custom',api:'unsupported_fixture'});
 const before=f.app.store.list('tasks').length;const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'开始任务'});assert.equal(f.app.store.list('tasks').length,before);assert.equal(f.app.store.require('agentRooms',f.room.id).activeTaskId,undefined);assert.equal(sent.status,409);assert.equal(sent.value.code,'team_provider_unsupported');assert.equal(calls,0);assert.ok(f.app.store.list('tasks').every(task=>!task.teamRuns));
});
test('execution trace uses the selected lead connection even when another member is first',async t=>{
 const calls=[];const f=await fixture(t,async args=>{calls.push(args.settings);return {text:'The selected lead answered.'};});
 const connection={...f.app.store.connection(),id:'fixture-lead-connection',name:'Selected lead',provider:'kimi',model:'lead-fixture-model',api:'chat_completions'};
 f.app.store.put('modelConnections',connection);f.app.store.setKey(connection,'synthetic-selected-lead-key');
 f.app.store.put('agents',{...f.app.store.require('agents',worker),connectionId:connection.id});
 const edited=await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:worker}},'PUT');assert.equal(edited.status,200);assert.equal(edited.value.agentIds[0],lead);
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'请由指定负责人回答。'});assert.equal(sent.status,201);const task=await f.settled(sent.value.task.id);assert.equal(task.status,'completed',task.error);
 assert.equal(calls.length,1);assert.equal(calls[0].id,connection.id);assert.equal(task.messages.at(-1).agentId,worker);
 const trace=JSON.parse(task.events.find(event=>event.type==='started').detail);assert.equal(trace.provider,connection.provider);assert.equal(trace.model,connection.model);assert.equal(trace.api,connection.api);assert.equal(trace.connections.find(item=>item.agentId===worker).connectionId,connection.id);
});
test('long team results disclose truncation to the lead and persist only a redacted excerpt',async t=>{
 const long='a'.repeat(17000);const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(item=>item.name==='team_delegate')){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Return a fixture result'}));const result=unpack(await tool(args,'team_wait',{nodeIds:[node.nodeId]})).nodes[0];assert.equal(result.resultTruncated,true);assert.equal(result.resultOriginalChars,long.length+10);assert.equal(result.result.length,16000);assert.ok(result.result.startsWith('[redacted]'));return {text:long};}
  return {text:'synthetic-team-key'+long};
 });const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'检查结果边界'});const task=await f.settled(sent.value.task.id);assert.equal(task.status,'completed',task.error);
 for(const node of task.teamRuns[0].nodes){assert.equal(node.resultTruncated,true);assert.equal(node.result.length,16000);assert.ok(node.resultOriginalChars>16000);assert.ok(!node.result.includes('synthetic-team-key'));}
});
test('worker approval remains pending, concurrent approvals are not cleared by one decision, and rejection reaches the worker',async t=>{
 const ready=deferred(), decisions=[];const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){const a=unpack(await tool(args,'team_delegate',{agentId:worker,task:'一项需批准的操作'})),b=unpack(await tool(args,'team_delegate',{agentId:third,task:'另一项需批准的操作'}));ready.resolve();await tool(args,'team_wait',{nodeIds:[a.nodeId,b.nodeId]});return {text:'两项都未获得执行许可。'};}
  decisions.push(await args.onApproval({title:'Fixture action',description:'No actual external action.',details:'synthetic'}));return {text:'Denied without action.'};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'请负责人分派复核'});await ready.promise;
 for(let i=0;i<20&&f.app.store.require('tasks',sent.value.task.id).approvals.length<2;i++)await new Promise(r=>setImmediate(r));
 let task=f.app.store.require('tasks',sent.value.task.id);assert.equal(task.approvals.length,2);assert.equal(task.status,'awaiting_approval');assert.equal(task.teamRuns[0].nodes.filter(n=>n.status==='awaiting_approval').length,2);
 f.app.runner.decide(task.id,task.approvals[0].id,'reject');assert.equal(f.app.store.require('tasks',task.id).status,'awaiting_approval');f.app.runner.decide(task.id,task.approvals[1].id,'reject');task=await f.settled(task.id);assert.equal(task.status,'completed');assert.deepEqual(decisions,['reject','reject']);
});
test('cancel propagates to all active workers, rejects pending approval and waits for shutdown',async t=>{
 const workerStarted=deferred();const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){const a=unpack(await tool(args,'team_delegate',{agentId:worker,task:'需批准的操作'}));await tool(args,'team_wait',{nodeIds:[a.nodeId]});return {text:'cancelled'};}
  workerStarted.resolve();await args.onApproval({title:'Waiting action',description:'Fixture'});assert.equal(args.signal.aborted,true);return {text:'not executed'};
 });const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'开始'});await workerStarted.promise;const cancelled=await f.app.runner.cancel(sent.value.task.id);
 assert.equal(cancelled.status,'cancelled');assert.ok(cancelled.approvals.every(a=>a.status==='rejected'));assert.ok(cancelled.teamRuns[0].nodes.every(n=>n.status==='interrupted'));assert.equal(f.app.runner.active.size,0);
});
test('lead cannot report completion with uncollected workers; a failed lead stops workers waiting on approval',async t=>{
 const workerStarted=deferred();const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){await tool(args,'team_delegate',{agentId:worker,task:'检查'});await workerStarted.promise;return {text:'Premature final'};}
  workerStarted.resolve();await args.onApproval({title:'Waiting action',description:'Fixture'});return {text:'Stopped'};
 });const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'开始'});const task=await f.settled(sent.value.task.id);assert.equal(task.status,'failed');assert.match(task.error,/尚未收齐/);assert.equal(task.teamRuns[0].status,'failed');assert.equal(task.teamRuns[0].nodes[1].status,'interrupted');assert.ok(task.approvals.every(a=>a.status==='rejected'));
});
test('team limits and arbitrary delegation are enforced by the host, not model instructions',async()=>{
 const controller=new AbortController(),holds=[];const state={id:'task',prompt:'Fixture',messages:[],teamRuns:[]};const c=new TeamCoordinator({taskId:'task',lead:{id:lead,name:'Lead',role:'Lead'},agents:[{id:lead},{id:worker,name:'Worker',role:'Review'}],signal:controller.signal,mutate:(_,fn)=>{fn(state);return state;},read:()=>state,cleanError:String,runWorker:async()=>{const d=deferred();holds.push(d);await d.promise;return {text:'done'};}});
 assert.equal((await c.call({tool:'team_delegate',arguments:{agentId:'other',task:'No'}})).success,false);
 const nodes=[];for(let i=0;i<4;i++)nodes.push(unpack(await c.call({tool:'team_delegate',arguments:{agentId:worker,task:'Work'}})).nodeId);
 assert.equal(unpack(await c.call({tool:'team_delegate',arguments:{agentId:worker,task:'Too many'}})).code,'team_concurrency_limit');
 assert.equal((await c.call({tool:'team_wait',arguments:{nodeIds:['another-run-node']}})).success,false);
 for(const d of holds)d.resolve();await c.call({tool:'team_wait',arguments:{nodeIds:nodes}});
 for(let i=0;i<3;i++){const id=unpack(await c.call({tool:'team_delegate',arguments:{agentId:worker,task:'Later'}})).nodeId;await Promise.resolve();holds.at(-1).resolve();await c.call({tool:'team_wait',arguments:{nodeIds:[id]}});}
 assert.equal(unpack(await c.call({tool:'team_delegate',arguments:{agentId:worker,task:'Ninth node'}})).code,'team_node_limit');c.finish('all results collected');assert.equal(state.teamRuns[0].nodes.length,8);
});
test('restart preserves the tree and marks active nodes interrupted without replay',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return {text:'unused'};});const stamp=new Date().toISOString();f.app.store.put('tasks',{id:'orphan-team',status:'running',mode:'live',messages:[],events:[],approvals:[],agentIds:[lead,worker],artifactIds:[],contextFactIds:[],updatedAt:stamp,team:{leadAgentId:lead},teamRuns:[{id:'old-run',leadAgentId:lead,status:'running',startedAt:stamp,nodes:[{id:'old-worker',kind:'worker',agentId:worker,name:'Worker',role:'Review',objective:'Recorded objective',status:'awaiting_approval',createdAt:stamp}]}]});
 const restarted=new TaskRunner(f.app.store,{scheduler:false,runCodex:()=>{calls++;}});t.after(()=>restarted.close());const task=f.app.store.require('tasks','orphan-team');assert.equal(task.status,'interrupted');assert.equal(task.teamRuns[0].status,'interrupted');assert.equal(task.teamRuns[0].nodes[0].status,'interrupted');assert.equal(task.teamRuns[0].nodes[0].objective,'Recorded objective');assert.equal(calls,0);
});

test('Kimi and Anthropic connections retain dynamic team tools and worker results across protocols',async t=>{
 for(const [provider,api] of [['kimi','chat_completions'],['anthropic','messages']])await t.test(provider,async t=>{
  const seen=[];const f=await fixture(t,async args=>{seen.push(args.settings.api);
   if(args.dynamicTools.some(x=>x.name==='team_delegate')){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Read the supplied evidence'}));await tool(args,'team_wait',{nodeIds:[node.nodeId]});return {text:'Collected evidence.'};}
   return {text:'Protocol fixture result.'};
  });const connection=f.app.store.connection();f.app.store.put('modelConnections',{...connection,provider,api});f.app.store.setKey({...connection,provider,api},'synthetic-team-key');
  const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'执行'});assert.equal(sent.status,201);const task=await f.settled(sent.value.task.id);assert.equal(task.status,'completed',task.error);assert.deepEqual(seen,[api,api]);
 });
});

test('a failed specialist remains failed even when the lead reports a collected partial result',async t=>{
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Try one bounded check'}));const result=unpack(await tool(args,'team_wait',{nodeIds:[node.nodeId]}));assert.equal(result.nodes[0].status,'failed');return {text:'Worker check failed; no evidence was confirmed.'};}
  throw new Error('Fixture connection unavailable');
 });const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'核对'});const task=await f.settled(sent.value.task.id);assert.equal(task.status,'completed');assert.equal(task.teamRuns[0].nodes[1].status,'failed');assert.match(task.teamRuns[0].nodes[1].error,/unavailable/);assert.equal(task.teamRuns[0].nodes[1].result,undefined);
 const next=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'再核对一次'});const nextTask=await f.settled(next.value.task.id);assert.equal(nextTask.teamRuns.length,1);assert.notEqual(nextTask.id,task.id);assert.equal(f.app.store.require('tasks',task.id).teamRuns[0].nodes[1].status,'failed');
});

test('unused specialists need no key; a selected unconfigured specialist fails truthfully without a model call',async t=>{
 let calls=0,delegate=false;const f=await fixture(t,async args=>{calls++;
  if(delegate){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Check supplied material'}));const result=unpack(await tool(args,'team_wait',{nodeIds:[node.nodeId]}));assert.equal(result.nodes[0].status,'failed');assert.match(result.nodes[0].error,/未配置 API 密钥/);}
  return {text:delegate?'Specialist was unavailable.':'Lead handled the simple question.'};
 });const connection={...f.app.store.connection(),id:'fixture-unconfigured',name:'Unconfigured specialist'};f.app.store.put('modelConnections',connection);f.app.store.put('agents',{...f.app.store.require('agents',worker),connectionId:connection.id});
 const first=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'一个简单问题'});const simple=await f.settled(first.value.task.id);assert.equal(simple.status,'completed');assert.equal(simple.teamRuns[0].nodes.length,1);assert.equal(calls,1);
 delegate=true;const second=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'请专家检查'});const delegated=await f.settled(second.value.task.id);assert.equal(delegated.status,'completed');assert.equal(delegated.teamRuns[0].nodes[1].status,'failed');assert.equal(calls,2);
});

test('two pending approvals in the same specialist keep its node waiting until both decisions',async t=>{
 const ready=deferred();const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Two independent fixture operations'}));await tool(args,'team_wait',{nodeIds:[node.nodeId]});return {text:'Both operations were denied.'};}
  const decisions=[args.onApproval({title:'First operation',description:'Synthetic'}),args.onApproval({title:'Second operation',description:'Synthetic'})];ready.resolve();await Promise.all(decisions);return {text:'No action taken.'};
 });const response=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'核对两项'});await ready.promise;const task=f.app.store.require('tasks',response.value.task.id);assert.equal(task.approvals.length,2);
 f.app.runner.decide(task.id,task.approvals[0].id,'reject');await new Promise(r=>setImmediate(r));assert.equal(f.app.store.require('tasks',task.id).teamRuns[0].nodes[1].status,'awaiting_approval');f.app.runner.decide(task.id,task.approvals[1].id,'reject');assert.equal((await f.settled(task.id)).status,'completed');
});
