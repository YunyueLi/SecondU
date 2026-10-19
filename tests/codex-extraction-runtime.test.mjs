import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runConfiguredCodex} from '../server/chat-bridge.mjs';

const schema={type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false};
const answer=JSON.stringify({summary:'Synthetic protocol fixture; no personal material.'});

for(const api of ['responses','chat_completions','messages'])test(`installed Codex isolated extraction completes through ${api} without action tools`,{skip:process.env.HITHER_TEST_REAL_CODEX!=='1',timeout:30000},async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'secondu-extraction-runtime-')),workspace=path.join(root,'workspace'),codexHome=path.join(root,'runtime'),requests=[];
  await mkdir(workspace);t.after(()=>rm(root,{recursive:true,force:true}));
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));requests.push({url:req.url,body});
    if(api==='responses'){
      const item={id:'msg_fixture',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:answer,annotations:[]}]},response={id:'resp_fixture',object:'response',status:'completed',output:[item],usage:{input_tokens:8,output_tokens:8,total_tokens:16}};
      res.writeHead(200,{'Content-Type':'text/event-stream'});let sequence=0;const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);
      emit('response.created',{response:{...response,status:'in_progress',output:[]}});emit('response.output_item.added',{output_index:0,item});emit('response.output_item.done',{output_index:0,item});emit('response.completed',{response});res.end();return;
    }
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(api==='messages'?{id:'msg_fixture',type:'message',role:'assistant',model:'fixture-model',content:[{type:'text',text:answer}],stop_reason:'end_turn',usage:{input_tokens:8,output_tokens:8}}:{id:'chat_fixture',choices:[{message:{role:'assistant',content:answer},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:8,total_tokens:16}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const events=[],result=await runConfiguredCodex({workspace,codexHome,settings:{provider:api==='chat_completions'?'deepseek':'custom',model:'fixture-model',api,baseUrl:`http://127.0.0.1:${server.address().port}/v1`},apiKey:'synthetic-loopback-key',prompt:'Return only the provided JSON object: '+answer,extractOnly:true,allowSubagents:false,...(api==='responses'?{outputSchema:schema}:{}),onEvent:event=>events.push(event)});
  assert.equal(result.text,answer);assert.equal(requests.length,1,'no fallback or retry');
  const outgoing=requests[0].body,names=(outgoing.tools??[]).map(tool=>tool.function?.name??tool.name);
  assert.ok(names.every(name=>name==='request_user_input'),JSON.stringify(names));
  assert.equal(events.some(event=>['runtime.action','runtime.collaboration'].includes(event.type)),false);
  if(api==='responses'){assert.equal(outgoing.text.format.type,'json_schema');assert.deepEqual(outgoing.text.format.schema,schema);assert.equal(outgoing.text.format.strict,true);}
  else {assert.equal(outgoing.response_format,undefined);assert.equal(outgoing.text,undefined);assert.equal(outgoing.model,'fixture-model');}
});
