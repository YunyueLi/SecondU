import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, id, now } from './store.mjs';
import { delegationPurposes, delegationTerminalStates } from '../shared/delegation.mjs';
import { assertDelegationModel, delegationModelBinding, runDelegationText } from './delegation-model.mjs';
import { delegationPage } from './delegation-page.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400,code='delegation_invalid')=>{throw new HttpError(status,message,code);};
const string=(value,name,max,optional=false)=>{if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))fail(`${name}无效或过长。`);return value.trim();};
const integer=(value,min,max,name)=>{if(!Number.isInteger(value)||value<min||value>max)fail(`${name}超出范围。`);return value;};
const expiration=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||Date.parse(value)<=Date.now()||Date.parse(value)>Date.now()+366*86400000)fail('有效期须在未来一年内。');return new Date(value).toISOString();};
const terminal=call=>delegationTerminalStates.includes(call.task.status.state);
const publicGrant=({tokenHash,...value})=>value;
const rpcError=(code,message)=>Object.assign(new Error(message),{rpcCode:code});
const reply=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',...headers});res.end(JSON.stringify(value));};

function draftValue(body) {
  const purposes=body.purposes;
  if(!Array.isArray(purposes)||!purposes.length||purposes.length>4||new Set(purposes).size!==purposes.length||purposes.some(p=>!Object.hasOwn(delegationPurposes,p)))fail('请明确选择服务用途。');
  if(!['every_call','automatic'].includes(body.approvalPolicy))fail('调用审批方式无效。');
  return {name:string(body.name,'名字',80),description:string(body.description,'能力简介',500),instructions:string(body.instructions,'工作说明',6000),approvedContext:string(body.approvedContext??'','已授权上下文',12000,true),serviceRules:string(body.serviceRules,'服务规则',3000),purposes,approvalPolicy:body.approvalPolicy,connectionId:string(body.connectionId,'模型连接',100),expiresAt:expiration(body.expiresAt),maxCalls:integer(body.maxCalls,1,1000,'调用次数'),maxInputChars:integer(body.maxInputChars,100,12000,'请求长度'),maxOutputTokens:integer(body.maxOutputTokens,128,4096,'输出长度')};
}

export class DelegationService {
  constructor(store,{executionPolicy,resolveKey=settings=>store.getKey(settings),requestGate=(_req,work)=>work()}={}) {
    this.store=store;this.policy=executionPolicy;this.resolveKey=resolveKey;this.active=new Map();this.closed=false;this.serviceError='';this.requestGate=requestGate;
    for(const call of store.list('delegationCalls'))if(['TASK_STATE_WORKING','TASK_STATE_SUBMITTED'].includes(call.task.status.state))this.finish(call,'TASK_STATE_FAILED','应用上次运行已中断；本次调用不会自动重试。');
    if(this.policy!=='showcase'&&store.list('delegations').some(item=>item.status==='published'))void this.start().catch(()=>{});
  }
  async start() {
    if(this.closed)fail('能力服务已停止。',503);
    if(this.server?.listening)return;
    if(this.starting)return this.starting;
    const port=this.store.get('meta','delegationPort')?.value??0;
    this.server=http.createServer((req,res)=>void this.requestGate(req,()=>this.publicRequest(req,res)).catch(error=>reply(res,error.status??500,{error:error.status?error.message:'能力服务遇到错误。',...(error.code?{code:error.code}:{})})));
    this.server.requestTimeout=65000;this.server.headersTimeout=10000;
    this.starting=new Promise((resolve,reject)=>{
      const onError=error=>{this.serviceError=error.code==='EADDRINUSE'?'能力服务端口已被占用，请关闭占用程序后重试。':'能力服务未能启动。';reject(new HttpError(503,this.serviceError));};
      this.server.once('error',onError);
      this.server.listen(port,'127.0.0.1',()=>{this.server.off('error',onError);this.store.setMeta('delegationPort',this.server.address().port);this.serviceError='';resolve();});
    }).finally(()=>{this.starting=undefined;});
    return this.starting;
  }
  origin(){return this.server?.listening?`http://127.0.0.1:${this.server.address().port}`:null;}
  share(key){return this.store.require('delegations',key);}
  events(shareId,type,details={}){this.store.put('delegationEvents',{id:id('delegation-event'),shareId,type,at:now(),...details});}
  list() {
    const shares=this.store.list('delegations').map(share=>({...share,grants:this.store.list('delegationGrants').filter(g=>g.shareId===share.id).map(publicGrant),calls:this.store.list('delegationCalls').filter(c=>c.shareId===share.id).map(({snapshot,inputHash,...call})=>call)}));
    return {delegations:shares,service:{status:this.server?.listening?'running':this.starting?'starting':this.serviceError?'unavailable':'idle',origin:this.origin(),error:this.serviceError||undefined,scope:'this_device'},connections:this.store.connectionList(),readOnly:this.policy==='showcase'};
  }
  async owner(method,parts=[],body={}) {
    if(method==='GET'&&!parts.length)return this.list();
    if(this.policy==='showcase')fail('请切换到自己的空间配置能力分享。',403,'showcase_readonly');
    if(this.closed)fail('能力服务已停止。',503);
    const [key,action,childId,operation]=parts;
    if(method==='POST'&&!key) {
      if(this.store.list('delegations').length>=100)fail('能力数量已达本地上限。');
      const draft=draftValue(body);this.store.connection(draft.connectionId);
      const share={id:id('delegation'),originAgentId:string(body.originAgentId??'hither','来源助理',100),draft,draftRevision:1,version:0,status:'draft',createdAt:now(),updatedAt:now()};
      this.store.put('delegations',share);this.events(share.id,'created');return share;
    }
    if(!key)fail('能力接口不存在。',404);
    const share=this.share(key);
    if(method==='PUT'&&parts.length===1) {
      if(body.expectedRevision!==share.draftRevision)fail('能力已更新，请刷新后再保存。',409);
      const draft=draftValue(body);this.store.connection(draft.connectionId);
      const saved={...share,draft,draftRevision:share.draftRevision+1,updatedAt:now()};this.store.put('delegations',saved);this.events(key,'draft_updated');return saved;
    }
    if(method==='POST'&&action==='publish'&&parts.length===2) {
      if(body.expectedRevision!==share.draftRevision||body.contextApproved!==true||body.rulesApproved!==true)fail('请核对并明确授权当前版本的上下文与规则。',409);
      if(share.draft.approvalPolicy==='automatic'&&body.automaticApproved!==true)fail('自动调用需要本人明确授权。');
      expiration(share.draft.expiresAt);
      const settings=this.store.connection(share.draft.connectionId),keyValue=await this.resolveKey(settings);
      if(!keyValue)fail('请先为此能力连接模型。',409,'delegation_key_required');
      if(share.draftRevision!==this.share(key).draftRevision)fail('核对期间内容已改变，请刷新。',409);
      await this.start();
      const current=this.share(key);if(current.draftRevision!==share.draftRevision||current.version!==share.version||current.status!==share.status)fail('发布期间能力已改变，请刷新后重试。',409);
      if(JSON.stringify(delegationModelBinding(this.store.connection(settings.id)))!==JSON.stringify(delegationModelBinding(settings)))fail('发布期间模型已改变，请重新核对。',409);
      this.invalidate(key,'能力已更新，旧授权已撤销。');
      const snapshot={...share.draft,version:share.version+1,connection:delegationModelBinding(settings)};
      const saved={...share,status:'published',version:snapshot.version,snapshot,publishedDraftRevision:share.draftRevision,publishedAt:now(),updatedAt:now()};
      this.store.put('delegations',saved);this.events(key,'published',{version:snapshot.version});return saved;
    }
    if(method==='POST'&&action==='revoke'&&parts.length===2){this.invalidate(key,'本人已撤销此能力。');const saved={...share,status:'revoked',updatedAt:now()};this.store.put('delegations',saved);this.events(key,'revoked');return saved;}
    if(method==='POST'&&action==='grants'&&parts.length===2) {
      this.assertPublished(share);await this.start();
      const current=this.share(key);this.assertPublished(current);if(current.version!==share.version)fail('能力版本已改变，请刷新后创建授权。',409);
      const token=randomBytes(32).toString('base64url'),expiresAt=expiration(body.expiresAt);
      if(Date.parse(expiresAt)>Date.parse(share.snapshot.expiresAt))fail('接收者授权不能超过能力有效期。');
      const purposes=body.purposes;if(!Array.isArray(purposes)||!purposes.length||purposes.some(p=>!share.snapshot.purposes.includes(p)))fail('接收者用途超出已发布能力。');
      if(typeof body.allowCalls!=='boolean')fail('请明确接收者调用权限。');
      const grant={id:id('grant'),shareId:key,version:share.version,label:string(body.label,'接收者备注',100),purposes:[...new Set(purposes)],allowCalls:body.allowCalls,maxCalls:integer(body.maxCalls,1,share.snapshot.maxCalls,'接收者调用次数'),usedCalls:0,expiresAt,createdAt:now(),revokedAt:null,tokenHash:hash(token)};
      this.store.put('delegationGrants',grant);this.events(key,'grant_created',{grantId:grant.id});
      return {grant:publicGrant(grant),url:`${this.origin()}/share/${key}#access=${token}`,token,cardUrl:`${this.origin()}/share/${key}/.well-known/agent-card.json`,rpcUrl:`${this.origin()}/a2a/${key}`};
    }
    if(method==='POST'&&action==='grants'&&childId&&operation==='revoke'&&parts.length===4){const grant=this.store.require('delegationGrants',childId);if(grant.shareId!==key)fail('授权不存在。',404);this.invalidate(key,'此接收者授权已撤销。',childId);this.events(key,'grant_revoked',{grantId:childId});return {ok:true};}
    if(method==='POST'&&action==='calls'&&childId&&['approve','reject'].includes(operation)&&parts.length===4) {
      const call=this.store.require('delegationCalls',childId);if(call.shareId!==key)fail('调用不存在。',404);
      if(call.task.status.state!=='TASK_STATE_AUTH_REQUIRED')fail('本次调用已处理。',409);
      if(operation==='reject'){this.finish(call,'TASK_STATE_REJECTED','本人未批准此请求。');this.events(key,'call_rejected',{callId:childId});}
      else {this.assertCallCurrent(call);this.events(key,'call_approved',{callId:childId,version:call.version});this.execute(call);}
      return this.store.get('delegationCalls',childId).task;
    }
    fail('能力接口不存在。',404);
  }
  assertPublished(share){if(share.status!=='published'||!share.snapshot||Date.parse(share.snapshot.expiresAt)<=Date.now())fail('能力已撤销、过期或尚未发布。',403,'delegation_unavailable');}
  assertGrant(share,grant){this.assertPublished(share);if(!grant||grant.shareId!==share.id||grant.revokedAt||grant.version!==share.version||Date.parse(grant.expiresAt)<=Date.now())fail('授权已失效。',401,'delegation_unauthorized');}
  assertCallCurrent(call){const share=this.share(call.shareId),grant=this.store.get('delegationGrants',call.grantId);this.assertGrant(share,grant);assertDelegationModel(this.store,call.snapshot);return {share,grant};}
  invalidate(shareId,message,grantId) {
    for(const grant of this.store.list('delegationGrants').filter(g=>g.shareId===shareId&&(!grantId||g.id===grantId)&&!g.revokedAt))this.store.put('delegationGrants',{...grant,revokedAt:now()});
    for(const call of this.store.list('delegationCalls').filter(c=>c.shareId===shareId&&(!grantId||c.grantId===grantId)&&!terminal(c))){this.active.get(call.id)?.abort();this.finish(call,'TASK_STATE_CANCELED',message);}
  }
  finish(call,state,text,artifact) {
    const message={messageId:id('message'),role:'ROLE_AGENT',parts:[{text}],taskId:call.id,contextId:call.task.contextId};
    const task={...call.task,status:{state,message,timestamp:now()},...(artifact?{artifacts:[{artifactId:id('artifact'),name:'Text result',parts:[{text:artifact}]}]}:{})};
    const saved={...call,task,updatedAt:now()};this.store.put('delegationCalls',saved);return saved;
  }
  execute(call) {
    if(this.active.has(call.id))return;
    const controller=new AbortController();this.active.set(call.id,controller);this.finish(call,'TASK_STATE_WORKING','正在执行已批准的文本请求。');
    void (async()=>{
      try{this.assertCallCurrent(call);const output=await runDelegationText(this.store,call.snapshot,{text:call.input,purpose:call.purpose},{signal:controller.signal,resolveKey:this.resolveKey});
        if(controller.signal.aborted||terminal(this.store.require('delegationCalls',call.id)))return;
        this.assertCallCurrent(call);this.finish(call,'TASK_STATE_COMPLETED','已完成文本建议。',output);this.events(call.shareId,'call_completed',{callId:call.id});
      }catch(error){if(!controller.signal.aborted&&!this.closed&&!terminal(this.store.require('delegationCalls',call.id))){this.finish(call,'TASK_STATE_FAILED',error.status?error.message:'模型执行未完成。');this.events(call.shareId,'call_failed',{callId:call.id});}}
      finally{this.active.delete(call.id);}
    })();
  }
  authenticate(req,shareId){const share=this.share(shareId),match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization??'');if(!match)fail('需要有效授权。',401);const digest=Buffer.from(hash(match[1]),'hex');const grant=this.store.list('delegationGrants').find(g=>g.shareId===shareId&&timingSafeEqual(Buffer.from(g.tokenHash,'hex'),digest));this.assertGrant(share,grant);return {share,grant};}
  card(share,grant){return {name:share.snapshot.name,description:`${share.snapshot.description}\n${share.snapshot.serviceRules}`,supportedInterfaces:[{url:`${this.origin()}/a2a/${share.id}`,protocolBinding:'JSONRPC',protocolVersion:'1.0'}],version:String(share.version),capabilities:{streaming:false,pushNotifications:false,extendedAgentCard:false},securitySchemes:{grant:{httpAuthSecurityScheme:{scheme:'Bearer'}}},securityRequirements:[{schemes:{grant:{list:[]}}}],defaultInputModes:['text/plain'],defaultOutputModes:['text/plain'],skills:grant.purposes.map(p=>({id:p,name:delegationPurposes[p].en,description:`Text-only ${delegationPurposes[p].en.toLowerCase()}. No external actions.`,tags:[p,'text-only']}))};}
  async rpc(share,grant,request) {
    share=this.share(share.id);grant=this.store.require('delegationGrants',grant.id);this.assertGrant(share,grant);
    if(!request||request.jsonrpc!=='2.0'||!['string','number'].includes(typeof request.id)||typeof request.method!=='string'||(request.params!==undefined&&(!request.params||typeof request.params!=='object'||Array.isArray(request.params))))throw rpcError(-32600,'Invalid JSON-RPC request.');
    const p=request.params??{};
    if(p.tenant)throw rpcError(-32602,'This interface does not accept a tenant.');
    if(['SendStreamingMessage','SubscribeToTask','GetExtendedAgentCard'].includes(request.method))throw rpcError(-32004,'This capability is not supported.');
    if(/^(Create|Get|List|Delete)TaskPushNotificationConfig(s)?$/.test(request.method))throw rpcError(-32003,'Push notifications are not supported.');
    if(request.method==='SendMessage') {
      if(!grant.allowCalls)throw rpcError(-32004,'This grant permits viewing only.');
      const config=p.configuration??{};
      if(typeof config!=='object'||Array.isArray(config)||(config.returnImmediately!==undefined&&typeof config.returnImmediately!=='boolean')||(p.metadata!==undefined&&(!p.metadata||typeof p.metadata!=='object'||Array.isArray(p.metadata))))throw rpcError(-32602,'Invalid send configuration.');
      this.projectTask({},config.historyLength);
      if(config.taskPushNotificationConfig||config.pushNotificationConfig)throw rpcError(-32003,'Push notifications are not supported.');
      if(config.acceptedOutputModes!==undefined&&(!Array.isArray(config.acceptedOutputModes)||!config.acceptedOutputModes.length||config.acceptedOutputModes.some(mode=>mode!=='text/plain')))throw rpcError(-32005,'Only text/plain output is supported.');
      const m=p.message,purpose=p.metadata?.purpose??grant.purposes[0];
      if(!m||m.role!=='ROLE_USER'||typeof m.messageId!=='string'||!m.messageId.trim()||m.messageId.length>200||!Array.isArray(m.parts)||m.parts.length!==1||typeof m.parts[0]?.text!=='string'||Object.keys(m.parts[0]).some(key=>key!=='text')||m.taskId||m.contextId||m.referenceTaskIds||m.extensions||!grant.purposes.includes(purpose))throw rpcError(-32602,'One new text-only user message is required. Choose an allowed purpose in metadata.purpose.');
      const text=m.parts[0].text.trim();if(!text||text.length>share.snapshot.maxInputChars)throw rpcError(-32602,'Request text is empty or too long.');
      const inputHash=hash(JSON.stringify({text,purpose}));
      const previous=this.store.list('delegationCalls').find(c=>c.grantId===grant.id&&c.messageId===m.messageId);
      if(previous){if(previous.inputHash!==inputHash)throw rpcError(-32602,'messageId already belongs to different input.');return {task:await this.responseTask(previous.id,config)};}
      if(grant.usedCalls>=grant.maxCalls||this.store.list('delegationCalls').filter(c=>c.shareId===share.id&&c.version===share.version).length>=share.snapshot.maxCalls)throw rpcError(-32004,'Call allowance exhausted.');
      assertDelegationModel(this.store,share.snapshot);
      const taskId=id('delegation-task'),contextId=id('delegation-context');
      const task={id:taskId,contextId,status:{state:share.snapshot.approvalPolicy==='every_call'?'TASK_STATE_AUTH_REQUIRED':'TASK_STATE_SUBMITTED',message:{messageId:id('message'),role:'ROLE_AGENT',parts:[{text:share.snapshot.approvalPolicy==='every_call'?'等待本人审批。':'请求已接收。'}],taskId,contextId},timestamp:now()},history:[{messageId:m.messageId,role:'ROLE_USER',parts:[{text}],taskId,contextId}],metadata:{purpose,version:share.version}};
      const call={id:taskId,shareId:share.id,grantId:grant.id,version:share.version,messageId:m.messageId,inputHash,input:text,purpose,snapshot:structuredClone(share.snapshot),task,createdAt:now(),updatedAt:now()};
      this.store.transaction(()=>{this.store.put('delegationCalls',call);this.store.put('delegationGrants',{...grant,usedCalls:grant.usedCalls+1});this.events(share.id,'call_submitted',{callId:taskId,grantId:grant.id});});
      if(share.snapshot.approvalPolicy==='automatic')this.execute(call);
      return {task:await this.responseTask(taskId,config)};
    }
    const calls=this.store.list('delegationCalls').filter(c=>c.shareId===share.id&&c.grantId===grant.id&&c.version===share.version);
    if(request.method==='ListTasks') {
      const pageSize=p.pageSize??50;if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw rpcError(-32602,'pageSize must be between 1 and 100.');
      if(p.status&&![...delegationTerminalStates,'TASK_STATE_SUBMITTED','TASK_STATE_WORKING','TASK_STATE_INPUT_REQUIRED','TASK_STATE_AUTH_REQUIRED'].includes(p.status))throw rpcError(-32602,'Invalid status filter.');
      this.projectTask({},p.historyLength);
      if(p.includeArtifacts!==undefined&&typeof p.includeArtifacts!=='boolean')throw rpcError(-32602,'includeArtifacts must be a boolean.');
      if(p.statusTimestampAfter!==undefined&&(typeof p.statusTimestampAfter!=='string'||!Number.isFinite(Date.parse(p.statusTimestampAfter))))throw rpcError(-32602,'Invalid statusTimestampAfter.');
      const scope=hash(JSON.stringify([grant.id,p.contextId??null,p.status??null,p.statusTimestampAfter??null])),filtered=calls.filter(c=>(!p.contextId||c.task.contextId===p.contextId)&&(!p.status||c.task.status.state===p.status)&&(!p.statusTimestampAfter||Date.parse(c.task.status.timestamp)>=Date.parse(p.statusTimestampAfter))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
      let remaining=filtered;if(p.pageToken){try{const cursor=JSON.parse(Buffer.from(p.pageToken,'base64url'));if(cursor.scope!==scope||typeof cursor.at!=='string'||typeof cursor.id!=='string')throw new Error();remaining=filtered.filter(c=>c.updatedAt<cursor.at||(c.updatedAt===cursor.at&&c.id<cursor.id));}catch{throw rpcError(-32602,'Invalid page token.');}}
      const page=remaining.slice(0,pageSize),tasks=page.map(c=>{const task=this.projectTask(c.task,p.historyLength);if(p.includeArtifacts===true)task.artifacts??=[];else delete task.artifacts;return task;}),last=page.at(-1);
      return {tasks,nextPageToken:remaining.length>pageSize?Buffer.from(JSON.stringify({scope,at:last.updatedAt,id:last.id})).toString('base64url'):'',pageSize,totalSize:filtered.length};
    }
    if(['GetTask','CancelTask'].includes(request.method)) {
      const call=calls.find(c=>c.id===p.id);if(!call)throw rpcError(-32001,'Task not found.');
      if(request.method==='GetTask')return this.projectTask(call.task,p.historyLength);
      if(terminal(call))throw rpcError(-32002,'Task cannot be canceled.');
      this.active.get(call.id)?.abort();return this.finish(call,'TASK_STATE_CANCELED','调用者已取消此请求。').task;
    }
    throw rpcError(-32601,'Method not supported by this text-only implementation.');
  }
  projectTask(task,historyLength) {
    if(historyLength!==undefined&&(!Number.isInteger(historyLength)||historyLength<0))throw rpcError(-32602,'historyLength must be a non-negative integer.');
    const value=structuredClone(task);if(historyLength!==undefined)value.history=historyLength===0?[]:(value.history??[]).slice(-historyLength);return value;
  }
  async responseTask(callId,configuration={}) {
    const start=Date.now();let call=this.store.require('delegationCalls',callId);
    while(configuration.returnImmediately!==true&&!terminal(call)&&!['TASK_STATE_AUTH_REQUIRED','TASK_STATE_INPUT_REQUIRED'].includes(call.task.status.state)) {
      if(Date.now()-start>65000){this.active.get(callId)?.abort();call=this.finish(call,'TASK_STATE_FAILED','模型响应等待已超时。');break;}
      await new Promise(resolve=>setTimeout(resolve,25));call=this.store.require('delegationCalls',callId);
    }
    this.assertCallCurrent(call);
    return this.projectTask(call.task,configuration.historyLength);
  }
  async publicRequest(req,res) {
    const origin=this.origin();if(req.headers.host!==new URL(origin).host||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==origin))fail('来源不在能力服务范围。',403);
    const url=new URL(req.url,origin),parts=url.pathname.split('/').filter(Boolean);
    if(url.search)fail('请求地址不能包含授权参数。');
    if(req.method==='GET'&&parts[0]==='share'&&parts.length===2) {
      const nonce=randomBytes(16).toString('base64');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});return res.end(delegationPage(nonce));
    }
    const shareId=parts[0]==='share'?parts[1]:parts[0]==='a2a'?parts[1]:null;if(!shareId)fail('接口不存在。',404);
    const {share,grant}=this.authenticate(req,shareId);
    if(req.method==='GET'&&parts[0]==='share'&&parts.length===4&&parts[2]==='.well-known'&&parts[3]==='agent-card.json')return reply(res,200,this.card(share,grant));
    if(req.method==='GET'&&parts[0]==='share'&&parts.length===3&&parts[2]==='info')return reply(res,200,{name:share.snapshot.name,description:share.snapshot.description,serviceRules:share.snapshot.serviceRules,purposes:grant.purposes,allowCalls:grant.allowCalls,remainingCalls:Math.max(0,Math.min(grant.maxCalls-grant.usedCalls,share.snapshot.maxCalls-this.store.list('delegationCalls').filter(call=>call.shareId===share.id&&call.version===share.version).length)),expiresAt:grant.expiresAt,version:share.version,approvalPolicy:share.snapshot.approvalPolicy,maxInputChars:share.snapshot.maxInputChars});
    if(req.method!=='POST'||parts[0]!=='a2a'||parts.length!==2)fail('接口不存在。',404);
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))fail('需要 application/json。',415);
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)fail('请求过大。',413);chunks.push(chunk);}
    let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(res,200,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error.'}});}
    if(req.headers['a2a-version']!=='1.0')return reply(res,200,{jsonrpc:'2.0',id:request?.id??null,error:{code:-32009,message:'This interface requires A2A-Version: 1.0.'}});
    try{const result=await this.rpc(share,grant,request);this.assertGrant(this.share(share.id),this.store.get('delegationGrants',grant.id));return reply(res,200,{jsonrpc:'2.0',id:request?.id??null,result});}
    catch(error){return reply(res,200,{jsonrpc:'2.0',id:request?.id??null,error:{code:error.rpcCode??-32602,message:error.rpcCode||error.status?error.message:'Request failed.'}});}
  }
  async close(){this.closed=true;for(const controller of this.active.values())controller.abort();for(const call of this.store.list('delegationCalls'))if(call.task.status.state==='TASK_STATE_WORKING')this.finish(call,'TASK_STATE_FAILED','应用已停止，此调用未完成。');if(this.starting)await this.starting.catch(()=>{});if(this.server?.listening)await new Promise(resolve=>this.server.close(resolve));}
}
