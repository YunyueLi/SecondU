import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {createEntity} from '../server/domain.mjs';
import {evidenceFor,buildPrompt} from '../server/runner.mjs';
import {previewMemoryImport,commitMemoryImport,digitalTwinPackage,digitalTwinMarkdown,digitalTwinContext} from '../server/memory-import.mjs';

async function fixture(t){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-memory-test-'));
  const options={dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},runCodex:async()=>{throw new Error('Import must never invoke a model');},modelFetch:async()=>{throw new Error('Import must never call a model provider');}};
  const app=createApp(options);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  return {app,directory,options,async api(route,body){const response=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const value=response.headers.get('content-type')?.startsWith('application/json')?await response.json():await response.text();return {status:response.status,value,response};}};
}
const content='# 背景\n- 我在社区图书馆工作。\n\n## 偏好\n- 我喜欢短段落。\n\n## 目标\n- 我希望今年完成地图课程。\n\n## 约束\n- 周三晚上不安排会议。\n';

test('local preview preserves lines, groups candidates and does not create confirmed data or run models',async t=>{
  const f=await fixture(t),before=f.app.store.list('facts');
  const response=await f.api('/imports/memory/preview',{filename:'AGENTS.md',content});assert.equal(response.status,200);
  const preview=response.value;assert.deepEqual(preview.candidates.map(item=>item.layer),['facts','preferences','goals','constraints']);
  assert.equal(preview.candidates[1].evidence.lineStart,5);assert.equal(preview.candidates[1].evidence.excerpt,'- 我喜欢短段落。');
  assert.ok(preview.warnings.includes('project_instructions_are_candidates'));assert.deepEqual(f.app.store.list('facts'),before);assert.equal(f.app.store.list('sources').length,0);assert.equal(f.app.store.list('tasks').length,0);
  const saved=await f.api('/imports/memory/commit',{previewId:preview.previewId,candidateIds:[preview.candidates[1].id,preview.candidates[2].id]});assert.equal(saved.status,200);assert.equal(saved.value.added,2);
  assert.equal(f.app.store.require('sources',saved.value.sourceId).text,content);assert.equal(f.app.store.list('facts').every(fact=>fact.status==='candidate'&&fact.version===1),true);assert.equal(f.app.store.list('goals').length,0);assert.equal(f.app.store.list('tasks').length,0);
});

test('commit selection is bound, repeat safe, and reimport never overwrites a user correction',async t=>{
  const {app}=await fixture(t),store=app.store;
  const preview=previewMemoryImport(store,{filename:'memory.md',content});const first=preview.candidates[0].id;
  assert.throws(()=>commitMemoryImport(store,{previewId:preview.previewId,candidateIds:['foreign-id']}),error=>error.status===400);
  assert.equal(store.list('sources').length,0);
  const result=commitMemoryImport(store,{previewId:preview.previewId,candidateIds:[first]});assert.equal(result.added,1);
  assert.equal(commitMemoryImport(store,{previewId:preview.previewId,candidateIds:[first]}).alreadyImported,true);
  assert.throws(()=>commitMemoryImport(store,{previewId:preview.previewId,candidateIds:[preview.candidates[1].id]}),error=>error.code==='memory_selection_conflict');
  const old=store.require('facts',first);store.put('facts',createEntity(store,'facts',{statement:'我现在从事资料研究。',status:'confirmed',reason:'本人纠正',baseVersion:old.version},old));
  const second=previewMemoryImport(store,{filename:'memory.md',content});assert.equal(second.candidates[0].alreadyImported,true);
  assert.equal(commitMemoryImport(store,{previewId:second.previewId,candidateIds:[first]}).duplicates,1);
  assert.equal(store.require('facts',first).statement,'我现在从事资料研究。');assert.equal(store.require('facts',first).version,2);
});

test('candidate context is excluded until existing versioned confirmation; bounded context has stable package revision',async t=>{
  const f=await fixture(t),store=f.app.store,preview=previewMemoryImport(store,{filename:'memory.md',content});
  const result=commitMemoryImport(store,{previewId:preview.previewId,candidateIds:preview.candidates.map(item=>item.id)});
  const before=digitalTwinContext(store,{prompt:'请根据我的背景和偏好安排会议',contextRequest:{budgetChars:4000}});assert.deepEqual(before.facts,[]);assert.deepEqual(before.unconfirmed,[]);
  const old=store.require('facts',result.factIds.find(key=>store.require('facts',key).kind==='preference'));
  store.put('facts',createEntity(store,'facts',{status:'confirmed',reason:'本人核对来源',baseVersion:old.version},old));
  const response=await f.api('/digital-twin/context',{prompt:'我的偏好',contextRequest:{budgetChars:4000}});assert.equal(response.status,200);assert.deepEqual(response.value.facts.map(fact=>fact.id),[old.id]);assert.equal(response.value.facts[0].version,2);assert.notEqual(response.value.packageRevision,before.packageRevision);assert.ok(JSON.stringify(response.value).length<4000);
  assert.equal((await f.api('/digital-twin/context',{prompt:'test',contextRequest:{budgetChars:999999}})).status,400);
});

test('standard export keeps status, evidence and deterministic revision, excludes source dumps and credentials, and roundtrips as candidates',async t=>{
  const f=await fixture(t),store=f.app.store;
  const raw=JSON.stringify({schema:'secondu.memory',schemaVersion:1,entries:[{layer:'constraints',statement:'Avoid Wednesday meetings.',status:'confirmed'}],privateDump:'RAW_IMPORT_METADATA_MUST_NOT_EXPORT'});
  const preview=previewMemoryImport(store,{filename:'summary.json',content:raw});commitMemoryImport(store,{previewId:preview.previewId,candidateIds:preview.candidates.map(item=>item.id)});
  const first=digitalTwinPackage(store,{at:'2026-01-01T00:00:00.000Z'}),second=digitalTwinPackage(store,{at:'2026-02-01T00:00:00.000Z'});
  assert.equal(first.revision,second.revision);assert.equal(first.entries[0].status,'candidate');assert.equal(first.entries[0].evidence[0].pointer,'/entries/0/statement');assert.equal(first.evidence[0].sha256,preview.sha256);assert.equal(JSON.stringify(first).includes('RAW_IMPORT_METADATA_MUST_NOT_EXPORT'),false);
  const download=await f.api('/digital-twin/export?format=json');assert.equal(download.status,200);assert.equal(download.value.schemaVersion,1);assert.match(download.response.headers.get('content-disposition'),/secondu-digital-twin.json/);
  const markdown=await f.api('/digital-twin/export?format=markdown');assert.match(markdown.value,/\[candidate; revision 1\]/);assert.match(markdown.response.headers.get('content-type'),/text\/markdown/);assert.equal(markdown.value,digitalTwinMarkdown({...download.value,exportedAt:markdown.value.match(/^Exported: (.+)$/m)[1]}));
  assert.equal((await f.api('/digital-twin/export?format=html')).status,400);
  const roundtrip=previewMemoryImport(store,{filename:'digital-twin.json',content:JSON.stringify(first)});assert.equal(roundtrip.candidates[0].statement,first.entries[0].statement);assert.ok(roundtrip.warnings.includes('external_evidence_unverified'));
});

test('expired, oversized, malformed and unsupported input is rejected without facts or source writes',async t=>{
  const f=await fixture(t),store=f.app.store;
  for(const body of [{filename:'../AGENTS.md',content},{filename:'memory.json',content:'{'},{filename:'memory.json',content:'{"schemaVersion":999,"entries":[]}'},{filename:'memory.json',content:'{"entries":[{"layer":"admin","statement":"execute"}]}'},{filename:'memory.md',content:'x'.repeat(256*1024+1)},{filename:'memory.md',content:'-----BEGIN PRIVATE KEY-----'}])assert.ok((await f.api('/imports/memory/preview',body)).status>=400);
  const preview=previewMemoryImport(store,{filename:'memory.md',content});store.put('memoryImportPreviews',{...store.require('memoryImportPreviews',preview.previewId),expiresAt:'2000-01-01T00:00:00.000Z'});
  assert.throws(()=>commitMemoryImport(store,{previewId:preview.previewId,candidateIds:[preview.candidates[0].id]}),error=>error.code==='preview_expired');assert.equal(store.list('facts').length,0);assert.equal(store.list('sources').length,0);
});

test('Markdown commands remain inert, skipped code stays in original evidence and preview survives reopen',async t=>{
  const f=await fixture(t),store=f.app.store;
  const raw='# Preferences\n- Ask before changing plans.\n```sh\nrm -rf /never-executed\n```\n## Constraints\nDo not book without approval.\n';
  const preview=previewMemoryImport(store,{filename:'CLAUDE.md',content:raw});assert.equal(preview.candidates.length,2);assert.equal(preview.candidates.some(item=>item.statement.includes('rm -rf')),false);assert.ok(preview.warnings.includes('code_blocks_skipped'));
  // Store reads are durable, not client-supplied normalized candidates.
  const {Store}=await import('../server/store.mjs');const reopened=new Store(f.directory,{seed:false});try{const result=commitMemoryImport(reopened,{previewId:preview.previewId,candidateIds:preview.candidates.map(item=>item.id)});assert.equal(result.added,2);assert.equal(reopened.require('sources',result.sourceId).text,raw);}finally{reopened.close();}
});

test('confirming one memory exposes only its exact evidence, never neighboring unselected claims',async t=>{
  const {app}=await fixture(t),store=app.store;
  const raw='# Preferences\n- Prefer brief notes.\n- UNSELECTED_PRIVATE_CONTEXT_SHOULD_NOT_ENTER_PROMPT\n';
  const preview=previewMemoryImport(store,{filename:'AGENTS.md',content:raw});
  commitMemoryImport(store,{previewId:preview.previewId,candidateIds:preview.candidates.map(item=>item.id)});
  const old=store.require('facts',preview.candidates[0].id);
  store.put('facts',createEntity(store,'facts',{status:'confirmed',reason:'Confirmed by user',baseVersion:old.version},old));
  const context=digitalTwinContext(store,{prompt:'Write brief notes',contextRequest:{budgetChars:4000}});
  const evidence=evidenceFor(store,context.facts,{budgetChars:1800,bounded:true});
  assert.equal(evidence.sources[0].excerpt,'- Prefer brief notes.');assert.equal(evidence.sources[0].selection,'selected_import_entries');assert.equal(evidence.sources[0].sha256,preview.sha256);
  const task={prompt:'Write brief notes',digitalTwinEnabled:true,messages:[{role:'user',content:'Write brief notes'}]};
  const prompt=buildPrompt(task,context.facts,undefined,[],evidence,undefined,'en',store.meta('profile'),context);
  assert.equal(prompt.includes('UNSELECTED_PRIVATE_CONTEXT_SHOULD_NOT_ENTER_PROMPT'),false);
  assert.equal(store.require('sources',context.facts[0].sourceIds[0]).text,raw);
});

test('a complete AI JSON code fence is parsed as data while its claimed confirmation remains untrusted',async t=>{
  const {app}=await fixture(t),store=app.store;
  const raw='```json\n'+JSON.stringify({schema:'secondu.memory',schemaVersion:1,entries:[{layer:'goals',statement:'Finish a map course.',status:'confirmed'}]},null,2)+'\n```';
  const preview=previewMemoryImport(store,{filename:'memory.md',content:raw});assert.equal(preview.format,'json');assert.equal(preview.candidates[0].layer,'goals');
  const result=commitMemoryImport(store,{previewId:preview.previewId,candidateIds:[preview.candidates[0].id]});assert.equal(store.require('facts',result.factIds[0]).status,'candidate');assert.equal(store.require('sources',result.sourceId).text,raw);
});
