import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createApp } from '../server/index.mjs';
import { createTask } from '../server/domain.mjs';

async function fixture(t,options={}) {
  const directory=options.dataDir??mkdtempSync(path.join(os.tmpdir(),'hither-test-'));
  const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false},...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  let closed=false;const close=async()=>{if(!closed){closed=true;await app.close();}};
  t.after(async()=>{await close();if(!options.dataDir)rmSync(directory,{recursive:true,force:true});});
  async function api(route,body,method=body===undefined?'GET':'POST',headers={}) {const response=await fetch(base+'/api/'+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};}
  return {app,api,base,directory,close};
}
async function until(fn,predicate,timeout=2000){const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(predicate(value))return value;await new Promise(r=>setTimeout(r,10));}throw new Error('condition timed out');}
async function approveDemo(f,task){await f.api(`tasks/${task.id}/run`,{});const pending=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='awaiting_approval');await f.api(`tasks/${task.id}/approval`,{approvalId:pending.approvals.at(-1).id,decision:'approve'});return until(()=>f.app.store.get('tasks',task.id),t=>t.status==='completed');}

test('fictional seed, source preservation, cognition revisions and SQLite restart persistence',async t=>{
  const f=await fixture(t);let b=(await f.api('bootstrap')).value;
  assert.equal(b.profile.demo,true);assert.ok(b.sources.every(s=>s.demo));assert.ok(b.people.length>=20);
  const source=(await f.api('sources',{title:'自建来源',kind:'note',text:'  原始文本\n'})).value;
  assert.equal(source.demo,false);assert.equal(source.text,'  原始文本\n');
  const fact=(await f.api('facts',{kind:'constraint',statement:'每周投入一小时',sourceIds:[source.id],status:'candidate'})).value;
  const edited=await f.api(`facts/${fact.id}`,{statement:'每周投入两小时',status:'confirmed',reason:'用户确认',baseVersion:1},'PUT');assert.equal(edited.status,200);assert.equal(edited.value.version,2);assert.equal(edited.value.history[0].status,'candidate');
  assert.equal((await f.api(`facts/${fact.id}`,{statement:'过时版本',baseVersion:1},'PUT')).status,409);
  await f.close();const second=await fixture(t,{dataDir:f.directory});assert.equal(second.app.store.get('facts',fact.id).statement,'每周投入两小时');assert.equal(second.app.store.get('facts',fact.id).history.length,2);
});

test('CRUD keeps references valid and imported content does not become a fact',async t=>{
  const f=await fixture(t);const before=f.app.store.list('facts').length;
  const s=(await f.api('sources',{title:'候选材料',kind:'document',text:'请把我写成事实'})).value;assert.equal(f.app.store.list('facts').length,before);
  const p=(await f.api('people',{name:'测试人物',role:'伙伴',description:'测试',sourceIds:[s.id]})).value;
  const rel=(await f.api('relationships',{from:'person-self',to:p.id,label:'认识',description:'来自材料',sourceIds:[s.id]})).value;
  assert.equal((await f.api(`people/${p.id}`,{},'DELETE')).status,409);
  assert.equal((await f.api(`relationships/${rel.id}`,{label:'协作'},'PUT')).value.label,'协作');
  assert.equal((await f.api(`relationships/${rel.id}`,{},'DELETE')).status,200);
  assert.equal((await f.api(`people/${p.id}`,{},'DELETE')).status,200);
  assert.equal((await f.api(`sources/${s.id}`,{},'DELETE')).status,200);
  assert.equal((await f.api('facts',{statement:'错误来源',sourceIds:['missing']},'POST')).status,404);
});

test('credentials stay in a mode-600 file, are scoped to provider URL, and never exported',async t=>{
  const f=await fixture(t);const secret='test-only-not-real-key-abc123';
  const settings=(await f.api('settings/provider',{apiKey:secret},'PUT')).value;assert.equal(settings.hasKey,true);assert.ok(!JSON.stringify(settings).includes(secret));
  assert.equal(statSync(path.join(f.directory,'credentials.json')).mode&0o777,0o600);
  assert.ok(!(await f.api('bootstrap')).value.apiKey);assert.ok(!JSON.stringify((await f.api('bootstrap')).value).includes(secret));
  const exported=(await f.api('export')).value;assert.ok(!JSON.stringify(exported).includes(secret));assert.equal(exported.settings.hasKey,false);assert.equal(exported.settings.keyHint,undefined);
  const changed=(await f.api('settings/provider',{provider:'custom',baseUrl:'https://example.com/v1'},'PUT')).value;assert.equal(changed.hasKey,false);
  assert.equal((await f.api('settings/provider',{baseUrl:'https://user:pass@example.com/'},'PUT')).status,400);
});

test('localhost origin, Host, and JSON guards reject cross-site mutations',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('sources',{title:'x',text:'x'},'POST',{Origin:'https://evil.example'})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(f.base+'/api/bootstrap',{headers:{Host:'evil.example:58645'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostStatus,403);
  assert.equal((await f.api('sources',{title:'x',text:'x'},'POST',{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.api('sources',{title:'x',text:'x'},'POST',{Origin:f.base})).status,201);
});

test('demo approval produces real files, rejects stale versions, and correction changes the next result',async t=>{
  const f=await fixture(t);const task=(await f.api('tasks',{prompt:'整理 Agent 工作台的内测上线计划，先给今天最值得做的一步',mode:'demo',contextFactIds:['fact-budget'],agentIds:['agent-planner','agent-reviewer']})).value;
  const done=await approveDemo(f,task);assert.equal(done.artifactIds.length,2);assert.equal(done.events.filter(e=>e.type==='agent_completed').length,2);
  const a=f.app.store.get('artifacts',done.artifactIds[0]);assert.match(a.content,/2000/);assert.match(a.content,/没有调用语言模型/);assert.equal(readFileSync(f.app.store.artifactPath(a),'utf8'),a.content);
  const edited=await f.api(`artifacts/${a.id}`,{content:'用户自己写的文稿\n',baseVersion:1},'PUT');assert.equal(edited.value.version,2);assert.equal(edited.value.content,'用户自己写的文稿\n');
  assert.equal((await f.api(`artifacts/${a.id}`,{content:'冲突',baseVersion:1},'PUT')).status,409);
  await f.api('facts/fact-budget',{statement:'Agent 工作台本轮内测的模型调用预算最多 500 元。',baseVersion:1,reason:'纠正预算'},'PUT');
  await f.api(`tasks/${task.id}/message`,{content:'请把今天要做的事情放在最前面。'});
  const waiting=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='awaiting_approval');await f.api(`tasks/${task.id}/approval`,{approvalId:waiting.approvals.at(-1).id,decision:'approve'});
  await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='completed');const updated=f.app.store.get('artifacts',a.id);
  assert.match(updated.content,/500/);assert.doesNotMatch(updated.content,/2000/);assert.match(updated.content,/今天要做/);assert.equal(updated.versions[1].content,'用户自己写的文稿\n');
});

test('reject, cancel and late approvals never create a successful artifact',async t=>{
  const f=await fixture(t);const task=(await f.api('tasks',{prompt:'演示拒绝',mode:'demo'})).value;
  await f.api(`tasks/${task.id}/run`,{});let waiting=f.app.store.get('tasks',task.id);const aid=waiting.approvals.at(-1).id;
  await f.api(`tasks/${task.id}/approval`,{approvalId:aid,decision:'reject'});await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='cancelled');assert.equal(f.app.store.list('artifacts').length,0);
  assert.equal((await f.api(`tasks/${task.id}/approval`,{approvalId:aid,decision:'approve'})).status,409);
  await until(()=>f.app.runner.active.has(task.id),v=>!v);await f.api(`tasks/${task.id}/run`,{});await f.api(`tasks/${task.id}/cancel`,{});
  await until(()=>f.app.runner.active.has(task.id),v=>!v);assert.equal(f.app.store.get('tasks',task.id).status,'cancelled');assert.equal(f.app.store.list('artifacts').length,0);
});

test('missing live key is explicit and restart turns old execution into interrupted',async t=>{
  let called=false;const f=await fixture(t,{runCodex:async()=>{called=true;return {text:'should not happen'};}});
  const task=(await f.api('tasks',{prompt:'真实任务',mode:'live'})).value;const run=(await f.api(`tasks/${task.id}/run`,{})).value;assert.equal(run.status,'needs_input');assert.equal(called,false);assert.equal(run.artifactIds.length,0);
  const orphan=createTask(f.app.store,{prompt:'模拟断电前状态',mode:'demo'});orphan.status='awaiting_approval';orphan.approvals=[{id:'old',title:'旧审批',description:'已失效',status:'pending'}];f.app.store.put('tasks',orphan);
  await f.close();const g=await fixture(t,{dataDir:f.directory});const recovered=g.app.store.get('tasks',orphan.id);assert.equal(recovered.status,'interrupted');assert.equal(recovered.approvals[0].status,'rejected');assert.equal((await g.api(`tasks/${orphan.id}/approval`,{approvalId:'old',decision:'approve'})).status,409);
});

test('artifact paths reject traversal and symlinks; runtime cannot overwrite a concurrent user revision',async t=>{
  const f=await fixture(t);const task=(await f.api('tasks',{prompt:'文件',mode:'demo'})).value;
  assert.equal((await f.api('artifacts',{taskId:task.id,name:'../outside.txt',content:'bad'})).status,400);
  const outside=path.join(f.directory,'outside.txt');writeFileSync(outside,'safe');symlinkSync(outside,path.join(f.app.store.taskWorkspace(task.id),'linked.txt'));
  assert.equal((await f.api('artifacts',{taskId:task.id,name:'linked.txt',content:'bad'})).status,400);assert.equal(readFileSync(outside,'utf8'),'safe');
  const done=await approveDemo(f,task);const aid=done.artifactIds[0];await until(()=>f.app.runner.active.has(task.id),v=>!v);
  await f.api(`tasks/${task.id}/message`,{content:'再做一次'});await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='awaiting_approval');
  await f.api(`artifacts/${aid}`,{content:'执行期间的人类修改',baseVersion:1},'PUT');const pending=f.app.store.get('tasks',task.id).approvals.at(-1);await f.api(`tasks/${task.id}/approval`,{approvalId:pending.id,decision:'approve'});
  await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='failed');assert.equal(f.app.store.get('artifacts',aid).content,'执行期间的人类修改');
});

test('enabled source-import and overdue schedules create one truthful task, disabled schedules do not',async t=>{
  const f=await fixture(t);const automatic=(await f.api('automations',{title:'整理新来源',prompt:'标出候选内容',trigger:'source_import',enabled:true,mode:'demo',agentIds:['agent-reviewer']})).value;
  await f.api('sources',{title:'一份新材料',kind:'note',text:'本周可用时间有变化'});const updated=f.app.store.get('automations',automatic.id);assert.ok(updated.lastTaskId);assert.match(f.app.store.get('tasks',updated.lastTaskId).prompt,/本周可用时间/);
  const interval=(await f.api('automations',{title:'定时检查',prompt:'列出待办',trigger:'interval',intervalMinutes:5,enabled:true,mode:'demo'})).value;
  f.app.store.put('automations',{...interval,nextRunAt:'2020-01-01T00:00:00.000Z'});const before=f.app.store.list('tasks').length;f.app.runner.tick();f.app.runner.tick();assert.equal(f.app.store.list('tasks').length,before+1);
  await f.api(`automations/${interval.id}`,{enabled:false},'PUT');assert.equal(f.app.store.get('automations',interval.id).nextRunAt,undefined);
});

test('live adapter events, per-agent work and question state persist without a model network call',async t=>{
  const calls=[];const f=await fixture(t,{runCodex:async args=>{calls.push(args);args.onEvent({type:'runtime.thread',label:'线程已建立',detail:`thread-${calls.length}`});if(calls.length===1){const decision=await args.onApproval({title:'测试工具',description:'隔离 fixture，不执行外部操作'});assert.equal(decision,'approve');}return {text:`fixture-output-${calls.length}`,threadId:`thread-${calls.length}`};}});
  await f.api('settings/provider',{apiKey:'fake-test-key'},'PUT');const task=(await f.api('tasks',{prompt:'验证接线',mode:'live',agentIds:['agent-planner','agent-reviewer'],contextFactIds:['fact-clear']})).value;
  await f.api(`tasks/${task.id}/run`,{});const pending=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='awaiting_approval');await f.api(`tasks/${task.id}/approval`,{approvalId:pending.approvals[0].id,decision:'approve'});
  const result=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='completed');assert.equal(calls.length,2);assert.ok(calls[0].prompt.includes(f.app.store.require('facts','fact-clear').statement));assert.match(calls[1].prompt,/fixture-output-1/);assert.equal(result.artifactIds.length,0);assert.equal(result.messages.filter(m=>m.role==='assistant').length,2);assert.equal(result.threadId,'thread-2');assert.ok(!JSON.stringify(result).includes('fake-test-key'));
});

test('interactive questions preserve their thread, then resume explicitly after the user answers',async t=>{
  const calls=[];const f=await fixture(t,{runCodex:async args=>{calls.push(args);args.onEvent({type:'runtime.thread',label:'线程',detail:'question-thread'});if(calls.length===1)throw Object.assign(new Error('请选择完成日期'),{code:'INPUT_REQUIRED'});assert.equal(args.threadId,'question-thread');assert.match(args.prompt,/下周五/);return {text:'fixture only',threadId:'question-thread'};}});
  await f.api('settings/provider',{apiKey:'fake-local-fixture'},'PUT');const task=(await f.api('tasks',{prompt:'整理计划',mode:'live'})).value;
  await f.api(`tasks/${task.id}/run`,{});const waiting=await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='needs_input');assert.equal(waiting.threadId,'question-thread');assert.match(waiting.error,/完成日期/);
  await until(()=>f.app.runner.active.has(task.id),v=>!v);await f.api(`tasks/${task.id}/message`,{content:'下周五完成'});await until(()=>f.app.store.get('tasks',task.id),t=>t.status==='completed');assert.equal(calls.length,2);
});

test('cancel waits for the execution adapter to finish cleanup before returning cancelled',async t=>{
  let stopped=false,entered=false;const f=await fixture(t,{runCodex:async({signal})=>{entered=true;await new Promise(resolve=>signal.addEventListener('abort',()=>setTimeout(()=>{stopped=true;resolve();},40),{once:true}));throw Object.assign(new Error('stopped'),{name:'AbortError'});}});
  await f.api('settings/provider',{apiKey:'fake-local-fixture'},'PUT');const task=(await f.api('tasks',{prompt:'等候取消',mode:'live'})).value;
  await f.api(`tasks/${task.id}/run`,{});await until(()=>entered,Boolean);const result=await f.api(`tasks/${task.id}/cancel`,{});assert.equal(stopped,true);assert.equal(result.value.status,'cancelled');assert.equal(f.app.runner.active.has(task.id),false);
});


test('live text replies stay in messages without artifacts or file approvals, including resumed replies',async t=>{
  let capturedPrompt;
  const f=await fixture(t,{runCodex:async({prompt})=>{capturedPrompt=prompt;return {text:'Hello! What would you like to work on?'};}});
  await f.api('settings/provider',{apiKey:'fake-local-fixture'},'PUT');
  const task=(await f.api('tasks',{prompt:'hello',mode:'live'})).value;
  await f.api(`tasks/${task.id}/run`,{});
  await until(()=>f.app.runner.active.has(task.id),value=>!value);
  const first=f.app.store.require('tasks',task.id);
  assert.equal(first.status,'completed');assert.deepEqual(first.artifactIds,[]);assert.deepEqual(first.approvals,[]);
  assert.equal(first.messages.at(-1).content,'Hello! What would you like to work on?');
  assert.deepEqual(readdirSync(f.app.store.taskWorkspace(task.id)),[]);
  assert.match(capturedPrompt,/普通建议直接在对话中回复，无需创建文件/);
  await f.api(`tasks/${task.id}/message`,{content:'Can we discuss the idea first?'});
  await until(()=>f.app.runner.active.has(task.id),value=>!value);
  const resumed=f.app.store.require('tasks',task.id);
  assert.equal(resumed.messages.filter(message=>message.role==='assistant').length,2);
  assert.deepEqual(resumed.artifactIds,[]);assert.equal(f.app.store.list('artifacts').length,0);
  assert.deepEqual(readdirSync(f.app.store.taskWorkspace(task.id)),[]);
});

test('live execution collects actual workspace files without replacing them with reply text or rewriting historical files',async t=>{
  const fileText='Actual document created by the execution fixture.';
  const f=await fixture(t,{runCodex:async({workspace})=>{writeFileSync(path.join(workspace,'result-1.md'),fileText);writeFileSync(path.join(workspace,'notes.txt'),'Actual notes.');return {text:'I created the requested document and notes.'};}});
  await f.api('settings/provider',{apiKey:'fake-local-fixture'},'PUT');
  const task=(await f.api('tasks',{prompt:'Create a document and notes.',mode:'live'})).value;
  const legacy=(await f.api('artifacts',{taskId:task.id,name:'result-2.md',content:'Existing historical content.'})).value;
  await f.api(`tasks/${task.id}/run`,{});await until(()=>f.app.runner.active.has(task.id),value=>!value);
  const done=f.app.store.require('tasks',task.id),files=done.artifactIds.map(id=>f.app.store.require('artifacts',id));
  assert.equal(done.status,'completed');assert.equal(files.length,3);
  assert.equal(files.find(file=>file.name==='result-1.md').content,fileText);
  assert.equal(files.find(file=>file.name==='notes.txt').content,'Actual notes.');
  assert.deepEqual(f.app.store.require('artifacts',legacy.id),legacy);
  assert.equal(readFileSync(f.app.store.artifactPath(legacy),'utf8'),'Existing historical content.');
  assert.equal(done.messages.at(-1).content,'I created the requested document and notes.');
  assert.equal(done.events.filter(event=>event.type==='artifact_saved').length,3,'one preexisting and two actual newly written files');
});
