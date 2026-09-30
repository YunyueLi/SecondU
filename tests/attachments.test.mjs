import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,unlinkSync,statSync,readdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/index.mjs';
import {saveAttachment,getAttachment,messageInput,taskAttachmentInput,ATTACHMENT_LIMIT} from '../server/attachments.mjs';
import {createTask} from '../server/domain.mjs';
import {startChatBridge,toChatRequest,toMessagesRequest,runConfiguredCodex} from '../server/chat-bridge.mjs';

// A synthetic one-pixel PNG; never a screenshot or user photograph.
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const imageUrl=`data:image/png;base64,${png}`;
const upload={name:'合成像素.png',mime:'image/png',data:png};
function storeFixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'hither-attachments-')),store=new Store(directory,{seed:false});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {store,directory};}
async function fixture(t,{runCodex}={}){
 const directory=mkdtempSync(path.join(os.tmpdir(),'hither-attachment-api-')),calls=[];
 const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},runCodex:runCodex??(async options=>{calls.push(options);return {text:'Synthetic protocol fixture completed.'};})});
 const connection=app.store.connection();app.store.setKey(connection,'local-fixture-key');
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const api=async(route,body,method=body===undefined?'GET':'POST',headers={})=>{const response=await fetch(`${base}/api/${route}`,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
 return {app,api,base,calls,directory};
}

test('attachment storage retains exact originals, private permissions and metadata after reopening',t=>{
 const {store,directory}=storeFixture(t),attachment=saveAttachment(store,upload);
 assert.equal(attachment.kind,'image');assert.equal(attachment.size,Buffer.from(png,'base64').length);assert.match(attachment.url,/^\/api\/attachments\/attachment-/);
 assert.deepEqual(getAttachment(store,attachment.id).data,Buffer.from(png,'base64'));assert.doesNotMatch(JSON.stringify(attachment),/base64|sha256|\.bin/);
 const file=path.join(directory,'attachments',`${attachment.id}.bin`);assert.equal(statSync(file).mode&0o777,0o600);assert.equal(statSync(path.dirname(file)).mode&0o777,0o700);
 const reopened=new Store(directory,{seed:false});assert.deepEqual(getAttachment(reopened,attachment.id).data,Buffer.from(png,'base64'));reopened.close();
 writeFileSync(file,'changed');assert.throws(()=>getAttachment(store,attachment.id),error=>error.code==='attachment_changed');
});

test('uploads reject spoofed images and oversize input, while unsupported files remain stored without claiming understanding',t=>{
 const {store}=storeFixture(t);
 for(const body of [{...upload,data:Buffer.from('<svg onload="alert(1)">').toString('base64')},{...upload,name:'../a.png'},{...upload,data:'!!!!'},{...upload,mime:'text/plain\r\nX-Test:x'}])assert.throws(()=>saveAttachment(store,body));
 assert.throws(()=>saveAttachment(store,{...upload,data:Buffer.alloc(ATTACHMENT_LIMIT+1).toString('base64')}),error=>error.status===413);
 assert.equal(store.list('attachments').length,0);
 const file=saveAttachment(store,{name:'synthetic.mp4',mime:'video/mp4',data:Buffer.from([0,1,2,3]).toString('base64')});assert.equal(file.kind,'file');assert.equal(getAttachment(store,file.id).data.length,4);
 assert.throws(()=>createTask(store,{prompt:'Explain this',mode:'live',attachmentIds:[file.id]}),error=>error.code==='unsupported_attachment');assert.equal(store.list('tasks').length,0);
});

test('replaced attachment symlinks never read outside the attachment directory',t=>{
 const {store,directory}=storeFixture(t),attachment=saveAttachment(store,upload),file=path.join(directory,'attachments',`${attachment.id}.bin`),outside=path.join(directory,'outside.txt');
 writeFileSync(outside,'unrelated local file');unlinkSync(file);symlinkSync(outside,file);
 assert.throws(()=>getAttachment(store,attachment.id),error=>error.code==='attachment_unavailable');assert.equal(readFileSync(outside,'utf8'),'unrelated local file');
});

test('attachment API enforces origin and space isolation and downloads exact bytes with a safe filename',async t=>{
 const f=await fixture(t),saved=await f.api('attachments',upload);assert.equal(saved.status,201);
 const response=await fetch(f.base+saved.value.url);assert.equal(response.status,200);assert.equal(response.headers.get('content-disposition'),`inline; filename*=UTF-8''${encodeURIComponent(upload.name)}`);assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(png,'base64'));
 assert.equal((await fetch(f.base+saved.value.url,{headers:{Origin:'https://external.example'}})).status,403);
 assert.equal((await fetch(f.base+saved.value.url,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 await f.api('spaces/demo-engineer-v4',{});
 const space='spaces/demo-engineer-v4/';assert.equal((await f.api(space+`attachments/${saved.value.id}`)).status,404);
 const second=await f.api(space+'attachments',upload);assert.equal(second.status,201);assert.equal((await f.api(`attachments/${second.value.id}`)).status,404);
 const main=(await f.api('bootstrap')).value,demo=(await f.api(space+'bootstrap')).value;assert.deepEqual(main.attachments.map(x=>x.id),[saved.value.id]);assert.deepEqual(demo.attachments.map(x=>x.id),[second.value.id]);assert.doesNotMatch(JSON.stringify(main.attachments),/base64|\.bin/);
});

test('pure image messages reach the runtime as real image blocks and follow-up turns retain attachment context',async t=>{
 const f=await fixture(t),attachment=(await f.api('attachments',upload)).value;
 const created=await f.api('tasks',{prompt:'',attachmentIds:[attachment.id],mode:'live'});assert.equal(created.status,201);assert.equal(created.value.title,upload.name);assert.deepEqual(created.value.messages[0].attachmentIds,[attachment.id]);
 await f.api(`tasks/${created.value.id}/run`,{});await f.app.runner.active.get(created.value.id)?.promise;
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].images,[{type:'image',url:imageUrl}]);assert.match(f.calls[0].prompt,/imageIndex/);assert.ok(!f.calls[0].prompt.includes(png));
 await f.api(`tasks/${created.value.id}/message`,{content:'Please compare the colors.'});await f.app.runner.active.get(created.value.id)?.promise;
 assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].images,[{type:'image',url:imageUrl}]);assert.deepEqual(f.app.store.require('tasks',created.value.id).artifactIds,[]);
 assert.deepEqual(readdirSync(f.calls[0].workspace),[],'attachments must not be mistaken for generated workspace files');
 assert.throws(()=>messageInput(f.app.store,'',[...Array(7)].map(()=>attachment.id)),error=>error.code==='invalid_attachment');
});

test('text attachments inject bounded real contents and preserve full local original',t=>{
 const {store}=storeFixture(t),text='Synthetic source line.\n'.repeat(3000),attachment=saveAttachment(store,{name:'evidence.md',mime:'text/markdown',data:Buffer.from(text).toString('base64')});
 assert.equal(attachment.kind,'text');const task=createTask(store,{prompt:'Summarize',mode:'live',attachmentIds:[attachment.id]}),input=taskAttachmentInput(store,task);
 assert.deepEqual(input.input,[]);assert.equal(input.evidence[0].text,text.slice(0,32000));assert.equal(input.evidence[0].truncated,true);assert.equal(getAttachment(store,attachment.id).data.toString(),text);
});

test('group messages retain attachment metadata and quoted attachments across independently created tasks',async t=>{
 const f=await fixture(t),attachment=(await f.api('attachments',upload)).value;
 const a=(await f.api('agents',{name:'Fixture agent',instructions:'Synthetic tests only'})).value;
 const room=(await f.api('agent-rooms',{title:'Image fixtures',kind:'direct',agentIds:[a.id],mode:'live'})).value;
 const first=await f.api(`agent-rooms/${room.id}/messages`,{content:'',attachmentIds:[attachment.id]});assert.equal(first.status,201);await f.app.runner.active.get(first.value.task.id)?.promise;
 const user=f.app.store.require('agentRooms',room.id).messages.find(message=>message.role==='user');assert.deepEqual(user.attachmentIds,[attachment.id]);
 const second=await f.api(`agent-rooms/${room.id}/messages`,{content:'Explain the same picture again.',replyToMessageId:user.id});await f.app.runner.active.get(second.value.task.id)?.promise;
 assert.deepEqual(f.calls.at(-1).images,[{type:'image',url:imageUrl}]);assert.deepEqual(f.app.store.require('tasks',second.value.task.id).replyContext.attachmentIds,[attachment.id]);
});

test('local demo acknowledges attachment storage without inventing image or text analysis',async t=>{
 const f=await fixture(t),attachment=(await f.api('attachments',upload)).value,task=(await f.api('tasks',{prompt:'',attachmentIds:[attachment.id],mode:'demo'})).value;
 await f.api(`tasks/${task.id}/run`,{});await f.app.runner.active.get(task.id)?.promise;const done=f.app.store.require('tasks',task.id);
 assert.match(done.messages.at(-1).content,/没有分析图片或文件/);assert.equal(done.status,'completed');assert.deepEqual(done.artifactIds,[]);assert.equal(f.calls.length,0);
});

test('image mappings preserve bytes for Chat Completions and Anthropic and reject non-image multimodal input',()=>{
 const body={input:[{role:'user',content:[{type:'input_text',text:'Look at this'},{type:'input_image',image_url:imageUrl}]}]};
 const chat=toChatRequest(body,{model:'fixture',provider:'custom'}).request;assert.deepEqual(chat.messages[0].content,[{type:'text',text:'Look at this'},{type:'image_url',image_url:{url:imageUrl}}]);
 const anthropic=toMessagesRequest(body,{model:'fixture',provider:'anthropic'}).request;assert.deepEqual(anthropic.messages[0].content,[{type:'text',text:'Look at this'},{type:'image',source:{type:'base64',media_type:'image/png',data:png}}]);
 for(const content of [[{type:'input_image',image_url:'https://external.example/image.png'}],[{type:'input_audio',data:'anything'}],[{type:'input_file',file_id:'file-a'}]])for(const map of [toChatRequest,toMessagesRequest])assert.throws(()=>map({input:[{role:'user',content}]},{model:'fixture'}));
});

test('HTTP provider bridges forward image bytes to local fixtures without external calls',async t=>{
 for(const api of ['chat_completions','messages']){
  let received;
  const upstream=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received=JSON.parse(raw);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(api==='messages'?{id:'fixture',type:'message',role:'assistant',content:[{type:'text',text:'Fixture image received'}],stop_reason:'end_turn'}:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'Fixture image received'}}]}));});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{upstream.closeAllConnections();upstream.close(resolve);}));
  const bridge=await startChatBridge({settings:{api,model:'fixture',provider:api==='messages'?'anthropic':'custom',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`},apiKey:'local-fixture'});t.after(()=>bridge.close());
  const response=await fetch(bridge.baseUrl+'/responses',{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({input:[{role:'user',content:[{type:'input_image',image_url:imageUrl}]}]})});
  assert.equal(response.status,200);assert.match(JSON.stringify(await response.json()),/Fixture image received/);
  const image=received.messages[0].content[0];assert.equal(api==='messages'?image.source.data:image.image_url.url,api==='messages'?png:imageUrl);
 }
});

test('all image transports reject runtime image loss before contacting the provider',async t=>{
 let requests=0;const upstream=http.createServer((req,res)=>{requests++;res.writeHead(500);res.end();});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{upstream.closeAllConnections();upstream.close(resolve);}));
 for(const api of ['responses','chat_completions','messages']){
  const bridge=await startChatBridge({settings:{api,model:'fixture',provider:'custom',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`},apiKey:'local-fixture',images:[{type:'image',url:imageUrl}]});t.after(()=>bridge.close());
  for(const content of [[{type:'input_text',text:'image content omitted because it could not be processed'}],[{type:'input_text',text:'The runtime lost this image.'}]]){
   const response=await fetch(bridge.baseUrl+'/responses',{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({input:[{role:'user',content}]})});
   assert.equal(response.status,400);assert.equal((await response.json()).error.code,'image_input_lost');
  }
 }
 assert.equal(requests,0);
});

test('task and room archive updates retain history and survive unrelated title edits and restore',async t=>{
 const f=await fixture(t),a=(await f.api('agents',{name:'Fixture agent',instructions:'Synthetic tests only'})).value;
 const task=(await f.api('tasks',{prompt:'Preserve this original message.',mode:'demo'})).value;
 const room=(await f.api('agent-rooms',{title:'Original room',kind:'direct',agentIds:[a.id],mode:'demo'})).value;
 for(const [resource,record] of [['tasks',task],['agent-rooms',room]]){
  const route=`${resource}/${record.id}`;
  assert.equal((await f.api(route,{archived:'yes'},'PUT')).status,400);
  assert.equal((await f.api(route,{archived:true},'PUT')).value.archived,true);
  const renamed=(await f.api(route,{title:'Renamed fixture'},'PUT')).value;
  assert.equal(renamed.archived,true);assert.deepEqual(renamed.messages,record.messages);
  assert.equal((await f.api(route,{archived:false},'PUT')).value.archived,false);
 }
 const reopened=new Store(f.directory,{seed:false});t.after(()=>reopened.close());
 assert.equal(reopened.require('tasks',task.id).messages[0].content,task.messages[0].content);
 assert.equal(reopened.require('agentRooms',room.id).archived,false);
});

function providerFixture(api,received){
 return http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;received.push(JSON.parse(raw));
  const text='Synthetic image protocol verified locally.';
  if(api==='responses'){
   const item={id:'msg_fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
   const response={id:'resp_fixture',object:'response',status:'completed',output:[item]};
   res.writeHead(200,{'Content-Type':'text/event-stream'});
   for(const [type,payload] of [['response.created',{response:{...response,status:'in_progress',output:[]}}],['response.output_item.done',{output_index:0,item}],['response.completed',{response}]])res.write(`event: ${type}\ndata: ${JSON.stringify({type,...payload})}\n\n`);
   res.end();return;
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(api==='messages'?{id:'fixture',type:'message',role:'assistant',content:[{type:'text',text}],stop_reason:'end_turn'}:{choices:[{finish_reason:'stop',message:{role:'assistant',content:text}}]}));
 });
}

test('installed Codex sends the synthetic original through every image protocol to local providers',{skip:process.env.HITHER_TEST_REAL_CODEX!=='1'},async t=>{
 for(const api of ['responses','chat_completions','messages']){
  const received=[],upstream=providerFixture(api,received);
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{upstream.closeAllConnections();upstream.close(resolve);}));
  const f=await fixture(t,{runCodex:runConfiguredCodex});
  const connection=(await f.api('model-connections',{name:'Local image fixture',provider:api==='messages'?'anthropic':'custom',model:api==='messages'?'claude-sonnet-4-5':'local-fixture',api,baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,reasoningEffort:'low',apiKey:'local-fixture-key'})).value;
  assert.ok(connection.id,JSON.stringify(connection));
  const attachment=(await f.api('attachments',upload)).value,task=(await f.api('tasks',{prompt:'Describe the attached synthetic pixel. Do not run tools.',mode:'live',connectionId:connection.id,attachmentIds:[attachment.id]})).value;
  await f.api(`tasks/${task.id}/run`,{});await f.app.runner.active.get(task.id)?.promise;
  const done=f.app.store.require('tasks',task.id);assert.equal(done.status,'completed',done.error);
  const parts=(received[0].messages??received[0].input).flatMap(message=>Array.isArray(message.content)?message.content:[]);
  const images=parts.filter(part=>['image_url','input_image','image'].includes(part.type));
  assert.ok(images.length,`missing image in ${api}`);
  assert.equal(api==='messages'?images.at(-1).source.data:api==='responses'?images.at(-1).image_url:images.at(-1).image_url.url,api==='messages'?png:imageUrl);
  assert.deepEqual(done.artifactIds,[]);assert.doesNotMatch(JSON.stringify(done),/data:image/);
 }
});

test('installed Codex cannot silently send corrupt images as text-only requests',{skip:process.env.HITHER_TEST_REAL_CODEX!=='1'},async t=>{
 const received=[],upstream=providerFixture('chat_completions',received);
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{upstream.closeAllConnections();upstream.close(resolve);}));
 const f=await fixture(t,{runCodex:runConfiguredCodex});
 const connection=(await f.api('model-connections',{name:'Local corrupt image fixture',provider:'custom',model:'local-fixture',api:'chat_completions',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,reasoningEffort:'low',apiKey:'local-fixture-key'})).value;
 const corrupt='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
 const attachment=(await f.api('attachments',{...upload,data:corrupt})).value;
 const task=(await f.api('tasks',{prompt:'Describe the corrupt synthetic pixel.',mode:'live',connectionId:connection.id,attachmentIds:[attachment.id]})).value;
 await f.api(`tasks/${task.id}/run`,{});await f.app.runner.active.get(task.id)?.promise;
 const done=f.app.store.require('tasks',task.id);assert.equal(done.status,'failed');assert.match(done.error,/无法处理至少一张图片/);assert.equal(received.length,0);
});
