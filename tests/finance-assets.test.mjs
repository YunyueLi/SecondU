import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {ASSET_TYPES,LIABILITY_TYPES,POSITION_TYPES,accountTypeOf,accountTypeLabel,ownedAssetValue} from '../shared/asset-taxonomy.mjs';
import {withAccountProfile} from '../server/finance/asset-profile.mjs';

async function fixture(t,financeOptions={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-asset-types-'));let app;
  const open=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},financeOptions:{now:()=>Date.parse('2026-10-24T12:00:00Z'),...financeOptions}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};
  await open();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
  return {directory,api,get app(){return app;},async reopen(){await app.close();await open();}};
}
const account=(id,extra={})=>({idempotencyKey:`asset-fixture-${id}`,name:`Example ${id}`,kind:'asset',amount:'100.00',currency:'CNY',asOf:'2026-10-20',...extra});
const details=(extra={})=>({totalValue:'100.00',ownershipPercent:'100',acquiredAmount:null,acquiredOn:null,valuationSource:'Example appraisal',valuationAsOf:'2026-10-20',linkedLiabilityIds:[],...extra});

test('shared taxonomy covers assets, liabilities and holdings without guessing legacy classifications',()=>{
  assert.deepEqual(ASSET_TYPES.map(row=>row.value),['cash','investment','real_estate','vehicle','valuable','insurance','receivable','business','other']);
  assert.deepEqual(LIABILITY_TYPES.map(row=>row.value),['credit_card','mortgage','vehicle_loan','personal_loan','other']);
  assert.deepEqual(POSITION_TYPES.map(row=>row.value),['stock','etf','fund','bond','gold','crypto','cash','option','futures','other']);
  assert.equal(accountTypeOf({kind:'asset',name:'Example savings',category:'cash'}),'other');
  assert.equal(accountTypeLabel({kind:'asset'}),'待分类资产');assert.equal(accountTypeLabel({kind:'liability'}),'待分类负债');
  assert.equal(accountTypeOf({kind:'asset',provider:'moomoo'}),'investment');
  assert.equal(accountTypeOf({kind:'asset',provider:'moomoo',assetType:'cash'}),'cash');
  assert.equal(ownedAssetValue('1000000.01','33.333333'),'333333.33');
  assert.equal(ownedAssetValue('999999999999999.99','50'),'500000000000000.00');
  assert.equal(ownedAssetValue('0.01','50'),'0.01');assert.equal(ownedAssetValue('0.01','49.999999'),'0.00');
  for(const share of ['0','100.000001','-1','NaN','1e2','0.0000001'])assert.equal(ownedAssetValue('100',share),null);
});

test('property ownership and an existing mortgage persist independently and count each amount once',async t=>{
  const f=await fixture(t),loan=await f.api('finance/accounts',account('mortgage',{kind:'liability',liabilityType:'mortgage',amount:'200000.00'}));
  const created=await f.api('finance/accounts',account('property',{assetType:'real_estate',amount:'333333.33',assetDetails:details({totalValue:'1000000.01',ownershipPercent:'33.333333',acquiredAmount:'900000.00',acquiredOn:'2020-01-01',linkedLiabilityIds:[loan.value.accountId]})}));
  assert.equal(created.status,201);const row=created.value.state.accounts[0];
  assert.equal(row.assetType,'real_estate');assert.equal(row.canAddPosition,false);assert.equal(row.canEditAssetDetails,true);
  assert.equal(row.amount,'333333.33');assert.equal(row.assetDetails.valueBasis,'market_value');
  assert.equal(created.value.state.valuation.assets,'333333.33');assert.equal(created.value.state.valuation.liabilities,'200000.00');assert.equal(created.value.state.valuation.net,'133333.33');
  await f.reopen();const restored=(await f.api('finance/state')).value;
  assert.equal(restored.accounts.length,1);assert.equal(restored.liabilities.length,1);assert.deepEqual(restored.accounts[0].assetDetails,row.assetDetails);assert.equal(restored.accounts[0].accountRevision,row.accountRevision);
  const update={idempotencyKey:'property-value-update',accountId:row.id,kind:'asset',amount:'555555.56',currency:'CNY',asOf:'2026-10-21',note:'Example valuation reviewed',expectedAccountRevision:row.accountRevision,assetType:'real_estate',assetDetails:details({totalValue:'1111111.11',ownershipPercent:'50',valuationAsOf:'2026-10-21',linkedLiabilityIds:[loan.value.accountId]})};
  const changed=await f.api('finance/updates',update);assert.equal(changed.status,201);assert.equal(changed.value.state.valuation.net,'355555.56');assert.equal(changed.value.state.liabilities[0].amount,'200000.00');
  assert.equal((await f.api('finance/updates',update)).value.replayed,true);
  assert.equal((await f.api('finance/updates',{...update,idempotencyKey:'stale-property-update'})).status,409);
  assert.equal((await f.api('finance/updates',{...update,idempotencyKey:'missing-property-version',expectedAccountRevision:undefined})).value.code,'finance_account_revision_required');
  assert.equal((await f.api('finance/updates',{...update,idempotencyKey:'missing-property-details',expectedAccountRevision:changed.value.state.accounts[0].accountRevision,assetDetails:undefined})).status,400);
  assert.equal((await f.api('finance/state')).value.accounts[0].amount,'555555.56');
});

test('fixed asset validation rejects mismatched values, dates, duplicate debt and cross-space debt',async t=>{
  const f=await fixture(t),loan=(await f.api('finance/accounts',account('debt',{kind:'liability',liabilityType:'personal_loan'}))).value.accountId;
  const candidates=[
    account('wrong-value',{assetType:'vehicle',amount:'99.00',assetDetails:details()}),
    account('wrong-date',{assetType:'vehicle',assetDetails:details({valuationAsOf:'2026-10-19'})}),
    account('duplicate-debt',{assetType:'vehicle',assetDetails:details({linkedLiabilityIds:[loan,loan]})}),
    account('unknown-debt',{assetType:'vehicle',assetDetails:details({linkedLiabilityIds:['another-space-debt']})}),
    account('later-acquisition',{assetType:'vehicle',assetDetails:details({acquiredOn:'2026-10-21'})}),
    account('wrong-kind',{assetType:'cash',liabilityType:'mortgage'}),
    account('missing-details',{assetType:'vehicle'}),
  ];
  for(const candidate of candidates){const response=await f.api('finance/accounts',candidate);assert.ok([400,404,409].includes(response.status),JSON.stringify(response));}
  await f.api('spaces/personal',{});
  const cross=await f.api('spaces/personal/finance/accounts',account('cross-space-property',{assetType:'real_estate',assetDetails:details({linkedLiabilityIds:[loan]})}));
  assert.equal(cross.status,404);assert.equal(cross.value.code,'finance_liability_not_found');
  assert.equal((await f.api('spaces/personal/finance/state')).value.accounts.length,0);
  assert.equal((await f.api('finance/state')).value.accounts.length,0);
});

test('insurance accepts cash value only and never adds an insurance coverage amount',async t=>{
  const f=await fixture(t);
  const bad=await f.api('finance/accounts',account('coverage',{assetType:'insurance',assetDetails:details({coverageAmount:'1000000.00'})}));assert.equal(bad.status,400);
  const wrongBasis=await f.api('finance/accounts',account('wrong-basis',{assetType:'insurance',assetDetails:details({valueBasis:'market_value'})}));assert.equal(wrongBasis.status,400);
  const saved=await f.api('finance/accounts',account('insurance',{assetType:'insurance',amount:'2500.00',assetDetails:details({totalValue:'5000.00',ownershipPercent:'50',valuationSource:'Example policy cash value statement',valueBasis:'cash_value'})}));
  assert.equal(saved.status,201);assert.equal(saved.value.state.accounts[0].assetDetails.valueBasis,'cash_value');assert.equal(saved.value.state.valuation.assets,'2500.00');
});

test('all explicit manual asset and liability types persist and new holding kinds do not inflate balances',async t=>{
  const f=await fixture(t);
  for(const type of ASSET_TYPES){const valued=['real_estate','vehicle','valuable','insurance','receivable','business'].includes(type.value),result=await f.api('finance/accounts',account(type.value,{assetType:type.value,...(valued?{assetDetails:details()}:{} )}));assert.equal(result.status,201,type.value);assert.equal(result.value.state.accounts.find(row=>row.id===result.value.accountId).assetType,type.value);}
  for(const type of LIABILITY_TYPES){const result=await f.api('finance/accounts',account(`debt-${type.value}`,{kind:'liability',liabilityType:type.value}));assert.equal(result.status,201,type.value);}
  let state=(await f.api('finance/state')).value,investment=state.accounts.find(row=>row.assetType==='investment');
  for(const type of POSITION_TYPES){const result=await f.api('finance/positions',{idempotencyKey:`holding-kind-${type.value}`,accountId:investment.id,name:`Example ${type.value}`,kind:type.value,quantity:'0.123456789012345678',costPrice:null,recordedMarketValue:'1.00',currency:'CNY',asOf:'2026-10-20'});assert.equal(result.status,201,type.value);}
  state=(await f.api('finance/state')).value;assert.equal(state.positions.items.length,10);assert.equal(state.valuation.assets,'900.00');assert.equal(state.valuation.liabilities,'500.00');assert.equal(state.valuation.net,'400.00');
  await f.reopen();state=(await f.api('finance/state')).value;assert.equal(state.positions.items.length,10);assert.equal(state.accounts.find(row=>row.id===investment.id).amount,'100.00');
});

test('profile changes require an account revision and leave investment observation baselines intact',async t=>{
  const f=await fixture(t),created=await f.api('finance/accounts',account('legacy'));
  const position=await f.api('finance/positions',{idempotencyKey:'profile-position-fixture',accountId:created.value.accountId,name:'Example stock',kind:'stock',quantity:'1',recordedMarketValue:'10.00',currency:'CNY',asOf:'2026-10-20'});
  const old=position.value.state.accounts[0],marker=position.value.state.positions.items[0].currentAccountBaseMarker;
  assert.equal(accountTypeLabel(old),'待分类资产');
  const payload={idempotencyKey:'profile-classification',accountId:old.id,expectedAccountRevision:old.accountRevision,name:'Example investment account',description:'Reviewed local classification',assetType:'investment'};
  const saved=await f.api('finance/accounts/profile',payload,'PUT');assert.equal(saved.status,201);assert.equal(saved.value.state.accounts[0].assetType,'investment');
  assert.equal(saved.value.state.accounts[0].amount,old.amount);assert.equal(saved.value.state.accounts[0].updatedAt,old.updatedAt);assert.equal(saved.value.state.positions.items[0].currentAccountBaseMarker,marker);assert.equal(saved.value.state.positions.revision,position.value.state.positions.revision);
  assert.equal((await f.api('finance/accounts/profile',payload,'PUT')).value.replayed,true);
  assert.equal((await f.api('finance/accounts/profile',{...payload,idempotencyKey:'profile-stale-write'},'PUT')).status,409);
  assert.equal((await f.api('finance/accounts/profile',{...payload,idempotencyKey:'profile-cannot-be-property',expectedAccountRevision:saved.value.state.accounts[0].accountRevision,assetType:'real_estate',assetDetails:details()},'PUT')).value.code,'finance_asset_has_positions');
});

test('local profiles for source accounts survive restart without copying or writing the source ledger',async t=>{
  const remote={revision:'source-1',accounts:[{id:'source-asset',name:'Source account',kind:'asset',currency:'CNY',amount:'200.00',asOf:'2026-10-20',readOnly:true}],liabilities:[],positions:{items:[],revision:'source-positions'},portfolio:{accounts:[],holdings:[],rates:[]},market:{quotes:[],rates:[],issues:[]}},calls=[];
  const f=await fixture(t,{adapterOptions:{fetchImpl:async(url,options)=>{calls.push({url,method:options.method});assert.equal(options.method,'GET');return new Response(JSON.stringify(remote),{headers:{'Content-Type':'application/json'}});}}});
  writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
  const initial=(await f.api('finance/state')).value.accounts[0];
  const payload={idempotencyKey:'source-local-profile',accountId:initial.id,expectedAccountRevision:initial.accountRevision,name:'Reviewed source account',description:'Local category only',assetType:'cash'};
  const count=calls.length,saved=await f.api('finance/accounts/profile',payload,'PUT');
  assert.equal(saved.status,201);assert.equal(calls.length-count,1,'a local profile write uses exactly one upstream read');assert.equal(saved.value.state.accounts[0].profileOrigin,'local_overlay');assert.equal(saved.value.state.accounts[0].assetType,'cash');
  assert.equal(remote.accounts[0].name,'Source account');assert.equal(remote.accounts[0].amount,'200.00');assert.equal(f.app.finance.native.document().accounts.length,0);
  await f.reopen();let state=(await f.api('finance/state')).value;assert.equal(state.accounts[0].name,'Reviewed source account');assert.equal(state.accounts[0].amount,'200.00');
  const currentRevision=state.accounts[0].accountRevision;remote.accounts[0].amount='210.00';remote.revision='source-2';
  assert.equal((await f.api('finance/accounts/profile',{...payload,idempotencyKey:'source-stale-profile',expectedAccountRevision:currentRevision},'PUT')).status,409);
  state=(await f.api('finance/state')).value;assert.equal(state.accounts[0].amount,'210.00');assert.equal(state.accounts[0].assetType,'cash');
  const bad=await f.api('finance/accounts/profile',{...payload,idempotencyKey:'source-cannot-change-value',expectedAccountRevision:state.accounts[0].accountRevision,assetType:'real_estate',assetDetails:details({totalValue:'210.00'})},'PUT');assert.equal(bad.value.code,'finance_source_profile_only');
  await f.api('spaces/personal',{});assert.equal((await f.api('spaces/personal/finance/accounts/profile',payload,'PUT')).status,404);assert.equal((await f.api('spaces/personal/finance/state')).value.accounts.length,0);
});

test('overlapping source profile loads cannot overwrite a newer local classification with the same revision',async t=>{
  const f=await fixture(t),source={id:'source-overlap',name:'Example source',kind:'asset',currency:'CNY',amount:'100.00',asOf:'2026-10-20',readOnly:true};
  // Both requests have completed their asynchronous source read before either
  // request enters the synchronous SQLite mutation.
  const observed=withAccountProfile(source),accounts=[observed];
  const payload={idempotencyKey:'first-overlapping-profile',accountId:source.id,expectedAccountRevision:observed.accountRevision,name:'First classification',description:'',assetType:'cash'};
  f.app.finance.native.updateAccountProfile(payload,{accounts});
  assert.throws(()=>f.app.finance.native.updateAccountProfile({...payload,idempotencyKey:'second-overlapping-profile',name:'Second classification'},{accounts}),error=>error.code==='finance_account_revision_conflict');
  assert.equal(f.app.finance.native.document().metadata.accountProfiles[source.id].name,'First classification');
});

test('a successful asset creation remains replayable if its linked debt is later archived',async t=>{
  const f=await fixture(t),loan=(await f.api('finance/accounts',account('archive-debt',{kind:'liability'}))).value.accountId;
  const payload=account('linked-replay',{assetType:'real_estate',assetDetails:details({linkedLiabilityIds:[loan]})});
  const first=await f.api('finance/accounts',payload);assert.equal(first.status,201);
  await f.api('finance/accounts/archive',{accountId:loan,archived:true},'PUT');
  const replay=await f.api('finance/accounts',payload);assert.equal(replay.status,200);assert.equal(replay.value.replayed,true);assert.equal(replay.value.accountId,first.value.accountId);assert.equal(replay.value.state.accounts.length,1);
});
