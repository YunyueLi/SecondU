import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compatibleProviderPresets,providerIds} from '../shared/provider-presets.mjs';
import {Store} from '../server/store.mjs';
import {saveConnection,testConnection} from '../server/connections.mjs';
import {toChatRequest} from '../server/chat-bridge.mjs';

test('official presets include local verified brand assets and do not invent model IDs',()=>{
  assert.deepEqual(compatibleProviderPresets.map(p=>[p.id,p.baseUrl,p.api]),[
    ['gemini','https://generativelanguage.googleapis.com/v1beta/openai','chat_completions'],
    ['qwen','https://dashscope.aliyuncs.com/compatible-mode/v1','chat_completions'],
    ['glm','https://open.bigmodel.cn/api/paas/v4','chat_completions'],
    ['doubao','https://ark.cn-beijing.volces.com/api/v3','chat_completions'],
    ['minimax','https://api.minimax.cn/v1','chat_completions'],
  ]);
  const sources=JSON.parse(readFileSync(new URL('../public/brand/providers/sources.json',import.meta.url)));
  for(const preset of compatibleProviderPresets){
    assert.equal(preset.model,undefined);assert.equal(new URL(preset.docsUrl).protocol,'https:');assert.ok(providerIds.includes(preset.id));
    const asset=sources.assets.find(a=>a.file===`${preset.id}.svg`),svg=readFileSync(new URL(`../public/brand/providers/${preset.id}.svg`,import.meta.url));
    assert.ok(asset);assert.equal(createHash('sha256').update(svg).digest('hex'),asset.sha256);assert.match(svg.toString(),/<svg/);assert.doesNotMatch(svg.toString(),/<(?:script|foreignObject)|(?:href|src)=["'](?:https?:|data:)/);
  }
});

test('new provider connections persist without changing existing selections and use real Chat requests',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'hither-presets-')),store=new Store(directory,{seed:false}),requests=[];
  const server=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;requests.push({path:req.url,auth:req.headers.authorization,body:JSON.parse(raw)});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'OK'}}]}));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const old=store.connection(),oldDefault=store.defaultConnectionId();
    for(const p of compatibleProviderPresets){
      const model=`user-selected-${p.id}-model`,saved=saveConnection(store,{provider:p.id,name:p.name,model,baseUrl:`http://127.0.0.1:${server.address().port}/${p.id}`,api:p.api,reasoningEffort:'medium',apiKey:'local-fixture-only'});
      const result=await testConnection(store,saved.id);assert.equal(result.value.ok,true);
      const request=requests.at(-1);assert.equal(request.path,`/${p.id}/chat/completions`);assert.equal(request.auth,'Bearer local-fixture-only');assert.equal(request.body.model,model);
      const translated=toChatRequest({model,input:[{role:'user',content:'A local test'}],tools:[]},{...saved,reasoningEffort:'medium'}).request;
      assert.equal(translated.model,model);assert.equal(translated.reasoning_effort,undefined);assert.equal(translated.messages[0].content,'A local test');
      const edited=saveConnection(store,{name:'Renamed'},store.connection(saved.id));assert.equal(edited.model,model);assert.equal(edited.baseUrl,saved.baseUrl);
      assert.throws(()=>saveConnection(store,{...saved,model:p.name}),/具体模型/);
    }
    assert.deepEqual(store.connection(old.id),old);assert.equal(store.defaultConnectionId(),oldDefault);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true});}
});
