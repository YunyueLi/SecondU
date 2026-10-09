import {reviseTaskMessage} from './message-revisions.mjs';
import { approvalMode, executionSettings, saveExecutionSettings } from './execution-settings.mjs';
import { createDevelopmentReader } from './development-review.mjs';
import { ensureUSDemoFiles } from './demo-us.mjs';
import { ensureDemoShowcase } from './demo-showcase.mjs';
import { ensureDecisionExample } from './demo-decision.mjs';
import { resolveExecutionPolicy, guardExecutionRoute } from './execution-policy.mjs';
import { normalizeContextRequest, personalContextFor } from './personal-context.mjs';
import { feedbackRecord, taskFeedback, saveTaskFeedback } from './task-learning.mjs';
import { ImCliService } from './im-cli.mjs';
import { ImSetupService } from './im-setup.mjs';
import { TwinMcpGrants } from './twin-mcp-grants.mjs';
import { AgentResourcesService } from './agent-resources.mjs';
import { saveProfile } from './profile.mjs';
import { ConnectorService, connectorSelection, publicConnector, saveConnector, deleteConnector } from './connectors.mjs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Store, HttpError, collections, now, id } from './store.mjs';
import { publicProject, listProjectFiles } from './projects.mjs';
import { chooseProjectDirectory } from './directory-picker.mjs';
import { createEntity, createTask, assertDeletable, text, choice, bool, refs, addEvent } from './domain.mjs';
import { TaskRunner } from './runner.mjs';
import { saveTaskReaction } from './task-reactions.mjs';
import { saveRoomReaction } from './room-reactions.mjs';
import { artifactBytes, artifactAtVersion, binaryArtifactMime, isBinaryArtifact, BINARY_ARTIFACT_JSON_LIMIT } from './artifact-content.mjs';
import { createOfficePreviewer } from './office-preview.mjs';
import { runtimeRevision } from './runtime-revision.mjs';
import { codexCommand } from './codex.mjs';
import { saveConnection, setDefaultConnection, deleteConnection, testConnection } from './connections.mjs';
import { catalogueSettings, discoverModels } from './model-catalogue.mjs';
import { DelegationService } from './delegation.mjs';
import { RemoteComputerService } from './remote/service.mjs';
import { RemoteTaskBridge } from './remote/task-bridge.mjs';
import { createRoom, roomTask } from './rooms.mjs';
import { previewChatImport, commitChatImport } from './imports.mjs';
import { previewMemoryImport, commitMemoryImport, reviewMemoryImport, digitalTwinPackage, digitalTwinMarkdown, digitalTwinContext } from './memory-import.mjs';
import { dailyActivity, previewActivityImport, commitActivityImport } from './daily-activity.mjs';
import { runtimeCapabilities, taskTrace } from './runtime-observation.mjs';
import { saveAgentAvatar, getAvatar, batchAvatarStyle, defaultAgentAvatarStyle } from './avatars.mjs';
import { ENGINEER_SPACE, LEGACY_ENGINEER_SPACE, US_SPACE, isExampleSpace, PERSONAL_SPACE, localSpaceDirectory } from './demo-space.mjs';
import { getAppearance, saveAppearance, getArtwork, getArtworkInfo, saveArtwork } from './local-appearance.mjs';
import { saveAttachment, getAttachment, publicAttachment, ATTACHMENT_LIMIT } from './attachments.mjs';
import { UpdateLifecycle, installQuitIpc } from './update-lifecycle.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const PROJECT=path.resolve(here,'..');
export const VERSION=JSON.parse(readFileSync(path.join(PROJECT,'package.json'),'utf8')).version;
function respond(res,status,value,headers={}){const data=typeof value==='string'?value:JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(data);}
async function readJson(req,maxBytes=2*1024*1024){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new HttpError(415,'写入操作需要 application/json','json_required');
  // Drain an oversized request without retaining more bytes. Throwing inside the
  // iterator destroys the stream and can turn the intended 413 into client EPIPE.
  let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes<=maxBytes)parts.push(chunk);}
  if(bytes>maxBytes)throw new HttpError(413,`请求超过 ${maxBytes/1024/1024} MB`);
  try {const value=JSON.parse(Buffer.concat(parts).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new HttpError(400,'JSON 请求格式无效');}
}
function detectCodex(){try{const version=execFileSync(codexCommand(),['--version'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();return version.startsWith('codex-cli ')?{codexAvailable:true,codexVersion:version}:{codexAvailable:false};}catch{return {codexAvailable:false};}}

export function createApp({dataDir=process.env.HITHER_DATA_DIR??path.join(PROJECT,'.hither'),seed=true,seedLocale='zh-CN',runCodex,runImCli,runResourceCli,scheduler=true,computerInfo,chooseDirectory=chooseProjectDirectory,distDir=path.join(PROJECT,'dist'),executionPolicy,modelFetch=fetch,remoteTransport,developmentRoot=PROJECT,officePreviewOptions,imSetupOptions,_allowDemoSpace=true,_parentPort,_protectedDataDirectory,_updateLifecycle}={}) {
  const updateLifecycle=_updateLifecycle??new UpdateLifecycle();
  const store=new Store(dataDir,{seed,seedLocale,protectedDataDirectory:_protectedDataDirectory});
  const policy=resolveExecutionPolicy(executionPolicy,store.meta('profile'));
  if(policy==='showcase') {
    if(store.meta('profile').demoLocale==='en')ensureUSDemoFiles(store);
    else ensureDemoShowcase(store);
    ensureDecisionExample(store);
  }
  const spaceId=createHash('sha256').update(path.resolve(store.directory)).digest('hex').slice(0,24);
  const connectors=new ConnectorService(store,{blockedPorts:()=>[58644,58645,server?.address()?.port,_parentPort?.()],oauth:{requestGate:(req,work)=>updateLifecycle.runRequest(req,work)}});
  const im=new ImCliService(store,{runCli:runImCli});
  const imSetup=new ImSetupService(store,{im,executionPolicy:policy,...imSetupOptions});
  const twinMcpGrants=new TwinMcpGrants(store);
  const resources=new AgentResourcesService(store,{im,runCli:runResourceCli});
  const runner=new TaskRunner(store,{runCodex,scheduler,connectors,executionPolicy:policy,canSchedule:()=>updateLifecycle.accepting});
  const delegations=new DelegationService(store,{executionPolicy:policy,requestGate:(req,work)=>updateLifecycle.runRequest(req,work)});
  const remoteTasks=new RemoteTaskBridge(store);
  const remoteComputers=new RemoteComputerService(store,{executionPolicy:policy,...(remoteTransport?{transport:remoteTransport}:{}),onRunChanged:run=>remoteTasks.sync(run)});
  updateLifecycle.register({store,runner,delegations,remoteComputers,imSetup,connectors});
  const development=createDevelopmentReader({projectRoot:developmentRoot});
  const previewOffice=createOfficePreviewer(store,officePreviewOptions);
  remoteTasks.connect(remoteComputers);
  const computer={id:'local',name:os.hostname(),platform:process.platform,status:'online',workspace:store.workspace,...(computerInfo??detectCodex())};
  const bootstrap=()=>({version:VERSION,executionSettings:executionSettings(store),...(policy?{executionPolicy:policy}:{}),connectors:connectors.list(),attachments:store.list('attachments').map(publicAttachment),defaultAgentAvatarStyle:defaultAgentAvatarStyle(store),dailyActivities:dailyActivity(store),profile:store.meta('profile'),...Object.fromEntries(collections.map(c=>[c,c==='projects'?store.list(c).map(project=>publicProject(project,store.protectedDataDirectory)):store.list(c)])),settings:store.settings(),modelConnections:store.connectionList(),defaultConnectionId:store.defaultConnectionId(),computer});
  let server;
  const childApps=new Map();
  function localApp(space,create=false){
    if(childApps.has(space))return childApps.get(space);
    const directory=localSpaceDirectory(store.directory,space,{create});
    if(!directory||(!create&&!existsSync(path.join(directory,'hither.sqlite'))))throw new HttpError(404,'尚未创建此空间，请从设置进入。','space_missing');
    const app=createApp({dataDir:directory,seed:isExampleSpace(space),seedLocale:space===US_SPACE?'en':'zh-CN',executionPolicy:isExampleSpace(space)?'showcase':'personal',runCodex,runImCli,runResourceCli,scheduler,chooseDirectory,computerInfo:{codexAvailable:computer.codexAvailable,codexVersion:computer.codexVersion},distDir,modelFetch,remoteTransport,developmentRoot,officePreviewOptions,imSetupOptions,_allowDemoSpace:false,_parentPort:()=>server.address()?.port,_protectedDataDirectory:store.protectedDataDirectory,_updateLifecycle:updateLifecycle});
    childApps.set(space,app);return app;
  }
  function guard(req) {
    const ports=new Set([String(server.address()?.port??58645),'58645','58644',String(_parentPort?.()??'')]);
    let host;try{host=new URL(`http://${req.headers.host}`);}catch{throw new HttpError(403,'无效本机请求','origin_denied');}
    if(!['127.0.0.1','localhost','[::1]'].includes(host.hostname)||!ports.has(host.port))throw new HttpError(403,'仅接受本机应用请求','origin_denied');
    if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'不接受跨站请求','origin_denied');
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{throw new HttpError(403,'来源无效','origin_denied');}if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||!ports.has(origin.port))throw new HttpError(403,'来源不在本机应用范围','origin_denied');}
  }
  async function route(req,res) {
    guard(req);
    const url=new URL(req.url,'http://127.0.0.1');let parts;try{parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);}catch{throw new HttpError(400,'路径格式无效');}
    if(parts[0]==='api'&&parts[1]==='spaces'){
      if(!_allowDemoSpace)throw new HttpError(404,'接口不存在','not_found');
      if(parts.length===2&&req.method==='GET')return respond(res,200,{spaces:[{id:'main',name:store.meta('profile').name,kind:'original'},...[{id:PERSONAL_SPACE,name:'我的真实空间',kind:'personal'},{id:ENGINEER_SPACE,name:'万叶的工作与生活',kind:'fictional'},{id:US_SPACE,name:'Caspian’s work and life',kind:'fictional'},{id:LEGACY_ENGINEER_SPACE,name:'旧版中文示例',kind:'legacy'}].map(space=>{const dir=localSpaceDirectory(store.directory,space.id);return {...space,exists:!!dir&&existsSync(path.join(dir,'hither.sqlite'))};})]});
      if(![ENGINEER_SPACE,US_SPACE,LEGACY_ENGINEER_SPACE,PERSONAL_SPACE].includes(parts[2]))throw new HttpError(404,'空间不存在','space_not_found');
      if(parts.length===3&&req.method==='POST'){
        await readJson(req);const app=localApp(parts[2],true);
        return respond(res,200,{id:parts[2],name:parts[2]===PERSONAL_SPACE?'我的真实空间':parts[2]===US_SPACE?'Caspian’s work and life':parts[2]===LEGACY_ENGINEER_SPACE?'旧版中文示例':'万叶的工作与生活',href:`/?space=${parts[2]}`,profile:app.store.meta('profile')});
      }
      if(parts.length>=4){
        const app=localApp(parts[2]);req.url='/api/'+parts.slice(3).map(encodeURIComponent).join('/')+url.search;
        return app.handleRequest(req,res);
      }
      throw new HttpError(405,'空间不支持该操作');
    }
    if(parts[0]!=='api'){
      if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError(405,'方法不支持');
      const requested=path.resolve(distDir,'.'+url.pathname);if(requested!==distDir&&!requested.startsWith(distDir+path.sep))throw new HttpError(403,'路径超出范围');
      let file=existsSync(requested)&&statSync(requested).isFile()?requested:path.join(distDir,'index.html');
      if(!existsSync(file))return respond(res,200,{name:'Hither',message:'后端已启动。开发界面位于 http://127.0.0.1:58644；构建后可在此打开桌面界面。'});
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'}[path.extname(file)]??'application/octet-stream';
      const data=readFileSync(file);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(req.method==='HEAD'?undefined:data);
    }
    const [,resource,key,action]=parts,method=req.method;
    if(resource==='development'){
      if(method!=='GET')throw new HttpError(405,'构建记录仅支持本机读取。','development_read_only');
      if(parts.length===3&&key==='review')return respond(res,200,development.review());
      if(parts.length===3&&key==='documents')return respond(res,200,development.document(url.searchParams.get('path')));
      throw new HttpError(404,'构建记录接口不存在。','not_found');
    }
    const avatarUpload=resource==='agents'&&action==='avatar'&&method==='POST';
    const profileUpload=resource==='profile'&&method==='PUT';
    const artworkUpload=resource==='settings'&&key==='artwork'&&parts.length===3&&method==='PUT';
    const binaryArtifactUpload=resource==='artifacts'&&!key&&method==='POST';
    const attachmentUpload=resource==='attachments'&&!key&&parts.length===2&&method==='POST';
    const body=['POST','PUT','PATCH','DELETE'].includes(method)?await readJson(req,binaryArtifactUpload?BINARY_ARTIFACT_JSON_LIMIT:attachmentUpload?Math.ceil(ATTACHMENT_LIMIT/3)*4+4096:artworkUpload?12*1024*1024:(avatarUpload||profileUpload)?4*1024*1024+4096:2*1024*1024):{};
    if(profileUpload&&!Object.hasOwn(body,'avatarDataUrl')&&Buffer.byteLength(JSON.stringify(body))>2*1024*1024)throw new HttpError(413,'请求内容过大','body_too_large');
    guardExecutionRoute(policy,{resource,key,action,operation:parts[4],method,body},store);
    if(resource==='computers')return respond(res,200,await remoteComputers.owner(method,parts.slice(2),body));
    if(resource==='delegations')return respond(res,200,await delegations.owner(method,parts.slice(2),body));
    if(resource==='model-catalogue'&&parts.length===2&&method==='POST')return respond(res,200,await discoverModels(catalogueSettings(body),body.apiKey,{fetchImpl:modelFetch}));
    if(resource==='attachments'){
      if(attachmentUpload)return respond(res,201,saveAttachment(store,body));
      if(key&&parts.length===3&&['GET','HEAD'].includes(method)){
        const attachment=getAttachment(store,key),filename=encodeURIComponent(attachment.name).replaceAll("'",'%27');
        res.writeHead(200,{'Content-Type':attachment.kind==='image'?attachment.mime:'application/octet-stream','Content-Length':attachment.size,'Content-Disposition':`${attachment.kind==='image'?'inline':'attachment'}; filename*=UTF-8''${filename}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; sandbox"});
        return res.end(method==='HEAD'?undefined:attachment.data);
      }
      throw new HttpError(405,'附件仅支持本地添加和读取。','attachment_method_not_allowed');
    }
    if(resource==='avatars'&&key&&['GET','HEAD'].includes(method)){const image=getAvatar(store,key);res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(method==='HEAD'?undefined:image.data);}
    if(avatarUpload)return respond(res,200,saveAgentAvatar(store,key,body));
    if(resource==='health'&&method==='GET')return respond(res,200,{application:'hither-desktop',version:VERSION,revision:runtimeRevision,status:'ok',spaceId});
    if(resource==='bootstrap'&&method==='GET')return respond(res,200,bootstrap());
    if(resource==='daily-activity'&&method==='GET')return respond(res,200,dailyActivity(store));
    if(resource==='imports'&&key==='memory'&&method==='POST'&&parts.length===4){
      if(action==='preview')return respond(res,200,previewMemoryImport(store,body));
      if(action==='commit')return respond(res,200,commitMemoryImport(store,body));
      if(action==='review')return respond(res,200,reviewMemoryImport(store,body));
    }
    if(resource==='im-setup'){
      if(parts.length>4)throw new HttpError(404,'接口不存在。','not_found');
      const result=await imSetup.handle({method,key,action,body});return respond(res,result.status,result.data);
    }
    if(resource==='digital-twin'&&key==='mcp-grants'){
      if(method==='GET'&&parts.length===3)return respond(res,200,policy==='showcase'?[]:twinMcpGrants.list());
      if(policy==='showcase')throw new HttpError(403,'请在个人空间中创建外部 AI 授权。','showcase_read_only');
      if(method==='POST'&&parts.length===3)return respond(res,201,twinMcpGrants.create(body));
      if(method==='PUT'&&parts.length===4)return respond(res,200,twinMcpGrants.setEnabled(action,body));
      throw new HttpError(405,'授权不支持该操作。','mcp_grant_method');
    }
    if(resource==='digital-twin'&&parts.length===3){
      if(key==='export'&&method==='GET'){
        const format=url.searchParams.get('format')??'json';
        if(!['json','markdown'].includes(format))throw new HttpError(400,'导出格式须为 json 或 markdown。','memory_export_format');
        const data=digitalTwinPackage(store);
        return respond(res,200,format==='markdown'?digitalTwinMarkdown(data):data,{'Content-Type':format==='markdown'?'text/markdown; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="secondu-digital-twin.${format==='markdown'?'md':'json'}"`});
      }
      if(key==='context'&&method==='POST')return respond(res,200,digitalTwinContext(store,body));
    }
    if(resource==='imports'&&key==='activity'&&method==='POST'){
      if(action==='preview')return respond(res,200,previewActivityImport(store,body));
      if(action==='commit')return respond(res,200,commitActivityImport(store,body.previewId));
    }
    if(resource==='runtime'&&key==='capabilities'&&method==='GET')return respond(res,200,runtimeCapabilities(store,computer));
    if(resource==='export'&&method==='GET'){
      const data=bootstrap();data.settings={...store.meta('settings'),hasKey:false};delete data.settings.keyHint;delete data.settings.lastTest;data.modelConnections=store.connectionList().map(({keyHint,lastTest,...connection})=>({...connection,hasKey:false}));data.connectors=data.connectors.map(({lastTest,...connector})=>({...connector,hasToken:false}));delete data.computer;
      return respond(res,200,{exportVersion:1,exportedAt:now(),...data,taskFeedback:store.list('taskFeedback')},{'Content-Disposition':'attachment; filename="hither-export.json"'});
    }
    if(resource==='profile'&&method==='PUT')return respond(res,200,saveProfile(store,body));
    if(resource==='imports'&&key==='chat'&&method==='POST'){
      if(action==='preview')return respond(res,200,previewChatImport(store,body));
      if(action==='commit'){const result=commitChatImport(store,body.previewId);if(!result.alreadyImported)runner.sourceImported(store.require('sources',result.sourceId));return respond(res,200,result);}
    }
    if(resource==='goal-lists'){
      if(method==='GET'&&!action)return respond(res,200,key?store.require('goalLists',key):store.list('goalLists'));
      if(method==='POST'&&!key)return respond(res,201,store.put('goalLists',createEntity(store,'goalLists',body)));
      if(method==='PUT'&&key&&!action)return respond(res,200,store.put('goalLists',createEntity(store,'goalLists',body,store.require('goalLists',key))));
      if(method==='DELETE'&&key&&!action){assertDeletable(store,'goalLists',key);store.delete('goalLists',key);return respond(res,200,{deleted:true});}
      throw new HttpError(405,'清单不支持该操作。');
    }
    if(resource==='agent-resources'){
      if(method==='GET'&&!key)return respond(res,200,resources.list(url.searchParams.get('agentId')??undefined));
      if(method==='GET'&&key&&!action)return respond(res,200,resources.get(key));
      if(method==='POST'&&!key)return respond(res,201,resources.save(body));
      if(method==='PUT'&&key&&!action)return respond(res,200,resources.save(body,key));
      if(method==='POST'&&key&&action==='probe')return respond(res,200,await resources.probe(key));
      if(method==='POST'&&key&&action==='enabled')return respond(res,200,resources.setEnabled(key,body));
      if(method==='POST'&&key&&action==='check-permission')return respond(res,200,resources.checkPermission(key,body));
      throw new HttpError(405,'身份资源不支持该操作。');
    }
    if(resource==='im-connections'){
      if(method==='GET'&&!key)return respond(res,200,im.list());
      if(method==='POST'&&!key)return respond(res,201,im.save(body));
      if(method==='PUT'&&key&&!action)return respond(res,200,im.save(body,store.require('imConnections',key)));
      if(method==='POST'&&key&&action==='probe')return respond(res,200,await im.probe(key));
      if(method==='POST'&&key&&action==='preview')return respond(res,200,await im.preview(key));
      if(method==='POST'&&key&&action==='commit')return respond(res,200,im.commit(key,body.previewId));
      if(method==='POST'&&key&&action==='drafts')return respond(res,201,im.draft(key,body));
      throw new HttpError(405,'通信连接不支持该操作。');
    }
    if(resource==='im-outbox'){
      if(method==='GET'&&!key)return respond(res,200,im.drafts(url.searchParams.get('connectionId')));
      if(method==='POST'&&key&&action==='prepare')return respond(res,200,im.prepare(key));
      if(method==='POST'&&key&&action==='send')return respond(res,200,await im.send(key,body));
      throw new HttpError(405,'发送记录不支持该操作。');
    }
    if(resource==='connectors'){
      if(key&&action==='oauth'&&parts.length===5){
        const operation=parts[4];
        if(method==='POST'&&operation==='start')return respond(res,200,await connectors.oauth.start(key));
        if(method==='GET'&&operation==='status'){const result=connectors.oauth.status(key,url.searchParams.get('attemptId'));return respond(res,200,{...result,...(result.status==='connected'?{connector:publicConnector(store,store.require('connectors',key))}:{})});}
        if(method==='POST'&&operation==='disconnect'){connectors.oauth.disconnect(key);return respond(res,200,publicConnector(store,store.require('connectors',key)));}
        if(method==='POST'&&operation==='revoke'){await connectors.oauth.revoke(key);return respond(res,200,publicConnector(store,store.require('connectors',key)));}
        if(method==='POST'&&operation==='refresh'){await connectors.oauth.refresh(key);return respond(res,200,publicConnector(store,store.require('connectors',key)));}
        throw new HttpError(405,'OAuth 不支持该操作。');
      }
      if(method==='GET'&&!action)return respond(res,200,key?publicConnector(store,store.require('connectors',key)):connectors.list());
      if(method==='POST'&&!key)return respond(res,201,saveConnector(store,body));
      if(method==='PUT'&&key&&!action){const result=saveConnector(store,body,store.require('connectors',key));connectors.oauth.invalidate(key);return respond(res,200,result);}
      if(method==='DELETE'&&key&&!action){const result=deleteConnector(store,key);connectors.oauth.invalidate(key);return respond(res,200,result);}
      if(method==='POST'&&key&&action==='test'){
        const controller=new AbortController(),cancel=()=>{if(!res.writableFinished)controller.abort();};res.once('close',cancel);
        try{const result=await connectors.test(key,{signal:controller.signal});return respond(res,result.stale?409:200,result);}
        finally{res.off('close',cancel);}
      }
      throw new HttpError(405,'连接器不支持该操作。');
    }
    if(resource==='agent-rooms'){
      if(method==='PUT'&&key&&action==='reactions'&&parts.length===4)return respond(res,200,saveRoomReaction(store,key,body));
      if(method==='GET'&&!action)return respond(res,200,key?store.require('agentRooms',key):store.list('agentRooms'));
      if(method==='POST'&&!key)return respond(res,201,createRoom(store,body));
      if(method==='PUT'&&key&&!action)return respond(res,200,createRoom(store,body,store.require('agentRooms',key)));
      if(method==='POST'&&['messages','tasks'].includes(action))return respond(res,201,roomTask(store,runner,key,body,{send:action==='messages'}));
      throw new HttpError(405,'会话历史保留，不支持该操作。');
    }
    if(resource==='settings'&&key==='execution'&&parts.length===3){
      if(method==='GET')return respond(res,200,executionSettings(store));
      if(method==='PUT')return respond(res,200,saveExecutionSettings(store,body));
    }
    if(resource==='settings'&&key==='appearance'&&parts.length===3){
      if(method==='GET')return respond(res,200,getAppearance(store));
      if(method==='PUT')return respond(res,200,saveAppearance(store,body));
      throw new HttpError(405,'外观设置不支持该操作');
    }
    if(resource==='settings'&&key==='artwork'){
      if(method==='GET'&&action==='info'&&parts.length===4)return respond(res,200,getArtworkInfo(store));
      if(parts.length!==3)throw new HttpError(404,'接口不存在','not_found');
      if(method==='PUT')return respond(res,200,saveArtwork(store,body));
      if(method==='GET'){
        const artwork=getArtwork(store);
        res.writeHead(200,{'Content-Type':artwork.mime,'Content-Length':artwork.bytes,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
        return res.end(artwork.data);
      }
      throw new HttpError(405,'自定义图片不支持该操作');
    }
    if(resource==='model-connections') {
      if(method==='GET'&&!action)return respond(res,200,key?store.publicConnection(store.connection(key)):{connections:store.connectionList(),defaultConnectionId:store.defaultConnectionId()});
      if(method==='POST'&&!key)return respond(res,201,saveConnection(store,body));
      if(method==='PUT'&&key&&!action)return respond(res,200,saveConnection(store,body,store.connection(key)));
      if(method==='DELETE'&&key&&!action)return respond(res,200,deleteConnection(store,key,runner));
      if(method==='POST'&&action==='default')return respond(res,200,setDefaultConnection(store,key));
      if(method==='GET'&&action==='models'){const connection=store.connection(key),apiKey=store.getKey(connection);return respond(res,200,await discoverModels(connection,apiKey,{fetchImpl:modelFetch}));}
      if(method==='POST'&&action==='test'){const result=await testConnection(store,key,{cleanError:message=>runner.cleanError(message),fetchImpl:modelFetch});return respond(res,result.status,result.value);}
      throw new HttpError(405,'模型连接不支持该操作');
    }
    if(resource==='settings'&&key==='provider') {
      if(method==='GET'&&!action)return respond(res,200,store.settings());
      if(method==='PUT'&&!action)return respond(res,200,saveConnection(store,body,store.connection()));
      if(action==='test'&&method==='POST'){const defaultId=store.defaultConnectionId(),result=await testConnection(store,defaultId,{defaultId,cleanError:message=>runner.cleanError(message),fetchImpl:modelFetch});return respond(res,result.status,result.value);}
    }
    if(resource==='task-feedback'&&key&&method==='GET')return respond(res,200,feedbackRecord(store,key));
    if(resource==='tasks') {
      if(key&&store.get('tasks',key)?.remoteExecution){
        if(method==='GET'&&action==='remote')return respond(res,200,{run:remoteTasks.runForTask(key)});
        if(method==='POST'&&['approval','cancel','poll'].includes(action))return respond(res,200,await remoteTasks.control(key,action,body));
        if(method==='PUT'&&!action&&Object.keys(body).some(field=>!['title','archived'].includes(field)))throw new HttpError(409,'远端任务保留启动时的配置，请从电脑设置创建新任务。','remote_task_config_fixed');
      }
      if(method==='GET'&&action==='context')return respond(res,200,personalContextFor(store,store.require('tasks',key)));
      if(method==='GET'&&action==='feedback')return respond(res,200,taskFeedback(store,key));
      if(method==='POST'&&action==='feedback')return respond(res,201,saveTaskFeedback(store,key,body));
      if(method==='PUT'&&action==='reaction')return respond(res,200,saveTaskReaction(store,key,body));
      if(method==='GET'&&action==='trace')return respond(res,200,taskTrace(store.require('tasks',key)));
      if(method==='POST'&&!key)return respond(res,201,createTask(store,body));
      if(method==='POST'&&action==='revise')return respond(res,201,reviseTaskMessage(store,runner,key,body));
      if(method==='POST'&&action==='run')return respond(res,200,runner.start(key));
      if(method==='POST'&&action==='message')return respond(res,200,runner.message(key,body.content,body.attachmentIds));
      if(method==='POST'&&action==='cancel')return respond(res,200,await runner.cancel(key));
      if(method==='POST'&&action==='approval')return respond(res,200,runner.decide(key,body.approvalId,body.decision));
      if(method==='PUT'&&key&&!action){
        const task=store.require('tasks',key);
        if(runner.active.has(key)||['running','awaiting_approval'].includes(task.status))throw new HttpError(409,'请先停止任务再编辑其配置','task_active');
        if(Object.hasOwn(body,'projectId')&&body.projectId!==task.projectId)throw new HttpError(409,'已有任务不能更换项目，请在目标项目新建对话。','task_project_fixed');
        const oldRuntimeConfig=JSON.stringify([task.mode,task.connectionId,task.digitalTwinEnabled,task.connectorIds??[],task.contextRequest,task.approvalMode]);
        if(Object.hasOwn(body,'approvalMode'))task.approvalMode=approvalMode(body.approvalMode,{nullable:true});
        if(body.archived!==undefined)task.archived=bool(body.archived,'archived');
        if(body.title!==undefined)task.title=text(body.title,'title',300);
        if(body.contextRequest!==undefined)task.contextRequest=normalizeContextRequest(body.contextRequest);
        if(body.contextFactIds!==undefined)task.contextFactIds=refs(store,body.contextFactIds,'facts','contextFactIds');
        if(body.agentIds!==undefined)task.agentIds=refs(store,body.agentIds,'agents','agentIds');
        if(body.mode!==undefined)task.mode=choice(body.mode,['live','demo'],'mode');
        if(Object.hasOwn(body,'connectionId')){
          if(body.connectionId===null||body.connectionId==='')delete task.connectionId;
          else {task.connectionId=text(body.connectionId,'connectionId',200);store.connection(task.connectionId);}
        }
        if(body.digitalTwinEnabled!==undefined)task.digitalTwinEnabled=bool(body.digitalTwinEnabled,'digitalTwinEnabled');
        if(body.connectorIds!==undefined)task.connectorIds=connectorSelection(store,body.connectorIds);
        const runtimeChanged=oldRuntimeConfig!==JSON.stringify([task.mode,task.connectionId,task.digitalTwinEnabled,task.connectorIds??[],task.contextRequest,task.approvalMode]);
        task.updatedAt=now();
        store.transaction(()=>{
          if(runtimeChanged){
            delete task.threadId;delete task.contextUsage;
            for(const record of store.list('runtime'))if(record.id.startsWith(`${task.id}:`))store.delete('runtime',record.id);
          }
          store.put('tasks',task);
        });
        return respond(res,200,task);
      }
    }
    if(resource==='agents'&&key==='avatar-style'&&method==='PUT')return respond(res,200,batchAvatarStyle(store,body));
    if(resource==='projects'){
      if(key==='choose-directory'&&!action){
        if(method!=='POST')throw new HttpError(405,'方法不支持');
        if(Object.keys(body).length)throw new HttpError(400,'文件夹选择不接受路径或命令参数。','invalid_picker_request');
        const controller=new AbortController();const cancel=()=>{if(!res.writableFinished)controller.abort();};res.once('close',cancel);
        try{return respond(res,200,{path:await chooseDirectory({signal:controller.signal})});}finally{res.removeListener('close',cancel);}
      }
      if(method==='GET'&&key&&action==='files')return respond(res,200,listProjectFiles(store,key,url.searchParams.get('path')??''));
      if(action)throw new HttpError(404,'项目接口不存在','not_found');
      if(method==='DELETE')throw new HttpError(405,'项目保留任务和文件引用，请使用归档而非删除。','archive_project');
      if(method==='GET')return respond(res,200,key?publicProject(store.require('projects',key),store.protectedDataDirectory):store.list('projects').map(project=>publicProject(project,store.protectedDataDirectory)));
      if(method==='PUT'&&key&&[...runner.active.keys()].some(id=>store.require('tasks',id).projectId===key))throw new HttpError(409,'项目正在执行任务，请结束或中断后再修改项目。','project_active');
      if(method==='POST'&&!key||method==='PUT'&&key){const project=createEntity(store,'projects',body,key?store.require('projects',key):undefined);store.put('projects',project);return respond(res,method==='POST'?201:200,publicProject(project,store.protectedDataDirectory));}
    }
    if(resource==='artifacts'){
      if(method==='GET'&&action==='preview'&&parts.length===4){const data=await previewOffice(key,url.searchParams.get('version'));res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':data.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});return res.end(data);}
      if(method==='PUT'&&key&&!action){const old=store.require('artifacts',key);if(isBinaryArtifact(old))throw new HttpError(409,'图片、PDF 和 Office 产物只读，请在原任务中生成新版本。','binary_artifact_read_only');if(runner.active.has(old.taskId)&&store.require('tasks',old.taskId).mode==='live')throw new HttpError(409,'请先中断模型执行，再编辑这份产物，避免模型同时写入。','task_active');if(body.baseVersion!==old.version)throw new HttpError(409,'文件已被更新，请刷新后再保存','version_conflict');if(store.require('tasks',old.taskId).projectId){runner.ensureProjectReady(store.require('tasks',old.taskId));const file=store.artifactPath(old);if(!existsSync(file)||readFileSync(file,'utf8')!==old.content)throw new HttpError(409,'项目文件已在其他位置修改，请先核对当前文件，不能覆盖。','version_conflict');if([...runner.active.keys()].some(id=>store.require('tasks',id).projectId===store.require('tasks',old.taskId).projectId))throw new HttpError(409,'项目正在执行任务，请先中断后再编辑文件。','project_active');}text(body.content,'content',1024*1024,false);const content=body.content,version=old.version+1,stamp=now();const artifact={...old,classification:'artifact',origin:{kind:'user'},content,version,updatedAt:stamp,versions:[...old.versions,{version,content,createdAt:stamp,author:'用户'}]};store.writeArtifact(artifact);runner.event(old.taskId,'artifact_edited',`用户编辑了 ${old.name}`,`版本 ${version}`);return respond(res,200,artifact);}
      if(method==='POST'&&!key){const task=store.require('tasks',body.taskId);if(runner.active.has(task.id))throw new HttpError(409,'执行中暂不能新增同名产物');runner.ensureProjectReady(task);const name=text(body.name,'name',200);text(body.content??'','content',binaryArtifactMime(name)?BINARY_ARTIFACT_JSON_LIMIT:1024*1024,false);const content=body.content??'';if(store.list('artifacts').some(a=>a.taskId===task.id&&a.name===name))throw new HttpError(409,'同名产物已存在');return respond(res,201,runner.saveArtifact(task.id,name,content,'用户'));}
      if(method==='GET'&&action==='download'){if(url.searchParams.getAll('version').length>1)throw new HttpError(400,'请指定唯一产物版本。','invalid_artifact_version');const artifact=artifactAtVersion(store.require('artifacts',key),url.searchParams.get('version')),{data,mime}=artifactBytes(artifact);res.writeHead(200,{'Content-Type':mime,'Content-Length':data.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,'X-Artifact-Version':String(artifact.version),'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(data);}
    }
    if(resource==='automations'&&method==='POST'&&action==='run')return respond(res,200,runner.runAutomation(key));
    if(collections.includes(resource) && resource!=='agentRooms' && !action){
      if(resource==='sources'&&method==='PUT')throw new HttpError(405,'来源原文不可覆盖。请导入一份新的反馈来源，并在认知修订中关联它。','immutable_source');
      if(resource==='conversations'&&method==='PUT'&&store.require('conversations',key).externalId)throw new HttpError(405,'导入的聊天记录不可改写，请保留原文件并导入新的反馈来源。','immutable_import');
      if(method==='GET')return respond(res,200,key?store.require(resource,key):store.list(resource));
      if(method==='DELETE'&&key){
        if(resource==='sources'&&store.list('dailyActivities').some(activity=>activity.sourceIds.includes(key)))throw new HttpError(409,'日常活动仍引用这份原始来源，不能删除。','record_in_use');
        assertDeletable(store,resource,key);
        if(resource==='tasks'){
          if(runner.active.has(key))throw new HttpError(409,'请先停止运行中的任务');
          const task=store.require('tasks',key);for(const aid of task.artifactIds){const a=store.get('artifacts',aid);if(a){if(!task.projectId){const file=store.artifactPath(a);if(existsSync(file))unlinkSync(file);}store.delete('artifacts',aid);}}
        }
        if(resource==='artifacts'){const a=store.require('artifacts',key);if(store.require('tasks',a.taskId).projectId)throw new HttpError(405,'项目原文件不会从资料库删除，请在项目目录中管理。','project_file_retained');if(runner.active.has(a.taskId))throw new HttpError(409,'请先停止运行中的任务');const file=store.artifactPath(a);if(existsSync(file))unlinkSync(file);runner.mutate(a.taskId,t=>{t.artifactIds=t.artifactIds.filter(x=>x!==key);});}
        store.delete(resource,key);return respond(res,200,{ok:true});
      }
      if(method==='POST'&&!key || method==='PUT'&&key){const entity=createEntity(store,resource,body,key?store.require(resource,key):undefined);store.put(resource,entity);if(resource==='sources'&&method==='POST')runner.sourceImported(entity);return respond(res,method==='POST'?201:200,entity);}
    }
    throw new HttpError(404,'接口不存在','not_found');
  }
  const requestError=(error,res)=>{if(!res.headersSent)respond(res,error.status??500,{error:error.code==='app_quit_pending'?error.message:runner.cleanError(error.status?error.message:'本机服务遇到错误，请检查运行日志。'),code:error.code??'internal_error'});if(!error.status)console.error('[hither]',runner.cleanError(error.stack??error.message));};
  const handleRequest=(req,res)=>updateLifecycle.runRequest(req,()=>route(req,res).catch(error=>requestError(error,res))).catch(error=>requestError(error,res));
  server=http.createServer(handleRequest);
  server.requestTimeout=30000;server.headersTimeout=10000;
  let closing;
  return {server,store,runner,connectors,delegations,remoteComputers,remoteTasks,bootstrap,handleRequest,updateLifecycle,close(){return closing??=(async()=>{for(const app of childApps.values())await app.close();await connectors.close();await imSetup.close();remoteComputers.close();await runner.close();await delegations.close();if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));store.close();if(!_updateLifecycle)updateLifecycle.dispose();})();}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp({executionPolicy:'auto'});const port=Number(process.env.PORT??58645);
  installQuitIpc(app);
  app.server.listen(port,'127.0.0.1',()=>console.log(`Hither ${VERSION} listening on http://127.0.0.1:${port}`));
  app.server.on('error',error=>{console.error(`Hither startup failed: ${error.code??error.message}`);process.exitCode=1;app.close();});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0));});
}
