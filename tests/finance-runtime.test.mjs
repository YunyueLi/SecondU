import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,statSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer,get as httpGet} from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {createApp} from '../server/index.mjs';
import {valuation} from '../server/finance/arithmetic.mjs';
import {projectFinance} from '../server/finance/store.mjs';

async function fixture(t,options={}){
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-finance-'));let app;
 const open=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},...options});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};await open();
 const api=async(route,body,method=body===undefined?'GET':'POST',headers={})=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await response.text();return {status:response.status,value:response.headers.get('content-type')?.includes('application/json')?JSON.parse(raw):raw};};
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});return {get app(){return app;},directory,api,async reopen(){await app.close();await open();}};
}
const account=(extra={})=>({idempotencyKey:'account-create-fixture',name:'Example savings',kind:'asset',currency:'USD',amount:'1200.50',asOf:'2026-01-01',...extra});

test('empty finance starts independently; onboarding and manual accounts survive restart with idempotency',async t=>{
 const f=await fixture(t),initial=(await f.api('finance/state')).value;
 assert.deepEqual(initial.accounts,[]);assert.deepEqual(initial.positions.items,[]);assert.equal(initial.metadata.onboarding.completed,false);assert.equal(initial.source.mode,'native');
 const created=await f.api('finance/accounts',account());assert.equal(created.status,201);assert.equal(created.value.state.accounts[0].amount,'1200.50');assert.equal(created.value.state.accounts[0].canAddPosition,true);assert.equal(created.value.state.valuation.assets,null,'USD is not silently added as CNY');
 const firstId=created.value.accountId,replay=await f.api('finance/accounts',account());assert.equal(replay.status,200);assert.equal(replay.value.accountId,firstId);assert.equal(replay.value.state.accounts.length,1);
 assert.equal((await f.api('finance/accounts',account({amount:'999'}))).status,409);
 const setting=await f.api('finance/onboarding',{completed:true,displayCurrency:'USD',method:'manual'},'PUT');assert.equal(setting.value.state.valuation.currency,'USD');assert.equal(setting.value.state.valuation.assets,'1200.50');
 await f.reopen();const restored=(await f.api('finance/state')).value;assert.equal(restored.accounts[0].id,firstId);assert.equal(restored.accounts[0].canAddPosition,true);assert.equal(restored.metadata.onboarding.completed,true);assert.equal(restored.valuation.assets,'1200.50');
 assert.equal((await f.api('finance/accounts',account())).value.accountId,firstId);
});

test('account updates reject stale dates and preserve original currency; positions require current revision',async t=>{
 const f=await fixture(t),a=(await f.api('finance/accounts',account())).value.accountId;
 const update={idempotencyKey:'balance-update-fixture',accountId:a,kind:'asset',amount:'1400.25',currency:'USD',asOf:'2026-01-02',note:'Statement reviewed'};
 assert.equal((await f.api('finance/updates',{...update,currency:'CNY'})).status,409);
 assert.equal((await f.api('finance/updates',{...update,asOf:'2025-12-31'})).status,409);
 assert.equal((await f.api('finance/updates',update)).status,201);assert.equal((await f.api('finance/updates',update)).value.replayed,true);
 const p=await f.api('finance/positions',{idempotencyKey:'position-create-fixture',accountId:a,name:'Example instrument',symbol:'US.EXAMPLE',kind:'stock',quantity:'2',costPrice:'5',recordedMarketValue:'12',currency:'USD',asOf:'2026-01-02'});
 assert.equal(p.status,201);const item=p.value.state.positions.items[0],change={idempotencyKey:'position-update-fixture',positionId:item.id,accountId:a,expectedRevision:p.value.state.positions.revision,baseMarker:item.currentAccountBaseMarker,quantity:'3',costPrice:'5',recordedMarketValue:'18',currency:'USD',asOf:'2026-01-03',note:'Reviewed quantity'};
 const saved=await f.api('finance/positions/updates',change);assert.equal(saved.status,201);assert.equal(saved.value.state.positions.items[0].quantity,'3');assert.equal(saved.value.state.accounts[0].amount,'1400.25','holding value is not counted a second time');
 assert.equal((await f.api('finance/positions/updates',change)).value.replayed,true);
 assert.equal((await f.api('finance/positions/updates',{...change,idempotencyKey:'stale-position-fixture',quantity:'4'})).status,409);
 assert.equal((await f.api('finance/positions',{idempotencyKey:'bad-account-fixture',accountId:'other-space-account',name:'Other',symbol:'US.EXAMPLE',kind:'stock',quantity:'1',costPrice:null,recordedMarketValue:'1',currency:'USD',asOf:'2026-01-02'})).status,404);
});

test('display currency conversions use exact arithmetic and never erase unknown foreign balances',()=>{
 const accounts=[{id:'a',currency:'USD',amount:'100.00'},{id:'b',currency:'CNY',amount:'700.00'}],liabilities=[{id:'l',currency:'USD',amount:'20.00'}],rates=[{currency:'USD',rate:'7',baseCurrency:'CNY'}];
 const usd=valuation(accounts,liabilities,'USD',rates);assert.equal(usd.assets,'200.00');assert.equal(usd.liabilities,'20.00');assert.equal(usd.net,'180.00');
 assert.equal(valuation(accounts,liabilities,'CNY',rates).net,'1260.00');
 const missing=valuation([...accounts,{id:'x',currency:'EUR',amount:'10'}],liabilities,'USD',rates);assert.equal(missing.assets,null);assert.equal(missing.net,null);assert.deepEqual(missing.unconvertedCurrencies,['EUR']);assert.equal(missing.partialAssets,'200.00');
 assert.equal(valuation([{id:'rounding',currency:'USD',amount:'0.01'}],[],'CNY',[{currency:'USD',rate:'0.5'}]).assets,'0.01');
});

test('finance projection merges all rate sources by valid observation time without losing upstream holdings',()=>{
 const doc={accounts:[],positions:[],updates:[],positionUpdates:[],metadata:{onboarding:{displayCurrency:'CNY'}}};
 const rate=(value,asOf,sourceName,extra={})=>({currency:'USD',rate:value,baseCurrency:'CNY',asOf,sourceName,...extra});
 const newest=rate('7.20','2026-01-03T00:00:00Z','upstream portfolio',{sourceUrl:'https://example.test/portfolio-fx'});
 const upstream={accounts:[{id:'bridge-usd',name:'Bridge USD',amount:'100.00',currency:'USD'}],liabilities:[],positions:{items:[{id:'bridge-holding',accountId:'bridge-usd'}]},portfolio:{rates:[newest],accounts:[],holdings:[{id:'bridge-holding',accountId:'bridge-usd',marketValue:'50.00'}]},valuation:{rates:[rate('7.10','2026-01-02T00:00:00Z','upstream valuation')]},market:{rates:[rate('7.15','2026-01-02T12:00:00Z','upstream market')]}};
 const market={quotes:[],rates:[rate('7.00','2026-01-01T00:00:00Z','cached native',{status:'stale'})]};
 const original=structuredClone({doc,upstream,market}),result=projectFinance(doc,market,upstream);
 assert.equal(result.valuation.assets,'720.00');assert.equal(result.portfolio.summary.assets,'720.00');
 const expected={...newest,rate:'7.2'};for(const rates of [result.valuation.rates,result.portfolio.rates,result.market.rates])assert.deepEqual(rates.find(row=>row.currency==='USD'),expected);
 assert.equal(result.valuation.asOf,newest.asOf);assert.deepEqual(result.positions.items,upstream.positions.items);assert.deepEqual(result.portfolio.holdings,upstream.portfolio.holdings);assert.deepEqual({doc,upstream,market},original);
 const latest=rate('7.30','2026-01-04T00:00:00Z','current native');assert.equal(projectFinance(doc,{quotes:[],rates:[latest]},upstream).valuation.assets,'730.00');
});

test('rate selection uses all upstream collections and rejects invalid currencies, bases, rates and timestamps',()=>{
 const doc={accounts:[],positions:[],updates:[],positionUpdates:[],metadata:{onboarding:{displayCurrency:'CNY'}}};
 const dated={currency:'USD',rate:'7.2',baseCurrency:'CNY',asOf:'2026-01-03T00:00:00Z',sourceName:'dated upstream'};
 const upstream={accounts:[{id:'bridge-usd',amount:'100.00',currency:'USD'}],liabilities:[],portfolio:{rates:[]},valuation:{rates:[dated]}};
 for(const candidate of [
   {...dated,rate:'9',baseCurrency:'USD',asOf:'2026-01-04T00:00:00Z'},
   {...dated,rate:'9',asOf:'not-a-date'}, {...dated,rate:'9',asOf:'2026-02-30'}, {...dated,rate:'9',asOf:'2026-01-03T24:00:00Z'},
   {...dated,rate:'0',asOf:'2026-01-04'}, {...dated,rate:'-7',asOf:'2026-01-04'}, {...dated,rate:'9',asOf:null},
   {...dated,currency:'XYZ',rate:'9',asOf:'2026-01-04'},
 ])assert.equal(projectFinance(doc,{quotes:[],rates:[candidate]},upstream).valuation.assets,'720.00');
 const legacy=projectFinance(doc,{quotes:[],rates:[{currency:'USD',rate:'7'}]},{...upstream,valuation:{rates:[]}});assert.equal(legacy.valuation.assets,'700.00');assert.equal(legacy.valuation.asOf,null);
 const recovered=projectFinance(doc,{quotes:[],rates:[{...dated,asOf:'invalid',rate:'9'}]},{...upstream,valuation:{rates:[]},market:{rates:[dated]}});assert.equal(recovered.valuation.assets,'720.00','original upstream market rates survive a bad intermediate merge');
 const cny=projectFinance({...doc,metadata:{onboarding:{displayCurrency:'USD'}}},{quotes:[],rates:[dated,{currency:'CNY',baseCurrency:'CNY',rate:'2',asOf:'2026-01-04'}]},{accounts:[{id:'cny',amount:'720.00',currency:'CNY'}],liabilities:[]});assert.equal(cny.valuation.assets,'100.00');assert.equal(cny.market.rates.find(row=>row.currency==='CNY').rate,'1');
 const tied=projectFinance(doc,{quotes:[],rates:[{...dated,rate:'7.0',status:'stale'}]},upstream);assert.equal(tied.valuation.assets,'720.00');
});

test('native finance is isolated across original, personal and fictional spaces; demos never invoke providers or adapters',async t=>{
 let external=0;const fetchImpl=async()=>{external++;throw new Error('must not call');},f=await fixture(t,{financeOptions:{adapterOptions:{fetchImpl},appKeyOptions:{fetchImpl},oauthOptions:{fetchImpl},marketOptions:{fetchImpl}}});
 await f.api('finance/accounts',account());await f.api('spaces/personal',{});await f.api('spaces/demo-cn-v1',{});
 assert.equal((await f.api('spaces/personal/finance/state')).value.accounts.length,0);assert.equal((await f.api('spaces/demo-cn-v1/finance/state')).value.accounts.length,0);
 const demoDirectory=path.join(f.directory,'spaces','demo-cn-v1');writeFileSync(path.join(demoDirectory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
 assert.equal((await f.api('spaces/demo-cn-v1/finance/state')).status,200);
 assert.equal((await f.api('spaces/demo-cn-v1/finance/connections/moomoo/appkey/status')).value.connected,false);
 assert.equal((await f.api('spaces/demo-cn-v1/finance/connections/moomoo/start',{})).status,403);
 assert.equal((await f.api('spaces/demo-cn-v1/finance/market/refresh',{})).value.refreshed,false);assert.equal(external,0);
});

test('adapter sends only allowed methods to the exact configured loopback service and preserves native additions',async t=>{
 const calls=[],remote={revision:'remote-fixture',accounts:[{id:'upstream-account',name:'Imported example',amount:'20.00',currency:'USD',kind:'asset',asOf:'2026-01-01'}],liabilities:[],positions:{items:[],revision:'position-fixture'},market:{quotes:[],rates:[],issues:[],status:'idle'},portfolio:{accounts:[],holdings:[],rates:[]}};
 const f=await fixture(t,{financeOptions:{adapterOptions:{fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(remote),{headers:{'Content-Type':'application/json'}});}}}});
 const file=path.join(f.directory,'finance-adapter.json');writeFileSync(file,JSON.stringify({version:1,origin:'http://evil.example'}));assert.equal((await f.api('finance/state')).status,503);assert.equal(calls.length,0);
 writeFileSync(file,JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));assert.equal((await f.api('finance/state')).value.accounts[0].id,'upstream-account');
 const saved=await f.api('finance/accounts',account());assert.equal(saved.value.state.accounts.length,2);assert.equal(saved.value.state.source.mode,'local-adapter');
 assert.equal((await f.api('finance/connections/moomoo/place-order',{})).status,404);assert.ok(calls.every(call=>call.url==='http://127.0.0.1:59131/api/state'));assert.ok(calls.every(call=>call.options.redirect==='error'&&call.options.headers.Origin==='http://127.0.0.1:59131'));
 assert.equal((await f.api('finance/state',undefined,'GET',{'Origin':'https://evil.example'})).status,403);
 assert.equal((await f.api('finance/connections/moomoo/status')).value.canSync,false);const before=calls.length;assert.equal((await f.api('finance/connections/moomoo/sync',{})).status,409);assert.equal(calls.length,before);
});

test('position creation capabilities are derived by origin and do not disable existing adapter updates',async t=>{
 const calls=[],remote={revision:'bridge-fixture',accounts:[{id:'bridge-account',name:'Bridge account',kind:'asset',currency:'USD',amount:'20.00',asOf:'2026-01-01',readOnly:false,canAddPosition:true}],liabilities:[],positions:{items:[{id:'bridge-position',accountId:'bridge-account',name:'Bridge holding',kind:'stock',symbol:'US.EXAMPLE',currency:'USD',quantity:'1',costPrice:'5',recordedMarketValue:'10.00',asOf:'2026-01-01',editable:true,currentAccountBaseMarker:'bridge-base'}],revision:'bridge-position-fixture'},market:{quotes:[],rates:[],issues:[],status:'idle'},portfolio:{accounts:[],holdings:[],rates:[]}};
 const f=await fixture(t,{financeOptions:{adapterOptions:{fetchImpl:async(url,options)=>{
  const route=new URL(url).pathname,body=options.body?JSON.parse(options.body):undefined;calls.push({route,method:options.method,body});
  if(route==='/api/state')return new Response(JSON.stringify(remote),{headers:{'Content-Type':'application/json'}});
  if(route==='/api/updates'){remote.accounts[0].amount=body.amount;remote.revision='bridge-balance-updated';return new Response(JSON.stringify({update:{applied:true}}),{status:201});}
  if(route==='/api/positions/updates'){assert.equal(body.expectedRevision,'bridge-position-fixture');remote.positions.items[0].quantity=body.quantity;remote.positions.revision='bridge-position-updated';return new Response(JSON.stringify({update:{applied:true}}),{status:201});}
  throw new Error('Unexpected adapter route');
 }}}});
 writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
 const initial=(await f.api('finance/state')).value;assert.equal(initial.accounts[0].canAddPosition,false,'upstream permission flags cannot enable an absent route');assert.equal(initial.accounts[0].readOnly,false);assert.equal(initial.positions.items[0].editable,true);
 const newPosition={idempotencyKey:'bridge-create-denied',accountId:'bridge-account',name:'New holding',symbol:'US.EXAMPLE',kind:'stock',quantity:'1',costPrice:null,recordedMarketValue:'10',currency:'USD',asOf:'2026-01-01'};
 for(const extra of [{},{canAddPosition:true}]){const denied=await f.api('finance/positions',{...newPosition,...extra});assert.equal(denied.status,409);assert.equal(denied.value.code,'finance_position_create_unavailable');}
 assert.equal(calls.filter(call=>call.method==='POST').length,0,'rejected creation never writes to the adapter');assert.equal(f.app.finance.native.document().accounts.length,0,'bridge accounts are not copied into the native ledger');assert.equal(f.app.finance.native.document().positions.length,0);
 const a=(await f.api('finance/accounts',account())).value.accountId;assert.equal((await f.api('finance/state')).value.accounts.find(row=>row.id===a).canAddPosition,true);
 assert.equal((await f.api('finance/positions',{...newPosition,accountId:a,canAddPosition:true})).status,400,'client permission fields are rejected');
 assert.equal((await f.api('finance/accounts',account({idempotencyKey:'forged-account-capability',canAddPosition:true}))).status,400);
 const liability=await f.api('finance/accounts',account({idempotencyKey:'liability-capability',kind:'liability'}));assert.equal(liability.value.state.liabilities[0].canAddPosition,false);
 assert.equal((await f.api('finance/positions',{...newPosition,accountId:a})).status,201);
 const balance=await f.api('finance/updates',{idempotencyKey:'bridge-existing-balance',accountId:'bridge-account',kind:'asset',amount:'25.00',currency:'USD',asOf:'2026-01-02',note:'Reviewed balance'});assert.equal(balance.status,201);assert.equal(balance.value.state.accounts.find(row=>row.id==='bridge-account').amount,'25.00');
 const updated=await f.api('finance/positions/updates',{idempotencyKey:'bridge-existing-position',positionId:'bridge-position',accountId:'bridge-account',expectedRevision:balance.value.state.positions.revision,baseMarker:'bridge-base',quantity:'2',costPrice:'5',recordedMarketValue:'20.00',currency:'USD',asOf:'2026-01-02',note:'Reviewed position'});assert.equal(updated.status,201);assert.equal(updated.value.state.positions.items.find(row=>row.id==='bridge-position').quantity,'2');
 assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.route),['/api/updates','/api/positions/updates']);assert.equal(updated.value.state.accounts.find(row=>row.id==='bridge-account').canAddPosition,false);
});

test('adapter connector status uses a bodyless GET with real fetch and preserves JSON POST bodies',async t=>{
 const requests=[],upstream=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  requests.push({method:req.method,path:req.url,body:Buffer.concat(chunks).toString('utf8'),contentType:req.headers['content-type'],origin:req.headers.origin});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({provider:'moomoo',connected:true,configured:true,status:'connected'}));
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>upstream.close(resolve)));
 const origin=`http://127.0.0.1:${upstream.address().port}`,f=await fixture(t,{financeOptions:{adapterOptions:{allowedOrigins:[origin]}}});
 writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin}));
 for(const route of ['connections/moomoo/status','connections/moomoo/appkey/status']){const response=await f.api('finance/'+route);assert.equal(response.status,200);assert.equal(response.value.connected,true);}
 assert.equal(requests.length,2);assert.ok(requests.every(req=>req.method==='GET'&&req.body===''&&req.contentType===undefined&&req.origin===origin));
 const input={appKeyId:'fixture-appkey',privateKeyPem:'fixture-not-a-real-key'},configured=await f.api('finance/connections/moomoo/appkey/configure',input);assert.equal(configured.status,200);
 assert.equal(requests[2].method,'POST');assert.equal(requests[2].contentType,'application/json');assert.deepEqual(JSON.parse(requests[2].body),input);
});

test('native AppKey configure/preview/sync is independent, persisted, generic, and stale on failed reads',async t=>{
 let failed=false;const calls=[],fetchImpl=async(url,options)=>{calls.push(url);if(failed)return new Response('{}',{status:503});const u=new URL(url);let d;
  if(u.pathname.endsWith('authorized_trd_accs'))d={accounts:[{account_id:'1234567890123456',security_firm:'FUTUINC',acc_type:'margin'}]};
  else if(u.pathname.endsWith('/funds'))d={currency:'USD',total_assets:'98.76',cash:'10'};
  else d=[{code:'US.EXAMPLE',stock_name:'Example instrument',currency:'USD',qty:'2',market_val:'20',nominal_price:'10',cost_price:'7',cost_price_valid:true}];
  return new Response(JSON.stringify({s:'ok',d}));};
 const f=await fixture(t,{financeOptions:{appKeyOptions:{fetchImpl}}}),key=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 const configured=await f.api('finance/connections/moomoo/appkey/configure',{appKeyId:'fixture-key-id',privateKeyPem:key});assert.equal(configured.status,200);assert.equal(configured.value.connected,false);assert.equal(calls.length,0);
 await f.api('finance/connections/moomoo/appkey/preview',{currency:'USD'});assert.equal((await f.api('finance/state')).value.accounts.length,0,'preview never persists financial records');
 const synced=await f.api('finance/connections/moomoo/appkey/sync',{});assert.equal(synced.status,200);assert.equal(synced.value.persisted,true);assert.match(synced.value.accountId,/^finance-moomoo-/);assert.equal(synced.value.state.accounts[0].amount,'98.76');assert.equal(synced.value.state.positions.items[0].editable,false);
 assert.equal(synced.value.state.accounts[0].canAddPosition,false);assert.equal(synced.value.state.portfolio.holdings[0].valuationBasis,'official_api');assert.equal(synced.value.state.portfolio.holdings[0].marketValue,'20.00');assert.equal(synced.value.state.portfolio.holdings[0].price,'10');
 const denied=await f.api('finance/positions',{idempotencyKey:'official-position-fixture',accountId:synced.value.accountId,name:'Forged official holding',symbol:'US.EXAMPLE',kind:'stock',quantity:'1',costPrice:null,recordedMarketValue:'1',currency:'USD',asOf:'2026-01-01'});assert.equal(denied.status,409);assert.equal(denied.value.code,'finance_official_read_only');
 assert.doesNotMatch(JSON.stringify(synced.value),/1234567890123456|fixture-key-id|PRIVATE KEY/);
 const id=synced.value.accountId;await f.reopen();const restored=(await f.api('finance/state')).value;assert.equal(restored.accounts[0].id,id);assert.equal((await f.api('finance/connections/moomoo/appkey/status')).value.configured,true);
 const dir=path.join(f.directory,'finance','connections','moomoo-appkey');for(const name of readdirSync(dir)){assert.equal(statSync(path.join(dir,name)).mode&0o777,0o600);assert.ok(!readFileSync(path.join(dir,name),'utf8').includes(key));}
 failed=true;assert.equal((await f.api('finance/connections/moomoo/appkey/sync',{})).status,502);const stale=(await f.api('finance/state')).value;assert.equal(stale.accounts[0].amount,'98.76');assert.equal(stale.portfolio.estimated,false);assert.equal((await f.api('finance/connections/moomoo/appkey/status')).value.syncStatus,'stale');
});

test('native public quotes update estimates without double counting, persist as stale, and stop at a changed baseline',async t=>{
 const now=Date.parse('2026-01-03T12:00:00Z');let failed=false,calls=0;
 const fetchImpl=async url=>{calls++;if(failed)return new Response('{}',{status:503});const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));return new Response(JSON.stringify({chart:{error:null,result:[{meta:{symbol,currency:symbol==='CNY=X'?'CNY':'USD',regularMarketPrice:symbol==='CNY=X'?7:10,regularMarketTime:Date.parse('2026-01-02T12:00:00Z')/1000,marketState:'CLOSED',exchangeDataDelayedBy:0}}]}}));};
 const f=await fixture(t,{financeOptions:{now:()=>now,marketOptions:{fetchImpl,cooldownMs:0}}}),a=(await f.api('finance/accounts',account({amount:'100'}))).value.accountId;
 await f.api('finance/accounts',account({idempotencyKey:'cny-account-fixture',currency:'CNY',amount:'700'}));
 await f.api('finance/positions',{idempotencyKey:'quoted-position-fixture',accountId:a,name:'Example security',symbol:'EXAMPLE',exchange:'US',kind:'stock',quantity:'2',costPrice:'5',recordedMarketValue:'12',currency:'USD',asOf:'2026-01-01'});
 assert.equal(calls,0,'account and position records do not initiate background external calls');
 const saved=await f.api('finance/onboarding',{completed:true,displayCurrency:'USD',method:'manual'},'PUT');assert.equal(saved.status,200);assert.equal(calls,2);
 let state=saved.value.state;assert.equal(state.valuation.assets,'200.00');assert.equal(state.portfolio.summary.assets,'208.00');assert.equal(state.portfolio.holdings[0].marketValue,'20.00');assert.equal(state.portfolio.holdings[0].holdingPnl,'10.00');assert.equal(state.portfolio.holdings[0].holdingPnlPct,'100.00');assert.equal(state.portfolio.holdings[0].linkedToAccount,true);assert.equal(state.accounts.find(row=>row.id===a).amount,'100.00');
 await f.reopen();state=(await f.api('finance/state')).value;assert.equal(state.market.quotes[0].status,'stale');assert.equal(state.portfolio.summary.assets,'208.00');assert.equal(calls,2,'a restart only reads the saved public cache');
 failed=true;const retained=await f.api('finance/market/refresh',{});assert.equal(retained.status,200);assert.equal(retained.value.refreshed,false);assert.equal(retained.value.state.portfolio.holdings[0].marketValue,'20.00');assert.equal(retained.value.state.market.status,'degraded');
 const changed=await f.api('finance/updates',{idempotencyKey:'same-day-account-change',accountId:a,kind:'asset',amount:'110',currency:'USD',asOf:'2026-01-01',note:'New statement balance'});state=changed.value.state;
 assert.equal(state.portfolio.summary.assets,'210.00');assert.equal(state.portfolio.summary.complete,false);assert.equal(state.portfolio.holdings[0].linkedToAccount,false);assert.deepEqual(state.positions.reconciliationRequiredAccounts,[a]);
 const p=state.positions.items[0],reconciled=await f.api('finance/positions/updates',{idempotencyKey:'later-position-baseline',positionId:p.id,accountId:a,expectedRevision:state.positions.revision,baseMarker:p.currentAccountBaseMarker,quantity:'2',costPrice:'5',recordedMarketValue:'24',currency:'USD',asOf:'2026-01-03',note:'Newer statement',accountBalance:{amount:'120',currency:'USD',asOf:'2026-01-03'}});
 assert.equal(reconciled.status,201);assert.equal(reconciled.value.state.portfolio.holdings[0].marketValue,null,'an older quote cannot overwrite a newer observation');assert.equal(reconciled.value.state.portfolio.summary.assets,'220.00');
});

test('SSE starts public refresh only while a finance view is connected and closing removes refresh timers',async t=>{
 let calls=0;const now=Date.parse('2026-01-03T12:00:00Z'),fetchImpl=async url=>{calls++;const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));return new Response(JSON.stringify({chart:{error:null,result:[{meta:{symbol,currency:'CNY',regularMarketPrice:7,regularMarketTime:now/1000,marketState:'REGULAR',exchangeDataDelayedBy:0}}]}}));};
 const f=await fixture(t,{financeOptions:{now:()=>now,marketOptions:{fetchImpl,cooldownMs:0},marketRefreshIntervalMs:20}});
 await f.api('finance/onboarding',{completed:true,displayCurrency:'CNY',method:'manual'},'PUT');await f.api('finance/accounts',account());assert.equal(calls,0);
 const controller=new AbortController(),response=await fetch(`http://127.0.0.1:${f.app.server.address().port}/api/finance/events`,{signal:controller.signal}),reader=response.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: state/);
 const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('condition did not settle');};
 await waitFor(()=>calls>0);controller.abort();await reader.cancel().catch(()=>{});await waitFor(()=>!f.app.finance.clients.size);await new Promise(resolve=>setTimeout(resolve,30));const stopped=calls;await new Promise(resolve=>setTimeout(resolve,50));assert.equal(calls,stopped);assert.equal(f.app.finance.marketTimer,null);await f.app.close();
});

test('native manual holdings added beside a local adapter receive quotes without sending native records to the adapter',async t=>{
 const now=Date.parse('2026-01-03T12:00:00Z'),bridgeCalls=[],remote={revision:'remote-fixture',accounts:[],liabilities:[],positions:{items:[],revision:'position-fixture'},market:{revision:'remote-market',status:'ready',quotes:[{id:'old-example',kind:'stock',symbol:'EXAMPLE',currency:'USD',price:'9',asOf:'2026-01-02T12:00:00Z',status:'closed'}],rates:[],issues:[]},portfolio:{accounts:[],holdings:[],rates:[]}};
 const f=await fixture(t,{financeOptions:{now:()=>now,adapterOptions:{fetchImpl:async(url,options)=>{bridgeCalls.push({url,options});return new Response(JSON.stringify(url.endsWith('/refresh')?{refreshed:true}:remote),{headers:{'Content-Type':'application/json'}});}},marketOptions:{cooldownMs:0,fetchImpl:async url=>{const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));return new Response(JSON.stringify({chart:{error:null,result:[{meta:{symbol,currency:symbol==='CNY=X'?'CNY':'USD',regularMarketPrice:symbol==='CNY=X'?7:12,regularMarketTime:now/1000,marketState:'REGULAR',exchangeDataDelayedBy:0}}]}}));}}}});
 writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
 const id=(await f.api('finance/accounts',account({amount:'100'}))).value.accountId;
 await f.api('finance/positions',{idempotencyKey:'native-bridge-position',accountId:id,name:'Local example',symbol:'EXAMPLE',exchange:'US',kind:'stock',quantity:'2',costPrice:'5',recordedMarketValue:'20',currency:'USD',asOf:'2026-01-01'});
 await f.api('finance/onboarding',{completed:true,displayCurrency:'USD',method:'manual'},'PUT');
 const result=await f.api('finance/market/refresh',{});assert.equal(result.status,200);assert.equal(result.value.state.portfolio.summary.assets,'104.00');assert.equal(result.value.state.market.quotes.filter(row=>row.symbol==='EXAMPLE').length,1);assert.equal(result.value.state.portfolio.holdings[0].marketValue,'24.00');
 assert.ok(bridgeCalls.every(call=>call.url.endsWith('/state')||call.url.endsWith('/market/refresh')));assert.ok(bridgeCalls.every(call=>!call.options.body||call.options.body==='{}'));
});

test('OAuth callback admits only the dedicated navigation route and binds authorization to the originating space',async t=>{
 const calls=[],fetchImpl=async(url,options)=>{calls.push({url,options});if(url.endsWith('/register'))return new Response(JSON.stringify({client_id:'fixture-client',pkce_required:true,registration_access_token:'fixture-registration'}));if(url.endsWith('/token'))return new Response(JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',scope:'trade:read accid:123456789012345678',token_type:'Bearer',expires_in:7200}));throw new Error('Unexpected provider request');};
 const f=await fixture(t,{financeOptions:{oauthOptions:{fetchImpl}}});await f.api('spaces/personal',{});
 const started=await f.api('spaces/personal/finance/connections/moomoo/start',{});assert.equal(started.status,200);const authorization=new URL(started.value.authorizationUrl),state=authorization.searchParams.get('state');
 assert.equal(authorization.searchParams.get('redirect_uri'),`http://127.0.0.1:${f.app.server.address().port}/api/spaces/personal/finance/connections/moomoo/callback`);
 const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document','Origin':'https://webapi.moomoo.com'};
 const navigate=route=>new Promise((resolve,reject)=>{httpGet(`http://127.0.0.1:${f.app.server.address().port}/api/${route}`,{headers:navigation},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,value:Buffer.concat(chunks).toString('utf8')}));}).on('error',reject);});
 assert.equal((await f.api('spaces/personal/finance/state',undefined,'GET',navigation)).status,403);
 assert.equal((await f.api(`spaces/personal/finance/connections/moomoo/callback?code=fixture-code&state=${state}`,undefined,'GET',{'Sec-Fetch-Site':'cross-site'})).status,403);
 const callback=await navigate(`spaces/personal/finance/connections/moomoo/callback?code=fixture-code&state=${state}`);assert.equal(callback.status,200);assert.match(callback.value,/location\.replace\("\/\?space=personal#settings\/connectors"\)/);assert.doesNotMatch(callback.value,/fixture-code|fixture-access|fixture-refresh|fixture-registration/);
 const status=(await f.api('spaces/personal/finance/connections/moomoo/status')).value;assert.equal(status.connected,true);assert.equal(status.canSync,true);assert.equal((await f.api('finance/connections/moomoo/status')).value.connected,false);assert.equal(calls.filter(call=>call.url.endsWith('/token')).length,1);
 assert.equal((await f.api('spaces/personal/finance/connections/moomoo/extra/status')).status,404);
 assert.equal((await navigate(`spaces/personal/finance/connections/moomoo/callback?code=again&state=${state}&state=${state}`)).status,400);
 assert.equal(calls.filter(call=>call.url.endsWith('/token')).length,1);
});

test('archived accounts leave current totals and holdings, remain recoverable across restart',async t=>{
 const f=await fixture(t),created=(await f.api('finance/accounts',account({currency:'CNY',amount:'100.00'}))).value,id=created.accountId;
 await f.api('finance/positions',{idempotencyKey:'archive-position-example',accountId:id,name:'Example unit',symbol:'',kind:'fund',quantity:'1',recordedMarketValue:'100',currency:'CNY',asOf:'2026-01-01'});
 const archived=await f.api('finance/accounts/archive',{accountId:id,archived:true},'PUT');
 assert.equal(archived.status,200);assert.equal(archived.value.state.accounts.length,0);assert.equal(archived.value.state.positions.items.length,0);assert.equal(archived.value.state.valuation.assets,'0.00');assert.equal(archived.value.state.archivedAccounts[0].amount,'100.00');
 await f.reopen();assert.equal((await f.api('finance/state')).value.archivedAccounts[0].id,id);
 const restored=await f.api('finance/accounts/archive',{accountId:id,archived:false},'PUT');assert.equal(restored.value.state.accounts[0].amount,'100.00');assert.equal(restored.value.state.positions.items.length,1);
 assert.equal((await f.api('finance/accounts/archive',{accountId:'unknown',archived:true},'PUT')).status,404);
});

test('archiving adapter accounts persists locally without changing source observations',async t=>{
 const upstream={revision:1,accounts:[{id:'external-zero',kind:'asset',name:'Example unused card',amount:'0.00',currency:'CNY',asOf:'2026-01-01'},{id:'external-active',kind:'asset',name:'Example savings',amount:'250.00',currency:'CNY',asOf:'2026-01-01'}],liabilities:[],positions:{items:[]},valuation:{rates:[]}};
 const original=structuredClone(upstream),f=await fixture(t,{financeOptions:{adapterOptions:{fetchImpl:async()=>new Response(JSON.stringify(upstream),{headers:{'content-type':'application/json'}})}}});
 writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
 const hidden=await f.api('finance/accounts/archive',{accountId:'external-zero',archived:true},'PUT');assert.equal(hidden.status,200);assert.deepEqual(hidden.value.state.accounts.map(row=>row.id),['external-active']);assert.equal(hidden.value.state.valuation.assets,'250.00');
 assert.deepEqual(upstream,original);await f.reopen();assert.equal((await f.api('finance/state')).value.archivedAccounts[0].id,'external-zero');
 assert.equal((await f.api('finance/accounts/archive',{accountId:'external-zero',archived:false},'PUT')).value.state.accounts.length,2);
});
