import test from 'node:test';
import assert from 'node:assert/strict';
import {heldMarketRows,dashboardBudgets} from '../src/finance/dashboard-data.mjs';
test('market widget excludes watchlist-only quotes, archived accounts and historical positions',()=>{
  const holding={id:'h',accountId:'a',name:'Example stock',symbol:'EXAMPLE',kind:'stock',quantity:'1.25',marketValue:'12.50',valuationCurrency:'USD'};
  const state={accounts:[{id:'a'}],portfolio:{holdings:[holding,{...holding,id:'old',positionCurrent:false},{...holding,id:'archived-account',accountId:'z'},{...holding,id:'unlinked',linkedToAccount:false}]},market:{quotes:[{id:'q',symbol:'EXAMPLE',currency:'USD',price:'10.00',changePct:'2.00'},{id:'w',symbol:'WATCH',currency:'USD',price:'100.00'}]}};
  assert.deepEqual(heldMarketRows(state).map(row=>row.id),['h','unlinked']);
  assert.equal(heldMarketRows(state)[0].quantity,'1.25');
  assert.equal(heldMarketRows(state)[0].marketValue,'12.50');
  assert.equal(heldMarketRows(state)[1].linkedToAccount,false);
  state.market.quotes[0].currency='HKD';assert.deepEqual(heldMarketRows(state),[]);
});
test('a current holding remains visible when missing FX prevents account valuation linkage',()=>{
  const state={accounts:[{id:'a',currency:'USD'}],portfolio:{holdings:[{id:'hk',accountId:'a',name:'Example HK stock',symbol:'0700.HK',kind:'stock',quantity:'2',valuationCurrency:'HKD',positionCurrent:true,linkedToAccount:false,quote:{currency:'HKD',price:'400.00',status:'current',asOf:'2026-10-23T08:00:00Z',sourceName:'Example exchange'}}]}};
  assert.deepEqual(heldMarketRows(state),[{id:'hk',accountId:'a',name:'Example HK stock',symbol:'0700.HK',kind:'stock',quantity:'2',marketValue:null,currency:'HKD',price:'400.00',changePct:null,asOf:'2026-10-23T08:00:00Z',sourceName:'Example exchange',quoteStatus:'current',linkedToAccount:false}]);
});
test('an embedded quote in another currency is not labelled with the holding currency',()=>{
  const holding={id:'h',accountId:'a',symbol:'EXAMPLE',kind:'stock',valuationCurrency:'USD',quote:{currency:'HKD',price:'77.00',status:'current'}};
  const state={accounts:[{id:'a'}],portfolio:{holdings:[holding]},market:{quotes:[{symbol:'EXAMPLE',currency:'HKD',price:'78.00',status:'current'}]}};
  assert.deepEqual(heldMarketRows(state),[]);
  state.market.quotes.push({symbol:'EXAMPLE',currency:'USD',price:'10.00',status:'stale',asOf:'2026-10-22T20:00:00Z',sourceName:'Example feed'});
  const [row]=heldMarketRows(state);
  assert.equal(row.currency,'USD');assert.equal(row.price,'10.00');
  assert.equal(row.quoteStatus,'stale');assert.equal(row.asOf,'2026-10-22T20:00:00Z');assert.equal(row.sourceName,'Example feed');
});
test('unavailable or unmapped prices cannot mask a usable quote for the same holding',()=>{
  const holding={id:'h',accountId:'a',symbol:'EXAMPLE',kind:'stock',currency:'USD',quote:{currency:'USD',price:'9.00',status:'unavailable'}};
  const state={accounts:[{id:'a'}],portfolio:{holdings:[holding]},market:{quotes:[{symbol:'EXAMPLE',currency:'USD',price:'9.50',status:'unmapped'},{symbol:'EXAMPLE',currency:'USD',price:'10.00',status:'current'}]}};
  assert.equal(heldMarketRows(state)[0].price,'10.00');
  state.market.quotes.pop();assert.deepEqual(heldMarketRows(state),[]);
  holding.quote={currency:'USD',price:'0.00',status:'official'};
  assert.equal(heldMarketRows(state)[0].price,'0.00');assert.equal(heldMarketRows(state)[0].quoteStatus,'official');
});
test('dashboard budget cards follow the selected report month',()=>{
  assert.deepEqual(dashboardBudgets({budgets:[{id:'old',month:'2026-09'},{id:'current',month:'2026-10'}]},'2026-10').map(row=>row.id),['current']);
});
