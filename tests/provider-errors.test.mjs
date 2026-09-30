import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createApp} from '../server/index.mjs';
import {providerErrorDetail} from '../server/provider-test.mjs';
import {modelIdIssue} from '../shared/model-validation.mjs';
async function fixture(t,handler){const upstream=http.createServer(handler);await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const directory=mkdtempSync(path.join(os.tmpdir(),'hither-provider-error-'));const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));rmSync(directory,{recursive:true,force:true});});const api=async(route,body,method='POST')=>{const res=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,value:await res.json()};};return {app,api,base:{provider:'openrouter',model:'openrouter/free',name:'Fixture',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,api:'chat_completions',reasoningEffort:'low',apiKey:'fixture-current-secret'}};}

test('OpenRouter platform labels and invalid model syntax fail locally before save or test without changing keys',async t=>{
 let calls=0;const f=await fixture(t,(req,res)=>{calls++;res.end('{}');});
 for(const model of ['OpenRouter','openrouter','claude-sonnet','provider/','/model','provider/model with spaces']){const failed=await f.api('model-connections',{...f.base,model});assert.equal(failed.status,400);assert.equal(failed.value.code,'invalid_model_id');}
 assert.equal(f.app.store.connectionList().length,1);assert.equal(Object.keys(f.app.store.getKeys()).length,0);
 const saved=(await f.api('model-connections',f.base)).value;assert.equal(saved.model,'openrouter/free');
 f.app.store.put('modelConnections',{...f.app.store.connection(saved.id),model:'OpenRouter'});
 const invalid=await f.api(`model-connections/${saved.id}/test`,{});assert.equal(invalid.status,400);assert.equal(invalid.value.code,'invalid_model_id');assert.equal(calls,0);assert.equal(f.app.store.connection(saved.id).model,'OpenRouter');
 assert.equal((await f.api(`model-connections/${saved.id}/default`,{})).status,400);assert.equal((await f.api(`model-connections/${saved.id}`,{apiKey:'new-secret'},'PUT')).status,400);const cleared=await f.api(`model-connections/${saved.id}`,{clearKey:true},'PUT');assert.equal(cleared.status,200);assert.equal(cleared.value.hasKey,false);assert.equal(cleared.value.model,'OpenRouter');
});

test('provider failures retain bounded useful message/code, redact every local key and token, and omit raw metadata',async t=>{
 let calls=0;const f=await fixture(t,(req,res)=>{calls++;req.resume();res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'invalid_model',message:'Unknown model; fixture-current-secret; fixture-other-secret; Bearer unseen-bearer-value; token=unseen-token-value; apiKey: unseen-key-value; sk-hiddenkey12345',metadata:{raw:'DO-NOT-EXPOSE-METADATA'}}}));});
 await f.api('model-connections',{...f.base,name:'Other',apiKey:'fixture-other-secret'});const connection=(await f.api('model-connections',f.base)).value;
 const result=await f.api(`model-connections/${connection.id}/test`,{});assert.equal(result.status,200);assert.equal(result.value.ok,false);assert.match(result.value.message,/HTTP 400.*invalid_model.*Unknown model/);assert.match(result.value.message,/redacted/);assert.doesNotMatch(JSON.stringify(result.value),/fixture-current-secret|fixture-other-secret|unseen-|sk-hidden|DO-NOT-EXPOSE/);
 const stored=f.app.store.connection(connection.id).lastTest;assert.equal(stored.message,result.value.message);assert.equal(calls,1);
});

test('error decoding does not turn oversized or non-JSON bodies into a raw response and keeps stale test rejection',async t=>{
 let release,entered;const started=new Promise(r=>entered=r),pause=new Promise(r=>release=r);let mode='large';
 const f=await fixture(t,async(req,res)=>{req.resume();if(mode==='stale'){entered();await pause;}res.writeHead(400,{'Content-Type':mode==='html'?'text/html':'application/json'});res.end(mode==='large'?JSON.stringify({error:{message:'PRIVATE'.repeat(20000)}}):mode==='html'?'<html>RAW-ERROR-BODY</html>':JSON.stringify({error:{message:'Old test failure'}}));});
 const connection=(await f.api('model-connections',f.base)).value;
 for(const current of ['large','html']){mode=current;const result=await f.api(`model-connections/${connection.id}/test`,{});assert.equal(result.value.ok,false);assert.match(result.value.message,/HTTP 400/);assert.doesNotMatch(result.value.message,/PRIVATE|RAW-ERROR/);assert.ok(result.value.message.length<200);}
 mode='stale';const testing=f.api(`model-connections/${connection.id}/test`,{});await started;await f.api(`model-connections/${connection.id}`,{model:'openrouter/auto'},'PUT');release();const result=await testing;assert.equal(result.status,409);assert.equal(result.value.stale,true);assert.equal(f.app.store.connection(connection.id).lastTest,undefined);
});

test('error detail accepts only scalar standard fields and truncates its output',()=>{
 assert.equal(providerErrorDetail({error:{metadata:{message:'hidden'},code:{raw:'secret'},message:['hidden']}}),'');
 assert.ok(providerErrorDetail({error:{code:'x'.repeat(200),message:'y'.repeat(2000)}}).length<=583);
});


test('shared model validation permits official preset/latest formats and custom aliases without implying availability',()=>{
  for(const model of ['openrouter/free','~openai/gpt-latest','@preset/my-preset','anthropic/claude-sonnet-5-5@preset/writer'])assert.equal(modelIdIssue('openrouter',model),undefined,model);
  assert.equal(modelIdIssue('openrouter','OpenRouter'),'provider_name');assert.equal(modelIdIssue('openrouter','model-name'),'openrouter_format');assert.equal(modelIdIssue('custom','OpenRouter'),undefined);
});
