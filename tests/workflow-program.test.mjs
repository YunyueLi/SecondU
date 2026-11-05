import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {TaskRunner} from '../server/runner.mjs';
import {TeamCoordinator} from '../server/team-runs.mjs';
import {normalizeProgram,programArguments,runProgram,programHash} from '../server/workflow-program.mjs';
const lead='agent-planner',worker='agent-reviewer',writer='demo-v2-agent-writer';
const stage=(id,agentId,after=[])=>({id,title:id,description:'Write a short fictional result.',agentIds:[agentId],after,required:true});
const program={source:'const x=await workflow.run("research",{input:args.topic});const y=await workflow.run("report",{input:x.results.join("\\n")});return y.results;',parameters:[{name:'topic',label:'主题',type:'string',required:true}],args:{topic:'alpha'}};
const waitFor=async fn=>{for(let i=0;i<300;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw new Error('Timed out');};
async function fixture(t,runCodex){
 const directory=mkdtempSync(path.join(os.tmpdir(),'second-u-program-'));
 const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false},runCodex});
 const connection={...app.store.connection(),provider:'openai',api:'responses',baseUrl:'https://api.openai.com/v1',model:'fixture-model'};app.store.put('modelConnections',connection);app.store.setKey(connection,'synthetic-program-key');
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const api=async(route,body,method='POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,value:await r.json()};};
 const made=await api('agent-rooms',{title:'Parameterized fixture',kind:'group',agentIds:[lead,worker,writer],mode:'live',digitalTwinEnabled:false,team:{leadAgentId:lead,concurrency:2,maxNodes:12,reviewBeforeRun:true,workflow:[stage('research',worker),stage('report',writer,['research'])],program:{...program,args:{}}}});assert.equal(made.status,201);
 const review=async taskId=>{const plan=await waitFor(()=>app.store.require('tasks',taskId).workflowPlans?.find(p=>p.status==='pending'));const reply=await api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:plan.revision});assert.equal(reply.status,200,JSON.stringify(reply));};
 return {app,api,room:made.value,review};
}
test('parameters validate types, defaults, required fields, unknown names and syntax before execution',()=>{
 const p=normalizeProgram(program);assert.deepEqual(programArguments(p,{topic:'new'},{requireAll:true}),{topic:'new'});
 for(const args of [{},{topic:7},{topic:'x',extra:'bad'}])assert.throws(()=>programArguments(p,args,{requireAll:true}));
 assert.throws(()=>normalizeProgram({...program,source:'return {;'}));
 assert.throws(()=>normalizeProgram({...program,parameters:[{name:'constructor',label:'bad',type:'string'}]}));
});
test('script executes parallel calls, loops and result-dependent conditions in an isolated cell',async()=>{
 const requests=[];const value=await runProgram({source:'const values=await Promise.all([1,2].map(i=>workflow.run("research",{key:"item_"+i,input:String(i)})));if(values[0].ok)return await workflow.run("report",{input:args.topic});return "wrong";',args:{topic:'new material'}},{onStep:async r=>{requests.push(r);return {ok:true,input:r.input};},timeoutMs:3000});
 assert.equal(value.input,'new material');assert.deepEqual(requests.map(r=>r.key??r.stageId),['item_1','item_2','report']);
});
test('cell denies host APIs, dynamic code, random values and infinite loops after awaits',async()=>{
 for(const source of ['return process.env;','return await import("node:fs");','return Function("return process")();','return Math.random();','await workflow.run("x");while(true){}'])await assert.rejects(runProgram({source,args:{}},{onStep:async()=>1,timeoutMs:3000}));
});
test('stopped run resumes with same identity and completed files, then saves a clean parameterized reusable flow',async t=>{
 let reportStarted=false,reportCalls=0,researchCalls=0,block=true;
 const runCodex=async args=>{
  if(args.dynamicTools.some(t=>t.name==='team_plan'))return {text:'Read and checked the final files.'};
  const reporting=args.prompt.includes('已确认的')?args.prompt.includes('report'):args.prompt.includes('Write a short fictional result.')&&args.prompt.includes('前置阶段交接文件')&&args.prompt.includes('team-output-');
  // The report receives the predecessor's file through the real handoff path.
  if(reporting){reportCalls++;reportStarted=true;if(block)await new Promise((resolve,reject)=>{const abort=()=>reject(Object.assign(new Error('stopped'),{name:'AbortError'}));args.signal.addEventListener('abort',abort,{once:true});});}
  else researchCalls++;
  writeFileSync(path.join(args.workspace,reporting?'report.md':'research.md'),args.prompt.includes('beta')?'beta':'alpha');return {text:args.prompt.includes('beta')?'beta':'alpha'};
 };
 const f=await fixture(t,runCodex),started=await f.api(`agent-rooms/${f.room.id}/run-workflow`,{args:{topic:'alpha'}});assert.equal(started.status,201);const taskId=started.value.task.id;
 await f.review(taskId);await waitFor(()=>reportStarted);let task=f.app.store.require('tasks',taskId);const runId=task.teamRuns[0].id,researchId=task.teamRuns[0].nodes.find(n=>n.stageId==='research').id;
 await f.api(`tasks/${taskId}/cancel`,{});task=f.app.store.require('tasks',taskId);assert.equal(task.teamRuns[0].status,'interrupted');assert.equal(task.teamRuns[0].steps[0].status,'completed');
 block=false;const resumed=await f.api(`tasks/${taskId}/resume-workflow`,{runId});assert.equal(resumed.status,200,JSON.stringify(resumed));assert.equal((await f.api(`tasks/${taskId}/resume-workflow`,{runId})).status,409);
 await f.app.runner.active.get(taskId)?.promise;task=f.app.store.require('tasks',taskId);assert.equal(task.status,'completed',task.error);assert.equal(task.teamRuns.length,1);assert.equal(task.teamRuns[0].id,runId);assert.equal(task.teamRuns[0].nodes.find(n=>n.stageId==='research').id,researchId);assert.equal(researchCalls,1);assert.equal(reportCalls,2);assert.equal(task.teamRuns[0].nodes.find(n=>n.stageId==='report').attempts.length,1);
 const saved=await f.api(`tasks/${taskId}/save-workflow`,{runId});assert.equal(saved.status,201);assert.deepEqual(saved.value.team.program.args,{});assert.equal(saved.value.team.program.source,program.source);
 const next=await f.api(`agent-rooms/${saved.value.id}/run-workflow`,{args:{topic:'beta'}});await f.review(next.value.task.id);await f.app.runner.active.get(next.value.task.id)?.promise;const second=f.app.store.require('tasks',next.value.task.id);assert.equal(second.status,'completed',second.error);assert.notEqual(second.teamRuns[0].id,runId);assert.equal(second.teamRuns[0].programResult[0],'beta');assert.equal(researchCalls,2);
});
test('journal replays original settle order for Promise.race and refuses changed inputs',async()=>{
 const stages=[stage('a',worker),stage('b',writer)];let task={id:'t',prompt:'x',messages:[{id:'m',role:'user',content:'x'}],team:{leadAgentId:lead,workflow:stages,program:{source:'const requests=[workflow.run("a"),workflow.run("b")];const first=await Promise.race(requests);await Promise.all(requests);return first.results[0];',parameters:[],args:{}},maxNodes:8,concurrency:2},teamRuns:[]};
 const make=resumeRunId=>new TeamCoordinator({taskId:'t',lead:{id:lead},agents:[{id:lead},{id:worker},{id:writer}],signal:new AbortController().signal,mutate:(_,fn)=>fn(task),read:()=>task,cleanError:String,resumeRunId,runWorker:async()=>{throw new Error('must not run');}});
 const coordinator=make();const run=coordinator.snapshot();run.configuration=structuredClone(task.team);run.steps=[{key:'b',stageId:'b',hash:programHash({stageId:'b',input:''}),status:'completed',order:1,value:{results:['b']}},{key:'a',stageId:'a',hash:programHash({stageId:'a',input:''}),status:'completed',order:2,value:{results:['a']}}];
 const resumed=make(run.id);const result=await resumed.executeApproved();assert.equal(result.result,'b');
 task.team.program.source='return await workflow.run("a",{input:"changed"});';run.configuration.program=task.team.program;await assert.rejects(make(run.id).executeApproved(),/步骤输入与恢复记录不同/);
});
test('startup leaves interrupted work stopped and resume rejects modified completed output',async t=>{
 let workerStarted=false;const f=await fixture(t,async args=>{if(args.dynamicTools.some(t=>t.name==='team_plan'))return {text:'done'};if(args.prompt.includes('team-output-')){workerStarted=true;await new Promise((_,reject)=>args.signal.addEventListener('abort',()=>reject(Object.assign(new Error('stop'),{name:'AbortError'})),{once:true}));}writeFileSync(path.join(args.workspace,'result.md'),'original');return {text:'original'};});
 const started=await f.api(`agent-rooms/${f.room.id}/run-workflow`,{args:{topic:'one'}}),taskId=started.value.task.id;await f.review(taskId);await waitFor(()=>workerStarted);await f.app.runner.close();
 const runner=new TaskRunner(f.app.store,{scheduler:false,runCodex:async()=>{throw new Error('must not automatically run');}});t.after(()=>runner.close());const task=f.app.store.require('tasks',taskId),run=task.teamRuns[0];assert.equal(task.status,'interrupted');assert.equal(runner.active.size,0);
 const artifact=f.app.store.require('artifacts',run.nodes.find(n=>n.status==='completed').artifacts[0].id);f.app.store.put('artifacts',{...artifact,content:'modified'});assert.throws(()=>runner.start(taskId,{resumeRunId:run.id}),/成果已修改/);
});
test('hard process loss persists the journal and resumes the same run from disk without repeating a completed worker',async t=>{
 const {fork}=await import('node:child_process');const {once}=await import('node:events');
 const directory=mkdtempSync(path.join(os.tmpdir(),'second-u-restart-'));let child,port;
 const launch=async()=>{child=fork(new URL('./fixtures/workflow-restart-server.mjs',import.meta.url),[directory],{stdio:['ignore','ignore','pipe','ipc']});const [ready]=await once(child,'message');port=ready.port;};
 t.after(async()=>{if(child?.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}rmSync(directory,{recursive:true,force:true});});
 const api=async(route,body,method='POST')=>{const response=await fetch(`http://127.0.0.1:${port}/api/${route}`,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;};
 const until=async fn=>{for(let n=0;n<300;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw new Error('restart fixture timed out');};
 await launch();const room=await api('agent-rooms',{kind:'group',agentIds:[lead,worker,writer],mode:'live',digitalTwinEnabled:false,team:{leadAgentId:lead,maxNodes:12,workflow:[stage('research',worker),stage('report',writer,['research'])],program:{...program,args:{}}}});
 const started=await api(`agent-rooms/${room.id}/run-workflow`,{args:{topic:'persisted'}}),taskId=started.task.id;
 const plan=await until(async()=>{const task=await api(`tasks/${taskId}`,undefined,'GET');return task.workflowPlans?.[0];});await api(`tasks/${taskId}/workflow`,{action:'confirm',planId:plan.id,revision:plan.revision});
 const before=await until(async()=>{const task=await api(`tasks/${taskId}`,undefined,'GET');return task.teamRuns?.[0]?.nodes.some(n=>n.stageId==='report'&&n.status==='running')&&task;});
 const runId=before.teamRuns[0].id,completed=before.teamRuns[0].nodes.find(n=>n.stageId==='research');
 const exited=once(child,'exit');child.kill('SIGKILL');await exited;await launch();
 const recovered=await api(`tasks/${taskId}`,undefined,'GET');assert.equal(recovered.status,'interrupted');assert.equal(recovered.teamRuns[0].id,runId);assert.equal(recovered.teamRuns[0].nodes.find(n=>n.id===completed.id).status,'completed');
 assert.equal(recovered.events.filter(e=>e.type==='team.worker_started'&&e.agentId===worker).length,1);
 writeFileSync(path.join(directory,'release.flag'),'resume');await api(`tasks/${taskId}/resume-workflow`,{runId});
 const finished=await until(async()=>{const task=await api(`tasks/${taskId}`,undefined,'GET');if(task.status==='failed')throw new Error(task.error);return task.status==='completed'&&task;});
 assert.equal(finished.teamRuns.length,1);assert.equal(finished.teamRuns[0].id,runId);assert.equal(finished.events.filter(e=>e.type==='team.worker_started'&&e.agentId===worker).length,1);assert.equal(finished.teamRuns[0].nodes.find(n=>n.stageId==='report').attempts.length,1);
});
test('script fan-out queues repeated stage assignments under the concurrency limit',async()=>{
 const team={leadAgentId:lead,maxNodes:8,concurrency:2,workflow:[stage('batch',worker)],program:{source:'return await Promise.all([1,2,3].map(i=>workflow.run("batch",{key:"item_"+i,input:String(i)})));',parameters:[],args:{}}};const task={id:'fanout',prompt:'batch',messages:[],team,teamRuns:[]};let running=0,maximum=0;
 const coordinator=new TeamCoordinator({taskId:task.id,lead:{id:lead},agents:[{id:lead},{id:worker}],signal:new AbortController().signal,mutate:(_,fn)=>fn(task),read:()=>task,cleanError:String,runWorker:async(_,node)=>{maximum=Math.max(maximum,++running);await new Promise(r=>setTimeout(r,20));running--;return {text:node.objective};}});
 coordinator.managed=true;const result=await coordinator.executeApproved();assert.equal(result.result.length,3);assert.equal(maximum,2);assert.equal(coordinator.snapshot().nodes.filter(n=>n.status==='completed').length,3);coordinator.finish('Collected all iterations.');
});
