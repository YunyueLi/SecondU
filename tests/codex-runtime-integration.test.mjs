import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {runConfiguredCodex} from '../server/chat-bridge.mjs';
import {AppServerTransport} from '../server/codex.mjs';

// The real CLI talks only to a deterministic loopback model. No provider key,
// personal record or billable request is used by CI or this compatibility gate.
test(process.env.HITHER_TEST_PREVIOUS_CODEX?'pinned CLI resumes the previous CLI version without replaying its saved tool call':'pinned CLI completes a host tool, persists its result, and resumes in a new process', {skip:process.env.HITHER_TEST_REAL_CODEX!=='1',timeout:45000}, async t=>{
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'secondu-codex-turn-'))),workspace=path.join(root,'workspace'),codexHome=path.join(root,'runtime');
  await mkdir(workspace);t.after(()=>rm(root,{recursive:true,force:true}));
  const requests=[],handlerErrors=[];
  const server=http.createServer(async(req,res)=>{
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=JSON.parse(Buffer.concat(chunks));requests.push(body);
      assert.equal(req.url,'/v1/responses');
      const first=requests.length===1;
      const item=first?{id:'fc_fixture',type:'function_call',call_id:'call_fixture',name:'hither_fixture_write',arguments:JSON.stringify({text:'Synthetic saved artifact.'}),status:'completed'}:{id:`msg_${requests.length}`,type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:requests.length===2?'Fixture saved.':'Fixture resumed.',annotations:[]}]};
      const response={id:`resp_${requests.length}`,object:'response',status:'completed',output:[item],usage:{input_tokens:8,output_tokens:8,total_tokens:16}};
      res.writeHead(200,{'Content-Type':'text/event-stream'});let sequence=0;
      const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);
      emit('response.created',{response:{...response,status:'in_progress',output:[]}});
      emit('response.output_item.added',{output_index:0,item:{...item,...(first?{arguments:''}:{})}});
      if(first)emit('response.function_call_arguments.delta',{item_id:item.id,output_index:0,delta:item.arguments});
      emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response});res.end();
    } catch(error) {handlerErrors.push(error);res.writeHead(500);res.end('Synthetic fixture error');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const events=[],calls=[],options={workspace,codexHome,settings:{provider:'custom',model:'fixture-model',api:'responses',baseUrl:`http://127.0.0.1:${server.address().port}/v1`},apiKey:'synthetic-loopback-key',allowSubagents:false,
    dynamicTools:[{name:'hither_fixture_write',description:'Write a synthetic fixture inside the task directory.',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}],
    onDynamicTool:async params=>{calls.push(params);assert.deepEqual(params.arguments,{text:'Synthetic saved artifact.'});await writeFile(path.join(workspace,'fixture.txt'),params.arguments.text);return {success:true,contentItems:[{type:'inputText',text:'Saved fixture.txt'}]};},onEvent:event=>events.push(event)};
  const first=await runConfiguredCodex({...options,prompt:'Write the supplied synthetic artifact using hither_fixture_write.',...(process.env.HITHER_TEST_PREVIOUS_CODEX?{transportFactory:options=>new AppServerTransport({...options,command:process.env.HITHER_TEST_PREVIOUS_CODEX})}:{})});
  assert.equal(first.text,'Fixture saved.');assert.equal(calls.length,1);assert.equal(await readFile(path.join(workspace,'fixture.txt'),'utf8'),'Synthetic saved artifact.');
  assert.ok(requests[1].input.some(item=>item.type==='function_call_output' && item.call_id==='call_fixture'));
  const resumed=await runConfiguredCodex({...options,threadId:first.threadId,prompt:'Continue the saved fixture conversation.'});
  assert.equal(resumed.threadId,first.threadId);assert.equal(resumed.text,'Fixture resumed.');assert.equal(requests.length,3);assert.equal(calls.length,1,'a completed call must not replay on resume');
  assert.ok(JSON.stringify(requests[2].input).includes('Saved fixture.txt'),'resumed model context includes the saved tool result');
  assert.ok(events.some(event=>event.type==='runtime.thread' && event.label==='已恢复任务会话'));
  assert.deepEqual(handlerErrors,[]);
});

test('CLI finds its bundled search companion with a clean system PATH', {skip:process.env.HITHER_TEST_REAL_CODEX!=='1',timeout:20000},async t=>{
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'secondu-codex-path-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const transport=new AppServerTransport({cwd:root,env:{PATH:'/usr/bin:/bin',HOME:root,CODEX_HOME:root},args:['-c','analytics.enabled=false','-c','default_permissions="fixture"','-c',`permissions.fixture.filesystem={":minimal"="read",${JSON.stringify(root)}="write"}`,'-c','permissions.fixture.network.enabled=false']});
  t.after(()=>transport.close());
  await transport.request('initialize',{clientInfo:{name:'secondu-fixture',version:'0.0.0'}});transport.notify('initialized');
  const result=await transport.request('command/exec',{command:['rg','--version'],cwd:root,timeoutMs:3000});
  assert.equal(result.exitCode,0,result.stderr);assert.match(result.stdout,/ripgrep /);
});
