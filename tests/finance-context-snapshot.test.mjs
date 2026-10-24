import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceContextSnapshot } from '../src/finance/context-snapshot.mjs';

const state = {
  revision: 4, observedAt: '2026-10-24T01:00:00Z',
  accounts: [{ id: 'a', name: 'Example Bank', amount: '9007199254740993.12', currency: 'CNY', kind: 'asset', asOf: '2026-10-23', suffix: '1234', secret: 'private-key' }, { id: 'b', name: 'Other Bank', amount: '10.00', currency: 'USD', kind: 'asset' }],
  liabilities: [{ id: 'c', name: 'Loan', amount: '25.00', currency: 'CNY', kind: 'liability' }],
  positions: { items: [{ id: 'p', accountId: 'a', symbol: 'TEST', quantity: '2.5', recordedMarketValue: '12.50', currency: 'USD' }, { id: 'q', accountId: 'b', symbol: 'OTHER' }] },
  portfolio: { accounts: [{ accountId: 'a', estimatedAmount: '9007199254740994.12', status: 'stale' }], holdings: [{ id: 'p', accountId: 'a', symbol: 'TEST', currentMarketValue: '13.50', quoteAsOf: '2026-10-23', status: 'stale' }] },
  market: { quotes: [{ id: 'x', symbol: 'TEST', currency: 'USD', price: '5.40', status: 'stale', sourceName: 'Example', asOf: '2026-10-23' }, { id: 'y', symbol: 'OTHER', price: '10' }] },
  valuation: { rates: [{ currency: 'USD', rate: '7.00', baseCurrency: 'CNY', asOf: '2026-10-23' }] },
  key: 'secret-root', rawResponse: { token: 'secret-response' },
};

test('single-account context contains only that account, positions and matching quotes', () => {
  const result = createFinanceContextSnapshot(state, { section: 'accounts', accountIds: ['a'] });
  const snapshot = JSON.parse(result.content);
  assert.deepEqual(snapshot.accounts.map(row => row.id), ['a']);
  assert.deepEqual(snapshot.recordedPositions.map(row => row.id), ['p']);
  assert.deepEqual(snapshot.quotes.map(row => row.id), ['x']);
  assert.equal(snapshot.accounts[0].amount, '9007199254740993.12');
  assert.equal(snapshot.holdingValuations[0].status, 'stale');
  assert.equal(snapshot.holdingValuations[0].quoteAsOf, '2026-10-23');
});
test('snapshot whitelist excludes identifiers and private runtime material', () => {
  const { content } = createFinanceContextSnapshot(state);
  for (const value of ['1234', 'private-key', 'secret-root', 'secret-response', 'rawResponse']) assert.ok(!content.includes(value));
  assert.equal(JSON.parse(content).accounts.length, 3);
});
test('an unknown account selection does not fall back to every account', () => {
  const snapshot = JSON.parse(createFinanceContextSnapshot(state, { accountIds: ['missing'] }).content);
  assert.deepEqual(snapshot.accounts, []);
  assert.deepEqual(snapshot.recordedPositions, []);
  assert.deepEqual(snapshot.quotes, []);
});

 test('shared ticker quotes exclude another account label and respect position identity', () => {
  const input = structuredClone(state);
  input.market.quotes = [
    { id: 'shared', symbol: 'TEST', currency: 'USD', name: 'Other account private label', price: '5.40', positionIds: ['q', 'p'] },
    { id: 'different', symbol: 'TEST', currency: 'USD', price: '8.00', positionIds: ['q'] },
    { id: 'other-market', symbol: 'TEST', currency: 'HKD', price: '9.00' },
  ];
  const { content } = createFinanceContextSnapshot(input, { accountIds: ['a'] });
  assert.deepEqual(JSON.parse(content).quotes.map(row => row.id), ['shared']);
  assert.ok(!content.includes('Other account private label'));
});

test('journal context keeps source rows and filters account scope without exposing other memories',()=>{
  const input=structuredClone(state);
  input.journal={revision:'journal-example',transactions:[
    {id:'t1',kind:'expense',occurredOn:'2026-10-20',amount:'-5.00',currency:'CNY',accountId:'a',merchant:'Example refund',source:{kind:'import',fileName:'example.csv',fileHash:'do-not-copy-hash',row:3,batchId:'do-not-copy-batch'}},
    {id:'t2',kind:'income',occurredOn:'2026-10-21',amount:'10.00',currency:'USD',accountId:'b'},
    {id:'t3',kind:'expense',occurredOn:'2026-10-19',amount:'30.00',currency:'CNY',accountId:'a',archived:true},
  ],memories:[{id:'memory',text:'Unrelated private context',kind:'note'}],recurring:[{id:'r1',accountId:'a',name:'Example bill'},{id:'r2',accountId:'b',name:'Other bill'}]};
  const snapshot=JSON.parse(createFinanceContextSnapshot(input,{accountIds:['a'],month:'2026-10'}).content);
  assert.deepEqual(snapshot.journal.transactions.map(row=>row.id),['t1']);
  assert.equal(snapshot.journal.transactions[0].amount,'-5.00');
  assert.deepEqual(snapshot.journal.transactions[0].source,{kind:'import',fileName:'example.csv',row:3});
  assert.deepEqual(snapshot.journal.recurring.map(row=>row.id),['r1']);
  assert.equal(snapshot.journal.memories,undefined);
  assert.equal(snapshot.analysis,undefined);
  assert.ok(!JSON.stringify(snapshot).includes('Unrelated private context'));
});

test('bounded transaction context reports truncation and selected month explicitly',()=>{
  const input=structuredClone(state);
  input.journal={transactions:Array.from({length:502},(_,index)=>({id:'example-'+index,kind:'expense',occurredOn:index===501?'2026-09-30':'2026-10-20',amount:'1.00',currency:'CNY',accountId:'a'}))};
  const snapshot=JSON.parse(createFinanceContextSnapshot(input,{month:'2026-10'}).content);
  assert.deepEqual(snapshot.journal.transactionCoverage,{available:501,included:500,truncated:true});
  assert.equal(snapshot.journal.selectedMonth,'2026-10');
  assert.equal(snapshot.journal.transactions.length,500);
});
