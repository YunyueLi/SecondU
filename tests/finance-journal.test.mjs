import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {FinanceJournal,FINANCE_WIDGET_IDS} from '../server/finance/journal.mjs';
import {analyzeFinanceJournal} from '../server/finance/analysis.mjs';

const NOW=Date.parse('2026-03-31T12:00:00Z');let operation=0;
const input=extra=>({idempotencyKey:`journal-operation-${++operation}`,expectedRevision:0,...extra});
const transaction=extra=>input({kind:'expense',occurredOn:'2026-03-15',amount:'10.00',currency:'CNY',merchant:'Example shop',category:'food',...extra});
const imported=(row,extra={})=>transaction({source:{kind:'import',fileName:'example.csv',fileHash:'a'.repeat(64),row,batchId:'example-batch-01'},...extra});
function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-journal-'));let store=new Store(directory,{seed:false});let journal=new FinanceJournal(store,{now:()=>NOW});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {get store(){return store;},get journal(){return journal;},reopen(){store.close();store=new Store(directory,{seed:false});journal=new FinanceJournal(store,{now:()=>NOW});}};}

test('empty journal is unknown and reading never writes records or an account balance',t=>{
  const f=fixture(t);f.store.setMeta('finance',{accounts:[{id:'known-account',amount:'100.00'}]});
  const before=f.store.get('meta','finance');
  const doc=f.journal.read(),analysis=analyzeFinanceJournal(doc,{month:'2026-03',today:'2026-03-31'});
  assert.equal(analysis.spending.expenses.amount,null);assert.equal(analysis.credit.latest,null);assert.deepEqual(analysis.monthlyTrend,[]);assert.deepEqual(doc.snapshots,[]);
  f.journal.saveRecord('transactions',transaction());
  assert.deepEqual(f.store.get('meta','finance'),before);
});

test('record edits are revision checked and idempotent; archive and restore preserve history',t=>{
  const f=fixture(t),first=transaction(),created=f.journal.saveRecord('transactions',first);
  assert.equal(created.record.revision,1);assert.equal(f.journal.saveRecord('transactions',first).replayed,true);
  const update=transaction({id:created.record.id,expectedRevision:1,amount:'12.50'}),changed=f.journal.saveRecord('transactions',update);
  assert.equal(changed.record.revision,2);assert.equal(f.journal.saveRecord('transactions',update).replayed,true);
  assert.throws(()=>f.journal.saveRecord('transactions',{...update,idempotencyKey:'stale-update-attempt'}),{code:'finance_journal_revision_conflict'});
  assert.throws(()=>f.journal.saveRecord('transactions',{...first,amount:'99.00'}),{code:'finance_idempotency_conflict'});
  const archived=f.journal.archiveRecord('transactions',{id:changed.record.id,expectedRevision:2,idempotencyKey:'archive-record-01',archived:true}).record;
  assert.equal(analyzeFinanceJournal(f.journal.read(),{month:'2026-03',today:'2026-03-31'}).spending.expenses.amount,null);
  f.journal.archiveRecord('transactions',{id:archived.id,expectedRevision:3,idempotencyKey:'restore-record-01',archived:false});
  assert.equal(f.store.list('financeJournalHistory').length,4);
  f.reopen();assert.equal(f.journal.read().transactions[0].amount,'12.50');assert.equal(f.journal.read().transactions[0].archived,false);
});

test('import is atomic, uses original source rows, and preserves identical transactions on different rows',t=>{
  const f=fixture(t),row2=imported(2),row3=imported(3),duplicate=imported(2);
  const batch={idempotencyKey:'import-file-batch-01',transactions:[row2,row3,duplicate]};
  assert.deepEqual(f.journal.importTransactions(batch).createdCount,2);
  assert.equal(f.journal.read().transactions.length,2);assert.equal(f.journal.importTransactions(batch).replayed,true);
  const repeated=f.journal.importTransactions({idempotencyKey:'import-file-batch-02',transactions:[imported(2),imported(3)]});
  assert.equal(repeated.createdCount,0);assert.equal(repeated.deduplicatedCount,2);
  assert.throws(()=>f.journal.importTransactions({idempotencyKey:'import-file-bad-batch',transactions:[imported(4),imported(5,{currency:'BAD'})]}));
  assert.equal(f.journal.read().transactions.length,2);assert.equal(f.store.get('financeJournalOperations','import-file-bad-batch'),undefined);
  assert.throws(()=>f.journal.importTransactions({idempotencyKey:'import-source-conflict',transactions:[imported(4),imported(2,{amount:'99.00'})]}),{code:'finance_import_source_conflict'});
  assert.equal(f.journal.read().transactions.length,2);
  const saved=f.journal.read().transactions[0];
  f.journal.saveRecord('transactions',transaction({id:saved.id,expectedRevision:1,amount:'11.00',source:saved.source}));
  assert.equal(f.journal.importTransactions({idempotencyKey:'import-after-correction',transactions:[imported(saved.source.row)]}).deduplicatedCount,1);
  assert.equal(f.journal.read().transactions.find(row=>row.id===saved.id).amount,'11.00');
});

test('validation rejects unsupported source authority, invalid money, future records and unknown accounts',t=>{
  const f=fixture(t);
  for(const extra of [{source:{kind:'official',provider:'bank'}},{amount:'1.001'},{amount:5},{occurredOn:'2026-04-01'},{occurredOn:'2026-02-30'},{currency:'ZZZ'},{kind:'income',amount:'0'},{kind:'income',amount:'-1'},{kind:'transfer',amount:'-1'},{toAccountId:'same',accountId:'same',kind:'transfer'}])assert.throws(()=>f.journal.saveRecord('transactions',transaction(extra),{accounts:[{id:'same'}]}));
  assert.throws(()=>f.journal.saveRecord('transactions',transaction({accountId:'other-space-account'})),{code:'finance_account_not_found'});
  assert.equal(f.journal.saveRecord('transactions',transaction({amount:'0'})).record.amount,'0.00');
  assert.equal(f.journal.saveRecord('transactions',transaction({amount:'-2.25'})).record.amount,'-2.25');
  assert.equal(f.journal.saveRecord('transactions',transaction({kind:'transfer',amount:'5'})).record.accountId,null);
});

test('credit ranges and reports remain explicit, and financial memories require manual confirmation',t=>{
  const f=fixture(t),credit=input({score:72,min:0,max:100,provider:'Example provider',model:'Example scale',asOf:'2026-03-01',factors:[{name:'Reported factor',value:'As reported'}]});
  assert.equal(f.journal.saveRecord('creditRecords',credit).record.max,100);
  for(const extra of [{min:100,max:0},{score:101},{model:''},{asOf:'2026-04-01'},{factors:Array(7).fill({name:'Factor',value:'Value'})}])assert.throws(()=>f.journal.saveRecord('creditRecords',{...credit,...extra,idempotencyKey:`invalid-credit-${++operation}`}));
  assert.throws(()=>f.journal.saveRecord('memories',input({text:'A preference',kind:'preference',source:imported(2).source})),{code:'finance_memory_requires_confirmation'});
  assert.equal(f.journal.saveRecord('memories',input({text:'Keep native currency amounts visible',kind:'preference'})).record.source.kind,'manual');
});

test('snapshots capture current dates and original scope, freeze FX, and reject empty or backdated captures',t=>{
  const f=fixture(t),state={revision:'example-state',metadata:{onboarding:{displayCurrency:'CNY'}},accounts:[{id:'usd-account',name:'Example account',currency:'USD',amount:'10.00',asOf:'2026-03-30'}],liabilities:[{id:'cny-liability',name:'Example liability',currency:'CNY',amount:'20.00',asOf:'2026-03-29'}],archivedAccounts:[{id:'archived-account'}],valuation:{rates:[{currency:'USD',rate:'7',baseCurrency:'CNY',asOf:'2026-03-31T10:00:00Z'}]}};
  const captured=f.journal.capture(state,{idempotencyKey:'capture-snapshot-01'}).snapshot;
  assert.equal(captured.date,'2026-03-31');assert.equal(captured.valuation.net,'50.00');assert.deepEqual(captured.scope.accountIds,['usd-account']);assert.equal(captured.accounts[0].asOf,'2026-03-30');
  state.valuation.rates[0].rate='8';state.accounts[0].amount='100.00';
  assert.equal(f.journal.read().snapshots[0].valuation.net,'50.00');
  assert.equal(f.journal.capture(state,{idempotencyKey:'capture-snapshot-01'}).snapshot.valuation.net,'50.00');
  assert.throws(()=>f.journal.capture(state,{idempotencyKey:'capture-backdated-01',date:'2020-01-01'}));
  assert.throws(()=>f.journal.capture({...state,accounts:[],liabilities:[]},{idempotencyKey:'capture-empty-01'}),{code:'finance_snapshot_empty'});
  f.reopen();assert.equal(f.journal.read().snapshots[0].valuation.rates.find(row=>row.currency==='USD').rate,'7');
});

test('dashboard validation and journal records stay isolated across two persisted spaces',t=>{
  const first=fixture(t),second=fixture(t),dashboard=first.journal.read().dashboard;
  first.journal.saveDashboard({idempotencyKey:'dashboard-save-01',expectedRevision:0,enabled:['credit-score'],order:[...FINANCE_WIDGET_IDS].reverse()});
  first.journal.saveRecord('goals',input({name:'Example goal',targetAmount:'100',currentAmount:null,currency:'CNY'}));
  assert.throws(()=>first.journal.saveDashboard({idempotencyKey:'dashboard-stale-01',expectedRevision:0,enabled:[],order:[...FINANCE_WIDGET_IDS]}),{code:'finance_journal_revision_conflict'});
  assert.throws(()=>first.journal.saveDashboard({idempotencyKey:'dashboard-unknown-01',expectedRevision:1,enabled:['unknown'],order:[...FINANCE_WIDGET_IDS]}));
  first.reopen();second.reopen();
  assert.deepEqual(first.journal.read().dashboard.enabled,['credit-score']);assert.deepEqual(second.journal.read().dashboard,dashboard);assert.equal(second.journal.read().goals.length,0);
  const firstGoal=first.journal.read().goals[0];
  assert.throws(()=>second.journal.archiveRecord('goals',{id:firstGoal.id,expectedRevision:1,idempotencyKey:'cross-space-archive',archived:true}),{code:'finance_journal_not_found'});
});

test('watchlist validates market identity and normalizes aliases without merging different markets',t=>{
  const f=fixture(t),add=extra=>f.journal.saveRecord('watchlist',input({name:'Example security',symbol:'AAPL',exchange:'US',currency:'USD',kind:'stock',...extra}));
  const us=add({}).record;assert.equal(us.quoteId,'AAPL');
  assert.throws(()=>add({symbol:'US.AAPL'}),{code:'finance_watchlist_duplicate'});
  const hk=add({symbol:'00700',exchange:'HK',currency:'HKD'}).record;assert.equal(hk.symbol,'0700.HK');
  assert.throws(()=>add({symbol:'700.HK',exchange:'HK',currency:'HKD'}),{code:'finance_watchlist_duplicate'});
  assert.throws(()=>add({symbol:'US.AAPL',exchange:'HK',currency:'HKD'}),{code:'finance_watchlist_identity_invalid'});
  assert.throws(()=>add({currency:'HKD'}),{code:'finance_watchlist_identity_invalid'});
  assert.throws(()=>add({symbol:'000001',exchange:'CN',currency:'CNY',kind:'stock'}),{code:'finance_watchlist_identity_invalid'});
  add({symbol:'000001',exchange:'CN',currency:'CNY',kind:'fund'});
  add({symbol:'1',exchange:'HK',currency:'HKD'});
  const archived=f.journal.archiveRecord('watchlist',{id:us.id,expectedRevision:1,idempotencyKey:'archive-watchlist-01',archived:true}).record;
  assert.throws(()=>add({}),{code:'finance_watchlist_duplicate'});
  f.journal.archiveRecord('watchlist',{id:us.id,expectedRevision:archived.revision,idempotencyKey:'restore-watchlist-01',archived:false});
  f.reopen();assert.equal(f.journal.read().watchlist.length,4);assert.equal(f.journal.read().watchlist.find(row=>row.id===us.id).archived,false);
});

test('local finance dates remain consistent during Shanghai midnight before UTC midnight',t=>{
  const f=fixture(t),clock=Date.parse('2026-03-31T17:30:00Z'),journal=new FinanceJournal(f.store,{now:()=>clock});
  assert.equal(journal.saveRecord('transactions',transaction({occurredOn:'2026-04-01'})).record.occurredOn,'2026-04-01');
  assert.throws(()=>journal.saveRecord('transactions',transaction({occurredOn:'2026-04-02'})),{code:'finance_invalid_date'});
  const state={revision:'midnight-state',metadata:{onboarding:{displayCurrency:'CNY'}},accounts:[{id:'example-account',name:'Example account',currency:'CNY',amount:'0.00',asOf:'2026-04-01'}],liabilities:[],valuation:{rates:[]}};
  const snapshot=journal.capture(state,{idempotencyKey:'midnight-snapshot-01'}).snapshot;
  assert.equal(snapshot.date,'2026-04-01');assert.equal(snapshot.capturedAt,'2026-03-31T17:30:00.000Z');assert.equal(snapshot.timeZone,'Asia/Shanghai');assert.equal(snapshot.valuation.net,'0.00');
});

test('linked payments require the actual recurring occurrence and original bill currency',t=>{
  const f=fixture(t),bill=f.journal.saveRecord('recurring',input({kind:'bill',name:'Example bill',amount:'100.00',currency:'CNY',anchorDate:'2026-01-31',frequency:'monthly'})).record;
  assert.throws(()=>f.journal.saveRecord('transactions',transaction({recurringId:bill.id,recurringOccurrenceOn:'2026-02-27'})),{code:'finance_recurring_occurrence_invalid'});
  assert.throws(()=>f.journal.saveRecord('transactions',transaction({currency:'USD',recurringId:bill.id,recurringOccurrenceOn:'2026-02-28'})),{code:'finance_currency_mismatch'});
  assert.equal(f.journal.saveRecord('transactions',transaction({recurringId:bill.id,recurringOccurrenceOn:'2026-02-28'})).record.recurringOccurrenceOn,'2026-02-28');
});
