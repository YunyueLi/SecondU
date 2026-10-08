import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {digest,stamp} from '../server/remote/common.mjs';

const key='synthetic-integration-key',fileData=Buffer.from('Remote fixture result.\n');
class FixtureRemoteTransport {
  constructor(){this.calls=[];this.states=new Map();}
  async probe(computer){this.calls.push({op:'probe'});return {protocol:1,node:'22.13.0',nodePath:'/fixture/node',platform:'linux',codex:'codex fixture',codexPath:'/fixture/codex',workspaceRoot:computer.workspaceRoot,checkedAt:stamp()};}
  async prepare(_computer,pkg){this.calls.push({op:'prepare'});return {protocol:1,version:pkg.version,runtimePath:`/fixture/.local/share/secondu-remote/releases/${pkg.version}/server/remote/rpc.mjs`};}
  event(record,type,label){record.state.sequence++;record.state.updatedAt=stamp();record.events.push({sequence:record.state.sequence,at:record.state.updatedAt,type,label,detail:'Synthetic event.'});}
  async call(computer,request){
    this.calls.push({op:request.op,runId:request.runId,ownerId:request.ownerId});let record=this.states.get(request.runId);
    if(request.op==='start'){
      assert.equal(request.input.apiKey,key);assert.deepEqual(Object.keys(request.input).sort(),['apiKey','codexPath','computerRevision','credentialConsent','durationMs','files','modelRevision','prompt','requestId','settings','workspace'].sort());
      assert.equal(record,undefined,'the local app must never replay a remote start');
      record={state:{id:request.runId,status:'awaiting_approval',workspace:computer.probe.workspaceRoot,createdAt:stamp(),updatedAt:stamp(),startedAt:stamp(),sequence:0,approvals:[{id:'fixture-approval',title:'Fixture operation',description:'Explicit single action.',details:'{"command":"fixture"}',createdAt:stamp()}],files:[],filesTruncated:false,cancelRequested:false},events:[]};this.event(record,'remote.approval','Waiting for fixture approval');this.states.set(request.runId,record);return {state:structuredClone(record.state)};
    }
    if(!record)throw Object.assign(new Error('Fixture remote run missing'),{status:404,code:'remote_run_not_found'});
    if(request.op==='poll'){const events=record.events.filter(event=>event.sequence>request.input.cursor);return {state:structuredClone(record.state),events:structuredClone(events),cursor:events.at(-1)?.sequence??request.input.cursor,hasMore:false};}
    if(request.op==='approval'){
      assert.equal(request.input.approvalId,'fixture-approval');record.state.status='completed';record.state.approvals=[];record.state.result=request.input.decision==='approve'?'Approved fixture result.':'Declined fixture result.';record.state.finishedAt=stamp();record.state.files=request.input.decision==='approve'?[{path:'result.txt',size:fileData.length,sha256:digest(fileData),modifiedAt:stamp()}]:[];this.event(record,'remote.completed','Fixture finished');return {state:structuredClone(record.state),accepted:true};
    }
    if(request.op==='cancel'){record.state.status='cancelled';record.state.approvals=[];record.state.cancelRequested=true;record.state.finishedAt=stamp();this.event(record,'remote.cancelled','Fixture cancelled');return {state:structuredClone(record.state),cancelRequested:true};}
    if(request.op==='file'){assert.equal(request.input.path,'result.txt');assert.equal(request.input.sha256,digest(fileData));return {path:'result.txt',size:fileData.length,sha256:digest(fileData),data:fileData.toString('base64')};}
    throw Error('Unexpected fixture operation');
  }
}
async function fixture(t,{executionPolicy='personal'}={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-remote-api-')),transport=new FixtureRemoteTransport();let localCalls=0,app;
  const launch=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},executionPolicy,remoteTransport:transport,runCodex:async()=>{localCalls++;throw Error('A remote task must never invoke the local runtime');}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};await launch();
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'POST',headers={})=>{const res=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,value:await res.json()};};
  return {get app(){return app;},get localCalls(){return localCalls;},transport,api,async restart(){await app.close();await launch();}};
}
async function configured(f){
  const connection=(await f.api('model-connections',{name:'Fixture',provider:'custom',model:'fixture-model',baseUrl:'https://fixture.invalid/v1',api:'responses',reasoningEffort:'low',apiKey:key})).value;
  const response=await f.api('computers',{name:'Fixture computer',host:'fixture.invalid',port:22,workspaceRoot:'/fixture/project'});assert.equal(response.status,200);const computer=response.value.computer;
  assert.equal((await f.api(`computers/${computer.id}/probe`,{})).status,200);assert.equal((await f.api(`computers/${computer.id}/prepare`,{installRuntime:true})).status,200);
  const body={requestId:randomUUID(),prompt:'Synthetic remote task.',modelConnectionId:connection.id,modelRevision:1,computerRevision:computer.revision,credentialConsent:true};return {computer,connection,body};
}
async function dispatched(f){await Promise.all([...f.app.remoteComputers.pending.values()]);assert.equal(f.app.remoteComputers.lastObserverError,undefined);}

test('HTTP remote run creates an isolated task mirror, survives app restart, and deduplicates remote events and result',async t=>{
  const f=await fixture(t),{computer,body}=await configured(f);
  f.app.store.setMeta('executionSettings',{approvalMode:'full'});
  const attachment=(await f.api('attachments',{name:'fixture.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7\nSynthetic fixture').toString('base64')})).value;
  body.files=[{attachmentId:attachment.id,path:'input.pdf'}];
  const start=await f.api(`computers/${computer.id}/runs`,body);assert.equal(start.status,200);const run=start.value.run;assert.ok(run.taskId);await dispatched(f);
  const remote=f.transport.states.get(run.id);f.transport.event(remote,'runtime.action','Recorded remote operation');remote.events.at(-1).activity={kind:'tool',phase:'running',callId:'remote-call',name:`read ${key}`,permissions:'all',arguments:{password:'never copy'}};
  let task=(await f.api(`tasks/${run.taskId}`)).value;assert.equal(task.status,'awaiting_approval');assert.equal(task.digitalTwinEnabled,false);assert.equal(task.approvalMode,'ask');assert.deepEqual(task.contextFactIds,[]);assert.deepEqual(task.connectorIds,[]);assert.deepEqual(task.agentIds,[]);assert.deepEqual(task.artifactIds,[]);assert.equal(f.localCalls,0);
  assert.equal((await f.api(`computers/${computer.id}/runs`,body)).value.run.id,run.id);assert.equal(f.app.store.list('tasks').length,1);
  await f.restart();task=(await f.api(`tasks/${run.taskId}`)).value;assert.equal(task.status,'awaiting_approval');assert.equal(task.events.some(event=>event.type==='interrupted'),false);assert.equal(f.transport.calls.filter(call=>call.op==='start').length,1);assert.equal(f.localCalls,0);
  assert.equal((await f.api(`tasks/${run.taskId}/run`,{})).status,409);assert.equal((await f.api(`tasks/${run.taskId}/message`,{content:'Do not run locally.'})).status,409);assert.equal((await f.api(`tasks/${run.taskId}`,{digitalTwinEnabled:true},'PUT')).status,409);
  const polled=await f.api(`tasks/${run.taskId}/poll`,{});assert.equal(polled.status,200);assert.equal(polled.value.status,'awaiting_approval');
  const approved=await f.api(`tasks/${run.taskId}/approval`,{approvalId:'fixture-approval',decision:'approve'});assert.equal(approved.status,200);assert.equal(approved.value.status,'completed');
  await f.api(`tasks/${run.taskId}/poll`,{});await f.api(`tasks/${run.taskId}/poll`,{cursor:0});task=(await f.api(`tasks/${run.taskId}`)).value;
  assert.equal(task.messages.filter(message=>message.id===`${run.id}-result`).length,1);assert.equal(task.events.filter(event=>event.id.startsWith(`${run.id}-event-`)).length,3);assert.equal(new Set(task.events.map(event=>event.id)).size,task.events.length);
  const activity=task.events.find(event=>event.type==='remote.runtime.action').activity;assert.deepEqual(activity,{kind:'tool',phase:'running',callId:'remote-call',name:'read [已隐藏凭据]'});assert.doesNotMatch(JSON.stringify(task),/never copy/);
  const artifact=await f.api(`computers/${computer.id}/runs/${run.id}/file`,{path:'result.txt'});assert.equal(artifact.status,200);assert.equal(artifact.value.dataBase64,fileData.toString('base64'));
  assert.equal((await f.api(`tasks/${run.taskId}`,{},'DELETE')).status,409);assert.equal(f.localCalls,0);assert.equal(f.transport.calls.filter(call=>call.op==='start').length,1);
  for(const route of ['bootstrap','computers',`computers/${computer.id}/runs`,`tasks/${run.taskId}/remote`])assert.equal(JSON.stringify((await f.api(route)).value).includes(key),false);
  await f.restart();task=(await f.api(`tasks/${run.taskId}`)).value;assert.equal(task.status,'completed');assert.equal(task.messages.filter(message=>message.id===`${run.id}-result`).length,1);
});

test('HTTP remote controls preserve computer/space boundaries and never enter the local task runner',async t=>{
  const f=await fixture(t),{computer,body}=await configured(f),start=await f.api(`computers/${computer.id}/runs`,body),run=start.value.run;await dispatched(f);
  const second=(await f.api('computers',{name:'Another computer',host:'another.invalid',workspaceRoot:'/fixture/another'})).value.computer;
  assert.equal((await f.api(`computers/${second.id}/runs/${run.id}/cancel`,{})).status,404);
  assert.equal((await f.api(`tasks/${run.taskId}/approval`,{approvalId:'stale-approval',decision:'approve'})).status,409);
  const cancelled=await f.api(`tasks/${run.taskId}/cancel`,{});assert.equal(cancelled.status,200);assert.equal(cancelled.value.status,'cancelled');assert.equal(cancelled.value.remoteExecution.cancelRequested,true);assert.equal(f.localCalls,0);
  assert.equal((await f.api('spaces/personal',{})).status,200);assert.equal((await f.api(`spaces/personal/computers/${computer.id}/runs`)).status,404);assert.equal((await f.api(`spaces/personal/tasks/${run.taskId}`)).status,404);
  assert.equal((await f.api('computers',{name:'Denied',host:'fixture.invalid',workspaceRoot:'/fixture/project'},'POST',{Origin:'https://untrusted.invalid'})).status,403);
  const before=f.transport.calls.length;assert.equal((await f.api(`computers/${computer.id}/runs`,{...body,requestId:randomUUID(),prompt:'x'.repeat(50001)})).status,400);assert.equal(f.transport.calls.length,before);
});

test('HTTP showcase space exposes read-only computer settings and blocks every remote mutation',async t=>{
  const f=await fixture(t,{executionPolicy:'showcase'});const list=await f.api('computers');assert.equal(list.status,200);assert.equal(list.value.readOnly,true);
  for(const route of ['computers','computers/fixture/probe','computers/fixture/prepare','computers/fixture/runs','computers/fixture/runs/fixture/poll','computers/fixture/runs/fixture/cancel'])assert.equal((await f.api(route,{})).status,403);
  assert.equal(f.transport.calls.length,0);assert.equal(f.localCalls,0);
});

test('a failed mirror write rolls back local task creation and restart recovers exactly one mirror without replay',async t=>{
  const f=await fixture(t),{computer,body}=await configured(f),originalPut=f.app.store.put.bind(f.app.store);
  f.app.store.put=(collection,record)=>{if(collection==='tasks'&&record.remoteExecution)throw Object.assign(new Error('Synthetic mirror persistence failure'),{code:'fixture_mirror_failed'});return originalPut(collection,record);};
  const start=await f.api(`computers/${computer.id}/runs`,body);assert.equal(start.status,200);await Promise.all([...f.app.remoteComputers.pending.values()]);
  assert.equal(f.app.remoteComputers.lastObserverError.code,'fixture_mirror_failed');assert.equal(f.app.store.list('tasks').length,0,'the failed transaction must not leave an orphan local task');assert.equal(f.app.store.list('remoteRuns').length,1);
  f.app.store.put=originalPut;await f.restart();const runs=(await f.api(`computers/${computer.id}/runs`)).value.runs;assert.equal(runs.length,1);assert.ok(runs[0].taskId);assert.equal(f.app.store.list('tasks').length,1);assert.equal(f.app.store.require('tasks',runs[0].taskId).status,'awaiting_approval');
  assert.equal(f.transport.calls.filter(call=>call.op==='start').length,1);assert.equal(f.localCalls,0);
});
