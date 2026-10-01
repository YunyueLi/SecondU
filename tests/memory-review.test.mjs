import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { previewMemoryImport, commitMemoryImport, reviewMemoryImport, digitalTwinPackage } from '../server/memory-import.mjs';
import { evidenceFor, contextFor } from '../server/runner.mjs';
import { createTwinDataSource, twinResult } from '../server/twin-mcp-data.mjs';
import { TwinMcpGrants } from '../server/twin-mcp-grants.mjs';

async function setup(t) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-memory-review-')); let calls=0;
  const deny=()=>{calls++;throw Error('Review may not call a model');};
  const app=createApp({dataDir:directory,seed:false,scheduler:false,executionPolicy:'personal',computerInfo:{codexAvailable:false},runCodex:deny,modelFetch:deny});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  return {app,store:app.store,calls:()=>calls,async request(route,method='GET',body){const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api${route}`,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}};
}
const input={filename:'summary.json',content:JSON.stringify({schema:'secondu.memory',schemaVersion:1,entries:[
  {layer:'facts',statement:'Works at a fictional neighborhood library.'},
  {layer:'preferences',statement:'Prefer afternoon visits.'},
  {layer:'goals',statement:'Finish a map course this year.'},
  {layer:'constraints',statement:'Do not schedule visits on Wednesday.'},
  {layer:'values',statement:'Leave room for others to decide.'},
  {layer:'capabilities',statement:'Can maintain a small reading catalogue.'},
  {layer:'decisions',statement:'Use a paper checklist for this project.'},
  {layer:'notes',statement:'UNSELECTED_IMPORT_NOTE'}
]})};
const selection=preview=>preview.candidates.filter(item=>item.layer!=='notes').map(({id,statement,layer})=>({id,statement,layer}));

test('HTTP review confirms only selected edited entries with two revisions and preserves all eight import layers',async t=>{
  const f=await setup(t),preview=(await f.request('/imports/memory/preview','POST',input)).data;
  assert.deepEqual(preview.candidates.map(item=>item.layer),['facts','preferences','goals','constraints','values','capabilities','decisions','notes']);
  const entries=selection(preview).map(item=>item.layer==='preferences'?{...item,statement:'Prefer morning visits.'}:item);
  assert.equal((await f.request('/imports/memory/review','POST',{previewId:preview.previewId,entries})).status,400);
  assert.equal(f.store.list('sources').length,0);
  const response=await f.request('/imports/memory/review','POST',{previewId:preview.previewId,entries,confirmed:true});
  assert.equal(response.status,200);assert.equal(response.data.added,7);assert.equal(response.data.facts.length,7);
  assert.equal(f.store.list('facts').length,7);assert.equal(f.store.get('facts',preview.candidates[7].id),undefined);
  const preference=response.data.facts.find(fact=>fact.kind==='preference');
  assert.equal(preference.version,2);assert.equal(preference.status,'confirmed');assert.equal(preference.statement,'Prefer morning visits.');
  assert.deepEqual(preference.history.map(item=>[item.version,item.statement,item.status]),[[1,'Prefer afternoon visits.','candidate'],[2,'Prefer morning visits.','confirmed']]);
  assert.equal(f.store.require('sources',response.data.sourceId).text,input.content);
  const exported=digitalTwinPackage(f.store),record=exported.entries.find(entry=>entry.id===preference.id);
  assert.equal(record.evidence[0].excerpt,'Prefer afternoon visits.');assert.equal(record.evidence[0].pointer,'/entries/1/statement');
  assert.equal(exported.entries.find(entry=>entry.id===preview.candidates[2].id).layer,'goals');
  assert.equal(f.store.list('tasks').length,0);assert.equal(f.store.list('goals').length,0);assert.equal(f.store.list('twinMcpGrants').length,0);assert.equal(f.calls(),0);
});

test('reviewed v2 reaches a queued task context without starting it; unselected candidates and raw neighbors stay out',async t=>{
  const f=await setup(t),preview=previewMemoryImport(f.store,input),preference=preview.candidates[1];
  // Preserve another imported candidate to prove the selector still excludes it.
  commitMemoryImport(f.store,{previewId:preview.previewId,candidateIds:[preview.candidates[7].id]});
  const result=reviewMemoryImport(f.store,{previewId:preview.previewId,entries:[{id:preference.id,statement:'Prefer morning visits.',layer:'preferences'}],confirmed:true});
  const created=await f.request('/tasks','POST',{prompt:'Plan a morning visit.',mode:'live',digitalTwinEnabled:true,contextFactIds:result.factIds});
  assert.equal(created.status,201);assert.equal(created.data.status,'queued');assert.equal(f.calls(),0);
  const context=await f.request(`/tasks/${created.data.id}/context`);
  assert.equal(context.status,200);assert.equal(context.data.facts.find(fact=>fact.id===preference.id).version,2);
  assert.equal(JSON.stringify(context.data).includes('UNSELECTED_IMPORT_NOTE'),false);
  const evidence=evidenceFor(f.store,context.data.facts,{budgetChars:1800,bounded:true});
  assert.equal(evidence.sources[0].excerpt,'Prefer afternoon visits.');assert.equal(JSON.stringify(evidence).includes('UNSELECTED_IMPORT_NOTE'),false);
  assert.equal(f.store.list('tasks')[0].status,'queued');assert.equal(f.calls(),0);
  assert.deepEqual(contextFor(f.store,{...created.data,digitalTwinEnabled:false}),[]);
});

test('review retries bind edits and layer, preserve later corrections, and reject cross-preview or existing entries atomically',async t=>{
  const f=await setup(t),preview=previewMemoryImport(f.store,input),entries=selection(preview).slice(0,2),body={previewId:preview.previewId,entries,confirmed:true};
  const result=reviewMemoryImport(f.store,body),fact=f.store.require('facts',entries[0].id);
  const corrected=await f.request(`/facts/${fact.id}`,'PUT',{baseVersion:fact.version,statement:'A later explicit correction.',reason:'Changed by user'});
  assert.equal(corrected.status,200);assert.equal(corrected.data.version,3);
  const retry=reviewMemoryImport(f.store,{...body,entries:[...entries].reverse()});
  assert.equal(retry.added,0);assert.equal(retry.alreadyImported,true);assert.equal(retry.facts.find(item=>item.id===fact.id).statement,'A later explicit correction.');
  assert.throws(()=>reviewMemoryImport(f.store,{...body,entries:entries.map(item=>({...item,layer:'notes'}))}),error=>error.code==='memory_review_conflict');
  const next=previewMemoryImport(f.store,input);
  assert.throws(()=>reviewMemoryImport(f.store,{previewId:next.previewId,entries:[entries[0],{id:next.candidates[2].id,statement:'Selected new goal.',layer:'goals'}],confirmed:true}),error=>error.code==='memory_already_imported');
  assert.equal(f.store.get('facts',next.candidates[2].id),undefined);assert.equal(f.store.list('facts').length,result.added);
  const unrelated=previewMemoryImport(f.store,{filename:'other.md',content:'# Preferences\n- A different source.'});
  assert.throws(()=>reviewMemoryImport(f.store,{previewId:unrelated.previewId,entries,confirmed:true}),error=>error.status===400);
  assert.equal((await f.request('/spaces/personal','POST',{})).status,200);
  assert.equal((await f.request('/spaces/personal/imports/memory/review','POST',body)).status,404);
});

test('late write failure rolls back the whole review and retry restores an unchanged confirmed batch',async t=>{
  const f=await setup(t),preview=previewMemoryImport(f.store,input),body={previewId:preview.previewId,entries:selection(preview),confirmed:true};
  const put=f.store.put.bind(f.store);let count=0;
  f.store.put=(collection,value)=>{if(collection==='facts'&&++count===2)throw Error('Synthetic storage failure');return put(collection,value);};
  assert.throws(()=>reviewMemoryImport(f.store,body),/Synthetic storage failure/);
  f.store.put=put;
  for(const collection of ['facts','sources','memoryImportItems','memoryImportReviews'])assert.equal(f.store.list(collection).length,0);
  assert.equal(reviewMemoryImport(f.store,body).added,7);assert.equal(f.store.list('facts').every(fact=>fact.version===2),true);
});

test('edited layers stay portable, and bounded original excerpts remain readable by the actual MCP data source',async t=>{
  const f=await setup(t),raw='# Notes\n'+' '.repeat(4500)+'- '+ 'x'.repeat(2000)+'\n';
  const preview=previewMemoryImport(f.store,{filename:'memory.md',content:raw}),candidate=preview.candidates[0];
  assert.ok(candidate.evidence.excerpt.length<=4000);assert.ok(candidate.evidence.excerpt.includes('x'.repeat(2000)));assert.equal(candidate.evidence.truncated,true);
  const result=reviewMemoryImport(f.store,{previewId:preview.previewId,entries:[{id:candidate.id,statement:'Visits must stay within the stated budget.',layer:'constraints'}],confirmed:true});
  const exported=digitalTwinPackage(f.store),entry=exported.entries[0];
  assert.equal(entry.layer,'constraints');assert.equal(entry.kind,'constraint');assert.equal(entry.revision,2);assert.equal(entry.evidence[0].truncated,true);
  const grants=new TwinMcpGrants(f.store),grant=grants.create({clientName:'Synthetic client',baseRevision:exported.revision,scopes:['constraints'],entryIds:result.factIds,includeEvidence:true,enabled:true,acknowledgeExternal:true});
  const stored=f.store.require('twinMcpGrants',grant.id),state=createTwinDataSource(stored.configFile)();
  const returned=twinResult(state);assert.equal(returned.entries[0].id,candidate.id);assert.equal(returned.entries[0].evidence[0].truncated,true);assert.equal(returned.entries[0].evidence[0].excerpt,candidate.evidence.excerpt);
  assert.equal(f.store.require('sources',result.sourceId).text,raw);assert.equal(f.calls(),0);
});

test('the existing immutable-source HTTP boundary preserves imported evidence and its original bytes',async t=>{
  const f=await setup(t),preview=previewMemoryImport(f.store,input),entry=selection(preview)[1];
  const result=reviewMemoryImport(f.store,{previewId:preview.previewId,entries:[entry],confirmed:true});
  const original=f.store.require('sources',result.sourceId);
  const renamed=await f.request(`/sources/${original.id}`,'PUT',{title:'My reviewed context'});
  assert.equal(renamed.status,405);assert.equal(renamed.data.code,'immutable_source');
  const replaced=await f.request(`/sources/${original.id}`,'PUT',{text:'A replacement source with different evidence.'});
  assert.equal(replaced.status,405);assert.equal(replaced.data.code,'immutable_source');
  assert.deepEqual(f.store.require('sources',original.id),original);
  const evidence=evidenceFor(f.store,result.facts,{budgetChars:1800,bounded:true});
  assert.equal(evidence.sources[0].selection,'selected_import_entries');assert.equal(JSON.stringify(evidence).includes('UNSELECTED_IMPORT_NOTE'),false);
  assert.equal(evidence.sources[0].sha256,original.memoryImport.sha256);
});
