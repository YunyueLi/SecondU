import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store, now } from '../server/store.mjs';
import { AgentResourcesService, RESOURCE_CHECK_TTL_MS } from '../server/agent-resources.mjs';
import { ImCliService, runImCli } from '../server/im-cli.mjs';
import { createApp } from '../server/index.mjs';

const policy = (extra = {}) => ({ read: 'allow', draft: 'allow', send: 'deny', call: 'deny', pay: 'deny', allowedTargets: [], ...extra });
const email = (extra = {}) => ({ agentId: 'hither', kind: 'email', name: '虚构工作邮箱', identifier: 'fictional@example.com', provider: 'Fixture Mail', adapter: 'local-cli', command: '/fixture/resource-tool', enabled: true, policy: policy(), ...extra });
const result = (input, extra = {}) => ({ ...input, connected: true, capabilities: input.kind === 'payment' ? ['read', 'draft', 'pay'] : input.kind === 'phone' ? ['read', 'draft', 'send', 'call'] : ['read', 'draft', 'send'], ...extra });
const runCli = async (_command, _args, input) => result(input);
function fixture(t, execute = runCli) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-resources-'));
  const store = new Store(directory, { seed: false });
  store.put('agents', { id: 'agent-fictional', name: '虚构助理', instructions: '测试', role: '测试', createdAt: now() });
  const service = new AgentResourcesService(store, { runCli: execute });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, store, service };
}

test('resource bindings persist per subject and reject unknown subjects, credentials, card numbers and invalid identities', t => {
  const { store, directory, service } = fixture(t);
  assert.throws(() => service.save(email({ agentId: 'absent' })), error => error.code === 'resource_subject_missing');
  assert.throws(() => service.save(email({ identifier: 'not-an-email' })), /邮箱/);
  assert.throws(() => service.save(email({ apiKey: 'do-not-store' })), /不支持的字段/);
  assert.throws(() => service.save(email({ status: 'ready' })), /不支持的字段/);
  assert.throws(() => service.save(email({ command: 'sh -c echo' })), /绝对路径/);
  assert.throws(() => service.save(email({ kind: 'payment', identifier: '4242 4242 4242 4242' })), /卡号/);
  assert.throws(() => service.save(email({ kind: 'phone', identifier: '13800000000' })), /国家/);
  const phone = service.save(email({ kind: 'phone', identifier: '+86 138-0000-0000', provider: 'Fixture Phone', adapter: 'unconnected', command: undefined }));
  assert.equal(phone.identifier, '+8613800000000'); assert.equal(phone.status, 'pending');
  const self = service.save(email({ identifier: 'Name+one@EXAMPLE.COM' }));
  assert.equal(self.identifier, 'Name+one@example.com');
  const agent = service.save(email({ agentId: 'agent-fictional' }));
  assert.equal(service.list('hither').length, 2); assert.equal(service.list(agent.agentId).length, 1);
  assert.throws(() => service.save(email({ identifier: self.identifier })), error => error.code === 'resource_duplicate');
  assert.throws(() => service.save(email({ agentId: 'agent-fictional', revision: self.revision }), self.id), /转交/);
  const reopened = new Store(directory, { seed: false }); t.after(() => reopened.close());
  assert.equal(new AgentResourcesService(reopened).list('hither').length, 2);
  assert.equal(store.list('agentResources').some(item => JSON.stringify(item).includes('do-not-store')), false);
});

test('read permission, exact recipient scope and confirmation rules are checked without executing an action', async t => {
  let calls = 0;
  const { service } = fixture(t, async (...args) => { calls++; assert.equal(args[2].action, 'probe'); return runCli(...args); });
  const resource = service.save(email({ policy: policy({ send: 'confirm', allowedTargets: ['teammate@example.com'] }) }));
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'read' }).code, 'not_ready');
  await service.probe(resource.id);
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'read' }).decision, 'allowed');
  assert.equal(service.checkPermission(resource.id, { agentId: 'agent-fictional', action: 'read' }).code, 'subject_mismatch');
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'send', target: 'other@example.com' }).code, 'target_denied');
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'call', target: '+8613800000000' }).code, 'unsupported_action');
  const decision = service.checkPermission(resource.id, { agentId: 'hither', action: 'send', target: 'teammate@example.com' });
  assert.equal(decision.decision, 'confirmation_required'); assert.equal(decision.executed, false); assert.equal(calls, 1);
  assert.throws(() => service.save(email({ policy: policy({ send: 'allow' }) })), /逐次确认/);
  assert.throws(() => service.checkPermission(resource.id, { agentId: 'hither', action: 'send', confirmed: true }), /不支持的字段/);
});

test('payment aliases have exact decimal budgets and cannot silently approve money movement', async t => {
  const { service } = fixture(t);
  const payment = email({ kind: 'payment', name: '虚构付款预算', identifier: 'fictional-budget-account', provider: 'Fixture Pay', policy: policy({ pay: 'confirm', budget: { currency: 'CNY', perPaymentLimit: '100.10' }, allowedTargets: ['fictional-merchant'] }) });
  assert.throws(() => service.save({ ...payment, policy: policy({ pay: 'confirm' }) }), /先设置币种/);
  assert.throws(() => service.save({ ...payment, policy: policy({ pay: 'confirm', budget: { currency: 'CNY', perPaymentLimit: '1.001' } }) }), /两位小数/);
  const resource = service.save(payment); await service.probe(resource.id);
  const request = { agentId: 'hither', action: 'pay', target: 'fictional-merchant', currency: 'CNY', amount: '100.10' };
  assert.equal(service.checkPermission(resource.id, request).decision, 'confirmation_required');
  assert.equal(service.checkPermission(resource.id, { ...request, amount: '100.11' }).code, 'budget_exceeded');
  assert.equal(service.checkPermission(resource.id, { ...request, currency: 'USD' }).code, 'currency_mismatch');
  assert.equal(service.checkPermission(resource.id, { ...request, target: 'other-merchant' }).code, 'target_denied');
  assert.throws(() => service.checkPermission(resource.id, { ...request, amount: '-1' }), /正数/);
});

test('probe validates the full binding and capabilities, never persists tool output, and marks simulations explicitly', async t => {
  const { service, store } = fixture(t);
  const resource = service.save(email());
  for (const change of [{ identifier: 'another@example.com' }, { kind: 'payment' }, { agentId: 'agent-fictional' }, { resourceId: 'other' }, { provider: 'Other' }, { requestId: 'old' }, { protocol: 'other' }, { capabilities: ['pay'] }, { connected: 'yes' }]) {
    service.runCli = async (_command, _args, input) => result(input, { ...change, secret: 'private-tool-diagnostic' });
    const checked = await service.probe(resource.id);
    assert.equal(checked.status, 'error'); assert.deepEqual(checked.usableActions, []);
    assert.equal(JSON.stringify(store.require('agentResources', resource.id)).includes('private-tool-diagnostic'), false);
  }
  service.runCli = async (_command, _args, input) => result(input, { simulated: true });
  const simulated = await service.probe(resource.id);
  assert.equal(simulated.status, 'simulated'); assert.deepEqual(simulated.usableActions, []);
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'read' }).decision, 'blocked');
  service.runCli = async () => { throw new Error('private-tool-diagnostic'); };
  assert.equal(JSON.stringify(await service.probe(resource.id)).includes('private-tool-diagnostic'), false);
});

test('disable, expiry and concurrent configuration edits invalidate capability evidence', async t => {
  const { service, store } = fixture(t);
  const resource = service.save(email()); await service.probe(resource.id);
  let value = store.require('agentResources', resource.id);
  store.put('agentResources', { ...value, verification: { ...value.verification, checkedAt: new Date(Date.now() - RESOURCE_CHECK_TTL_MS - 1).toISOString() } });
  assert.equal(service.get(resource.id).status, 'pending');
  await service.probe(resource.id);
  const disabled = service.setEnabled(resource.id, { revision: resource.revision, enabled: false });
  assert.equal(disabled.status, 'disabled'); assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'read' }).code, 'disabled');
  await assert.rejects(service.probe(resource.id), error => error.code === 'resource_disabled');
  const enabled = service.setEnabled(resource.id, { revision: disabled.revision, enabled: true }); assert.equal(enabled.status, 'pending');
  let release;
  service.runCli = async (_command, _args, input) => new Promise(resolve => { release = () => resolve(result(input)); });
  const pending = service.probe(resource.id);
  assert.equal(service.get(resource.id).status, 'pending'); assert.deepEqual(service.get(resource.id).usableActions, []);
  const edited = service.save(email({ revision: enabled.revision, name: '虚构邮箱，已修改' }), resource.id);
  release(); await assert.rejects(pending, error => error.code === 'resource_probe_stale');
  assert.equal(service.get(resource.id).revision, edited.revision); assert.equal(service.get(resource.id).status, 'pending');
});

test('unconnected resources cannot validate themselves and missing subjects cannot probe', async t => {
  let calls = 0;
  const { service, store } = fixture(t, async () => { calls++; });
  const resource = service.save(email({ adapter: 'unconnected', command: undefined }));
  assert.equal((await service.probe(resource.id)).status, 'pending'); assert.equal(calls, 0);
  const agent = service.save(email({ agentId: 'agent-fictional' })); store.delete('agents', 'agent-fictional');
  await assert.rejects(service.probe(agent.id), error => error.code === 'resource_subject_missing'); assert.equal(calls, 0);
});

test('IM bindings inherit actual probe state and enforce the bound account, revision and conversation', async t => {
  const { service, store } = fixture(t);
  const im = new ImCliService(store, { runCli: async (_command, _args, input) => ({ protocol: 'hither.im.v1', channel: input.channel, accountId: input.accountId, connected: true, capabilities: { read: true, send: true } }) });
  service.im = im;
  const config = { name: '虚构通信', adapter: 'hither-cli', command: '/fixture/im-tool', channel: 'slack', platform: 'slack', accountId: 'fictional-account', target: 'channel:fictional' };
  const connection = im.save(config);
  const binding = email({ kind: 'im', adapter: 'im-connection', command: undefined, identifier: connection.accountId, provider: connection.channel, connectionId: connection.id, policy: policy({ send: 'confirm' }) });
  assert.throws(() => service.save({ ...binding, kind: 'email', identifier: 'fictional@example.com' }), /只能绑定为通信账号/);
  assert.throws(() => service.save({ ...binding, identifier: 'other' }), /不一致/);
  const resource = service.save(binding); assert.equal(resource.status, 'pending');
  const ready = await service.probe(resource.id); assert.equal(ready.status, 'ready'); assert.ok(ready.capabilities.includes('send'));
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'send', target: 'channel:other' }).code, 'connection_target_mismatch');
  assert.equal(service.checkPermission(resource.id, { agentId: 'hither', action: 'send', target: config.target }).decision, 'confirmation_required');
  im.save({ ...config, revision: connection.revision, accountId: 'replacement-account' }, store.require('imConnections', connection.id));
  assert.equal(service.get(resource.id).status, 'pending'); assert.deepEqual(service.get(resource.id).usableActions, []);
  assert.match((await service.probe(resource.id)).statusMessage, /配置已变化/);
});

test('real local executable receives bounded JSON on stdin and no shell evaluates account values', async t => {
  const { directory, store } = fixture(t);
  const executable = path.join(directory, 'fixture resource tool.cjs');
  writeFileSync(executable, `#!/usr/bin/env node\nlet raw='';process.stdin.on('data',part=>raw+=part);process.stdin.on('end',()=>{const request=JSON.parse(raw);process.stdout.write(JSON.stringify({...request,connected:true,capabilities:['read','draft','send'],simulated:true}));});\n`, { mode: 0o700 });
  const service = new AgentResourcesService(store);
  const resource = service.save(email({ command: executable, name: '中文模拟资源', provider: 'Fixture $(not-a-command)' }));
  assert.equal((await service.probe(resource.id)).status, 'simulated');
  const noisy = path.join(directory, 'fixture-noise.cjs');
  writeFileSync(noisy, '#!/usr/bin/env node\nprocess.stderr.write("credential-secret "+"x".repeat(400000));', { mode: 0o700 });
  const update = service.save(email({ command: noisy, revision: resource.revision }), resource.id);
  const failure = await service.probe(update.id); assert.equal(failure.status, 'error'); assert.equal(JSON.stringify(failure).includes('credential-secret'), false);
  const stalled = path.join(directory, 'fixture-stall.cjs'); writeFileSync(stalled, '#!/usr/bin/env node\nsetInterval(()=>{},1000);', { mode: 0o700 });
  const timed = service.save(email({ command: stalled, revision: update.revision }), resource.id);
  service.runCli = (command, args, input, options) => runImCli(command, args, input, { ...options, timeout: 25 });
  assert.match((await service.probe(timed.id)).statusMessage, /超时/);
});

test('HTTP resources are space scoped, survive app restart, and never expose a send or pay endpoint', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-resources-api-'));
  let app = createApp({ dataDir: directory, seed: false, scheduler: false, computerInfo: { codexAvailable: false }, runResourceCli: runCli });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const request = async (route, body, method = body ? 'POST' : 'GET') => { const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api${route}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }); return { status: response.status, data: await response.json() }; };
  const saved = await request('/agent-resources', email()); assert.equal(saved.status, 201);
  const key = saved.data.id;
  assert.equal((await request(`/agent-resources/${key}/probe`, {})).data.status, 'ready');
  assert.equal((await request(`/agent-resources/${key}/check-permission`, { agentId: 'hither', action: 'read' })).data.executed, false);
  assert.equal((await request(`/agent-resources/${key}/send`, {})).status, 405);
  assert.equal((await request(`/agent-resources/${key}/pay`, {})).status, 405);
  const foreign = await fetch(`http://127.0.0.1:${app.server.address().port}/api/agent-resources`, { headers: { Origin: 'https://foreign.invalid' } }); assert.equal(foreign.status, 403);
  await request('/spaces/demo-engineer-v4', {});
  assert.deepEqual((await request('/spaces/demo-engineer-v4/agent-resources?agentId=hither')).data, []);
  await app.close(); app = createApp({ dataDir: directory, seed: false, scheduler: false, computerInfo: { codexAvailable: false }, runResourceCli: runCli }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  assert.equal((await request('/agent-resources?agentId=hither')).data[0].id, key);
  assert.equal((await request(`/agent-resources/${key}/enabled`, { revision: 1, enabled: false })).data.status, 'disabled');
});
