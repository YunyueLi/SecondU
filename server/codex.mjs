import { runtimePolicy, contextUsageFromRuntime } from './execution-settings.mjs';
import brand from '../shared/brand.json' with {type:'json'};
import { providerHeaders } from './provider-headers.mjs';
import { HITHER_BASE_INSTRUCTIONS, HITHER_DEVELOPER_INSTRUCTIONS } from './identity.mjs';
import { EventEmitter } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, realpath } from 'node:fs/promises';
import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inlineImage, ATTACHMENT_COUNT, MULTIMODAL_REQUEST_LIMIT } from './attachment-input.mjs';
import { taskEventActivity } from './task-event-activity.mjs';

const execFileAsync = promisify(execFile);
const MAX_MESSAGE_BYTES = MULTIMODAL_REQUEST_LIMIT;
const API_KEY_ENV = 'HITHER_PROVIDER_API_KEY';
const clientInfo = { name: 'hither', title: `${brand.name}`, version: '0.1.0' };

export function codexCommand() {
  const configured=process.env.HITHER_CODEX_BIN || process.env.HITHER_CODEX_BINARY;
  if(configured)return configured;
  const executable=file=>{try{accessSync(file,constants.X_OK);return statSync(file).isFile();}catch{return false;}};
  for(const directory of (process.env.PATH??'').split(path.delimiter).filter(Boolean)){
    const candidate=path.resolve(directory,process.platform==='win32'?'codex.exe':'codex');
    if(executable(candidate))return candidate;
  }
  if(process.platform==='darwin'){
    const candidates=['/opt/homebrew/bin/codex','/usr/local/bin/codex'];
    for(const apps of ['/Applications',path.join(os.homedir(),'Applications')]){
      candidates.push(path.join(apps,'Codex.app/Contents/Resources/codex'));
      for(const app of ['Codex.app','ChatGPT.app'])candidates.push(path.join(apps,app,'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'));
    }
    const installed=candidates.find(executable);
    if(installed)return installed;
  }
  return 'codex';
}

function runtimeError(message, code = 'CODEX_RUNTIME_ERROR') {
  return Object.assign(new Error(message), { code });
}

function cancelledError() {
  return Object.assign(new Error('任务已取消。已发出中断请求，未完成的操作不会被标记为成功。'), { name: 'AbortError', code: 'CANCELLED' });
}

function redact(value, secret) {
  const text = String(value ?? '');
  return secret ? text.split(secret).join('[已隐藏凭据]') : text;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // A subprocess can fail before its caller reaches the next await.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** Newline-delimited app-server RPC. No shell, HTTP bridge, or automatic retries. */
export class AppServerTransport extends EventEmitter {
  constructor({ command = codexCommand(), args = [], cwd, env,
    spawnImpl = spawn, requestTimeoutMs = 20_000, secret = '' } = {}) {
    super();
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.stderr = '';
    this.secret = secret;
    this.requestTimeoutMs = requestTimeoutMs;
    this.closed = false;
    this.exited = deferred();
    this.group = process.platform !== 'win32' && spawnImpl === spawn;
    this.child = spawnImpl(command, ['app-server', '--listen', 'stdio://', ...args], {
      cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: this.group, windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.child.stderr.on('data', chunk => {
      this.stderr = redact((this.stderr + chunk).slice(-8192), this.secret);
    });
    this.child.stdin.on('error', error => this.fail(runtimeError(redact(error.message, secret))));
    this.child.once('error', error => this.fail(runtimeError(
      error.code === 'ENOENT' ? '未找到 Codex 运行时，请在本机安装 Codex CLI。' : redact(error.message, secret),
      error.code === 'ENOENT' ? 'CODEX_UNAVAILABLE' : 'CODEX_PROCESS_ERROR')));
    this.child.once('close', (code, signal) => {
      this.exited.resolve();
      const suffix = this.stderr.trim() ? `\n${this.stderr.trim().slice(-2000)}` : '';
      this.fail(runtimeError(`Codex 进程已退出（${signal || (code ?? '未知状态')}）。${suffix}`, 'CODEX_PROCESS_EXITED'));
    });
  }

  read(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > MAX_MESSAGE_BYTES) {
      this.fail(runtimeError('Codex 返回的数据超过本机消息大小限制。', 'CODEX_PROTOCOL_ERROR'));
      this.kill('SIGTERM');
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch {
        this.fail(runtimeError('Codex 返回了无效的协议消息。', 'CODEX_PROTOCOL_ERROR'));
        this.kill('SIGTERM');
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        this.fail(runtimeError('Codex 返回了无效的协议消息。', 'CODEX_PROTOCOL_ERROR'));
        this.kill('SIGTERM');
        return;
      }
      if (message.method) {
        this.emit(Object.hasOwn(message, 'id') ? 'request' : 'notification', message);
      } else if (Object.hasOwn(message, 'id')) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(runtimeError(redact(message.error.message, this.secret), 'CODEX_RPC_ERROR'));
        else pending.resolve(message.result);
      }
    }
  }

  write(message) {
    if (this.closed) throw runtimeError('Codex 连接已关闭。', 'CODEX_CONNECTION_CLOSED');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    if (this.closed) return Promise.reject(runtimeError('Codex 连接已关闭。', 'CODEX_CONNECTION_CLOSED'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(runtimeError(`Codex 请求超时：${method}。未自动重试。`, 'CODEX_TIMEOUT'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      }
    });
  }

  notify(method, params) { this.write({ method, ...(params === undefined ? {} : { params }) }); }
  respond(id, result) { this.write({ id, result }); }
  rejectRequest(id, message) { this.write({ id, error: { code: -32601, message } }); }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer); pending.reject(error);
    }
    this.pending.clear();
    this.emit('failure', error);
  }

  kill(signal) {
    try {
      if (this.group && this.child.pid) process.kill(-this.child.pid, signal);
      else this.child.kill(signal);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }

  async close(graceMs = 1000) {
    this.fail(runtimeError('Codex 连接已关闭。', 'CODEX_CONNECTION_CLOSED'));
    this.child.stdin.end();
    this.kill('SIGTERM');
    let timer;
    await Promise.race([this.exited.promise, new Promise(resolve => { timer = setTimeout(resolve, graceMs); })]);
    clearTimeout(timer);
    // Kill the process group too: a terminal child may outlive app-server.
    this.kill('SIGKILL');
  }
}

export async function probeCodex({ command = codexCommand() } = {}) {
  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 5000, maxBuffer: 16_384, windowsHide: true });
    const version = stdout.trim();
    return version.startsWith('codex-cli ') ? { available: true, version } : { available: false };
  } catch { return { available: false }; }
}

function toml(value) {
  if (Array.isArray(value)) return `[${value.map(toml).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function providerConfig(settings) {
  if (!settings || settings.api !== 'responses') throw runtimeError('当前运行时需要 Responses API 配置。', 'INVALID_PROVIDER');
  if (typeof settings.model !== 'string' || !settings.model.trim() || settings.model.length > 200 || /[\r\n\0]/u.test(settings.model)) {
    throw runtimeError('请先填写有效的模型名称。', 'INVALID_PROVIDER');
  }
  let url;
  try { url = new URL(settings.baseUrl); } catch { throw runtimeError('模型服务地址无效。', 'INVALID_PROVIDER'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !loopback) || url.username || url.password || url.search || url.hash) {
    throw runtimeError('模型地址须为 HTTPS（本机服务可用 HTTP），且不能包含凭据、查询参数或片段。', 'INVALID_PROVIDER');
  }
  return { name: `${brand.name} Responses`, base_url: url.href.replace(/\/+$/u, ''), wire_api: 'responses',
    env_key: API_KEY_ENV, requires_openai_auth: false, supports_websockets: false,
    request_max_retries: 0, stream_max_retries: 0, http_headers: providerHeaders(settings) };
}

/**
 * One subprocess per active task. Reuse codexHome and threadId to resume explicitly.
 * Provider compatibility is not established by a successful local RPC handshake.
 */
export async function runCodex({ workspace, settings, apiKey, prompt='', images=[], threadId,
  onEvent = () => {}, onApproval, signal, codexHome, approvalMode = 'ask', dynamicTools = [], onDynamicTool, allowSubagents = true,
  transportFactory = options => new AppServerTransport(options), requestTimeoutMs = 20_000 } = {}) {
  if (signal?.aborted) throw cancelledError();
  const policy = runtimePolicy(approvalMode);
  const provider = providerConfig(settings);
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw runtimeError('请先配置模型 API Key。', 'MISSING_API_KEY');
  if(!Array.isArray(images)||images.length>ATTACHMENT_COUNT)throw runtimeError('每轮最多输入 6 张图片。','INVALID_IMAGE_INPUT');
  const imageInput=images.map(image=>{if(image?.type!=='image')throw runtimeError('图片输入必须使用已验证的本地原件。','INVALID_IMAGE_INPUT');inlineImage(image.url);return {type:'image',url:image.url};});
  if (typeof prompt !== 'string' || (!prompt.trim()&&!imageInput.length)) throw runtimeError('任务内容不能为空。', 'INVALID_PROMPT');
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) throw runtimeError('任务工作目录必须是绝对路径。', 'INVALID_WORKSPACE');
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  workspace = await realpath(workspace);
  codexHome = path.resolve(codexHome || path.join(path.dirname(workspace), '.hither-codex', path.basename(workspace)));
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  codexHome = await realpath(codexHome);
  if (isWithin(workspace, codexHome) || isWithin(codexHome, workspace)) {
    throw runtimeError('运行时状态目录与任务工作目录必须相互独立。', 'INVALID_WORKSPACE');
  }
  const config = {
    ...(allowSubagents ? {} : {'features.multi_agent':false,'features.multi_agent_v2':false}),
    model_provider: 'hither', model: settings.model.trim(),
    'model_providers.hither': provider,
    approval_policy: policy.approvalPolicy, approvals_reviewer: policy.approvalsReviewer,
    // The legacy workspace-write policy allows reads across the whole host.
    // This named profile instead permits minimal OS reads and this directory only.
    ...(approvalMode === 'full' ? { sandbox_mode: 'danger-full-access' } : {
      default_permissions: 'hither',
      'permissions.hither.filesystem': { ':minimal': 'read', [workspace]: 'write' },
      'permissions.hither.network.enabled': false,
    }),
    'shell_environment_policy.inherit': 'none',
    'shell_environment_policy.set': { PATH: process.env.PATH || '/usr/bin:/bin', HOME: workspace },
    allow_login_shell: false, project_doc_max_bytes: 0,
    web_search: 'disabled', 'analytics.enabled': false,
    'feedback.enabled': false, 'history.persistence': 'none',
    'features.memories': false, 'features.remote_control': false,
    'features.remote_plugin': false, check_for_update_on_startup: false,
  };
  // Reqwest can discover the macOS system proxy even with an isolated env.
  // Keep local protocol bridges on loopback; remote providers keep their proxy.
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: codexHome, CODEX_HOME: codexHome,
    NO_PROXY: 'localhost,127.0.0.1,::1', no_proxy: 'localhost,127.0.0.1,::1',
    [API_KEY_ENV]: apiKey, RUST_LOG: 'error' };
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const transport = transportFactory({ cwd: workspace, env, secret: apiKey, requestTimeoutMs,
    args: Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]) });
  const done = deferred();
  const stopped = deferred();
  const messages = new Map();
  const items = new Map();
  const childThreads = new Set();
  const declaredTools = new Set(dynamicTools.map(tool => tool.name));
  const handledToolCalls = new Set();
  let currentThread = threadId;
  let currentTurn;
  let turnFinished = false;
  let wasCancelled = false;
  let finishing = false;
  let stopError;
  let eventQueue = Promise.resolve();
  const stop = error => { stopError ||= error; stopped.reject(stopError); };
  const emit = event => {
    const { activity, ...fields } = event;
    const lifecycle = taskEventActivity(activity, value => redact(value, apiKey));
    const safe = { ...fields, label: redact(event.label, apiKey), ...(event.detail === undefined ? {} : { detail: redact(event.detail, apiKey) }), ...(lifecycle ? {activity:lifecycle} : {}) };
    eventQueue = eventQueue.then(() => onEvent(safe));
    eventQueue.catch(stop);
    return eventQueue;
  };
  const request = (method, params) => stopError ? Promise.reject(stopError) : Promise.race([transport.request(method, params), stopped.promise]);
  const abort = () => { wasCancelled = true; stop(cancelledError()); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  transport.on('failure', error => { if (!finishing) stop(error); });
  transport.on('notification', ({ method, params = {} }) => {
    // Native Codex delegation is runtime evidence. Preserve its bounded IDs and
    // states before the root-turn filter, without treating child replies as the
    // root result or silently granting child tool requests new permissions.
    const nativeItem=params.item;
    const bounded=value=>typeof value==='string'?value.slice(0,1000):null;
    const nativeDetail=value=>{
      const trim=(part,limit)=>typeof part==='string'?part.slice(0,limit):Array.isArray(part)?part.map(item=>trim(item,limit)):part&&typeof part==='object'?Object.fromEntries(Object.entries(part).map(([key,item])=>[key,trim(item,limit)])):part;
      let detail=JSON.stringify(value);
      for(let limit=512;detail.length>14000&&limit>=16;limit/=2)detail=JSON.stringify({...trim(value,limit),truncated:true});
      return detail;
    };
    if(['item/started','item/completed'].includes(method)&&nativeItem&&['collabAgentToolCall','subAgentActivity'].includes(nativeItem.type)&&(!params.threadId||params.threadId===currentThread||childThreads.has(params.threadId))) {
      if(nativeItem.type==='collabAgentToolCall'){
        for(const thread of nativeItem.receiverThreadIds??[])if(typeof thread==='string'&&childThreads.size<64)childThreads.add(thread);
        emit({type:'runtime.collaboration',label:method==='item/started'?'Codex 开始协作操作':'Codex 协作操作已返回',detail:nativeDetail({itemId:bounded(nativeItem.id),tool:bounded(nativeItem.tool),status:bounded(nativeItem.status),senderThreadId:bounded(nativeItem.senderThreadId),receiverThreadIds:(nativeItem.receiverThreadIds??[]).slice(0,8).map(bounded),prompt:bounded(nativeItem.prompt),model:bounded(nativeItem.model),reasoningEffort:bounded(nativeItem.reasoningEffort),agentsStates:Object.fromEntries(Object.entries(nativeItem.agentsStates??{}).slice(0,8).map(([key,state])=>[key.slice(0,128),{status:String(state?.status??'unknown').slice(0,40),message:typeof state?.message==='string'?state.message.slice(0,400):null}])),omittedAgents:Math.max(0,Object.keys(nativeItem.agentsStates??{}).length-8)})});
      }else {if(typeof nativeItem.agentThreadId==='string'&&childThreads.size<64)childThreads.add(nativeItem.agentThreadId);emit({type:'runtime.subagent_activity',label:'Codex 子任务状态已更新',detail:nativeDetail({itemId:bounded(nativeItem.id),kind:bounded(nativeItem.kind),agentThreadId:bounded(nativeItem.agentThreadId),agentPath:bounded(nativeItem.agentPath)})});}
    }
    if (params.threadId && currentThread && params.threadId !== currentThread) return;
    if (params.turnId && currentTurn && params.turnId !== currentTurn) return;
    if (method === 'turn/started') currentTurn = params.turn?.id;
    if (method === 'item/autoApprovalReview/started' || method === 'item/autoApprovalReview/completed') {
      const review = params.review;
      if (review && ['inProgress', 'approved', 'denied', 'timedOut', 'aborted'].includes(review.status)) emit({
        type: 'runtime.auto_review', label: ({inProgress:'正在自动审查操作',approved:'自动审查已批准',denied:'自动审查已拒绝',timedOut:'自动审查超时',aborted:'自动审查已中止'})[review.status],
        detail: JSON.stringify({reviewId:params.reviewId,status:review.status,riskLevel:review.riskLevel??null,rationale:review.rationale??null}),
      });
    }
    if (method === 'thread/tokenUsage/updated') {
      const usage = contextUsageFromRuntime(params.tokenUsage);
      if (usage) emit({ type: 'runtime.usage', label: '运行时用量已更新', usage });
    }
    if (method === 'turn/plan/updated' && Array.isArray(params.plan)) {
      emit({ type: 'runtime.plan', label: params.plan.find(step => step.status === 'inProgress')?.step || '任务计划',
        detail: JSON.stringify({ explanation: params.explanation ?? null, plan: params.plan }) });
    }
    if (method === 'item/agentMessage/delta') {
      const existing = messages.get(params.itemId) || { text: '', phase: null };
      messages.set(params.itemId, { ...existing, text: existing.text + (params.delta || '') });
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = params.item;
      if (!item) return;
      items.set(item.id, item);
      const completed = method === 'item/completed';
      // A resumed task can reuse a native item ID in a later turn. Pair only
      // within this thread/turn, without moving command arguments into metadata.
      const callId = typeof item.id === 'string' && item.id ? `${currentThread || ''}/${params.turnId || currentTurn || ''}/${item.id}` : undefined;
      if (item.type === 'agentMessage' && completed) {
        messages.set(item.id, item);
        emit({ type: 'runtime.message', label: 'Agent 已回复', detail: item.text,
          activity: {kind:'message',phase:'completed',callId,...(['commentary','final_answer'].includes(item.phase)?{messagePhase:item.phase}:{})} });
      } else if (item.type === 'reasoning' && completed && Array.isArray(item.summary)) {
        const summary = item.summary.map(part => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '').filter(part => part.trim()).join('\n\n');
        if (summary) emit({ type: 'runtime.reasoning_summary', label: '思考摘要', detail: summary });
      } else if (['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch'].includes(item.type)) {
        const labels = { commandExecution: '本机命令', fileChange: '文件修改', mcpToolCall: '工具调用', webSearch: '网页检索' };
        const kinds = { commandExecution:'command', fileChange:'file_change', mcpToolCall:'tool', webSearch:'web_search' };
        const failed = ['failed', 'declined'].includes(item.status) || (item.exitCode != null && item.exitCode !== 0);
        emit({ type: failed ? 'runtime.action_failed' : 'runtime.action',
          label: `${labels[item.type]}${completed ? (failed ? '未成功' : '已结束') : '开始'}`,
          detail: item.type === 'commandExecution' ? `${item.command}\n${item.aggregatedOutput || ''}` : JSON.stringify(item),
          activity: {kind:kinds[item.type],phase:item.status==='declined'?'rejected':failed?'failed':completed?'completed':'running',callId,
            ...(item.type==='mcpToolCall'&&typeof item.tool==='string'?{name:[item.server,item.tool].filter(part=>typeof part==='string'&&part).join(' / ')}:{})} });
      }
    }
    if (method === 'error') {
      emit({ type: 'runtime.error', label: params.willRetry ? '运行时报告重试' : '运行时报告错误', detail: params.error?.message || '未知错误' });
      if (!params.willRetry) done.reject(runtimeError(params.error?.message || 'Codex 执行失败。', 'CODEX_TURN_FAILED'));
    }
    if (method === 'turn/completed') {
      if (currentTurn && params.turn?.id !== currentTurn) return;
      turnFinished = true;
      for (const item of params.turn?.items || []) if (item.type === 'agentMessage') messages.set(item.id, item);
      if (params.turn?.status === 'completed') done.resolve();
      else if (params.turn?.status === 'interrupted') done.reject(cancelledError());
      else done.reject(runtimeError(params.turn?.error?.message || `Codex 轮次未成功完成：${params.turn?.status || '未知状态'}`, 'CODEX_TURN_FAILED'));
    }
  });
  transport.on('request', message => {
    const handle = async () => {
      const { id, method, params = {} } = message;
      if (wasCancelled || (params.threadId && params.threadId !== currentThread) || (currentTurn && params.turnId && params.turnId !== currentTurn)) {
        transport.rejectRequest(id, 'This request no longer belongs to the active turn.');
        return;
      }
      if (method === 'item/tool/call') {
        // Only tools declared for this exact thread are callable. Never replay a
        // dynamic call, including while its approval is still pending.
        if (finishing || turnFinished || typeof params.callId !== 'string' || !params.callId ||
          params.namespace != null || !declaredTools.has(params.tool) || handledToolCalls.has(params.callId) || !onDynamicTool) {
          transport.respond(id, { success: false, contentItems: [{ type: 'inputText', text: 'This tool call is unavailable or has already been handled.' }] });
          return;
        }
        handledToolCalls.add(params.callId);
        const result = await Promise.race([Promise.resolve().then(() => onDynamicTool(params)), stopped.promise]);
        if (!wasCancelled && !finishing && !turnFinished) transport.respond(id, result);
        return;
      }
      if (method === 'item/permissions/requestApproval') {
        transport.respond(id, { permissions: {}, scope: 'turn' });
        await emit({ type: 'runtime.approval_rejected', label: '已拒绝扩大本轮权限', detail: '请由 Agent 对具体操作逐次申请审批。' });
        return;
      }
      if (method === 'item/tool/requestUserInput') {
        transport.respond(id, { answers: {} });
        const questions = (params.questions || []).map(question => question.question).join('\n');
        stop(runtimeError(`Agent 需要补充信息，请在任务中回复后继续。${questions ? `\n${questions}` : ''}`, 'INPUT_REQUIRED'));
        return;
      }
      const command = method === 'item/commandExecution/requestApproval';
      const fileChange = method === 'item/fileChange/requestApproval';
      if (!command && !fileChange) {
        transport.rejectRequest(id, `SecondU does not support ${method}. No permission was granted.`);
        await emit({ type: 'runtime.unsupported', label: '运行时请求尚不支持', detail: method });
        return;
      }
      const item = items.get(params.itemId);
      const details = command ? JSON.stringify({ command: params.command, cwd: params.cwd, kind: params.kind || 'command', network: params.networkApprovalContext }, null, 2)
        : JSON.stringify(item?.changes, null, 2);
      // A grantRoot widens the session; an incomplete or enormous request cannot be reviewed faithfully.
      const reviewable = !params.grantRoot && details && details.length <= 65_536 && (command ? !!params.command : !!item?.changes?.length);
      let decision = 'reject';
      if (reviewable && onApproval && approvalMode !== 'full') {
        await emit({ type: 'runtime.approval', label: '等待本次操作审批', detail: params.reason || (command ? '本机命令需要确认。' : '文件修改需要确认。') });
        decision = await Promise.race([Promise.resolve().then(() => onApproval({
          id: `codex-${currentThread}-${params.turnId || currentTurn}-${String(id)}`,
          title: command ? '批准这一次本机命令' : '批准这一次文件修改',
          description: redact(params.reason || '审批仅适用于列出的这一次操作。', apiKey),
          details: redact(details, apiKey),
        })), stopped.promise]);
      }
      if (wasCancelled) return;
      transport.respond(id, { decision: decision === 'approve' ? 'accept' : 'decline' });
      await emit({ type: 'runtime.approval_resolved', label: decision === 'approve' ? '本次操作已批准' : '本次操作已拒绝' });
    };
    handle().catch(stop);
  });
  try {
    await emit({ type: 'runtime.connecting', label: '正在连接本机运行时' });
    await request('initialize', { clientInfo, capabilities: { experimentalApi: dynamicTools.length > 0 || approvalMode === 'auto' } });
    transport.notify('initialized');
    const effective = (await request('config/read', { includeLayers: false })).config;
    if (!allowSubagents && (effective?.features?.multi_agent !== false || effective?.features?.multi_agent_v2 !== false)) {
      throw runtimeError('本机 Codex 未确认禁用专家的再次委派，已停止本轮团队执行。', 'CODEX_TEAM_BOUNDARY_UNSUPPORTED');
    }
    const fs = effective?.permissions?.hither?.filesystem;
    if (effective?.approval_policy !== policy.approvalPolicy || effective?.approvals_reviewer !== policy.approvalsReviewer) {
      throw runtimeError('本机 Codex 未确认所选审批策略，已停止运行；没有改用更宽松的策略。', 'CODEX_APPROVAL_POLICY_UNSUPPORTED');
    }
    if (approvalMode === 'full' ? effective?.sandbox_mode !== 'danger-full-access' || effective?.default_permissions != null : effective?.default_permissions !== 'hither' || fs?.[':minimal'] !== 'read' || fs?.[workspace] !== 'write'
      || Object.entries(fs || {}).some(([key, value]) => value != null && ![':minimal', workspace].includes(key))
      || effective?.permissions?.hither?.network?.enabled !== false) {
      throw runtimeError('本机 Codex 未确认任务目录权限配置，已停止运行。请升级到支持命名权限配置的版本。', 'CODEX_SANDBOX_UNSUPPORTED');
    }
    const threadParams = { cwd: workspace, model: settings.model.trim(), modelProvider: 'hither',
      approvalPolicy: policy.approvalPolicy, approvalsReviewer: policy.approvalsReviewer,
      ...(approvalMode === 'full' ? { sandbox: 'danger-full-access' } : {}),
      baseInstructions: HITHER_BASE_INSTRUCTIONS, developerInstructions: HITHER_DEVELOPER_INSTRUCTIONS };
    // Dynamic tool definitions are persisted by app-server and restored on resume.
    // ThreadResumeParams deliberately has no dynamicTools field in this schema.
    const response = await request(threadId ? 'thread/resume' : 'thread/start', { ...threadParams, ...(threadId ? { threadId } : dynamicTools.length ? { dynamicTools } : {}) });
    currentThread = response.thread?.id;
    if (!currentThread) throw runtimeError('Codex 未返回会话标识。', 'CODEX_PROTOCOL_ERROR');
    await emit({ type: 'runtime.thread', label: threadId ? '已恢复任务会话' : '已创建任务会话', detail: currentThread });
    const turn = await request('turn/start', { threadId: currentThread, cwd: workspace,
      input: [...(prompt.trim()?[{type:'text',text:prompt,text_elements:[]}]:[]),...imageInput], model: settings.model.trim(),
      ...(['low', 'medium', 'high', 'max'].includes(settings.reasoningEffort) ? { effort: settings.reasoningEffort } : {}),
      approvalPolicy: policy.approvalPolicy, approvalsReviewer: policy.approvalsReviewer,
      ...(approvalMode === 'full' ? { sandboxPolicy: { type: 'dangerFullAccess' } } : {}) });
    currentTurn = turn.turn?.id || currentTurn;
    if (!currentTurn) throw runtimeError('Codex 未返回执行轮次标识。', 'CODEX_PROTOCOL_ERROR');
    await Promise.race([done.promise, stopped.promise]);
    await eventQueue;
    const all = [...messages.values()];
    const final = all.filter(item => item.phase === 'final_answer');
    const text = (final.length ? final : all.slice(-1)).map(item => item.text).join('\n\n');
    await emit({ type: 'runtime.completed', label: '运行时已完成本轮任务' });
    return { text: redact(text, apiKey), threadId: currentThread };
  } catch (error) {
    if (!(error instanceof Error)) error = runtimeError(String(error));
    error.message = redact(error.message, apiKey);
    if (currentThread) error.threadId = currentThread;
    throw error;
  } finally {
    finishing = true;
    signal?.removeEventListener('abort', abort);
    // Even an unsupported input request or callback failure must stop any active tool loop.
    if (currentThread && currentTurn && !turnFinished && !transport.closed) {
      try { await transport.request('turn/interrupt', { threadId: currentThread, turnId: currentTurn }, 1500); } catch { /* Process shutdown remains the final stop. */ }
    }
    await transport.close();
  }
}
