import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { HttpError } from '../http-error.mjs';
import { getAttachment } from '../attachments.mjs';
import { validateConnectionModel } from '../connections.mjs';
import { assertTaskExecution } from '../execution-policy.mjs';
import { PROTOCOL, RUN_STATUSES, stamp, digest, clean, fail, identifier, plainObject, boundedString, relativeFile, inputManifest, modelSettings, MAX_FILE_BYTES } from './common.mjs';
import { SshRemoteTransport, runtimePackage, sshArgs } from './transport.mjs';

const runCollection='remoteRuns', computerCollection='remoteComputers';
const revision=value=>Number.isSafeInteger(value)&&value>0;
const remotePath=value=>typeof value==='string'&&path.posix.isAbsolute(value)&&value.length<=4000&&!/[\0\r\n]/.test(value);
const errorValue=(error,secret='')=>({code:clean(error?.code??'remote_operation_failed',secret).slice(0,100),message:clean(error?.message??'无法核对远端状态。',secret).slice(0,4000)});
function protocolError(){return fail('远端返回了无法核对的任务状态，请检查运行组件版本。','remote_invalid_response',502);}
function publicRun(record){const {_binding,_fingerprint,...value}=record;return structuredClone(value);}
function time(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw protocolError();return value;}
function text(value,max){if(typeof value!=='string'||value.length>max)throw protocolError();return value;}
function validateProbe(probe){
  if(probe?.protocol!==PROTOCOL||!['darwin','linux'].includes(probe.platform)||!remotePath(probe.nodePath)||!remotePath(probe.codexPath)||!remotePath(probe.workspaceRoot))throw protocolError();
  return {protocol:PROTOCOL,node:text(probe.node,100),nodePath:probe.nodePath,platform:probe.platform,codex:text(probe.codex,200),codexPath:probe.codexPath,workspaceRoot:probe.workspaceRoot,checkedAt:time(probe.checkedAt)};
}
function validateRuntime(runtime,pkg){
  if(runtime?.protocol!==PROTOCOL||runtime.version!==pkg.version||!remotePath(runtime.runtimePath)||!runtime.runtimePath.endsWith(`/releases/${pkg.version}/server/remote/rpc.mjs`))throw protocolError();
  return {protocol:PROTOCOL,version:pkg.version,runtimePath:runtime.runtimePath,installedAt:stamp()};
}
function stateValue(state,run,secret=''){
  if(state?.id!==run.id||!RUN_STATUSES.includes(state.status)||state.workspace!==run.workspace||!Number.isSafeInteger(state.sequence)||state.sequence<0||!Array.isArray(state.approvals)||state.approvals.length>100||!Array.isArray(state.files)||state.files.length>1000)throw protocolError();
  const approvals=state.approvals.map(item=>({id:text(item.id,200),title:clean(text(item.title,1000),secret),description:clean(text(item.description,10000),secret),details:clean(text(item.details,65536),secret),createdAt:time(item.createdAt)}));
  if(new Set(approvals.map(item=>item.id)).size!==approvals.length)throw protocolError();
  const files=state.files.map(item=>{if(!Number.isSafeInteger(item.size)||item.size<0||item.size>MAX_FILE_BYTES||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw protocolError();return {path:relativeFile(item.path),size:item.size,sha256:item.sha256,modifiedAt:time(item.modifiedAt)};});
  if(new Set(files.map(item=>item.path)).size!==files.length||files.reduce((total,file)=>total+file.size,0)>16*1024*1024)throw protocolError();
  return {status:state.status,sequence:state.sequence,updatedAt:time(state.updatedAt),...(state.startedAt?{startedAt:time(state.startedAt)}:{}),...(state.finishedAt?{finishedAt:time(state.finishedAt)}:{}),approvals,files,filesTruncated:!!state.filesTruncated,cancelRequested:!!state.cancelRequested,executorUnconfirmed:!!state.executorUnconfirmed,...(state.result!==undefined?{result:clean(text(state.result,200000),secret)}:{}),...(state.error?{error:errorValue(state.error,secret)}:{})};
}
function eventValues(events,cursor,secret){
  if(!Array.isArray(events)||events.length>200)throw protocolError();
  let sequence=cursor;
  return events.map(row=>{if(!Number.isSafeInteger(row.sequence)||row.sequence<=sequence)throw protocolError();sequence=row.sequence;return {sequence,at:time(row.at),type:text(row.type,200),label:clean(text(row.label,1000),secret),detail:clean(text(row.detail,65536),secret)};});
}

/** Local records are observers. Only the first explicitly authorized start sends
 * credentials; constructing or reopening this service never restarts a run. */
export class RemoteComputerService {
  constructor(store,{executionPolicy,transport=new SshRemoteTransport(),onRunChanged}={}){
    this.store=store;this.executionPolicy=executionPolicy;this.transport=transport;this.onRunChanged=onRunChanged;this.closed=false;this.pending=new Map();this.observing=new Map();
    this.ownerId=store.get('meta','remoteOwnerId')?.value??store.setMeta('remoteOwnerId',randomUUID());
  }
  mutable(){if(this.closed)throw new HttpError(503,'当前空间已关闭。','remote_space_closed');if(this.executionPolicy==='showcase')throw new HttpError(403,'示例空间不能连接远端电脑或运行任务。请切换到真实空间。','showcase_read_only');}
  close(){this.closed=true;} // Closing an observer must never send remote cancel.
  list(){return {computers:this.store.list(computerCollection),connections:this.store.list('modelConnections').map(connection=>({...this.store.publicConnection(connection),revision:connection.revision??1})),readOnly:this.executionPolicy==='showcase',protocol:PROTOCOL};}
  getRun(runId){return publicRun(this.store.require(runCollection,identifier(runId)));}
  runSnapshot(runId){return this.getRun(runId);}
  writeRun(run){this.store.put(runCollection,run);if(this.onRunChanged)try{this.onRunChanged(publicRun(run));}catch(error){this.lastObserverError=errorValue(error);console.warn('[remote-observer]',/^[a-zA-Z0-9_-]{1,100}$/.test(error?.code??'')?error.code:'observer_failed');}return run;}
  attachTask(runId,taskId){
    this.mutable();const run=this.store.require(runCollection,identifier(runId)),task=this.store.require('tasks',identifier(taskId));assertTaskExecution(this.executionPolicy,task);
    if(task.archived)throw fail('已归档的任务不能关联远端执行。','remote_task_archived',409);
    if(run.taskId&&run.taskId!==taskId)throw fail('远端运行已关联其他任务。','remote_task_conflict',409);
    if(run.taskId===taskId)return publicRun(run);return publicRun(this.writeRun({...run,taskId}));
  }
  runs(computerId){this.store.require(computerCollection,computerId);return {runs:this.store.list(runCollection).filter(run=>run.computerId===computerId).map(publicRun).reverse()};}
  saveComputer(body,existing){
    this.mutable();plainObject(body,['name','host','user','port','workspaceRoot',...(existing?['expectedRevision']:[])],'远端电脑');
    if(existing&&body.expectedRevision!==existing.revision)throw fail('电脑配置已变化，请刷新后再修改。','remote_computer_changed',409);
    const merged={...existing,...body},host=boundedString(merged.host,253,'主机'),name=boundedString(merged.name,100,'电脑名称'),user=merged.user?boundedString(merged.user,64,'远端用户名'):undefined,port=merged.port??22;
    sshArgs({host,user,port},'');
    if(!remotePath(merged.workspaceRoot)||merged.workspaceRoot==='/')throw fail('请填写远端已存在的独立项目目录。');
    const now=stamp(),computer={id:existing?.id??`computer-${randomUUID()}`,name,host,...(user?{user}:{}),port,workspaceRoot:merged.workspaceRoot,revision:(existing?.revision??0)+1,status:'saved',createdAt:existing?.createdAt??now,updatedAt:now};
    this.store.put(computerCollection,computer);return {computer};
  }
  async probe(computerId,body={}){
    this.mutable();plainObject(body,[]);const computer=this.store.require(computerCollection,computerId);
    try{
      const probe=validateProbe(await this.transport.probe(computer));
      if(this.closed)return {computer};
      const current=this.store.require(computerCollection,computerId);if(current.revision!==computer.revision)throw fail('探测期间电脑配置已变化，请重新检查。','remote_computer_changed',409);
      const changed=current.probe&&['workspaceRoot','nodePath','codexPath'].some(key=>current.probe[key]!==probe[key]);
      const next={...current,probe,revision:current.revision+(changed?1:0),status:current.runtime&&!changed?'ready':'saved',updatedAt:stamp()};if(changed)delete next.runtime;delete next.lastError;this.store.put(computerCollection,next);return {computer:next};
    }catch(error){if(!this.closed){const current=this.store.require(computerCollection,computerId);if(current.revision===computer.revision)this.store.put(computerCollection,{...current,status:'unavailable',lastError:errorValue(error),updatedAt:stamp()});}throw error;}
  }
  async prepare(computerId,body){
    this.mutable();plainObject(body,['installRuntime']);if(body.installRuntime!==true)throw fail('请明确确认在这台电脑安装运行组件。','remote_install_consent');
    const computer=this.store.require(computerCollection,computerId);if(!computer.probe)throw fail('请先检查远端电脑的运行条件。','remote_not_probed',409);
    const pkg=runtimePackage(),runtime=validateRuntime(await this.transport.prepare(computer,pkg),pkg);
    if(this.closed)return {computer};
    const current=this.store.require(computerCollection,computerId);if(current.revision!==computer.revision)throw fail('准备期间电脑配置已变化，请重新检查。','remote_computer_changed',409);
    const next={...current,runtime,status:'ready',updatedAt:stamp()};delete next.lastError;this.store.put(computerCollection,next);return {computer:next};
  }
  start(computerId,body){
    this.mutable();plainObject(body,['requestId','prompt','modelConnectionId','modelRevision','computerRevision','credentialConsent','taskId','files','durationMs'],'远端任务');
    const requestId=identifier(body.requestId),prompt=boundedString(body.prompt,50000,'任务内容');
    const computer=this.store.require(computerCollection,computerId),connection=this.store.connection(identifier(body.modelConnectionId));
    if(!revision(body.computerRevision)||!revision(body.modelRevision)||body.computerRevision!==computer.revision||body.modelRevision!==(connection.revision??1))throw fail('电脑或模型配置已变化，请重新核对后确认本次远端使用。','remote_consent_changed',409);
    if(body.credentialConsent!==true)throw fail('请确认将所选模型凭据用于这次远端任务。','remote_credential_consent');
    if(computer.status!=='ready'||!computer.probe||!computer.runtime)throw fail('请先检查并准备远端运行组件。','remote_not_prepared',409);
    if(computer.runtime.version!==runtimePackage().version)throw fail('本机运行组件已有更新，请重新准备远端运行组件。','remote_runtime_changed',409);
    validateConnectionModel(connection);const settings=modelSettings(Object.fromEntries(['provider','model','baseUrl','api','reasoningEffort','appTitle'].filter(key=>connection[key]!==undefined).map(key=>[key,connection[key]])));
    const apiKey=this.store.getKey(connection);if(!apiKey)throw fail('所选模型连接尚未配置凭据。','remote_model_unconfigured',409);
    if(body.taskId)throw fail('新远端执行会创建独立任务记录，不能接管已有本机任务。','remote_task_binding_required',409);
    if(!Array.isArray(body.files??[])||(body.files??[]).length>6)throw fail('每次任务最多提供 6 个明确选择的文件。');
    const files=inputManifest((body.files??[]).map(file=>{plainObject(file,['attachmentId','path'],'输入文件');const attachment=getAttachment(this.store,identifier(file.attachmentId));return {attachmentId:attachment.id,path:relativeFile(file.path),size:attachment.size,sha256:attachment.sha256,data:attachment.data.toString('base64')};}));
    const durationMs=body.durationMs??3600000;if(!Number.isSafeInteger(durationMs)||durationMs<1000||durationMs>86400000)throw fail('运行时限须为 1 秒至 24 小时。');
    const filesInput=files.map(({data,...file})=>file),fingerprint=digest(JSON.stringify({computerId,computerRevision:computer.revision,modelConnectionId:connection.id,modelRevision:connection.revision??1,requestId,prompt,taskId:body.taskId??null,filesInput,durationMs}));
    const prior=this.store.list(runCollection).find(run=>run.requestId===requestId);
    if(prior){if(prior._fingerprint!==fingerprint)throw fail('相同请求标识已有不同的远端任务，未重复启动。','remote_request_conflict',409);return {run:publicRun(prior)};}
    const now=stamp(),run={id:`remote-run-${randomUUID()}`,computerId,computerRevision:computer.revision,computer:{name:computer.name,host:computer.host,...(computer.user?{user:computer.user}:{}),port:computer.port},requestId,...(body.taskId?{taskId:body.taskId}:{}),prompt,workspace:computer.probe.workspaceRoot,modelConnectionId:connection.id,modelRevision:connection.revision??1,model:{id:connection.id,name:connection.name,...settings},filesInput,durationMs,status:'starting',dispatch:'pending',observation:{status:'pending'},createdAt:now,updatedAt:now,sequence:0,cursor:0,events:[],eventsTruncated:false,approvals:[],files:[],filesTruncated:false,cancelRequested:false,executorUnconfirmed:false,_binding:structuredClone(computer),_fingerprint:fingerprint};
    this.writeRun(run);
    const input={workspace:run.workspace,prompt,apiKey,credentialConsent:true,settings,files,durationMs,codexPath:computer.probe.codexPath,computerRevision:run.computerRevision,modelRevision:run.modelRevision,requestId};
    const pending=Promise.resolve().then(async()=>{
      try{const response=await this.transport.call(run._binding,this.request(run,'start',input));if(!this.closed)this.merge(run.id,response.state,apiKey,{dispatch:'submitted'});}
      catch(error){if(!this.closed)this.disconnected(run.id,error,apiKey,{dispatch:'uncertain'});}
      finally{input.apiKey='';input.files=[];this.pending.delete(run.id);}
    });
    this.pending.set(run.id,pending);return {run:this.getRun(run.id)};
  }
  request(run,op,input){return {version:PROTOCOL,ownerId:this.ownerId,runId:run.id,op,input};}
  secret(run){try{return this.store.getKey(this.store.connection(run.modelConnectionId))??'';}catch{return '';}}
  merge(runId,state,secret='',extra={}){
    const current=this.store.require(runCollection,runId),verified=stateValue(state,current,secret);
    // Concurrent observers cannot roll a newer durable snapshot backward.
    const latest=verified.sequence>current.sequence||verified.sequence===current.sequence&&Date.parse(verified.updatedAt)>=Date.parse(current.updatedAt)?verified:{};
    const next={...current,...latest,...extra,observation:{status:'connected',checkedAt:stamp()}};return this.writeRun(next);
  }
  disconnected(runId,error,secret='',extra={}){const current=this.store.require(runCollection,runId);const next={...current,...extra,observation:{status:'disconnected',checkedAt:stamp(),error:errorValue(error,secret)}};return this.writeRun(next);}
  async poll(runId,{cursor}={}){
    this.mutable();const current=this.store.require(runCollection,identifier(runId));cursor??=current.cursor;
    if(!Number.isSafeInteger(cursor)||cursor<0)throw fail('操作记录位置无效。');
    if(cursor>current.cursor)throw fail('操作记录位置超过已核对记录，请从已保存的位置恢复。','remote_cursor_ahead',409);
    if(this.pending.has(runId))return {run:publicRun(current),events:[],cursor:current.cursor,hasMore:false};
    // Serialize observers to preserve the durable event cursor across callers.
    if(this.observing.has(runId))await this.observing.get(runId);
    if(this.closed)return {run:publicRun(current),events:[],cursor:current.cursor,hasMore:false};
    const operation=this.observe(runId,cursor);this.observing.set(runId,operation);
    try{return await operation;}finally{if(this.observing.get(runId)===operation)this.observing.delete(runId);}
  }
  async observe(runId,cursor){
    const current=this.store.require(runCollection,runId),secret=this.secret(current);
    try{
      const response=await this.transport.call(current._binding,this.request(current,'poll',{cursor}));
      const events=eventValues(response.events,cursor,secret),returnedCursor=events.at(-1)?.sequence??cursor;
      if(response.cursor!==returnedCursor||typeof response.hasMore!=='boolean'||returnedCursor>response.state?.sequence||events.some(row=>row.sequence>response.state.sequence))throw protocolError();
      if(this.closed)return {run:publicRun(current),events:[],cursor:current.cursor,hasMore:false};
      const next=this.merge(runId,response.state,secret,{dispatch:'submitted'}),merged=[...new Map([...next.events,...events].map(row=>[row.sequence,row])).values()].sort((a,b)=>a.sequence-b.sequence);
      next.cursor=Math.max(next.cursor,returnedCursor);next.events=merged.slice(-2000);next.eventsTruncated=next.eventsTruncated||merged.length>2000;this.writeRun(next);
      return {run:publicRun(next),events,cursor:returnedCursor,hasMore:response.hasMore};
    }catch(error){if(this.closed)return {run:publicRun(current),events:[],cursor:current.cursor,hasMore:false};const next=this.disconnected(runId,error,secret);return {run:publicRun(next),events:[],cursor,hasMore:false};}
  }
  async control(runId,op,body){
    this.mutable();const run=this.store.require(runCollection,identifier(runId));
    if(op==='approval'){plainObject(body,['approvalId','decision']);if(!['approve','reject'].includes(body.decision)||typeof body.approvalId!=='string'||body.approvalId.length>200)throw fail('审批决定无效。');}
    else plainObject(body,[]);
    if(this.pending.has(runId))await this.pending.get(runId);
    this.mutable();
    const secret=this.secret(run);
    try{const response=await this.transport.call(run._binding,this.request(run,op,body));if(this.closed)return {run:publicRun(run),accepted:!!response.accepted};const next=this.merge(runId,response.state,secret,op==='cancel'&&response.cancelRequested?{cancelRequested:true}:{});return {run:publicRun(next),accepted:op==='cancel'?!!response.cancelRequested:response.accepted===true};}
    catch(error){if(!this.closed)this.disconnected(runId,error,secret);throw error;}
  }
  async readFile(runId,filePath){
    this.mutable();const run=this.store.require(runCollection,identifier(runId)),expected=run.files.find(file=>file.path===relativeFile(filePath));
    if(!expected)throw fail('这个文件不在本次任务产物清单中。','remote_file_not_found',404);
    const response=await this.transport.call(run._binding,this.request(run,'file',{path:expected.path,sha256:expected.sha256}));
    if(response?.path!==expected.path||response.size!==expected.size||response.sha256!==expected.sha256||typeof response.data!=='string'||response.data.length>Math.ceil(MAX_FILE_BYTES/3)*4)throw protocolError();
    const data=Buffer.from(response.data,'base64');if(data.length!==expected.size||data.toString('base64')!==response.data||digest(data)!==expected.sha256)throw fail('下载文件与本次任务记录不一致。','remote_file_changed',409);
    return {path:expected.path,size:expected.size,sha256:expected.sha256,dataBase64:response.data};
  }
  async owner(method,parts,body={}){
    const [computerId,action,runId,operation]=parts;
    if(!computerId){if(method==='GET')return this.list();if(method==='POST')return this.saveComputer(body);}
    if(computerId){this.store.require(computerCollection,identifier(computerId));if(!action&&method==='PUT')return this.saveComputer(body,this.store.require(computerCollection,computerId));
      if(action==='probe'&&method==='POST')return this.probe(computerId,body);
      if(action==='prepare'&&method==='POST')return this.prepare(computerId,body);
      if(action==='runs'){
        if(!runId){if(method==='GET')return this.runs(computerId);if(method==='POST')return this.start(computerId,body);}
        else {const run=this.store.require(runCollection,identifier(runId));if(run.computerId!==computerId)throw fail('当前电脑没有这个任务。','remote_run_not_found',404);if(method==='POST'){
          if(operation==='poll'){plainObject(body,['cursor']);return this.poll(runId,body);}
          if(['approval','cancel'].includes(operation))return this.control(runId,operation,body);
          if(operation==='file'){plainObject(body,['path']);return this.readFile(runId,body.path);}
        }}
      }
    }
    throw new HttpError(404,'远端电脑操作不存在。','remote_route_not_found');
  }
}
