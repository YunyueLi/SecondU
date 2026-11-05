import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync,symlinkSync} from 'node:fs';
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

test('configured workflow enforces members and collected prerequisites, then hands actual files to the next specialist',async t=>{
 const stages=[{id:'research',title:'Research',description:'Write evidence.',agentIds:[worker],after:[],required:true},{id:'review',title:'Review',description:'Read evidence.',agentIds:[third],after:['research'],required:true}];
 let handedId,reviewed=false;
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(item=>item.name==='team_delegate')){
   const early=await tool(args,'team_delegate',{agentId:third,stageId:'review',task:'Review too early'});assert.equal(early.success,false);assert.equal(unpack(early).code,'team_stage_pending');
   const wrong=await tool(args,'team_delegate',{agentId:third,stageId:'research',task:'Wrong member'});assert.equal(wrong.success,false);
   const node=unpack(await tool(args,'team_delegate',{agentId:worker,stageId:'research',task:'Write the synthetic evidence'}));
   const result=unpack(await tool(args,'team_wait',{nodeIds:[node.nodeId]})).nodes[0];assert.equal(result.status,'completed');assert.equal(result.artifacts.length,1);handedId=result.artifacts[0].id;
   assert.match(readFileSync(path.join(args.workspace,result.artifacts[0].path),'utf8'),/Synthetic evidence 42/);
   const next=unpack(await tool(args,'team_delegate',{agentId:third,stageId:'review',task:'Read and review the handed file',artifactIds:[handedId]}));await tool(args,'team_wait',{nodeIds:[next.nodeId]});return {text:'Both stages completed and evidence checked.'};
  }
  if(args.prompt.includes('Read and review the handed file')){const files=readdirSync(path.join(args.workspace,'inputs'));assert.equal(files.length,1);assert.equal(readFileSync(path.join(args.workspace,'inputs',files[0]),'utf8'),'Synthetic evidence 42');reviewed=true;return {text:'The supplied evidence contains 42.'};}
  writeFileSync(path.join(args.workspace,'evidence.md'),'Synthetic evidence 42');writeFileSync(path.join(args.workspace,'private.md'),'synthetic-team-key');symlinkSync('/etc/hosts',path.join(args.workspace,'outside.txt'));return {text:'Evidence written.'};
 });
 assert.equal((await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:lead,workflow:stages}},'PUT')).status,200);
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Complete the two-stage review.'}),task=await f.settled(sent.value.task.id);assert.equal(task.status,'completed',task.error);assert.equal(reviewed,true);assert.equal(task.teamRuns[0].nodes.length,3);const artifact=f.app.store.require('artifacts',handedId);assert.equal(artifact.taskId,task.id);assert.equal(artifact.teamOrigin.agentId,worker);assert.equal(artifact.teamOrigin.sourcePath,'evidence.md');assert(!JSON.stringify(task).includes('synthetic-team-key'));
});

test('required workflow cannot be reported complete without actual specialist execution',async t=>{
 const f=await fixture(t,async()=>({text:'Pretend everything is done.'}));await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:lead,workflow:[{id:'review',title:'Review',agentIds:[worker],after:[],required:true}]}},'PUT');const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Review the supplied requirements.'}),task=await f.settled(sent.value.task.id);assert.equal(task.status,'failed');assert.match(task.error,/流程|阶段/);assert.equal(task.teamRuns[0].nodes.length,1);
});

test('workflow budgets and file handoffs reject impossible or unrelated task scopes before execution',async t=>{
 assert.throws(()=>teamConfiguration({leadAgentId:lead,maxNodes:2,workflow:[{id:'both',title:'Both',agentIds:[worker,third],after:[],required:true}]},[lead,worker,third],'group'),{code:'team_workflow_limit'});
 let workerCalls=0;const f=await fixture(t,async args=>{if(args.dynamicTools.some(item=>item.name==='team_delegate')){const result=await tool(args,'team_delegate',{agentId:worker,task:'Use another task artifact',artifactIds:['outside-artifact']});assert.equal(result.success,false);assert.equal(unpack(result).code,'team_artifact_scope');return {text:'Unrelated file rejected.'};}workerCalls++;return {text:'Unexpected'};});
 f.app.store.put('artifacts',{id:'outside-artifact',taskId:'other-task',name:'private.md',content:'Unrelated private text',version:1});const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Check file scope.'}),task=await f.settled(sent.value.task.id);assert.equal(task.status,'completed',task.error);assert.equal(workerCalls,0);
});

async function waitForPlan(f,taskId,index=0){
 for(let attempt=0;attempt<100;attempt++){const task=f.app.store.require('tasks',taskId);if(task.workflowPlans?.[index]?.status==='pending')return task.workflowPlans[index];await new Promise(resolve=>setTimeout(resolve,5));}
 assert.fail('Workflow review was not reached');
}
const reviewStages=[{id:'research',title:'Research',description:'Inspect evidence',expectedOutput:'Evidence notes',agentIds:[worker],after:[],required:true},{id:'review',title:'Review',description:'Review the evidence',expectedOutput:'Review report',agentIds:[third],after:['research'],required:true}];
test('workflow review pauses dispatch, rejects stale edits, routes individual models, and preserves reusable snapshots',async t=>{
 const models=[];const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(item=>item.name==='team_plan')){
   const decision=unpack(await tool(args,'team_plan',{title:'Research and review',stages:reviewStages}));assert.equal(decision.status,'confirmed');
   for(const stage of reviewStages){const delegated=unpack(await tool(args,'team_delegate',{agentId:stage.agentIds[0],stageId:stage.id,task:stage.description}));assert.ok(delegated.nodeId,JSON.stringify(delegated));await tool(args,'team_wait',{nodeIds:[delegated.nodeId]});}
   return {text:'Reviewed results'};
  }
  models.push(args.settings.id);return {text:'Evidence from '+args.settings.model};
 });
 const alternate={...f.app.store.connection(),id:'review-model',name:'Review model',model:'fixture-review'};f.app.store.put('modelConnections',alternate);f.app.store.setKey(alternate,'synthetic-review-key');
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Review the staged work'}),taskId=sent.value.task.id,plan=await waitForPlan(f,taskId);
 assert.equal(f.app.store.require('tasks',taskId).status,'awaiting_approval');assert.equal(models.length,0);
 const configure=await f.api(`tasks/${taskId}/workflow`,{action:'configure',planId:plan.id,revision:0,concurrency:2,stageConnections:{review:{[third]:alternate.id}}});assert.equal(configure.status,200);assert.equal(configure.value.workflowPlans[0].revision,1);
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:0})).status,409);
 assert.equal(models.length,0);
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:1})).status,200);
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:1})).status,409);
 const task=await f.settled(taskId);assert.equal(task.status,'completed',task.error);assert.deepEqual(models,[f.app.store.connection().id,alternate.id]);
 assert.equal(task.teamRuns[0].nodes.at(-1).model.model,'fixture-review');assert.equal(task.teamRuns[0].workflow[1].connectionIds[third],alternate.id);assert.equal(task.teamRuns[0].limits.concurrency,2);
 const saved=await f.api(`tasks/${taskId}/save-workflow`,{runId:task.teamRuns[0].id});assert.equal(saved.status,201);assert.equal(saved.value.team.reviewBeforeRun,true);assert.deepEqual(saved.value.team.workflow,task.teamRuns[0].workflow.map(({inputArtifactIds,expectedOutput,description,...stage})=>({...stage,description:''})));assert.equal(saved.value.messages.length,0);
 assert.equal(f.app.store.require('agents',third).connectionId,undefined);
});
test('workflow revision returns feedback, rejection blocks delegation, and pending reviews cancel without replay',async t=>{
 const feedback=[];let calls=0;
 const f=await fixture(t,async args=>{
  calls++;
  const first=unpack(await tool(args,'team_plan',{title:'Initial plan',stages:reviewStages}));feedback.push(first);
  const second=unpack(await tool(args,'team_plan',{title:'Revised plan',stages:reviewStages.slice(0,1)}));feedback.push(second);
  const forbidden=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Must not run',stageId:'research'}));assert.equal(forbidden.code,'workflow_not_confirmed');
  return {text:'No work was dispatched.'};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Plan only'}),taskId=sent.value.task.id,p1=await waitForPlan(f,taskId);
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'revise',planId:p1.id,revision:0,feedback:'Only research first'})).status,200);
 const p2=await waitForPlan(f,taskId,1);assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'reject',planId:p2.id,revision:0})).status,200);
 const task=await f.settled(taskId);assert.equal(task.status,'completed',task.error);assert.equal(calls,1);assert.equal(feedback[0].feedback,'Only research first');assert.equal(feedback[1].status,'rejected');assert.equal(task.teamRuns[0].nodes.length,1);
 const sent2=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Another draft'}),secondId=sent2.value.task.id,p3=await waitForPlan(f,secondId);await f.api(`tasks/${secondId}/cancel`,{});
 assert.equal(f.app.store.require('tasks',secondId).workflowPlans[0].status,'interrupted');assert.equal((await f.api(`tasks/${secondId}/workflow`,{action:'confirm',planId:p3.id,revision:0})).status,409);assert.equal(f.app.runner.active.size,0);
});
test('a not-yet-dispatched stage can change models while a running assignment stays fixed',async t=>{
 const hold=deferred(),firstStarted=deferred(),models=[];
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(item=>item.name==='team_plan')){
   for(const stage of reviewStages){const node=unpack(await tool(args,'team_delegate',{agentId:stage.agentIds[0],stageId:stage.id,task:stage.description}));await tool(args,'team_wait',{nodeIds:[node.nodeId]});}return {text:'Done'};
  }
  models.push(args.settings.id);if(models.length===1){firstStarted.resolve();await hold.promise;}return {text:'Checked'};
 });
 t.after(()=>hold.resolve());
 const alternate={...f.app.store.connection(),id:'next-stage-model',name:'Next stage',model:'fixture-next'};f.app.store.put('modelConnections',alternate);f.app.store.setKey(alternate,'synthetic-next-key');
 await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:lead,workflow:reviewStages}},'PUT');
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Run two stages'});await firstStarted.promise;const taskId=sent.value.task.id,run=f.app.store.require('tasks',taskId).teamRuns[0];
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'model',runId:run.id,stageId:'research',agentId:worker,connectionId:alternate.id})).status,409);
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'model',runId:run.id,stageId:'review',agentId:third,connectionId:alternate.id})).status,200);
 assert.equal((await f.api(`tasks/${taskId}/workflow`,{action:'concurrency',runId:run.id,concurrency:1})).status,200);
 hold.resolve();const task=await f.settled(taskId);assert.equal(task.status,'completed',task.error);assert.deepEqual(models,[f.app.store.connection().id,alternate.id]);assert.equal(task.teamRuns[0].limits.concurrency,1);
});

test('a failed latest attempt blocks downstream work even when an earlier attempt succeeded',async t=>{
 let calls=0;
 const f=await fixture(t,async args=>{
  if(!args.dynamicTools.some(x=>x.name==='team_delegate')){if(++calls===2)throw new Error('Latest attempt failed');return {text:'First result'};}
  for(let i=0;i<2;i++){const node=unpack(await tool(args,'team_delegate',{agentId:worker,stageId:'research',task:'Try again'}));await tool(args,'team_wait',{nodeIds:[node.nodeId]});}
  const downstream=unpack(await tool(args,'team_delegate',{agentId:third,stageId:'review',task:'Should be blocked'}));assert.equal(downstream.code,'team_stage_pending');
  return {text:'Cannot complete the workflow'};
 });
 await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:lead,workflow:reviewStages}},'PUT');
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Check retry state'}),task=await f.settled(sent.value.task.id);
 assert.equal(task.status,'failed');assert.equal(calls,2);
});
test('parallel assignments for the same agent retain separate operation records',async t=>{
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_delegate')){
   const nodes=[];for(const stageId of ['a','b'])nodes.push(unpack(await tool(args,'team_delegate',{agentId:worker,stageId,task:stageId})).nodeId);
   const duplicate=unpack(await tool(args,'team_delegate',{agentId:worker,stageId:'a',task:'duplicate'}));assert.equal(duplicate.code,'team_assignment_active');
   await tool(args,'team_wait',{nodeIds:nodes});return {text:'Collected both'};
  }
  await new Promise(resolve=>setTimeout(resolve,25));await args.onEvent({type:'runtime.action',label:'Operation',detail:'Synthetic action',activity:{kind:'command',phase:'completed',callId:'reused-id'}});return {text:'Done'};
 });
 await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:lead,workflow:['a','b'].map(id=>({id,title:id,agentIds:[worker],after:[],required:true}))}},'PUT');
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Check parallel records'}),task=await f.settled(sent.value.task.id);
 assert.equal(task.status,'completed',task.error);const events=task.events.filter(event=>event.type==='runtime.action');
 assert.equal(new Set(events.map(event=>event.teamNodeId)).size,2);assert.equal(new Set(events.map(event=>event.activity.callId)).size,2);
 assert.ok(events.every(event=>task.teamRuns[0].nodes.some(node=>node.id===event.teamNodeId)));
});
test('confirmation checks inherited connections and accepts an explicit available override',async t=>{
 const f=await fixture(t,async args=>{if(args.dynamicTools.some(x=>x.name==='team_plan')){await tool(args,'team_plan',{title:'Model check',stages:reviewStages});return {text:'Stopped after confirmation for this fixture'};}return {text:'Unused'};});
 const base=f.app.store.connection(),missing={...base,id:'missing-key',name:'Missing key'};f.app.store.put('modelConnections',missing);
 f.app.store.put('agents',{...f.app.store.require('agents',worker),connectionId:missing.id});
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Confirm models'}),taskId=sent.value.task.id,plan=await waitForPlan(f,taskId);
 const rejected=await f.api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:0});assert.equal(rejected.status,409);assert.equal(rejected.value.code,'workflow_model_unavailable');
 const accepted=await f.api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:0,defaultConnectionId:base.id});assert.equal(accepted.status,200);await f.settled(taskId);
});

test('confirmation schedules parallel branches and hands both files to the dependent stage without further lead decisions',async t=>{
 const bothStarted=deferred(),release=deferred();let started=0,writerInputs;
 const stages=[{id:'a',title:'A',description:'Write A',agentIds:[worker],after:[],required:true},{id:'b',title:'B',description:'Write B',agentIds:[third],after:[],required:true},{id:'c',title:'C',description:'Read both files and write C',agentIds:[worker],after:['a','b'],required:true}];
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_plan')){const result=unpack(await tool(args,'team_plan',{title:'Automatic graph',stages}));assert.equal(result.execution.status,'completed');return {text:'The runtime collected all three assignments.'};}
  if(args.prompt.includes('已确认的分工：C')){writerInputs=readdirSync(path.join(args.workspace,'inputs'));assert.equal(writerInputs.length,2);assert.ok(writerInputs.some(name=>name.endsWith('-a.md')));assert.ok(writerInputs.some(name=>name.endsWith('-b.md')));writeFileSync(path.join(args.workspace,'c.md'),'Final');return {text:'Read both'};}
  if(++started===2)bothStarted.resolve();await release.promise;const name=args.prompt.includes('已确认的分工：A')?'a':'b';writeFileSync(path.join(args.workspace,name+'.md'),name);return {text:name};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Original fixture inputs'}),id=sent.value.task.id,plan=await waitForPlan(f,id);
 assert.equal(started,0);await f.api(`tasks/${id}/workflow`,{action:'confirm',planId:plan.id,revision:0});await bothStarted.promise;
 const running=f.app.store.require('tasks',id);assert.equal(running.teamRuns[0].nodes.filter(n=>n.kind==='worker'&&n.status==='running').length,2);
 release.resolve();const task=await f.settled(id);assert.equal(task.status,'completed',task.error);assert.equal(task.teamRuns[0].execution,'scheduled');assert.equal(task.teamRuns[0].nodes.length,4);assert.equal(task.teamRuns[0].nodes.at(-1).inputArtifacts.length,2);
});

test('a failed scheduled branch blocks only its dependents and preserves the lead explanation',async t=>{
 let workerCalls=0;
 const stages=[{...reviewStages[0],id:'bad'},{...reviewStages[1],id:'independent',after:[]},{...reviewStages[1],id:'blocked',after:['bad']}];
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_plan')){const result=unpack(await tool(args,'team_plan',{title:'Partial failure',stages}));assert.equal(result.execution.status,'incomplete');assert.deepEqual(result.execution.blockedStageIds,['blocked']);return {text:'The first connection failed; the independent output remains available.'};}
  workerCalls++;if(args.prompt.includes('已确认的分工：Research'))throw new Error('Fixture connection failure');return {text:'Independent output'};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Run independent branches'}),id=sent.value.task.id,plan=await waitForPlan(f,id);await f.api(`tasks/${id}/workflow`,{action:'confirm',planId:plan.id,revision:0});const task=await f.settled(id);
 assert.equal(task.status,'failed');assert.equal(workerCalls,2);assert.equal(task.teamRuns[0].nodes.filter(n=>n.status==='completed').length,1);assert.match(task.messages.at(-1).content,/independent output remains/);
});

test('scheduled cancellation settles workers and never dispatches their dependents',async t=>{
 const started=deferred();let calls=0;
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_plan')){await tool(args,'team_plan',{title:'Cancel run',stages:reviewStages});return {text:'Stopped'};}
  calls++;started.resolve();await new Promise(resolve=>args.signal.addEventListener('abort',resolve,{once:true}));return {text:'Interrupted'};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Start fixture'}),id=sent.value.task.id,plan=await waitForPlan(f,id);await f.api(`tasks/${id}/workflow`,{action:'confirm',planId:plan.id,revision:0});await started.promise;await f.api(`tasks/${id}/cancel`,{});const task=await f.settled(id);
 assert.equal(task.status,'cancelled');assert.equal(calls,1);assert.ok(task.teamRuns[0].nodes.every(n=>n.status==='interrupted'));
});

test('a revised plan can reuse a task artifact but a reusable workflow excludes prior task facts and inputs',async t=>{
 let input;
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(x=>x.name==='team_plan')){
   const task=f.app.store.list('tasks').find(item=>item.status==='running');
   f.app.store.put('artifacts',{id:'prior-result',taskId:task.id,name:'prior.md',content:'Previously checked',version:2,type:'markdown',versions:[]});
   const rejected=unpack(await tool(args,'team_plan',{title:'Wrong scope',stages:[{...reviewStages[0],inputArtifactIds:['unrelated']}]}));assert.equal(rejected.code,'team_artifact_scope');
   const result=unpack(await tool(args,'team_plan',{title:'Reuse result',stages:[{...reviewStages[0],description:'Prior dataset: A=7.2 and B=7.6',expectedOutput:'Conclude B leads by 0.4',inputArtifactIds:['prior-result']}]}));assert.equal(result.execution.status,'completed');return {text:'Done'};
  }
  input=readFileSync(path.join(args.workspace,'inputs/prior-result-prior.md'),'utf8');return {text:'Used prior file'};
 });
 f.app.store.put('artifacts',{id:'unrelated',taskId:'other-task',name:'other.md',content:'Must not read',version:1});
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Reuse the checked file'}),id=sent.value.task.id,plan=await waitForPlan(f,id);await f.api(`tasks/${id}/workflow`,{action:'confirm',planId:plan.id,revision:0});const task=await f.settled(id);
 assert.equal(task.status,'completed',task.error);assert.equal(input,'Previously checked');assert.equal(task.teamRuns[0].nodes[1].inputArtifacts[0].version,2);
 const saved=await f.api(`tasks/${id}/save-workflow`,{runId:task.teamRuns[0].id});assert.equal(saved.status,201);assert.equal(saved.value.team.workflow[0].inputArtifactIds,undefined);assert.equal(saved.value.team.workflow[0].expectedOutput,undefined);assert.equal(saved.value.team.workflow[0].description,'');assert.equal(saved.value.team.workflow[0].title,reviewStages[0].title);assert.equal(saved.value.messages.length,0);assert.deepEqual(saved.value.taskIds,[]);assert.equal(f.app.store.require('tasks',id).teamRuns[0].workflow[0].expectedOutput,'Conclude B leads by 0.4');
});

test('saved workflow clarification stays in the original task without dispatch or false failure',async t=>{
 let calls=0;
 const f=await fixture(t,async args=>{calls++;assert.match(args.prompt,/缺少必填参数时/);return {text:'这次活动的主题和参加人数是什么？'};});
 const workflow=[{id:'draft',title:'撰写活动简报',description:'Use this run’s inputs',agentIds:[worker],after:[],required:true}];
 await f.api(`agent-rooms/${f.room.id}`,{team:{leadAgentId:lead,workflow,program:{source:'return await workflow.run("draft",{input:JSON.stringify(args)});',parameters:[{name:'topic',label:'主题',type:'string',required:true}],args:{}}}},'PUT');
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'沿用这套流程'}),task=await f.settled(sent.value.task.id);
 assert.equal(task.status,'needs_input');assert.equal(task.error,undefined);assert.equal(task.workflowPlans,undefined);
 assert.equal(task.teamRuns[0].execution,'conversation');assert.equal(task.teamRuns[0].nodes.length,1);assert.equal(f.app.store.require('agentRooms',f.room.id).activeTaskId,task.id);
 const continued=await f.api(`tasks/${task.id}/message`,{content:'主题是虚构读书会，12 人。'});assert.equal(continued.status,200);await f.settled(task.id);
 const current=f.app.store.require('tasks',task.id);assert.equal(current.messages.filter(m=>m.role==='user').length,2);assert.equal(calls,2);assert.equal(f.app.store.require('agentRooms',f.room.id).taskIds.length,1);
});

test('lead deliverables are bound to their actual run after collection, alongside worker files',async t=>{
 const f=await fixture(t,async args=>{
  if(args.dynamicTools.some(tool=>tool.name==='team_delegate')){const node=unpack(await tool(args,'team_delegate',{agentId:worker,task:'Write a draft'}));await tool(args,'team_wait',{nodeIds:[node.nodeId]});writeFileSync(path.join(args.workspace,'final.md'),'Lead reviewed the draft.');return {text:'The final document is ready.'};}
  writeFileSync(path.join(args.workspace,'draft.md'),'Worker draft.');return {text:'Draft ready.'};
 });
 const sent=await f.api(`agent-rooms/${f.room.id}/messages`,{content:'Create and review a draft'}),task=await f.settled(sent.value.task.id);
 assert.equal(task.status,'completed');const run=task.teamRuns[0];assert.equal(run.outputArtifactIds.length,1);assert.equal(f.app.store.require('artifacts',run.outputArtifactIds[0]).content,'Lead reviewed the draft.');assert.equal(run.nodes.find(n=>n.kind==='worker').artifacts.length,1);
});
