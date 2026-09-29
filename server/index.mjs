import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Store, HttpError, collections, now, id } from './store.mjs';
import { createEntity, createTask, assertDeletable, text, choice, addEvent } from './domain.mjs';
import { TaskRunner } from './runner.mjs';
import { codexCommand } from './codex.mjs';
import { providerIdentity, validateTextResponse } from './provider-test.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const PROJECT=path.resolve(here,'..');
export const VERSION='0.1.0';
function respond(res,status,value,headers={}){const data=typeof value==='string'?value:JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(data);}
async function readJson(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new HttpError(415,'写入操作需要 application/json','json_required');
  let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>2*1024*1024)throw new HttpError(413,'请求超过 2 MB');parts.push(chunk);}
  try {const value=JSON.parse(Buffer.concat(parts).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new HttpError(400,'JSON 请求格式无效');}
}
function detectCodex(){try{const version=execFileSync(codexCommand(),['--version'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();return version.startsWith('codex-cli ')?{codexAvailable:true,codexVersion:version}:{codexAvailable:false};}catch{return {codexAvailable:false};}}

export function createApp({dataDir=process.env.HITHER_DATA_DIR??path.join(PROJECT,'.hither'),seed=true,runCodex,scheduler=true,computerInfo,distDir=path.join(PROJECT,'dist')}={}) {
  const store=new Store(dataDir,{seed});
  const spaceId=createHash('sha256').update(path.resolve(store.directory)).digest('hex').slice(0,24);
  const runner=new TaskRunner(store,{runCodex,scheduler});
  const computer={id:'local',name:os.hostname(),platform:process.platform,status:'online',workspace:store.workspace,...(computerInfo??detectCodex())};
  const bootstrap=()=>({version:VERSION,profile:store.meta('profile'),...Object.fromEntries(collections.map(c=>[c,store.list(c)])),settings:store.settings(),computer});
  let providerRevision=0;
  let server;
  function guard(req) {
    const ports=new Set([String(server.address()?.port??58645),'58645','58644']);
    let host;try{host=new URL(`http://${req.headers.host}`);}catch{throw new HttpError(403,'无效本机请求','origin_denied');}
    if(!['127.0.0.1','localhost','[::1]'].includes(host.hostname)||!ports.has(host.port))throw new HttpError(403,'仅接受本机应用请求','origin_denied');
    if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'不接受跨站请求','origin_denied');
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{throw new HttpError(403,'来源无效','origin_denied');}if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||!ports.has(origin.port))throw new HttpError(403,'来源不在本机应用范围','origin_denied');}
  }
  async function route(req,res) {
    guard(req);
    const url=new URL(req.url,'http://127.0.0.1');let parts;try{parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);}catch{throw new HttpError(400,'路径格式无效');}
    if(parts[0]!=='api'){
      if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError(405,'方法不支持');
      const requested=path.resolve(distDir,'.'+url.pathname);if(requested!==distDir&&!requested.startsWith(distDir+path.sep))throw new HttpError(403,'路径超出范围');
      let file=existsSync(requested)&&statSync(requested).isFile()?requested:path.join(distDir,'index.html');
      if(!existsSync(file))return respond(res,200,{name:'Hither',message:'后端已启动。开发界面位于 http://127.0.0.1:58644；构建后可在此打开桌面界面。'});
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'}[path.extname(file)]??'application/octet-stream';
      const data=readFileSync(file);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(req.method==='HEAD'?undefined:data);
    }
    const [,resource,key,action]=parts,method=req.method;
    const body=['POST','PUT','PATCH','DELETE'].includes(method)?await readJson(req):{};
    if(resource==='health'&&method==='GET')return respond(res,200,{application:'hither-desktop',version:VERSION,status:'ok',spaceId});
    if(resource==='bootstrap'&&method==='GET')return respond(res,200,bootstrap());
    if(resource==='export'&&method==='GET'){
      const data=bootstrap();data.settings={...store.meta('settings'),hasKey:false};delete data.settings.keyHint;delete data.settings.lastTest;delete data.computer;
      return respond(res,200,{exportVersion:1,exportedAt:now(),...data},{'Content-Disposition':'attachment; filename="hither-export.json"'});
    }
    if(resource==='profile'&&method==='PUT'){const current=store.meta('profile');return respond(res,200,store.setMeta('profile',{name:text(body.name??current.name,'name',200),description:text(body.description??current.description,'description',3000,false),demo:body.demo===false?false:current.demo}));}
    if(resource==='settings'&&key==='provider') {
      if(method==='GET')return respond(res,200,store.settings());
      if(method==='PUT'){
        const current=store.meta('settings'),v={...current,...body};
        const settings={provider:choice(v.provider,['deepseek','openai','custom'],'provider'),model:text(v.model,'model',200),baseUrl:text(v.baseUrl,'baseUrl',2000),api:choice(v.api,['responses'],'api'),reasoningEffort:choice(v.reasoningEffort,['low','medium','high'],'reasoningEffort'),hasKey:false};
        let parsed;try{parsed=new URL(settings.baseUrl);}catch{throw new HttpError(400,'模型地址无效');}
        if(parsed.username||parsed.password||parsed.search||parsed.hash||!['https:','http:'].includes(parsed.protocol)||(parsed.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)))throw new HttpError(400,'使用 HTTPS 地址，或本机 HTTP 地址；地址不能含凭据、查询或片段');
        settings.baseUrl=parsed.href;
        if(body.apiKey!==undefined && body.apiKey!==''){const apiKey=text(body.apiKey,'apiKey',10000);if(/[\r\n]/.test(apiKey))throw new HttpError(400,'密钥格式无效');store.setKey(settings,apiKey);}
        if(body.clearKey===true)store.setKey(settings,null);
        store.setMeta('settings',settings);providerRevision++;return respond(res,200,store.settings());
      }
      if(action==='test'&&method==='POST'){
        const settings=store.settings(),key=store.getKey();if(!key)throw new HttpError(409,'尚未填写当前提供方的密钥，未发送请求','key_required');
        const identity=providerIdentity(settings,key),revision=providerRevision;
        const started=Date.now();let outcome;
        try{
          const endpoint=settings.baseUrl.replace(/\/$/,'')+'/responses';
          const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:settings.model,input:'Reply with OK.',max_output_tokens:32,store:false,stream:false}),signal:AbortSignal.timeout(20000),redirect:'error'});
          if(!response.ok){await response.body?.cancel();outcome={ok:false,message:`提供方返回 HTTP ${response.status}。连接测试未通过；请核对模型、地址和密钥。`};}
          else {outcome=validateTextResponse(await response.json());}
        }catch(error){outcome={ok:false,message:runner.cleanError(`连接测试失败：${error.message}`)};}
        const current=store.meta('settings');
        if(revision!==providerRevision || providerIdentity(current,store.getKey(current))!==identity){
          const message='测试期间模型配置或密钥已改变，过时结果已丢弃；请使用当前配置重新测试。';
          return respond(res,409,{ok:false,stale:true,code:'stale_provider_test',error:message,message,latencyMs:Date.now()-started});
        }
        store.setMeta('settings',{...current,lastTest:{...outcome,at:now()}});return respond(res,200,{...outcome,latencyMs:Date.now()-started});
      }
    }
    if(resource==='tasks') {
      if(method==='POST'&&!key)return respond(res,201,createTask(store,body));
      if(method==='POST'&&action==='run')return respond(res,200,runner.start(key));
      if(method==='POST'&&action==='message')return respond(res,200,runner.message(key,body.content));
      if(method==='POST'&&action==='cancel')return respond(res,200,await runner.cancel(key));
      if(method==='POST'&&action==='approval')return respond(res,200,runner.decide(key,body.approvalId,body.decision));
      if(method==='PUT'&&key&&!action){if(runner.active.has(key))throw new HttpError(409,'请先停止任务再编辑其配置');const task=store.require('tasks',key);if(body.title!==undefined)task.title=text(body.title,'title',300);if(body.contextFactIds!==undefined){if(!Array.isArray(body.contextFactIds))throw new HttpError(400,'contextFactIds 无效');for(const fid of body.contextFactIds)store.require('facts',fid);task.contextFactIds=[...new Set(body.contextFactIds)];}if(body.agentIds!==undefined){if(!Array.isArray(body.agentIds))throw new HttpError(400,'agentIds 无效');for(const aid of body.agentIds)store.require('agents',aid);task.agentIds=[...new Set(body.agentIds)];}task.updatedAt=now();return respond(res,200,store.put('tasks',task));}
    }
    if(resource==='artifacts'){
      if(method==='PUT'&&key&&!action){const old=store.require('artifacts',key);if(runner.active.has(old.taskId)&&store.require('tasks',old.taskId).mode==='live')throw new HttpError(409,'请先中断模型执行，再编辑这份产物，避免模型同时写入。','task_active');if(body.baseVersion!==old.version)throw new HttpError(409,'文件已被更新，请刷新后再保存','version_conflict');text(body.content,'content',1024*1024,false);const content=body.content,version=old.version+1,stamp=now();const artifact={...old,content,version,updatedAt:stamp,versions:[...old.versions,{version,content,createdAt:stamp,author:'用户'}]};store.writeArtifact(artifact);runner.event(old.taskId,'artifact_edited',`用户编辑了 ${old.name}`,`版本 ${version}`);return respond(res,200,artifact);}
      if(method==='POST'&&!key){const task=store.require('tasks',body.taskId);if(runner.active.has(task.id))throw new HttpError(409,'执行中暂不能新增同名产物');const name=text(body.name,'name',200);text(body.content??'','content',1024*1024,false);const content=body.content??'';if(store.list('artifacts').some(a=>a.taskId===task.id&&a.name===name))throw new HttpError(409,'同名产物已存在');return respond(res,201,runner.saveArtifact(task.id,name,content,'用户'));}
      if(method==='GET'&&action==='download'){const artifact=store.require('artifacts',key);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(artifact.content);}
    }
    if(resource==='automations'&&method==='POST'&&action==='run')return respond(res,200,runner.runAutomation(key));
    if(collections.includes(resource) && !action){
      if(resource==='sources'&&method==='PUT')throw new HttpError(405,'来源原文不可覆盖。请导入一份新的反馈来源，并在认知修订中关联它。','immutable_source');
      if(method==='GET')return respond(res,200,key?store.require(resource,key):store.list(resource));
      if(method==='DELETE'&&key){
        assertDeletable(store,resource,key);
        if(resource==='tasks'){
          if(runner.active.has(key))throw new HttpError(409,'请先停止运行中的任务');
          const task=store.require('tasks',key);for(const aid of task.artifactIds){const a=store.get('artifacts',aid);if(a){const file=store.artifactPath(a);if(existsSync(file))unlinkSync(file);store.delete('artifacts',aid);}}
        }
        if(resource==='artifacts'){const a=store.require('artifacts',key);if(runner.active.has(a.taskId))throw new HttpError(409,'请先停止运行中的任务');const file=store.artifactPath(a);if(existsSync(file))unlinkSync(file);runner.mutate(a.taskId,t=>{t.artifactIds=t.artifactIds.filter(x=>x!==key);});}
        store.delete(resource,key);return respond(res,200,{ok:true});
      }
      if(method==='POST'&&!key || method==='PUT'&&key){const entity=createEntity(store,resource,body,key?store.require(resource,key):undefined);store.put(resource,entity);if(resource==='sources'&&method==='POST')runner.sourceImported(entity);return respond(res,method==='POST'?201:200,entity);}
    }
    throw new HttpError(404,'接口不存在','not_found');
  }
  server=http.createServer((req,res)=>route(req,res).catch(error=>{if(!res.headersSent)respond(res,error.status??500,{error:runner.cleanError(error.status?error.message:'本机服务遇到错误，请检查运行日志。'),code:error.code??'internal_error'});if(!error.status)console.error('[hither]',runner.cleanError(error.stack??error.message));}));
  server.requestTimeout=30000;server.headersTimeout=10000;
  return {server,store,runner,bootstrap,async close(){await runner.close();if(server.listening)await new Promise(resolve=>server.close(resolve));store.close();}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp();const port=Number(process.env.PORT??58645);
  app.server.listen(port,'127.0.0.1',()=>console.log(`Hither ${VERSION} listening on http://127.0.0.1:${port}`));
  app.server.on('error',error=>{console.error(`Hither startup failed: ${error.code??error.message}`);process.exitCode=1;app.close();});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0));});
}
