import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, verify } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMoomooAppKeyConnection } from '../server/finance/moomoo-appkey.mjs';

const ID = '123456789012345678', CARD = '1111222233334444', UNIFIED_CARD = '9999888877776666', APPKEY = 'synthetic-appkey-id';
const ED = generateKeyPairSync('ed25519'), RSA = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = pair => pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const response = (payload, status = 200) => new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-moomoo-appkey-')), calls = [];
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let handler = null;
  const storageDir = path.join(root, 'private');
  const options = { storageDir, now: () => 1792800000000, fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    if (handler) { const result = await handler(url, init); if (result) return result; }
    if (url.endsWith('/authorized_trd_accs')) return response(`{"s":"ok","d":{"accounts":[{"account_id":${ID},"account_card_number":"${CARD}","univs_account_card_number":"${UNIFIED_CARD}","security_firm":"MOOMOOSG","acc_type":"margin"}]}}`);
    if (url.includes('/funds?')) return response({ s: 'ok', d: { currency: 'USD', total_assets: '1200.05', cash: '200.00', market_val: '1000.05', private_field: APPKEY } });
    if (url.endsWith('/positions')) return response({ s: 'ok', d: [{ code: 'US.AAPL', stock_name: `Apple ${ID} ${CARD} ${APPKEY}`, currency: 'USD', qty: '2.5', nominal_price: '400.02', market_val: '1000.05', cost_price: '350', cost_price_valid: false, pl_val: '125.05', pl_val_valid: true, pl_ratio: '14.29', pl_ratio_valid: false, position_side: 'LONG', raw_account_id: ID }] });
    throw new Error('Unexpected synthetic URL');
  } };
  return { root, storageDir, options, connection: createMoomooAppKeyConnection(options), calls, handler: fn => { handler = fn; } };
}
const configure = (f, pair = ED) => f.connection.configure({ appKeyId: APPKEY, privateKeyPem: pem(pair), userInitiated: true });
const noSecrets = value => { const text = JSON.stringify(value); for (const secret of [ID, CARD, UNIFIED_CARD, APPKEY, pem(ED), pem(RSA), 'PRIVATE KEY']) assert.ok(!text.includes(secret), 'Public output exposed synthetic credentials or account identifiers'); };

test('configuration validates local credentials without claiming a remote connection or scopes', async t => {
  const f = await fixture(t);
  assert.deepEqual(Object.keys(f.connection).sort(), ['configure', 'preview', 'status']);
  assert.equal((await f.connection.status()).status, 'disconnected');
  await assert.rejects(fs.stat(f.storageDir), { code: 'ENOENT' });
  await assert.rejects(f.connection.configure({ appKeyId: APPKEY, privateKeyPem: pem(ED) }), { code: 'USER_ACTION_REQUIRED' });
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'NOT_CONFIGURED' });
  const status = await configure(f);
  assert.equal(status.status, 'configured'); assert.equal(status.configured, true); assert.equal(status.connected, false); assert.equal(status.scopeVerified, false); assert.equal(status.algorithm, 'Ed25519');
  assert.match(status.publicKeyFingerprint, /^[a-f0-9]{64}$/); noSecrets(status);
  assert.equal(f.calls.length, 0);
});

test('Ed25519 signatures match the official five-field GET contract, including final newline and fresh nonce', async t => {
  const f = await fixture(t); await configure(f);
  const preview = await f.connection.preview({ userInitiated: true });
  assert.equal(f.calls.length, 3);
  const nonces = new Set();
  for (const call of f.calls) {
    const url = new URL(call.url), headers = call.headers;
    assert.equal(url.origin, 'https://webapi.moomoo.com'); assert.equal(call.method, 'GET'); assert.equal(call.redirect, 'error'); assert.equal(call.cache, 'no-store'); assert.equal(call.body, undefined);
    assert.equal(headers['X-Api-Key'], APPKEY); assert.equal(headers['X-Timestamp'], '1792800000000'); assert.match(headers['X-Nonce'], /^[A-Za-z0-9_-]{1,64}$/); nonces.add(headers['X-Nonce']);
    const signingString = `${headers['X-Timestamp']}\nGET\n${url.pathname}\n${url.search.slice(1)}\n`;
    assert.equal(verify(null, Buffer.from(signingString), ED.publicKey, Buffer.from(headers.Authorization, 'base64')), true);
    assert.equal(verify(null, Buffer.from(signingString.slice(0, -1)), ED.publicKey, Buffer.from(headers.Authorization, 'base64')), false);
    assert.equal(headers.Authorization.startsWith('Bearer '), false);
  }
  assert.equal(nonces.size, 3);
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname + new URL(call.url).search), ['/api/v1.0/accounts/authorized_trd_accs', `/api/v1.0/accounts/${ID}/funds?currency=USD`, `/api/v1.0/accounts/${ID}/positions`]);
  noSecrets(preview); assert.equal(preview.accounts[0].accountSuffix, '••••5678'); assert.equal(preview.accounts[0].cardSuffix, '••••4444'); assert.equal(preview.accounts[0].unifiedCardSuffix, '••••6666'); assert.equal(preview.accounts[0].funds.total_assets, '1200.05');
  assert.equal(preview.accounts[0].positions[0].quantity, '2.5'); assert.equal(preview.accounts[0].positions[0].costPrice, null); assert.equal(preview.accounts[0].positions[0].holdingPnl, '125.05'); assert.equal(preview.accounts[0].positions[0].holdingPnlPct, null);
  const status = await f.connection.status(); noSecrets(status); assert.equal(status.status, 'connected'); assert.equal(status.scopeVerified, false);
});

test('RSA signs with SHA256 and PKCS#1 v1.5, with no RSA-PSS substitution', async t => {
  const f = await fixture(t); assert.equal((await configure(f, RSA)).algorithm, 'RSA-SHA256');
  await f.connection.preview({ userInitiated: true });
  for (const call of f.calls) {
    const url = new URL(call.url), signingString = `${call.headers['X-Timestamp']}\nGET\n${url.pathname}\n${url.search.slice(1)}\n`;
    assert.equal(verify('sha256', Buffer.from(signingString), { key: RSA.publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(call.headers.Authorization, 'base64')), true);
    assert.equal(verify('sha256', Buffer.from(signingString), { key: RSA.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING }, Buffer.from(call.headers.Authorization, 'base64')), false);
  }
});

test('card suffixes disclose only four digits from documented card strings and never fall back to trading IDs', async t => {
  const f = await fixture(t); await configure(f);
  for (const value of [undefined, null, '', '1', '1234', '12345', '123456789012345', '12345678901234567', 1234567890123456, '12345678901234ab', '1234567890123456\n']) {
    f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts: [{ account_id: ID, account_card_number: value, univs_account_card_number: value, security_firm: 'MOOMOOSG', acc_type: 'margin' }] } }) : url.endsWith('/positions') ? response({ s: 'ok', d: [] }) : null);
    const preview = await f.connection.preview({ userInitiated: true }), account = preview.accounts[0];
    assert.equal(account.cardSuffix, null); assert.equal(account.unifiedCardSuffix, null); assert.equal(account.accountSuffix, '••••5678'); noSecrets(preview);
    assert.equal(Object.hasOwn(account, 'account_card_number'), false); assert.equal(Object.hasOwn(account, 'univs_account_card_number'), false);
  }
  f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts: [{ account_id: ID, account_card_number: '0000000000000012', univs_account_card_number: UNIFIED_CARD, security_firm: 'MOOMOOSG', acc_type: 'margin' }] } }) : url.endsWith('/positions') ? response({ s: 'ok', d: [] }) : null);
  const preview = await f.connection.preview({ userInitiated: true });
  assert.equal(preview.accounts[0].cardSuffix, '••••0012'); assert.equal(preview.accounts[0].unifiedCardSuffix, '••••6666'); noSecrets(preview);
  assert.equal(JSON.stringify(preview).includes('0000000000000012'), false);
});

test('invalid, encrypted, unsupported, weak keys and header injection fail before storage or networking', async t => {
  const f = await fixture(t), weak = generateKeyPairSync('rsa', { modulusLength: 1024 }), ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  for (const privateKeyPem of ['garbage', pem(weak), pem(ec), ED.publicKey.export({ type: 'spki', format: 'pem' }), ED.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'synthetic' })]) await assert.rejects(f.connection.configure({ appKeyId: APPKEY, privateKeyPem, userInitiated: true }), { code: 'INVALID_PRIVATE_KEY' });
  await assert.rejects(f.connection.configure({ appKeyId: 'bad\r\nAuthorization: secret', privateKeyPem: pem(ED), userInitiated: true }), { code: 'INVALID_CONFIG' });
  assert.equal(f.calls.length, 0); await assert.rejects(fs.stat(f.storageDir), { code: 'ENOENT' });
});

test('credentials are encrypted, private, and survive restart without persisting preview data or verified status', async t => {
  const f = await fixture(t); await configure(f);
  assert.equal((await fs.stat(f.storageDir)).mode & 0o777, 0o700);
  for (const file of ['key', 'appkey.enc']) assert.equal((await fs.stat(path.join(f.storageDir, file))).mode & 0o777, 0o600);
  const before = await fs.readFile(path.join(f.storageDir, 'appkey.enc'), 'utf8'); noSecrets(before);
  await f.connection.preview({ userInitiated: true });
  assert.equal(await fs.readFile(path.join(f.storageDir, 'appkey.enc'), 'utf8'), before); assert.deepEqual((await fs.readdir(f.storageDir)).sort(), ['appkey.enc', 'key']);
  const reopened = createMoomooAppKeyConnection(f.options), status = await reopened.status(); noSecrets(status); assert.equal(status.status, 'configured'); assert.equal(status.lastVerifiedAt, null); assert.equal(f.calls.length, 3);
  await reopened.preview({ userInitiated: true }); assert.equal(f.calls.length, 6);
});

test('tampered and symlinked vaults fail closed without exposing credentials or altering link targets', async t => {
  const f = await fixture(t); await configure(f);
  const file = path.join(f.storageDir, 'appkey.enc'), original = await fs.readFile(file, 'utf8'), envelope = JSON.parse(original);
  envelope.tag = Buffer.alloc(16, 9).toString('base64'); await fs.writeFile(file, JSON.stringify(envelope));
  await assert.rejects(createMoomooAppKeyConnection(f.options).status(), error => { noSecrets({ message: error.message, ...error }); return error.code === 'STORAGE_FAILED'; });
  const external = path.join(f.root, 'external'); await fs.writeFile(external, 'untouched'); await fs.unlink(file); await fs.symlink(external, file);
  await assert.rejects(createMoomooAppKeyConnection(f.options).status(), { code: 'STORAGE_FAILED' }); assert.equal(await fs.readFile(external, 'utf8'), 'untouched');
  const link = path.join(f.root, 'linked'); await fs.symlink(f.storageDir, link);
  await assert.rejects(createMoomooAppKeyConnection({ ...f.options, storageDir: link }).status(), { code: 'STORAGE_FAILED' });
});

test('preview requires user action; invalid currency, duplicate uint64 IDs and unsupported accounts stop reads', async t => {
  const f = await fixture(t); await configure(f);
  await assert.rejects(f.connection.preview(), { code: 'USER_ACTION_REQUIRED' });
  await assert.rejects(f.connection.preview({ userInitiated: true, currency: 'USD&trade=write' }), { code: 'INVALID_CURRENCY' }); assert.equal(f.calls.length, 0);
  for (const accounts of [[{ account_id: ID }, { account_id: ID }], [{ account_id: '18446744073709551616' }], [null]]) {
    f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts } }) : null);
    await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' });
  }
  f.handler(url => url.endsWith('/authorized_trd_accs') ? response({ s: 'ok', d: { accounts: [{ account_id: ID, security_firm: 'MOOMOOJP' }] } }) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'UNSUPPORTED_ACCOUNT' });
  assert.ok(f.calls.every(call => call.url.endsWith('/authorized_trd_accs')));
});

test('provider errors are mapped to fixed messages and invalidate in-memory verification with no retry', async t => {
  const f = await fixture(t); await configure(f); await f.connection.preview({ userInitiated: true });
  for (const [status, errcode, code] of [[401, -12006, 'AUTHENTICATION_FAILED'], [200, -12102, 'AUTHENTICATION_FAILED'], [403, -12009, 'PERMISSION_DENIED'], [429, -12011, 'RATE_LIMITED'], [500, -12301, 'REMOTE_FAILED']]) {
    const before = f.calls.length;
    f.handler(() => response({ s: 'error', errcode, error: APPKEY, message: ID }, status));
    await assert.rejects(f.connection.preview({ userInitiated: true }), error => { noSecrets({ message: error.message, ...error }); return error.code === code; });
    assert.equal(f.calls.length, before + 1); assert.equal((await f.connection.status()).connected, false);
  }
  f.handler(() => { throw new Error(`${APPKEY} ${ID}`); });
  await assert.rejects(f.connection.preview({ userInitiated: true }), error => { noSecrets({ message: error.message, ...error }); return error.code === 'NETWORK_FAILED'; });
});

test('streaming size limits and malformed positions cannot become partial or persisted previews', async t => {
  const f = await fixture(t); await configure(f);
  let cancelled = false;
  f.handler(url => url.endsWith('/authorized_trd_accs') ? new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1000001)); }, cancel() { cancelled = true; } })) : null);
  await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' }); assert.equal(cancelled, true);
  for (const position of [null, { code: 'US.AAPL', currency: 'USD', qty: '1e9' }, { code: '../../trade', currency: 'USD', qty: '1' }]) {
    f.handler(url => url.endsWith('/positions') ? response({ s: 'ok', d: [position] }) : null);
    await assert.rejects(f.connection.preview({ userInitiated: true }), { code: 'INVALID_RESPONSE' }); assert.equal((await f.connection.status()).connected, false);
  }
});

test('configuration is serialized behind a running preview and resets verification only after a valid local save', async t => {
  const f = await fixture(t); await configure(f);
  let release, seen;
  const entered = new Promise(resolve => { seen = resolve; });
  f.handler(async url => { if (url.endsWith('/authorized_trd_accs')) { seen(); await new Promise(resolve => { release = resolve; }); } return null; });
  const preview = f.connection.preview({ userInitiated: true }); await entered;
  const reconfigure = configure(f, RSA); release();
  await preview; assert.equal((await reconfigure).status, 'configured'); assert.equal((await f.connection.status()).algorithm, 'RSA-SHA256');
});


test('a workspace-owned credential directory is required', () => {
  for (const storageDir of [undefined, '', 'relative/finance']) assert.throws(() => createMoomooAppKeyConnection({ storageDir }), { code: 'INVALID_CONFIG' });
});
