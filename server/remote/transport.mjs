import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PROTOCOL, MAX_REQUEST, fail, clean } from './common.mjs';

// This is the entire deployment allowlist. No dependency discovery, working tree,
// credentials, personal sources, node_modules, or user-selected paths are copied.
export const RUNTIME_FILES = Object.freeze([
  'server/remote/common.mjs','server/remote/locking.mjs','server/remote/rpc.mjs','server/remote/worker.mjs',
  'server/codex.mjs','server/team-runs.mjs','server/execution-settings.mjs','server/chat-bridge.mjs','server/provider-headers.mjs',
  'server/provider-test.mjs','server/attachment-input.mjs','server/http-error.mjs','server/task-event-activity.mjs',
  'server/identity.mjs','server/workspace-files.mjs','shared/brand.json','shared/provider-presets.mjs',
]);
export function runtimePackage() {
  const files=RUNTIME_FILES.map(name=>{const data=readFileSync(fileURLToPath(new URL('../../'+name,import.meta.url)));return {path:name,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),data:data.toString('base64')};});
  const version=createHash('sha256').update(JSON.stringify(files.map(({data,...file})=>file))).digest('hex');
  return {version,protocol:PROTOCOL,files};
}
export const INSTALLER = `
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const allowed=${JSON.stringify(RUNTIME_FILES)};let input='',size=0;
function hash(x){return crypto.createHash('sha256').update(x).digest('hex')}
function dir(p){let c=path.parse(p).root;for(const x of p.slice(c.length).split(path.sep).filter(Boolean)){c=path.join(c,x);if(!fs.existsSync(c))fs.mkdirSync(c,{mode:448});const s=fs.lstatSync(c);if(s.isSymbolicLink()||!s.isDirectory())throw Error('Unsafe runtime directory');}return p}
process.stdin.on('data',x=>{size+=x.length;if(size>2097152){process.stderr.write('Runtime package too large');process.exit(1)}input+=x});
process.stdin.on('end',()=>{try{const p=JSON.parse(input);if(p.protocol!==${PROTOCOL}||!Array.isArray(p.files)||p.files.length!==allowed.length||new Set(p.files.map(f=>f.path)).size!==allowed.length)throw Error('Invalid runtime manifest');
const manifest=p.files.map(({data,...f})=>f);if(hash(JSON.stringify(manifest))!==p.version||!/^[a-f0-9]{64}$/.test(p.version))throw Error('Runtime digest mismatch');
for(const f of p.files){if(!allowed.includes(f.path))throw Error('Unexpected runtime file');const b=Buffer.from(f.data,'base64');if(b.length!==f.size||hash(b)!==f.sha256)throw Error('Runtime file digest mismatch');}
const root=dir(path.join(os.homedir(),'.local','share','secondu-remote','releases',p.version));
for(const f of p.files){const target=path.join(root,f.path);dir(path.dirname(target));if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||hash(fs.readFileSync(target))!==f.sha256)throw Error('Existing runtime file changed');}else fs.writeFileSync(target,Buffer.from(f.data,'base64'),{mode:384,flag:'wx'});}
process.stdout.write(JSON.stringify({ok:true,result:{version:p.version,protocol:p.protocol,runtimePath:path.join(root,'server','remote','rpc.mjs')}}));
}catch(e){process.stdout.write(JSON.stringify({ok:false,error:{code:'remote_install_failed',message:e.message,status:409}}));process.exitCode=1;}});`;
export const PROBE = `
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');let input='';
process.stdin.on('data',x=>{input+=x;if(input.length>10000)process.exit(1)});process.stdin.on('end',()=>{try{const p=JSON.parse(input),v=process.versions.node.split('.').map(Number);if(v[0]<22||v[0]===22&&v[1]<13)throw Error('远端需要 Node.js 22.13 或更新版本。');if(process.platform==='win32')throw Error('当前远端运行支持 macOS 或 Linux。');if(!path.isAbsolute(p.workspaceRoot))throw Error('工作目录需要绝对路径。');const workspaceRoot=fs.realpathSync(p.workspaceRoot);if(!fs.statSync(workspaceRoot).isDirectory())throw Error('工作目录不存在。');
const paths=(process.env.PATH||'').split(path.delimiter).map(x=>path.join(x,'codex')).concat(['/opt/homebrew/bin/codex','/usr/local/bin/codex',path.join(os.homedir(),'Applications','Codex.app','Contents','Resources','codex'),'/Applications/Codex.app/Contents/Resources/codex']);let command;for(const c of paths){try{fs.accessSync(c,fs.constants.X_OK);if(fs.statSync(c).isFile()){command=c;break}}catch{}}
if(!command)throw Error('远端未找到 Codex CLI；准备运行组件不会安装第三方软件。');const r=cp.spawnSync(command,['--version'],{encoding:'utf8',timeout:8000,maxBuffer:8192});if(r.status!==0)throw Error('远端 Codex CLI 无法启动。');process.stdout.write(JSON.stringify({ok:true,result:{protocol:${PROTOCOL},node:process.versions.node,nodePath:process.execPath,platform:process.platform,codex:r.stdout.trim().slice(0,200),codexPath:command,workspaceRoot,checkedAt:new Date().toISOString()}}));}catch(e){process.stdout.write(JSON.stringify({ok:false,error:{code:'remote_prerequisites',message:e.message,status:409}}));process.exitCode=1;}});`;

export function shellQuote(value) { return "'"+String(value).replaceAll("'","'\\''")+"'"; }
export function sshArgs(computer, command) {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,252}$/.test(computer.host)||computer.user&&!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(computer.user))throw fail('远端主机或用户名无效。');
  if(!Number.isInteger(computer.port)||computer.port<1||computer.port>65535)throw fail('远端端口无效。');
  return ['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no','-o','NumberOfPasswordPrompts=0','-o','ConnectTimeout=10','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-o','ClearAllForwardings=yes','-o','ForwardAgent=no','-o','ForwardX11=no','-o','PermitLocalCommand=no','-p',String(computer.port),...(computer.user?['-l',computer.user]:[]),'--',computer.host,command];
}
export async function processJson(command,args,input,{timeoutMs=30000,env,secret='',spawnImpl=spawn}={}) {
  const payload=JSON.stringify(input);if(Buffer.byteLength(payload)>MAX_REQUEST)throw fail('远端请求超过大小限制。','remote_request_limit',413);
  return new Promise((resolve,reject)=>{
    const child=spawnImpl(command,args,{stdio:['pipe','pipe','pipe'],...(env?{env}:{})});
    const chunks=[];let bytes=0,stderr='',finished=false;
    const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{child.kill();done(fail('连接超时；远端任务可能仍在执行，请恢复查询。','remote_disconnected',503));},timeoutMs);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_REQUEST){child.kill();done(fail('远端响应超过容量限制。','remote_response_limit',502));}else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{stderr=clean((stderr+chunk.toString()).slice(-4000),secret);});
    child.once('error',error=>done(fail(error.code==='ENOENT'?'未找到本机 SSH 客户端。':clean(error.message,secret),'remote_disconnected',503)));
    child.stdin.on('error',()=>{});
    child.once('close',()=>{if(finished)return;let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return done(fail(stderr||'连接中断，未获得远端状态。','remote_disconnected',503));}if(value.ok!==true)return done(fail(clean(value.error?.message??'远端操作失败。',secret),value.error?.code??'remote_operation_failed',value.error?.status??502));done(null,value.result);});
    child.stdin.end(payload);
  });
}
export class SshRemoteTransport {
  async execute(computer,command,input,options) { return processJson('ssh',sshArgs(computer,command),input,options); }
  async probe(computer) { return this.execute(computer,`node -e ${shellQuote(PROBE)}`,{workspaceRoot:computer.workspaceRoot}); }
  async prepare(computer,pkg) { return this.execute(computer,`${shellQuote(computer.probe.nodePath)} -e ${shellQuote(INSTALLER)}`,pkg); }
  async call(computer,request) {
    const command=`${shellQuote(computer.probe.nodePath)} ${shellQuote(computer.runtime.runtimePath)}`;
    return this.execute(computer,command,request,{secret:request.input?.apiKey});
  }
}
