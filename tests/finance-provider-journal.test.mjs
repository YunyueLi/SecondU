import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {FinanceJournal} from '../server/finance/journal.mjs';
import {NativeFinanceStore} from '../server/finance/store.mjs';
import {importProviderSnapshot} from '../server/finance/provider-import.mjs';
import {journalSourceLabel,journalSourceSnapshot} from '../src/finance/journal-source.mjs';

const NOW=Date.parse('2026-10-24T12:00:00Z');
const stamp=minute=>new Date(NOW-3600000+minute*60000).toISOString();
const accountIds={'example-account-ref':'local-account'};
const transaction=(extra={})=>({transactionRef:'example-transaction-ref',accountRef:'example-account-ref',occurredOn:'2026-10-15',kind:'expense',amount:'12.34',currency:'USD',merchant:'Fictional shop',category:'food',note:'Fictional transaction',...extra});
const snapshot=(extra={})=>({provider:'plaid',environment:'production',readOnly:true,complete:true,fetchedAt:stamp(0),transactionMode:'snapshot',transactions:[transaction()],...extra});
const sync=(f,extra={},ids=accountIds)=>f.journal.importProviderTransactions(snapshot(extra),{accountIds:ids});
function fixture(t){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-provider-journal-'));
  const store=new Store(directory,{seed:false}),journal=new FinanceJournal(store,{now:()=>NOW});
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {store,journal,native:new NativeFinanceStore(store,{now:()=>NOW})};
}

test('official transactions remain idempotent across newer reads and retain correction history',t=>{
  const f=fixture(t);
  assert.deepEqual(sync(f),{created:1,updated:0,archived:0});
  const original=f.journal.read().transactions[0];
  assert.deepEqual(original.source,{kind:'connector',provider:'plaid',environment:'production',accountRef:'example-account-ref',transactionRef:'example-transaction-ref',fetchedAt:stamp(0)});
  assert.deepEqual(sync(f),{created:0,updated:0,archived:0});
  assert.deepEqual(sync(f,{fetchedAt:stamp(1)}),{created:0,updated:0,archived:0});
  assert.deepEqual(f.journal.read().transactions,[original]);
  assert.deepEqual(sync(f,{fetchedAt:stamp(2),transactions:[transaction({amount:'14',category:'shopping'})]}),{created:0,updated:1,archived:0});
  const revised=f.journal.read().transactions[0];
  assert.equal(revised.id,original.id);assert.equal(revised.revision,2);assert.equal(revised.amount,'14.00');assert.equal(revised.category,'shopping');
  assert.deepEqual(f.store.list('financeJournalHistory').map(row=>row.operation),['provider_import','provider_update']);
  assert.equal(f.store.list('financeJournalHistory')[1].before.amount,'12.34');
  assert.equal(f.native.document().accounts.length,0);
});

test('withdrawal is restricted to the selected provider, environment, account and complete date range',t=>{
  const f=fixture(t),ids={...accountIds,'other-account-ref':'other-local-account'};
  sync(f,{transactions:[transaction(),transaction({transactionRef:'outside-range',occurredOn:'2026-09-30'}),transaction({transactionRef:'other-account-row',accountRef:'other-account-ref'})]},ids);
  sync(f,{provider:'teller'});sync(f,{environment:'development'});
  const manual={idempotencyKey:'manual-example-record',expectedRevision:0,kind:'expense',occurredOn:'2026-10-15',amount:'2',currency:'USD',merchant:'Fictional manual record'};
  f.journal.saveRecord('transactions',manual);
  f.journal.saveRecord('transactions',{...manual,idempotencyKey:'csv-example-record',source:{kind:'import',fileName:'fictional.csv',fileHash:'a'.repeat(64),row:2,batchId:'fictional-csv-batch'}});
  assert.deepEqual(sync(f,{fetchedAt:stamp(1),transactions:[]}),{created:0,updated:0,archived:0});
  assert.deepEqual(sync(f,{fetchedAt:stamp(2),transactions:[],transactionRange:{from:'2026-10-01',to:'2026-10-20'}}),{created:0,updated:0,archived:1});
  const rows=f.journal.read().transactions,withdrawn=rows.filter(row=>row.archived);
  assert.equal(withdrawn.length,1);assert.equal(withdrawn[0].source.provider,'plaid');assert.equal(withdrawn[0].source.environment,'production');assert.equal(withdrawn[0].accountId,'local-account');
  assert.equal(rows.length,7);
  assert.deepEqual(sync(f,{fetchedAt:stamp(3),transactionRange:{from:'2026-10-01',to:'2026-10-20'}}),{created:0,updated:1,archived:0});
  assert.equal(f.journal.read().transactions.find(row=>row.id===withdrawn[0].id).revision,3);
  assert.equal(f.store.list('financeJournalHistory').at(-1).operation,'provider_restore');
});

test('empty and unchanged snapshots reject late responses, while no-transaction adapters leave the journal alone',t=>{
  const f=fixture(t);sync(f);
  const before=f.journal.read(),marks=f.store.list('financeJournalProviderSync');
  assert.deepEqual(sync(f,{fetchedAt:stamp(3),transactionMode:'none',transactions:[],transactionRange:{from:'2026-10-01',to:'2026-10-24'}}),{created:0,updated:0,archived:0});
  assert.deepEqual(f.journal.read(),before);assert.deepEqual(f.store.list('financeJournalProviderSync'),marks);
  sync(f,{fetchedAt:stamp(2)});
  assert.throws(()=>sync(f,{fetchedAt:stamp(1),transactions:[transaction({amount:'99'})]}),{code:'finance_older_observation'});
  sync(f,{fetchedAt:stamp(3),transactions:[],transactionRange:{from:'2026-10-01',to:'2026-10-24'}});
  assert.throws(()=>sync(f,{fetchedAt:stamp(2)}),{code:'finance_older_observation'});
  assert.equal(f.journal.read().transactions[0].archived,true);
  assert.throws(()=>sync(f,{fetchedAt:stamp(3)}),{code:'finance_provider_snapshot_conflict'});
});

test('invalid or duplicate rows never partially replace existing transactions or source timestamps',t=>{
  const f=fixture(t);sync(f);const before=f.journal.read(),marks=f.store.list('financeJournalProviderSync'),history=f.store.list('financeJournalHistory');
  const invalid=[undefined,'',null,'bad','1.001',0];
  for(const amount of invalid)assert.throws(()=>sync(f,{fetchedAt:stamp(1),transactions:[transaction({amount:'99'}),transaction({transactionRef:'invalid-amount',amount})]}),{code:'finance_invalid_decimal'});
  assert.throws(()=>sync(f,{fetchedAt:stamp(1),transactions:[transaction(),transaction()]}),{code:'finance_provider_transaction_duplicate'});
  assert.throws(()=>sync(f,{fetchedAt:stamp(1),transactionRange:{from:'2026-10-16',to:'2026-10-20'}}),{code:'finance_invalid_provider_response'});
  assert.throws(()=>sync(f,{complete:false}),{code:'finance_invalid_provider_response'});
  assert.throws(()=>sync(f,{environment:'sandbox'}));
  assert.deepEqual(f.journal.read(),before);assert.deepEqual(f.store.list('financeJournalProviderSync'),marks);assert.deepEqual(f.store.list('financeJournalHistory'),history);
});

test('official sources cannot be forged, reassigned, edited, archived or restored by public record mutations',t=>{
  const f=fixture(t);sync(f);const record=f.journal.read().transactions[0];
  const input={expectedRevision:0,idempotencyKey:'forged-official-source',kind:'expense',occurredOn:'2026-10-15',amount:'1',currency:'USD',source:record.source};
  assert.throws(()=>f.journal.saveRecord('transactions',input),{code:'finance_invalid_source'});
  assert.throws(()=>f.journal.saveRecord('transactions',{...input,id:record.id,expectedRevision:record.revision,source:{kind:'manual'},idempotencyKey:'edit-official-source'}),{code:'finance_official_read_only'});
  assert.throws(()=>f.journal.archiveRecord('transactions',{id:record.id,expectedRevision:record.revision,idempotencyKey:'archive-official-source',archived:true}),{code:'finance_official_read_only'});
  assert.throws(()=>sync(f,{fetchedAt:stamp(1)},{'example-account-ref':'reassigned-account'}),{code:'finance_account_mapping_conflict'});
  sync(f,{fetchedAt:stamp(2),transactions:[],transactionRange:{from:'2026-10-01',to:'2026-10-24'}});
  assert.throws(()=>f.journal.archiveRecord('transactions',{id:record.id,expectedRevision:2,idempotencyKey:'restore-official-source',archived:false}),{code:'finance_official_read_only'});
  assert.equal(f.store.list('financeJournalOperations').length,0);
});

test('a persistence failure rolls back transactions, audit history and source watermarks together',t=>{
  const f=fixture(t);sync(f);const before=f.journal.read(),history=f.store.list('financeJournalHistory'),marks=f.store.list('financeJournalProviderSync');
  const original=f.store.put.bind(f.store);let histories=0;
  f.store.put=(collection,value)=>{if(collection==='financeJournalHistory'&&++histories===2)throw new Error('Fictional disk write failure');return original(collection,value);};
  assert.throws(()=>sync(f,{fetchedAt:stamp(1),transactions:[transaction({amount:'20'}),transaction({transactionRef:'new-transaction'})]}),/Fictional disk write failure/);
  f.store.put=original;
  assert.deepEqual(f.journal.read(),before);assert.deepEqual(f.store.list('financeJournalHistory'),history);assert.deepEqual(f.store.list('financeJournalProviderSync'),marks);
});

test('account balances and provider transactions commit or roll back in the same native mutation',t=>{
  const f=fixture(t),full=snapshot({accounts:[{accountRef:'example-account-ref',name:'Fictional account',kind:'asset',assetType:'cash',currency:'USD',amount:'100',asOf:'2026-10-24',sourceName:'Fictional institution'}],positions:[]});
  const original=f.store.put.bind(f.store);
  f.store.put=(collection,value)=>{if(collection==='financeOperations')throw new Error('Fictional operation write failure');return original(collection,value);};
  assert.throws(()=>importProviderSnapshot(f.native,full,{accountRefs:['example-account-ref'],idempotencyKey:'atomic-provider-import'},f.journal),/Fictional operation write failure/);
  f.store.put=original;
  assert.equal(f.native.document().accounts.length,0);assert.equal(f.journal.read().transactions.length,0);assert.equal(f.store.list('financeJournalHistory').length,0);assert.equal(f.store.list('financeJournalProviderSync').length,0);
  const result=importProviderSnapshot(f.native,full,{accountRefs:['example-account-ref'],idempotencyKey:'atomic-provider-import'},f.journal);
  assert.deepEqual(result.transactions,{created:1,updated:0,archived:0});assert.equal(f.native.document().accounts[0].amount,'100.00');assert.equal(f.journal.read().transactions[0].accountId,result.accountIds[0]);
  assert.equal(importProviderSnapshot(f.native,full,{accountRefs:['example-account-ref'],idempotencyKey:'atomic-provider-import'},f.journal).replayed,true);
  const before=f.native.document();
  assert.throws(()=>importProviderSnapshot(f.native,{...full,fetchedAt:stamp(1),accounts:[{...full.accounts[0],amount:'200'}],transactions:[transaction({amount:''})]},{accountRefs:['example-account-ref'],idempotencyKey:'invalid-provider-import'},f.journal),{code:'finance_invalid_decimal'});
  assert.deepEqual(f.native.document(),before);assert.equal(f.journal.read().transactions.length,1);
});

test('selected accounts and separate workspaces remain isolated, and conversational provenance omits source identity keys',t=>{
  const f=fixture(t),other=fixture(t);sync(f,{transactions:[transaction(),transaction({accountRef:'unselected-account-ref',transactionRef:'unselected-transaction'})]});
  assert.equal(f.journal.read().transactions.length,1);assert.equal(other.journal.read().transactions.length,0);
  const source=f.journal.read().transactions[0].source,summary=journalSourceSnapshot(source);
  assert.deepEqual(summary,{kind:'connector',provider:'plaid',environment:'production',fetchedAt:stamp(0)});
  assert.equal(journalSourceLabel(source),'Plaid 同步');assert.equal(journalSourceLabel({...source,environment:'development'}),'Plaid 同步（开发环境）');
  assert.equal(JSON.stringify(summary).includes('transactionRef'),false);assert.equal(JSON.stringify(summary).includes('accountRef'),false);
});

test('explicit reauthorization retires only the old account source within the complete range and preserves its audit trail',t=>{
  const f=fixture(t),range={from:'2026-10-01',to:'2026-10-24'};
  sync(f,{transactions:[transaction(),transaction({transactionRef:'historical-transaction',occurredOn:'2026-09-30'}),transaction({accountRef:'unmapped-old-ref',transactionRef:'unmapped-old-transaction'})]},{...accountIds,'unmapped-old-ref':'another-local-account'});
  sync(f,{provider:'teller'});sync(f,{environment:'development'});
  const before=f.journal.read().transactions,old=before.find(row=>row.source.provider==='plaid'&&row.source.environment==='production'&&row.source.transactionRef==='example-transaction-ref');
  const next=snapshot({fetchedAt:stamp(2),transactionRange:range,transactions:[transaction({accountRef:'new-account-ref',transactionRef:'new-item-transaction'})]});
  const options={accountIds:{'new-account-ref':'local-account'},relinkedAccounts:{'new-account-ref':'example-account-ref'}};
  assert.deepEqual(f.journal.importProviderTransactions(next,options),{created:1,updated:0,archived:1});
  const rows=f.journal.read().transactions;
  assert.equal(rows.find(row=>row.id===old.id).archived,true);assert.equal(rows.find(row=>row.id===old.id).revision,2);
  assert.equal(rows.filter(row=>row.source.provider==='plaid'&&row.source.environment==='production'&&row.accountId==='local-account'&&row.occurredOn>='2026-10-01'&&!row.archived).length,1);
  for(const unchanged of before.filter(row=>row.id!==old.id))assert.deepEqual(rows.find(row=>row.id===unchanged.id),unchanged);
  assert.equal(f.store.list('financeJournalHistory').find(row=>row.recordId===old.id&&row.operation==='provider_withdraw').before.archived,false);
  assert.deepEqual(f.journal.importProviderTransactions(next,options),{created:0,updated:0,archived:0});
  // The trusted relationship remains useful when a later complete read expands
  // its window, even though the account importer no longer needs a new mapping.
  assert.deepEqual(f.journal.importProviderTransactions({...next,fetchedAt:stamp(3),transactionRange:{from:'2026-09-01',to:'2026-10-24'}},{accountIds:options.accountIds}),{created:0,updated:0,archived:1});
  assert.equal(f.journal.read().transactions.find(row=>row.source.transactionRef==='historical-transaction').archived,true);
  assert.throws(()=>sync(f,{fetchedAt:stamp(4)}),{code:'finance_account_mapping_conflict'});
});

test('reauthorization without a complete range keeps old observations until a later complete snapshot',t=>{
  const f=fixture(t);sync(f);
  const next=snapshot({fetchedAt:stamp(1),transactions:[transaction({accountRef:'new-account-ref',transactionRef:'new-item-transaction'})]});
  const options={accountIds:{'new-account-ref':'local-account'},relinkedAccounts:{'new-account-ref':'example-account-ref'}};
  assert.deepEqual(f.journal.importProviderTransactions(next,options),{created:1,updated:0,archived:0});
  assert.equal(f.journal.read().transactions.filter(row=>!row.archived).length,2);
  assert.deepEqual(f.journal.importProviderTransactions({...next,fetchedAt:stamp(2),transactionRange:{from:'2026-10-01',to:'2026-10-24'}},{accountIds:options.accountIds}),{created:0,updated:0,archived:1});
  assert.equal(f.journal.read().transactions.filter(row=>!row.archived).length,1);
});

test('reauthorization rejects wrong account, provider, environment, unselected refs and older old-source watermarks atomically',t=>{
  const f=fixture(t);sync(f);sync(f,{fetchedAt:stamp(5)});
  const before=f.journal.read(),marks=f.store.list('financeJournalProviderSync');
  const next=snapshot({fetchedAt:stamp(6),transactions:[],transactionRange:{from:'2026-10-01',to:'2026-10-24'}});
  const options={accountIds:{'new-account-ref':'local-account'},relinkedAccounts:{'new-account-ref':'example-account-ref'}};
  assert.throws(()=>f.journal.importProviderTransactions({...next,fetchedAt:stamp(4)},options),{code:'finance_older_observation'});
  for(const changed of [{...options,accountIds:{'new-account-ref':'wrong-local-account'}},{...options,relinkedAccounts:{'unselected-ref':'example-account-ref'}},{...options,relinkedAccounts:{'new-account-ref':'unknown-old-ref'}}])assert.throws(()=>f.journal.importProviderTransactions(next,changed),{code:'finance_account_mapping_conflict'});
  for(const change of [{provider:'teller'},{environment:'development'}])assert.throws(()=>f.journal.importProviderTransactions({...next,...change},options),{code:'finance_account_mapping_conflict'});
  assert.deepEqual(f.journal.read(),before);assert.deepEqual(f.store.list('financeJournalProviderSync'),marks);
});
