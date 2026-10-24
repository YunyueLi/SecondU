import assert from 'node:assert/strict';
import test from 'node:test';
import { accountBrand, accountAmount, displayAccounts, money, summaryFor } from '../src/finance/model.ts';

const account = { id: 'usd', name: 'Example account', kind: 'asset', currency: 'USD', amount: '100.00', asOf: '2026-10-24' };
const rates = [{ currency: 'CNY', rate: '1', baseCurrency: 'CNY' }, { currency: 'USD', rate: '7', baseCurrency: 'CNY' }, { currency: 'HKD', rate: '0.9', baseCurrency: 'CNY' }];
const fixture = () => ({
  accounts: [{ ...account }], liabilities: [],
  valuation: { currency: 'CNY', baseCurrency: 'CNY', rates, convertedAccounts: [{ accountId: 'usd', kind: 'asset', originalAmount: '100.00', amount: '700.00' }] },
  portfolio: { baseCurrency: 'CNY', rates, accounts: [{ accountId: 'usd', estimatedAmount: '110.00' }], convertedAccounts: [{ accountId: 'usd', kind: 'asset', originalAmount: '110.00', amount: '770.00' }] },
});

test('summary and account shares use the projected balance after a price update', () => {
  const state = fixture();
  assert.equal(displayAccounts(state)[0].amount, '110.00');
  assert.equal(summaryFor(state, 'CNY').assets, '770.00');
  assert.equal(accountAmount(state, displayAccounts(state)[0], 'CNY'), '770.00');
  assert.equal(summaryFor(state, 'USD').assets, '110.00');
});

test('changing display currency retains the CNY basis of each exchange rate', () => {
  const state = fixture();
  state.portfolio.baseCurrency = 'USD';
  state.portfolio.convertedAccounts[0].amount = '110.00';
  state.valuation.currency = 'USD'; state.valuation.baseCurrency = 'USD';
  assert.equal(accountAmount(state, displayAccounts(state)[0], 'HKD'), '855.56');
  assert.equal(accountAmount(state, { ...account, id: 'cny', currency: 'CNY', amount: '700.00' }, 'HKD'), '777.78');
});

test('unavailable or invalid amounts and exchange rates never become a complete zero total', () => {
  const state = fixture();
  delete state.portfolio;
  state.valuation.convertedAccounts = [];
  state.valuation.rates = [];
  assert.equal(summaryFor(state, 'CNY').assets, null);
  assert.equal(summaryFor(state, 'CNY').complete, false);
  state.accounts[0].amount = '';
  assert.equal(summaryFor(state, 'USD').assets, null);
  assert.equal(money(null), '—');
  assert.equal(money('invalid'), '—');
  assert.equal(money('0'), '0.00');
});

test('currency conversion and formatting retain exact cents above Number precision', () => {
  const state = fixture();
  state.portfolio.convertedAccounts = [];
  assert.equal(accountAmount(state, { ...account, amount: '90071992547409.91' }, 'CNY'), '630503947831869.37');
  assert.equal(money('90071992547409.91'), '90,071,992,547,409.91');
  assert.equal(money('1.995'), '2.00');
  assert.equal(money('-0.005'), '-0.01');
});

test('stale converted rows are recomputed from the amount being displayed', () => {
  const state = fixture();
  state.portfolio.accounts[0].estimatedAmount = '120.00';
  assert.equal(summaryFor(state, 'CNY').assets, '840.00');
});

test('balances awaiting reconciliation remain visible without claiming a complete current valuation', () => {
  const state = fixture();
  state.portfolio.accounts[0].estimatedAmount = '100.00';
  state.portfolio.accounts[0].reconciliationRequired = true;
  state.accounts.push({ ...account, id: 'cny', currency: 'CNY', amount: '50.00' });
  const summary = summaryFor(state, 'CNY');
  assert.equal(summary.assets, '750.00');
  assert.equal(summary.net, '750.00');
  assert.equal(summary.conversionComplete, true);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.reconciliationRequiredAccounts.map(row => row.id), ['usd']);
  assert.equal(summaryFor(state, 'CNY', 'CNY').complete, true);
  assert.equal(summaryFor(state, 'CNY', 'CNY').reconciliationRequiredAccounts.length, 0);
});


test('institution identity controls account grouping independently of its data source', () => {
  const manual = { ...account, id: 'manual-cash', provider: 'manual', institution: { id: 'cmb', name: '招商银行' } };
  assert.equal(accountBrand(manual), 'cmb');
  assert.equal(accountBrand({ ...manual, id: 'manual-savings' }), 'cmb');
  assert.equal(accountBrand({ ...manual, provider: 'plaid', institution: { id: 'bank-a', name: 'Example Bank A' } }), 'bank-a');
  assert.equal(accountBrand({ ...manual, provider: 'plaid', institution: { id: 'bank-b', name: 'Example Bank B' } }), 'bank-b');
  assert.equal(accountBrand({ ...account, provider: 'manual', institution: 'dbs' }), 'dbs');
  assert.equal(accountBrand({ ...account, provider: 'moomoo' }), 'moomoo');
  assert.equal(accountBrand({ ...account, id: 'icbc-legacy', provider: 'manual' }), 'icbc');
  assert.equal(accountBrand({ ...account, provider: 'manual' }), account.id);
});
