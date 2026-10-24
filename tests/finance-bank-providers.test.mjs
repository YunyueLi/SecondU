import test from 'node:test';
import assert from 'node:assert/strict';
import {BANK_PROVIDER_DEFINITIONS, readBankSnapshot, startBankAuthorization, completeBankAuthorization, isBankAuthorized} from '../server/finance/providers/banks.mjs';

const now = () => Date.parse('2026-10-24T12:00:00Z');
const auth = (providerId, environment = 'sandbox', extra = {}) => ({providerId, environment, accessToken: 'test-access-token', ...extra});
const plaid = {environment: 'sandbox', clientId: 'test-client', secret: 'test-secret', countryCodes: 'US', products: 'transactions', authorization: auth('plaid')};
const teller = {environment: 'sandbox', applicationId: 'test-app', authorization: auth('teller')};
const truelayer = {environment: 'sandbox', clientId: 'test-client', clientSecret: 'test-secret', countries: 'GB', userName: 'Sample User', userEmail: 'sample@example.invalid', authorization: auth('truelayer', 'sandbox', {connectionId: 'connection-test'})};
const plaidAccount = (overrides = {}) => ({account_id: 'account-a', name: 'Sample Checking', type: 'depository', balances: {current: '123.45', iso_currency_code: 'USD'}, ...overrides});
const plaidTransaction = (overrides = {}) => ({transaction_id: 'tx-a', account_id: 'account-a', date: '2026-10-20', amount: '12.34', iso_currency_code: 'USD', pending: false, name: 'Sample Shop', ...overrides});
const tellerAccount = {id: 'account-a', name: 'Sample Bank', type: 'depository', currency: 'USD', status: 'open', last_four: '1234', links: {balances: 'https://api.teller.io/accounts/account-a/balances', transactions: 'https://api.teller.io/accounts/account-a/transactions'}};
const tlAccount = {id: 'account-a', type: 'account', account_type: 'current', currency: 'GBP', account_identifiers: [{type: 'sort_code_account_number', account_number: '00001234'}]};
function response(data, status = 200) {return {ok: status >= 200 && status < 300, status, text: async () => typeof data === 'string' ? data : JSON.stringify(data)};}
function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {const call = {url: new URL(url), ...init, data: init.body?.startsWith('{') ? JSON.parse(init.body) : init.body}; calls.push(call); return response(call.url.pathname === '/transactions/sync' ? {transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE'} : await handler(call, calls.length));};
  return {fetchImpl, calls};
}
function tlMock(handler) {
  return mockFetch(call => {
    if (call.url.pathname === '/connect/token') return {access_token: 'test-bearer', token_type: 'Bearer'};
    if (call.url.pathname === '/v3/connected-accounts') return {items: [tlAccount], pagination: {next_cursor: null}};
    if (call.url.pathname.endsWith('/balance')) return {currency: 'GBP', current_balance_in_minor: 12345, available_balance_in_minor: 999999};
    return handler(call);
  });
}

test('descriptors expose only supported read capabilities and no raw access-token field', () => {
  assert.deepEqual(BANK_PROVIDER_DEFINITIONS.map(row => row.id), ['plaid', 'teller', 'truelayer']);
  for (const row of BANK_PROVIDER_DEFINITIONS) {
    assert(!row.capabilities.some(value => /pay|trade|transfer/.test(value)));
    assert(!row.fields.some(field => /accessToken/.test(field.key)));
  }
  assert(!BANK_PROVIDER_DEFINITIONS.find(row => row.id === 'truelayer').capabilities.includes('liabilities'));
});

test('Plaid preserves decimal JSON values and excludes pending transactions', async () => {
  const mock = mockFetch(call => call.url.pathname === '/accounts/get'
    ? '{"accounts":[{"account_id":"account-a","name":"Sample Checking","type":"depository","balances":{"current":123456789012345.67,"iso_currency_code":"USD"}}]}'
    : {total_transactions: 3, transactions: [plaidTransaction(), plaidTransaction({transaction_id: 'tx-b', amount: '-9.01', personal_finance_category: {primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER'}}), plaidTransaction({transaction_id: 'tx-c', pending: true})]});
  const out = await readBankSnapshot('plaid', plaid, {...mock, now});
  assert.equal(out.accounts[0].amount, '123456789012345.67');
  assert.deepEqual(out.transactions.map(t => [t.kind, t.amount]), [['expense', '12.34'], ['transfer', '9.01']]);
  assert(out.transactions.every(t => t.currency === 'USD'));
  assert.equal(out.transactions[1].category, 'TRANSFER_IN_ACCOUNT_TRANSFER');
  assert.equal(out.environment, 'sandbox'); assert.equal(out.complete, true);
  for (const call of mock.calls) {assert.equal(call.redirect, 'error'); assert(call.signal instanceof AbortSignal); assert.equal(call.headers['PLAID-SECRET'], 'test-secret');}
});

test('Plaid completes pagination and rejects a changing or truncated result', async () => {
  const page = Array.from({length: 500}, (_, index) => plaidTransaction({transaction_id: 'tx-' + index}));
  const mock = mockFetch(call => call.url.pathname === '/accounts/get' ? {accounts: [plaidAccount()]} : {total_transactions: 501, transactions: call.data.options.offset === 0 ? page : [plaidTransaction({transaction_id: 'tx-final'})]});
  assert.equal((await readBankSnapshot('plaid', plaid, {...mock, now})).transactions.length, 501);
  assert.equal(mock.calls.at(-1).data.options.offset, 500);
  const truncated = mockFetch(call => call.url.pathname === '/accounts/get' ? {accounts: [plaidAccount()]} : {total_transactions: 1, transactions: []});
  await assert.rejects(readBankSnapshot('plaid', plaid, {...truncated, now}), {code: 'finance_invalid_provider_response'});
  const changing = mockFetch(call => call.url.pathname === '/accounts/get' ? {accounts: [plaidAccount()]} : {total_transactions: call.data.options.offset ? 502 : 501, transactions: call.data.options.offset ? [plaidTransaction({transaction_id: 'other'})] : page});
  await assert.rejects(readBankSnapshot('plaid', plaid, {...changing, now}), {code: 'finance_invalid_provider_response'});
});

test('Plaid investment values and liability balances are not double counted', async () => {
  const accounts = [plaidAccount({type: 'investment'}), plaidAccount({account_id: 'credit-a', type: 'credit', balances: {current: '60', available: '9940', iso_currency_code: 'USD'}})];
  const mock = mockFetch(call => {
    if (call.url.pathname === '/accounts/get') return {accounts};
    if (call.url.pathname === '/investments/holdings/get') return {accounts: [plaidAccount({type: 'investment', balances: {current: '124', iso_currency_code: 'USD'}})], securities: [{security_id: 'security-a', ticker_symbol: 'SAMPLE', name: 'Sample Fund', type: 'etf'}], holdings: [{account_id: 'account-a', security_id: 'security-a', quantity: '3', cost_basis: '100', institution_price: '40', institution_value: '120', iso_currency_code: 'USD'}]};
    if (call.url.pathname === '/liabilities/get') return {accounts, liabilities: {credit: [{account_id: 'credit-a', minimum_payment_amount: '10', next_payment_due_date: '2026-11-01'}], mortgage: null, student: []}};
    return {total_transactions: 0, transactions: []};
  });
  const out = await readBankSnapshot('plaid', {...plaid, products: 'transactions,investments,liabilities'}, {...mock, now});
  assert.equal(out.accounts.length, 2); assert.equal(out.accounts[1].amount, '60'); assert.equal(out.accounts[1].kind, 'liability');
  assert.equal(out.accounts[0].amount, '124');
  assert.equal(out.positions[0].costPrice, '33.333333333333333333'); assert.equal(out.positions[0].marketValue, '120');
  assert.equal(out.accounts[1].liabilityDetails.minimumPaymentAmount, '10');
});

test('Plaid rejects unavailable ledger balances, missing positions and foreign account transactions', async () => {
  const missingBalance = mockFetch(() => ({accounts: [plaidAccount({type: 'credit', balances: {current: null, available: '1000', iso_currency_code: 'USD'}})]}));
  await assert.rejects(readBankSnapshot('plaid', plaid, {...missingBalance, now}), {code: 'finance_provider_balance_unavailable'});
  const missingPositions = mockFetch(call => call.url.pathname === '/accounts/get' ? {accounts: [plaidAccount()]} : {securities: []});
  await assert.rejects(readBankSnapshot('plaid', {...plaid, products: 'investments'}, {...missingPositions, now}), {code: 'finance_invalid_provider_response'});
  const foreign = mockFetch(call => call.url.pathname === '/accounts/get' ? {accounts: [plaidAccount()]} : {total_transactions: 1, transactions: [plaidTransaction({account_id: 'unrelated'})]});
  await assert.rejects(readBankSnapshot('plaid', plaid, {...foreign, now}), {code: 'finance_invalid_provider_response'});
});

const plaidSession = (sessions = [{link_session_id: 'session-a', started_at: '2026-10-24T12:00:00Z', finished_at: '2026-10-24T12:01:00Z', results: {item_add_results: [{public_token: 'public-official', accounts: [{id: 'account-a'}], institution: {institution_id: 'ins-test'}}]}}]) => ({link_token: 'link-test-token', metadata: {initial_products: ['transactions'], country_codes: ['US'], client_name: 'SecondU'}, link_sessions: sessions});
test('Plaid Hosted Link verifies its own session and keeps long-lived credentials private', async () => {
  const mock = mockFetch(call => call.url.pathname === '/link/token/create' ? {link_token: 'link-test-token', hosted_link_url: 'https://secure.plaid.com/hl/test-link', expiration: '2026-10-24T13:00:00Z'} : call.url.pathname === '/link/token/get' ? plaidSession() : {access_token: 'test-long-lived', item_id: 'item-test'});
  const start = await startBankAuthorization('plaid', plaid, {...mock, now, nonce: 'nonce-test', origin: 'http://localhost:5173', redirectUri: 'http://localhost:5173/?financeOAuth=plaid'});
  assert.equal(start.public.kind, 'hosted_link'); assert.equal(start.public.authorizationUrl, 'https://secure.plaid.com/hl/test-link'); assert(!JSON.stringify(start.public).includes('test-secret')); assert(!Object.hasOwn(start.public, 'linkToken'));
  assert.deepEqual(mock.calls[0].data.hosted_link, {is_mobile_app: false, url_lifetime_seconds: 600});
  assert(!Object.hasOwn(mock.calls[0].data, 'redirect_uri')); assert(!Object.hasOwn(mock.calls[0].data, 'webhook'));
  assert.equal(mock.calls[0].data.user.client_user_id, 'nonce-test');
  const config = await completeBankAuthorization('plaid', plaid, {publicToken: 'attacker-supplied-token'}, {...mock, now, pending: start.private});
  assert.equal(mock.calls[1].url.pathname, '/link/token/get'); assert.equal(mock.calls[1].data.link_token, 'link-test-token');
  assert.equal(mock.calls[2].data.public_token, 'public-official');
  assert.equal(config.authorization.accessToken, 'test-long-lived'); assert(isBankAuthorized('plaid', config));
  assert(!isBankAuthorized('plaid', {...config, environment: 'production'}));
});

test('Plaid Hosted Link keeps pending distinct from aborted or multiple Items', async () => {
  const pending = {providerId: 'plaid', environment: 'sandbox', linkToken: 'link-test-token'};
  for (const sessions of [[], [{link_session_id: 's', started_at: '2026-10-24T12:00:00Z', finished_at: null}]]) {
    const mock = mockFetch(() => plaidSession(sessions));
    await assert.rejects(completeBankAuthorization('plaid', plaid, {}, {...mock, now, pending}), {code: 'finance_provider_authorization_pending'});
    assert.equal(mock.calls.length, 1);
  }
  const aborted = mockFetch(() => plaidSession([{link_session_id: 's', started_at: '2026-10-24T12:00:00Z', finished_at: '2026-10-24T12:01:00Z', results: {item_add_results: []}}]));
  await assert.rejects(completeBankAuthorization('plaid', plaid, {}, {...aborted, now, pending}), {code: 'finance_provider_authorization_incomplete'});
  const multiple = plaidSession(); multiple.link_sessions[0].results.item_add_results.push({...multiple.link_sessions[0].results.item_add_results[0], public_token: 'second-token'});
  await assert.rejects(completeBankAuthorization('plaid', plaid, {}, {...mockFetch(() => multiple), now, pending}), {code: 'finance_provider_multiple_items'});
  const malformed = plaidSession(); malformed.metadata.initial_products = [];
  await assert.rejects(completeBankAuthorization('plaid', plaid, {}, {...mockFetch(() => malformed), now, pending}), {code: 'finance_invalid_provider_response'});
});

test('Teller requires mTLS for real accounts and verifies TLS in its transport', async () => {
  await assert.rejects(startBankAuthorization('teller', {...teller, environment: 'development'}, {now}), {code: 'finance_teller_certificate_required'});
  const config = {...teller, environment: 'development', authorization: auth('teller', 'development'), certificatePem: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----', privateKeyPem: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----'};
  const calls = [], requestImpl = async (url, options) => {
    calls.push({url, options}); const path = new URL(url).pathname;
    return {statusCode: 200, body: JSON.stringify(path === '/accounts' ? [tellerAccount] : path.endsWith('/balances') ? {account_id: 'account-a', ledger: '123.45', available: '122'} : [{id: 'tx-a', account_id: 'account-a', amount: '-20', date: '2026-10-20', description: 'Sample deposit', type: 'transfer', status: 'posted', details: {category: 'general'}}])};
  };
  const out = await readBankSnapshot('teller', config, {now, requestImpl});
  assert.equal(out.transactions[0].kind, 'transfer'); assert.equal(out.accounts[0].amount, '123.45'); assert.equal(out.environment, 'development');
  assert.equal(out.transactions[0].currency, 'USD');
  for (const call of calls) {assert.equal(call.options.rejectUnauthorized, true); assert.equal(call.options.cert, config.certificatePem); assert.equal(call.options.key, config.privateKeyPem); assert.equal(call.options.headers.Authorization, 'Basic ' + Buffer.from('test-access-token:').toString('base64'));}
});

test('Teller paginates posted transactions, ignores external links and excludes pending', async () => {
  let pageCount = 0;
  const requestImpl = async (url) => {
    const target = new URL(url); assert.equal(target.origin, 'https://api.teller.io');
    if (target.pathname === '/accounts') return {statusCode: 200, body: JSON.stringify([{...tellerAccount, links: {balances: 'https://evil.invalid', transactions: 'https://evil.invalid'}}])};
    if (target.pathname.endsWith('/balances')) return {statusCode: 200, body: '{"account_id":"account-a","ledger":"123.45"}'};
    pageCount++; const row = index => ({id: 'tx-' + index, account_id: 'account-a', date: '2026-10-20', amount: '0.01', status: index === 0 ? 'pending' : 'posted', type: 'card_payment', description: 'Sample'});
    if (pageCount === 2) assert.equal(target.searchParams.get('from_id'), 'tx-499');
    return {statusCode: 200, body: JSON.stringify(pageCount === 1 ? Array.from({length: 500}, (_, i) => row(i)) : [row(500)])};
  };
  const out = await readBankSnapshot('teller', teller, {now, requestImpl}); assert.equal(out.transactions.length, 500); assert.equal(pageCount, 2);
});

test('Teller rejects missing ledger and redirect/error responses without leaking tokens', async () => {
  const requestImpl = async url => ({statusCode: 200, body: JSON.stringify(new URL(url).pathname === '/accounts' ? [tellerAccount] : {account_id: 'account-a', ledger: null, available: '9000'})});
  await assert.rejects(readBankSnapshot('teller', teller, {now, requestImpl}), {code: 'finance_provider_balance_unavailable'});
  await assert.rejects(readBankSnapshot('teller', teller, {now, requestImpl: async () => ({statusCode: 302, body: 'secret-test-access-token'})}), error => error.code === 'finance_provider_request_failed' && !error.message.includes('secret-test-access-token'));
});

test('TrueLayer handles asynchronous request pagination and signed minor units', async () => {
  let requests = 0, polls = 0;
  const mock = tlMock(call => {
    if (call.method === 'POST') {requests++; if (requests === 2) assert.equal(call.data.cursor, 'cursor-next'); return {id: 'request-' + requests, status: 'pending'};}
    polls++; if (polls === 1) return {id: 'request-1', status: 'pending'};
    return {id: 'request-' + requests, status: 'completed', result: {items: [{id: 'tx-' + requests, timestamp: '2026-10-20T10:00:00Z', description: 'Sample', currency: 'GBP', amount_in_minor: requests === 1 ? -123 : 456, status: 'settled'}, ...(requests === 1 ? [{id: 'pending', status: 'pending'}] : [])], pagination: {next_cursor: requests === 1 ? 'cursor-next' : null}}};
  });
  const out = await readBankSnapshot('truelayer', truelayer, {...mock, now, sleepImpl: async () => {}});
  assert.equal(out.accounts[0].amount, '123.45'); assert.equal(out.accounts[0].accountSuffix, '1234');
  assert.deepEqual(out.transactions.map(t => [t.kind, t.amount]), [['expense', '1.23'], ['income', '4.56']]);
  assert(out.transactions.every(t => t.currency === 'GBP'));
  assert.equal(requests, 2); assert.equal(polls, 3);
  for (const call of mock.calls.filter(c => c.url.pathname.startsWith('/v3/'))) assert.equal(call.headers['Connection-Id'], 'connection-test');
  assert.equal(new URLSearchParams(mock.calls[0].data).get('scope'), 'data');
});

test('TrueLayer rejects incomplete account pagination and unsupported future card schema', async () => {
  for (const items of [Array.from({length: 50}, (_, i) => ({...tlAccount, id: 'a-' + i})), [{id: 'card-a', type: 'card'}]]) {
    const mock = mockFetch(call => call.url.pathname === '/connect/token' ? {access_token: 'token', token_type: 'Bearer'} : {items, pagination: {next_cursor: null}});
    await assert.rejects(readBankSnapshot('truelayer', truelayer, {...mock, now}), error => ['finance_provider_incomplete_pagination', 'finance_provider_account_unsupported'].includes(error.code));
  }
});

test('TrueLayer incomplete transaction status never yields an empty complete snapshot', async () => {
  const mock = tlMock(call => call.method === 'POST' ? {id: 'request-a', status: 'pending'} : {id: 'request-a', status: 'failed', failure_reason: {detail: 'private provider error'}});
  await assert.rejects(readBankSnapshot('truelayer', truelayer, {...mock, now}), error => error.code === 'finance_provider_transactions_failed' && !error.message.includes('private provider error'));
  const pending = tlMock(() => ({id: 'request-a', status: 'pending'}));
  await assert.rejects(readBankSnapshot('truelayer', truelayer, {...pending, now, sleepImpl: async () => {}}), {code: 'finance_provider_transactions_pending'});
});

test('TrueLayer hosted consent uses registered return URI and verifies the saved connection', async () => {
  const mock = mockFetch(call => {
    if (call.url.pathname === '/connect/token') return {access_token: 'token', token_type: 'Bearer'};
    if (call.url.pathname === '/v3/data-connections') return {id: 'connection-created', status: 'authorization_required', hosted_page: {uri: 'https://app.truelayer-sandbox.com/data/connection-created'}};
    assert.equal(call.headers['Connection-Id'], 'connection-created'); return {items: [tlAccount], pagination: {next_cursor: null}};
  });
  const start = await startBankAuthorization('truelayer', truelayer, {...mock, now, origin: 'http://localhost:5173', redirectUri: 'http://localhost:5173/callback?state=nonce'});
  const payload = mock.calls[1].data;
  assert.deepEqual(payload.scopes, ['accounts', 'balance', 'transactions']); assert.equal(payload.hosted_page.return_uri, 'http://localhost:5173/callback?state=nonce');
  assert.equal(payload.user_consent.type, 'authorization_flow_captured'); assert.equal(start.public.kind, 'redirect');
  await assert.rejects(completeBankAuthorization('truelayer', truelayer, {connection_id: 'attacker-connection'}, {...mock, now, pending: start.private}), {code: 'finance_callback_invalid'});
  const updated = await completeBankAuthorization('truelayer', truelayer, {}, {...mock, now, pending: start.private}); assert(isBankAuthorized('truelayer', updated)); assert.equal(updated.authorization.connectionId, 'connection-created');
});

test('authorization rejects foreign redirects, malformed results and provider errors safely', async () => {
  const mock = mockFetch(call => call.url.pathname === '/connect/token' ? {access_token: 'token', token_type: 'Bearer'} : {id: 'c', status: 'authorization_required', hosted_page: {uri: 'https://app.truelayer.com.evil.invalid/data/c'}});
  await assert.rejects(startBankAuthorization('truelayer', truelayer, {...mock, now, origin: 'http://localhost:5173', redirectUri: 'http://localhost:5173/callback'}), {code: 'finance_invalid_provider_response'});
  await assert.rejects(startBankAuthorization('truelayer', truelayer, {...mock, now, origin: 'http://localhost:5173', redirectUri: 'https://evil.invalid/callback'}), {code: 'finance_callback_invalid'});
  await assert.rejects(startBankAuthorization('plaid', plaid, {...mockFetch(() => ({link_token: 'token', hosted_link_url: 'https://evil.invalid/hl/test'})), now}), {code: 'finance_invalid_provider_response'});
  await assert.rejects(readBankSnapshot('plaid', plaid, {now, fetchImpl: async () => response('secret-access-token', 401)}), error => error.code === 'finance_provider_unauthorized' && !error.message.includes('secret-access-token'));
});

test('stream responses stop at the size limit and return typed permission/rate errors', async () => {
  let cancelled = false, chunks = 0;
  const body = new ReadableStream({pull(controller) {chunks++; controller.enqueue(new Uint8Array(1024 * 1024));}, cancel() {cancelled = true;}});
  await assert.rejects(readBankSnapshot('plaid', plaid, {now, fetchImpl: async () => new Response(body)}), {code: 'finance_invalid_provider_response'});
  assert(cancelled); assert(chunks <= 10);
  for (const [status, code] of [[403, 'finance_provider_forbidden'], [429, 'finance_provider_rate_limited']]) await assert.rejects(readBankSnapshot('plaid', plaid, {now, fetchImpl: async () => response('private error', status)}), {code});
});

test('Plaid waits for complete historical data instead of replacing a partial 90-day range', async () => {
  for (const status of ['NOT_READY', 'INITIAL_UPDATE_COMPLETE', 'TRANSACTIONS_UPDATE_STATUS_UNKNOWN']) {
    const calls = [], fetchImpl = async (url) => {const path = new URL(url).pathname; calls.push(path); return response(path === '/accounts/get' ? {accounts: [plaidAccount()]} : {transactions_update_status: status});};
    await assert.rejects(readBankSnapshot('plaid', plaid, {fetchImpl, now}), {code: 'finance_provider_transactions_pending'});
    assert.deepEqual(calls, ['/accounts/get', '/transactions/sync']);
  }
});

test('source currencies and nonzero margin are never silently converted or treated as net assets', async () => {
  const foreign = mockFetch(call => call.url.pathname === '/accounts/get' ? {accounts: [plaidAccount()]} : {total_transactions: 1, transactions: [plaidTransaction({iso_currency_code: 'GBP'})]});
  await assert.rejects(readBankSnapshot('plaid', plaid, {...foreign, now}), {code: 'finance_invalid_provider_response'});
  const margin = mockFetch(() => ({accounts: [plaidAccount({type: 'investment', balances: {current: '10000', margin_loan_amount: '5000', iso_currency_code: 'USD'}})]}));
  await assert.rejects(readBankSnapshot('plaid', {...plaid, products: 'investments'}, {...margin, now}), {code: 'finance_provider_margin_unsupported'});
});
