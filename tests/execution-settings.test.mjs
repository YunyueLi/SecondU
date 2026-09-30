import {fromChatResponse,fromMessagesResponse} from '../server/chat-bridge.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {Store} from '../server/store.mjs';
import {createTask} from '../server/domain.mjs';
import {createRoom,roomTask} from '../server/rooms.mjs';
import {executionSettings,saveExecutionSettings,resolveApprovalMode,contextUsageFromRuntime} from '../server/execution-settings.mjs';

async function fixture(t,runCodex){
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-execution-settings-'));
 const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:true},runCodex});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});return {app,api,directory};
}
async function until(fn,predicate){for(let n=0;n<150;n++){const value=fn();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('timed out');}

test('defaults persist per space; old tasks stay ask and new tasks take an explicit snapshot',async t=>{
 const f=await fixture(t);assert.deepEqual((await f.api('settings/execution')).value,{approvalMode:'ask'});
 const old=createTask(f.app.store,{mode:'demo',prompt:'Existing task'});delete old.approvalMode;f.app.store.put('tasks',old);
 assert.equal((await f.api('settings/execution',{approvalMode:'full'},'PUT')).status,200);
 assert.equal(resolveApprovalMode(f.app.store,old),'ask');
 assert.equal((await f.api('bootstrap')).value.executionSettings.approvalMode,'full');
 const task=(await f.api('tasks',{mode:'demo',prompt:'New task'})).value;assert.equal(task.approvalMode,'full');
 await f.api('settings/execution',{approvalMode:'auto'},'PUT');assert.equal(resolveApprovalMode(f.app.store,task),'full');
 assert.equal(resolveApprovalMode(f.app.store,{...task,approvalMode:null}),'auto');
 for(const value of ['unrestricted',0,{},null])assert.equal((await f.api('settings/execution',{approvalMode:value},'PUT')).status,400);
 assert.equal((await f.api('tasks',{mode:'demo',prompt:'Invalid',approvalMode:'unrestricted'})).status,400);
 const reopened=new Store(f.directory);try{assert.equal(executionSettings(reopened).approvalMode,'auto');}finally{reopened.close();}
 await f.api('spaces/personal',{});assert.deepEqual((await f.api('spaces/personal/settings/execution')).value,{approvalMode:'ask'});
});

test('room defaults and one-task overrides stay explicit, while runtime state cannot be forged',async t=>{
 const f=await fixture(t);saveExecutionSettings(f.app.store,{approvalMode:'ask'});
 const room=createRoom(f.app.store,{title:'Policy room',kind:'direct',agentIds:['agent-planner'],mode:'demo',approvalMode:'auto'});
 const result=roomTask(f.app.store,f.app.runner,room.id,{prompt:'Draft only'});assert.equal(result.task.approvalMode,'auto');
 const patched=await f.api(`tasks/${result.task.id}`,{approvalMode:null,contextUsage:{source:'runtime',usedTokens:99},resolvedApprovalMode:'full'},'PUT');
 assert.equal(patched.status,200);assert.equal(patched.value.approvalMode,null);assert.equal(patched.value.contextUsage,undefined);assert.equal(patched.value.resolvedApprovalMode,undefined);
 assert.equal((await f.api(`agent-rooms/${room.id}`,{approvalMode:'bad'},'PUT')).status,400);
 const configured=await f.api(`agent-rooms/${room.id}`,{approvalMode:'full'},'PUT');assert.equal(configured.status,200);assert.equal(configured.value.approvalMode,'full');
 assert.equal(f.app.store.require('tasks',result.task.id).approvalMode,null,'room changes do not overwrite a queued task');
});

test('a running attempt freezes policy, streams measured usage, rejects edits, and retains the last measurement',async t=>{
 let release,received;const entered=new Promise(resolve=>{received=resolve;});
 const f=await fixture(t,async options=>{received(options);await options.onEvent({type:'runtime.usage',usage:contextUsageFromRuntime({last:{totalTokens:600},total:{inputTokens:2200,outputTokens:100,totalTokens:2300},modelContextWindow:20000})});await new Promise(resolve=>{release=resolve;options.signal.addEventListener('abort',resolve,{once:true});});return {text:'Runtime fixture complete',threadId:'usage-thread'};});
 await f.api('settings/provider',{apiKey:'fixture-only-key'},'PUT');
 const task=(await f.api('tasks',{mode:'live',prompt:'Test run',approvalMode:'auto'})).value;
 assert.equal((await f.api(`tasks/${task.id}/run`,{})).status,200);const options=await entered;assert.equal(options.approvalMode,'auto');
 await until(()=>f.app.store.require('tasks',task.id),task=>task.contextUsage?.usedTokens===600);
 assert.equal((await f.api(`tasks/${task.id}`,{approvalMode:'full'},'PUT')).status,409);
 await f.api('settings/execution',{approvalMode:'full'},'PUT');assert.equal(f.app.store.require('tasks',task.id).resolvedApprovalMode,'auto');assert.equal(options.approvalMode,'auto');
 const usage=(await f.api('bootstrap')).value.tasks.find(value=>value.id===task.id).contextUsage;assert.equal(usage.usedTokens,600);assert.equal(usage.totalTokens,2300);assert.equal(usage.contextWindow,20000);
 release();await until(()=>f.app.store.require('tasks',task.id),task=>task.status==='completed');
 const updated=(await f.api(`tasks/${task.id}`,{approvalMode:'ask'},'PUT')).value;assert.equal(updated.approvalMode,'ask');assert.equal(updated.resolvedApprovalMode,'auto');assert.equal(updated.contextUsage,undefined);
 assert.equal(JSON.parse(updated.events.find(event=>event.type==='started').detail).approvalMode,'auto');
});

test('manual rejection and cancellation cannot be bypassed by changing the global default',async t=>{
 const f=await fixture(t,async options=>{const decision=await options.onApproval({title:'Review one operation',description:'Fixture',details:'specific fixture action'});if(options.signal.aborted)throw Object.assign(Error('cancelled'),{name:'AbortError'});return {text:decision==='approve'?'approved':'declined'};});
 await f.api('settings/provider',{apiKey:'fixture-only-key'},'PUT');
 for(const action of ['reject','cancel']){
  const task=(await f.api('tasks',{mode:'live',prompt:'Test review',approvalMode:'ask'})).value;await f.api(`tasks/${task.id}/run`,{});
  const pending=await until(()=>f.app.store.require('tasks',task.id),task=>task.status==='awaiting_approval');const approvalId=pending.approvals.at(-1).id;
  await f.api('settings/execution',{approvalMode:'full'},'PUT');
  assert.equal((await f.api(`tasks/${task.id}`,{approvalMode:'full'},'PUT')).status,409);
  if(action==='reject')await f.api(`tasks/${task.id}/approval`,{approvalId,decision:'reject'});else await f.api(`tasks/${task.id}/cancel`,{});
  const settled=await until(()=>f.app.store.require('tasks',task.id),task=>['completed','cancelled'].includes(task.status));assert.equal(settled.approvals.at(-1).status,'rejected');assert.equal(settled.resolvedApprovalMode,'ask');
  assert.equal((await f.api(`tasks/${task.id}/approval`,{approvalId,decision:'approve'})).status,409);
 }
});

test('missing and invalid usage fields remain unavailable; compaction can reduce current context',()=>{
 assert.equal(contextUsageFromRuntime({}),null);
 const value=contextUsageFromRuntime({last:{totalTokens:12},total:{inputTokens:1000,outputTokens:-1,totalTokens:'1200'},modelContextWindow:0});
 assert.equal(value.usedTokens,12);assert.equal(value.contextWindow,null);assert.equal(value.outputTokens,null);assert.equal(value.totalTokens,null);
 const cumulative=contextUsageFromRuntime({total:{inputTokens:999,totalTokens:999}});assert.equal(cumulative.usedTokens,null);assert.equal(cumulative.inputTokens,999);
});

test('provider bridges never turn missing usage into a fabricated zero measurement',()=>{
 const chat={choices:[{finish_reason:'stop',message:{role:'assistant',content:'Reply'}}]};
 for(const usage of [undefined,{}, {prompt_tokens:100}])assert.equal(fromChatResponse({...chat,usage},new Map()).usage,undefined);
 assert.deepEqual(fromChatResponse({...chat,usage:{prompt_tokens:100,completion_tokens:20}},new Map()).usage,{input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:null,output_tokens_details:null});
 const messages={type:'message',role:'assistant',stop_reason:'end_turn',content:[{type:'text',text:'Reply'}]};
 for(const usage of [undefined,{}, {input_tokens:100}])assert.equal(fromMessagesResponse({...messages,usage},new Map()).usage,undefined);
 assert.equal(fromMessagesResponse({...messages,usage:{input_tokens:100,cache_read_input_tokens:30,output_tokens:20}},new Map()).usage.total_tokens,150);
});
