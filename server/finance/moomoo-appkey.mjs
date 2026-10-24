import { constants as cryptoConstants, createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, sign } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

// Official AppKey contract: https://open.moomoo.com/api/overview/getting-started
// Read contracts: /api/trading/account/{get-accounts,get-funds,get-positions}.
// This client exposes no generic request method and performs only these GETs.
const ORIGIN = 'https://webapi.moomoo.com';
const ACCOUNTS = '/api/v1.0/accounts/authorized_trd_accs';
const AAD = Buffer.from('secondu-moomoo-appkey-v1');
const CURRENCIES = new Set(['USD', 'HKD', 'CNH', 'CNY', 'SGD', 'JPY', 'KRW', 'MYR', 'AUD', 'CAD', 'EUR', 'GBP']);
const ERRORS = {
  USER_ACTION_REQUIRED: '请在本机主动配置连接或读取预览。', INVALID_CONFIG: 'Moomoo AppKey 本地配置无效。',
  INVALID_PRIVATE_KEY: '请提供与控制台公钥对应的 Ed25519 或 RSA 私钥，RSA 至少需要 2048 位。',
  NOT_CONFIGURED: '请先在本机配置 AppKey ID 和配套私钥。', STORAGE_FAILED: '本地凭据无法安全读取或保存，连接未继续。',
  AUTHENTICATION_FAILED: 'Moomoo AppKey 认证失败，请核对配套公钥、授权有效期和本机时间。',
  PERMISSION_DENIED: 'Moomoo 未允许此项只读查询，请核对授权的账户与交易查询权限。',
  RATE_LIMITED: 'Moomoo 请求过于频繁，请稍后重试。', NETWORK_FAILED: '暂时无法连接 Moomoo 官方接口。',
  REMOTE_FAILED: 'Moomoo 暂时无法完成此次只读请求。', INVALID_RESPONSE: 'Moomoo 返回的数据不完整或格式不符合已核对的接口。',
  UNSUPPORTED_ACCOUNT: '该账户需要额外的查询分类，当前预览尚未支持。', INVALID_CURRENCY: '请选择有效的资金显示币种。',
};

export class MoomooAppKeyError extends Error {
  constructor(code, status = 400) { super(ERRORS[code] || ERRORS.REMOTE_FAILED); this.name = 'MoomooAppKeyError'; this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new MoomooAppKeyError(code, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const decimal = value => typeof value === 'string' && /^-?(?:0|[1-9]\d{0,39})(?:\.\d{1,20})?$/.test(value) ? value : null;
const currency = value => CURRENCIES.has(value) ? value : null;
const suffix = value => value.length > 4 ? `••••${value.slice(-4)}` : '••••';
// Official account card fields are 16-digit strings, distinct from account_id.
// Never infer a card number from the trading ID or expose unexpected input.
const cardSuffix = value => typeof value === 'string' && /^\d{16}$/.test(value) ? `••••${value.slice(-4)}` : null;
function accountId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('INVALID_RESPONSE', 502);
  const text = String(value);
  if (!/^[1-9]\d{0,19}$/.test(text) || BigInt(text) > 18446744073709551615n) fail('INVALID_RESPONSE', 502);
  return text;
}
function credentials(appKeyId, privateKeyPem) {
  if (typeof appKeyId !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(appKeyId)) fail('INVALID_CONFIG');
  if (typeof privateKeyPem !== 'string' || privateKeyPem.length > 20000 || !/^-----BEGIN (?:RSA )?PRIVATE KEY-----\r?\n/.test(privateKeyPem)) fail('INVALID_PRIVATE_KEY');
  let privateKey;
  try { privateKey = createPrivateKey(privateKeyPem); } catch { fail('INVALID_PRIVATE_KEY'); }
  const kind = privateKey.asymmetricKeyType;
  if (kind !== 'ed25519' && !(kind === 'rsa' && privateKey.asymmetricKeyDetails?.modulusLength >= 2048)) fail('INVALID_PRIVATE_KEY');
  const algorithm = kind === 'ed25519' ? 'Ed25519' : 'RSA-SHA256';
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  return { appKeyId, privateKey, algorithm, privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKeyFingerprint: createHash('sha256').update(publicKey).digest('hex') };
}

function vault(directory) {
  const keyPath = path.join(directory, 'key'), filePath = path.join(directory, 'appkey.enc');
  async function secureDirectory(create) {
    if (create) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) fail('STORAGE_FAILED', 503);
    await fs.chmod(directory, 0o700);
  }
  async function readPrivate(file) {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 100000 || (process.getuid && stat.uid !== process.getuid())) fail('STORAGE_FAILED', 503);
      await handle.chmod(0o600); return await handle.readFile();
    } finally { await handle.close(); }
  }
  async function key(create) {
    if (create) {
      let handle;
      try { handle = await fs.open(keyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); await handle.writeFile(randomBytes(32)); await handle.sync(); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      finally { if (handle) await handle.close(); }
    }
    const bytes = await readPrivate(keyPath);
    if (bytes.length !== 32) fail('STORAGE_FAILED', 503);
    return bytes;
  }
  return {
    async read() {
      try { await fs.lstat(directory); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      await secureDirectory(false);
      let bytes;
      try { bytes = await readPrivate(filePath); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const envelope = JSON.parse(bytes.toString('utf8'));
      if (envelope.version !== 1 || !['iv', 'tag', 'data'].every(field => typeof envelope[field] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(envelope[field]))) fail('STORAGE_FAILED', 503);
      const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) fail('STORAGE_FAILED', 503);
      const decipher = createDecipheriv('aes-256-gcm', await key(false), iv);
      decipher.setAAD(AAD); decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    },
    async write(record) {
      await secureDirectory(true);
      const iv = randomBytes(12), active = createCipheriv('aes-256-gcm', await key(true), iv);
      active.setAAD(AAD);
      const data = Buffer.concat([active.update(JSON.stringify(record), 'utf8'), active.final()]);
      const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: active.getAuthTag().toString('base64'), data: data.toString('base64') });
      const temporary = path.join(directory, `.appkey-${randomBytes(12).toString('hex')}.tmp`);
      let handle;
      try {
        handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(envelope); await handle.sync(); await handle.close(); handle = null;
        await fs.rename(temporary, filePath);
      } finally { if (handle) await handle.close(); await fs.rm(temporary, { force: true }); }
    },
    async reference(id) { return createHmac('sha256', await key(false)).update(`account:${id}`).digest('base64url').slice(0, 24); },
  };
}

async function boundedText(response) {
  if (!response.body?.getReader) fail('INVALID_RESPONSE', 502);
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) { await reader.cancel(); fail('INVALID_RESPONSE', 502); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

/** Call only from same-origin, loopback-only routes after user action. Private
 * key input must never be logged or echoed. Construction/status do no network
 * I/O. Configuration validates local material, not remote permissions. Preview
 * data and verification status are memory-only and never enter the ledger. */
export function createMoomooAppKeyConnection({ storageDir, fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 15000 } = {}) {
  if (typeof storageDir !== 'string' || !path.isAbsolute(storageDir) || typeof fetchImpl !== 'function' || typeof now !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('INVALID_CONFIG');
  const store = vault(path.resolve(storageDir));
  let loaded = false, credential = null, verified = null, queue = Promise.resolve();
  const serial = operation => {
    const task = queue.then(async () => { try { return await operation(); } catch (error) { if (error instanceof MoomooAppKeyError) throw error; fail('STORAGE_FAILED', 503); } });
    queue = task.catch(() => {}); return task;
  };
  const timestamp = () => {
    const value = Number(now());
    if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_CONFIG');
    return value;
  };
  async function load() {
    if (loaded) return;
    const record = await store.read();
    if (record) {
      if (!object(record) || record.version !== 1) fail('STORAGE_FAILED', 503);
      try { credential = credentials(record.appKeyId, record.privateKeyPem); } catch { fail('STORAGE_FAILED', 503); }
    }
    loaded = true;
  }
  function status() {
    return { provider: 'moomoo', method: 'appkey', configured: Boolean(credential), connected: Boolean(verified), status: verified ? 'connected' : credential ? 'configured' : 'disconnected', readOnly: true, scopeVerified: false, algorithm: credential?.algorithm ?? null, publicKeyFingerprint: credential?.publicKeyFingerprint ?? null, lastVerifiedAt: verified?.at ?? null, accountSuffixes: verified?.suffixes ?? [] };
  }
  async function read(endpoint) {
    if (!(endpoint === ACCOUNTS || /^\/api\/v1\.0\/accounts\/[1-9]\d{0,19}\/(?:funds\?currency=[A-Z]{3}|positions)$/.test(endpoint))) fail('INVALID_CONFIG');
    const url = new URL(endpoint, ORIGIN), time = String(timestamp());
    const signingString = [time, 'GET', url.pathname, url.search.slice(1), ''].join('\n');
    const key = credential.algorithm === 'Ed25519' ? credential.privateKey : { key: credential.privateKey, padding: cryptoConstants.RSA_PKCS1_PADDING };
    const signature = sign(credential.algorithm === 'Ed25519' ? null : 'sha256', Buffer.from(signingString), key).toString('base64');
    let response, payload;
    try {
      response = await fetchImpl(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store', headers: { Accept: 'application/json', 'X-Api-Key': credential.appKeyId, Authorization: signature, 'X-Timestamp': time, 'X-Nonce': randomBytes(24).toString('base64url') } });
      if (response.url && response.url !== url.href) fail('NETWORK_FAILED', 502);
      const text = await boundedText(response);
      payload = JSON.parse(text, (key, value, context) => key === 'account_id' && typeof value === 'number' && context?.source ? context.source : value);
    } catch (error) { if (error instanceof MoomooAppKeyError) throw error; fail('NETWORK_FAILED', 502); }
    if (response.status === 401 || [-12006, -12102].includes(payload?.errcode)) fail('AUTHENTICATION_FAILED', 401);
    if (response.status === 403 || payload?.errcode === -12009) fail('PERMISSION_DENIED', 403);
    if (response.status === 429 || payload?.errcode === -12011) fail('RATE_LIMITED', 429);
    if (!response.ok || payload?.s === 'error' || payload?.error) fail('REMOTE_FAILED', 502);
    if (!object(payload)) fail('INVALID_RESPONSE', 502);
    return payload;
  }
  function safeName(value, secrets) {
    if (typeof value !== 'string') return null;
    let text = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
    for (const secret of [credential.appKeyId, ...secrets]) if (secret) text = text.split(secret).join('[已隐藏]');
    return text;
  }
  return Object.freeze({
    status: () => serial(async () => { await load(); return status(); }),
    configure: ({ appKeyId, privateKeyPem, userInitiated = false } = {}) => serial(async () => {
      if (userInitiated !== true) fail('USER_ACTION_REQUIRED');
      const candidate = credentials(appKeyId, privateKeyPem);
      await load();
      await store.write({ version: 1, appKeyId: candidate.appKeyId, privateKeyPem: candidate.privateKeyPem });
      credential = candidate; verified = null;
      return status();
    }),
    preview: ({ currency: displayCurrency = 'USD', userInitiated = false } = {}) => serial(async () => {
      if (userInitiated !== true) fail('USER_ACTION_REQUIRED');
      if (!currency(displayCurrency)) fail('INVALID_CURRENCY');
      await load(); if (!credential) fail('NOT_CONFIGURED');
      verified = null;
      const payload = await read(ACCOUNTS);
      if (payload.s !== 'ok' || !Array.isArray(payload.d?.accounts) || payload.d.accounts.length > 50) fail('INVALID_RESPONSE', 502);
      const ids = payload.d.accounts.map(row => { if (!object(row)) fail('INVALID_RESPONSE', 502); return accountId(row.account_id); });
      if (new Set(ids).size !== ids.length) fail('INVALID_RESPONSE', 502);
      const secrets = [...ids, ...payload.d.accounts.flatMap(row => [row.account_card_number, row.univs_account_card_number]).filter(value => typeof value === 'string')];
      const accounts = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i], row = payload.d.accounts[i];
        if (row.sub_accounts?.length || /JP|JAPAN/i.test(String(row.security_firm))) fail('UNSUPPORTED_ACCOUNT');
        const fundsPayload = await read(`/api/v1.0/accounts/${id}/funds?currency=${displayCurrency}`);
        const positionsPayload = await read(`/api/v1.0/accounts/${id}/positions`);
        if (fundsPayload.s !== 'ok' || !object(fundsPayload.d) || positionsPayload.s !== 'ok' || !Array.isArray(positionsPayload.d) || positionsPayload.d.length > 5000) fail('INVALID_RESPONSE', 502);
        const funds = { currency: currency(fundsPayload.d.currency) };
        if (!funds.currency) fail('INVALID_RESPONSE', 502);
        for (const field of ['total_assets', 'securities_assets', 'funds_assets', 'cash', 'market_val', 'long_mv', 'short_mv', 'pending_asset', 'frozen_cash', 'available_funds', 'unrealized_pl', 'realized_pl', 'hk_cash', 'us_cash', 'jp_cash', 'cn_cash', 'sg_cash', 'kr_cash', 'my_cash', 'au_cash']) funds[field] = decimal(fundsPayload.d[field]);
        const positions = positionsPayload.d.map(position => {
          if (!object(position) || typeof position.code !== 'string' || !/^[A-Z]{1,5}\.[A-Za-z0-9._-]{1,60}$/.test(position.code) || !currency(position.currency) || decimal(position.qty) === null) fail('INVALID_RESPONSE', 502);
          return { code: position.code, name: safeName(position.stock_name, secrets), currency: position.currency, quantity: decimal(position.qty), marketPrice: decimal(position.nominal_price), marketValue: decimal(position.market_val), costPrice: position.cost_price_valid === true ? decimal(position.cost_price) : null, holdingPnl: position.pl_val_valid === true ? decimal(position.pl_val) : null, holdingPnlPct: position.pl_ratio_valid === true ? decimal(position.pl_ratio) : null, positionSide: ['NONE', 'LONG', 'SHORT'].includes(position.position_side) ? position.position_side : 'NONE' };
        });
        accounts.push({ accountRef: await store.reference(id), accountSuffix: suffix(id), cardSuffix: cardSuffix(row.account_card_number), unifiedCardSuffix: cardSuffix(row.univs_account_card_number), securityFirm: safeName(row.security_firm, secrets), accountType: safeName(row.acc_type, secrets), funds, positions });
      }
      const at = new Date(timestamp()).toISOString();
      verified = { at, suffixes: accounts.map(account => account.accountSuffix) };
      return { provider: 'moomoo', method: 'appkey', mode: 'preview', readOnly: true, persisted: false, fetchedAt: at, accountCount: accounts.length, accounts };
    }),
  });
}
