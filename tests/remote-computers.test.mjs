import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { saveConnection } from '../server/connections.mjs';
import { saveAttachment } from '../server/attachments.mjs';
import { RemoteComputerService } from '../server/remote/service.mjs';
import { runtimePackage, RUNTIME_FILES, PROBE, INSTALLER, processJson, sshArgs, shellQuote } from '../server/remote/transport.mjs';
import { digest, terminal } from '../server/remote/common.mjs';

const secret='synthetic-remote-key-never-a-real-key',pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const settings={name:'Remote fixture',provider:'custom',model:'fixture-model',baseUrl:'https://remote-fixture.invalid/v1',api:'responses',reasoningEffort:'low',apiKey:secret};
class LocalRemoteTransport {
  constructor(home){this.env={HOME:home,PATH:path.join(home,'bin')+path.delimiter+path.dirname(process.execPath)+':/usr/bin:/bin',LANG:'en_US.UTF-8'};this.calls=[];}
  probe(computer){return processJson(process.execPath,['-e',PROBE],{workspaceRoot:computer.workspaceRoot},{env:this.env});}
  prepare(_computer,pkg){return processJson(process.execPath,['-e',INSTALLER],pkg,{env:this.env});}
  call(computer,request){this.calls.push({op:request.op,runId:request.runId});return processJson(process.execPath,[computer.runtime.runtimePath],request,{env:this.env,secret:request.input?.apiKey});}
}
async function fixture(t){
  const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'hither-remote-'))),home=path.join(root,'remote-home'),workspace=path.join(root,'project');mkdirSync(home);mkdirSync(workspace);mkdirSync(path.join(home,'bin'));
  const source=readFileSync(new URL('./fixtures/remote-codex.mjs',import.meta.url),'utf8').replace('#!/usr/bin/env node',`#!${process.execPath}`);writeFileSync(path.join(home,'bin','codex'),source,{mode:0o700});
  let store=new Store(path.join(root,'local-space'),{seed:false});const transport=new LocalRemoteTransport(home),service=new RemoteComputerService(store,{executionPolicy:'personal',transport}),connection=saveConnection(store,settings);
  let {computer}=await service.owner('POST',[],{name:'Synthetic remote',host:'fixture.invalid',port:22,workspaceRoot:workspace});
  ({computer}=await service.owner('POST',[computer.id,'probe'],{}));({computer}=await service.owner('POST',[computer.id,'prepare'],{installRuntime:true}));
  const body=(prompt,extra={})=>({requestId:`request-${crypto.randomUUID()}`,prompt,modelConnectionId:connection.id,modelRevision:1,computerRevision:computer.revision,credentialConsent:true,...extra});
  const activeServices=[service];
  t.after(async()=>{
    for(const run of store.list('remoteRuns')){
      try{await transport.call(run._binding,{version:1,ownerId:service.ownerId,runId:run.id,op:'cancel',input:{}});for(let i=0;i<60;i++){const r=await transport.call(run._binding,{version:1,ownerId:service.ownerId,runId:run.id,op:'poll',input:{cursor:0}});if(terminal(r.state.status))break;await pause(50);}}catch{}
    }
    for(const instance of activeServices)instance.close();store.close();rmSync(root,{recursive:true,force:true});
  });
  return {root,home,workspace,get store(){return store;},service,transport,computer,connection,body,reopen(reopenDatabase=false){if(reopenDatabase){store.close();store=new Store(path.join(root,'local-space'),{seed:false});}const next=new RemoteComputerService(store,{executionPolicy:'personal',transport});activeServices.push(next);return next;}};
}
async function until(service,runId,predicate,timeout=40000){const start=Date.now();let result;do{result=(await service.poll(runId)).run;if(predicate(result))return result;await pause(60);}while(Date.now()-start<timeout);assert.fail(`Remote fixture timeout: ${JSON.stringify(result)}`);}
function allContents(root){let result='';for(const name of readdirSync(root)){const file=path.join(root,name),stat=statSync(file);result+=stat.isDirectory()?allContents(file):readFileSync(file).toString('utf8');}return result;}

test('detached run survives observer close, reopens without replay, and returns verified artifacts',async t=>{
  const f=await fixture(t),body=f.body('DELAY finish after observer closes');
  const input=saveAttachment(f.store,{name:'input.txt',mime:'text/plain',data:Buffer.from('Explicit synthetic input.').toString('base64')});body.files=[{attachmentId:input.id,path:'inputs/source.txt'}];
  saveAttachment(f.store,{name:'unselected.txt',mime:'text/plain',data:Buffer.from('Must remain local.').toString('base64')});
  const {run}=await f.service.owner('POST',[f.computer.id,'runs'],body);assert.equal(run.status,'starting');assert.equal(run.dispatch,'pending');
  assert.equal((await f.service.owner('POST',[f.computer.id,'runs'],body)).run.id,run.id);
  await until(f.service,run.id,value=>value.dispatch==='submitted');f.service.close();
  const reopened=f.reopen(true);await pause(2100);const completed=await until(reopened,run.id,value=>terminal(value.status));assert.equal(completed.status,'completed');
  assert.equal(f.transport.calls.filter(call=>call.op==='start').length,1);assert.equal(readFileSync(path.join(f.workspace,'invocations.log'),'utf8'),'start\n');
  assert.equal(readFileSync(path.join(f.workspace,'inputs/source.txt'),'utf8'),'Explicit synthetic input.');assert.equal(existsSync(path.join(f.workspace,'unselected.txt')),false);
  const artifact=await reopened.readFile(run.id,'result.md');assert.equal(Buffer.from(artifact.dataBase64,'base64').toString(),'Synthetic remote result.\n');assert.equal(artifact.sha256,digest(Buffer.from(artifact.dataBase64,'base64')));
  writeFileSync(path.join(f.workspace,'result.md'),'Changed outside task.');await assert.rejects(reopened.readFile(run.id,'result.md'),error=>error.code==='remote_file_changed');
  assert.equal(allContents(f.home).includes(secret),false,'the remote runtime must not persist a credential');assert.equal(JSON.stringify(f.store.list('remoteRuns')).includes(secret),false);
  assert.ok(completed.events.some(event=>event.type==='remote.completed'));assert.equal(completed.observation.status,'connected');
  const message=completed.events.find(event=>event.type==='runtime.message');assert.equal(message.activity.kind,'message');assert.equal(message.activity.phase,'completed');assert.equal(message.activity.messagePhase,'final_answer');assert.ok(message.activity.callId);
  await assert.rejects(reopened.poll(run.id,{cursor:completed.cursor+1}),error=>error.code==='remote_cursor_ahead');assert.equal(reopened.getRun(run.id).cursor,completed.cursor);
});

test('remote approval survives reconnect, is bound to one operation, and supports reject',async t=>{
  const f=await fixture(t),{run}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('APPROVAL'));
  const waiting=await until(f.service,run.id,value=>value.status==='awaiting_approval');assert.equal(waiting.approvals.length,1);f.service.close();const reopened=f.reopen(),decision={approvalId:waiting.approvals[0].id,decision:'reject'};
  const accepted=await reopened.owner('POST',[f.computer.id,'runs',run.id,'approval'],decision);assert.equal(accepted.accepted,true);
  const done=await until(reopened,run.id,value=>terminal(value.status));assert.equal(done.status,'completed');assert.match(done.result,/declined/);assert.equal(existsSync(path.join(f.workspace,'result.md')),false);
  await assert.rejects(reopened.owner('POST',[f.computer.id,'runs',run.id,'approval'],{...decision,decision:'approve'}),error=>error.code==='remote_approval_conflict');
});

test('cancellation is acknowledged separately from confirmed terminal state',async t=>{
  const f=await fixture(t),{run}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('WAIT'));
  const cancelling=await f.service.owner('POST',[f.computer.id,'runs',run.id,'cancel'],{});
  assert.equal(cancelling.accepted,true);assert.equal(cancelling.run.cancelRequested,true);const done=await until(f.service,run.id,value=>terminal(value.status));assert.equal(done.status,'cancelled');assert.equal(done.executorUnconfirmed,false);
});

test('run notifications support a local mirror without duplicate binding or local task takeover',async t=>{
  const f=await fixture(t),notifications=[];f.service.onRunChanged=run=>{notifications.push(run);if(!run.taskId){const taskId='task-mirror-'+run.id;f.store.put('tasks',{id:taskId,mode:'live'});f.service.attachTask(run.id,taskId);}};
  const {run}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('Finish'));assert.equal(run.taskId,'task-mirror-'+run.id);assert.equal(notifications[0].id,run.id);
  const done=await until(f.service,run.id,value=>terminal(value.status));assert.equal(done.taskId,run.taskId);assert.ok(notifications.some(value=>value.status==='completed'));assert.equal(JSON.stringify(notifications).includes('_binding'),false);
  assert.equal(f.service.attachTask(run.id,run.taskId).taskId,run.taskId);f.store.put('tasks',{id:'other-local-task',mode:'live'});assert.throws(()=>f.service.attachTask(run.id,'other-local-task'),error=>error.code==='remote_task_conflict');
  await assert.rejects(f.service.owner('POST',[f.computer.id,'runs'],f.body('Finish',{taskId:'other-local-task'})),error=>error.code==='remote_task_binding_required');
});

test('a lost worker is interrupted without replay and keeps its workspace protected while an executor may live',async t=>{
  const f=await fixture(t),{run}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('WAIT'));await until(f.service,run.id,value=>value.status==='running'&&value.sequence>=2);
  const stateFile=path.join(f.home,'.local/share/secondu-remote/owners',f.service.ownerId,run.id,'state.json'),state=JSON.parse(readFileSync(stateFile,'utf8'));process.kill(state.pid,'SIGKILL');await pause(200);
  const orphan=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});t.after(()=>{try{process.kill(-orphan.pid,'SIGKILL');}catch{}});
  state.pid=2147483646;state.executorPid=orphan.pid;state.heartbeatAt=new Date(Date.now()-20000).toISOString();writeFileSync(stateFile,JSON.stringify(state));
  const interrupted=await until(f.service,run.id,value=>value.status==='interrupted');assert.equal(interrupted.executorUnconfirmed,true);assert.equal(interrupted.error.code,'remote_worker_stopped');assert.equal(f.transport.calls.filter(value=>value.op==='start').length,1);
  const binding=f.store.require('remoteRuns',run.id)._binding,request={version:1,ownerId:'other-recovery-owner',runId:'new-recovery-run',op:'start',input:{workspace:f.workspace,prompt:'Finish',apiKey:secret,credentialConsent:true,settings:Object.fromEntries(Object.entries(settings).filter(([key])=>!['name','apiKey'].includes(key))),files:[],durationMs:10000,codexPath:path.join(f.home,'bin','codex'),computerRevision:1,modelRevision:1,requestId:'recovery-request'}};
  await assert.rejects(f.transport.call(binding,request),error=>error.code==='remote_workspace_busy');process.kill(-orphan.pid,'SIGKILL');await new Promise(resolve=>orphan.once('exit',resolve));
  const refreshed=(await f.service.poll(run.id)).run;assert.equal(refreshed.executorUnconfirmed,false);assert.equal(refreshed.status,'interrupted');
});

test('configuration revisions, explicit credentials, read-only spaces and selected attachment scope are enforced',async t=>{
  const f=await fixture(t),body=f.body('WAIT');
  for(const patch of [{credentialConsent:false},{computerRevision:2},{modelRevision:2},{files:[{attachmentId:'attachment-not-present',path:'input.txt'}]},{files:[{attachmentId:'attachment-not-present',path:'../secret'}]}])await assert.rejects(f.service.owner('POST',[f.computer.id,'runs'],{...body,...patch}));
  const showcase=new RemoteComputerService(f.store,{executionPolicy:'showcase',transport:f.transport});assert.equal(showcase.list().readOnly,true);await assert.rejects(showcase.owner('POST',[f.computer.id,'probe'],{}),error=>error.code==='showcase_read_only');showcase.close();
  const {run}=await f.service.owner('POST',[f.computer.id,'runs'],body);await until(f.service,run.id,value=>value.dispatch==='submitted');saveConnection(f.store,{name:'Changed model'},f.store.connection(f.connection.id));
  await assert.rejects(f.service.owner('POST',[f.computer.id,'runs'],body),error=>error.code==='remote_consent_changed');
  const updated=await f.service.owner('PUT',[f.computer.id],{name:'Edited computer',expectedRevision:1});assert.equal(updated.computer.revision,2);assert.equal(updated.computer.runtime,undefined);
  const observed=await f.service.poll(run.id);assert.equal(observed.run.computer.name,'Synthetic remote');assert.equal(observed.run.modelRevision,1,'existing execution remains bound to its original authorization');
});

test('disconnect records uncertainty and restart only polls without retransmitting a credential',async t=>{
  const f=await fixture(t),call=f.transport.call.bind(f.transport);f.transport.call=async(computer,request)=>{if(request.op==='start'){await call(computer,request);throw Object.assign(new Error('Synthetic lost response'),{code:'remote_disconnected'});}return call(computer,request);};
  const body=f.body('DELAY'),{run}=await f.service.owner('POST',[f.computer.id,'runs'],body);await Promise.all([...f.service.pending.values()]);const uncertain=f.service.getRun(run.id);assert.equal(uncertain.dispatch,'uncertain');assert.equal(uncertain.observation.status,'disconnected');assert.equal(uncertain.status,'starting');
  f.service.close();const reopened=f.reopen();const done=await until(reopened,run.id,value=>terminal(value.status));assert.equal(done.status,'completed');assert.equal(f.transport.calls.filter(value=>value.op==='start').length,1);
});

test('overlapping workspaces across owners remain locked until the remote executor exits',async t=>{
  const f=await fixture(t),{run}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('WAIT'));await until(f.service,run.id,value=>value.status==='running');
  const binding=f.store.require('remoteRuns',run.id)._binding,child=path.join(f.workspace,'nested');mkdirSync(child);
  const request={version:1,ownerId:'another-owner',runId:'another-run',op:'start',input:{workspace:child,prompt:'Finish',apiKey:secret,credentialConsent:true,settings:Object.fromEntries(Object.entries(settings).filter(([key])=>!['name','apiKey'].includes(key))),files:[],durationMs:10000,codexPath:path.join(f.home,'bin','codex'),computerRevision:1,modelRevision:1,requestId:'other-request'}};
  await assert.rejects(f.transport.call(binding,request),error=>error.code==='remote_workspace_busy');
  await f.service.control(run.id,'cancel',{});await until(f.service,run.id,value=>terminal(value.status));const started=await f.transport.call(binding,request);assert.ok(['running','starting','completed'].includes(started.state.status));
  for(let i=0;i<60;i++){const result=await f.transport.call(binding,{...request,op:'poll',input:{cursor:0}});if(terminal(result.state.status))break;await pause(60);}
});

test('all input destinations are validated before writing any input; secret-like output is excluded',async t=>{
  const f=await fixture(t),one=saveAttachment(f.store,{name:'one.txt',mime:'text/plain',data:Buffer.from('One').toString('base64')}),two=saveAttachment(f.store,{name:'two.txt',mime:'text/plain',data:Buffer.from('Two').toString('base64')});
  writeFileSync(path.join(f.workspace,'existing.txt'),'Keep this.');const {run}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('Finish',{files:[{attachmentId:one.id,path:'first.txt'},{attachmentId:two.id,path:'existing.txt'}]}));const failed=await until(f.service,run.id,value=>terminal(value.status));assert.equal(failed.status,'failed');assert.equal(failed.error.code,'remote_input_exists');assert.equal(existsSync(path.join(f.workspace,'first.txt')),false);assert.equal(readFileSync(path.join(f.workspace,'existing.txt'),'utf8'),'Keep this.');
  await assert.rejects(f.service.owner('POST',[f.computer.id,'runs'],f.body('Finish',{files:[{attachmentId:one.id,path:'a'},{attachmentId:two.id,path:'a/b'}]})),error=>error.code==='remote_input_duplicate');assert.equal(existsSync(path.join(f.workspace,'a')),false);
  const {run:next}=await f.service.owner('POST',[f.computer.id,'runs'],f.body('SENSITIVE'));const completed=await until(f.service,next.id,value=>terminal(value.status));assert.equal(completed.status,'completed');assert.equal(completed.files.some(file=>file.path==='copied.txt'),false);assert.equal(completed.filesTruncated,true);await assert.rejects(f.service.readFile(next.id,'copied.txt'),error=>error.code==='remote_file_not_found');
});

test('runtime deployment is a fixed hashed allowlist and SSH never weakens host verification',async t=>{
  const f=await fixture(t),pkg=runtimePackage();assert.deepEqual(pkg.files.map(file=>file.path),[...RUNTIME_FILES]);assert.ok(pkg.files.every(file=>!file.path.startsWith('node_modules')&&!file.path.includes('credentials')));
  const tampered=structuredClone(pkg);tampered.files[0].data=Buffer.from('changed').toString('base64');await assert.rejects(f.transport.prepare(f.computer,tampered),/digest mismatch/);
  const args=sshArgs({host:'example.invalid',port:22,user:'fixture'},'fixed');assert.ok(args.includes('StrictHostKeyChecking=yes'));assert.ok(args.includes('ForwardAgent=no'));assert.ok(args.includes('PasswordAuthentication=no'));assert.throws(()=>sshArgs({host:'-oProxyCommand=bad',port:22},''));assert.equal(shellQuote("a'b"),"'a'\\''b'");
});

test('deployed runtime loads its execution dependencies without the source checkout',async t=>{
  const f=await fixture(t),runtimeRoot=path.resolve(f.computer.runtime.runtimePath,'../../..');
  const script="const {pathToFileURL}=await import('node:url');await import(pathToFileURL(process.argv[1]));await import(pathToFileURL(process.argv[2]));process.stdout.write(JSON.stringify({ok:true,result:{loaded:true}}));";
  const result=await processJson(process.execPath,['--input-type=module','-e',script,path.join(runtimeRoot,'server/codex.mjs'),path.join(runtimeRoot,'server/chat-bridge.mjs')],{},{env:f.transport.env});
  assert.deepEqual(result,{loaded:true});
});
