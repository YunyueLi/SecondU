import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,existsSync,lstatSync,chmodSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {HttpError,atomicWrite,id,now} from './store.mjs';
import {IM_CHANNEL_CATALOG,IM_PLUGIN_INTEGRITIES,IM_EXTERNAL_PACKAGES,IM_CHANNEL_LIMITATIONS,managedChannelConfig} from './im-catalog.mjs';

// Audited against the official v2026.9.7 sources. Installs happen only after
// the user selects an isolated runtime and explicitly requests installation.
export const OPENCLAW_RELEASE={version:'2026.9.7',license:'MIT',node:'>=24.16.0 <25 || >=26.1.0'};
const packages={...IM_PLUGIN_INTEGRITIES,...Object.fromEntries(Object.values(IM_EXTERNAL_PACKAGES).map(item=>[item.name,item.integrity])),
 openclaw:'sha512-/8N2LnfTFQPvnZizi8qKSFfnLQaPvSG3Cb4xo1YV7b4JhYiUc43ZNRpXJ01bWghLK0Ezk3HVeo/DGHcIRQwRWA==',
 '@openclaw/slack':'sha512-8iiE3XsXE9lwBKYKwIH1zP83vKlhdplw/4wJlVQpQOarPom2QTTxv0tzOUKgoydLBlcfgZLu3d9tC+nKtv7p7w==',
 '@openclaw/discord':'sha512-okdLuw/DpzJIFyP4mPn7ym+jogiyRfTazylSdiE4xEJGfrTzQzrA2Ko2T5PiKIyL45XhFOvqorA9TXw78OWK3Q==',
 '@openclaw/whatsapp':'sha512-GgUyH4NzUanJ/xV1cxJEkq68rR+h5uh40TyhDPy7BcQ5Fqr6oYFT3UyBGsvR67UIBYukd5mJ/+MXhNNSeYRckg=='
};
const supported=IM_CHANNEL_CATALOG.map(item=>item.channel);
const pluginFor=channel=>IM_CHANNEL_CATALOG.find(item=>item.channel===channel)?.builtin?undefined:IM_EXTERNAL_PACKAGES[channel]?.name??`@openclaw/${channel}`;
const versionFor=name=>Object.values(IM_EXTERNAL_PACKAGES).find(item=>item.name===name)?.version??OPENCLAW_RELEASE.version;
const fail=(status,message,code='im_setup_invalid')=>{throw new HttpError(status,message,code);};
const scalar=(value,max=200)=>typeof value==='string'&&value.length<=max&&!/[\0\r\n]/.test(value)?value.trim():'';
const channelOf=value=>supported.includes(value)?value:fail(400,'请选择已适配的通信渠道。');
const accountOf=value=>{const result=scalar(value||'default',80);if(!/^[a-zA-Z0-9_-]+$/.test(result))fail(400,'账号标识无效。');return result;};
const jsonFile=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return undefined;}};
export const compatibleNode=version=>{const [major,minor]=String(version).replace(/^v/,'').split('.').map(Number);return major===24&&minor>=16||major===26&&minor>=1||major>26;};
function privateDirectory(directory){mkdirSync(directory,{recursive:true,mode:0o700});if(lstatSync(directory).isSymbolicLink())fail(400,'通信配置目录不能是符号链接。');chmodSync(directory,0o700);}
function safeEnvironment(){const env={};for(const key of ['PATH','HOME','USERPROFILE','SystemRoot','WINDIR','TMPDIR','TEMP','TMP','LANG','LC_ALL','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy'])if(process.env[key])env[key]=process.env[key];return {...env,NO_COLOR:'1',FORCE_COLOR:'0'};}

/** Bounded subprocess; raw stdout/stderr are never surfaced by the service. */
export function runSetupCommand(command,args,{env,cwd,signal,timeout=20000,onOutput}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{env,cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let done=false,bytes=0;const output=[];
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>{child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),1000);kill.unref();finish(new HttpError(409,'通信操作已取消。','im_setup_cancelled'));};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new HttpError(504,'通信操作超时，请检查连接状态。','im_setup_timeout'));},timeout);
  if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});
  child.on('error',()=>finish(new HttpError(503,'无法启动通信工具，请检查安装与 Node.js 版本。','im_setup_unavailable')));
  for(const stream of [child.stdout,child.stderr]){const decoder=new StringDecoder('utf8');stream.on('data',part=>{bytes+=part.length;if(bytes>2*1024*1024){child.kill('SIGKILL');finish(new HttpError(502,'通信工具输出超出限制。','im_setup_output_limit'));return;}if(stream===child.stdout)output.push(part);onOutput?.(decoder.write(part));});stream.on('end',()=>{const tail=decoder.end();if(tail)onOutput?.(tail);});}
  child.on('close',code=>code===0?finish(undefined,Buffer.concat(output).toString('utf8')):finish(new HttpError(502,'通信工具未完成操作，请检查账号权限与本机环境。','im_setup_command_failed')));
 });
}
export function qrOnly(output){const lines=output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'').split(/\r?\n/);const rows=lines.filter(line=>/^[ \t█▀▄░▒▓]{16,200}$/.test(line)&&/[█▀▄]/.test(line));return rows.length>=12?rows.slice(-100).join('\n'):undefined;}
async function freePort(){return new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});}

export class ImSetupService{
 constructor(store,{im,executionPolicy,runCommand=runSetupCommand,spawnProcess=spawn,installRuntime}={}){
  this.store=store;this.im=im;this.policy=executionPolicy;this.run=runCommand;this.spawn=spawnProcess;this.installer=installRuntime;this.operations=new Map();this.gateway=null;this.gatewayStatus='stopped';this.closing=false;this.mutating=false;
  this.root=path.join(store.directory,'im','openclaw');this.runtimePath=path.join(this.root,'runtime');this.statePath=path.join(this.root,'state');this.configPath=path.join(this.statePath,'openclaw.json');
  this.selected=store.get('meta','im-setup-selection')?.value??'managed';this.existing=store.get('meta','im-setup-existing')?.value;
  if(im)im.resolveRuntime=runtimeId=>this.resolveRuntime(runtimeId);
 }
 assertReal(){if(this.policy==='showcase')fail(403,'示例空间不能安装通信工具或连接真实账户，请进入个人空间。','showcase_read_only');if(this.closing)fail(503,'通信服务正在停止。');}
 confirm(body){if(body.confirmed!==true)fail(400,'请明确确认本次操作。','im_setup_confirmation');}
 status(){return {release:OPENCLAW_RELEASE,selected:this.selected,showcase:this.policy==='showcase',managed:{installed:this.managedInstalled(),channels:supported.filter(channel=>this.managedInstalled(channel)),nodeRequirement:OPENCLAW_RELEASE.node,gateway:this.gatewayStatus},existing:this.existing?{detected:true,version:this.existing.version}:null,operations:[...this.operations.values()].filter(op=>op.status==='running').map(op=>this.publicOperation(op)),supported:IM_CHANNEL_CATALOG,unavailable:IM_CHANNEL_LIMITATIONS};}
 managedInstalled(channel){const names=['openclaw',...(channel&&pluginFor(channel)?[pluginFor(channel)]:[])],lock=jsonFile(path.join(this.runtimePath,'package-lock.json'));return names.every(name=>jsonFile(path.join(this.runtimePath,'node_modules',name,'package.json'))?.version===versionFor(name)&&lock?.packages?.[`node_modules/${name}`]?.integrity===packages[name]);}
 async resolveRuntime(runtimeId=this.selected){
  this.assertReal();if(runtimeId==='existing'){if(!this.existing)fail(409,'请先检测已有 OpenClaw。');return {command:this.existing.command,prefix:[],options:{env:{...safeEnvironment(),OPENCLAW_CONFIG_READONLY:'1'}}};}
  if(runtimeId!=='managed'||!this.managedInstalled())fail(409,'请先安装 SecondU 管理的通信运行环境。','im_setup_install_required');
  return {command:'node',prefix:[path.join(this.runtimePath,'node_modules','openclaw','openclaw.mjs')],options:{env:{...safeEnvironment(),OPENCLAW_STATE_DIR:this.statePath,OPENCLAW_CONFIG_PATH:this.configPath,OPENCLAW_OAUTH_DIR:path.join(this.statePath,'credentials'),OPENCLAW_LOAD_SHELL_ENV:'0'},cwd:this.statePath}};
 }
 async invoke(args,{runtimeId=this.selected,...options}={}){const runtime=await this.resolveRuntime(runtimeId);return this.run(runtime.command,[...runtime.prefix,...args],{...runtime.options,...options});}
 async json(args,options){const raw=await this.invoke(args,options);try{const value=typeof raw==='string'?JSON.parse(raw):raw;if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{fail(502,'通信工具没有返回有效状态。','im_setup_invalid_output');}}
 async detect(body={}){this.assertReal();const command=body.command===undefined?'openclaw':scalar(body.command,1000);if(command!=='openclaw'&&!path.isAbsolute(command))fail(400,'请选择 OpenClaw 可执行文件的绝对路径。');let version;try{const out=await this.run(command,['--version'],{env:safeEnvironment(),timeout:10000});version=String(out).match(/\b(20\d{2}\.\d{1,2}\.\d{1,2}(?:-\d+)?)\b/)?.[1];}catch{}
  if(version){this.existing={command,version};this.store.setMeta('im-setup-existing',this.existing);}else{this.existing=null;this.store.setMeta('im-setup-existing',null);}return this.status();}
 select(body){this.assertReal();if(this.mutating)fail(409,'已有通信操作正在进行。','im_setup_busy');if(!['managed','existing'].includes(body.runtimeId)||body.runtimeId==='existing'&&!this.existing)fail(400,'请先检测并选择可用运行环境。');this.selected=body.runtimeId;this.store.setMeta('im-setup-selection',this.selected);return this.status();}
 publicOperation(op){return {id:op.id,kind:op.kind,status:op.status,stage:op.stage,channel:op.channel,startedAt:op.startedAt,finishedAt:op.finishedAt,code:op.code,...(op.status==='running'&&op.qrExpiresAt>Date.now()&&op.qr?{qr:op.qr,qrExpiresAt:new Date(op.qrExpiresAt).toISOString()}:{} )};}
 operation(kind,channel,work){if(this.mutating)fail(409,'已有通信配置操作正在进行，请先完成或取消。','im_setup_busy');this.mutating=true;const op={id:id('im-op'),kind,channel,status:'running',stage:kind,startedAt:now(),abort:new AbortController()};this.operations.set(op.id,op);
  op.promise=Promise.resolve().then(()=>work(op)).then(()=>{if(op.status==='running'){op.status='completed';op.stage='completed';}},error=>{if(op.status==='running'){op.status=error?.code==='im_setup_cancelled'?'cancelled':'failed';op.code=/^im_setup_[a-z_]+$/.test(error?.code??'')?error.code:'im_setup_command_failed';}}).finally(()=>{op.qr=undefined;op.finishedAt=now();this.mutating=false;});
  // Retain a small, credential-free in-memory history. A restart never fabricates success.
  for(const [key,value] of this.operations)if(this.operations.size>20&&value.status!=='running')this.operations.delete(key);return this.publicOperation(op);
 }
 install(body){this.assertReal();this.confirm(body);if(this.selected!=='managed')fail(409,'安装只适用于 SecondU 管理的独立运行环境。');const channel=channelOf(body.channel);if(this.gateway)fail(409,'请先停止 SecondU 的通信服务。');
  return this.operation('install',channel,async op=>{privateDirectory(this.root);privateDirectory(this.runtimePath);privateDirectory(this.statePath);const nodeVersion=await this.run('node',['--version'],{env:safeEnvironment(),signal:op.abort.signal});if(!compatibleNode(nodeVersion))fail(409,'此 OpenClaw 版本需要 Node.js 24.16 或 26.1 及以上兼容版本。','im_setup_node_required');
   const packageNames=['openclaw',...(pluginFor(channel)?[pluginFor(channel)]:[])];op.stage='downloading';
   if(this.installer)await this.installer({directory:this.runtimePath,packages:packageNames,version:OPENCLAW_RELEASE.version,versions:Object.fromEntries(packageNames.map(name=>[name,versionFor(name)])),integrities:packages,signal:op.abort.signal});
   else await this.run(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',this.runtimePath,'--ignore-scripts','--no-audit','--no-fund','--save-exact',...packageNames.map(name=>`${name}@${versionFor(name)}`)],{env:safeEnvironment(),signal:op.abort.signal,timeout:10*60*1000});
   if(op.abort.signal.aborted)fail(409,'通信操作已取消。','im_setup_cancelled');if(!this.managedInstalled(channel))fail(502,'安装文件的固定版本或完整性记录不匹配。','im_setup_integrity');op.stage='verifying';this.ensureConfig();await this.invoke(['--version'],{runtimeId:'managed',signal:op.abort.signal});
  });
 }
 ensureConfig(){privateDirectory(this.root);privateDirectory(this.statePath);let config=jsonFile(this.configPath);if(!config){config={gateway:{mode:'local',bind:'loopback',auth:{mode:'token',token:randomBytes(32).toString('hex')}},channels:{},plugins:{allow:[],load:{paths:[]}},logging:{level:'silent',consoleLevel:'silent'},commands:{native:false,nativeSkills:false,text:false},tools:{deny:['*']}};this.writeConfig(config);}return config;}
 writeConfig(config){if(existsSync(this.configPath)&&lstatSync(this.configPath).isSymbolicLink())fail(400,'通信配置文件不能是符号链接。');atomicWrite(this.configPath,JSON.stringify(config,null,2),0o600);}
 async channels(body={}){this.assertReal();const value=await this.json(['channels','list','--all','--json'],{runtimeId:body.runtimeId??this.selected});const rows=[];for(const [channel,raw] of Object.entries(value.chat??{})){if(!/^[a-z][a-z0-9-]{0,60}$/.test(channel))continue;const accounts=Array.isArray(raw)?raw:Array.isArray(raw?.accounts)?raw.accounts:[];rows.push({channel,label:scalar(raw?.label,80)||channel,installed:Array.isArray(raw)||raw?.installed===true,accounts:accounts.filter(a=>typeof a==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(a)).slice(0,50),supported:supported.includes(channel),canRead:['slack','discord'].includes(channel)});}return {channels:rows.slice(0,100)};}
 async configure(body){this.assertReal();this.confirm(body);if(this.selected!=='managed')fail(409,'已有 OpenClaw 的授权和配置由原工具管理。','im_setup_existing_read_only');if(this.mutating||this.gateway)fail(409,'请先完成当前操作并停止 SecondU 通信服务。','im_setup_busy');const channel=channelOf(body.channel),accountId=accountOf(body.accountId);if(!this.managedInstalled(channel))fail(409,'请先安装此渠道的固定版本插件。','im_setup_install_required');
  const {item,entry}=managedChannelConfig(channel,{...body,accountId});const config=this.ensureConfig(),previous=JSON.stringify(config);
  if(pluginFor(channel)){config.plugins??={};config.plugins.allow=[...new Set([...(config.plugins.allow??[]),IM_EXTERNAL_PACKAGES[channel]?.pluginId??channel])];config.plugins.load??={};config.plugins.load.paths=[...new Set([...(config.plugins.load.paths??[]),path.join(this.runtimePath,'node_modules',pluginFor(channel))])];}
  config.channels??={};const policy=channel==='matrix'?{groupPolicy:'disabled',dm:{enabled:false,policy:'disabled'}}:{dmPolicy:'disabled',groupPolicy:'disabled'};config.channels[channel]=item.singleAccount||item.defaultAtRoot&&accountId==='default'?{...config.channels[channel],...entry}:{...config.channels[channel],enabled:true,...policy,accounts:{...config.channels[channel]?.accounts,[accountId]:entry}};
  this.mutating=true;let written=false;try{this.writeConfig(config);written=true;await this.invoke(['config','validate'],{runtimeId:'managed'});}catch(error){if(written)this.writeConfig(JSON.parse(previous));throw error;}finally{this.mutating=false;}return {configured:true,channel,accountId,requiresLogin:channel==='whatsapp',automaticReplies:false};
 }

 login(body){this.assertReal();this.confirm(body);if(this.selected!=='managed')fail(409,'请在已有 OpenClaw 中完成登录。','im_setup_existing_read_only');const channel=channelOf(body.channel),accountId=accountOf(body.accountId);if(channel!=='whatsapp')fail(400,'这个渠道使用令牌授权，无需二维码登录。');if(!this.managedInstalled(channel)||!this.ensureConfig().channels?.[channel]?.accounts?.[accountId])fail(409,'请先完成此渠道配置。');
  return this.operation('login',channel,async op=>{let pending='';await this.invoke(['channels','login','--channel',channel,'--account',accountId],{runtimeId:'managed',signal:op.abort.signal,timeout:120000,onOutput:text=>{pending=(pending+text).slice(-24000);const qr=qrOnly(pending);if(qr){op.qr=qr;op.qrExpiresAt=Date.now()+60000;op.stage='scan';}}});op.stage='checking';});
 }
 async probe(body){this.assertReal();const channel=channelOf(body.channel),accountId=accountOf(body.accountId),value=await this.json(['channels','status','--channel',channel,'--probe','--timeout','10000','--json'],{runtimeId:body.runtimeId??this.selected,timeout:15000});const account=value.channelAccounts?.[channel]?.find(a=>a.accountId===accountId);return {channel,accountId,configured:account?.configured===true,connected:!!account&&account.configured!==false&&account.running!==false&&(account.connected===true||account.probe?.ok===true),canRead:['slack','discord'].includes(channel)};}
 async manageGateway(body){this.assertReal();this.confirm(body);if(this.selected!=='managed')fail(409,'已有 OpenClaw 服务由原工具管理。','im_setup_existing_read_only');if(body.action==='stop'){await this.stopGateway();return this.status();}if(body.action!=='start')fail(400,'通信服务操作无效。');if(this.gateway)return this.status();if(this.mutating)fail(409,'请先完成通信配置。','im_setup_busy');const config=this.ensureConfig();if(!Object.keys(config.channels??{}).length)fail(409,'请先配置一个通信渠道。');this.mutating=true;try{const port=await freePort();this.assertReal();config.gateway.port=port;this.writeConfig(config);const runtime=await this.resolveRuntime('managed');this.assertReal();
  const child=this.spawn(runtime.command,[...runtime.prefix,'gateway','run','--bind','loopback','--port',String(port)],{...runtime.options,shell:false,windowsHide:true,stdio:['ignore','ignore','ignore']});this.gateway=child;this.gatewayStatus='starting';child.once('spawn',()=>{if(this.gateway===child)this.gatewayStatus='running';});child.once('error',()=>{if(this.gateway===child){this.gateway=null;this.gatewayStatus='failed';}});child.once('close',()=>{if(this.gateway===child){this.gateway=null;this.gatewayStatus='stopped';}});return this.status();}finally{this.mutating=false;}
 }
 async stopGateway(){const child=this.gateway;if(!child)return;this.gateway=null;this.gatewayStatus='stopped';await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);child.once('close',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});}
 async connection(body){this.assertReal();const channel=channelOf(body.channel),accountId=accountOf(body.accountId);const runtimeId=this.selected;const probe=await this.probe({channel,accountId,runtimeId});if(!probe.connected)fail(409,'工具尚未确认账号在线，请先检查授权和服务。','im_setup_not_connected');if(!this.im)fail(503,'通信服务尚未接入。');const result=this.im.save({adapter:'openclaw',command:'openclaw',runtimeId,channel,accountId,target:body.target,selfId:body.selfId,name:body.name});return this.im.probe(result.id);}
 async handle({method,key,action,body={}}){
  if(method==='GET'&&!key)return {status:200,data:this.status()};this.assertReal();
  if(key==='operations'){const op=this.operations.get(action);if(!op)fail(404,'这次操作已结束或服务已重启，请重新检查连接。','im_setup_operation_missing');if(method==='DELETE'){op.abort.abort();await op.promise;}else if(method!=='GET')fail(405,'方法不支持');return {status:200,data:this.publicOperation(op)};}
  if(method!=='POST')fail(405,'方法不支持');const handlers={detect:()=>this.detect(body),select:()=>this.select(body),install:()=>this.install(body),channels:()=>this.channels(body),configure:()=>this.configure(body),login:()=>this.login(body),probe:()=>this.probe(body),gateway:()=>this.manageGateway(body),connection:()=>this.connection(body)};if(!handlers[key])fail(404,'接口不存在');return {status:['install','login'].includes(key)?202:200,data:await handlers[key]()};
 }
 async close(){this.closing=true;for(const op of this.operations.values())if(op.status==='running')op.abort.abort();await Promise.allSettled([...this.operations.values()].map(op=>op.promise));await this.stopGateway();}
}
