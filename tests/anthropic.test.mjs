import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {createApp} from '../server/index.mjs';
import {startChatBridge,toMessagesRequest,fromMessagesResponse} from '../server/chat-bridge.mjs';
const base={name:'Anthropic fixture',provider:'anthropic',model:'claude-sonnet-5-5',baseUrl:'https://api.anthropic.com/v1',api:'messages',reasoningEffort:'low'};
const tools=[{type:'namespace',name:'functions',tools:[{type:'function',name:'exec_command',parameters:{type:'object',properties:{cmd:{type:'string'}},required:['cmd']}},{type:'custom',name:'apply_patch'}]}];
const response=(content,stop_reason='end_turn')=>({id:'msg_fixture',type:'message',role:'assistant',model:base.model,content,stop_reason,usage:{input_tokens:10,output_tokens:8}});
const textResponse=()=>response([{type:'text',text:'OK'}]);
async function provider(t,handler){const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));return `http://127.0.0.1:${server.address().port}/v1`;}
async function json(req){let raw='';for await(const chunk of req)raw+=chunk;return JSON.parse(raw);}
function send(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
async function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'hither-anthropic-'));const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});const api=async(route,body,method='POST')=>{const res=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,value:await res.json()};};return {app,api};}
const call=(bridge,body,signal)=>fetch(bridge.baseUrl+'/responses',{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});

test('Anthropic connection validates protocol, authenticates native text test, and rejects empty successful HTTP responses',async t=>{
  let empty=false,calls=0;
  const url=await provider(t,async(req,res)=>{calls++;assert.equal(req.url,'/v1/messages');assert.equal(req.headers['x-api-key'],'fake-anthropic-key');assert.equal(req.headers['anthropic-version'],'2023-06-01');assert.equal(req.headers.authorization,undefined);const body=await json(req);assert.equal(body.model,base.model);assert.equal(body.stream,false);assert.ok(body.max_tokens>0);assert.equal(body.reasoning_effort,undefined);assert.equal(body.thinking,undefined);send(res,empty?{}:textResponse());});
  const f=await fixture(t);
  assert.equal((await f.api('model-connections',{...base,api:'responses'})).status,400);
  assert.equal((await f.api('model-connections',{...base,provider:'custom'})).status,400);
  const saved=await f.api('model-connections',{...base,baseUrl:url,apiKey:'fake-anthropic-key'});assert.equal(saved.status,201);assert.equal(saved.value.hasKey,true);
  assert.equal((await f.api(`model-connections/${saved.value.id}/test`,{})).value.ok,true);
  empty=true;assert.equal((await f.api(`model-connections/${saved.value.id}/test`,{})).value.ok,false);assert.equal(calls,2);
  assert.ok(!JSON.stringify((await f.api('bootstrap',undefined,'GET')).value).includes('fake-anthropic-key'));
});

test('Messages mapping retains signed blocks in memory and returns tools/results with exact identities without exposing thinking',()=>{
  const history=[{role:'user',content:'Please work.'}],turns=new Map();
  const initial=toMessagesRequest({instructions:'system instructions',input:history,tools},base,turns);
  assert.equal(initial.request.system[0].text,'system instructions');assert.equal(initial.request.tools[0].input_schema.type,'object');assert.equal(initial.request.tools[1].input_schema.properties.input.type,'string');
  const native=response([{type:'thinking',thinking:'DO-NOT-EMIT-PRIVATE-THINKING',signature:'original-signature'},{type:'text',text:'Working.'},{type:'tool_use',id:'c1',name:'functions__apply_patch',input:{input:'patch text'}},{type:'redacted_thinking',data:'opaque-block'},{type:'tool_use',id:'c2',name:'functions__exec_command',input:{cmd:'printf fixture'}}],'tool_use');
  const mapped=fromMessagesResponse(native,initial.aliases,turns,initial.request);
  assert.ok(!JSON.stringify(mapped).includes('DO-NOT-EMIT'));assert.ok(!JSON.stringify(mapped).includes('original-signature'));assert.equal(mapped.output[1].type,'custom_tool_call');
  const next=toMessagesRequest({instructions:'system instructions',input:[...history,...mapped.output,{type:'custom_tool_call_output',call_id:'c1',output:'patch saved'},{type:'function_call_output',call_id:'c2',output:'fixture'}],tools},base,turns);
  assert.deepEqual(next.request.messages[1].content,native.content);assert.deepEqual(next.request.messages[2].content.map(b=>[b.type,b.tool_use_id]),[['tool_result','c1'],['tool_result','c2']]);
  assert.throws(()=>toMessagesRequest({instructions:'changed prefix',input:[...history,...mapped.output,{type:'custom_tool_call_output',call_id:'c1',output:'x'},{type:'function_call_output',call_id:'c2',output:'y'}],tools},base,turns),/上下文已变化/);
  assert.throws(()=>toMessagesRequest({instructions:'system instructions',input:[...history,...mapped.output,{type:'custom_tool_call_output',call_id:'c1',output:'x'}],tools},base,turns),/完整对应/);
});

test('Messages rejects unsupported multimodal/server tools and incomplete or malformed replies explicitly',()=>{
  assert.throws(()=>toMessagesRequest({input:[{role:'user',content:[{type:'input_image',image_url:'image'}]}]},base),/多模态/);
  assert.throws(()=>toMessagesRequest({input:'hello',tools:[{type:'web_search'}]},base),/工具类型/);
  assert.throws(()=>toMessagesRequest({input:'hello',tools,tool_choice:'required'},base),/强制工具/);
  const mapped=toMessagesRequest({input:'hello',tools},base);
  for(const value of [{},response([{type:'text',text:'partial'}],'max_tokens'),response([]),response([{type:'tool_use',id:'x',name:'unknown',input:{}}],'tool_use'),response([{type:'server_tool_use',id:'server'}])])assert.throws(()=>fromMessagesResponse(value,mapped.aliases),{code:'invalid_messages_response'});
});

test('Messages HTTP bridge completes a native tools roundtrip and emits only mapped Responses output',async t=>{
  const requests=[];const native=response([{type:'thinking',thinking:'hidden fixture',signature:'sig'},{type:'tool_use',id:'toolu_fixture',name:'functions__exec_command',input:{cmd:'printf fixture'}}],'tool_use');
  const url=await provider(t,async(req,res)=>{assert.equal(req.url,'/v1/messages');assert.equal(req.headers['x-api-key'],'fake-anthropic-key');const body=await json(req);requests.push(body);send(res,requests.length===1?native:textResponse());});
  const bridge=await startChatBridge({settings:{...base,baseUrl:url},apiKey:'fake-anthropic-key'});t.after(()=>bridge.close());
  const history=[{role:'user',content:'Work.'}];const first=await (await call(bridge,{input:history,tools})).json();assert.equal(first.output[0].name,'exec_command');
  const second=await call(bridge,{input:[...history,...first.output,{type:'function_call_output',call_id:'toolu_fixture',output:'fixture'}],tools,stream:true});const sse=await second.text();
  assert.equal(second.status,200);assert.match(sse,/response.completed/);assert.match(sse,/OK/);assert.doesNotMatch(sse,/hidden fixture|sig|fake-anthropic/);assert.equal(requests.length,2);assert.deepEqual(requests[1].messages[1].content,native.content);
});

test('Messages upstream errors propagate once without a completion event, retry or credential leak',async t=>{
  let calls=0;const url=await provider(t,async(req,res)=>{calls++;await json(req);send(res,{type:'error',error:{type:'rate_limit_error',message:'fake-error-key'}},429);});
  const bridge=await startChatBridge({settings:{...base,baseUrl:url},apiKey:'fake-error-key'});t.after(()=>bridge.close());
  const result=await call(bridge,{input:'hello',stream:true});const body=await result.text();assert.equal(result.status,502);assert.match(body,/HTTP 429.*rate_limit_error/);assert.doesNotMatch(body,/response.completed|fake-error-key/);assert.equal(calls,1);
});

test('Messages cancellation closes a hanging native upstream and bridge without retry or completion',async t=>{
  let enter,closed;const entered=new Promise(r=>enter=r),ended=new Promise(r=>closed=r);let calls=0;
  const url=await provider(t,async(req,res)=>{calls++;await json(req);res.on('close',closed);enter();});
  const controller=new AbortController(),bridge=await startChatBridge({settings:{...base,baseUrl:url},apiKey:'fake-key',signal:controller.signal});
  const pending=call(bridge,{input:'hello',stream:true}).then(res=>res.text()).catch(()=> 'cancelled');await entered;controller.abort();await bridge.close();await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(Error('upstream did not close')),2000))]);const result=await pending;assert.doesNotMatch(result,/response.completed/);assert.equal(calls,1);
});

test('installed Codex completes native Messages tools locally and an ordinary response creates no task artifact',{skip:process.env.HITHER_TEST_REAL_CODEX!=='1'},async t=>{
  const requests=[];const url=await provider(t,async(req,res)=>{const body=await json(req);requests.push(body);const tool=body.tools?.find(tool=>tool.name.endsWith('exec_command'));if(requests.length===1&&tool)send(res,response([{type:'thinking',thinking:'private fixture thought',signature:'fixture-signature'},{type:'tool_use',id:'toolu_runtime',name:tool.name,input:{cmd:'printf anthropic-local-fixture',max_output_tokens:100}}],'tool_use'));else send(res,response([{type:'text',text:'Local native Messages tools complete.'}]));});
  const f=await fixture(t);const connection=(await f.api('model-connections',{...base,baseUrl:url,apiKey:'fake-runtime-key'})).value;
  const task=(await f.api('tasks',{prompt:'Run printf anthropic-local-fixture, then reply. Do not create files.',mode:'live',connectionId:connection.id})).value;
  await f.api(`tasks/${task.id}/run`,{});const active=f.app.runner.active.get(task.id);await active?.promise;
  const done=f.app.store.require('tasks',task.id);assert.equal(done.status,'completed',done.error);assert.deepEqual(done.artifactIds,[]);assert.equal(done.messages.at(-1).content,'Local native Messages tools complete.');assert.equal(requests.length,2);assert.ok(requests[1].messages.some(message=>message.content.some(block=>block.type==='tool_result'&&block.tool_use_id==='toolu_runtime')));assert.ok(!JSON.stringify(done).includes('private fixture thought'));
  const firstThread=done.threadId;await f.api(`tasks/${task.id}/message`,{content:'Thanks. Summarize that reply.'});await f.app.runner.active.get(task.id)?.promise;const resumed=f.app.store.require('tasks',task.id);assert.equal(resumed.status,'completed',resumed.error);assert.notEqual(resumed.threadId,firstThread);assert.deepEqual(resumed.artifactIds,[]);assert.equal(requests.length,3);assert.ok(JSON.stringify(requests[2].messages).includes('Local native Messages tools complete.'));assert.ok(!requests[2].messages.some(message=>message.content.some(block=>block.type==='tool_use'||block.type==='tool_result')));
});
