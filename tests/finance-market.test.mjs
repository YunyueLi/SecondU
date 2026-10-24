import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceMarket,financeQuoteDefinition} from '../server/finance/market.mjs';

const NOW=Date.UTC(2026,0,2,12);
const payload=(symbol,currency,price,time=NOW)=>({chart:{error:null,result:[{meta:{symbol,currency,regularMarketPrice:price,regularMarketTime:time/1000,marketState:'REGULAR',exchangeDataDelayedBy:0,previousClose:10}}]}});
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const position={id:'position-test',symbol:'ABC',exchange:'US',currency:'USD',kind:'stock',name:'Fictional security'};

test('market identity is explicit; unsupported instruments never become a guessed ticker',()=>{
  assert.equal(financeQuoteDefinition({...position,exchange:undefined}).provider,'unmapped');
  assert.equal(financeQuoteDefinition({...position,code:'US.ABC'}).symbol,'ABC');
  assert.equal(financeQuoteDefinition({...position,code:'HK.00700',currency:'HKD'}).symbol,'0700.HK');
  assert.equal(financeQuoteDefinition({...position,kind:'fund',symbol:'000123',currency:'USD',exchange:'CN'}).provider,'unmapped');
  assert.equal(financeQuoteDefinition({...position,publiclyListed:false}).provider,'unmapped');
  assert.equal(financeQuoteDefinition({...position,quoteSymbol:'https://elsewhere.test/secret',symbol:'../secret'}).provider,'unmapped');
});

test('dynamic holdings are deduplicated and currency conversion retains decimal precision',async()=>{
  const calls=[],changed=[];
  const market=createFinanceMarket({now:()=>NOW,onChange:s=>changed.push(s),fetchImpl:async(url,init)=>{
    calls.push({url,init});const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    return response(payload(symbol,symbol==='CNY=X'?'CNY':symbol==='HKD=X'?'HKD':'USD',symbol==='CNY=X'?'7.123456789':symbol==='HKD=X'?'7.8':'12.25'));
  }});
  const state=await market.refresh({positions:[position,{...position,id:'position-two'}],currencies:['USD','HKD'],displayCurrency:'HKD'});
  assert.equal(calls.length,3);assert.equal(state.quotes.filter(q=>q.kind==='stock').length,1);
  assert.deepEqual(state.quotes.find(q=>q.id==='ABC').positionIds,['position-test','position-two']);
  assert.equal(state.rates.find(r=>r.currency==='USD').rate,'7.123456789');
  assert.equal(state.rates.find(r=>r.currency==='HKD').rate,'0.913263690897');
  assert.equal(state.quotes.find(q=>q.id==='ABC').price,'12.25');
  assert.equal(state.status,'ready');assert.equal(changed.length,1);
  assert.ok(calls.every(c=>c.init.redirect==='error'&&c.init.cache==='no-store'&&!c.init.body&&new URL(c.url).hostname==='query1.finance.yahoo.com'));
  assert.ok(calls.every(c=>!c.url.includes(position.name)&&!c.url.includes(position.id)));
});

test('unknown securities stay visible without exposing their names or balances to providers',async()=>{
  let calls=0;const market=createFinanceMarket({now:()=>NOW,fetchImpl:async()=>{calls++;throw new Error('unexpected');}});
  const state=await market.refresh({positions:[{id:'private',symbol:'ABC',name:'Private unlisted holding',currency:'CNY'}]});
  assert.equal(calls,0);assert.equal(state.quotes[0].status,'unmapped');assert.equal(state.quotes[0].price,null);assert.equal(state.status,'idle');
});

test('explicit unsupported asset kinds never reuse a same-symbol stock quote or request it',async()=>{
  const kinds=['bond','crypto','option','futures','cash','other'];
  let calls=0;
  const market=createFinanceMarket({now:()=>NOW,initialState:{quotes:[{id:'ABC',symbol:'ABC',kind:'stock',price:'999',currency:'USD',asOf:new Date(NOW).toISOString()}],rates:[]},fetchImpl:async()=>{calls++;throw new Error('unexpected stock lookup');}});
  const positions=kinds.map(kind=>({...position,id:`manual-${kind}`,kind}));
  for(const row of positions){const definition=financeQuoteDefinition(row);assert.equal(definition.kind,row.kind);assert.equal(definition.provider,'unmapped');}
  const result=await market.refresh({positions});
  assert.equal(calls,0);assert.equal(result.quotes.length,kinds.length);
  for(const quote of result.quotes){assert.equal(quote.status,'unmapped');assert.equal(quote.price,null);assert.ok(kinds.includes(quote.kind));}
});

test('wrong currency, future quotes and failed FX never create usable conversion rates',async()=>{
  const market=createFinanceMarket({now:()=>NOW,fetchImpl:async url=>{
    const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    return response(payload(symbol,symbol==='ABC'?'HKD':'CNY',12,symbol==='ABC'?NOW:NOW+DAY));
  }});
  const state=await market.refresh({positions:[position],currencies:['USD']});
  assert.equal(state.quotes.find(q=>q.id==='ABC').price,null);
  assert.equal(state.rates.some(r=>r.currency==='USD'),false);assert.equal(state.status,'degraded');
  assert.ok(state.issues.length>=2);
});
const DAY=86_400_000;

test('failed refresh preserves last successful prices as stale and preserves their timestamp',async()=>{
  let clock=NOW,fail=false;
  const market=createFinanceMarket({now:()=>clock,fetchImpl:async url=>{if(fail)throw new Error('upstream secret');const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));return response(payload(symbol,symbol==='CNY=X'?'CNY':'USD',symbol==='CNY=X'?7:12));}});
  const first=await market.refresh({positions:[position],currencies:['USD']});clock+=60_000;fail=true;
  const next=await market.refresh({positions:[position],currencies:['USD']});
  assert.equal(next.quotes.find(q=>q.id==='ABC').price,'12');assert.equal(next.quotes.find(q=>q.id==='ABC').status,'stale');
  assert.equal(next.quotes.find(q=>q.id==='ABC').asOf,first.quotes.find(q=>q.id==='ABC').asOf);
  assert.equal(next.rates.find(r=>r.currency==='USD').status,'stale');assert.ok(!JSON.stringify(next).includes('upstream secret'));
});

test('same requests coalesce, cooldown is explicit, and a different selection refreshes immediately',async()=>{
  let calls=0;const market=createFinanceMarket({now:()=>NOW,fetchImpl:async url=>{calls++;const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));return response(payload(symbol,'USD',12));}});
  const input={positions:[position]};const [a,b]=await Promise.all([market.refresh(input),market.refresh(input)]);
  assert.equal(calls,1);assert.equal(a.revision,b.revision);
  await assert.rejects(market.refresh(input),{code:'MARKET_REFRESH_COOLDOWN'});
  await market.refresh({positions:[{...position,id:'other',symbol:'XYZ'}]});assert.equal(calls,2);
});

test('cached quotes are marked stale on restart and arbitrary URLs are never requested',async()=>{
  let calls=0;const market=createFinanceMarket({now:()=>NOW,initialState:{quotes:[{id:'ABC',symbol:'ABC',price:'10',currency:'USD',asOf:new Date(NOW).toISOString(),sourceUrl:'https://untrusted.test'}],rates:[]},fetchImpl:async url=>{calls++;assert.equal(new URL(url).hostname,'query1.finance.yahoo.com');return response(payload('ABC','USD',12));}});
  assert.equal(market.getState().quotes[0].status,'stale');assert.equal(calls,0);
  const next=await market.refresh({positions:[position]});assert.equal(next.quotes[0].price,'12');assert.equal(calls,1);
});

test('fund parsing uses the declared CNY share class and never executes a provider script',async()=>{
  let calls=0;const market=createFinanceMarket({now:()=>NOW,fetchImpl:async url=>{calls++;assert.equal(url,'https://fund.eastmoney.com/pingzhongdata/000123.js');return new Response(`var fS_code="000123"; var fS_name="Fictional fund"; var Data_netWorthTrend=[{"x":${NOW-86400000},"y":1.2345,"equityReturn":0.2}]; throw new Error("never execute");`);}});
  const state=await market.refresh({positions:[{id:'fund-test',symbol:'000123',exchange:'CN',currency:'CNY',kind:'fund'}]});
  assert.equal(calls,1);assert.equal(state.quotes[0].price,'1.2345');assert.equal(state.quotes[0].marketState,'PUBLISHED_NAV');
});
