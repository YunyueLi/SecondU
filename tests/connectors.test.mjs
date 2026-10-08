import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,linkSync,realpathSync,rmSync,statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
import {ConnectorService,saveConnector,publicConnector,deleteConnector,connectorSelection} from '../server/connectors.mjs';
import {connectorUrl,connectorTarget,publicConnectorAddress,connectorRpc,openConnectorSession} from '../server/connector-http.mjs';
import {createProject} from '../server/projects.mjs';
import {createApp} from '../server/index.mjs';

function fixture(t){
  const directory=realpathSync(mkdtempSync(path.join(os.tmpdir(),'hither-connectors-'))),store=new Store(path.join(directory,'data'),{seed:false});
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {store,directory,service:new ConnectorService(store)};
}
const tool={name:'echo',description:'Return supplied text',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']},annotations:{readOnlyHint:true}};
async function mcp(t,{sse=false,handler}={}){
  const calls=[];
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const message=JSON.parse(raw);calls.push({message,headers:req.headers});
    if(await handler?.(message,req,res,calls))return;
    if(message.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
    const result=message.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'Local fixture',version:'1'}}:
      message.method==='tools/list'?{tools:[tool]}:{content:[{type:'text',text:message.params.arguments.text}]};
    res.setHeader('Mcp-Session-Id','fixture-session');
    res.setHeader('Content-Type',sse?'text/event-stream':'application/json');
    const reply=JSON.stringify({jsonrpc:'2.0',id:message.id,result});
    if(sse){res.write(': fixture\r');setImmediate(()=>{res.write('\n\r\n');res.write('data: '+reply+'\r');setImmediate(()=>res.end('\n\r\n'));});}
    else res.end(reply);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {server,calls,url:`http://127.0.0.1:${server.address().port}/mcp`};
}
const definition=url=>({kind:'mcp_http',name:'Local MCP fixture',url,allowLocalhost:true,token:'fixture-connector-key'});
async function tested(t,options){const f=fixture(t),remote=await mcp(t,options),connector=saveConnector(f.store,definition(remote.url));assert.equal((await f.service.test(connector.id)).ok,true);return {...f,...remote,connector};}

test('endpoint validation denies private DNS, credentials, redirects and Hither ports before dispatch',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','::1','::ffff:127.0.0.1','2001:0db8::1','2002:808:808::1'])assert.equal(publicConnectorAddress(address),false,address);
  for(const address of ['8.8.8.8','2606:4700:4700::1111'])assert.equal(publicConnectorAddress(address),true,address);
  for(const url of ['http://example.com','https://name:password@example.com','https://example.com?token=x','http://localhost:1234'])assert.throws(()=>connectorUrl(url));
  await assert.rejects(connectorTarget({url:'https://example.com'}, {resolve:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),{code:'connector_address_denied'});
  await assert.rejects(connectorTarget({url:'http://localhost:58645',allowLocalhost:true},{blockedPorts:[58645]}),{code:'connector_address_denied'});
  await assert.rejects(connectorTarget({url:'https://example.com'},{resolve:()=>new Promise(()=>{}),timeoutMs:10}),{code:'connector_timeout'});
});

test('real local HTTP and split-CRLF SSE support initialize, discovery and bounded session calls',async t=>{
  for(const sse of [false,true]){
    const remote=await mcp(t,{sse}),session=await openConnectorSession({url:remote.url,allowLocalhost:true},'fixture-bearer');
    assert.deepEqual(session.tools,[tool]);assert.equal((await session.call('echo',{text:'local evidence'})).content[0].text,'local evidence');
    assert.deepEqual(remote.calls.map(c=>c.message.method),['initialize','notifications/initialized','tools/list','tools/call']);
    assert.ok(remote.calls.every(c=>c.headers.authorization==='Bearer fixture-bearer'));
    assert.equal(remote.calls[2].headers['mcp-session-id'],'fixture-session');assert.equal(remote.calls[2].headers['mcp-protocol-version'],'2025-06-18');
  }
});

test('HTTP failures and redirects never expose remote error bodies or follow target URLs',async t=>{
  for(const status of [302,401,500]){
    const remote=await mcp(t,{handler:(_m,_req,res)=>{res.writeHead(status,{Location:'http://127.0.0.1:1/stolen'});res.end('fixture-remote-secret');return true;}});
    await assert.rejects(connectorRpc({url:remote.url,allowLocalhost:true},'fixture-bearer',{jsonrpc:'2.0',id:'x',method:'initialize'}),error=>error.code==='connector_http_error'&&!error.message.includes('fixture-remote-secret'));
    assert.equal(remote.calls.length,1);
  }
});

test('probe status and credentials invalidate when endpoint or token changes; stale tests cannot overwrite',async t=>{
  const f=await tested(t),{store,service,connector}=f;
  assert.equal(publicConnector(store,store.require('connectors',connector.id)).status,'ready');
  assert.equal(statSync(path.join(store.directory,'credentials.json')).mode&0o777,0o600);
  assert.ok(!JSON.stringify(service.list()).includes('fixture-connector-key'));
  const changed=saveConnector(store,{token:'fixture-rotated'},store.require('connectors',connector.id));
  assert.equal(changed.status,'untested');assert.deepEqual(changed.tools,[]);
  assert.equal((await service.test(connector.id)).ok,true);
  const moved=saveConnector(store,{url:f.url+'/new'},store.require('connectors',connector.id));assert.equal(moved.hasToken,false);assert.equal(moved.status,'untested');
  let unblock,seen;const pause=new Promise(resolve=>unblock=resolve),started=new Promise(resolve=>seen=resolve);
  const delayed=await mcp(t,{handler:async message=>{if(message.method==='tools/list'){seen();await pause;}return false;}});
  const other=saveConnector(store,definition(delayed.url)),pending=service.test(other.id);await started;
  saveConnector(store,{token:'another-key'},store.require('connectors',other.id));unblock();
  const result=await pending;assert.equal(result.stale,true);assert.equal(result.connector.status,'untested');
});

test('each remote call requires exact approval, snapshots arguments and rechecks configuration revision',async t=>{
  const f=await tested(t),{service,store,connector}=f,events=[],deniedEvents=[];
  let reviewed;
  const denied=await service.prepare([connector.id],{onApproval:request=>{reviewed=request;return 'reject';},onEvent:event=>deniedEvents.push(event)});
  const deniedResult=await denied.call({tool:denied.definitions[0].name,arguments:{text:'must stay local'}});
  assert.equal(deniedResult.success,false);assert.equal(f.calls.filter(c=>c.message.method==='tools/call').length,0);
  assert.equal(deniedEvents.length,1);assert.equal(deniedEvents[0].type,'connector.rejected');assert.equal(deniedEvents[0].activity.phase,'rejected');assert.ok(deniedEvents[0].activity.callId);
  assert.match(reviewed.details,/must stay local/);assert.match(reviewed.details,/"revision": 1/);
  const args={text:'approved snapshot'};
  const allowed=await service.prepare([connector.id],{onApproval:request=>{reviewed=request;args.text='changed after approval';return 'approve';},onEvent:e=>events.push(e)});
  assert.equal((await allowed.call({tool:allowed.definitions[0].name,arguments:args})).success,true);
  assert.equal(f.calls.find(c=>c.message.method==='tools/call').message.params.arguments.text,'approved snapshot');assert.ok(!JSON.stringify(events).includes('approved snapshot'));
  assert.deepEqual(events.map(event=>event.activity.phase),['running','completed']);assert.equal(events[0].activity.callId,events[1].activity.callId);assert.notEqual(events[0].activity.callId,deniedEvents[0].activity.callId);assert.equal(events[0].activity.name,'echo');
  let sensitiveAsked=false;
  const sensitive=await service.prepare([connector.id],{onApproval:()=>{sensitiveAsked=true;return 'approve';}});
  assert.equal((await sensitive.call({tool:sensitive.definitions[0].name,arguments:{text:'fixture-connector-key'}})).success,false);
  assert.equal(sensitiveAsked,false);assert.equal(f.calls.filter(c=>c.message.method==='tools/call').length,1);
  const changed=await service.prepare([connector.id],{onApproval:()=>{saveConnector(store,{enabled:false},store.require('connectors',connector.id));return 'approve';}});
  assert.equal((await changed.call({tool:changed.definitions[0].name,arguments:{text:'must not call'}})).success,false);
  assert.equal(f.calls.filter(c=>c.message.method==='tools/call').length,1);assert.throws(()=>connectorSelection(store,[connector.id]),{code:'connector_unavailable'});
});

test('connector errors and concurrent calls keep individual lifecycle IDs without recording arguments or result content',async t=>{
  const f=await tested(t,{handler:(message,_req,res)=>{
    if(message.method!=='tools/call')return false;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{isError:true,content:[{type:'text',text:'Synthetic returned error'}]}}));return true;
  }}),events=[];
  const prepared=await f.service.prepare([f.connector.id],{onApproval:()=> 'approve',onEvent:event=>events.push(event)});
  const result=await prepared.call({tool:prepared.definitions[0].name,arguments:{text:'private argument'},threadId:'thread',turnId:'turn',callId:'native-call'});
  assert.equal(result.success,false);assert.deepEqual(events.map(event=>[event.type,event.activity.phase]),[['connector.call','running'],['connector.result','failed']]);
  assert.equal(events[0].activity.callId,'thread/turn/native-call');assert.equal(events[1].activity.callId,events[0].activity.callId);
  assert.doesNotMatch(JSON.stringify(events),/private argument|Synthetic returned error/);
  const localEvents=[],library=saveConnector(f.store,{kind:'library',name:'Library'}),local=await f.service.prepare([library.id],{onEvent:event=>localEvents.push(event)});
  const read=local.definitions.find(item=>item.description.includes('/ read.'));
  await Promise.all([local.call({tool:read.name,arguments:{id:'missing-one'}}),local.call({tool:read.name,arguments:{id:'missing-two'}})]);
  const starts=localEvents.filter(event=>event.type==='connector.call'),failures=localEvents.filter(event=>event.type==='connector.error');
  assert.equal(starts.length,2);assert.equal(failures.length,2);assert.notEqual(starts[0].activity.callId,starts[1].activity.callId);
  for(const failed of failures){assert.equal(failed.activity.phase,'failed');assert.ok(starts.some(start=>start.activity.callId===failed.activity.callId));}
});

test('local library and project tools are explicitly selected, read-only, bounded and path constrained',async t=>{
  const {store,directory,service}=fixture(t);
  store.put('sources',{id:'source-one',title:'Fixture note',text:'unique fixture evidence'});
  store.put('sources',{id:'source-secret',title:'Secret fixture',text:'api_key="credential-value-must-stay"'});
  const library=saveConnector(store,{kind:'library',name:'Current library'});
  assert.deepEqual((await service.prepare([])).definitions,[]);
  const libraryTools=await service.prepare([library.id]),search=libraryTools.definitions.find(d=>d.description.includes('/ search.'));
  const found=await libraryTools.call({tool:search.name,arguments:{query:'fixture'}});assert.equal(found.success,true);assert.match(found.contentItems[0].text,/source-one/);assert.doesNotMatch(found.contentItems[0].text,/credential-value/);
  const projectPath=path.join(directory,'project');mkdirSync(projectPath);writeFileSync(path.join(projectPath,'note.md'),'local project evidence');writeFileSync(path.join(projectPath,'credentials.json'),'{}');
  writeFileSync(path.join(directory,'outside.md'),'outside resource');symlinkSync(path.join(directory,'outside.md'),path.join(projectPath,'link.md'));linkSync(path.join(directory,'outside.md'),path.join(projectPath,'hard.md'));
  const project=store.put('projects',createProject(store,{name:'Fixture project',path:projectPath}));
  const connected=saveConnector(store,{kind:'project',name:'Project folder',projectId:project.id}),prepared=await service.prepare([connected.id]),read=prepared.definitions.find(d=>d.description.includes('/ read.'));
  assert.match((await prepared.call({tool:read.name,arguments:{path:'note.md'}})).contentItems[0].text,/local project evidence/);
  for(const file of ['../outside.md','link.md','hard.md','credentials.json','/etc/passwd'])assert.equal((await prepared.call({tool:read.name,arguments:{path:file}})).success,false,file);
  store.put('tasks',{id:'referencing-task',connectorIds:[connected.id]});assert.throws(()=>deleteConnector(store,connected.id),{code:'connector_in_use'});
  deleteConnector(store,library.id);assert.equal(store.require('sources','source-one').text,'unique fixture evidence');
});

test('resource connector APIs persist selection and deliver real local tool data into the existing runner',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-connectors-api-'));let called=[];
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},runCodex:async options=>{
    called.push(options);const tool=options.dynamicTools.find(d=>d.description.includes('/ search.'));
    if(tool){const result=await options.onDynamicTool({tool:tool.name,arguments:{query:'fixture'}});assert.match(result.contentItems[0].text,/fixture-only-source/);assert.equal(result.success,true);}
    await options.onEvent({type:'runtime.action',label:'Recorded operation',detail:'Original public detail fixture-model-key',activity:{kind:'tool',phase:'running',callId:'call-one',name:'read fixture-model-key',permissions:{all:true},arguments:{password:'do not persist'}}});
    await options.onEvent({type:'runtime.message',label:'Public progress',detail:'Reviewing the selected source.',activity:{kind:'message',phase:'completed',callId:'message-one',messagePhase:'commentary'}});
    return {text:'Local protocol fixture completed',threadId:'fixture-thread'};
  }});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,value:await r.json()};};
  app.store.put('sources',{id:'fixture-only-source',title:'Fixture',text:'fixture content'});
  await api('settings/provider',{apiKey:'fixture-model-key'},'PUT');
  const connector=(await api('connectors',{kind:'library',name:'Selected library'})).value;
  assert.equal((await api('bootstrap')).value.connectors[0].id,connector.id);
  assert.equal((await api(`connectors/${connector.id}/test`,{})).value.ok,true);
  const task=(await api('tasks',{prompt:'fixture',mode:'live',digitalTwinEnabled:false,connectorIds:[connector.id]})).value;
  await api(`tasks/${task.id}/run`,{});await app.runner.active.get(task.id)?.promise;
  assert.equal(app.store.require('tasks',task.id).status,'completed');assert.equal(called[0].dynamicTools.length,2);assert.doesNotMatch(called[0].prompt,/fixture content/);
  const saved=app.store.require('tasks',task.id),action=saved.events.find(event=>event.activity?.kind==='tool'),connectorEvents=saved.events.filter(event=>event.activity?.kind==='connector');
  assert.deepEqual(action.activity,{kind:'tool',phase:'running',callId:'call-one',name:'read [redacted]'});assert.equal(action.detail,'Original public detail [redacted]');
  assert.deepEqual(connectorEvents.map(event=>event.activity.phase),['running','completed']);assert.equal(connectorEvents[0].activity.callId,connectorEvents[1].activity.callId);
  assert.equal(saved.events.find(event=>event.activity?.kind==='message').activity.messagePhase,'commentary');assert.doesNotMatch(JSON.stringify(saved),/do not persist|fixture-model-key/);
  await api(`tasks/${task.id}`,{connectorIds:[]},'PUT');await api(`tasks/${task.id}/message`,{content:'continue without resources'});await app.runner.active.get(task.id)?.promise;
  assert.deepEqual(called[1].dynamicTools,[]);assert.equal(called[1].threadId,undefined);
  assert.equal((await api(`connectors/${connector.id}`,{},'DELETE')).status,200);assert.ok(app.store.get('sources','fixture-only-source'));
  assert.ok(!JSON.stringify((await api('export')).value).includes('fixture-model-key'));
});

test('installed Codex executes an approved MCP dynamic tool through a local model protocol fixture', {skip:process.env.HITHER_TEST_REAL_CODEX!=='1'},async t=>{
  const {runConfiguredCodex}=await import('../server/chat-bridge.mjs');
  const f=await tested(t),requests=[];let approvals=0;
  const prepared=await f.service.prepare([f.connector.id],{onApproval:()=>{approvals++;return 'approve';}});
  const model=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push(body);
    res.setHeader('Content-Type','application/json');
    if(requests.length===1){
      const declared=body.tools?.find(item=>item.function?.name.endsWith(prepared.definitions[0].name));
      if(!declared){res.writeHead(400);res.end(JSON.stringify({error:{message:'Dynamic connector tool absent from local fixture request'}}));return;}
      res.end(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'fixture-dynamic-call',type:'function',function:{name:declared.function.name,arguments:JSON.stringify({text:'MCP roundtrip evidence'})}}]}}]}));
    }else res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Local dynamic MCP roundtrip complete.'}}]}));
  });
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{model.closeAllConnections();model.close(resolve);}));
  const result=await runConfiguredCodex({workspace:path.join(f.directory,'workspace'),codexHome:path.join(f.directory,'runtime'),settings:{provider:'custom',model:'local-fixture',baseUrl:`http://127.0.0.1:${model.address().port}`,api:'chat_completions',reasoningEffort:'low'},apiKey:'fixture-model-key',prompt:'Local protocol fixture only.',signal:AbortSignal.timeout(30000),dynamicTools:prepared.definitions,onDynamicTool:prepared.call,onApproval:async()=> 'reject'});
  assert.equal(result.text,'Local dynamic MCP roundtrip complete.');assert.equal(approvals,1);assert.equal(requests.length,2);
  const output=requests[1].messages.find(message=>message.role==='tool'&&message.tool_call_id==='fixture-dynamic-call');assert.match(JSON.stringify(output),/MCP roundtrip evidence/);
  assert.equal(f.calls.filter(call=>call.message.method==='tools/call').length,1);
});
