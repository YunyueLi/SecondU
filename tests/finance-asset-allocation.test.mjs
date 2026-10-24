import assert from 'node:assert/strict';
import test from 'node:test';
import {assetAllocationFor} from '../src/finance/asset-allocation.ts';
import {minor,decimal} from '../src/finance/model.ts';
const account=(extra={})=>({id:'a',name:'Example',kind:'asset',assetType:'investment',amount:'100.00',currency:'CNY',asOf:'2026-10-24',...extra});
const state=(extra={})=>({accounts:[account()],liabilities:[],valuation:{rates:[]},positions:{items:[]},...extra});
const amounts=allocation=>Object.fromEntries(allocation.groups.map(row=>[row.id,row.amount]));
const conserved=allocation=>assert.equal(decimal(allocation.groups.reduce((sum,row)=>sum+minor(row.amount),0n)),allocation.total);

test('property ownership value is counted once and never subtracts an associated loan twice',()=>{
  const data=state({accounts:[account({assetType:'real_estate',amount:'333333.33',assetDetails:{totalValue:'1000000.01',ownershipPercent:'33.333333',linkedLiabilityIds:['loan']}})],liabilities:[{id:'loan',kind:'liability',amount:'200000.00',currency:'CNY'}]});
  const result=assetAllocationFor(data,'CNY');assert.deepEqual(amounts(result),{real_estate:'333333.33'});conserved(result);
});

test('cash and fund subtotals supersede their holding records and buying power is not an asset',()=>{
  const data=state({accounts:[account({details:{cash:'20',fund_nav:'80',power:'1000',currency:'CNY'}})],positions:{items:[{id:'f',accountId:'a',kind:'fund',currency:'CNY',recordedMarketValue:'80',asOf:'2026-10-24'}]}});
  const result=assetAllocationFor(data,'CNY');assert.deepEqual(amounts(result),{fund:'80.00',cash:'20.00'});conserved(result);
});

for(const [current,total]of[['100.00','120.00'],['60.00','80.00']])test(`current securities ${current} replace the matching baseline in subtotal decomposition`,()=>{
  const data=state({accounts:[account({details:{cash:'20',securities_nav:'80',currency:'CNY'}})],positions:{items:[{id:'p',accountId:'a',kind:'stock',currency:'CNY',recordedMarketValue:'80',asOf:'2026-10-24'}]},portfolio:{accounts:[{accountId:'a',estimatedAmount:total,residualBasis:'balancing_term_at_current_fx_not_cash'}],holdings:[{id:'p',accountId:'a',kind:'stock',positionCurrent:true,linkedToAccount:true,marketValue:current,marketValueInAccountCurrency:current,baselineValueInAccountCurrency:'80.00',baselineMarketValue:'80',recordedCurrency:'CNY',valuationCurrency:'CNY'}]}});
  const result=assetAllocationFor(data,'CNY');assert.deepEqual(amounts(result),{stock:current,cash:'20.00'});conserved(result);
});

test('current fund price changes are retained even when the source exposes a fund subtotal',()=>{
  const data=state({accounts:[account({details:{cash:'20',fund_nav:'80',currency:'CNY'}})],positions:{items:[{id:'f',accountId:'a',kind:'fund',currency:'CNY',recordedMarketValue:'80'}]},portfolio:{accounts:[{accountId:'a',estimatedAmount:'130.00'}],holdings:[{id:'f',accountId:'a',kind:'fund',positionCurrent:true,linkedToAccount:true,marketValueInAccountCurrency:'110',baselineValueInAccountCurrency:'80',recordedCurrency:'CNY',valuationCurrency:'CNY'}]}});
  const result=assetAllocationFor(data,'CNY');assert.deepEqual(amounts(result),{fund:'110.00',cash:'20.00'});conserved(result);
});

test('a signed positive recorded value remains a positive stock allocation',()=>{
  const result=assetAllocationFor(state({positions:{items:[{id:'p',accountId:'a',kind:'stock',currency:'CNY',recordedMarketValue:'+100.00',asOf:'2026-10-24'}]}}),'CNY');assert.deepEqual(amounts(result),{stock:'100.00'});conserved(result);
});

test('historical holdings cannot silently classify a current balance',()=>{
  const result=assetAllocationFor(state({positions:{items:[{id:'p',accountId:'a',kind:'stock',currency:'CNY',recordedMarketValue:'80',asOf:'2020-01-01'}]}}),'CNY');assert.equal(result.groups.some(row=>row.id==='stock'),false);assert.equal(result.issues.length,1);conserved(result);
});

test('explicit historical status excludes old source totals and positions',()=>{
  const result=assetAllocationFor(state({accounts:[account({detailCurrent:false,details:{cash:'20',fund_nav:'80'}})],portfolio:{holdings:[{id:'p',accountId:'a',kind:'stock',positionCurrent:false,baselineMarketValue:'80',recordedCurrency:'CNY'}]}}),'CNY');assert.deepEqual(amounts(result),{investment:'100.00'});conserved(result);
});

test('missing FX remains unknown and a shared institution subtotal is not duplicated',()=>{
  const data=state({accounts:[account({id:'bank-one',amount:'50',currency:'USD',assetType:'cash'}),account({id:'bank-two',amount:'50',currency:'USD',assetType:'cash'})],snapshot:{details:{bank:{cash:'100',currency:'USD'}}}});
  const result=assetAllocationFor(data,'CNY');assert.equal(result.total,null);assert.equal(result.groups[0].amount,null);assert.equal(result.items.length,2);assert.equal(result.items.every(row=>row.amount==='50'),true);
});

test('positive positions and explicit negative cash retain the provider net value',()=>{
  const data=state({accounts:[account({amount:'70',details:{cash:'-30',securities_nav:'100',currency:'CNY'}})],positions:{items:[{id:'p',accountId:'a',kind:'stock',currency:'CNY',recordedMarketValue:'100',asOf:'2026-10-24'}]}});
  const result=assetAllocationFor(data,'CNY');assert.deepEqual(amounts(result),{stock:'100.00',cash:'-30.00'});conserved(result);
});

test('unsupported conflicting components are not presented as a complete class breakdown',()=>{
  const data=state({accounts:[account({details:{cash:'80',fund_nav:'80',currency:'CNY'}})]});
  const result=assetAllocationFor(data,'CNY');assert.deepEqual(amounts(result),{unclassified:'100.00'});assert.equal(result.issues.length,1);conserved(result);
});
