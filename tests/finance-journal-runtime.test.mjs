import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';

const NOW=Date.parse('2026-04-01T02:00:00Z');
async function fixture(t,financeOptions={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-journal-runtime-'));let app;
  const open=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},financeOptions:{now:()=>NOW,...financeOptions}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};
  await open();
  const api=async(route,body,method=body===undefined?'GET':'POST')=>{
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    return {status:response.status,value:await response.json()};
  };
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  return {get app(){return app;},directory,api,async reopen(){await app.close();await open();}};
}
const account={idempotencyKey:'journal-test-account',name:'Example account',kind:'asset',currency:'CNY',amount:'500.00',asOf:'2026-03-31'};
const transaction=extra=>({idempotencyKey:'journal-test-transaction',expectedRevision:0,kind:'expense',occurredOn:'2026-04-01',amount:'25.00',currency:'CNY',merchant:'Example shop',category:'food',...extra});

test('journal API saves independently of balances, returns a stable revision, and persists across restart',async t=>{
  const f=await fixture(t),created=(await f.api('finance/accounts',account)).value,accountId=created.accountId;
  const request=transaction({accountId}),saved=await f.api('finance/journal/records/transactions',request);
  assert.equal(saved.status,200);assert.equal(saved.value.state.accounts[0].amount,'500.00');
  assert.equal(saved.value.state.analysis.spending.expenses.amount,'25.00');
  assert.notEqual(saved.value.state.revision,created.state.revision);
  const live=(await f.api('finance/state')).value;
  assert.equal(live.revision,saved.value.state.revision);assert.equal(live.journal.transactions.length,1);
  const replay=await f.api('finance/journal/records/transactions',request);
  assert.equal(replay.value.replayed,true);assert.equal(replay.value.record.id,saved.value.record.id);
  assert.equal(replay.value.state.revision,saved.value.state.revision);
  await f.reopen();const reopened=(await f.api('finance/state')).value;
  assert.equal(reopened.journal.transactions[0].id,saved.value.record.id);assert.equal(reopened.accounts[0].amount,'500.00');
  assert.equal(reopened.revision,saved.value.state.revision);
  const requested=await f.api('finance/journal/analysis',{month:'2026-03',currency:'CNY'});
  assert.equal(requested.status,200);assert.equal(requested.value.analysis.spending.expenses.amount,null);
  const weekly=await f.api('finance/journal/weekly',{through:'2026-04-01',currency:'CNY'});
  assert.equal(weekly.status,200);assert.equal(weekly.value.report.current.expenses.amount,'25.00');assert.equal(weekly.value.report.current.from,'2026-03-26');
  assert.equal((await f.api('finance/state')).value.revision,reopened.revision);
});

test('editing a transaction can retain its archived account reference without restoring the account',async t=>{
  const f=await fixture(t),accountId=(await f.api('finance/accounts',account)).value.accountId;
  const created=(await f.api('finance/journal/records/transactions',transaction({accountId}))).value.record;
  assert.equal((await f.api('finance/accounts/archive',{accountId,archived:true},'PUT')).status,200);
  const saved=await f.api('finance/journal/records/transactions',transaction({accountId,id:created.id,expectedRevision:created.revision,idempotencyKey:'edit-archived-account-journal',merchant:'Corrected example merchant'}));
  assert.equal(saved.status,200);assert.equal(saved.value.record.merchant,'Corrected example merchant');
  assert.deepEqual(saved.value.state.accounts,[]);assert.equal(saved.value.state.archivedAccounts[0].id,accountId);
  assert.equal(saved.value.state.archivedAccounts[0].amount,'500.00');assert.equal(saved.value.record.accountId,accountId);
});

test('journal commit uses one upstream observation and cannot fail after saving due to a second adapter read',async t=>{
  let reads=0,failAfterFirst=true;
  const upstream={revision:'example-upstream-revision',accounts:[{id:'example-upstream-account',name:'Example upstream account',kind:'asset',currency:'CNY',amount:'600.00',asOf:'2026-03-31'}],liabilities:[],positions:{items:[],revision:'example-position-revision'},market:{quotes:[],rates:[],issues:[],status:'idle'},portfolio:{accounts:[],holdings:[],rates:[]}};
  const f=await fixture(t,{adapterOptions:{fetchImpl:async()=>{reads++;if(failAfterFirst&&reads>1)throw new Error('Example upstream interruption');return new Response(JSON.stringify(upstream),{headers:{'Content-Type':'application/json'}});}}});
  writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
  const saved=await f.api('finance/journal/records/transactions',transaction({accountId:'example-upstream-account'}));
  assert.equal(saved.status,200);assert.equal(reads,1);assert.equal(saved.value.state.journal.transactions.length,1);
  assert.equal(saved.value.state.accounts[0].amount,'600.00');assert.equal(saved.value.state.analysis.spending.expenses.amount,'25.00');
  failAfterFirst=false;const live=(await f.api('finance/state')).value;
  assert.equal(live.revision,saved.value.state.revision);assert.equal(live.journal.transactions[0].id,saved.value.record.id);
});

test('reading financial state never creates snapshots; explicit captures and journal records remain space-local',async t=>{
  const f=await fixture(t);await f.api('finance/accounts',account);
  for(let index=0;index<2;index++)assert.deepEqual((await f.api('finance/state')).value.journal.snapshots,[]);
  const captured=await f.api('finance/journal/snapshots',{idempotencyKey:'explicit-journal-snapshot'});
  assert.equal(captured.status,200);assert.equal(captured.value.snapshot.date,'2026-04-01');
  assert.equal(captured.value.snapshot.valuation.net,'500.00');
  await f.api('finance/journal/records/transactions',transaction());
  await f.api('spaces/personal',{});
  const personal=(await f.api('spaces/personal/finance/state')).value;
  assert.deepEqual(personal.journal.transactions,[]);assert.deepEqual(personal.journal.snapshots,[]);
  const invalid=await f.api('spaces/personal/finance/journal/records/transactions',transaction({accountId:captured.value.snapshot.accounts[0].id}));
  assert.equal(invalid.status,404);assert.equal(invalid.value.code,'finance_account_not_found');
  assert.equal((await f.api('spaces/personal/finance/journal/snapshots',{idempotencyKey:'empty-personal-snapshot'})).status,409);
  const state=(await f.api('finance/state')).value;
  assert.equal(state.journal.transactions.length,1);assert.equal(state.journal.snapshots.length,1);
});
