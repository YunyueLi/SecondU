import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMoomooConnection } from '../server/finance/moomoo-oauth.mjs';

const REDIRECT = 'http://127.0.0.1:58645/api/finance/connections/moomoo/callback';
const ID = '123456789012345678', ACCESS = 'synthetic-access-secret', REFRESH = 'synthetic-refresh-secret', REGISTRATION = 'synthetic-registration-secret';
const SCOPE = `quote:read trade:read accid:${ID}`;
const response = (payload, status = 200) => new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const validToken = (changes = {}) => ({ access_token: ACCESS, refresh_token: REFRESH, scope: SCOPE, token_type: 'Bearer', expires_in: 7200, ...changes });

async function fixture(t, handler = null) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-moomoo-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storageDir = path.join(root, 'private'), calls = [];
  let clock = Date.parse('2026-10-24T00:00:00Z'), custom = handler;
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    if (custom) { const result = await custom(url, init, calls); if (result) return result; }
    if (url.endsWith('/oauth2/register')) return response({ client_id: 'synthetic-public-client', pkce_required: true, registration_access_token: REGISTRATION, scope: 'quote:read quote:write trade:read trade:write accid:*' });
    if (url.endsWith('/oauth2/token')) return response(validToken());
    if (url.endsWith('/authorized_trd_accs')) return response(`{"s":"ok","d":{"accounts":[{"account_id":${ID},"security_firm":"FUTUINC","acc_type":"margin","account_card_number":"9876543210012345","univs_account_card_number":"9876543210012345"}]}}`);
    if (url.includes('/funds?')) return response({ s: 'ok', d: { total_assets: '1200.15', securities_assets: '1000.10', funds_assets: '0.00', cash: '200.05', currency: 'USD', extra_token: ACCESS, account_id: ID } });
    if (url.endsWith('/positions')) return response({ s: 'ok', d: [{ code: 'US.AAPL', stock_name: 'Apple Inc.', currency: 'USD', qty: '2.5', nominal_price: '200.02', market_val: '500.05', cost_price: '180', cost_price_valid: false, pl_val: '50.05', pl_val_valid: false, pl_ratio: '10', pl_ratio_valid: true, position_side: 'LONG', account_id: ID, secret: REFRESH }] });
    throw new Error(`Unexpected synthetic request: ${url}`);
  };
  const options = { redirectUri: REDIRECT, storageDir, fetchImpl, now: () => clock };
  const connection = createMoomooConnection(options);
  return { root, storageDir, options, calls, connection, advance: ms => { clock += ms; }, handler: value => { custom = value; } };
}
async function authorize(f) {
  const start = await f.connection.start({ userInitiated: true });
  const state = new URL(start.authorizationUrl).searchParams.get('state');
  const status = await f.connection.completeCallback({ state, code: 'synthetic-code' });
  return { start, state, status };
}
function noSecrets(value, additional = []) {
  const text = JSON.stringify(value);
  for (const secret of [ACCESS, REFRESH, REGISTRATION, ID, '9876543210012345', ...additional]) assert.ok(!text.includes(secret), `Public result exposed a synthetic secret: ${secret}`);
}

test('construction and status never register; start requires user action and produces PKCE without inventing a scope query', async t => {
  const f = await fixture(t);
  assert.equal(f.calls.length, 0); assert.equal((await f.connection.status()).status, 'disconnected');
  await assert.rejects(fs.stat(f.storageDir), { code: 'ENOENT' });
  await assert.rejects(f.connection.start(), { code: 'USER_ACTION_REQUIRED' });
  await assert.rejects(f.connection.start({ userInitiated: 'false' }), { code: 'USER_ACTION_REQUIRED' });
  const { start, state, status } = await authorize(f), url = new URL(start.authorizationUrl);
  assert.equal(url.origin, 'https://webapi.moomoo.com'); assert.equal(url.pathname, '/oauth2/authorize/confirm');
  assert.equal(url.searchParams.has('scope'), false); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const form = new URLSearchParams(f.calls[1].body), verifier = form.get('code_verifier');
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/); assert.equal(createHash('sha256').update(verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(form.get('redirect_uri'), REDIRECT); assert.equal(start.scopeRequestEnforced, false); assert.equal(start.scopeSelectionRequired, true);
  assert.equal(status.connected, true); assert.equal(status.readOnly, true); assert.deepEqual(status.accountSuffixes, ['••••5678']);
  noSecrets(status, [state, verifier, 'synthetic-code']);
  assert.ok(f.calls.every(call => call.redirect === 'error' && call.url.startsWith('https://webapi.moomoo.com/')));
});

test('state mismatch, expiry, replay, concurrent callbacks and provider denial cannot exchange twice', async t => {
  const f = await fixture(t), start = await f.connection.start({ userInitiated: true }), state = new URL(start.authorizationUrl).searchParams.get('state');
  await assert.rejects(f.connection.completeCallback({ state: 'x'.repeat(43), code: 'bad' }), { code: 'INVALID_STATE' });
  await assert.rejects(f.connection.completeCallback({ state: '界'.repeat(43), code: 'bad' }), { code: 'INVALID_STATE' });
  assert.equal(f.calls.length, 1);
  const results = await Promise.allSettled([f.connection.completeCallback({ state, code: 'first' }), f.connection.completeCallback({ state, code: 'first' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'INVALID_STATE');
  assert.equal(f.calls.filter(call => call.url.endsWith('/token')).length, 1);
  const second = await f.connection.start({ userInitiated: true }), state2 = new URL(second.authorizationUrl).searchParams.get('state');
  f.advance(300001);
  await assert.rejects(f.connection.completeCallback({ state: state2, code: 'expired' }), { code: 'STATE_EXPIRED' });
  const third = await f.connection.start({ userInitiated: true }), state3 = new URL(third.authorizationUrl).searchParams.get('state');
  await assert.rejects(f.connection.completeCallback({ state: state3, error: 'access_denied' }), { code: 'AUTHORIZATION_DENIED' });
  await assert.rejects(f.connection.completeCallback({ state: state3, code: 'after-denial' }), { code: 'INVALID_STATE' });
  assert.equal(f.calls.filter(call => call.url.endsWith('/register')).length, 1);
});

test('write, wildcard, missing and unknown scopes are rejected before saving tokens or reading data', async t => {
  const invalid = [`${SCOPE} trade:write`, `${SCOPE} quote:write`, 'trade:read accid:*', `trade:read accid:${ID} profile:read`, 'quote:read', 'trade:read', '', `trade:read accid:18446744073709551616`];
  for (const scope of invalid) {
    const f = await fixture(t, url => url.endsWith('/token') ? response(validToken({ scope })) : null);
    await assert.rejects(authorize(f), { code: 'SCOPE_REJECTED' });
    assert.equal((await f.connection.status()).connected, false);
    await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'NOT_CONNECTED' });
    assert.equal(f.calls.length, 2);
    noSecrets((await fs.readFile(path.join(f.storageDir, 'credentials.enc'))).toString());
  }
});

test('credentials are encrypted with private modes, survive restart, and never expose registration secrets', async t => {
  const f = await fixture(t); await authorize(f);
  assert.equal((await fs.stat(f.storageDir)).mode & 0o777, 0o700);
  for (const file of ['key', 'credentials.enc']) assert.equal((await fs.stat(path.join(f.storageDir, file))).mode & 0o777, 0o600);
  const ciphertext = await fs.readFile(path.join(f.storageDir, 'credentials.enc'), 'utf8'); noSecrets(ciphertext);
  assert.deepEqual((await fs.readdir(f.storageDir)).sort(), ['credentials.enc', 'key']);
  const reopened = createMoomooConnection(f.options), before = f.calls.length;
  assert.equal((await reopened.status()).status, 'connected'); assert.equal(f.calls.length, before);
  await assert.rejects(reopened.completeCallback({ state: 'previous-state', code: 'previous-code' }), { code: 'INVALID_STATE' });
  const envelope = JSON.parse(ciphertext); envelope.tag = Buffer.alloc(16, 1).toString('base64');
  await fs.writeFile(path.join(f.storageDir, 'credentials.enc'), JSON.stringify(envelope));
  await assert.rejects(createMoomooConnection(f.options).status(), error => error.code === 'STORAGE_FAILED' && !JSON.stringify(error).includes(ID));
});

test('symlinked vaults or directories fail closed without changing the linked target', async t => {
  const f = await fixture(t); await authorize(f);
  const external = path.join(f.root, 'external'); await fs.writeFile(external, 'untouched');
  await fs.unlink(path.join(f.storageDir, 'credentials.enc')); await fs.symlink(external, path.join(f.storageDir, 'credentials.enc'));
  await assert.rejects(createMoomooConnection(f.options).status(), { code: 'STORAGE_FAILED' });
  assert.equal(await fs.readFile(external, 'utf8'), 'untouched');
  const link = path.join(f.root, 'linked-directory'); await fs.symlink(f.storageDir, link);
  await assert.rejects(createMoomooConnection({ ...f.options, storageDir: link }).status(), { code: 'STORAGE_FAILED' });
});

test('preview uses fixed official GETs, preserves uint64 IDs internally, masks output and never persists account data', async t => {
  const f = await fixture(t); await authorize(f);
  const before = await fs.readFile(path.join(f.storageDir, 'credentials.enc'), 'utf8');
  await assert.rejects(f.connection.preview(), { code: 'USER_ACTION_REQUIRED' });
  const preview = await f.connection.preview({ userInitiated: true, currency: 'USD' });
  assert.equal(preview.mode, 'preview'); assert.equal(preview.persisted, false); assert.equal(preview.accountCount, 1); noSecrets(preview);
  const account = preview.accounts[0]; assert.equal(account.accountSuffix, '••••5678'); assert.equal(account.funds.total_assets, '1200.15');
  assert.equal(account.positions[0].quantity, '2.5'); assert.equal(account.positions[0].costPrice, null); assert.equal(account.positions[0].holdingPnl, null);
  assert.equal(account.positions[0].holdingPnlPct, '10');
  assert.deepEqual(f.calls.slice(2).map(call => [call.method, call.url]), [
    ['GET', 'https://webapi.moomoo.com/api/v1.0/accounts/authorized_trd_accs'],
    ['GET', `https://webapi.moomoo.com/api/v1.0/accounts/${ID}/funds?currency=USD`],
    ['GET', `https://webapi.moomoo.com/api/v1.0/accounts/${ID}/positions`],
  ]);
  assert.ok(f.calls.slice(2).every(call => call.headers.Authorization === `Bearer ${ACCESS}` && !call.body));
  assert.equal(await fs.readFile(path.join(f.storageDir, 'credentials.enc'), 'utf8'), before);
  assert.deepEqual((await fs.readdir(f.storageDir)).sort(), ['credentials.enc', 'key']);
});

test('preview rejects accounts outside exact scope, unsupported JP classification, invalid currency and malformed data', async t => {
  const f = await fixture(t); await authorize(f);
  await assert.rejects(f.connection.preview({ currency: 'USD&destination=https://example.com', userInitiated: true }), { code: 'INVALID_CURRENCY' });
  assert.equal(f.calls.length, 2);
  f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts: [{ account_id: '998877665544332211', security_firm: 'FUTUINC' }] } }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'PERMISSION_DENIED' }); assert.equal(f.calls.length, 3);
  f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts: [{ account_id: ID, security_firm: 'MOOMOOJP' }] } }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'UNSUPPORTED_ACCOUNT' }); assert.equal(f.calls.length, 4);
  f.handler(url => url.endsWith('/positions') ? response({ s: 'ok', d: [{ code: 'US.AAPL', currency: 'USD', qty: '1e9' }] }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' });
  f.handler(url => url.endsWith('/positions') ? response({ s: 'ok', d: [null] }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' });
  f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts: [null] } }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' });
});

test('expired tokens refresh on an explicit preview, retaining the original refresh token when omitted', async t => {
  const f = await fixture(t); await authorize(f); f.advance(7200001);
  assert.equal((await f.connection.status()).status, 'refresh_required'); assert.equal(f.calls.length, 2);
  let refreshCount = 0;
  f.handler((url, init) => {
    if (url.endsWith('/token')) { const form = new URLSearchParams(init.body); assert.equal(form.get('grant_type'), 'refresh_token'); assert.equal(form.get('refresh_token'), REFRESH); refreshCount++; return response(validToken({ access_token: `new-access-${refreshCount}`, refresh_token: undefined })); }
    return null;
  });
  noSecrets(await f.connection.preview({ userInitiated: true }), ['new-access-1']);
  f.advance(7200001); await f.connection.preview({ userInitiated: true }); assert.equal(refreshCount, 2);
});

test('refresh cannot upgrade scopes; rejected refresh disconnects and makes no account requests', async t => {
  const f = await fixture(t); await authorize(f); f.advance(7200001);
  f.handler(url => url.endsWith('/token') ? response(validToken({ scope: `${SCOPE} trade:write` })) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'SCOPE_REJECTED' });
  assert.equal(f.calls.length, 3); assert.equal((await f.connection.status()).connected, false);
  assert.equal((await createMoomooConnection(f.options).status()).connected, false);
});

test('network and provider errors expose only fixed local messages and consume the callback', async t => {
  const f = await fixture(t, url => { if (url.endsWith('/token')) throw new Error(`${ACCESS} ${ID} ${REFRESH}`); });
  const start = await f.connection.start({ userInitiated: true }), state = new URL(start.authorizationUrl).searchParams.get('state');
  await assert.rejects(f.connection.completeCallback({ code: 'synthetic-code', state }), error => { noSecrets({ message: error.message, ...error }); return error.code === 'NETWORK_FAILED'; });
  await assert.rejects(f.connection.completeCallback({ code: 'synthetic-code', state }), { code: 'INVALID_STATE' });
  f.handler(url => url.endsWith('/token') ? response({ error: 'invalid_grant', error_description: `${ID} ${ACCESS}` }, 400) : null);
  await assert.rejects(authorize(f), error => { noSecrets(error); return error.code === 'TOKEN_EXPIRED'; });
});

test('scope shrink during a 401 retry prevents reads of the removed account', async t => {
  const secondId = '998877665544332211', f = await fixture(t, url => url.endsWith('/token') ? response(validToken({ scope: `${SCOPE} accid:${secondId}` })) : null);
  await authorize(f);
  let expired = false;
  f.handler(url => {
    if (url.includes('/funds?')) { expired = true; return response({ error: 'expired' }, 401); }
    if (url.endsWith('/token')) return response(validToken({ scope: `trade:read accid:${secondId}`, refresh_token: undefined }));
    return null;
  });
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'PERMISSION_DENIED' });
  assert.equal(expired, true); assert.equal(f.calls.filter(call => call.url.includes('/funds?')).length, 1);
  assert.equal(f.calls.some(call => call.url.endsWith('/positions')), false);
});

test('oversized official responses stop while streaming and never become parsed account state', async t => {
  const f = await fixture(t); await authorize(f);
  let cancelled = false, chunks = 0;
  f.handler(url => url.endsWith('/authorized_trd_accs') ? new Response(new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1000001)); }, cancel() { cancelled = true; } }), { status: 200 }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' });
  assert.equal(cancelled, true); assert.ok(chunks <= 3); assert.equal(f.calls.length, 3);
});

test('redirect configuration rejects external hosts, credentials, query strings and non-loopback URLs', () => {
  for (const redirectUri of ['https://evil.example/callback', 'http://127.0.0.1.evil:59131/callback', 'http://user:password@localhost:59131/callback', 'http://localhost:59131/callback?next=elsewhere', 'http://localhost/callback', 'http://0.0.0.0:59131/callback']) assert.throws(() => createMoomooConnection({ redirectUri }), { code: 'INVALID_CONFIG' });
});


test('OAuth credentials require an explicit workspace directory', () => {
  for (const storageDir of [undefined, '', 'relative/finance']) assert.throws(() => createMoomooConnection({ redirectUri: REDIRECT, storageDir }), { code: 'INVALID_CONFIG' });
});
