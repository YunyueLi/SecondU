import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';

const NOW=Date.parse('2026-10-24T06:00:00Z');
const snapshot=(extra={})=>({provider:'snaptrade',readOnly:true,complete:true,environment:'production',fetchedAt:'2026-10-24T06:00:00Z',accounts:[{accountRef:'fictional-raw-account',name:'Example brokerage',kind:'asset',assetType:'investment',amount:'1200.12',currency:'USD',asOf:'2026-10-23T18:00:00Z',sourceName:'Example official API'}],positions:[{positionRef:'fictional-raw-position',accountRef:'fictional-raw-account',name:'Example holding',symbol:'EXAMPLE',kind:'stock',currency:'USD',quantity:'2',costPrice:'10',marketPrice:'12.01',marketValue:'24.02',asOf:'2026-10-23T18:00:00Z',exchange:'US'}],transactions:[],transactionMode:'none',...extra});
async function fixture(t,{now=()=>NOW,readSnapshot=async()=>snapshot(),...options}={}){
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-provider-'));let app;
 const open=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},financeOptions:{now,providerOptions:{readSnapshot,...options}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};await open();
 const api=async(route,body,method=body===undefined?'GET':'POST',headers={})=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/finance/${route}`,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 return {get app(){return app;},directory,api,async reopen(){await app.close();await open();}};
}
const config={clientId:'example-personal-client',consumerKey:'fictional-consumer-key-only-for-tests'};

test('provider status is local; credentials are encrypted; preview is isolated and sync stays official',async t=>{
 let reads=0;const f=await fixture(t,{readSnapshot:async()=>{reads++;return snapshot();}});
 const initial=await f.api('connections');assert.equal(initial.status,200);assert.equal(initial.value.providers.length,5);assert.equal(reads,0);
 const saved=await f.api('connections/snaptrade/configure',config);assert.equal(saved.status,200);assert.equal(saved.value.configured,true);assert.equal(saved.value.connected,false);assert.equal(JSON.stringify(saved).includes(config.consumerKey),false);assert.equal(reads,0);
 const credentialFile=path.join(f.directory,'finance/connections/snaptrade/credentials.enc');assert.equal(readFileSync(credentialFile,'utf8').includes(config.consumerKey),false);assert.equal(statSync(credentialFile).mode&0o777,0o600);
 const before=(await f.api('state')).value,preview=(await f.api('connections/snaptrade/preview',{})).value;
 assert.equal(reads,1);assert.equal(preview.accounts.length,1);assert.equal(JSON.stringify(preview).includes('fictional-raw-account'),false);assert.equal((await f.api('state')).value.revision,before.revision);
 assert.equal((await f.api('connections/snaptrade/sync',{previewId:'forged',accountRefs:[preview.accounts[0].accountRef]})).status,409);
 const input={previewId:preview.previewId,accountRefs:[preview.accounts[0].accountRef]},synced=await f.api('connections/snaptrade/sync',input);
 assert.equal(synced.status,200);assert.equal(synced.value.state.accounts[0].amount,'1200.12');assert.equal(synced.value.state.accounts[0].readOnly,true);assert.equal(synced.value.state.portfolio.holdings[0].marketValue,'24.02');assert.equal(synced.value.state.portfolio.holdings[0].sourceName,'Example official API');assert.equal(synced.value.state.portfolio.accounts[0].estimatedAmount,'1200.12','provider net worth must not add positions twice');
 const replay=await f.api('connections/snaptrade/sync',input);assert.equal(replay.value.replayed,true);assert.equal(replay.value.state.accounts.length,1);
 await f.reopen();assert.equal((await f.api('state')).value.accounts.length,1);assert.equal((await f.api('connections/snaptrade/status')).value.configured,true);assert.equal(reads,1);
});

test('only selected accounts sync, mapped manual accounts retain identity, invalid mappings roll back',async t=>{
 const f=await fixture(t,{readSnapshot:async()=>snapshot({accounts:[...snapshot().accounts,{...snapshot().accounts[0],accountRef:'another',name:'Another account'}]})});
 const created=await f.api('accounts',{idempotencyKey:'example-manual-account',name:'Reviewed manual brokerage',kind:'asset',assetType:'investment',amount:'1000',currency:'USD',asOf:'2026-10-22'}),id=created.value.accountId;
 await f.api('connections/snaptrade/configure',config);const preview=(await f.api('connections/snaptrade/preview',{})).value,ref=preview.accounts[0].accountRef;
 const invalid=await f.api('connections/snaptrade/sync',{previewId:preview.previewId,accountRefs:[ref],mappings:{[ref]:'other-space'}});assert.equal(invalid.status,404);assert.equal((await f.api('state')).value.accounts[0].amount,'1000.00');
 const synced=await f.api('connections/snaptrade/sync',{previewId:preview.previewId,accountRefs:[ref],mappings:{[ref]:id}});assert.equal(synced.status,200);assert.equal(synced.value.state.accounts.length,1);assert.equal(synced.value.state.accounts[0].id,id);assert.equal(synced.value.state.updates.at(-1).previousProvider,'manual');
 const other=(await f.api('accounts',{idempotencyKey:'another-local-manual',name:'Different manual account',kind:'asset',assetType:'investment',amount:'20',currency:'USD',asOf:'2026-10-22'})).value.accountId;
 const reread=(await f.api('connections/snaptrade/preview',{})).value;assert.equal((await f.api('connections/snaptrade/sync',{previewId:reread.previewId,accountRefs:[ref],mappings:{[ref]:other}})).status,409,'a stable provider source cannot duplicate into another account');
 assert.equal((await f.api('state')).value.accounts.filter(row=>row.provider==='snaptrade').length,1);
});

test('sandbox, incomplete responses, outdated reports and expired previews cannot overwrite balances',async t=>{
 let time=NOW,current=snapshot();const f=await fixture(t,{now:()=>time,readSnapshot:async()=>current});
 await f.api('connections/snaptrade/configure',config);
 const preview=(await f.api('connections/snaptrade/preview',{})).value;time+=600001;assert.equal((await f.api('connections/snaptrade/sync',{previewId:preview.previewId,accountRefs:[preview.accounts[0].accountRef]})).status,409);
 current=snapshot({environment:'sandbox'});const sandbox=(await f.api('connections/snaptrade/preview',{})).value;assert.equal(sandbox.canSync,false);assert.equal((await f.api('connections/snaptrade/sync',{previewId:sandbox.previewId,accountRefs:[sandbox.accounts[0].accountRef]})).status,409);
 current=snapshot({complete:false});assert.equal((await f.api('connections/snaptrade/preview',{})).status,502);assert.equal((await f.api('state')).value.accounts.length,0);
});

test('failed provider reads keep previous data stale, and disconnect preserves history',async t=>{
 let broken=false;const f=await fixture(t,{readSnapshot:async()=>{if(broken)throw new Error('network error containing fictional-consumer-key-only-for-tests');return snapshot();}});
 await f.api('connections/snaptrade/configure',config);const preview=(await f.api('connections/snaptrade/preview',{})).value;await f.api('connections/snaptrade/sync',{previewId:preview.previewId,accountRefs:[preview.accounts[0].accountRef]});
 broken=true;const failure=await f.api('connections/snaptrade/preview',{});assert.equal(failure.status,503);assert.equal(JSON.stringify(failure).includes(config.consumerKey),false);
 const status=(await f.api('connections/snaptrade/status')).value;assert.equal(JSON.stringify(status).includes(config.consumerKey),false);assert.equal(status.connected,false);assert.equal((await f.api('state')).value.accounts[0].readStatus,'stale');
 await f.api('connections/snaptrade/disconnect',{});assert.equal((await f.api('state')).value.accounts[0].amount,'1200.12');assert.equal((await f.api('connections/snaptrade/status')).value.configured,false);
});

test('authorization nonces are local, wrong callbacks cannot exchange credentials, no cross-origin mutations',async t=>{
 let exchanges=0;const f=await fixture(t,{bankStart:async()=>({public:{kind:'hosted_link',authorizationUrl:'https://secure.plaid.com/hl/example'},private:{linkToken:'fictional-link-token'}}),bankComplete:async(id,config)=>{exchanges++;return {...config,authorization:{providerId:id,environment:'sandbox',accessToken:'fictional-access-token'}};}});
 await f.api('connections/plaid/configure',{environment:'sandbox',clientId:'example-client',secret:'example-secret',countryCodes:'US',products:'transactions'});
 const started=(await f.api('connections/plaid/start',{})).value;assert.equal(JSON.stringify(started).includes('fictional-link-token'),false);
 assert.equal((await f.api('connections/plaid/complete',{state:'wrong'})).status,400);assert.equal(exchanges,0);
 assert.equal((await f.api('connections/plaid/complete',{state:started.state})).status,200);assert.equal(exchanges,1);
 assert.equal((await f.api('connections/plaid/complete',{state:started.state})).status,400);
 assert.equal((await f.api('connections/snaptrade/configure',config,'POST',{Origin:'https://unrelated.example'})).status,403);
});

test('reauthorized accounts require review and can reconnect their local identity without duplicate assets',async t=>{
 let time=NOW,ref='first-item-account';
 const f=await fixture(t,{now:()=>time,readSnapshot:async()=>snapshot({fetchedAt:new Date(time).toISOString(),accounts:[{...snapshot().accounts[0],accountRef:ref}],positions:[],transactions:[{transactionRef:'coffee-'+ref,accountRef:ref,occurredOn:'2026-10-23',kind:'expense',amount:'12.50',currency:'USD',merchant:'Example coffee'}],transactionMode:'snapshot',transactionRange:{from:'2026-10-01',to:'2026-10-24'}})});
 const read=async()=> (await f.api('connections/snaptrade/preview',{})).value;
 const sync=async(preview,extra={})=>f.api('connections/snaptrade/sync',{previewId:preview.previewId,accountRefs:preview.accounts.map(row=>row.accountRef),...extra});
 await f.api('connections/snaptrade/configure',config);let preview=await read(),result=await sync(preview);assert.equal(result.status,200);const id=result.value.state.accounts[0].id;
 time+=1000;ref='replacement-item-account';await f.api('connections/snaptrade/configure',config);assert.equal((await f.api('state')).value.accounts[0].readStatus,'stale');
 preview=await read();assert.deepEqual(preview.previousAccounts.map(row=>row.id),[id]);
 assert.equal((await sync(preview)).status,409,'old balances must be explicitly reviewed');
 result=await sync(preview,{mappings:{[preview.accounts[0].accountRef]:id}});assert.equal(result.status,200);assert.equal(result.value.state.accounts.length,1);assert.equal(result.value.state.accounts[0].id,id);
 const records=await f.api('state');assert.equal(records.status,200);assert.equal(records.value.journal.transactions.filter(row=>!row.archived).length,1,'reauthorized source keys cannot count the same time range twice');assert.equal(records.value.journal.transactions.filter(row=>row.archived).length,1,'withdrawn history is retained');
 time+=1000;ref='first-item-account';await f.api('connections/snaptrade/configure',config);preview=await read();
 assert.equal((await sync(preview,{accountDecisions:{[id]:'archive'}})).status,409,'an existing transaction source cannot be moved into a different local account');assert.equal((await f.api('state')).value.accounts.length,1,'failed source reuse cannot archive the active account');
 assert.equal((await sync(preview,{mappings:{[preview.accounts[0].accountRef]:id}})).status,409,'a retired source cannot restore superseded transactions');
 time+=1000;ref='third-item-account';await f.api('connections/snaptrade/configure',config);preview=await read();
 result=await sync(preview,{accountDecisions:{[id]:'archive'}});assert.equal(result.status,200);assert.equal(result.value.state.accounts.length,1);assert.notEqual(result.value.state.accounts[0].id,id);
 const currentId=result.value.state.accounts[0].id;time+=1000;ref='additional-account';await f.api('connections/snaptrade/configure',config);preview=await read();
 result=await sync(preview,{accountDecisions:{[currentId]:'retain'}});assert.equal(result.status,200);assert.equal(result.value.state.accounts.length,2);assert.equal(result.value.state.accounts.find(row=>row.id===currentId).readStatus,'stale');
 assert.equal((await f.api('connections/snaptrade/status')).value.syncStatus,'stale');
});

test('TrueLayer uses a fixed landing URL; only a nonce-checked POST can complete authorization',async t=>{
 let completed=0;const redirects=[];
 const f=await fixture(t,{bankStart:async(id,config,{redirectUri})=>{redirects.push(redirectUri);return {public:{kind:'redirect',authorizationUrl:'https://app.truelayer.com/connect/example'},private:{connectionId:'server-retained-example'}};},bankComplete:async(id,config)=>{completed++;return {...config,authorization:{providerId:id,environment:'sandbox',connectionId:'server-retained-example'}};}});
 await f.api('connections/truelayer/configure',{environment:'sandbox',clientId:'example',clientSecret:'example-secret',countries:'GB',userName:'Fictional Person',userEmail:'example@example.test'});
 const first=(await f.api('connections/truelayer/start',{})).value;
 const status=(await f.api('connections/truelayer/status')).value;assert.equal(redirects[0],status.callbackUrl);assert.equal(new URL(redirects[0]).search,'');
 await f.app.finance.providers.callback('truelayer',new URLSearchParams('connection_id=forged&state=forged'));assert.equal(completed,0);
 assert.equal((await f.api('connections/truelayer/complete',{state:'forged'})).status,400);assert.equal(completed,0);
 assert.equal((await f.api('connections/truelayer/complete',{state:first.state})).status,200);assert.equal(completed,1);
 const second=(await f.api('connections/truelayer/start',{})).value;assert.equal(redirects[1],redirects[0]);assert.notEqual(second.state,first.state);
});
