import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverModels, catalogueSettings, streamResponseText, validateModelEndpoint } from '../server/model-catalogue.mjs';

test('provider catalogue preserves display names, order and de-duplicates model IDs',async()=>{
  const settings={provider:'openai',baseUrl:'https://api.openai.com/v1'};
  const result=await discoverModels(settings,'synthetic-key',{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/models');assert.equal(options.headers.Authorization,'Bearer synthetic-key');assert.equal(options.redirect,'error');return Response.json({data:[{id:'first',display_name:'First'},{id:'second',display_name:'Second'},{id:'first'}]});}});
  assert.deepEqual(result,{models:[{id:'first',name:'First'},{id:'second',name:'Second'}],source:'provider'});
  assert.throws(()=>validateModelEndpoint({...settings,baseUrl:'http://outside.example/v1'}),{code:'invalid_endpoint'});
});
test('provider models and Anthropic headers are read without inventing available models',async()=>{
  const settings=catalogueSettings({provider:'anthropic'});
  const result=await discoverModels(settings,'synthetic-key',{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/models');assert.equal(options.headers['x-api-key'],'synthetic-key');return Response.json({data:[{id:'model-a',display_name:'A'}]});}});
  assert.equal(result.source,'provider');assert.equal(result.models[0].id,'model-a');
  await assert.rejects(()=>discoverModels(settings,'synthetic-key',{fetchImpl:async()=>Response.json({data:[]})}),{code:'models_unavailable'});
});
test('catalogue errors cannot echo upstream credentials and redirects are not followed',async()=>{
  await assert.rejects(()=>discoverModels(catalogueSettings({provider:'openai'}),'synthetic-secret',{fetchImpl:async()=>Response.json({error:{message:'synthetic-secret'}},{status:401})}),error=>error.status===401&&!error.message.includes('synthetic-secret'));
  await assert.rejects(()=>discoverModels(catalogueSettings({provider:'openai'}),'synthetic-secret',{fetchImpl:async()=>{throw Error('synthetic-secret');}}),error=>!error.message.includes('synthetic-secret'));
});
function stream(chunks){return new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(Buffer.from(chunk));controller.close();}}));}
test('Responses stream handles split UTF-8 and CRLF, requiring a completed nonempty answer',async()=>{
  const complete='data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'完成'}]}]}})+'\r\n\r\n';
  assert.equal(await streamResponseText(stream([...Buffer.from(complete)].map(byte=>Buffer.from([byte])))),'完成');
  const delta='data: '+JSON.stringify({type:'response.output_text.delta',delta:'partial'})+'\n\n';
  await assert.rejects(()=>streamResponseText(stream([delta])),{code:'inference_incomplete'});
  await assert.rejects(()=>streamResponseText(stream(['data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[]}})+'\n\n'])),{code:'inference_incomplete'});
});
test('failed, oversized and malformed streams do not leak provider payloads',async()=>{
  await assert.rejects(()=>streamResponseText(stream(['data: '+JSON.stringify({type:'response.failed',response:{error:'synthetic-token'}})+'\n\n'])),error=>error.code==='inference_failed'&&!error.message.includes('synthetic-token'));
  await assert.rejects(()=>streamResponseText(stream(['data: INVALID\n\n'])),{code:'invalid_inference_stream'});
  await assert.rejects(()=>streamResponseText(stream(['A'.repeat(40)]),{maxBytes:20}),{code:'inference_too_large'});
});
