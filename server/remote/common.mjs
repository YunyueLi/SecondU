import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, readdirSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { visibleWorkspaceEntry } from '../workspace-files.mjs';
import { providerIds } from '../../shared/provider-presets.mjs';

export const PROTOCOL = 1;
export const MAX_REQUEST = 16 * 1024 * 1024;
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const RUN_STATUSES = ['starting','running','awaiting_approval','completed','failed','cancelled','interrupted'];
export const terminal = status => ['completed', 'failed', 'cancelled', 'interrupted'].includes(status);
export const stamp = () => new Date().toISOString();
export const digest = value => createHash('sha256').update(value).digest('hex');
export function fail(message, code = 'remote_invalid_request', status = 400) { return Object.assign(new Error(message), { code, status }); }
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) throw fail('远端记录标识无效。');
  return value;
}
export function clean(value, secret = '') { return secret ? String(value ?? '').split(secret).join('[已隐藏凭据]') : String(value ?? ''); }
export function atomic(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); renameSync(temp, file); }
  finally { try { unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
}
export function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
export function privateDirectory(directory) {
  const absolute = path.resolve(directory), parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw fail('远端运行目录包含符号链接或非目录。', 'remote_unsafe_path');
  }
  return realpathSync(absolute);
}
export function runtimeDirectory() { return privateDirectory(path.join(os.homedir(), '.local', 'share', 'secondu-remote')); }
export function ownerDirectory(ownerId) { return privateDirectory(path.join(runtimeDirectory(), 'owners', identifier(ownerId))); }
export function inside(root, file) { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
export function workspaceDirectory(value, control) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) throw fail('请填写远端已存在的绝对工作目录。');
  const real = realpathSync(value);
  const runtime=runtimeDirectory();
  if (!lstatSync(real).isDirectory() || inside(real, runtime) || inside(runtime, real) || inside(real, control) || inside(control, real) || real === path.parse(real).root || real === os.homedir()) throw fail('工作目录须为独立项目目录，不能包含远端运行数据或整个用户目录。', 'remote_unsafe_workspace');
  return real;
}
export function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || /[\0\r\n\\]/.test(value) || path.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..' || !visibleWorkspaceEntry(part))) throw fail('文件路径须为工作目录内的普通相对路径，不能包含隐藏文件或凭据文件。', 'remote_unsafe_path');
  return value;
}
export function safeFile(root, value) {
  const relative = relativeFile(value), file = path.join(root, relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw fail('不能读取符号链接文件。', 'remote_unsafe_path');
  }
  if (!inside(root, realpathSync(file))) throw fail('文件超出工作目录。', 'remote_unsafe_path');
  return file;
}
export function readWorkspaceFile(root, value, limit = MAX_FILE_BYTES) {
  const file = safeFile(root, value), fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw fail('仅支持读取不超过 4 MiB 的普通文件。', 'remote_file_limit', 413);
    const data = readFileSync(fd);
    if (data.length > limit) throw fail('文件超过读取限制。', 'remote_file_limit', 413);
    const after = fstatSync(fd);
    if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs||stat.ctimeMs!==after.ctimeMs||data.length!==stat.size)throw fail('文件正在变化，请在保存完成后重新读取。','remote_file_changed',409);
    return { path: value, size: data.length, sha256: digest(data), data: data.toString('base64') };
  } finally { closeSync(fd); }
}
export function inventory(root) {
  const files = [], queue = ['']; let examined = 0, truncated = false;
  while (queue.length && !truncated) {
    const relative = queue.shift();
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (++examined > 5000 || files.length >= 1000) { truncated = true; break; }
      if (!visibleWorkspaceEntry(entry.name) || entry.isSymbolicLink()) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (name.split('/').length < 8) queue.push(name); continue; }
      if (!entry.isFile()) continue;
      try { const file = safeFile(root, name), stat = lstatSync(file); files.push({ path: name, size: stat.size, modifiedAt: stat.mtime.toISOString(), fingerprint: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` }); } catch { /* A changing or unsafe entry is not an artifact. */ }
    }
  }
  return { files, truncated };
}
export async function stdinJson(input = process.stdin) {
  const chunks = []; let size = 0;
  for await (const chunk of input) { size += chunk.length; if (size > MAX_REQUEST) throw fail('远端请求超过大小限制。', 'remote_request_limit', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('远端请求不是有效 JSON。'); }
}

export function plainObject(value, allowed, label = '请求') {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw fail(`${label}包含无效字段。`);
  return value;
}
export function boundedString(value, max, label, optional=false) {
  if(typeof value!=='string'||value.length>max||(!optional&&!value.trim())||value.includes('\0'))throw fail(`${label}无效或过长。`);
  return value.trim();
}
export function modelSettings(value) {
  plainObject(value,['provider','model','baseUrl','api','reasoningEffort','appTitle'],'模型连接');
  if(!providerIds.includes(value.provider)||!['responses','chat_completions','messages'].includes(value.api)||!['low','medium','high','max'].includes(value.reasoningEffort))throw fail('模型连接无效。');
  const model=boundedString(value.model,200,'模型名称'),baseUrl=boundedString(value.baseUrl,2000,'模型地址');
  let url;try{url=new URL(baseUrl);}catch{throw fail('模型地址无效。');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw fail('模型地址无效。');
  const appTitle=value.appTitle===undefined?undefined:boundedString(value.appTitle,100,'应用名称');
  if(appTitle&&/[^\x20-\x7e]/.test(appTitle))throw fail('应用名称须使用可打印英文字符。');
  return {provider:value.provider,model,baseUrl:url.href,api:value.api,reasoningEffort:value.reasoningEffort,...(appTitle?{appTitle}:{})};
}
/** Validate every byte and destination before any input file is written. */
export function inputManifest(files) {
  if(!Array.isArray(files)||files.length>6)throw fail('每次任务最多提供 6 个明确选择的文件。');
  const paths=new Set(),sources=new Set();let total=0;
  return files.map(file=>{
    plainObject(file,['attachmentId','path','size','sha256','data'],'文件清单');
    const relative=relativeFile(file.path),attachmentId=identifier(file.attachmentId);
    if([...paths].some(value=>value===relative||value.startsWith(relative+'/')||relative.startsWith(value+'/'))||sources.has(attachmentId))throw fail('输入文件或目标路径重复，或文件路径互相包含。','remote_input_duplicate');
    paths.add(relative);sources.add(attachmentId);
    if(!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_INPUT_BYTES||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||typeof file.data!=='string'||file.data.length>Math.ceil(MAX_INPUT_BYTES/3)*4||file.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw fail('输入文件清单无效。','remote_input_invalid');
    total+=file.size;if(total>MAX_INPUT_BYTES)throw fail('所选远端输入文件合计最多 8 MiB。','remote_input_limit',413);
    const data=Buffer.from(file.data,'base64');
    if(data.length!==file.size||data.toString('base64')!==file.data||digest(data)!==file.sha256)throw fail('输入文件与确认清单不一致。','remote_input_changed',409);
    return {attachmentId,path:relative,size:file.size,sha256:file.sha256,data:file.data};
  });
}
export function validateStart(input,control) {
  plainObject(input,['workspace','prompt','apiKey','credentialConsent','settings','files','durationMs','codexPath','computerRevision','modelRevision','requestId'],'远端任务');
  const workspace=workspaceDirectory(input.workspace,control),prompt=boundedString(input.prompt,100000,'任务内容');
  const apiKey=boundedString(input.apiKey,10000,'模型密钥');
  if(/[\r\n]/.test(apiKey)||input.credentialConsent!==true)throw fail('本次远端模型使用尚未获得确认。','remote_credential_consent');
  for(const key of ['computerRevision','modelRevision'])if(!Number.isSafeInteger(input[key])||input[key]<1)throw fail('本次授权缺少有效的配置版本。','remote_credential_consent');
  if(!Number.isSafeInteger(input.durationMs)||input.durationMs<1000||input.durationMs>86400000)throw fail('远端运行时限无效。');
  if(typeof input.codexPath!=='string'||!path.isAbsolute(input.codexPath)||/[\0\r\n]/.test(input.codexPath))throw fail('远端运行器路径无效。');
  // The probe may return a standard package-manager symlink. Resolve it once;
  // the worker starts this exact executable rather than a second PATH search.
  const codexPath=realpathSync(input.codexPath);
  const codexStat=lstatSync(codexPath);
  if(!codexStat.isFile()||!(codexStat.mode&0o111))throw fail('远端运行器不可执行。');
  return {workspace,prompt,apiKey,credentialConsent:true,settings:modelSettings(input.settings),files:inputManifest(input.files),durationMs:input.durationMs,codexPath,computerRevision:input.computerRevision,modelRevision:input.modelRevision,requestId:identifier(input.requestId)};
}
export function processAlive(pid) {
  if(!Number.isSafeInteger(pid)||pid<2)return false;
  try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}
export function executorAlive(state) {
  if(!Number.isSafeInteger(state.executorPid)||state.executorPid<2)return false;
  try{process.kill(-state.executorPid,0);return true;}catch(error){return error.code!=='ESRCH';}
}
/** A dead worker is interrupted; recovering the record never relaunches it. */
export function readRunState(directory) {
  const file=path.join(directory,'state.json'),state=readJson(file);
  if(!RUN_STATUSES.includes(state.status))throw fail('远端任务状态损坏。','remote_state_invalid',409);
  if(terminal(state.status))return {...state,executorUnconfirmed:executorAlive(state)};
  const elapsed=Date.now()-Date.parse(state.heartbeatAt??state.updatedAt);
  const stopped=state.pid?elapsed>15000&&!processAlive(state.pid):state.status==='starting'&&elapsed>30000;
  if(stopped){state.status='interrupted';state.approvals=[];state.finishedAt=stamp();state.updatedAt=stamp();state.executorUnconfirmed=executorAlive(state);state.error={code:'remote_worker_stopped',message:state.executorUnconfirmed?'远端任务管理进程已停止，运行器状态尚未确认；目录仍被保护，请先核对远端运行器。':'远端执行进程已停止，未自动重跑任务。请核对已有文件和操作结果。'};atomic(file,state);}
  return state;
}
