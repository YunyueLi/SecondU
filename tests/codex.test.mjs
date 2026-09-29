import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, rm, realpath, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppServerTransport, probeCodex, runCodex } from '../server/codex.mjs';

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
    if (method === 'config/read') return { config: { default_permissions: 'hither', permissions: { hither: {
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

test('starts one real-protocol turn with isolated settings, bounded permissions, and no credential arguments', async t => {
  const run = await fixtureRun(t);
  assert.deepEqual(await run.promise, { text: '真实协议的测试夹具；不是模型运行结果。', threadId: 'thread-fixture' });
  const transport = run.transport;
  assert.deepEqual(transport.calls.map(call => call.method), ['initialize', 'initialized', 'config/read', 'thread/start', 'turn/start']);
  assert.equal(transport.options.env.HITHER_PROVIDER_API_KEY, secret);
  assert.equal(transport.options.env.OPENAI_API_KEY, undefined);
  assert.equal(transport.options.args.join(' ').includes(secret), false);
  assert.ok(transport.options.args.includes('shell_environment_policy.inherit="none"'));
  assert.ok(transport.options.args.includes('default_permissions="hither"'));
  const start = transport.calls.find(call => call.method === 'thread/start').params;
  assert.equal(start.approvalPolicy, 'on-request');
  assert.equal(start.approvalsReviewer, 'user');
  assert.equal(start.sandbox, undefined, 'must not replace the restricted named profile with legacy host-readable sandbox');
  assert.equal(transport.closed, true);
  assert.equal(run.events.at(-1).type, 'runtime.completed');
});

test('resumes exactly the supplied thread without silently starting a new conversation', async t => {
  const run = await fixtureRun(t, {}, { threadId: 'existing-thread' });
  assert.equal((await run.promise).threadId, 'existing-thread');
  assert.ok(run.transport.calls.some(call => call.method === 'thread/resume' && call.params.threadId === 'existing-thread'));
  assert.ok(!run.transport.calls.some(call => call.method === 'thread/start'));
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
  const run = await fixtureRun(t, { request: method => method === 'config/read' ? { config: {} } : undefined });
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
    args: ['-c', 'analytics.enabled=false', '-c', 'default_permissions="hither"',
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
