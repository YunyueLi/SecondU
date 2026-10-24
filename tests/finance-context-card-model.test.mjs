import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFinanceContext,initialContextView,contextViews,contextAccountValues,contextScope,contextAmount} from '../src/finance/context-card-model.mjs';
const base={schema:'secondu.finance-context.v1',accounts:[{name:'示例银行',amount:'100.00',currency:'CNY',asOf:'2026-10-01'}],analysis:{spending:{categories:[{category:'food',total:{amount:'10.00'}}]}}};

test('weekly and scenario attachments open the object being discussed, with background sections still inspectable',()=>{
  const weekly={...base,weeklyReport:{current:{expenses:{amount:null,byCurrency:{USD:'20.00'}}},previous:{}}};
  assert.equal(initialContextView(weekly),'weekly');
  assert.deepEqual(contextViews(weekly).map(row=>row.value),['weekly','accounts','spending']);
  const scenario={...base,scenario:{assumptions:{months:1},points:[{month:1,baseline:'10.00',planned:'20.00'}]}};
  assert.equal(initialContextView(scenario),'scenario');
  assert.equal(initialContextView(base),'spending');
  assert.equal(initialContextView({schema:'secondu.finance-transactions.v1',transactions:[{amount:'0.00'}]}),'transactions');
});

test('account snapshots retain both exact book and estimated values with independent dates and stale state',()=>{
  const row={...base.accounts[0],amount:'+9007199254740993.01',valuation:{estimatedAmount:'9007199254740994.02',currency:'CNY',asOf:'2026-10-24',status:'stale',reconciliationRequired:true}};
  const before=JSON.stringify(row),result=contextAccountValues(row);
  assert.equal(result.recorded.amount,'+9007199254740993.01');assert.equal(result.recorded.date,'2026-10-01');
  assert.equal(result.estimated.amount,'9007199254740994.02');assert.equal(result.estimated.date,'2026-10-24');
  assert.equal(result.stale,true);assert.equal(result.reconciliationRequired,true);assert.equal(JSON.stringify(row),before);
  assert.equal(contextAccountValues({...row,valuation:{estimatedAmount:null}}).estimated,null);
  assert.equal(contextAccountValues({...row,valuation:{estimatedAmount:'0.00'}}).estimated.amount,'0.00');
});

test('scope discloses financial memories, credit and plan records even when an object-specific tab is selected',()=>{
  const value={...base,journal:{transactions:[{},{}],memories:[{}],creditRecords:[{}],budgets:[{}],goals:[{}],recurring:[{}],netWorthHistory:[{}]}};
  assert.deepEqual(contextScope(value).map(row=>[row.label,row.count]),[['账户',1],['交易',2],['周期计划',1],['信用记录',1],['目标',1],['预算',1],['财务记忆',1],['净资产快照',1]]);
});

test('parsing preserves missing FX originals and zero without coercing malformed values or executing text',()=>{
  const input={...base,weeklyReport:{current:{expenses:{amount:null,byCurrency:{USD:'20.00',JPY:'0.00'},complete:false}},previous:{}},journal:{memories:[{text:'<script>synthetic</script>'}]}};
  assert.deepEqual(parseFinanceContext(JSON.stringify(input)),input);
  assert.equal(contextAmount(null),null);assert.equal(contextAmount(0),null);assert.equal(contextAmount('0.00'),'0.00');assert.equal(contextAmount('NaN'),null);
  assert.throws(()=>parseFinanceContext('null'));assert.throws(()=>parseFinanceContext('{'));assert.throws(()=>parseFinanceContext('{"schema":"other"}'));
  assert.deepEqual(contextViews({accounts:[null,false,[]]}),[]);
});
