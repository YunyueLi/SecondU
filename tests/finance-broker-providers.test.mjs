import test from 'node:test';
import assert from 'node:assert/strict';
import {BROKER_PROVIDER_DEFINITIONS, readBrokerSnapshot} from '../server/finance/providers/brokers.mjs';

const NOW = 1792798200000;
const AS_OF = '2026-10-23T20:00:00.000Z';
const snapConfig = {clientId: 'demo+client', consumerKey: 'demo-consumer-key'};
let serial = 0;
const ibkrConfig = () => ({token: `fictional-ibkr-token-${++serial}`, queryId: '567890'});
const json = value => new Response(typeof value === 'string' ? value : JSON.stringify(value), {headers: {'content-type': 'application/json'}});
const xml = value => new Response(value, {headers: {'content-type': 'text/plain;charset=UTF-8'}});
const accepted = '<FlexStatementResponse><Status>Success</Status><ReferenceCode>987654321</ReferenceCode><url>https://untrusted.invalid/ignore-this-url</url></FlexStatementResponse>';
const failed = (code, message = 'Upstream message must not be displayed') => `<FlexStatementResponse><Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>${message}</ErrorMessage></FlexStatementResponse>`;
const positionXml = '<OpenPosition accountId="UDEMO0001" conid="1234" symbol="DEMO" description="Fictional Company" assetCategory="STK" currency="USD" reportDate="20261023" position="0.123456789012345678" markPrice="100" costBasisPrice="80.50" positionValue="12.3456789012345678" levelOfDetail="SUMMARY" listingExchange="NASDAQ"/>';
const statementXml = (holdings = positionXml) => `<FlexStatement accountId="UDEMO0001" fromDate="20261001" toDate="20261023"><AccountInformation accountId="UDEMO0001" acctAlias="Fictional IBKR" currency="USD"/><EquitySummaryInBase><EquitySummaryByReportDateInBase accountId="UDEMO0001" currency="USD" reportDate="20261022" total="100"/><EquitySummaryByReportDateInBase accountId="UDEMO0001" currency="USD" reportDate="20261023" total="12345678901234.5600"/></EquitySummaryInBase><OpenPositions>${holdings}</OpenPositions></FlexStatement>`;
const reportXml = (statement = statementXml()) => `<FlexQueryResponse type="AF"><FlexStatements count="1">${statement}</FlexStatements></FlexQueryResponse>`;
const snapAccount = overrides => ({kind: 'investment', id: 'account-demo-1', connection_id: 'connection-demo', display_name: 'Fictional investment', masked_account_number: '****4321', is_paper: false, net_value: {amount: '1500.15', currency: 'USD'}, sync_status: {balances: AS_OF, positions: AS_OF}, ...overrides});
const snapPosition = overrides => ({instrument: {kind: 'stock', id: 'instrument-demo-1', symbol: 'DEMO', description: 'Fictional Company', currency: 'USD', exchange: 'XNAS'}, units: '0.1234567890123456', price: '10', cost_basis: '8.100', currency: 'USD', ...overrides});
const holdings = positions => ({results: positions, data_freshness: {as_of: AS_OF}});

function network(responses, connections = [{id: 'connection-demo', disabled: false, type: 'read'}]) {
  const calls = [];
  return {calls, fetchImpl: async (url, options) => {
    calls.push({url: new URL(url), options});
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, undefined);
    if (new URL(url).pathname === '/authorizations') return json(connections);
    const response = responses.shift();
    assert.ok(response, 'unexpected provider request');
    if (response instanceof Error) throw response;
    return response;
  }};
}

function expectedError(code, config = {}) {
  return error => {
    assert.equal(error.code, code);
    assert.ok(Number.isInteger(error.status));
    for (const secret of Object.values(config)) {
      assert.ok(!error.message.includes(secret));
      assert.ok(!error.message.includes(encodeURIComponent(secret)));
      assert.ok(!error.stack.includes(secret));
    }
    return true;
  };
}

test('descriptors expose only implemented read capabilities and Personal credentials', () => {
  assert.deepEqual(BROKER_PROVIDER_DEFINITIONS.map(row => row.id), ['ibkr_flex', 'snaptrade']);
  for (const definition of BROKER_PROVIDER_DEFINITIONS) {
    assert.deepEqual(definition.capabilities, ['accounts', 'balances', 'positions']);
    assert.ok(definition.docsUrl.startsWith('https://'));
    assert.ok(definition.setupUrl.startsWith('https://'));
    assert.ok(definition.fields.every(field => field.required));
  }
  assert.deepEqual(BROKER_PROVIDER_DEFINITIONS[1].fields.map(field => field.key), ['clientId', 'consumerKey']);
});

test('IBKR retrieves a report from the official fixed endpoints and preserves decimal attributes', async () => {
  const config = ibkrConfig();
  const mock = network([xml(accepted), xml(reportXml())]);
  const result = await readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW});
  assert.equal(result.readOnly, true);
  assert.equal(result.complete, true);
  assert.equal(result.environment, 'production');
  assert.equal(result.fetchedAt, new Date(NOW).toISOString());
  assert.equal(result.transactionMode, 'none');
  assert.deepEqual(result.transactions, []);
  assert.deepEqual(result.accounts, [{accountRef: 'UDEMO0001', name: 'Fictional IBKR', kind: 'asset', assetType: 'investment', amount: '12345678901234.56', currency: 'USD', asOf: '2026-10-23T00:00:00.000Z', accountSuffix: '0001', institution: 'Interactive Brokers', sourceName: 'IBKR Flex Activity Statement'}]);
  assert.equal(result.positions[0].quantity, '0.123456789012345678');
  assert.equal(result.positions[0].costPrice, '80.5');
  assert.equal(result.positions[0].marketValue, '12.3456789012345678');
  assert.equal(result.positions[0].accountRef, result.accounts[0].accountRef);
  assert.equal(result.positions[0].positionRef, 'UDEMO0001:1234');
  assert.equal(mock.calls.length, 2);
  assert.ok(mock.calls.every(call => call.url.origin === 'https://ndcdyn.interactivebrokers.com'));
  assert.equal(mock.calls[0].url.pathname, '/AccountManagement/FlexWebService/SendRequest');
  assert.equal(mock.calls[1].url.pathname, '/AccountManagement/FlexWebService/GetStatement');
  assert.equal(mock.calls[0].url.searchParams.get('q'), config.queryId);
  assert.equal(mock.calls[1].url.searchParams.get('q'), '987654321');
  assert.equal(mock.calls[1].url.searchParams.get('t'), config.token);
  assert.ok(!JSON.stringify(result).includes(config.token));
});

test('IBKR pending reports return a bounded retry error and reuse the reference on the next explicit read', async () => {
  const config = ibkrConfig();
  const mock = network([xml(accepted), xml(failed('1019', config.token)), xml(reportXml(statementXml('')))]);
  await assert.rejects(readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW}), expectedError('finance_provider_pending', config));
  assert.equal(mock.calls.length, 2);
  const result = await readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW + 5000});
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls[2].url.pathname.endsWith('/GetStatement'));
  assert.deepEqual(result.positions, []);
  assert.equal(result.accounts[0].amount, '12345678901234.56');
});

test('concurrent IBKR reads share one report request within the provider pacing limit', async () => {
  const config = ibkrConfig();
  const mock = network([xml(accepted), xml(reportXml())]);
  const [first, second] = await Promise.all([readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW}), readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW})]);
  assert.deepEqual(first, second);
  assert.equal(mock.calls.length, 2);
});

test('IBKR partial, duplicate, incompatible and inconsistent reports never produce a snapshot', async () => {
  const reports = [
    reportXml().replace('total="12345678901234.5600"', 'total=""'),
    reportXml().replace(/<OpenPositions>.*<\/OpenPositions>/, ''),
    reportXml().replace('count="1"', 'count="2"'),
    reportXml().replace('levelOfDetail="SUMMARY"', 'levelOfDetail="LOT"'),
    reportXml().replace('position="0.123456789012345678"', 'position="unknown"'),
    reportXml().replace('currency="USD" reportDate="20261023" total=', 'currency="" reportDate="20261023" total='),
    reportXml(statementXml(positionXml + positionXml)),
    reportXml().replace('type="AF"', 'type="TC"'),
    reportXml().replace('reportDate="20261023" position=', 'reportDate="20261022" position='),
  ];
  for (const report of reports) {
    const config = ibkrConfig();
    const mock = network([xml(accepted), xml(report)]);
    await assert.rejects(readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW}), expectedError('finance_provider_incomplete', config));
  }
});

test('IBKR validates XML, refuses DTDs and suppresses upstream failure text', async () => {
  for (const body of ['<FlexStatementResponse>', '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///private/example">]><FlexQueryResponse>&x;</FlexQueryResponse>']) {
    const config = ibkrConfig();
    const mock = network([xml(body)]);
    await assert.rejects(readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW}), expectedError('finance_provider_invalid_response', config));
  }
  for (const [code, expected] of [['1012', 'finance_provider_auth'], ['1018', 'finance_provider_rate_limited'], ['1014', 'finance_provider_config'], ['1020', 'finance_provider_unavailable']]) {
    const config = ibkrConfig();
    const mock = network([xml(failed(code, `sensitive-${config.token}`))]);
    await assert.rejects(readBrokerSnapshot('ibkr_flex', config, {...mock, now: () => NOW}), expectedError(expected, config));
  }
});

test('SnapTrade uses Personal signatures for the latest endpoints and preserves raw numeric precision', async () => {
  const raw = JSON.stringify({results: [snapAccount()]}).replace('"1500.15"', '90071992547409.91');
  const mock = network([json(raw), json(holdings([snapPosition()]))]);
  const result = await readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW});
  assert.equal(result.accounts[0].amount, '90071992547409.91');
  assert.equal(result.accounts[0].asOf, AS_OF);
  assert.equal(result.positions[0].quantity, '0.1234567890123456');
  assert.equal(result.positions[0].marketValue, '1.234567890123456');
  assert.equal(result.positions[0].costPrice, '8.1');
  assert.equal(result.positions[0].exchange, 'XNAS');
  assert.equal(result.transactionMode, 'none');
  assert.deepEqual(mock.calls.map(call => call.url.pathname), ['/accounts/all', '/authorizations', '/accounts/account-demo-1/positions/all']);
  assert.ok(mock.calls.every(call => call.url.origin === 'https://api.snaptrade.com'));
  assert.equal(mock.calls[0].options.headers.Signature, 'JTClhhj6XYrnjF/wHw5+ti3JviACJDAllvLoCF8OGFU=');
  for (const {url} of mock.calls) {
    assert.equal(url.searchParams.get('clientId'), snapConfig.clientId);
    assert.equal(url.searchParams.has('userId'), false);
    assert.equal(url.searchParams.has('userSecret'), false);
    assert.equal(url.searchParams.has('consumerKey'), false);
  }
  assert.ok(!JSON.stringify(result).includes(snapConfig.consumerKey));
});

test('SnapTrade uses reported net values without adding cash-equivalent holdings, and handles option multipliers', async () => {
  const positions = [
    snapPosition({instrument: {kind: 'mutualfund', id: 'cash-equivalent', symbol: 'CASHFUND'}, units: '1000', price: '1', cash_equivalent: true}),
    snapPosition({instrument: {kind: 'option', id: 'option-demo', symbol: 'DEMO OPTION', multiplier: '100'}, units: '-2', price: '0.125', cost_basis: null}),
    snapPosition({instrument: {kind: 'future', id: 'future-demo', symbol: 'DEMO FUTURE', multiplier: '50'}, units: '1', price: '5000'}),
    snapPosition({instrument: {kind: 'stock', id: 'unknown-price', symbol: 'UNKNOWN'}, price: null, cost_basis: null}),
  ];
  const mock = network([json({results: [snapAccount()]}), json(holdings(positions))]);
  const result = await readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW});
  assert.equal(result.accounts[0].amount, '1500.15');
  assert.deepEqual(result.positions.map(row => row.marketValue), ['1000', '-25', null, null]);
  assert.equal(result.positions[1].quantity, '-2');
  assert.equal(result.positions[1].costPrice, null);
  assert.equal(result.positions[3].marketPrice, null);
});

test('an explicit zero or scientific JSON amount is preserved without a null-to-zero fallback', async () => {
  for (const [rawAmount, expected] of [['0', '0'], ['1.2345e3', '1234.5'], ['1e-8', '0.00000001']]) {
    const raw = JSON.stringify({results: [snapAccount()]}).replace('"1500.15"', rawAmount);
    const mock = network([json(raw), json(holdings([]))]);
    const result = await readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW});
    assert.equal(result.accounts[0].amount, expected);
  }
});

test('SnapTrade deposit, debt and annuity values retain account types and never call a trading endpoint', async () => {
  const rows = [
    snapAccount({id: 'deposit-demo', kind: 'deposit', net_value: {amount: '123.45', currency: 'CAD'}}),
    snapAccount({id: 'credit-demo', kind: 'line_of_credit', net_value: {amount: '-842.17', currency: 'USD'}}),
    snapAccount({id: 'annuity-demo', kind: 'annuity', net_value: {amount: '7890.12', currency: 'USD'}}),
  ];
  const mock = network([json({results: rows})]);
  const result = await readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW});
  assert.deepEqual(result.accounts.map(row => [row.kind, row.assetType || row.liabilityType, row.amount, row.currency]), [['asset', 'cash', '123.45', 'CAD'], ['liability', 'other', '842.17', 'USD'], ['asset', 'insurance', '7890.12', 'USD']]);
  assert.deepEqual(result.positions, []);
  assert.equal(mock.calls.length, 2);
});

test('SnapTrade incomplete totals, freshness, quantities or response shapes fail atomically', async () => {
  const cases = [
    [snapAccount({net_value: null}), holdings([])],
    [snapAccount({net_value: {amount: null, currency: 'USD'}}), holdings([])],
    [snapAccount({sync_status: {balances: null}}), holdings([])],
    [snapAccount(), holdings([snapPosition({units: null})])],
    [snapAccount(), {results: [], data_freshness: {as_of: null}}],
    [snapAccount(), {results: null, data_freshness: {as_of: AS_OF}}],
    [snapAccount(), holdings([snapPosition(), snapPosition()])],
  ];
  for (const [account, positions] of cases) {
    const mock = network([json({results: [account]}), json(positions)]);
    await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError('finance_provider_incomplete', snapConfig));
  }
  const mock = network([json({results: [snapAccount(), snapAccount({id: 'second-incomplete', net_value: {amount: null, currency: 'CAD'}})]}), json(holdings([]))]);
  await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError('finance_provider_incomplete', snapConfig));
});

test('SnapTrade rejects simulated, unconnected and ambiguous positive debt accounts', async () => {
  for (const [results, code] of [[[], 'finance_provider_no_accounts'], [[snapAccount({is_paper: true})], 'finance_provider_environment'], [[snapAccount({kind: 'line_of_credit', net_value: {amount: '10', currency: 'USD'}})], 'finance_provider_incomplete']]) {
    const mock = network([json({results})]);
    await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError(code, snapConfig));
    assert.equal(mock.calls.length, results.length ? 2 : 1);
  }
});

test('SnapTrade rejects disabled, removed and unverifiable connection caches before reading positions', async () => {
  for (const [connections, code] of [
    [[{id: 'connection-demo', disabled: true}], 'finance_provider_connection_disabled'],
    [[], 'finance_provider_connection_unavailable'],
    [[{id: 'different-connection', disabled: false}], 'finance_provider_connection_unavailable'],
    [[{id: 'connection-demo'}], 'finance_provider_incomplete'],
    [[{id: 'connection-demo', disabled: false}, {id: 'connection-demo', disabled: false}], 'finance_provider_incomplete'],
  ]) {
    const mock = network([json({results: [snapAccount()]})], connections);
    await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError(code, snapConfig));
    assert.deepEqual(mock.calls.map(call => call.url.pathname), ['/accounts/all', '/authorizations']);
  }
  const mock = network([json({results: [snapAccount(), snapAccount({id: 'second-account', connection_id: 'disabled-connection'})]})], [{id: 'connection-demo', disabled: false}, {id: 'disabled-connection', disabled: true}]);
  await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError('finance_provider_connection_disabled', snapConfig));
  assert.equal(mock.calls.length, 2);
});

test('provider HTTP, malformed-response and network errors never disclose URLs, secrets or response text', async () => {
  for (const [status, code] of [[401, 'finance_provider_auth'], [403, 'finance_provider_auth'], [429, 'finance_provider_rate_limited'], [500, 'finance_provider_unavailable'], [302, 'finance_provider_unavailable']]) {
    const mock = network([new Response(`https://api.snaptrade.com/?consumerKey=${snapConfig.consumerKey}`, {status})]);
    await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError(code, snapConfig));
  }
  const malformed = network([json(`{broken-${snapConfig.consumerKey}`)]);
  await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...malformed, now: () => NOW}), expectedError('finance_provider_invalid_response', snapConfig));
  for (const [name, code] of [['Error', 'finance_provider_network'], ['TimeoutError', 'finance_provider_timeout']]) {
    const error = new Error(`failed URL with ${snapConfig.consumerKey}`); error.name = name;
    const mock = network([error]);
    await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...mock, now: () => NOW}), expectedError(code, snapConfig));
  }
});

test('response limits and credential echoes fail before returning displayable data', async () => {
  const tooLarge = network([new Response('small', {headers: {'content-length': String(9 * 1024 * 1024)}})]);
  await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...tooLarge, now: () => NOW}), expectedError('finance_provider_response_too_large', snapConfig));
  const echoed = network([json({results: [snapAccount({display_name: `Bad ${snapConfig.consumerKey}`})]})]);
  await assert.rejects(readBrokerSnapshot('snaptrade', snapConfig, {...echoed, now: () => NOW}), expectedError('finance_provider_unsafe_response', snapConfig));
});

test('unsupported providers and incomplete or Commercial configs fail before a network request', async () => {
  const fetchImpl = () => assert.fail('must not call provider');
  for (const id of ['unknown', '__proto__', 'constructor']) await assert.rejects(readBrokerSnapshot(id, {}, {fetchImpl}), expectedError('finance_provider_unsupported'));
  for (const config of [{}, {...snapConfig, userId: 'commercial-user'}, {clientId: 'one', consumerKey: ''}]) await assert.rejects(readBrokerSnapshot('snaptrade', config, {fetchImpl}), expectedError('finance_provider_config'));
});
