import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createApp} from '../server/index.mjs';
import {Store} from '../server/store.mjs';
import {saveConnection,deleteConnection} from '../server/connections.mjs';
import {startChatBridge,toChatRequest,fromChatResponse} from '../server/chat-bridge.mjs';

async function fixture(t,options={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-connections-'));
  const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false},...options});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'POST')=>{const res=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:res.status,value:await res.json()};};
  return {app,api,directory};
}
const base={name:'测试连接',provider:'custom',model:'fixture-model',baseUrl:'https://example.com/v1',api:'responses',reasoningEffort:'low'};
async function until(fn,predicate){for(let i=0;i<150;i++){const value=fn();if(predicate(value))return value;await new Promise(r=>setTimeout(r,10));}throw Error('timed out');}
async function provider(t,handler){const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}`;}

test('connections isolate same-endpoint keys, expose no credential fragments and guard default/bindings',async t=>{
  const f=await fixture(t),a=(await f.api('model-connections',{...base,apiKey:'fake-A-key'})).value,b=(await f.api('model-connections',{...base,name:'B',apiKey:'fake-B-key'})).value;
  assert.notEqual(a.id,b.id);assert.equal(a.hasKey,true);assert.equal(b.hasKey,true);assert.equal(a.keyHint,undefined);
  assert.equal(f.app.store.getKey(f.app.store.connection(a.id)),'fake-A-key');assert.equal(f.app.store.getKey(f.app.store.connection(b.id)),'fake-B-key');
  assert.equal(statSync(path.join(f.directory,'credentials.json')).mode&0o777,0o600);
  for(const route of ['bootstrap','export','model-connections']){const data=JSON.stringify((await f.api(route)).value);assert.ok(!data.includes('fake-A-key'));assert.ok(!data.includes('fake-B-key'));}
  await f.api(`model-connections/${a.id}/default`,{});assert.equal((await f.api('bootstrap')).value.settings.model,a.model);
  assert.equal((await f.api(`model-connections/${a.id}`,{},'DELETE')).status,409);
  await f.api('agents/agent-planner',{connectionId:b.id},'PUT');assert.equal((await f.api(`model-connections/${b.id}`,{},'DELETE')).status,409);
  const reset=await f.api('agents/agent-planner',{connectionId:null},'PUT');assert.equal(reset.value.connectionId,undefined);
  assert.equal((await f.api(`model-connections/${b.id}`,{},'DELETE')).status,200);
  assert.ok(!JSON.stringify(f.app.store.getKeys()).includes('fake-B-key'));
  assert.equal((await f.api('modelConnections/'+a.id,{},'DELETE')).status,404);
  const changed=(await f.api(`model-connections/${a.id}`,{baseUrl:'https://new.example/v1'},'PUT')).value;assert.equal(changed.hasKey,false);
});

test('legacy global settings and URL-scoped key migrate once without replacing user data',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-legacy-'));try{
    const store=new Store(directory,{seed:false});store.db.prepare("DELETE FROM entities WHERE collection='modelConnections' OR (collection='meta' AND id='defaultConnectionId')").run();
    const old={provider:'custom',model:'keep-exact-name',baseUrl:'https://legacy.example',api:'responses',reasoningEffort:'high'};
    store.setMeta('settings',old);writeFileSync(path.join(directory,'credentials.json'),JSON.stringify({[`${old.provider}:${old.baseUrl}`]:'fake-legacy-key'}),{mode:0o600});store.close();
    const reopened=new Store(directory,{seed:false});assert.equal(reopened.settings().model,'keep-exact-name');assert.equal(reopened.getKey(),'fake-legacy-key');assert.equal(reopened.connectionList().length,1);saveConnection(reopened,{name:'Renamed'},reopened.connection());assert.equal(reopened.getKey(),'fake-legacy-key');assert.equal(reopened.settings().baseUrl,'https://legacy.example/');reopened.close();
    const again=new Store(directory,{seed:false});assert.equal(again.connectionList().length,1);assert.equal(again.getKey(),'fake-legacy-key');again.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('group execution freezes independent Agent models and keys for the whole attempt',async t=>{
  const calls=[];let release,first;const started=new Promise(r=>first=r),pause=new Promise(r=>release=r);
  const f=await fixture(t,{runCodex:async options=>{calls.push({settings:options.settings,key:options.apiKey});if(calls.length===1){first();await pause;}return {text:'本地接口测试结果'};}});
  const a=(await f.api('model-connections',{...base,model:'model-A',apiKey:'fake-key-A'})).value,b=(await f.api('model-connections',{...base,model:'model-B',apiKey:'fake-key-B'})).value;
  await f.api('agents/agent-planner',{connectionId:a.id},'PUT');await f.api('agents/agent-reviewer',{connectionId:b.id},'PUT');
  const task=(await f.api('tasks',{prompt:'fixture',mode:'live',agentIds:['agent-planner','agent-reviewer']})).value;await f.api(`tasks/${task.id}/run`,{});await started;
  await f.api(`model-connections/${b.id}`,{model:'changed-later',apiKey:'rotated-later'},'PUT');release();
  const completed=await until(()=>f.app.store.get('tasks',task.id),task=>task.status==='completed');
  assert.deepEqual(calls.map(c=>[c.settings.model,c.key]),[['model-A','fake-key-A'],['model-B','fake-key-B']]);
  assert.deepEqual(completed.events.filter(e=>e.type==='agent_model').map(e=>JSON.parse(e.detail).connectionId),[a.id,b.id]);
  assert.ok(!JSON.stringify(completed).includes('fake-key'));
});

test('missing one group connection blocks before invoking any Agent',async t=>{
  let calls=0;const f=await fixture(t,{runCodex:async()=>{calls++;return {text:'unexpected'};}});
  await f.api('settings/provider',{apiKey:'fake-default'},'PUT');const empty=(await f.api('model-connections',base)).value;
  const reviewer=(await f.api('agents/agent-reviewer',{connectionId:empty.id},'PUT')).value;const task=(await f.api('tasks',{prompt:'fixture',mode:'live',agentIds:['agent-planner','agent-reviewer']})).value;
  const result=await f.api(`tasks/${task.id}/run`,{});assert.equal(result.value.status,'needs_input');assert.equal(calls,0);assert.ok(result.value.error.includes(`${reviewer.name}（${empty.name}）`),result.value.error);
});

test('connection text test uses configured API and OpenRouter title and discards late rotated-key results',async t=>{
  let release,received;const started=new Promise(r=>received=r),pause=new Promise(r=>release=r);let seen;
  const url=await provider(t,async(req,res)=>{seen={url:req.url,headers:req.headers};received();await pause;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'OK'}}]}));});
  const f=await fixture(t),c=(await f.api('model-connections',{...base,provider:'openrouter',model:'openrouter/free',baseUrl:url,api:'chat_completions',appTitle:'Hither',apiKey:'fake-original'})).value;
  const testing=f.api(`model-connections/${c.id}/test`,{});await started;await f.api(`model-connections/${c.id}`,{apiKey:'fake-rotated'},'PUT');release();
  const result=await testing;assert.equal(result.status,409);assert.equal(result.value.stale,true);assert.equal(seen.url,'/chat/completions');assert.equal(seen.headers['x-openrouter-title'],'Hither');assert.equal(seen.headers.authorization,'Bearer fake-original');assert.equal((await f.api(`model-connections/${c.id}`)).value.lastTest,undefined);
});

test('Chat bridge maps namespaces, free-form tools and tool results without hiding unsupported input',()=>{
  const settings={...base,api:'chat_completions'},tools=[{type:'namespace',name:'functions',tools:[{type:'function',name:'exec',parameters:{type:'object'}},{type:'custom',name:'apply_patch',description:'patch'}]}];
  const mapped=toChatRequest({input:[{role:'user',content:[{type:'input_text',text:'work'}]}],tools},settings);
  assert.equal(mapped.request.tools[0].function.name,'functions__exec');
  const response=fromChatResponse({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'c1',type:'function',function:{name:'functions__apply_patch',arguments:'{"input":"patch text"}'}}]}}]},mapped.aliases);
  assert.equal(response.output[0].type,'custom_tool_call');assert.equal(response.output[0].namespace,'functions');assert.equal(response.output[0].input,'patch text');
  const roundtrip=toChatRequest({input:[response.output[0],{type:'custom_tool_call_output',call_id:'c1',output:'done'}],tools},settings);assert.equal(roundtrip.request.messages[1].role,'tool');assert.equal(roundtrip.request.messages[1].tool_call_id,'c1');
  assert.throws(()=>toChatRequest({input:[{role:'user',content:[{type:'input_image',image_url:'image'}]}]},settings),/多模态/);
  assert.throws(()=>toChatRequest({input:'x',tools:[{type:'web_search'}]},settings),/工具类型/);
  assert.throws(()=>fromChatResponse({choices:[{finish_reason:'length',message:{role:'assistant',content:'partial'}}]},new Map()),/正常完成/);
});

test('local Chat bridge authenticates requests and emits valid Responses events after real local upstream reply',async t=>{
  let upstreamCalls=0;
  const url=await provider(t,async(req,res)=>{upstreamCalls++;assert.equal(req.url,'/chat/completions');assert.equal(req.headers.authorization,'Bearer fake-upstream-key');let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.stream,false);assert.equal(input.model,'exact-test-model');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Local fixture text'}}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}}));});
  const bridge=await startChatBridge({settings:{...base,api:'chat_completions',model:'exact-test-model',baseUrl:url},apiKey:'fake-upstream-key'});t.after(()=>bridge.close());
  const forbidden=await fetch(bridge.baseUrl+'/responses',{method:'POST'});assert.equal(forbidden.status,403);assert.equal(upstreamCalls,0);
  const res=await fetch(bridge.baseUrl+'/responses',{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({input:'fixture',stream:true})});const output=await res.text();assert.equal(res.status,200);assert.match(output,/event: response.completed/);assert.match(output,/Local fixture text/);assert.ok(!output.includes('fake-upstream-key'));assert.equal(upstreamCalls,1);
});

test('task-local connection sits below explicit Agent binding and above global default without changing it',async t=>{
  const calls=[];const f=await fixture(t,{runCodex:async options=>{calls.push(options.settings.id);return {text:'fixture'};}}),defaultId=f.app.store.defaultConnectionId();
  const taskConnection=(await f.api('model-connections',{...base,name:'Task',apiKey:'fake-task-key'})).value,agentConnection=(await f.api('model-connections',{...base,name:'Agent',apiKey:'fake-agent-key'})).value;
  await f.api('agents/agent-reviewer',{connectionId:agentConnection.id},'PUT');
  assert.equal((await f.api('tasks',{prompt:'bad',mode:'live',connectionId:'missing'})).status,404);
  const task=(await f.api('tasks',{prompt:'fixture',mode:'live',connectionId:taskConnection.id,agentIds:['agent-planner','agent-reviewer']})).value;
  assert.equal(task.connectionId,taskConnection.id);
  assert.equal((await f.api(`tasks/${task.id}`,{connectionId:agentConnection.id},'PUT')).status,200);
  assert.equal((await f.api(`tasks/${task.id}`,{connectionId:taskConnection.id},'PUT')).status,200);
  assert.equal((await f.api(`model-connections/${taskConnection.id}`,{},'DELETE')).status,409);
  await f.api(`tasks/${task.id}/run`,{});await until(()=>f.app.store.get('tasks',task.id),task=>task.status==='completed');
  assert.deepEqual(calls,[taskConnection.id,agentConnection.id]);assert.equal(f.app.store.defaultConnectionId(),defaultId);
  assert.equal((await f.api(`model-connections/${taskConnection.id}`,{},'DELETE')).status,409);
  f.app.store.delete('modelConnections',taskConnection.id); // Simulate an old broken reference.
  const before=f.app.store.get('tasks',task.id);
  assert.equal((await f.api(`tasks/${task.id}/message`,{content:'must not be appended'})).status,404);
  assert.deepEqual(f.app.store.get('tasks',task.id),before);
  assert.equal((await f.api(`tasks/${task.id}/run`,{})).status,404);
});

test('installed Codex completes a Chat bridge tool roundtrip against a local fixture, without a paid model', {skip:process.env.HITHER_TEST_REAL_CODEX!=='1'},async t=>{
  const {runConfiguredCodex}=await import('../server/chat-bridge.mjs');
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-chat-integration-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const requests=[];
  const url=await provider(t,async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push(body);res.setHeader('Content-Type','application/json');
    const planTool=body.tools?.find(tool=>tool.function.name.endsWith('exec_command'));
    if(requests.length===1&&planTool)res.end(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'fixture-plan-call',type:'function',function:{name:planTool.function.name,arguments:JSON.stringify({cmd:'printf local-tool-fixture',max_output_tokens:100})}}]}}]}));
    else res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Local bridge tool roundtrip complete.'}}]}));
  });
  const result=await runConfiguredCodex({workspace:path.join(directory,'task'),codexHome:path.join(directory,'runtime'),settings:{...base,baseUrl:url,api:'chat_completions'},apiKey:'fake-integration-key',prompt:'This is a local protocol test. Run printf local-tool-fixture only, then stop.',signal:AbortSignal.timeout(30000),onApproval:async()=> 'reject'});
  assert.equal(result.text,'Local bridge tool roundtrip complete.');assert.equal(requests.length,2);assert.ok(requests[1].messages.some(message=>message.role==='tool'&&message.tool_call_id==='fixture-plan-call'));
});

test('new connection model configuration never resumes a previous provider thread',async t=>{
  const calls=[];const f=await fixture(t,{runCodex:async options=>{calls.push({threadId:options.threadId,home:options.codexHome});return {text:'fixture',threadId:'fixture-thread'};}});
  const connection=(await f.api('model-connections',{...base,apiKey:'fake-key'})).value;
  const task=(await f.api('tasks',{prompt:'fixture',mode:'live',connectionId:connection.id})).value;
  await f.api(`tasks/${task.id}/run`,{});await until(()=>f.app.store.get('tasks',task.id),task=>task.status==='completed');
  await f.api(`tasks/${task.id}/message`,{content:'same provider'});await until(()=>f.app.store.get('tasks',task.id),task=>task.status==='completed');
  assert.equal(calls[1].threadId,'fixture-thread');
  await f.api(`model-connections/${connection.id}`,{model:'another-model'},'PUT');
  await f.api(`tasks/${task.id}/message`,{content:'updated connection'});await until(()=>f.app.store.get('tasks',task.id),task=>task.status==='completed');
  assert.equal(calls[2].threadId,undefined);assert.notEqual(calls[2].home,calls[1].home);
});

test('failed key update or delete restores both credentials and database records',async t=>{
  const f=await fixture(t),store=f.app.store;
  const connection=saveConnection(store,{...base,apiKey:'fake-before'}),before=store.connection(connection.id),keys=store.getKeys();
  const originalPut=store.put.bind(store);store.put=(collection,entity)=>{if(collection==='modelConnections')throw Error('injected database failure');return originalPut(collection,entity);};
  assert.throws(()=>saveConnection(store,{apiKey:'fake-after',model:'new-model'},before),/injected/);store.put=originalPut;
  assert.deepEqual(store.getKeys(),keys);assert.deepEqual(store.connection(connection.id),before);
  const originalSetKey=store.setKey.bind(store);store.setKey=(...args)=>{originalSetKey(...args);throw Error('injected file failure after write');};
  assert.throws(()=>saveConnection(store,{apiKey:'fake-after'},before),/injected/);store.setKey=originalSetKey;
  assert.deepEqual(store.getKeys(),keys);assert.deepEqual(store.connection(connection.id),before);
  const originalDelete=store.deleteConnectionKeys.bind(store);store.deleteConnectionKeys=id=>{originalDelete(id);throw Error('injected credential deletion failure');};
  assert.throws(()=>deleteConnection(store,connection.id,f.app.runner),/injected/);store.deleteConnectionKeys=originalDelete;
  assert.deepEqual(store.getKeys(),keys);assert.deepEqual(store.connection(connection.id),before);
});

test('credential undo journal recovers an interrupted update and retains a database-committed update',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-journal-'));
  try{
    const store=new Store(directory,{seed:false}),connection=store.connection();store.setKey(connection,'fake-before');const before=store.getKeys();
    writeFileSync(path.join(directory,'credentials-recovery.json'),JSON.stringify({id:'uncommitted-fixture',before:{existed:true,keys:before}}),{mode:0o600});store.setKey(connection,'fake-uncommitted');store.close();
    const recovered=new Store(directory,{seed:false});assert.equal(recovered.getKey(),'fake-before');
    writeFileSync(path.join(directory,'credentials-recovery.json'),JSON.stringify({id:'committed-fixture',before:{existed:true,keys:before}}),{mode:0o600});recovered.setKey(recovered.connection(),'fake-committed');recovered.setMeta('credentialsCommit','committed-fixture');recovered.close();
    const committed=new Store(directory,{seed:false});assert.equal(committed.getKey(),'fake-committed');committed.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('oversized Chat bridge input returns a JSON 413 after draining without contacting upstream',async t=>{
  let calls=0;const url=await provider(t,(_req,res)=>{calls++;res.end('{}');});
  const bridge=await startChatBridge({settings:{...base,api:'chat_completions',baseUrl:url},apiKey:'fake-key'});t.after(()=>bridge.close());
  const response=await fetch(bridge.baseUrl+'/responses',{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({input:'x'.repeat(4*1024*1024+1024)})});
  assert.equal(response.status,413);assert.match((await response.json()).error.message,/超过/);assert.equal(calls,0);
});

test('Kimi connection preserves exact model and max reasoning while rejecting unsupported medium',async t=>{
  const f=await fixture(t),definition={...base,provider:'moonshot',model:'kimi-k3',baseUrl:'https://api.moonshot.cn/v1',api:'chat_completions',reasoningEffort:'max'};
  const response=await f.api('model-connections',definition);assert.equal(response.status,201);assert.equal(response.value.model,'kimi-k3');assert.equal(response.value.reasoningEffort,'max');
  assert.equal((await f.api('model-connections',{...definition,reasoningEffort:'medium'})).status,400);
  const mapped=toChatRequest({input:'local protocol fixture'},response.value);assert.equal(mapped.request.reasoning_effort,'max');
});
