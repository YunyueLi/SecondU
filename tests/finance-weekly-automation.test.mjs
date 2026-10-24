import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {journalToday} from '../server/finance/journal.mjs';
import {renderFinanceWeeklyReport} from '../server/finance/weekly-automation.mjs';

async function fixture(t){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-weekly-automation-'));let app,externalCalls=0,modelCalls=0;
  const fetchImpl=async()=>{externalCalls++;throw new Error('External call must not occur');};
  const open=async()=>{app=createApp({dataDir:directory,seed:false,scheduler:false,executionPolicy:'auto',computerInfo:{codexAvailable:false},runCodex:async()=>{modelCalls++;throw new Error('Model must not run');},financeOptions:{adapterOptions:{fetchImpl},appKeyOptions:{fetchImpl},oauthOptions:{fetchImpl},marketOptions:{fetchImpl}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};
  await open();
  const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  return {get app(){return app;},get externalCalls(){return externalCalls;},get modelCalls(){return modelCalls;},directory,api,async reopen(){await app.close();await open();}};
}
const configuration=extra=>({kind:'finance_weekly',title:'Example weekly finance report',prompt:'Use saved local finance records.',trigger:'interval',intervalMinutes:10080,...extra});
const transaction=extra=>({idempotencyKey:'example-weekly-transaction',expectedRevision:0,kind:'expense',occurredOn:journalToday(),amount:'15.00',currency:'CNY',category:'Example category',...extra});

test('local weekly automation stays disabled until requested and saves real task artifacts without providers or balance changes',async t=>{
  const f=await fixture(t);assert.equal(f.app.store.list('automations').length,0);
  f.app.finance.journal.saveRecord('transactions',transaction());
  const beforeJournal=f.app.finance.journal.read(),beforeFinance=f.app.store.get('meta','finance');
  writeFileSync(path.join(f.directory,'finance-adapter.json'),JSON.stringify({version:1,origin:'http://127.0.0.1:59131'}));
  const created=await f.api('automations',configuration());assert.equal(created.status,201);assert.equal(created.value.enabled,false);assert.equal(created.value.mode,'live');assert.equal(created.value.nextRunAt,undefined);
  assert.equal(f.app.store.list('tasks').length,0);f.app.runner.tick();assert.equal(f.app.store.list('tasks').length,0);
  const response=await f.api(`automations/${created.value.id}/run`,{}),task=response.value;
  assert.equal(response.status,200);assert.equal(task.status,'completed');assert.equal(task.financeWeekly.automationId,created.value.id);assert.equal(task.financeWeekly.through,journalToday());
  assert.equal(task.financeWeekly.journalRevision,beforeJournal.revision);assert.equal(task.digitalTwinEnabled,false);assert.deepEqual(task.connectorIds,[]);assert.deepEqual(task.agentIds,[]);assert.equal(task.artifactIds.length,2);
  const artifacts=task.artifactIds.map(id=>f.app.store.require('artifacts',id)),json=artifacts.find(row=>row.name.endsWith('.json')),markdown=artifacts.find(row=>row.name.endsWith('.md'));
  const report=JSON.parse(json.content);assert.equal(report.current.expenses.amount,'15.00');assert.equal(report.current.income.amount,null);assert.equal(report.sources.transactionIds[0],beforeJournal.transactions[0].id);
  assert.match(markdown.content,/15.00 CNY/);assert.match(markdown.content,/暂无记录/);
  for(const artifact of artifacts){assert.equal(artifact.origin.kind,'application');assert.equal(artifact.reviewStatus,'ready');assert.ok(existsSync(f.app.store.artifactPath(artifact)));assert.equal(readFileSync(f.app.store.artifactPath(artifact),'utf8'),artifact.content);}
  assert.deepEqual(f.app.finance.journal.read(),beforeJournal);assert.deepEqual(f.app.store.get('meta','finance'),beforeFinance);assert.equal(f.externalCalls,0);assert.equal(f.modelCalls,0);assert.equal(f.app.runner.active.size,0);
  const last=f.app.store.require('automations',created.value.id);assert.equal(last.lastTaskId,task.id);assert.equal(last.enabled,false);assert.equal(last.nextRunAt,undefined);
  await f.reopen();assert.equal(f.app.store.require('tasks',task.id).status,'completed');assert.equal(f.app.store.require('artifacts',json.id).content,json.content);
});

test('existing scheduler performs one catch-up run, honors pause, and keeps report tasks space-local',async t=>{
  const f=await fixture(t),automation=(await f.api('automations',configuration({enabled:true}))).value;
  f.app.store.put('automations',{...automation,nextRunAt:'2020-01-01T00:00:00.000Z'});
  f.app.runner.tick();f.app.runner.tick();assert.equal(f.app.store.list('tasks').length,1);
  const current=f.app.store.require('automations',automation.id),task=f.app.store.require('tasks',current.lastTaskId);assert.equal(task.status,'completed');assert.ok(Date.parse(current.nextRunAt)>Date.now());
  const report=JSON.parse(f.app.store.require('artifacts',task.artifactIds[0]).content);assert.equal(report.coverage.status,'empty');assert.equal(report.current.expenses.amount,null);
  const disabled=await f.api(`automations/${automation.id}`,{enabled:false},'PUT');assert.equal(disabled.status,200);assert.equal(disabled.value.nextRunAt,undefined);f.app.runner.tick();assert.equal(f.app.store.list('tasks').length,1);
  await f.api('spaces/personal',{});const other=(await f.api('spaces/personal/bootstrap')).value;assert.equal(other.tasks.length,0);assert.equal(other.automations.length,0);assert.equal((await f.api(`spaces/personal/tasks/${task.id}`)).status,404);
  assert.equal(f.externalCalls,0);assert.equal(f.modelCalls,0);
});

test('weekly automation validates local-only configuration and preserves legacy model automation behavior',async t=>{
  const f=await fixture(t);
  for(const extra of [{kind:'unknown'},{trigger:'daily',time:'09:00'},{intervalMinutes:60},{financeCurrency:'ZZZ'},{connectionId:'anything'},{projectId:'anything'},{agentIds:['anything']},{connectorIds:['anything']},{digitalTwinEnabled:true},{contextRequest:{purpose:'work'}}]){
    const response=await f.api('automations',configuration(extra));assert.equal(response.status,400,JSON.stringify(extra));
  }
  const legacy=await f.api('automations',{title:'Example model task',prompt:'Example task instructions',trigger:'interval',intervalMinutes:60,enabled:false});assert.equal(legacy.status,201);assert.equal(legacy.value.kind,'agent_task');
  const run=await f.api(`automations/${legacy.value.id}/run`,{});assert.equal(run.status,200);assert.equal(run.value.status,'needs_input');assert.equal(run.value.financeWeekly,undefined);
  await f.api('spaces/demo-cn-v1',{});const demo=await f.api('spaces/demo-cn-v1/automations',configuration({mode:'demo',enabled:false}));assert.equal(demo.status,201);assert.equal((await f.api(`spaces/demo-cn-v1/automations/${demo.value.id}/run`,{})).status,403);
  assert.equal(f.externalCalls,0);assert.equal(f.modelCalls,0);
});

test('weekly tasks cannot enter model execution through retry or message endpoints',async t=>{
  const f=await fixture(t),automation=(await f.api('automations',configuration())).value,task=(await f.api(`automations/${automation.id}/run`,{})).value;
  const messages=task.messages;
  for(const [action,body] of [['run',{}],['message',{content:'Continue this report'}]]){const response=await f.api(`tasks/${task.id}/${action}`,body);assert.equal(response.status,409);assert.equal(response.value.code,'finance_report_read_only');}
  for(const run of [false,true]){const response=await f.api(`tasks/${task.id}/revise`,{requestId:`weekly-report-revision-${run}`,messageId:task.messages[0].id,content:'Create a revised report task',run});assert.equal(response.status,409);assert.equal(response.value.code,'finance_report_read_only');}
  assert.equal(f.app.store.list('tasks').length,1);assert.deepEqual(f.app.store.list('messageRevisions'),[]);
  assert.deepEqual(f.app.store.require('tasks',task.id).messages,messages);assert.equal(f.modelCalls,0);
  const forged=(await f.api('tasks',{prompt:'Example ordinary task',financeWeekly:{version:1,automationId:automation.id}})).value;assert.equal(forged.financeWeekly,undefined);
});

test('saved native FX is the only conversion input, and calculation failure is retained as a failed local task',async t=>{
  const f=await fixture(t);f.app.finance.journal.saveRecord('transactions',transaction({currency:'USD',amount:'10.00'}));
  f.app.store.put('financeJournal:snapshots',{id:'example-old-snapshot',revision:1,archived:false,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',date:'2026-01-01',capturedAt:'2026-01-01T00:00:00Z',currency:'CNY',scope:{accountIds:[],liabilityIds:[],archivedAccountIds:[]},accounts:[],valuation:{net:'70.00',complete:true,rates:[{currency:'USD',rate:'7',baseCurrency:'CNY'}]}});
  const automation=(await f.api('automations',configuration({financeCurrency:'CNY'}))).value;
  let task=(await f.api(`automations/${automation.id}/run`,{})).value,report=JSON.parse(f.app.store.require('artifacts',task.artifactIds[0]).content);assert.equal(report.current.expenses.amount,null);assert.deepEqual(report.current.expenses.byCurrency,{USD:'10.00'});
  f.app.store.setMeta('financeMarket',{rates:[{currency:'USD',rate:'7.2',baseCurrency:'CNY',asOf:new Date().toISOString()}]});
  task=(await f.api(`automations/${automation.id}/run`,{})).value;report=JSON.parse(f.app.store.require('artifacts',task.artifactIds[0]).content);assert.equal(report.current.expenses.amount,'72.00');
  const record=f.app.finance.journal.read().transactions[0];f.app.store.put('financeJournal:transactions',{...record,amount:'invalid'});
  task=(await f.api(`automations/${automation.id}/run`,{})).value;assert.equal(task.status,'failed');assert.ok(task.error);assert.equal(task.financeWeekly.automationId,automation.id);assert.equal(task.artifactIds.length,0);assert.ok(task.events.some(event=>event.type==='failed'));
  assert.equal(f.externalCalls,0);assert.equal(f.modelCalls,0);
});

test('generated Markdown supports English and escapes record labels instead of interpreting them as links or HTML',async t=>{
  const f=await fixture(t);f.app.finance.journal.saveRecord('transactions',transaction({category:'<script>example</script> | [link](https://example.invalid)'}));
  const automation=(await f.api('automations',configuration())).value,task=(await f.api(`automations/${automation.id}/run`,{})).value,report=JSON.parse(f.app.store.require('artifacts',task.artifactIds[0]).content);
  const rendered=renderFinanceWeeklyReport(report,{language:'en'});assert.match(rendered,/Weekly finance report/);assert.ok(rendered.includes('\\<script\\>'));assert.ok(rendered.includes('\\|'));assert.ok(rendered.includes('\\[link\\]'));assert.doesNotMatch(rendered,/<script>/);
});
