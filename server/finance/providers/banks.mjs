import https from 'node:https';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fail, CURRENCIES} from '../arithmetic.mjs';

// Only these read APIs and user-initiated consent APIs are reachable. Financial
// payments, transfers, orders and arbitrary provider-supplied URLs are excluded.
const LIMIT = 8 * 1024 * 1024;
const TIMEOUT = 30_000;
const PAGE_LIMIT = 100;
const field = (key, label, type = 'text', required = true, options) => ({key, label, type, required, ...(options ? {options} : {})});
const envField = (options = ['production', 'sandbox']) => field('environment', '接口环境', 'select', true, options);
export const BANK_PROVIDER_DEFINITIONS = [
  {id: 'plaid', name: 'Plaid', description: '通过 Plaid Link 授权银行账户、交易、投资或负债；覆盖取决于地区、机构及已开通产品。', descriptionEn: 'Bank accounts, transactions, investments and liabilities through Plaid Link.', regions: ['US', 'CA', 'GB', 'EU'], capabilities: ['accounts', 'balances', 'transactions', 'positions', 'liabilities'], docsUrl: 'https://plaid.com/docs/', setupUrl: 'https://dashboard.plaid.com/', fields: [envField(), field('clientId', 'Client ID'), field('secret', 'Secret', 'password'), field('countryCodes', '国家代码（逗号分隔，例如 US）'), field('products', '读取产品', 'select', true, ['transactions', 'investments', 'liabilities', 'transactions,investments,liabilities'])]},
  {id: 'teller', name: 'Teller', description: '美国银行余额与交易；真实数据需要应用的 mTLS 证书，开发环境可读取真实账户。', descriptionEn: 'US bank balances and transactions with application mTLS certificates.', regions: ['US'], capabilities: ['accounts', 'balances', 'transactions', 'liabilities'], docsUrl: 'https://teller.io/docs/', setupUrl: 'https://teller.io/dashboard', fields: [envField(['production', 'development', 'sandbox']), field('applicationId', 'Application ID'), field('certificatePem', '客户端证书（PEM）', 'file', false), field('privateKeyPem', '客户端私钥（PEM）', 'file', false)]},
  {id: 'truelayer', name: 'TrueLayer', description: '使用 Data API v3 授权英国银行账户、余额与交易；需要应用权限和已注册的回调地址。', descriptionEn: 'UK bank accounts, balances and transactions via the TrueLayer Data API v3 hosted consent flow.', regions: ['GB'], capabilities: ['accounts', 'balances', 'transactions'], docsUrl: 'https://docs.truelayer.com/docs/create-a-connection-v3', setupUrl: 'https://console.truelayer.com/', fields: [envField(), field('clientId', 'Client ID'), field('clientSecret', 'Client Secret', 'password'), field('countries', '银行所在国家', 'select', true, ['GB']), field('userName', '授权人的完整姓名'), field('userEmail', '授权人的电子邮箱')]},
];

const invalid = () => fail('服务返回的数据不完整或格式不受支持，现有记录未更改。', 'finance_invalid_provider_response', 502);
const required = (value, label = '连接配置', max = 24_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(`请检查${label}。`, 'finance_provider_config_invalid');
  return value.trim();
};
const providerId = id => {if (!BANK_PROVIDER_DEFINITIONS.some(p => p.id === id)) fail('银行连接不存在。', 'finance_provider_unknown', 404); return id;};
function environment(id, config) {
  const value = config.environment;
  if (!(id === 'teller' ? ['production', 'development', 'sandbox'] : ['production', 'sandbox']).includes(value)) fail('请选择接口环境。', 'finance_provider_config_invalid');
  return value;
}
function stamp(now) {return new Date(now()).toISOString();}
function identifier(value) {if (typeof value !== 'string' || !value || value.length > 200 || /[\x00-\x1f]/.test(value)) invalid(); return value;}
function string(value, fallback = '') {return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback;}
function currency(value) {if (!CURRENCIES.has(value)) fail('账户包含尚未支持的币种，未导入不完整金额。', 'finance_provider_currency_unsupported', 422); return value;}
function list(value) {if (!Array.isArray(value)) invalid(); return value;}
function unique(rows, key) {const values = rows.map(key); if (new Set(values).size !== values.length) invalid(); return rows;}
function integer(value) {if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) invalid(); return Number(value);}

// Preserve numeric JSON tokens before JSON.parse so account balances and minor
// units never pass through a binary floating point value.
function parseJson(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > LIMIT) invalid();
  try {return JSON.parse(body.replace(/"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (token, number) => number === undefined ? token : JSON.stringify(number)));}
  catch {invalid();}
}
function decimal(value) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw) || raw.length > 100) invalid();
  const [mantissa, exponent = '0'] = raw.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const [whole, tail = ''] = mantissa.replace(/^-/, '').split('.');
  const shift = Number(exponent); if (!Number.isInteger(shift) || Math.abs(shift) > 30) invalid();
  const digits = whole + tail, point = whole.length + shift;
  let expanded = point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point);
  expanded = expanded.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  if (!/^\d{1,15}(?:\.\d{1,18})?$/.test(expanded)) invalid();
  return negative && expanded !== '0' ? '-' + expanded : expanded;
}
const abs = value => decimal(value).replace(/^-/, '');
function divide(left, right) {
  if (left == null || decimal(right) === '0') return null;
  const fraction = value => {const str = decimal(value), [whole, tail = ''] = str.replace(/^-/, '').split('.'); return {n: BigInt(whole + tail) * (str.startsWith('-') ? -1n : 1n), d: 10n ** BigInt(tail.length)};};
  const a = fraction(left), b = fraction(right), scaled = a.n * b.d * 10n ** 18n / (a.d * b.n), sign = scaled < 0n ? '-' : '', n = scaled < 0n ? -scaled : scaled;
  return decimal(`${sign}${n / 10n ** 18n}.${String(n % 10n ** 18n).padStart(18, '0')}`);
}
function minorAmount(value, code) {
  currency(code); const raw = String(value); if (!/^-?\d+$/.test(raw)) invalid();
  // Every currently supported currency is 2-digit except JPY/KRW.
  const places = ['JPY', 'KRW'].includes(code) ? 0 : 2, negative = raw.startsWith('-'), digits = raw.replace(/^-/, '').padStart(places + 1, '0');
  return decimal((negative ? '-' : '') + (places ? digits.slice(0, -places) + '.' + digits.slice(-places) : digits));
}
function date(value) {if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value.slice(0, 10)).toISOString().slice(0, 10) !== value.slice(0, 10)) invalid(); return value;}
function range(config, now) {
  const to = config.to || stamp(now).slice(0, 10), from = config.from || new Date(now() - 90 * 86400_000).toISOString().slice(0, 10);
  date(from); date(to); if (from.length !== 10 || to.length !== 10 || from > to) invalid(); return {from, to};
}
function countries(value) {const result = required(value, '国家代码').split(',').map(v => v.trim().toUpperCase()); if (!result.length || result.length > 20 || result.some(v => !/^[A-Z]{2}$/.test(v))) fail('国家代码须使用两位大写字母并以逗号分隔。', 'finance_provider_config_invalid'); return [...new Set(result)];}
function publicRedirect(value, origin) {
  let url, base; try {url = new URL(value); base = new URL(origin);} catch {fail('授权回调地址无效。', 'finance_callback_invalid');}
  if (url.origin !== base.origin || url.username || url.password || !['https:', 'http:'].includes(url.protocol) || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) fail('授权回调必须返回本应用。', 'finance_callback_invalid');
  return url.href;
}
async function jsonRequest(url, init, {fetchImpl = fetch} = {}) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || !['sandbox.plaid.com', 'production.plaid.com', 'api.truelayer.com', 'api.truelayer-sandbox.com', 'auth.truelayer.com', 'auth.truelayer-sandbox.com'].includes(target.hostname)) fail('接口地址不受支持。', 'finance_provider_url_invalid');
  try {
    const response = await fetchImpl(target.href, {...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT)});
    if (!response.ok) {await response.body?.cancel?.(); requestFailure(response.status);}
    return parseJson(await boundedBody(response));
  } catch (error) {if (error?.code?.startsWith('finance_')) throw error; fail('金融服务暂时无法读取，请检查网络或稍后重试。', 'finance_provider_request_failed', 502);}
}
function requestFailure(status) {
  if (status === 401) fail('金融服务的凭据或授权已失效，请重新配置或授权。', 'finance_provider_unauthorized', 409);
  if (status === 403) fail('应用尚未获得此数据或产品的读取权限。', 'finance_provider_forbidden', 403);
  if (status === 429) fail('金融服务暂时限制了读取频率，请稍后重试。', 'finance_provider_rate_limited', 429);
  fail(`金融服务请求未完成（HTTP ${Number(status) || 502}）。请稍后重试。`, 'finance_provider_request_failed', 502);
}
async function boundedBody(response) {
  if (Number(response.headers?.get?.('content-length') || 0) > LIMIT) {await response.body?.cancel?.(); invalid();}
  if (!response.body?.getReader) return response.text();
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > LIMIT) {await reader.cancel(); invalid();} chunks.push(Buffer.from(value));}
    return Buffer.concat(chunks).toString('utf8');
  } finally {reader.releaseLock();}
}
function snapshot(id, config, now, transactions = true) {return {provider: id, readOnly: true, fetchedAt: stamp(now), environment: environment(id, config), complete: true, accounts: [], positions: [], transactions: [], transactionMode: transactions ? 'snapshot' : 'none', ...(transactions ? {transactionRange: range(config, now)} : {})};}
export function isBankAuthorized(id, config) {return Boolean(config?.authorization?.providerId === id && config.authorization.environment === config.environment && (id === 'truelayer' ? config.authorization.connectionId : config.authorization.accessToken));}
function authorization(id, config) {if (!isBankAuthorized(id, config)) fail('请先完成此银行连接的授权。', 'finance_provider_authorization_required', 409); return config.authorization;}
function authorizedConfig(id, config, values, now) {return {...config, authorization: {providerId: id, environment: environment(id, config), connectedAt: stamp(now), ...values}};}

function plaidProducts(config) {const products = required(config.products, '读取产品').split(','); if (!products.length || products.some(v => !['transactions', 'investments', 'liabilities'].includes(v)) || new Set(products).size !== products.length) fail('读取产品配置无效。', 'finance_provider_config_invalid'); return products;}
function plaid(config, options) {
  const host = environment('plaid', config) === 'sandbox' ? 'sandbox.plaid.com' : 'production.plaid.com';
  const headers = {'Content-Type': 'application/json', 'PLAID-CLIENT-ID': required(config.clientId, 'Client ID'), 'PLAID-SECRET': required(config.secret, 'Secret'), 'Plaid-Version': '2020-09-14'};
  return (path, body) => {
    if (!['/link/token/create', '/link/token/get', '/item/public_token/exchange', '/accounts/get', '/transactions/sync', '/transactions/get', '/investments/holdings/get', '/liabilities/get'].includes(path)) invalid();
    return jsonRequest(`https://${host}${path}`, {method: 'POST', headers, body: JSON.stringify(body)}, options);
  };
}
function plaidAccount(row, fetchedAt) {
  const credit = ['credit', 'loan'].includes(row.type), type = row.type === 'investment' ? 'investment' : row.type === 'depository' ? 'cash' : 'other';
  if (!['credit', 'loan', 'investment', 'depository', 'other'].includes(row.type)) invalid();
  if (row.type === 'investment' && row.balances?.margin_loan_amount != null && decimal(row.balances.margin_loan_amount) !== '0') fail('此投资账户包含融资余额，当前无法确认净值口径，请使用券商净值报表连接。', 'finance_provider_margin_unsupported', 422);
  // available on a credit account is a credit limit, not money owned or owed.
  if (row.balances?.current == null) fail('机构未返回账面余额，未将可用额度当作资产。', 'finance_provider_balance_unavailable', 422);
  return {accountRef: identifier(row.account_id), name: string(row.name, 'Plaid 账户'), kind: credit ? 'liability' : 'asset', ...(credit ? {liabilityType: row.type === 'credit' ? 'credit_card' : row.subtype === 'mortgage' ? 'mortgage' : row.subtype === 'auto' ? 'vehicle_loan' : 'other'} : {assetType: type}), amount: decimal(row.balances.current), currency: currency(row.balances.iso_currency_code), asOf: row.balances.last_updated_datetime ? date(row.balances.last_updated_datetime) : fetchedAt, accountSuffix: string(row.mask), sourceName: 'Plaid（机构缓存余额）'};
}
async function readPlaid(config, options) {
  const auth = authorization('plaid', config), products = plaidProducts(config), call = plaid(config, options), out = snapshot('plaid', config, options.now, products.includes('transactions'));
  const response = await call('/accounts/get', {access_token: auth.accessToken});
  out.accounts = unique(list(response.accounts).map(row => plaidAccount(row, out.fetchedAt)), row => row.accountRef);
  if (!out.accounts.length) fail('本次授权没有可读取账户。', 'finance_provider_no_accounts', 409);
  if (products.includes('investments')) {
    const data = await call('/investments/holdings/get', {access_token: auth.accessToken});
    const investmentAccounts = unique(list(data.accounts), row => identifier(row.account_id));
    for (const latest of investmentAccounts) {
      const index = out.accounts.findIndex(account => account.accountRef === latest.account_id);
      if (index === -1) invalid();
      if (latest.type === 'investment') out.accounts[index] = plaidAccount(latest, out.fetchedAt);
    }
    if (out.accounts.some(account => account.assetType === 'investment' && !investmentAccounts.some(latest => latest.account_id === account.accountRef && latest.type === 'investment'))) invalid();
    const securities = new Map(unique(list(data.securities), s => identifier(s.security_id)).map(s => [s.security_id, s]));
    const types = {equity: 'stock', etf: 'etf', 'mutual fund': 'fund', 'fixed income': 'bond', cash: 'cash', cryptocurrency: 'crypto', derivative: 'other'};
    for (const holding of list(data.holdings)) {
      const account = out.accounts.find(a => a.accountRef === holding.account_id), security = securities.get(holding.security_id); if (!account || !security || account.assetType !== 'investment') invalid();
      const quantity = decimal(holding.quantity);
      out.positions.push({positionRef: identifier(holding.security_id), accountRef: account.accountRef, name: string(security.name, '投资持仓'), symbol: string(security.ticker_symbol), kind: security.type === 'derivative' && security.subtype === 'option' ? 'option' : types[security.type] || 'other', currency: currency(holding.iso_currency_code), quantity, costPrice: holding.cost_basis == null ? null : divide(holding.cost_basis, quantity), marketPrice: holding.institution_price == null ? null : decimal(holding.institution_price), marketValue: decimal(holding.institution_value), asOf: holding.institution_price_datetime ? date(holding.institution_price_datetime) : holding.institution_price_as_of ? date(holding.institution_price_as_of) : out.fetchedAt});
    }
    unique(out.positions, p => p.accountRef + ':' + p.positionRef);
  }
  if (products.includes('liabilities')) {
    const data = await call('/liabilities/get', {access_token: auth.accessToken});
    for (const latest of unique(list(data.accounts), row => identifier(row.account_id))) {
      const index = out.accounts.findIndex(account => account.accountRef === latest.account_id);
      if (index === -1) invalid();
      // This endpoint may include additional account types. Preserve the
      // investment snapshot used with holdings; refresh only its debt balances.
      if (['credit', 'loan'].includes(latest.type)) out.accounts[index] = plaidAccount(latest, out.fetchedAt);
    }
    if (!data.liabilities || typeof data.liabilities !== 'object') invalid();
    for (const rows of Object.values(data.liabilities)) {
      if (rows == null) continue;
      for (const liability of list(rows)) {
        const account = out.accounts.find(a => a.accountRef === liability.account_id); if (!account || account.kind !== 'liability') invalid();
        account.liabilityDetails = {nextPaymentDueDate: liability.next_payment_due_date || null, minimumPaymentAmount: liability.minimum_payment_amount == null ? null : decimal(liability.minimum_payment_amount), lastPaymentAmount: liability.last_payment_amount == null ? null : decimal(liability.last_payment_amount)};
      }
    }
  }
  if (out.transactionMode === 'snapshot') {
    // /transactions/get alone does not disclose whether the initial 30-day
    // pull or the full historical pull has completed. Check readiness first;
    // this probe is stateless and does not advance a stored sync cursor.
    const ready = await call('/transactions/sync', {access_token: auth.accessToken, count: 1});
    if (ready.transactions_update_status !== 'HISTORICAL_UPDATE_COMPLETE') fail('Plaid 的历史交易仍在准备，完成后才能导入完整区间。', 'finance_provider_transactions_pending', 409);
    let offset = 0, expected = null; const seen = new Set();
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const data = await call('/transactions/get', {access_token: auth.accessToken, start_date: out.transactionRange.from, end_date: out.transactionRange.to, options: {count: 500, offset}});
      const total = integer(data.total_transactions), rows = list(data.transactions);
      if (expected !== null && total !== expected || total > 50_000 || rows.length > 500 || offset + rows.length > total || !rows.length && offset < total) invalid(); expected = total;
      for (const row of rows) {
        const id = identifier(row.transaction_id); if (seen.has(id)) invalid(); seen.add(id);
        const account = out.accounts.find(a => a.accountRef === row.account_id); if (!account) invalid();
        if (row.pending === true) continue;
        if (row.pending !== false) invalid();
        const amount = decimal(row.amount), code = currency(row.iso_currency_code), day = date(row.date).slice(0, 10), category = row.personal_finance_category?.detailed || row.personal_finance_category?.primary || (Array.isArray(row.category) ? row.category.join(' / ') : '');
        if (code !== account.currency || day < out.transactionRange.from || day > out.transactionRange.to) invalid();
        const transfer = ['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'].includes(row.personal_finance_category?.primary);
        out.transactions.push({transactionRef: id, accountRef: row.account_id, occurredOn: day, kind: transfer ? 'transfer' : amount.startsWith('-') ? 'income' : 'expense', amount: abs(amount), currency: code, merchant: string(row.merchant_name || row.name, 'Plaid 交易'), category: string(category), note: `来源：Plaid；机构交易类型：${string(row.transaction_type, '未提供')}`});
      }
      offset += rows.length; if (offset === total) break; if (page === PAGE_LIMIT - 1) invalid();
    }
  }
  return out;
}

function tellerCredentials(config, token) {
  const env = environment('teller', config), cert = config.certificatePem, key = config.privateKeyPem;
  if (env !== 'sandbox' && (!cert || !key)) fail('真实账户连接需要 Teller 客户端证书和私钥。', 'finance_teller_certificate_required');
  if ((cert || key) && (!/^-----BEGIN CERTIFICATE-----/.test(cert || '') || !/^-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(key || ''))) fail('请提供有效的 PEM 证书与私钥。', 'finance_teller_certificate_invalid');
  return {cert, key, headers: {Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(required(token, '访问令牌') + ':').toString('base64')}};
}
async function tellerRequest(url, credentials, options) {
  const target = new URL(url);
  if (target.origin !== 'https://api.teller.io' || target.username || target.password || !/^\/accounts(?:\/[^/]+\/(?:balances|transactions))?$/.test(target.pathname)) invalid();
  try {
    // The injectable transport receives the exact TLS settings used by HTTPS.
    if (options.requestImpl) {
      const response = await options.requestImpl(target.href, {method: 'GET', ...credentials, rejectUnauthorized: true, timeout: TIMEOUT, maxResponseBytes: LIMIT});
      if (response.statusCode < 200 || response.statusCode >= 300) requestFailure(response.statusCode);
      return parseJson(response.body);
    }
    const body = await new Promise((resolve, reject) => {
      const request = https.request(target, {method: 'GET', ...credentials, rejectUnauthorized: true, signal: AbortSignal.timeout(TIMEOUT)}, response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {response.resume(); try {requestFailure(response.statusCode);} catch (error) {reject(error);} return;}
        const chunks = []; let bytes = 0;
        response.on('data', chunk => {bytes += chunk.length; if (bytes > LIMIT) response.destroy(new Error('response too large')); else chunks.push(chunk);});
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); response.on('error', reject);
      });
      request.on('error', reject); request.end();
    });
    return parseJson(body);
  } catch (error) {if (error?.code?.startsWith('finance_')) throw error; fail('Teller 暂时无法读取，请检查网络、证书或重新授权。', 'finance_provider_request_failed', 502);}
}
async function readTeller(config, options) {
  const auth = authorization('teller', config), credentials = tellerCredentials(config, auth.accessToken), out = snapshot('teller', config, options.now);
  const call = path => tellerRequest('https://api.teller.io' + path, credentials, options);
  const accounts = unique(list(await call('/accounts')), a => identifier(a.id));
  if (!accounts.length) fail('本次授权没有可读取账户。', 'finance_provider_no_accounts', 409);
  for (const account of accounts) {
    if (account.status !== 'open') fail('连接包含已关闭或失去授权的账户，请先重新确认授权范围。', 'finance_provider_account_unavailable', 409);
    if (!['credit', 'depository'].includes(account.type) || !account.links?.balances || !account.links?.transactions) fail('机构未提供所需的余额或交易读取能力。', 'finance_provider_scope_missing', 422);
    const ref = identifier(account.id), base = '/accounts/' + encodeURIComponent(ref), balance = await call(base + '/balances');
    if (balance.account_id !== ref || balance.ledger == null) fail('机构未返回账面余额，现有记录未更改。', 'finance_provider_balance_unavailable', 422);
    out.accounts.push({accountRef: ref, name: string(account.name, 'Teller 账户'), kind: account.type === 'credit' ? 'liability' : 'asset', ...(account.type === 'credit' ? {liabilityType: 'credit_card'} : {assetType: 'cash'}), amount: decimal(balance.ledger), currency: currency(account.currency), asOf: out.fetchedAt, accountSuffix: string(account.last_four), institution: string(account.institution?.name), sourceName: 'Teller'});
    let fromId; const seen = new Set();
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const query = new URLSearchParams({count: '500', start_date: out.transactionRange.from, end_date: out.transactionRange.to, ...(fromId ? {from_id: fromId} : {})});
      const rows = list(await call(base + '/transactions?' + query)); if (rows.length > 500) invalid();
      for (const row of rows) {
        const id = identifier(row.id); if (seen.has(id) || row.account_id !== ref) invalid(); seen.add(id);
        if (row.status === 'pending') continue; if (row.status !== 'posted') invalid();
        if (row.currency != null && row.currency !== account.currency) invalid();
        const amount = decimal(row.amount), day = date(row.date).slice(0, 10); if (day < out.transactionRange.from || day > out.transactionRange.to) invalid();
        out.transactions.push({transactionRef: id, accountRef: ref, occurredOn: day, kind: row.type === 'transfer' ? 'transfer' : amount.startsWith('-') ? 'income' : 'expense', amount: abs(amount), currency: account.currency, merchant: string(row.details?.counterparty?.name || row.description, 'Teller 交易'), category: string(row.details?.category), note: '来源：Teller；机构交易类型：' + string(row.type, '未提供')});
      }
      if (rows.length < 500) break; fromId = identifier(rows.at(-1).id); if (page === PAGE_LIMIT - 1) invalid();
    }
  }
  return out;
}

async function trueLayer(config, options) {
  const sandbox = environment('truelayer', config) === 'sandbox', suffix = sandbox ? 'truelayer-sandbox.com' : 'truelayer.com';
  const body = new URLSearchParams({grant_type: 'client_credentials', client_id: required(config.clientId, 'Client ID'), client_secret: required(config.clientSecret, 'Client Secret'), scope: 'data'});
  const token = await jsonRequest(`https://auth.${suffix}/connect/token`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()}, options);
  if (!token.access_token || token.token_type?.toLowerCase() !== 'bearer') invalid();
  return (path, {body, connectionId} = {}) => {
    if (!/^\/v3\/(?:data-connections|connected-accounts(?:\/[^/]+\/(?:balance|transactions\/requests(?:\/[^/]+)?))?)$/.test(path.split('?')[0])) invalid();
    return jsonRequest(`https://api.${suffix}${path}`, {method: body ? 'POST' : 'GET', headers: {Authorization: 'Bearer ' + token.access_token, Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {}), ...(connectionId ? {'Connection-Id': connectionId} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, options);
  };
}
function connectedAccounts(data) {
  const rows = unique(list(data.items), a => identifier(a.id));
  if (!data.pagination || data.pagination.next_cursor || rows.length >= 50) fail('TrueLayer 当前账户分页尚未开放，无法确认账户列表完整。', 'finance_provider_incomplete_pagination', 422);
  if (!rows.length) fail('本次授权没有可读取账户。', 'finance_provider_no_accounts', 409);
  if (rows.some(row => row.type !== 'account')) fail('TrueLayer Data v3 尚未完整支持此账户类型。', 'finance_provider_account_unsupported', 422);
  return rows;
}
async function readTrueLayer(config, options) {
  const auth = authorization('truelayer', config), call = await trueLayer(config, options), out = snapshot('truelayer', config, options.now), connectionId = auth.connectionId;
  for (const account of connectedAccounts(await call('/v3/connected-accounts', {connectionId}))) {
    const ref = identifier(account.id), base = '/v3/connected-accounts/' + encodeURIComponent(ref), balance = await call(base + '/balance', {connectionId});
    if (balance.currency !== account.currency) invalid();
    const suffix = list(account.account_identifiers).map(v => v.account_number || v.iban).find(Boolean)?.slice(-4) || '';
    out.accounts.push({accountRef: ref, name: (account.account_type === 'savings' ? '储蓄账户' : '银行账户') + (suffix ? ' · ' + suffix : ''), kind: 'asset', assetType: 'cash', amount: minorAmount(balance.current_balance_in_minor, balance.currency), currency: currency(balance.currency), asOf: out.fetchedAt, accountSuffix: suffix, sourceName: 'TrueLayer'});
    let cursor; const seen = new Set(), cursors = new Set();
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const created = await call(base + '/transactions/requests', {connectionId, body: {...out.transactionRange, page_size: 500, ...(cursor ? {cursor} : {})}});
      const requestId = identifier(created.id); if (created.status !== 'pending') invalid();
      let result;
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await call(base + '/transactions/requests/' + encodeURIComponent(requestId), {connectionId});
        if (response.id !== requestId) invalid();
        if (response.status === 'completed') {result = response.result; break;}
        if (response.status === 'failed') fail('银行暂时无法提供完整交易，现有记录未更改。', 'finance_provider_transactions_failed', 502);
        if (response.status !== 'pending') invalid();
        if (attempt < 11) await (options.sleepImpl || delay)(1000);
      }
      if (!result) fail('银行交易仍在处理中，请稍后重新读取。', 'finance_provider_transactions_pending', 409);
      const rows = list(result.items); if (rows.length > 500 || !result.pagination) invalid();
      for (const row of rows) {
        const id = identifier(row.id); if (seen.has(id)) invalid(); seen.add(id);
        if (row.status === 'pending') continue; if (row.status !== 'settled') invalid();
        const amount = minorAmount(row.amount_in_minor, row.currency), day = date(row.timestamp).slice(0, 10); if (row.currency !== account.currency || day < out.transactionRange.from || day > out.transactionRange.to) invalid();
        out.transactions.push({transactionRef: id, accountRef: ref, occurredOn: day, kind: amount.startsWith('-') ? 'expense' : 'income', amount: abs(amount), currency: row.currency, merchant: string(row.description, 'TrueLayer 交易'), note: '来源：TrueLayer；按机构借贷方向记录，未推测消费类别。'});
      }
      cursor = result.pagination.next_cursor; if (!cursor) break;
      if (typeof cursor !== 'string' || cursors.has(cursor) || !rows.length || page === PAGE_LIMIT - 1) invalid(); cursors.add(cursor);
    }
  }
  return out;
}

export async function readBankSnapshot(id, config, {fetchImpl = fetch, now = () => Date.now(), ...extra} = {}) {
  providerId(id); const options = {fetchImpl, now, ...extra};
  return id === 'plaid' ? readPlaid(config, options) : id === 'teller' ? readTeller(config, options) : readTrueLayer(config, options);
}
export async function startBankAuthorization(id, config, {origin, redirectUri, now = () => Date.now(), fetchImpl = fetch, nonce = randomUUID(), ...extra} = {}) {
  providerId(id); const env = environment(id, config), options = {fetchImpl, now, ...extra}, expiresAt = new Date(now() + 10 * 60_000).toISOString();
  if (id === 'plaid') {
    // Hosted Link owns the HTTPS OAuth return path. A local desktop origin must
    // not be supplied as Plaid's production redirect_uri. No SMS/email delivery.
    const data = await plaid(config, options)('/link/token/create', {user: {client_user_id: nonce}, client_name: 'SecondU', products: plaidProducts(config), country_codes: countries(config.countryCodes), language: 'en', hosted_link: {is_mobile_app: false, url_lifetime_seconds: 600}});
    let url; try {url = new URL(data.hosted_link_url);} catch {invalid();}
    if (url.origin !== 'https://secure.plaid.com' || !url.pathname.startsWith('/hl/') || url.username || url.password) invalid();
    return {public: {kind: 'hosted_link', authorizationUrl: url.href, environment: env, expiresAt: data.expiration || expiresAt}, private: {providerId: id, environment: env, linkToken: required(data.link_token, 'Link Token')}};
  }
  if (id === 'teller') {
    tellerCredentials(config, 'configuration-validation');
    return {public: {kind: 'teller_connect', applicationId: required(config.applicationId, 'Application ID'), environment: env, products: ['balance', 'transactions'], expiresAt}, private: {providerId: id, environment: env}};
  }
  const allowedCountries = countries(config.countries);
  if (allowedCountries.length !== 1 || allowedCountries[0] !== 'GB') fail('TrueLayer Data v3 当前仅支持英国银行。', 'finance_provider_region_unsupported');
  const call = await trueLayer(config, options);
  const data = await call('/v3/data-connections', {body: {scopes: ['accounts', 'balance', 'transactions'], provider_selection: {type: 'user_selected', filter: {countries: allowedCountries}}, user: {name: required(config.userName, '完整姓名', 200), email: required(config.userEmail, '电子邮箱', 200)}, user_consent: {type: 'authorization_flow_captured'}, hosted_page: {type: 'authorization_flow', return_uri: publicRedirect(redirectUri, origin), country_code: allowedCountries[0]}, data_access_type: 'recurring'}});
  let url; try {url = new URL(data.hosted_page?.uri);} catch {invalid();}
  if (url.username || url.password || url.origin !== (env === 'sandbox' ? 'https://app.truelayer-sandbox.com' : 'https://app.truelayer.com') || !['authorization_required', 'authorizing'].includes(data.status)) invalid();
  return {public: {kind: 'redirect', authorizationUrl: url.href, environment: env, expiresAt}, private: {providerId: id, environment: env, connectionId: identifier(data.id)}};
}
export async function completeBankAuthorization(id, config, input, {pending, now = () => Date.now(), fetchImpl = fetch, ...extra} = {}) {
  providerId(id); if (pending?.providerId !== id || pending.environment !== environment(id, config) || input.error) fail('授权未完成，请重新开始。', 'finance_callback_invalid', 400);
  const options = {fetchImpl, now, ...extra};
  if (id === 'plaid') {
    const call = plaid(config, options), linkToken = required(pending.linkToken, '本次授权'), session = await call('/link/token/get', {link_token: linkToken});
    if (session.link_token !== linkToken) invalid();
    const sameValues = (left, right) => Array.isArray(left) && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
    if (!sameValues(session.metadata?.initial_products, plaidProducts(config)) || !sameValues(session.metadata?.country_codes, countries(config.countryCodes)) || session.metadata?.client_name !== 'SecondU') invalid();
    const sessions = list(session.link_sessions), results = [];
    for (const item of sessions) {
      identifier(item.link_session_id);
      if (!item.finished_at) continue;
      date(item.finished_at); date(item.started_at);
      if (Date.parse(item.finished_at) < Date.parse(item.started_at)) invalid();
      for (const result of list(item.results?.item_add_results || [])) {
        if (!list(result.accounts).length || result.accounts.some(account => !account.id) || !result.institution?.institution_id) invalid();
        results.push(required(result.public_token, '授权结果'));
      }
    }
    if (results.length > 1) fail('本次授权返回多个银行连接，请分别连接一个机构。', 'finance_provider_multiple_items', 409);
    if (!results.length) {
      if (!sessions.length || sessions.some(item => !item.finished_at)) fail('银行授权尚未完成，请在授权页完成后继续。', 'finance_provider_authorization_pending', 409);
      fail('银行授权已结束但未成功连接账户，请重新开始。', 'finance_provider_authorization_incomplete', 409);
    }
    const data = await call('/item/public_token/exchange', {public_token: results[0]});
    return authorizedConfig(id, config, {accessToken: required(data.access_token, '访问令牌'), itemId: identifier(data.item_id)}, now);
  }
  if (id === 'teller') {
    const accessToken = required(input.accessToken, '授权结果'), credentials = tellerCredentials(config, accessToken), rows = list(await tellerRequest('https://api.teller.io/accounts', credentials, options));
    if (!rows.length) fail('本次授权没有可读取账户。', 'finance_provider_no_accounts', 409);
    if (input.enrollment?.id && rows.some(row => row.enrollment_id !== input.enrollment.id)) fail('账户与本次授权不一致。', 'finance_callback_invalid');
    return authorizedConfig(id, config, {accessToken}, now);
  }
  const connectionId = identifier(pending.connectionId), provided = input.connectionId || input.connection_id;
  if (provided && provided !== connectionId) fail('本次授权的连接标识不匹配。', 'finance_callback_invalid');
  const call = await trueLayer(config, options); connectedAccounts(await call('/v3/connected-accounts', {connectionId}));
  return authorizedConfig(id, config, {connectionId}, now);
}
