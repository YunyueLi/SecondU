import assert from 'node:assert/strict';
import test from 'node:test';
import { accountSummaryFor, positionQuantityUnit } from '../src/finance/account-summary.ts';

const account = (extra = {}) => ({ id: 'broker-one', kind: 'asset', name: 'Example account', amount: '100.00', currency: 'USD', asOf: '2026-01-01', ...extra });

test('native summaries retain zero cash and do not label available funds as buying power', () => {
  const state = { accounts: [account({ funds: { currency: 'USD', total_assets: '120.00', securities_assets: '120.00', cash: '0', available_funds: '25' } })] };
  assert.deepEqual(accountSummaryFor(state, 'broker-one'), [
    { label: '净资产', amount: '120.00', currency: 'USD' },
    { label: '证券资产', amount: '120.00', currency: 'USD' },
    { label: '现金', amount: '0', currency: 'USD' },
  ]);
});

test('current display details replace older snapshot components without filling missing fields from history', () => {
  const state = { accounts: [account({ valuationBasis: 'official_api' })],
    snapshot: { details: { broker: { total: '100', currency: 'USD', securities_market_value: '80', cash_total: '20' } } },
    displayData: { details: { broker: { total: '200', currency: 'CNH', fund_nav: '50', cash_total: '0', valuationBasis: 'official_api' } } },
  };
  assert.deepEqual(accountSummaryFor(state, 'broker-one'), [
    { label: '净资产', amount: '200', currency: 'CNH' },
    { label: '基金资产', amount: '50', currency: 'CNH' },
    { label: '现金', amount: '0', currency: 'CNH' },
  ]);
});

test('institution-level details are not attributed to multiple accounts', () => {
  const state = { accounts: [account(), account({ id: 'broker-two' })], snapshot: { details: { broker: { currency: 'USD', total: '200', cash_total: '50' } } } };
  assert.deepEqual(accountSummaryFor(state, 'broker-one'), [{ label: '账户总额', amount: '100.00', currency: 'USD' }]);
});

test('stale detail components and blank values are not presented as current or zero', () => {
  const state = { accounts: [account({ detailCurrent: false, funds: { currency: 'USD', total_assets: '250', cash: '25' } })] };
  assert.deepEqual(accountSummaryFor(state, 'broker-one'), [{ label: '账户总额', amount: '100.00', currency: 'USD' }]);
  state.accounts[0] = account({ funds: { currency: 'USD', total_assets: '', cash: null, buying_power: '0' } });
  assert.deepEqual(accountSummaryFor(state, 'broker-one'), [{ label: '账户总额', amount: '100.00', currency: 'USD' }, { label: '购买力', amount: '0', currency: 'USD' }]);
});

test('position quantities use product units and never use currency as their unit', () => {
  assert.equal(positionQuantityUnit({ kind: 'gold', currency: 'CNY' }), '克');
  assert.equal(positionQuantityUnit({ kind: 'stock', currency: 'USD' }), '股');
  assert.equal(positionQuantityUnit({ kind: 'etf' }), '份');
  assert.equal(positionQuantityUnit({ kind: 'fund' }), '份');
  assert.equal(positionQuantityUnit({ kind: 'other', unit: 'USD' }), '');
  assert.equal(positionQuantityUnit({ kind: 'other', quantityUnit: '盎司' }), '盎司');
});
