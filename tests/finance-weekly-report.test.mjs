import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinanceWeeklyReport} from '../server/finance/weekly-report.mjs';

let sequence=0;
const base=()=>({id:`example-weekly-${++sequence}`,revision:1,archived:false,createdAt:'2026-03-01T00:00:00Z',updatedAt:'2026-03-01T00:00:00Z'});
const transaction=extra=>({...base(),kind:'expense',occurredOn:'2026-03-31',amount:'100.00',currency:'CNY',category:'food',subcategory:'groceries',accountId:null,...extra});
const recurring=extra=>({...base(),kind:'bill',name:'Example bill',amount:'100.00',currency:'CNY',anchorDate:'2026-04-02',endDate:null,frequency:'once',interval:1,accountId:null,...extra});
const snapshot=extra=>({...base(),date:'2026-03-31',capturedAt:'2026-03-31T10:00:00Z',currency:'CNY',accounts:[{id:'example-account',kind:'asset',currency:'USD',amount:'10.00'}],scope:{accountIds:['example-account'],liabilityIds:[],archivedAccountIds:[]},valuation:{net:'75.00',complete:true,rates:[{currency:'USD',rate:'7.5',baseCurrency:'CNY'}]},...extra});
const credit=extra=>({...base(),provider:'Example provider',model:'Example model',min:0,max:100,score:75,asOf:'2026-03-31',...extra});
const report=(doc,options={})=>buildFinanceWeeklyReport(doc,{through:'2026-03-31',today:'2026-04-01',currency:'CNY',...options});

test('weekly periods are exactly seven days; refunds reduce expenses and transfers are excluded from cash flow',()=>{
  const rows=[transaction({occurredOn:'2026-03-17',amount:'999.00'}),transaction({occurredOn:'2026-03-18',amount:'60.00'}),transaction({occurredOn:'2026-03-24',kind:'income',amount:'500.00'}),transaction({occurredOn:'2026-03-25',amount:'100.00'}),transaction({amount:'-20.00'}),transaction({kind:'income',amount:'600.00'}),transaction({kind:'transfer',amount:'9999.00'}),transaction({occurredOn:'2026-04-01',amount:'999.00'}),transaction({archived:true,amount:'999.00'})];
  const result=report({revision:'example-revision',transactions:rows});
  assert.deepEqual([result.current.from,result.current.through,result.previous.from,result.previous.through],['2026-03-25','2026-03-31','2026-03-18','2026-03-24']);
  assert.equal(result.current.expenses.amount,'80.00');assert.equal(result.previous.expenses.amount,'60.00');assert.equal(result.change.expenses.amount,'20.00');
  assert.equal(result.current.netCashFlow.amount,'520.00');assert.equal(result.previous.netCashFlow.amount,'440.00');assert.equal(result.change.netCashFlow.amount,'80.00');
  assert.equal(result.current.transactionCount,4);assert.equal(result.coverage.currentTransactionCount,4);assert.equal(result.change.income.amount,'100.00');
  assert.equal(result.categories[0].change.amount,'20.00');assert.equal(result.sources.journalRevision,'example-revision');
  assert.deepEqual(result.sources.transactionIds,[...result.current.recordIds,...result.previous.recordIds].sort());
  assert.ok(!result.sources.recordIds.includes(rows[0].id));assert.ok(!result.sources.recordIds.includes(rows[7].id));assert.ok(!result.sources.recordIds.includes(rows[8].id));
});

test('empty weeks remain unknown, explicit zero stays zero, and absent categories do not become zero changes',()=>{
  const empty=report({});assert.equal(empty.coverage.status,'empty');assert.equal(empty.current.expenses.amount,null);assert.equal(empty.current.netCashFlow.amount,null);assert.equal(empty.change.expenses.amount,null);assert.deepEqual(empty.categories,[]);
  const result=report({transactions:[transaction({occurredOn:'2026-03-20',amount:'0.00'}),transaction({amount:'0.00'}),transaction({category:'new-category',amount:'20.00'})]});
  assert.equal(result.categories.find(row=>row.category==='food').change.amount,'0.00');
  assert.equal(result.categories.find(row=>row.category==='new-category').previous.amount,null);assert.equal(result.categories.find(row=>row.category==='new-category').change.amount,null);
  const transfer=report({transactions:[transaction({kind:'transfer'})]});assert.equal(transfer.coverage.status,'recorded_only');assert.equal(transfer.current.netCashFlow.amount,null);
  const oldOnly=report({transactions:[transaction({occurredOn:'2026-03-20'})]});assert.equal(oldOnly.coverage.status,'empty');assert.equal(oldOnly.current.expenses.amount,null);assert.equal(oldOnly.change.expenses.amount,null);
});

test('weekly conversion uses one explicit rate basis while preserving original currency deltas and missing FX',()=>{
  const doc={transactions:[transaction({currency:'USD',amount:'10.00'}),transaction({occurredOn:'2026-03-20',currency:'USD',amount:'5.00'})]};
  const missing=report(doc);assert.equal(missing.current.expenses.amount,null);assert.deepEqual(missing.current.expenses.byCurrency,{USD:'10.00'});assert.deepEqual(missing.change.expenses.byCurrency,{USD:'5.00'});assert.equal(missing.change.expenses.amount,null);assert.deepEqual(missing.coverage.missingCurrencies,['USD']);
  const converted=report(doc,{rates:[{currency:'USD',rate:'7',baseCurrency:'CNY'}]});assert.equal(converted.current.expenses.amount,'70.00');assert.equal(converted.change.expenses.amount,'35.00');assert.equal(converted.change.expenses.complete,true);
});

test('upcoming seven days use partial payments and refunds known by report date and retain settled-source evidence',()=>{
  const partial=recurring({}),settled=recurring({anchorDate:'2026-04-07'}),outside=recurring({anchorDate:'2026-04-08'}),today=recurring({anchorDate:'2026-03-31'});
  const payment=transaction({occurredOn:'2026-03-10',amount:'40.00',recurringId:partial.id,recurringOccurrenceOn:'2026-04-02'}),refund=transaction({amount:'-10.00',recurringId:partial.id,recurringOccurrenceOn:'2026-04-02'}),futurePayment=transaction({occurredOn:'2026-04-02',amount:'70.00',recurringId:partial.id,recurringOccurrenceOn:'2026-04-02'}),fullPayment=transaction({occurredOn:'2026-03-10',amount:'100.00',recurringId:settled.id,recurringOccurrenceOn:'2026-04-07'});
  const result=report({recurring:[partial,settled,outside,today],transactions:[payment,refund,futurePayment,fullPayment]});
  assert.deepEqual([result.upcoming.from,result.upcoming.through],['2026-04-01','2026-04-07']);assert.equal(result.upcoming.items.length,1);
  assert.equal(result.upcoming.items[0].paidAmount,'30.00');assert.equal(result.upcoming.items[0].remainingAmount,'70.00');assert.deepEqual(result.upcoming.items[0].paymentRecordIds,[payment.id,refund.id].sort());
  assert.deepEqual(result.sources.recurringIds,[partial.id,settled.id].sort());assert.ok(result.sources.transactionIds.includes(fullPayment.id));assert.ok(result.sources.transactionIds.includes(payment.id));assert.ok(!result.sources.transactionIds.includes(futurePayment.id));
});

test('net-worth comparisons keep captured values and require the latest report-currency snapshot to have a matching scope',()=>{
  const earlier=snapshot({date:'2026-03-01',capturedAt:'2026-03-01T10:00:00Z',valuation:{net:'70.00',complete:true,rates:[{currency:'USD',rate:'7'}]}}),different=snapshot({date:'2026-03-30',capturedAt:'2026-03-30T10:00:00Z',scope:{accountIds:['other-account'],liabilityIds:[],archivedAccountIds:[]}}),latest=snapshot({}),otherCurrency=snapshot({currency:'USD',capturedAt:'2026-03-31T11:00:00Z'}),future=snapshot({date:'2026-04-01',capturedAt:'2026-04-01T10:00:00Z'});
  const result=report({snapshots:[latest,otherCurrency,earlier,different,future]},{rates:[{currency:'USD',rate:'100'}]});
  assert.equal(result.netWorth.latest.id,latest.id);assert.equal(result.netWorth.previous.id,earlier.id);assert.equal(result.netWorth.change,'5.00');assert.equal(result.netWorth.previous.valuation.rates[0].rate,'7');assert.deepEqual(result.sources.snapshotIds,[earlier.id,latest.id].sort());
  const noMatch=report({snapshots:[different,latest]});assert.equal(noMatch.netWorth.change,null);assert.equal(noMatch.netWorth.reason,'missing_comparable_snapshot');
  const incomplete=report({snapshots:[earlier,{...latest,valuation:{...latest.valuation,net:null,complete:false}}]});assert.equal(incomplete.netWorth.reason,'incomplete_valuation');assert.equal(incomplete.netWorth.change,null);
  assert.equal(report({snapshots:[otherCurrency]}).netWorth.reason,'missing_snapshot');
});

test('credit comparisons preserve provider, model and scale boundaries and actual record dates',()=>{
  const earlier=credit({asOf:'2026-03-01',score:70}),newScale=credit({asOf:'2026-03-30',min:300,max:850,score:700}),latest=credit({}),other=credit({asOf:'2026-04-01',provider:'Other provider',score:90});
  const result=report({creditRecords:[latest,earlier,newScale,other]});
  assert.equal(result.credit.latest.id,latest.id);assert.equal(result.credit.previous.id,earlier.id);assert.equal(result.credit.change,5);assert.deepEqual(result.sources.creditRecordIds,[earlier.id,latest.id].sort());assert.equal('rating' in result.credit,false);
  const incomparable=report({creditRecords:[newScale,latest]});assert.equal(incomparable.credit.change,null);assert.equal(incomparable.credit.reason,'missing_comparable_record');
});

test('report construction is read-only and validates future or malformed report dates',()=>{
  const doc={revision:'read-only-example',transactions:[transaction({})],snapshots:[snapshot({})],creditRecords:[credit({})]},before=JSON.stringify(doc);
  report(doc);assert.equal(JSON.stringify(doc),before);
  assert.throws(()=>report(doc,{through:'2026-04-02'}),{code:'finance_invalid_date'});
  assert.throws(()=>report(doc,{through:'2026-02-30'}),{code:'finance_invalid_date'});
  assert.throws(()=>report(doc,{through:'0000-01-01'}),{code:'finance_invalid_date'});
  assert.throws(()=>report(doc,{currency:'ZZZ'}));
});
