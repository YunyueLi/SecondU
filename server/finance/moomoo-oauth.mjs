import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

// Official contract: https://open.moomoo.com/api/overview/getting-started
// and /api/trading/account/{get-accounts,get-funds,get-positions}.
// The documented authorization page lets the user select permissions; it does
// not document a scope request parameter. Never claim the URL enforces scopes.
const ORIGIN = 'https://webapi.moomoo.com';
const REGISTER = '/oauth2/register', TOKEN = '/oauth2/token', AUTHORIZE = '/oauth2/authorize/confirm';
const ACCOUNTS = '/api/v1.0/accounts/authorized_trd_accs';
const READ_SCOPES = ['quote:read', 'trade:read'];
const AAD = Buffer.from('secondu-moomoo-credentials-v1');
const CURRENCIES = new Set(['USD', 'HKD', 'CNH', 'CNY', 'SGD', 'JPY', 'KRW', 'MYR', 'AUD', 'CAD', 'EUR', 'GBP']);
const ERRORS = {
  USER_ACTION_REQUIRED: '请在本机主动发起连接或预览。', INVALID_CONFIG: 'Moomoo 本地连接配置无效。',
  INVALID_CALLBACK: '授权回调无效，请重新连接。', INVALID_STATE: '授权状态无效或已使用，请重新连接。',
  STATE_EXPIRED: '授权会话已过期，请重新连接。', AUTHORIZATION_DENIED: '未完成 Moomoo 授权。',
  SCOPE_REJECTED: '权限不符合只读要求。请仅选择交易读取、可选行情读取和具体账户，取消所有写入及全部账户权限。',
  INVALID_RESPONSE: 'Moomoo 返回的数据不完整或格式不符合已核对的接口。', NETWORK_FAILED: '暂时无法连接 Moomoo 官方接口。',
  TOKEN_EXPIRED: 'Moomoo 授权已失效，请重新连接。', PERMISSION_DENIED: 'Moomoo 未允许此项只读查询，请核对本人授权的账户。',
  RATE_LIMITED: 'Moomoo 请求过于频繁，请稍后重试。', REMOTE_FAILED: 'Moomoo 暂时无法完成此次只读请求。',
  STORAGE_FAILED: '本地凭据文件无法安全读取或保存，连接未继续。', NOT_CONNECTED: '请先完成 Moomoo 只读授权。',
  UNSUPPORTED_ACCOUNT: '该账户需要额外的查询分类，当前预览尚未支持。', INVALID_CURRENCY: '请选择有效的资金显示币种。',
};

export class MoomooConnectionError extends Error {
  constructor(code, status = 400) { super(ERRORS[code] || ERRORS.REMOTE_FAILED); this.name = 'MoomooConnectionError'; this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new MoomooConnectionError(code, status); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const accountId = value => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('INVALID_RESPONSE');
  const text = String(value);
  if (!/^[1-9]\d{0,19}$/.test(text) || BigInt(text) > 18446744073709551615n) fail('INVALID_RESPONSE');
  return text;
};
const suffix = id => id.length > 4 ? `••••${id.slice(-4)}` : '••••';
const decimal = value => typeof value === 'string' && /^-?(?:0|[1-9]\d{0,39})(?:\.\d{1,20})?$/.test(value) ? value : null;
const currency = value => CURRENCIES.has(value) ? value : null;

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

function validateScopes(value) {
  if (typeof value !== 'string' || value.length > 10000) fail('SCOPE_REJECTED');
  const scopes = [...new Set(value.trim().split(/\s+/))];
  if (!scopes.includes('trade:read')) fail('SCOPE_REJECTED');
  const ids = [];
  for (const scope of scopes) {
    if (READ_SCOPES.includes(scope)) continue;
    if (!/^accid:[1-9]\d{0,19}$/.test(scope)) fail('SCOPE_REJECTED');
    try { ids.push(accountId(scope.slice(6))); } catch { fail('SCOPE_REJECTED'); }
  }
  if (!ids.length || ids.length > 50) fail('SCOPE_REJECTED');
  return { scopes, ids };
}

function validateRedirect(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_CONFIG'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.username || url.password || url.search || url.hash || url.pathname === '/') fail('INVALID_CONFIG');
  return url.href;
}

function createVault(directory) {
  const keyPath = path.join(directory, 'key'), vaultPath = path.join(directory, 'credentials.enc');
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
      await handle.chmod(0o600);
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async function key(create) {
    if (create) {
      let handle;
      try {
        handle = await fs.open(keyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(randomBytes(32)); await handle.sync();
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
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
      let encrypted;
      try { encrypted = await readPrivate(vaultPath); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const envelope = JSON.parse(encrypted.toString('utf8'));
      if (envelope.version !== 1 || !['iv', 'tag', 'data'].every(field => typeof envelope[field] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(envelope[field]))) fail('STORAGE_FAILED', 503);
      const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) fail('STORAGE_FAILED', 503);
      const decipher = createDecipheriv('aes-256-gcm', await key(false), iv);
      decipher.setAAD(AAD); decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    },
    async write(record) {
      await secureDirectory(true);
      const secret = await key(true), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret, iv);
      cipher.setAAD(AAD);
      const data = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
      const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
      const temporary = path.join(directory, `.credentials-${randomBytes(12).toString('hex')}.tmp`);
      let handle;
      try {
        handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(envelope); await handle.sync(); await handle.close(); handle = null;
        await fs.rename(temporary, vaultPath);
      } finally { if (handle) await handle.close(); await fs.rm(temporary, { force: true }); }
    },
    async reference(id) { return createHmac('sha256', await key(false)).update(`account:${id}`).digest('base64url').slice(0, 24); },
  };
}

/** No network or filesystem writes occur on construction. One instance owns an
 * in-memory, five-minute callback session; a process restart invalidates it.
 * Call only from loopback-only, CSRF-protected routes after a user action.
 * Neither credentials nor preview data belong in the finance store or logs. */
export function createMoomooConnection({ redirectUri, storageDir, fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 15000 } = {}) {
  const redirect = validateRedirect(redirectUri);
  if (typeof storageDir !== 'string' || !path.isAbsolute(storageDir) || typeof fetchImpl !== 'function') fail('INVALID_CONFIG');
  const vault = createVault(path.resolve(storageDir));
  let loaded = false, record = { version: 1, client: null, tokens: null }, pending = null, queue = Promise.resolve();
  const timestamp = () => Number(now());
  const serial = operation => {
    const task = queue.then(async () => {
      try { return await operation(); } catch (error) { if (error instanceof MoomooConnectionError) throw error; fail('STORAGE_FAILED', 503); }
    });
    queue = task.catch(() => {}); return task;
  };
  async function load() {
    if (loaded) return;
    const stored = await vault.read();
    if (stored) {
      if (stored.version !== 1 || !isObject(stored.client) || typeof stored.client.id !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(stored.client.id) || stored.client.redirectUri !== redirect) fail('STORAGE_FAILED', 503);
      if (stored.tokens) {
        validateScopes(stored.tokens.scope);
        if (typeof stored.tokens.accessToken !== 'string' || !stored.tokens.accessToken || typeof stored.tokens.refreshToken !== 'string' || !stored.tokens.refreshToken || !Number.isFinite(stored.tokens.expiresAt)) fail('STORAGE_FAILED', 503);
      }
      record = stored;
    }
    loaded = true;
  }
  async function save(next) { await vault.write(next); record = next; }
  async function request(endpoint, { method = 'GET', body, bearer } = {}) {
    if (!((method === 'POST' && [REGISTER, TOKEN].includes(endpoint)) || (method === 'GET' && (endpoint === ACCOUNTS || /^\/api\/v1\.0\/accounts\/[1-9]\d{0,19}\/(?:funds\?currency=[A-Z]{3}|positions)$/.test(endpoint))))) fail('INVALID_CONFIG');
    let response, payload;
    try {
      response = await fetchImpl(`${ORIGIN}${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': endpoint === REGISTER ? 'application/json' : 'application/x-www-form-urlencoded' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body ? { body } : {}),
      });
      if (response.url && response.url !== `${ORIGIN}${endpoint}`) fail('NETWORK_FAILED', 502);
      const text = await boundedText(response);
      // Node 22's reviver source preserves uint64 account IDs without rounding.
      payload = JSON.parse(text, (key, value, context) => key === 'account_id' && typeof value === 'number' && context?.source ? context.source : value);
    } catch (error) { if (error instanceof MoomooConnectionError) throw error; fail('NETWORK_FAILED', 502); }
    if (response.status === 401 || payload?.errcode === -12102 || (endpoint === TOKEN && payload?.error === 'invalid_grant')) fail('TOKEN_EXPIRED', 401);
    if (response.status === 403 || payload?.errcode === -12009) fail('PERMISSION_DENIED', 403);
    if (response.status === 429 || payload?.errcode === -12011) fail('RATE_LIMITED', 429);
    if (!response.ok || payload?.s === 'error' || payload?.error) fail('REMOTE_FAILED', 502);
    if (!isObject(payload)) fail('INVALID_RESPONSE', 502);
    return payload;
  }
  function tokenRecord(payload, previous = null) {
    const validated = validateScopes(payload.scope);
    if (previous && validated.scopes.some(scope => !validateScopes(previous.scope).scopes.includes(scope))) fail('SCOPE_REJECTED');
    if (typeof payload.token_type !== 'string' || payload.token_type.toLowerCase() !== 'bearer' || typeof payload.access_token !== 'string' || !payload.access_token || payload.access_token.length > 20000 || /[\r\n]/.test(payload.access_token) || !Number.isSafeInteger(payload.expires_in) || payload.expires_in <= 0 || payload.expires_in > 31 * 86400) fail('INVALID_RESPONSE', 502);
    const refresh = payload.refresh_token ?? previous?.refreshToken;
    if (typeof refresh !== 'string' || !refresh || refresh.length > 20000 || /[\r\n]/.test(refresh)) fail('INVALID_RESPONSE', 502);
    return { accessToken: payload.access_token, refreshToken: refresh, scope: validated.scopes.join(' '), expiresAt: timestamp() + payload.expires_in * 1000 };
  }
  function publicStatus() {
    if (pending && timestamp() >= pending.expiresAt) pending = null;
    const permission = record.tokens ? validateScopes(record.tokens.scope) : null;
    return {
      provider: 'moomoo', connected: !!record.tokens, status: pending ? 'awaiting_authorization' : !record.tokens ? 'disconnected' : record.tokens.expiresAt <= timestamp() ? 'refresh_required' : 'connected',
      readOnly: true, scopeSelectionRequired: true, scopeRequestEnforced: false, previewSupported: true,
      scopes: permission?.scopes.filter(scope => READ_SCOPES.includes(scope)) || [], accountSuffixes: permission?.ids.map(suffix) || [],
      expiresAt: record.tokens ? new Date(record.tokens.expiresAt).toISOString() : null,
      pendingExpiresAt: pending ? new Date(pending.expiresAt).toISOString() : null,
    };
  }
  async function refresh() {
    const previous = record.tokens;
    try {
      const payload = await request(TOKEN, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: record.client.id, refresh_token: previous.refreshToken }).toString() });
      await save({ ...record, tokens: tokenRecord(payload, previous) });
    } catch (error) {
      if (['SCOPE_REJECTED', 'TOKEN_EXPIRED', 'PERMISSION_DENIED'].includes(error.code)) {
        record = { ...record, tokens: null }; await vault.write(record);
      }
      throw error;
    }
  }
  async function read(endpoint) {
    const requestedId = /^\/api\/v1\.0\/accounts\/([1-9]\d{0,19})\//.exec(endpoint)?.[1];
    const checkPermission = () => {
      const permission = validateScopes(record.tokens.scope);
      if (requestedId && !permission.ids.includes(requestedId)) fail('PERMISSION_DENIED', 403);
    };
    checkPermission();
    try { return await request(endpoint, { bearer: record.tokens.accessToken }); }
    catch (error) {
      if (error.code !== 'TOKEN_EXPIRED') throw error;
      await refresh(); checkPermission(); return request(endpoint, { bearer: record.tokens.accessToken });
    }
  }
  function safeName(value, ids) {
    if (typeof value !== 'string') return null;
    let text = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
    for (const secret of [record.tokens.accessToken, record.tokens.refreshToken, ...ids]) text = text.split(secret).join('[已隐藏]');
    return text;
  }
  return Object.freeze({
    status: () => serial(async () => { await load(); return publicStatus(); }),
    start: ({ userInitiated = false } = {}) => serial(async () => {
      if (userInitiated !== true) fail('USER_ACTION_REQUIRED');
      await load(); pending = null;
      if (!record.client) {
        const payload = await request(REGISTER, { method: 'POST', body: JSON.stringify({ redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_name: 'SecondU Local Finance Read-only Preview' }) });
        if (typeof payload.client_id !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(payload.client_id) || payload.pkce_required !== true) fail('INVALID_RESPONSE', 502);
        // Registration access token / client URI are deliberately not retained.
        await save({ ...record, client: { id: payload.client_id, redirectUri: redirect } });
      }
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(64).toString('base64url');
      pending = { state, verifier, expiresAt: timestamp() + 300000 };
      const url = new URL(AUTHORIZE, ORIGIN);
      url.search = new URLSearchParams({ client_id: record.client.id, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', redirect_uri: redirect, response_type: 'code', state }).toString();
      return { authorizationUrl: url.href, expiresAt: new Date(pending.expiresAt).toISOString(), scopeSelectionRequired: true, scopeRequestEnforced: false, allowedScopes: [...READ_SCOPES], accountSelection: 'specific_accounts_only' };
    }),
    completeCallback: ({ code, state, error } = {}) => serial(async () => {
      await load();
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || !pending || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) fail('INVALID_STATE');
      const session = pending; pending = null; // Consume before any token request, even when the request fails.
      if (timestamp() >= session.expiresAt) fail('STATE_EXPIRED');
      if (error) fail('AUTHORIZATION_DENIED');
      if (typeof code !== 'string' || !code || code.length > 2000 || /[\r\n]/.test(code)) fail('INVALID_CALLBACK');
      const payload = await request(TOKEN, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: record.client.id, redirect_uri: redirect, code_verifier: session.verifier }).toString() });
      const tokens = tokenRecord(payload);
      await save({ ...record, tokens });
      return publicStatus();
    }),
    preview: ({ currency: displayCurrency = 'USD', userInitiated = false } = {}) => serial(async () => {
      if (userInitiated !== true) fail('USER_ACTION_REQUIRED');
      if (!currency(displayCurrency)) fail('INVALID_CURRENCY');
      await load(); if (!record.tokens) fail('NOT_CONNECTED');
      validateScopes(record.tokens.scope);
      if (record.tokens.expiresAt <= timestamp() + 30000) await refresh();
      const payload = await read(ACCOUNTS), permission = validateScopes(record.tokens.scope);
      if (payload.s !== 'ok' || !Array.isArray(payload.d?.accounts) || payload.d.accounts.length > 50) fail('INVALID_RESPONSE', 502);
      const seen = new Set(), accounts = [];
      for (const row of payload.d.accounts) {
        if (!isObject(row)) fail('INVALID_RESPONSE', 502);
        const id = accountId(row.account_id);
        if (!permission.ids.includes(id)) fail('PERMISSION_DENIED', 403);
        if (seen.has(id)) fail('INVALID_RESPONSE', 502); seen.add(id);
        // Japan margin/derivative accounts require asset_category; no silent guess.
        if (row.sub_accounts?.length || /JP|JAPAN/i.test(String(row.security_firm))) fail('UNSUPPORTED_ACCOUNT');
        const fundsPayload = await read(`/api/v1.0/accounts/${id}/funds?currency=${displayCurrency}`);
        const positionsPayload = await read(`/api/v1.0/accounts/${id}/positions`);
        if (fundsPayload.s !== 'ok' || !isObject(fundsPayload.d) || positionsPayload.s !== 'ok' || !Array.isArray(positionsPayload.d) || positionsPayload.d.length > 5000) fail('INVALID_RESPONSE', 502);
        const funds = { currency: currency(fundsPayload.d.currency) };
        if (!funds.currency) fail('INVALID_RESPONSE', 502);
        for (const field of ['total_assets', 'securities_assets', 'funds_assets', 'cash', 'market_val', 'long_mv', 'short_mv', 'pending_asset', 'frozen_cash', 'available_funds', 'unrealized_pl', 'realized_pl', 'hk_cash', 'us_cash', 'jp_cash', 'cn_cash', 'sg_cash', 'kr_cash', 'my_cash', 'au_cash']) funds[field] = decimal(fundsPayload.d[field]);
        const positions = positionsPayload.d.map(position => {
          if (!isObject(position) || typeof position.code !== 'string' || !/^[A-Z]{1,5}\.[A-Za-z0-9._-]{1,60}$/.test(position.code) || !currency(position.currency) || decimal(position.qty) === null) fail('INVALID_RESPONSE', 502);
          return { code: position.code, name: safeName(position.stock_name, permission.ids), currency: position.currency, quantity: decimal(position.qty), marketPrice: decimal(position.nominal_price), marketValue: decimal(position.market_val), costPrice: position.cost_price_valid === true ? decimal(position.cost_price) : null, holdingPnl: position.pl_val_valid === true ? decimal(position.pl_val) : null, holdingPnlPct: position.pl_ratio_valid === true ? decimal(position.pl_ratio) : null, positionSide: ['NONE', 'LONG', 'SHORT'].includes(position.position_side) ? position.position_side : 'NONE' };
        });
        accounts.push({ accountRef: await vault.reference(id), accountSuffix: suffix(id), securityFirm: safeName(row.security_firm, permission.ids), accountType: safeName(row.acc_type, permission.ids), funds, positions });
      }
      const remainingIds = validateScopes(record.tokens.scope).ids;
      if ([...seen].some(id => !remainingIds.includes(id))) fail('PERMISSION_DENIED', 403);
      return { provider: 'moomoo', mode: 'preview', readOnly: true, persisted: false, fetchedAt: new Date(timestamp()).toISOString(), accountCount: accounts.length, accounts };
    }),
  });
}
