import assert from 'node:assert/strict';
import test from 'node:test';
import {accountSourceDetailsFor,sourceDetailDate} from '../src/finance/account-source-details.ts';
const account=(extra={})=>({id:'example-account',name:'Example',kind:'asset',amount:'90.00',currency:'CNY',asOf:'2026-02-05',detailAsOf:'2026-02-01',...extra});
const state=(accounts=[account()],extra={})=>({accounts,positions:{items:[]},snapshot:{snapshot_date:'2026-02-01',details:{}},...extra});

test('source cash retains each original currency and real zero while excluding missing values',()=>{
  const data=state([account({details:{currency:'CNY',deposits:[{amount:'12.50',currency:'USD'},{amount:'0',currency:'CNY'},{amount:'',currency:'HKD'},{amount:null,currency:'SGD'}],deposit_total_converted:'88.00'}})]);
  const result=accountSourceDetailsFor(data,'example-account');
  assert.deepEqual(result.groups[0].facts.map(row=>[row.amount,row.currency]),[['12.50','USD'],['0','CNY']]);
  assert.equal(result.groups[1].facts[0].label,'存款总额（银行折算）');
  assert.equal(data.accounts[0].amount,'90.00');
});

test('provider-wide details are not assigned to multiple accounts or reused detail keys',()=>{
  const data=state([account({id:'provider-one'}),account({id:'provider-two'})],{snapshot:{details:{provider:{cash_total:'10',currency:'USD'}}}});
  assert.deepEqual(accountSourceDetailsFor(data,'provider-one').groups,[]);
  data.accounts=data.accounts.map(row=>({...row,detailKey:'provider'}));
  assert.deepEqual(accountSourceDetailsFor(data,'provider-one').groups,[]);
});

test('current empty details do not refill cash or funds from an older snapshot',()=>{
  const data=state(undefined,{snapshot:{details:{'example-account':{cash:[{amount:'10',currency:'USD'}],funds:[{name:'Old fund',currency:'USD',yesterday_income:'1'}]}}},displayData:{details:{'example-account':{cash:[],funds:[]}}}});
  assert.deepEqual(accountSourceDetailsFor(data,'example-account').groups,[]);
});

test('older source details retain their own date and never use the updated balance date',()=>{
  const data=state([account({detailCurrent:false,details:{deposits:[{amount:'1',currency:'USD'}]}})]);
  const group=accountSourceDetailsFor(data,'example-account').groups[0];
  assert.equal(group.historical,true);assert.equal(group.asOf,'2026-02-01');
  delete data.accounts[0].detailAsOf;delete data.snapshot.snapshot_date;
  assert.equal(accountSourceDetailsFor(data,'example-account').groups[0].asOf,null);
  assert.equal(sourceDetailDate('2026-02-30'),null);
  assert.equal(sourceDetailDate('2026-02-01T24:00:00Z'),null);
  assert.equal(sourceDetailDate('not-a-date'),null);
});

test('source currencies, record dates and rounded displays retain their original meaning',()=>{
  const data=state([account({currency:'USD',available:'2',detailCurrent:false,details:{currency:'CNH',deposit_total_converted:'14',cash:[{display:'1.2K',currency:'USD',precision:'rounded',recordAsOf:'2026-01-29'}],funds:[{name:'Unknown-currency fund',yesterday_income:'1'}]}})]);
  const groups=accountSourceDetailsFor(data,'example-account').groups;
  assert.equal(groups[0].facts[0].currency,'USD');assert.equal(groups[0].asOf,'2026-02-01');
  assert.equal(groups.find(group=>group.id==='bank-totals').facts[0].currency,'CNY');
  const cash=groups.find(group=>group.id==='cash').facts[0];
  assert.equal(cash.display,'1.2K');assert.equal(cash.approximate,true);assert.equal(cash.asOf,'2026-01-29');
  assert.equal(groups.find(group=>group.id==='fund-0').facts[0].currency,undefined);
});

test('nested cash-management products map to one matching account, never a sibling gold account',()=>{
  const data=state([account({id:'cash-custom',provider:'cmb',balance_kind:'product_total'}),account({id:'gold-custom',provider:'cmb',balance_kind:'market_value'})],{snapshot:{details:{cmb:{currency:'CNY',chaochaobao:{available:'0',yesterday_income:'0.50'}}}}});
  assert.equal(accountSourceDetailsFor(data,'cash-custom').groups[0].label,'朝朝宝');
  assert.deepEqual(accountSourceDetailsFor(data,'gold-custom').groups,[]);
});

test('confirmed plans require exact account and holding identity and do not infer frequency or dates',()=>{
  const plan={id:'plan-one',accountId:'example-account',holdingId:'fund-one',fundName:'Example fund',amount:'7.50',currency:'USD',status:'user_confirmed',executionStatus:'not_observed',affectsBalances:false,funding:{label:'美元存款'},confirmedOn:'2026-02-04',startDate:null,nextExecutionDate:null,tradingDayRule:null};
  const data=state(undefined,{positions:{items:[{id:'fund-one',accountId:'example-account'}]},investmentPlans:{items:[plan,{...plan,id:'other-account',accountId:'another'},{...plan,id:'other-fund',holdingId:'missing'}]}});
  const before=JSON.stringify(data),result=accountSourceDetailsFor(data,'example-account');
  assert.equal(result.plans.length,1);assert.equal(result.plans[0].frequency,'频率待补充');assert.equal(result.plans[0].startDate,null);assert.equal(result.plans[0].nextExecutionDate,null);
  assert.equal(JSON.stringify(data),before);
});

test('securities and fund subtotal aliases produce one source fact each without changing balances',()=>{
  const data=state([account({currency:'USD',detailCurrent:false,details:{currency:'CNH',recordAsOf:'2026-01-28',securities_assets:'42.50',securities_nav:'90',funds_assets:'12',fund_nav:'50',fund_total:'60'}})]);
  const before=JSON.stringify(data),groups=accountSourceDetailsFor(data,'example-account').groups;
  assert.equal(groups.length,1);
  assert.equal(groups[0].id,'asset-components');assert.equal(groups[0].historical,true);assert.equal(groups[0].asOf,'2026-01-28');
  assert.deepEqual(groups[0].facts.map(row=>[row.label,row.amount,row.currency,row.asOf]),[
    ['证券资产','42.50','CNH','2026-01-28'],['基金资产','12','CNH','2026-01-28'],
  ]);
  assert.equal(JSON.stringify(data),before);
});

test('legacy subtotal fields retain real zero and skip blank or missing aliases',()=>{
  const data=state([account({details:{currency:'USD',securities_assets:'',securities_nav:'0',funds_assets:null,fund_nav:'7.25',fund_total:'25'}})]);
  assert.deepEqual(accountSourceDetailsFor(data,'example-account').groups[0].facts.map(row=>[row.label,row.amount,row.currency]),[['证券资产','0','USD'],['基金资产','7.25','USD']]);
  data.accounts[0].details={currency:'USD',securities_nav:null,fund_nav:'',fund_total:'0'};
  assert.deepEqual(accountSourceDetailsFor(data,'example-account').groups[0].facts.map(row=>[row.label,row.amount]),[['基金资产','0']]);
  data.accounts[0].details={securities_nav:'',fund_nav:null,fund_total:'invalid',gold:{today_pnl:null}};
  assert.deepEqual(accountSourceDetailsFor(data,'example-account').groups,[]);
});

test('gold daily income keeps its owned product currency, source date and historical status',()=>{
  const data=state([account({id:'examplebank-gold',currency:'USD',detailCurrent:false}),account({id:'examplebank-cash'})],{snapshot:{snapshot_date:'2026-02-01',details:{examplebank:{currency:'USD',gold:{currency:'CNY',today_pnl:'-1.25',recordAsOf:'2026-01-29'}}}}});
  const groups=accountSourceDetailsFor(data,'examplebank-gold').groups;
  assert.equal(groups.length,1);assert.equal(groups[0].id,'gold-income');assert.equal(groups[0].historical,true);assert.equal(groups[0].asOf,'2026-01-29');
  assert.deepEqual(groups[0].facts,[{label:'当日收益',amount:'-1.25',currency:'CNY',asOf:'2026-01-29'}]);
  assert.deepEqual(accountSourceDetailsFor(data,'examplebank-cash').groups,[]);
  data.snapshot.details.examplebank.gold.today_pnl='0';
  assert.equal(accountSourceDetailsFor(data,'examplebank-gold').groups[0].facts[0].amount,'0');
  delete data.snapshot.details.examplebank.gold.recordAsOf;
  data.snapshot.details.examplebank.recordAsOf='2026-01-30';
  assert.equal(accountSourceDetailsFor(data,'examplebank-gold').groups[0].facts[0].asOf,'2026-01-30');
});

test('unowned or superseded subtotal and gold sources are not attached to an account',()=>{
  const detail={currency:'USD',securities_nav:'40',fund_nav:'10',gold:{today_pnl:'1'}};
  const data=state([account({id:'provider-one'}),account({id:'provider-two'})],{snapshot:{details:{provider:detail}}});
  assert.deepEqual(accountSourceDetailsFor(data,'provider-one').groups,[]);
  assert.deepEqual(accountSourceDetailsFor(data,'provider-two').groups,[]);
  const own=state([account({details:{gold:{accountId:'another-account',today_pnl:'1'}}})]);
  assert.deepEqual(accountSourceDetailsFor(own,'example-account').groups,[]);
  const replaced=state(undefined,{snapshot:{details:{'example-account':detail}},displayData:{details:{'example-account':{}}}});
  assert.deepEqual(accountSourceDetailsFor(replaced,'example-account').groups,[]);
});
