import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFinanceJournal,recurringOccurrences} from '../server/finance/analysis.mjs';

let id=0;
const base=()=>({id:`example-record-${++id}`,revision:1,archived:false,createdAt:'2026-03-01T00:00:00Z',updatedAt:'2026-03-01T00:00:00Z'});
const transaction=extra=>({...base(),kind:'expense',occurredOn:'2026-03-15',amount:'100.00',currency:'CNY',category:'food',subcategory:'groceries',accountId:null,...extra});
const recurring=extra=>({...base(),kind:'bill',name:'Example bill',amount:'100.00',currency:'CNY',anchorDate:'2026-01-31',endDate:null,frequency:'monthly',interval:1,accountId:null,...extra});
const analyze=(doc,options={})=>analyzeFinanceJournal(doc,{month:'2026-03',currency:'CNY',today:'2026-03-31',...options});
const usdRate={currency:'USD',rate:'7',baseCurrency:'CNY',asOf:'2026-03-31T10:00:00Z'};

test('refunds reduce expense, transfers never become cash flow, and missing FX never becomes zero',()=>{
  const transactions=[transaction({}),transaction({amount:'-20.00'}),transaction({kind:'income',amount:'500.00',category:'salary'}),transaction({kind:'transfer',amount:'2000.00'}),transaction({amount:'0.00'})];
  const recorded=analyze({transactions});
  assert.equal(recorded.spending.expenses.amount,'80.00');assert.equal(recorded.spending.income.amount,'500.00');assert.equal(recorded.spending.netCashFlow.amount,'420.00');
  assert.equal(recorded.coverage.transferCount,1);assert.equal(recorded.spending.categories[0].total.amount,'80.00');
  transactions.push(transaction({amount:'5.00',currency:'USD'}));
  const missing=analyze({transactions});assert.equal(missing.spending.expenses.amount,null);assert.deepEqual(missing.spending.expenses.byCurrency,{CNY:'80.00',USD:'5.00'});assert.deepEqual(missing.spending.expenses.missingCurrencies,['USD']);
  const converted=analyze({transactions},{rates:[usdRate]});assert.equal(converted.spending.expenses.amount,'115.00');assert.equal(converted.spending.netCashFlow.amount,'385.00');assert.equal(converted.spending.expenses.basis,'original_amounts_current_fx');
});

test('empty, transfer-only, and explicit zero records retain distinct coverage',()=>{
  assert.equal(analyze({}).spending.expenses.amount,null);
  const transfer=analyze({transactions:[transaction({kind:'transfer'})]});assert.equal(transfer.spending.expenses.amount,null);assert.equal(transfer.spending.netCashFlow.amount,null);assert.equal(transfer.coverage.status,'recorded_only');
  const zero=analyze({transactions:[transaction({amount:'0.00'})]});assert.equal(zero.spending.expenses.amount,'0.00');assert.equal(zero.spending.expenses.recordCount,1);
  assert.equal(analyze({transactions:[transaction({archived:true})]}).coverage.status,'empty');
});

test('daily prior averages use only recorded prior months with evidence through the same day',()=>{
  const transactions=[transaction({occurredOn:'2025-12-15',kind:'income',amount:'500.00'}),transaction({occurredOn:'2026-01-10',amount:'30.00'}),transaction({occurredOn:'2026-02-20',amount:'60.00'}),transaction({occurredOn:'2026-03-15',amount:'100.00'})];
  const result=analyze({transactions});
  assert.deepEqual(result.spending.comparisonMonths,['2026-02','2026-01']);
  assert.equal(result.spending.daily[0].cumulative.amount,null);assert.equal(result.spending.daily[0].previousAverage,null);
  assert.equal(result.spending.daily[14].previousAverage,'30.00');assert.deepEqual(result.spending.daily[14].comparisonMonths,['2026-01']);
  assert.equal(result.spending.daily[30].previousAverage,'45.00');assert.equal(result.spending.daily[30].cumulative.amount,'100.00');
  assert.equal(result.monthlyTrend.find(row=>row.month==='2025-12').expenses.amount,null);
  const gap=analyze({transactions:[transaction({occurredOn:'2026-01-10'}),transaction({occurredOn:'2026-03-15'})]});
  assert.equal(gap.monthlyTrend.find(row=>row.month==='2026-02').expenses.amount,null);
});

test('monthly, quarterly and yearly schedules retain the original calendar anchor',()=>{
  const monthly=recurring({});
  assert.deepEqual(recurringOccurrences(monthly,'2026-01-01','2026-04-30'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  assert.deepEqual(recurringOccurrences({...monthly,frequency:'quarterly'},'2026-01-01','2026-10-31'),['2026-01-31','2026-04-30','2026-07-31','2026-10-31']);
  assert.deepEqual(recurringOccurrences({...monthly,anchorDate:'2024-02-29',frequency:'yearly'},'2024-01-01','2028-12-31'),['2024-02-29','2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
  const result=analyze({recurring:[monthly]},{today:'2026-03-01'});
  assert.equal(result.upcoming.length,0);assert.equal(result.recurringSummary[0].nextOccurrenceDate,'2026-03-31');
  assert.deepEqual(recurringOccurrences({...monthly,anchorDate:'9999-12-31',frequency:'weekly'},'9999-12-01','9999-12-31'),['9999-12-31']);
});

test('upcoming reflects partial payments, refunds and archived payments without inventing paid status',()=>{
  const bill=recurring({anchorDate:'2026-03-15',frequency:'once'});
  const payment=transaction({amount:'60.00',recurringId:bill.id,recurringOccurrenceOn:'2026-03-15'}),refund=transaction({amount:'-10.00',recurringId:bill.id,recurringOccurrenceOn:'2026-03-15'});
  const partial=analyze({recurring:[bill],transactions:[payment,refund]},{today:'2026-03-01'});
  assert.equal(partial.upcoming[0].paidAmount,'50.00');assert.equal(partial.upcoming[0].remainingAmount,'50.00');
  const remainder=transaction({amount:'50.00',recurringId:bill.id,recurringOccurrenceOn:'2026-03-15'});
  assert.equal(analyze({recurring:[bill],transactions:[payment,refund,remainder]},{today:'2026-03-01'}).upcoming.length,0);
  remainder.archived=true;
  assert.equal(analyze({recurring:[bill],transactions:[payment,refund,remainder]},{today:'2026-03-01'}).upcoming[0].remainingAmount,'50.00');
  const unrelated=analyze({recurring:[bill],transactions:[{...payment,currency:'USD'}]},{today:'2026-03-01'});
  assert.equal(unrelated.upcoming[0].paidAmount,null);assert.equal(unrelated.upcoming[0].remainingAmount,'100.00');
});

test('subscription and bill equivalents remain separate native-currency planned amounts',()=>{
  const records=[recurring({kind:'subscription',amount:'9.99',currency:'USD'}),recurring({kind:'subscription',amount:'120.00',currency:'USD',frequency:'yearly'}),recurring({kind:'bill',amount:'1.00',frequency:'weekly'}),recurring({kind:'bill',amount:'10.00',frequency:'quarterly',interval:2}),recurring({kind:'bill',frequency:'once'}),recurring({kind:'subscription',anchorDate:'2026-04-01',amount:'99.00',currency:'USD'}),recurring({kind:'subscription',endDate:'2026-02-01',amount:'99.00',currency:'USD'})];
  const result=analyze({recurring:records});
  assert.deepEqual(result.subscriptions.byCurrency,[{currency:'USD',monthly:'19.99',annual:'239.88',recordCount:2}]);
  assert.deepEqual(result.bills.byCurrency,[{currency:'CNY',monthly:'6.00',annual:'72.00',recordCount:2}]);
  assert.equal(result.bills.excludedOnceCount,1);assert.equal(result.subscriptions.basis,'scheduled_cadence_equivalent');
  assert.equal(result.recurringSummary.find(row=>row.recurringId===records[4].id).monthlyEquivalent,null);
});

test('budget and goal progress distinguish missing progress from explicitly recorded zero',()=>{
  const budget={...base(),name:'Food',month:'2026-03',amount:'100.00',currency:'CNY',category:'food',subcategory:'',accountIds:[]};
  const unknownGoal={...base(),name:'Goal',targetAmount:'100.00',currentAmount:null,currency:'CNY'};
  let result=analyze({budgets:[budget],goals:[unknownGoal,{...unknownGoal,id:'zero-goal',currentAmount:'0.00'}]});
  assert.equal(result.budgets[0].spent.amount,null);assert.equal(result.budgets[0].remainingAmount,null);assert.equal(result.goals[0].progressPercent,null);assert.equal(result.goals[1].progressPercent,0);
  result=analyze({budgets:[budget],transactions:[transaction({}),transaction({amount:'-20.00'}),transaction({kind:'transfer',amount:'1000.00'}),transaction({amount:'5.00',currency:'USD'})]},{rates:[usdRate]});
  assert.equal(result.budgets[0].spent.amount,'115.00');assert.equal(result.budgets[0].remainingAmount,'-15.00');assert.equal(result.budgets[0].progressPercent,115);
});

test('credit series and net-worth history preserve source scales, currencies and captured FX',()=>{
  const first={...base(),provider:'Example A',model:'Model A',min:0,max:100,score:70,asOf:'2026-03-01'},second={...base(),provider:'Example B',model:'Model B',min:300,max:850,score:700,asOf:'2026-03-30'};
  const snap=(currency,date,capturedAt,net)=>({...base(),currency,date,capturedAt,valuation:{net,complete:net!==null,rates:[usdRate]}});
  const snapshots=[snap('CNY','2026-03-01','2026-03-01T10:00:00Z','70.00'),snap('CNY','2026-03-01','2026-03-01T12:00:00Z','77.00'),snap('USD','2026-03-02','2026-03-02T10:00:00Z','11.00'),snap('CNY','2026-03-03','2026-03-03T10:00:00Z',null)];
  const result=analyze({creditRecords:[first,second],snapshots},{rates:[{...usdRate,rate:'100'}]});
  assert.equal(result.credit.series.length,2);assert.equal(result.credit.latest.id,second.id);assert.equal('rating' in result.credit.latest,false);
  assert.deepEqual(result.netWorth.history.map(row=>row.valuation.net),['77.00',null]);assert.equal(result.netWorth.series.length,2);assert.equal(result.netWorth.history[0].valuation.rates[0].rate,'7');
});

test('fee and interest summaries require explicit categories and keep income separate',()=>{
  const result=analyze({transactions:[transaction({category:'fees',amount:'5.00'}),transaction({category:'interest',amount:'3.00'}),transaction({kind:'income',category:'interest',amount:'2.00'}),transaction({category:'custom bank charge',amount:'99.00'})]});
  assert.equal(result.feesInterest.fees.amount,'5.00');assert.equal(result.feesInterest.interest.amount,'3.00');assert.equal(result.feesInterest.interestIncome.amount,'2.00');
});
