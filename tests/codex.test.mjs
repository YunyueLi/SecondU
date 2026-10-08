import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, rm, realpath, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppServerTransport, probeCodex, runCodex } from '../server/codex.mjs';
import { TEAM_TOOLS } from '../server/team-runs.mjs';
import { HITHER_BASE_INSTRUCTIONS, HITHER_DEVELOPER_INSTRUCTIONS } from '../server/identity.mjs';

const settings = { provider: 'custom', model: 'fixture-model', baseUrl: 'https://models.example.test/v1', api: 'responses', reasoningEffort: 'medium' };
const secret = 'fixture-secret-do-not-record';

async function taskDirectories(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hither-codex-test-'));
  const workspace = path.join(root, 'workspace');
  const codexHome = path.join(root, 'runtime');
  await mkdir(workspace);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { workspace: await realpath(workspace), codexHome };
}

class FixtureTransport extends EventEmitter {
  constructor(options, behavior = {}) {
    super(); this.options = options; this.behavior = behavior; this.calls = []; this.responses = []; this.closed = false;
  }
  async request(method, params) {
    this.calls.push({ method, params });
    if (this.behavior.request) {
      const answer = this.behavior.request(method, params, this);
      if (answer !== undefined) return answer;
    }
    if (method === 'initialize') return { userAgent: 'hither/fixture' };
    if (method === 'config/read') return { config: { features: {multi_agent:!this.options.args.includes('features.multi_agent=false'),multi_agent_v2:!this.options.args.includes('features.multi_agent_v2=false')}, approval_policy: 'on-request', approvals_reviewer: 'user', default_permissions: 'hither', permissions: { hither: {
      filesystem: { ':minimal': 'read', [this.options.cwd]: 'write' }, network: { enabled: false },
    } } } };
    if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: params.threadId || 'thread-fixture' } };
    if (method === 'turn/start') {
      this.threadId = params.threadId;
      this.turnId = 'turn-fixture';
      queueMicrotask(() => {
        this.notification('turn/started', { turn: { id: this.turnId } });
        if (this.behavior.start) this.behavior.start(this);
        else this.complete('真实协议的测试夹具；不是模型运行结果。');
      });
      return { turn: { id: this.turnId } };
    }
    if (method === 'turn/interrupt') return {};
    throw new Error(`Unexpected method ${method}`);
  }
  notification(method, params = {}) {
    this.emit('notification', { method, params: { threadId: this.threadId, turnId: this.turnId, ...params } });
  }
  serverRequest(method, params = {}, id = 91) {
    this.emit('request', { id, method, params: { threadId: this.threadId, turnId: this.turnId, itemId: 'item-fixture', ...params } });
  }
  complete(text = 'Finished', status = 'completed', error) {
    const item = { id: 'answer', type: 'agentMessage', phase: 'final_answer', text };
    this.notification('item/completed', { item });
    this.notification('turn/completed', { turn: { id: this.turnId, status, items: [item], error } });
  }
  notify(method) { this.calls.push({ method }); }
  respond(id, result) {
    this.responses.push({ id, result });
    this.behavior.response?.(id, result, this);
  }
  rejectRequest(id, message) { this.responses.push({ id, error: message }); }
  async close() { this.closed = true; }
}

async function fixtureRun(t, behavior = {}, overrides = {}) {
  const directories = await taskDirectories(t);
  let transport;
  const events = [];
  const options = { ...directories, settings, apiKey: secret, prompt: 'Write a short note.', onEvent: event => events.push(event),
    transportFactory: options => (transport = new FixtureTransport(options, behavior)), ...overrides };
  const promise = runCodex(options);
  return { promise, events, get transport() { return transport; }, options };
}

test('image-only input reaches the fixed Codex UserInput image contract with original bytes',async t=>{
  const url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const run=await fixtureRun(t,{}, {prompt:'',images:[{type:'image',url}]});await run.promise;
  assert.deepEqual(run.transport.calls.find(call=>call.method==='turn/start').params.input,[{type:'image',url}]);
  assert.ok(!JSON.stringify(run.events).includes('base64'),'image bytes must not become activity log text');
});

test('starts one real-protocol turn with isolated settings, bounded permissions, and no credential arguments', async t => {
  const run = await fixtureRun(t);
  assert.deepEqual(await run.promise, { text: '真实协议的测试夹具；不是模型运行结果。', threadId: 'thread-fixture' });
  const transport = run.transport;
  assert.deepEqual(transport.calls.map(call => call.method), ['initialize', 'initialized', 'config/read', 'thread/start', 'turn/start']);
  assert.equal(transport.options.env.HITHER_PROVIDER_API_KEY, secret);
  assert.equal(transport.options.env.OPENAI_API_KEY, undefined);
  assert.equal(transport.options.env.NO_PROXY, 'localhost,127.0.0.1,::1');
  assert.equal(transport.options.env.no_proxy, transport.options.env.NO_PROXY);
  assert.equal(transport.options.args.join(' ').includes(secret), false);
  assert.ok(transport.options.args.includes('shell_environment_policy.inherit="none"'));
  assert.ok(transport.options.args.includes('default_permissions="hither"'));
  const start = transport.calls.find(call => call.method === 'thread/start').params;
  assert.equal(start.approvalPolicy, 'on-request');
  assert.equal(start.approvalsReviewer, 'user');
  assert.equal(start.sandbox, undefined, 'must not replace the restricted named profile with legacy host-readable sandbox');
  assert.equal(start.baseInstructions, HITHER_BASE_INSTRUCTIONS);
  assert.equal(start.developerInstructions, HITHER_DEVELOPER_INSTRUCTIONS);
  assert.match(start.baseInstructions,/个人 Agent.*数字分身/);
  assert.match(start.developerInstructions,/没有后台跨应用采集/);
  assert.equal(transport.closed, true);
  assert.equal(run.events.at(-1).type, 'runtime.completed');
});

test('resumes exactly the supplied thread without silently starting a new conversation', async t => {
  const run = await fixtureRun(t, {}, { threadId: 'existing-thread' });
  assert.equal((await run.promise).threadId, 'existing-thread');
  assert.ok(run.transport.calls.some(call => call.method === 'thread/resume' && call.params.threadId === 'existing-thread'));
  assert.ok(!run.transport.calls.some(call => call.method === 'thread/start'));
  const resumed=run.transport.calls.find(call=>call.method==='thread/resume').params;
  assert.equal(resumed.baseInstructions,HITHER_BASE_INSTRUCTIONS,'resumed history must not retain the old generic coding identity');
  assert.equal(resumed.developerInstructions,HITHER_DEVELOPER_INSTRUCTIONS);
});

test('dynamic tools use the installed experimental schema and handle a call exactly once',async t=>{
  const definitions=[{type:'function',name:'hither_fixture',description:'Read selected source',inputSchema:{type:'object'}}];
  let calls=0;
  const run=await fixtureRun(t,{
    start:transport=>{
      transport.serverRequest('item/tool/call',{callId:'one-call',tool:'hither_fixture',arguments:{id:'source'}},101);
      transport.serverRequest('item/tool/call',{callId:'one-call',tool:'hither_fixture',arguments:{id:'source'}},102);
    },
    response:(id,_result,transport)=>{if(id===101)transport.complete();},
  },{dynamicTools:definitions,onDynamicTool:async params=>{calls++;assert.deepEqual(params.arguments,{id:'source'});return {success:true,contentItems:[{type:'inputText',text:'selected source'}]};}});
  await run.promise;
  assert.equal(calls,1);assert.equal(run.transport.responses.find(r=>r.id===102).result.success,false);
  assert.deepEqual(run.transport.calls.find(c=>c.method==='thread/start').params.dynamicTools,definitions);
  assert.equal(run.transport.calls.find(c=>c.method==='initialize').params.capabilities.experimentalApi,true);
  const resumed=await fixtureRun(t,{}, {threadId:'resumed-with-tools',dynamicTools:definitions});await resumed.promise;
  assert.equal(Object.hasOwn(resumed.transport.calls.find(c=>c.method==='thread/resume').params,'dynamicTools'),false);
});

test('runtime plan events retain the actual schema status and ignore unrelated threads',async t=>{
  const plan=[{step:'Read selected resources',status:'inProgress'},{step:'Produce answer',status:'pending'}];
  const run=await fixtureRun(t,{start:transport=>{
    transport.notification('turn/plan/updated',{threadId:'unrelated',plan:[{step:'unrelated',status:'inProgress'}]});
    transport.notification('turn/plan/updated',{explanation:'Use source evidence',plan});transport.complete();
  }});await run.promise;
  const events=run.events.filter(e=>e.type==='runtime.plan');assert.equal(events.length,1);assert.equal(events[0].label,'Read selected resources');
  assert.deepEqual(JSON.parse(events[0].detail),{explanation:'Use source evidence',plan});
});

for (const [decision, protocol] of [['approve', 'accept'], ['reject', 'decline']]) {
  test(`command approval ${decision} returns only a one-action ${protocol}`, async t => {
    let reviewed;
    const run = await fixtureRun(t, {
      start: transport => transport.serverRequest('item/commandExecution/requestApproval', {
        command: 'printf reviewed', cwd: '/fixture/workspace', reason: 'Confirm this action',
        proposedExecpolicyAmendment: ['printf'],
      }),
      response: (_id, _result, transport) => transport.complete(),
    }, { onApproval: approval => { reviewed = approval; return decision; } });
    await run.promise;
    assert.equal(run.transport.responses[0].result.decision, protocol);
    assert.match(reviewed.details, /printf reviewed/u);
    assert.ok(reviewed.id.includes('turn-fixture'));
    assert.equal(JSON.stringify(run.transport.responses).includes('acceptForSession'), false);
  });
}

test('a promise approval pauses until an explicit answer and never blocks transport notifications', async t => {
  let answer;
  const waiting = new Promise(resolve => { answer = resolve; });
  let approvalSeen;
  const seen = new Promise(resolve => { approvalSeen = resolve; });
  const run = await fixtureRun(t, {
    start: transport => transport.serverRequest('item/commandExecution/requestApproval', { command: 'some-action', cwd: '/fixture/workspace' }),
    response: (_id, _result, transport) => transport.complete(),
  }, { onApproval: () => { approvalSeen(); return waiting; } });
  await seen;
  assert.equal(run.transport.responses.length, 0);
  answer('approve');
  await run.promise;
  assert.equal(run.transport.responses[0].result.decision, 'accept');
});

test('file changes require inspectable edits; a session-wide grantRoot is rejected', async t => {
  let asked = false;
  const run = await fixtureRun(t, {
    start: transport => transport.serverRequest('item/fileChange/requestApproval', { grantRoot: '/outside' }),
    response: (_id, _result, transport) => transport.complete(),
  }, { onApproval: () => { asked = true; return 'approve'; } });
  await run.promise;
  assert.equal(asked, false);
  assert.deepEqual(run.transport.responses[0].result, { decision: 'decline' });
});

test('bulk permissions are denied instead of turning a single approval into broad access', async t => {
  const run = await fixtureRun(t, {
    start: transport => transport.serverRequest('item/permissions/requestApproval', { permissions: { network: { enabled: true } } }),
    response: (_id, _result, transport) => transport.complete(),
  }, { onApproval: () => { throw new Error('must not ask for bulk permissions'); } });
  await run.promise;
  assert.deepEqual(run.transport.responses[0].result, { permissions: {}, scope: 'turn' });
});

test('cancellation while approval is pending interrupts the active turn, closes runtime, and never approves later', async t => {
  const controller = new AbortController();
  let requested;
  const seen = new Promise(resolve => { requested = resolve; });
  let approveLater;
  const run = await fixtureRun(t, {
    start: transport => transport.serverRequest('item/commandExecution/requestApproval', { command: 'external-operation' }),
  }, { signal: controller.signal, onApproval: () => { requested(); return new Promise(resolve => { approveLater = resolve; }); } });
  await seen;
  controller.abort();
  await assert.rejects(run.promise, { name: 'AbortError', code: 'CANCELLED' });
  approveLater('approve');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.transport.responses.length, 0);
  assert.ok(run.transport.calls.some(call => call.method === 'turn/interrupt'));
  assert.equal(run.transport.closed, true);
});

test('failed turn is not reported completed, preserves thread ID, and redacts credentials', async t => {
  const run = await fixtureRun(t, { start: transport => transport.complete('', 'failed', { message: `provider rejected ${secret}` }) });
  await assert.rejects(run.promise, error => {
    assert.equal(error.code, 'CODEX_TURN_FAILED');
    assert.equal(error.threadId, 'thread-fixture');
    assert.equal(error.message.includes(secret), false);
    return true;
  });
  assert.equal(run.events.some(event => event.type === 'runtime.completed'), false);
});

test('cancellation at the thread event prevents sending turn/start', async t => {
  const controller = new AbortController();
  const run = await fixtureRun(t, {}, { signal: controller.signal,
    onEvent: event => { if (event.type === 'runtime.thread') controller.abort(); },
  });
  await assert.rejects(run.promise, { code: 'CANCELLED' });
  assert.equal(run.transport.calls.some(call => call.method === 'turn/start'), false);
});

test('unsupported interactive input stops truthfully instead of inventing an answer', async t => {
  const run = await fixtureRun(t, { start: transport => transport.serverRequest('item/tool/requestUserInput', { questions: [{ id: 'q', question: 'Which date?' }] }) });
  await assert.rejects(run.promise, error => error.code === 'INPUT_REQUIRED' && error.message.includes('Which date?'));
  assert.deepEqual(run.transport.responses[0].result, { answers: {} });
  assert.ok(run.transport.calls.some(call => call.method === 'turn/interrupt'));
});

test('fails closed before creating a thread if installed runtime does not confirm restricted permissions', async t => {
  const run = await fixtureRun(t, { request: method => method === 'config/read' ? { config: {approval_policy:'on-request',approvals_reviewer:'user'} } : undefined });
  await assert.rejects(run.promise, { code: 'CODEX_SANDBOX_UNSUPPORTED' });
  assert.equal(run.transport.calls.some(call => call.method === 'thread/start'), false);
});

test('callback persistence failure stops a running turn', async t => {
  const run = await fixtureRun(t, { start: transport => transport.complete() }, {
    onEvent: event => { if (event.type === 'runtime.message') throw new Error('storage unavailable'); },
  });
  await assert.rejects(run.promise, /storage unavailable/u);
  assert.equal(run.transport.closed, true);
});

test('rejects missing key and unsafe URL without starting a subprocess', async t => {
  const directories = await taskDirectories(t);
  const common = { ...directories, settings, prompt: 'hello', transportFactory: () => { throw new Error('must not spawn'); } };
  await assert.rejects(runCodex(common), { code: 'MISSING_API_KEY' });
  await assert.rejects(runCodex({ ...common, apiKey: secret, settings: { ...settings, baseUrl: 'http://remote.example.test/v1' } }), { code: 'INVALID_PROVIDER' });
});

function childFixture() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.signals = [];
  child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('close', null, signal)); };
  return child;
}

test('transport routes server requests independently while matching split RPC responses', async () => {
  const child = childFixture();
  const transport = new AppServerTransport({ spawnImpl: () => child, requestTimeoutMs: 1000 });
  const requests = [];
  transport.on('request', message => requests.push(message));
  const pending = transport.request('initialize', {});
  child.stdout.write('{"id":91,"method":"approval","params":{}}\n{"id":1,"res');
  child.stdout.write('ult":{"ok":true}}\n');
  assert.deepEqual(await pending, { ok: true });
  assert.equal(requests[0].id, 91);
  await transport.close();
});

test('transport rejects outstanding requests on malformed protocol and subprocess exit', async () => {
  for (const kind of ['invalid', 'exit']) {
    const child = childFixture();
    const transport = new AppServerTransport({ spawnImpl: () => child, secret });
    const pending = transport.request('initialize', {});
    if (kind === 'invalid') child.stdout.write('not-json\n');
    else { child.stderr.write(`error ${secret}`); child.emit('close', 1, null); }
    await assert.rejects(pending, error => !error.message.includes(secret) && error.code.startsWith('CODEX_'));
    await transport.close();
  }
});

test('transport request timeout is explicit and never retries the command', async () => {
  const child = childFixture();
  let writes = '';
  child.stdin.on('data', chunk => { writes += chunk; });
  const transport = new AppServerTransport({ spawnImpl: () => child, requestTimeoutMs: 10 });
  await assert.rejects(transport.request('turn/start', {}), { code: 'CODEX_TIMEOUT' });
  assert.equal(writes.trim().split('\n').length, 1);
  await transport.close();
});

test('installed runtime initializes with an isolated home without starting a model', { skip: process.env.HITHER_TEST_REAL_CODEX !== '1' }, async t => {
  const { workspace, codexHome } = await taskDirectories(t);
  await mkdir(codexHome);
  const probe = await probeCodex();
  assert.equal(probe.available, true);
  const transport = new AppServerTransport({ cwd: workspace,
    env: { PATH: process.env.PATH, HOME: codexHome, CODEX_HOME: codexHome },
    args: ['-c', 'features.multi_agent=false', '-c', 'features.multi_agent_v2=false', '-c', 'analytics.enabled=false', '-c', 'default_permissions="hither"',
      '-c', `permissions.hither.filesystem={":minimal"="read",${JSON.stringify(workspace)}="write"}`,
      '-c', 'permissions.hither.network.enabled=false'],
  });
  t.after(() => transport.close());
  const initialized = await transport.request('initialize', { clientInfo: { name: 'hither', version: '0.1.0' } });
  assert.ok(initialized.userAgent.includes('hither'));
  transport.notify('initialized');
  const { config } = await transport.request('config/read', { includeLayers: false });
  assert.equal(config.default_permissions, 'hither');
  assert.equal(config.permissions.hither.filesystem[workspace], 'write');
  assert.equal(config.permissions.hither.network.enabled, false);
  assert.equal(config.features.multi_agent, false);
  assert.equal(config.features.multi_agent_v2, false);
  const outside = path.join(path.dirname(workspace), 'outside.txt');
  await writeFile(outside, 'boundary-test');
  const insideFile = path.join(workspace, 'inside.txt');
  const allowed = await transport.request('command/exec', { command: ['/bin/sh', '-c', 'printf inside > "$1"', 'test', insideFile], cwd: workspace, timeoutMs: 3000 });
  assert.equal(allowed.exitCode, 0);
  assert.equal(await readFile(insideFile, 'utf8'), 'inside');
  const deniedRead = await transport.request('command/exec', { command: ['/bin/cat', outside], cwd: workspace, timeoutMs: 3000 });
  assert.notEqual(deniedRead.exitCode, 0, 'outside task directory must not be readable');
  const deniedWrite = await transport.request('command/exec', { command: ['/bin/sh', '-c', 'printf changed > "$1"', 'test', outside], cwd: workspace, timeoutMs: 3000 });
  assert.notEqual(deniedWrite.exitCode, 0, 'outside task directory must not be writable');
  assert.equal(await readFile(outside, 'utf8'), 'boundary-test');
});

test('installed runtime accepts the complete adapter configuration; cancellation stops before model execution', { skip: process.env.HITHER_TEST_REAL_CODEX !== '1' }, async t => {
  const directories = await taskDirectories(t);
  const controller = new AbortController();
  const events = [];
  let transport;
  const calls = [];
  await assert.rejects(runCodex({ ...directories, apiKey: secret,
    settings: { ...settings, baseUrl: 'http://127.0.0.1:1/v1' }, prompt: 'This prompt must not be executed.', signal: controller.signal,
    allowSubagents:false, dynamicTools: [...TEAM_TOOLS,{type:'function',name:'hither_local_fixture',description:'Offline connector schema fixture',inputSchema:{type:'object',properties:{}}}],
    onEvent: async event => {
      events.push(event);
      if (event.type === 'runtime.thread') {
        const envCheck = await transport.request('command/exec', { cwd: directories.workspace,
          command: ['/bin/sh', '-c', 'if [ "${HITHER_PROVIDER_API_KEY+x}" ]; then exit 73; else printf isolated; fi'], timeoutMs: 3000 });
        assert.equal(envCheck.exitCode, 0, 'provider key must not be inherited by a tool process');
        assert.equal(envCheck.stdout, 'isolated');
        controller.abort();
      }
    },
    transportFactory: options => {
      transport = new AppServerTransport(options);
      const original = transport.request.bind(transport);
      transport.request = (method, ...args) => { calls.push(method); return original(method, ...args); };
      return transport;
    },
  }), { code: 'CANCELLED' });
  assert.ok(events.some(event => event.type === 'runtime.thread'));
  assert.ok(!calls.includes('turn/start'));
  assert.equal(transport.closed, true);
});

test('only completed public reasoning summaries become activity events; raw or encrypted reasoning never does',async t=>{
  const run=await fixtureRun(t,{start(transport){
    transport.notification('item/started',{item:{id:'thinking-start',type:'reasoning',summary:['not completed'],raw_content:'private-start'}});
    transport.notification('item/completed',{item:{id:'thinking-raw',type:'reasoning',raw_content:'private-raw',encrypted_content:'encrypted-payload'}});
    transport.notification('item/completed',{item:{id:'thinking-public',type:'reasoning',summary:['Checking the supplied sources.',{text:'Comparing the stated constraints.'},{other:'not text'}],raw_content:'private-full-chain',encrypted_content:'private-encrypted'}});
    transport.complete('Finished');
  }});
  await run.promise;
  const summaries=run.events.filter(event=>event.type==='runtime.reasoning_summary');assert.equal(summaries.length,1);assert.equal(summaries[0].label,'思考摘要');assert.equal(summaries[0].detail,'Checking the supplied sources.\n\nComparing the stated constraints.');
  assert.doesNotMatch(JSON.stringify(run.events),/private-|encrypted-payload|not completed|not text/);
});

test('native action metadata pairs concurrent calls and preserves command detail, failures and credential redaction',async t=>{
  const calls=[
    {id:'command-a',type:'commandExecution',status:'inProgress',command:`read-fixture ${secret}`},
    {id:'command-b',type:'commandExecution',status:'inProgress',command:'read-fixture second'},
    {id:'file-a',type:'fileChange',status:'inProgress',changes:[{path:'result.txt',kind:'update',diff:'fixture'}]},
    {id:'mcp-a',type:'mcpToolCall',status:'inProgress',server:'fixture',tool:`read-${secret}`,arguments:{query:'reviewed'}},
    {id:'search-a',type:'webSearch',status:'inProgress',query:'fixture evidence'},
  ];
  const run=await fixtureRun(t,{start(transport){
    for(const item of calls)transport.notification('item/started',{item});
    transport.notification('item/completed',{item:{...calls[1],status:'completed',exitCode:0,aggregatedOutput:'second result'}});
    transport.notification('item/completed',{item:{...calls[0],status:'completed',exitCode:2,aggregatedOutput:`failed ${secret}`}});
    transport.notification('item/completed',{item:{...calls[2],status:'declined'}});
    transport.notification('item/completed',{item:{...calls[3],status:'failed',error:{message:'fixture tool failed'}}});
    transport.notification('item/completed',{item:{...calls[4],status:'completed'}});
    transport.complete();
  }});
  await run.promise;
  const actions=run.events.filter(event=>event.type.startsWith('runtime.action'));
  assert.equal(actions.length,10);
  assert.deepEqual(actions.slice(0,5).map(event=>[event.activity.kind,event.activity.phase]),[['command','running'],['command','running'],['file_change','running'],['tool','running'],['web_search','running']]);
  assert.equal(new Set(actions.slice(0,5).map(event=>event.activity.callId)).size,5);
  assert.deepEqual(actions.slice(5).map(event=>event.activity.phase),['completed','failed','rejected','failed','completed']);
  for(const event of actions.slice(5))assert.ok(actions.slice(0,5).some(start=>start.activity.callId===event.activity.callId&&start.activity.kind===event.activity.kind));
  assert.equal(actions[0].detail,'read-fixture [已隐藏凭据]\n');
  assert.equal(actions[6].detail,'read-fixture [已隐藏凭据]\nfailed [已隐藏凭据]');
  assert.equal(actions[5].detail,'read-fixture second\nsecond result');
  assert.equal(actions[2].detail,JSON.stringify(calls[2]));
  assert.equal(actions[3].activity.name,'fixture / read-[已隐藏凭据]');
  assert.deepEqual(Object.keys(actions[0].activity).sort(),['callId','kind','phase']);
  assert.ok(!JSON.stringify(run.events).includes(secret));
});

test('completed public message events retain commentary or final phase without exposing private reasoning',async t=>{
  const run=await fixtureRun(t,{start(transport){
    transport.notification('item/started',{item:{id:'progress',type:'agentMessage',phase:'commentary',text:'Unfinished text'}});
    transport.notification('item/completed',{item:{id:'progress',type:'agentMessage',phase:'commentary',text:'Checking the supplied records.',raw_content:'must not persist'}});
    transport.notification('item/completed',{item:{id:'legacy-message',type:'agentMessage',text:'Legacy public message.'}});
    transport.complete('Confirmed final result.');
  }});
  assert.equal((await run.promise).text,'Confirmed final result.');
  const messages=run.events.filter(event=>event.type==='runtime.message');
  assert.deepEqual(messages.map(event=>event.activity.messagePhase),['commentary',undefined,'final_answer']);
  assert.ok(messages.every(event=>event.activity.kind==='message'&&event.activity.phase==='completed'&&event.activity.callId));
  assert.equal(messages[0].detail,'Checking the supplied records.');
  assert.doesNotMatch(JSON.stringify(run.events),/Unfinished text|must not persist/);
});

for (const mode of ['auto', 'full']) test(`user-selected ${mode} policy reaches configuration, thread and turn without weakening the other policy`, async t => {
  const policy=mode==='full'?'never':'on-request',reviewer=mode==='auto'?'auto_review':'user';
  const run=await fixtureRun(t,{request:(method,_params,tr)=>method==='config/read'?{config:{approval_policy:policy,approvals_reviewer:reviewer,...(mode==='full'?{sandbox_mode:'danger-full-access',default_permissions:null}:{default_permissions:'hither',permissions:{hither:{filesystem:{':minimal':'read',[tr.options.cwd]:'write'},network:{enabled:false}}}})}}:undefined},{approvalMode:mode});
  await run.promise;
  assert.ok(run.transport.options.args.includes(`approval_policy="${policy}"`));
  for(const method of ['thread/start','turn/start']){const params=run.transport.calls.find(call=>call.method===method).params;assert.equal(params.approvalPolicy,policy);assert.equal(params.approvalsReviewer,reviewer);}
  const thread=run.transport.calls.find(call=>call.method==='thread/start').params,turn=run.transport.calls.find(call=>call.method==='turn/start').params;
  if(mode==='full'){assert.equal(thread.sandbox,'danger-full-access');assert.deepEqual(turn.sandboxPolicy,{type:'dangerFullAccess'});assert.ok(!run.transport.options.args.some(arg=>arg.startsWith('permissions.hither')));}
  else{assert.equal(thread.sandbox,undefined);assert.equal(turn.sandboxPolicy,undefined);assert.ok(run.transport.options.args.includes('permissions.hither.network.enabled=false'));}
});

test('an unsupported auto reviewer stops before a thread starts, without silently granting access', async t=>{
 const run=await fixtureRun(t,{}, {approvalMode:'auto'});await assert.rejects(run.promise,{code:'CODEX_APPROVAL_POLICY_UNSUPPORTED'});assert.equal(run.transport.calls.some(call=>call.method==='thread/start'),false);
});

test('usage comes from the active runtime last measurement, distinct from cumulative totals',async t=>{
 const run=await fixtureRun(t,{start:tr=>{
  tr.notification('thread/tokenUsage/updated',{threadId:'another-thread',tokenUsage:{last:{totalTokens:999999},total:{totalTokens:999999},modelContextWindow:1000000}});
  tr.notification('thread/tokenUsage/updated',{tokenUsage:{last:{totalTokens:1400},total:{inputTokens:8000,outputTokens:900,totalTokens:8900},modelContextWindow:100000}});
  tr.notification('thread/tokenUsage/updated',{tokenUsage:{last:{totalTokens:500},total:{inputTokens:8300,outputTokens:1000,totalTokens:9300},modelContextWindow:null}});
  tr.complete();
 }});await run.promise;const usage=run.events.filter(event=>event.type==='runtime.usage');assert.equal(usage.length,2);assert.equal(usage[0].usage.usedTokens,1400);assert.equal(usage[0].usage.totalTokens,8900);assert.equal(usage[1].usage.usedTokens,500);assert.equal(usage[1].usage.contextWindow,null);assert.equal(usage[1].usage.source,'runtime');
});

test('auto review denial remains a denial event; it never becomes a client approval',async t=>{
 const run=await fixtureRun(t,{start:tr=>{tr.notification('item/autoApprovalReview/completed',{reviewId:'review-1',review:{status:'denied',riskLevel:'high',rationale:'Outside the requested scope.'}});tr.complete();}});await run.promise;assert.equal(run.transport.responses.length,0);assert.equal(JSON.parse(run.events.find(event=>event.type==='runtime.auto_review').detail).status,'denied');
});

for(const mode of ['auto','full'])test(`installed runtime confirms ${mode} and its filesystem boundary before any model call`,{skip:process.env.HITHER_TEST_REAL_CODEX!=='1'},async t=>{
 const directories=await taskDirectories(t),controller=new AbortController();let transport;const calls=[];
 const outside=path.join(path.dirname(directories.workspace),'outside-policy.txt');await writeFile(outside,'temporary boundary fixture');
 await assert.rejects(runCodex({...directories,approvalMode:mode,apiKey:secret,settings:{...settings,baseUrl:'http://127.0.0.1:1/v1'},prompt:'Do not execute this prompt.',signal:controller.signal,
  onEvent:async event=>{if(event.type==='runtime.thread'){
   const result=await transport.request('command/exec',{command:['/bin/cat',outside],cwd:directories.workspace,timeoutMs:3000});
   if(mode==='full'){assert.equal(result.exitCode,0);assert.equal(result.stdout,'temporary boundary fixture');}else assert.notEqual(result.exitCode,0);
   controller.abort();
  }},
  transportFactory:options=>{transport=new AppServerTransport(options);const request=transport.request.bind(transport);transport.request=(method,...args)=>{calls.push(method);return request(method,...args);};return transport;},
 }),{code:'CANCELLED'});
 assert.equal(calls.includes('turn/start'),false);assert.equal(transport.closed,true);
});

test('team runtime requires confirmed disabled native delegation before starting a model',async t=>{
  const allowed=await fixtureRun(t,{}, {allowSubagents:false});await allowed.promise;
  assert.ok(allowed.transport.options.args.includes('features.multi_agent=false'));
  assert.ok(allowed.transport.options.args.includes('features.multi_agent_v2=false'));
  const denied=await fixtureRun(t,{request:(method,_params,tr)=>method==='config/read'?{config:{features:{multi_agent:true,multi_agent_v2:false},approval_policy:'on-request',approvals_reviewer:'user',default_permissions:'hither',permissions:{hither:{filesystem:{':minimal':'read',[tr.options.cwd]:'write'},network:{enabled:false}}}}}:undefined},{allowSubagents:false});
  await assert.rejects(denied.promise,{code:'CODEX_TEAM_BOUNDARY_UNSUPPORTED'});
  assert.ok(!denied.transport.calls.some(call=>call.method==='turn/start'));
});

test('native collaboration events preserve actual child states without replacing the parent answer',async t=>{
 const run=await fixtureRun(t,{start:tr=>{
  tr.notification('item/started',{item:{id:'spawn',type:'collabAgentToolCall',tool:'spawnAgent',status:'inProgress',senderThreadId:'thread-fixture',receiverThreadIds:['child-thread'],prompt:'Check evidence',agentsStates:{'child-thread':{status:'running',message:null}}}});
  tr.notification('item/completed',{threadId:'child-thread',turnId:'child-turn',item:{id:'activity',type:'subAgentActivity',kind:'completed',agentThreadId:'child-thread',agentPath:'/root/reviewer'}});
  tr.notification('item/completed',{threadId:'unrelated-thread',item:{id:'unrelated',type:'subAgentActivity',kind:'completed',agentThreadId:'unrelated-thread'}});
  tr.notification('item/completed',{threadId:'child-thread',item:{id:'child-answer',type:'agentMessage',phase:'final_answer',text:'Must not become root answer'}});
  tr.notification('item/completed',{item:{id:'wait',type:'collabAgentToolCall',tool:'wait',status:'completed',senderThreadId:'thread-fixture',receiverThreadIds:['child-thread'],prompt:'x'.repeat(10000),agentsStates:{'child-thread':{status:'completed',message:'a'.repeat(10000)+secret}}}});
  tr.complete('Root verified summary');
 }});
 assert.equal((await run.promise).text,'Root verified summary');
 const collab=run.events.filter(e=>e.type==='runtime.collaboration').map(e=>JSON.parse(e.detail));
 assert.equal(collab.length,2);assert.equal(collab[0].agentsStates['child-thread'].status,'running');assert.equal(collab[1].agentsStates['child-thread'].status,'completed');assert.ok(JSON.stringify(collab).length<8000);
 const activity=run.events.filter(e=>e.type==='runtime.subagent_activity');assert.equal(activity.length,1);assert.equal(JSON.parse(activity[0].detail).kind,'completed');
 assert.ok(!JSON.stringify(run.events).includes(secret));
});
