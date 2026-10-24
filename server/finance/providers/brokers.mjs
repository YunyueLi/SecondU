import {createHash, createHmac} from 'node:crypto';
import {XMLParser, XMLValidator} from 'fast-xml-parser';
import {HttpError} from '../../http-error.mjs';

const IBKR_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const SNAPTRADE_BASE = 'https://api.snaptrade.com';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 10000;
const pendingReports = new Map();
const activeReports = new Map();
const xml = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, parseAttributeValue: false, processEntities: false, trimValues: true});

export const BROKER_PROVIDER_DEFINITIONS = Object.freeze([
  {
    id: 'ibkr_flex', name: 'Interactive Brokers Flex',
    description: '使用自己的 Flex Token 和 Query ID 读取账户净值与期末持仓。请创建 XML Activity Flex Query，日期格式 yyyyMMdd，勾选 NAV in Base 的 Account ID、Currency、Report Date、Total，以及 Open Positions 的 Summary 和全部字段。账户净值与持仓均使用报表日期；不导入交易流水。',
    regions: ['以 IBKR 账户及 Flex Web Service 可用范围为准'], capabilities: ['accounts', 'balances', 'positions'],
    docsUrl: 'https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report',
    setupUrl: 'https://www.interactivebrokers.com/docs/web-api/flex-web-service/client-portal-configuration/create-a-flex-query',
    fields: [{key: 'token', label: 'Flex Token', type: 'password', required: true}, {key: 'queryId', label: 'Flex Query ID', type: 'text', required: true}],
  },
  {
    id: 'snaptrade', name: 'SnapTrade Personal',
    description: '读取你已在 SnapTrade 连接的实盘账户净值与持仓。需要自己的 Personal Client ID 和 Consumer Key；账户总值使用每日缓存，并保留来源更新时间。不导入交易流水。',
    regions: ['以 SnapTrade 支持的机构及个人账户资格为准'], capabilities: ['accounts', 'balances', 'positions'],
    docsUrl: 'https://docs.snaptrade.com/docs/authentication-methods',
    setupUrl: 'https://docs.snaptrade.com/docs/getting-started',
    fields: [{key: 'clientId', label: 'Personal Client ID', type: 'text', required: true}, {key: 'consumerKey', label: 'Personal Consumer Key', type: 'password', required: true}],
  },
]);

const fail = (code, message, status = 502) => { throw new HttpError(status, message, code); };
const incomplete = () => fail('finance_provider_incomplete', '供应方数据缺少完整金额、币种、日期或持仓字段，未导入。');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = value => { if (!Array.isArray(value) || value.length > MAX_ROWS) incomplete(); return value; };
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
const optionalDecimal = value => value == null || value === '' ? null : preciseDecimal(value);

// Preserve JSON numeric lexemes before JavaScript can round an account total.
// XML numeric attributes and the current positions API already provide strings.
function preciseDecimal(value) {
  if (typeof value !== 'string' || value.length > 80) incomplete();
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(value);
  if (!match) incomplete();
  const [, sign, whole, tail = '', exponent = '0'] = match;
  const point = whole.length + Number(exponent);
  if (point < -36 || point > 36) incomplete();
  let digits = whole + tail;
  let expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  expanded = expanded.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const [integer, fraction = ''] = expanded.split('.');
  if (integer.length > 15 || fraction.length > 18) incomplete();
  return expanded === '0' ? '0' : sign + expanded;
}

function product(...values) {
  let n = 1n, places = 0;
  for (const value of values) {
    const [whole, fraction = ''] = value.split('.');
    n *= BigInt(whole + fraction);
    places += fraction.length;
  }
  const negative = n < 0n;
  let digits = (negative ? -n : n).toString().padStart(places + 1, '0');
  if (places) digits = `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return preciseDecimal((negative ? '-' : '') + digits);
}

function requiredText(value, secrets, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) incomplete();
  if (secrets.some(secret => value.includes(secret) || value.includes(encodeURIComponent(secret)) || value.includes(encodeURI(secret)))) {
    fail('finance_provider_unsafe_response', '供应方返回的展示字段包含认证信息，未导入。');
  }
  return value.trim();
}

function identifier(value, secrets) {
  const id = requiredText(value, secrets, 160);
  if (!/^[\w.:-]+$/.test(id)) incomplete();
  return id;
}

function currency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) incomplete();
  return value;
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) incomplete();
  const timestamp = Date.parse(value);
  const day = Date.parse(value.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(timestamp) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10) || +value.slice(11, 13) > 23 || +value.slice(14, 16) > 59 || +value.slice(17, 19) > 59) incomplete();
  return new Date(timestamp).toISOString();
}

function flexDate(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) {
    fail('finance_provider_incomplete', 'Flex 日期或字段不完整。请使用 yyyyMMdd 日期格式，并包含 NAV 和 Open Positions 的 Report Date。');
  }
  return isoDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T00:00:00Z`);
}

function credentials(config, keys) {
  if (!object(config) || Object.keys(config).some(key => !keys.includes(key))) fail('finance_provider_config', '连接配置包含不支持的字段。', 400);
  return Object.fromEntries(keys.map(key => {
    const value = config[key];
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\u0000-\u0020\u007f]/.test(value)) fail('finance_provider_config', '请填写完整且有效的连接凭据。', 400);
    return [key, value];
  }));
}

async function requestText(url, headers, {fetchImpl}) {
  let response;
  try {
    response = await fetchImpl(url, {method: 'GET', redirect: 'error', headers: {'Accept': 'application/json, application/xml, text/plain', 'User-Agent': 'SecondU-Finance/1.0', ...headers}, signal: AbortSignal.timeout(15000)});
  } catch (error) {
    if (['AbortError', 'TimeoutError'].includes(error?.name)) fail('finance_provider_timeout', '读取供应方数据超时，请稍后重试。', 504);
    fail('finance_provider_network', '暂时无法连接供应方，请检查网络后重试。');
  }
  if (response.status === 429) fail('finance_provider_rate_limited', '供应方请求过于频繁，请稍后重试。', 429);
  if ([401, 403].includes(response.status)) fail('finance_provider_auth', '供应方未接受认证信息，请检查凭据及读取权限。', 401);
  if (!response.ok) fail('finance_provider_unavailable', '供应方暂未返回可用数据，请稍后重试。');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) fail('finance_provider_response_too_large', '供应方报表过大，请缩短报表期间后重试。');
  if (!response.body) incomplete();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        fail('finance_provider_response_too_large', '供应方报表过大，请缩短报表期间后重试。');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (['AbortError', 'TimeoutError'].includes(error?.name)) fail('finance_provider_timeout', '读取供应方数据超时，请稍后重试。', 504);
    fail('finance_provider_network', '供应方数据传输中断，请稍后重试。');
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function requestJson(url, headers, context) {
  const body = await requestText(url, headers, context);
  try {
    return JSON.parse(body, (_key, value, source) => {
      if (typeof value !== 'number') return value;
      if (!source?.source) incomplete();
      return source.source;
    });
  } catch {
    fail('finance_provider_invalid_response', '供应方返回了无法读取的数据格式，未导入。');
  }
}

async function requestXml(url, context) {
  const body = await requestText(url, {}, context);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(body)) fail('finance_provider_invalid_response', 'Flex 报表包含不支持的 XML 定义，未导入。');
  try {
    if (XMLValidator.validate(body) !== true) throw new Error();
    return xml.parse(body);
  } catch {
    fail('finance_provider_invalid_response', 'Flex 返回了无法读取的 XML 报表，未导入。');
  }
}

function flexFailure(response) {
  const code = response?.ErrorCode;
  if (['1001', '1004', '1005', '1006', '1007', '1008', '1009', '1019', '1021'].includes(code)) fail('finance_provider_pending', 'IBKR 报表尚未就绪，请稍后重试。', 503);
  if (['1018', '1025'].includes(code)) fail('finance_provider_rate_limited', 'IBKR 请求过于频繁，请稍后重试。', 429);
  if (['1011', '1012', '1013', '1015', '1016'].includes(code)) fail('finance_provider_auth', 'IBKR Token 无效、已过期或读取权限受限，请检查 Flex 设置。', 401);
  if (['1010', '1014'].includes(code)) fail('finance_provider_config', '请检查 IBKR Activity Flex Query 的类型和 Query ID。', 400);
  fail('finance_provider_unavailable', 'IBKR 暂未提供有效报表，请检查 Flex 设置后重试。');
}

function unique(rows, field) {
  if (new Set(rows.map(row => row[field])).size !== rows.length) fail('finance_provider_incomplete', '供应方返回了重复或重叠的账户、持仓记录，未导入。');
}

function normalizeFlex(report, secrets) {
  const root = report?.FlexQueryResponse;
  const wrapper = root?.FlexStatements;
  if (!object(root) || root.type !== 'AF' || !object(wrapper)) incomplete();
  const statements = array(asArray(wrapper.FlexStatement));
  if (!statements.length || wrapper.count !== String(statements.length)) incomplete();
  const latest = new Map();
  for (const statement of statements) {
    const ref = identifier(statement.accountId, secrets);
    const date = flexDate(statement.toDate);
    const prior = latest.get(ref);
    if (prior?.date === date) fail('finance_provider_incomplete', 'Flex 报表含同一账户同日期的多个分段，请使用未按模型拆分的账户汇总。');
    if (!prior || prior.date < date) latest.set(ref, {statement, date});
  }
  const accounts = [], positions = [];
  for (const [accountRef, {statement, date}] of latest) {
    const rows = array(asArray(statement.EquitySummaryInBase?.EquitySummaryByReportDateInBase));
    if (!rows.length || !Object.hasOwn(statement, 'OpenPositions')) fail('finance_provider_incomplete', 'Flex 报表必须同时包含 NAV in Base 和 Open Positions（Summary）区段。');
    const navs = rows.map(row => {
      if (identifier(row.accountId, secrets) !== accountRef || row.model) incomplete();
      return {...row, date: flexDate(row.reportDate)};
    }).sort((a, b) => b.date.localeCompare(a.date));
    const nav = navs[0];
    if (nav.date > date || navs[1]?.date === nav.date) incomplete();
    const info = statement.AccountInformation;
    if (info?.accountId && info.accountId !== accountRef) incomplete();
    const accountCurrency = currency(nav.currency === 'BASE_SUMMARY' ? info?.currency : nav.currency);
    const name = requiredText(info?.acctAlias || nav.acctAlias || `IBKR · ${accountRef.slice(-4)}`, secrets);
    accounts.push({accountRef, name, kind: 'asset', assetType: 'investment', amount: preciseDecimal(nav.total), currency: accountCurrency, asOf: nav.date, accountSuffix: accountRef.slice(-4), institution: 'Interactive Brokers', sourceName: 'IBKR Flex Activity Statement'});
    const holdings = array(asArray(statement.OpenPositions?.OpenPosition));
    for (const row of holdings) {
      if (row.levelOfDetail !== 'SUMMARY' || row.model) fail('finance_provider_incomplete', 'Flex 持仓必须使用 Summary 汇总，不支持逐批次或模型分段持仓。');
      if (identifier(row.accountId, secrets) !== accountRef || flexDate(row.reportDate) !== nav.date) incomplete();
      const conid = identifier(row.conid, secrets);
      const symbol = requiredText(row.symbol, secrets, 100);
      const kind = {STK: 'stock', ETF: 'etf', FUND: 'fund', BOND: 'bond', CASH: 'cash', OPT: 'option', FOP: 'option', FUT: 'futures', CRYPTO: 'crypto'}[row.assetCategory] || 'other';
      positions.push({positionRef: `${accountRef}:${conid}`, accountRef, name: requiredText(row.description || symbol, secrets), symbol, kind, currency: currency(row.currency), quantity: preciseDecimal(row.position), costPrice: optionalDecimal(row.costBasisPrice), marketPrice: optionalDecimal(row.markPrice), marketValue: optionalDecimal(row.positionValue), asOf: nav.date, ...(row.listingExchange ? {exchange: requiredText(row.listingExchange, secrets, 60)} : {})});
    }
  }
  unique(accounts, 'accountRef'); unique(positions, 'positionRef');
  return {accounts, positions};
}

async function readIbkr(config, context) {
  const {token, queryId} = credentials(config, ['token', 'queryId']);
  if (!/^\d{1,30}$/.test(queryId)) fail('finance_provider_config', 'Flex Query ID 必须为数字。', 400);
  const secrets = [token];
  const key = createHash('sha256').update(JSON.stringify([token, queryId])).digest('hex');
  if (activeReports.has(key)) return activeReports.get(key);
  const request = readIbkrReport({token, queryId, secrets, key}, context);
  activeReports.set(key, request);
  try { return await request; } finally { activeReports.delete(key); }
}

async function readIbkrReport({token, queryId, secrets, key}, context) {
  for (const [id, record] of pendingReports) if (record.expiresAt < context.now()) pendingReports.delete(id);
  let pending = pendingReports.get(key);
  if (!pending) {
    const url = `${IBKR_BASE}/SendRequest?${new URLSearchParams({t: token, q: queryId, v: '3'})}`;
    const response = (await requestXml(url, context))?.FlexStatementResponse;
    if (response?.Status !== 'Success') flexFailure(response);
    if (typeof response.ReferenceCode !== 'string' || !/^\d{1,64}$/.test(response.ReferenceCode)) incomplete();
    pending = {reference: response.ReferenceCode, expiresAt: context.now() + 10 * 60 * 1000};
    if (pendingReports.size >= 256) pendingReports.delete(pendingReports.keys().next().value);
    pendingReports.set(key, pending);
  }
  const url = `${IBKR_BASE}/GetStatement?${new URLSearchParams({t: token, q: pending.reference, v: '3'})}`;
  const response = await requestXml(url, context);
  if (response.FlexStatementResponse) {
    if (!['1001', '1004', '1005', '1006', '1007', '1008', '1009', '1018', '1019', '1021'].includes(response.FlexStatementResponse.ErrorCode)) pendingReports.delete(key);
    flexFailure(response.FlexStatementResponse);
  }
  pendingReports.delete(key);
  return normalizeFlex(response, secrets);
}

async function readSnapTrade(config, context) {
  const {clientId, consumerKey} = credentials(config, ['clientId', 'consumerKey']);
  const secrets = [clientId, consumerKey];
  // Latest official TypeScript SDK 13.1.11 signs the canonical root path and
  // encodeURI(consumerKey); old guide examples still show the retired /api/v1 prefix.
  const get = path => {
    const query = new URLSearchParams({clientId, timestamp: String(Math.floor(context.now() / 1000))}).toString();
    const signature = createHmac('sha256', encodeURI(consumerKey)).update(JSON.stringify({content: null, path, query})).digest('base64');
    return requestJson(`${SNAPTRADE_BASE}${path}?${query}`, {Signature: signature}, context);
  };
  const response = await get('/accounts/all');
  const rows = array(response?.results);
  if (!rows.length) fail('finance_provider_no_accounts', 'SnapTrade 尚未返回已连接账户，请先在其个人控制台连接机构。', 409);
  // Account and position endpoints intentionally retain cached data after a
  // connection is disabled. Check the authenticated connection list before
  // treating any of those cached values as a successfully connected snapshot.
  // Deleted connections are absent from /authorizations; do not accept orphaned
  // accounts from the daily /accounts/all cache.
  const connections = array(await get('/authorizations'));
  for (const connection of connections) {
    if (!object(connection)) incomplete();
    identifier(connection.id, secrets);
    if (typeof connection.disabled !== 'boolean') incomplete();
  }
  unique(connections, 'id');
  const connectionsById = new Map(connections.map(connection => [connection.id, connection]));
  for (const row of rows) {
    if (!object(row)) incomplete();
    const connection = connectionsById.get(identifier(row.connection_id, secrets));
    if (!connection) fail('finance_provider_connection_unavailable', 'SnapTrade 账户的机构连接已移除或无法确认，请在 SnapTrade 中重新连接。', 409);
    if (connection.disabled) fail('finance_provider_connection_disabled', 'SnapTrade 的机构授权已失效；缓存余额未导入，请先在 SnapTrade 中重新授权。', 409);
  }
  const accounts = [], positions = [];
  for (const row of rows) {
    if (!object(row)) incomplete();
    if (!['investment', 'deposit', 'line_of_credit', 'annuity'].includes(row.kind)) incomplete();
    if (row.kind === 'investment' && row.is_paper !== false) fail('finance_provider_environment', '此连接仅支持可确认的实盘账户，模拟账户不能导入真实资产。', 409);
    const accountRef = identifier(row.id, secrets);
    const net = preciseDecimal(row.net_value?.amount);
    const liability = row.kind === 'line_of_credit';
    if (liability && net !== '0' && !net.startsWith('-')) fail('finance_provider_incomplete', '授信账户返回了正净值，无法直接作为欠款导入。');
    const asOf = isoDate(row.sync_status?.balances);
    const name = requiredText(row.display_name || 'SnapTrade 账户', secrets);
    const suffix = row.masked_account_number ? requiredText(row.masked_account_number, secrets, 100).slice(-4) : undefined;
    accounts.push({accountRef, name, kind: liability ? 'liability' : 'asset', ...(liability ? {liabilityType: 'other'} : {assetType: row.kind === 'deposit' ? 'cash' : row.kind === 'annuity' ? 'insurance' : 'investment'}), amount: liability ? net.replace(/^-/, '') : net, currency: currency(row.net_value?.currency), asOf, ...(suffix ? {accountSuffix: suffix} : {}), sourceName: 'SnapTrade Personal（每日账户快照）'});
    if (row.kind !== 'investment') continue;
    const holdings = await get(`/accounts/${encodeURIComponent(accountRef)}/positions/all`);
    const positionAsOf = isoDate(holdings?.data_freshness?.as_of);
    for (const position of array(holdings?.results)) {
      if (!object(position)) incomplete();
      const instrument = position.instrument;
      const id = identifier(instrument?.id, secrets);
      const symbol = requiredText(instrument?.symbol, secrets, 100);
      const quantity = preciseDecimal(position.units);
      const marketPrice = optionalDecimal(position.price);
      const kind = {stock: 'stock', adr: 'stock', etf: 'etf', mutualfund: 'fund', cef: 'fund', bond: 'bond', option: 'option', future_option: 'option', future: 'futures', crypto: 'crypto'}[instrument.kind] || 'other';
      let marketValue = null;
      if (marketPrice !== null && ['stock', 'adr', 'etf', 'mutualfund', 'cef', 'crypto'].includes(instrument.kind)) marketValue = product(quantity, marketPrice);
      if (marketPrice !== null && instrument.kind === 'option' && instrument.multiplier != null) marketValue = product(quantity, marketPrice, preciseDecimal(instrument.multiplier));
      // Futures, bonds, CFDs and unknown instruments can have price units or
      // settlement rules that make quantity * price an invalid asset value.
      positions.push({positionRef: `${accountRef}:${id}`, accountRef, name: requiredText(instrument.description || symbol, secrets), symbol, kind, currency: currency(position.currency || instrument.currency), quantity, costPrice: optionalDecimal(position.cost_basis), marketPrice, marketValue, asOf: positionAsOf, ...(instrument.exchange ? {exchange: requiredText(instrument.exchange, secrets, 60)} : {})});
    }
  }
  unique(accounts, 'accountRef'); unique(positions, 'positionRef');
  return {accounts, positions};
}

/** Only provider GET reads are exposed; this module never connects or trades. */
export async function readBrokerSnapshot(providerId, config, {fetchImpl = fetch, now = () => Date.now()} = {}) {
  const context = {fetchImpl, now};
  const readers = {ibkr_flex: readIbkr, snaptrade: readSnapTrade};
  const read = Object.hasOwn(readers, providerId) ? readers[providerId] : null;
  if (!read) fail('finance_provider_unsupported', '不支持此券商数据来源。', 400);
  const data = await read(config, context);
  return {provider: providerId, readOnly: true, fetchedAt: new Date(now()).toISOString(), environment: 'production', complete: true, ...data, transactions: [], transactionMode: 'none'};
}
