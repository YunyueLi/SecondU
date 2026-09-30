import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {createEntity,assertDeletable} from '../server/domain.mjs';
import {parsePortraitDraft} from '../src/cognition/portrait.ts';
import {createSeed} from '../server/seed.mjs';
import {createDemoExpansion} from '../server/demo-expansion.mjs';
import {createDemoLife} from '../server/demo-life.mjs';
import {applyDemoPortraits} from '../server/demo-portraits.mjs';
function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'hither-portrait-'));const store=new Store(directory,{seed:false});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});store.put('sources',{id:'source-a',title:'Fictional source',text:'fixture',kind:'note',demo:true,createdAt:new Date().toISOString()});return {store,directory};}
const entry=(patch={})=>({id:'entry-a',kind:'preference',statement:'Prefers written agendas',status:'candidate',privacy:'private',sourceIds:['source-a'],...patch});
const body=(entries=[entry()])=>({name:'Fictional contact',role:'Colleague',description:'Known context',sourceIds:[],portrait:{schema:'hither.person.v1',entries}});
test('portrait persists independently of personal facts, with revision evidence and optimistic conflict checks',t=>{const {store,directory}=fixture(t);const first=createEntity(store,'people',body());store.put('people',first);assert.equal(first.portrait.version,1);assert.deepEqual(first.sourceIds,['source-a']);assert.equal(store.list('facts').length,0);const second=createEntity(store,'people',{...body([entry({status:'confirmed',validFrom:'2026-01',note:'Manually confirmed'})]),basePortraitVersion:1},first);store.put('people',second);assert.equal(second.portrait.history.length,2);assert.equal(second.portrait.history[0].entries[0].status,'candidate');assert.throws(()=>createEntity(store,'people',{...body(),basePortraitVersion:1},second),e=>e.code==='portrait_version_conflict');const reopened=new Store(directory,{seed:false});assert.deepEqual(reopened.get('people',first.id).portrait,second.portrait);reopened.close();});
test('legacy person edits preserve portrait and deleting an entry retains historical source protection',t=>{const {store}=fixture(t);const person=createEntity(store,'people',body());store.put('people',person);const legacy=createEntity(store,'people',{description:'Updated overview'},person);assert.deepEqual(legacy.portrait,person.portrait);const cleared=createEntity(store,'people',{...body([]),basePortraitVersion:1},person);store.put('people',cleared);assert.equal(cleared.portrait.entries.length,0);assert.deepEqual(cleared.sourceIds,['source-a']);assert.throws(()=>assertDeletable(store,'sources','source-a'),e=>e.code==='record_in_use');});
test('invalid portrait fields and source references fail without changing stored data',t=>{const {store}=fixture(t);for(const patch of [{kind:'diagnosis'},{status:'certain'},{privacy:'public'},{sourceIds:['missing']},{validFrom:'2026-02-30'},{validFrom:'2026-06',validTo:'2026-01'},{statement:''}])assert.throws(()=>createEntity(store,'people',body([entry(patch)])));assert.throws(()=>createEntity(store,'people',body([entry(),entry()])));assert.equal(store.list('people').length,0);});
test('client timestamps and version history cannot replace server-owned provenance',t=>{const {store}=fixture(t);const person=createEntity(store,'people',{...body([entry({recordedAt:'1900-01-01'})]),portrait:{...body().portrait,version:999,history:[{version:999,entries:[]}]}});assert.equal(person.portrait.version,1);assert.equal(person.portrait.history.length,1);assert.notEqual(person.portrait.entries[0].recordedAt,'1900-01-01');});

test('JSON application rejects malformed optional fields before replacing the editable draft',()=>{
 const draft=body().portrait,original=structuredClone(draft),sources=[{id:'source-a'}];
 for(const patch of [{note:{}},{note:0},{validFrom:{}},{validTo:false},{note:'a'.repeat(2001)},{statement:'a'.repeat(5001)},{id:' '},{unexpected:'lost on save'},{validFrom:'2026-02-30'},{validFrom:'2026-06',validTo:'2026-01'},{sourceIds:Array(51).fill('source-a')}]){
  assert.throws(()=>parsePortraitDraft(JSON.stringify({...draft,entries:[entry(patch)]}),sources));
 }
 assert.throws(()=>parsePortraitDraft(JSON.stringify({...draft,entries:[entry(),entry({id:' entry-a '})]}),sources));
 assert.deepEqual(draft,original);
 const parsed=parsePortraitDraft(JSON.stringify({...draft,entries:[entry({note:'A specific observation',validFrom:'2024-02-29',validTo:'2026',sourceIds:['source-a','source-a']})]}),sources);
 assert.equal(parsed[0].note,'A specific observation');assert.equal(parsed[0].validFrom,'2024-02-29');assert.deepEqual(parsed[0].sourceIds,['source-a']);
});

test('invalid optional notes fail instead of being silently discarded by persistence',t=>{
 const {store}=fixture(t);
 for(const note of [0,false,null,{}])assert.throws(()=>createEntity(store,'people',body([entry({note})])),error=>error.code==='invalid_portrait');
 const valid=createEntity(store,'people',body([entry({note:''})]));assert.equal(valid.portrait.entries[0].note,undefined);
});

function installPreviousDemo(store){
 const stamp='2026-09-29T08:00:00.000Z',seed=createSeed(stamp),expansion=createDemoExpansion(stamp),life=createDemoLife(stamp),data={profile:seed.profile};
 for(const collection of ['sources','people']){data[collection]=[...(seed[collection]??[]),...(expansion[collection]??[]),...(life[collection]??[])];for(const row of data[collection])store.put(collection,row);}
 store.setMeta('profile',data.profile);store.setMeta('demo-engineer-v4',{matcherVersion:2});
 return {data,stamp};
}

test('fictional self, work, family and friend portraits have inspectable evidence and survive reopening',t=>{
 const {store,directory}=fixture(t),{data,stamp}=installPreviousDemo(store);
 applyDemoPortraits(store,data,stamp);
 for(const id of ['person-self','person-qiao','person-xuan','demo-v2-person-du','demo-v2-person-lin','demo-v2-person-jiang','demo-v2-person-wei']){
  const person=store.require('people',id);assert.ok(person.portrait.entries.length>=2,id);assert.equal(person.portrait.version,1);
  assert.deepEqual(person.portrait.history[0].entries,person.portrait.entries);
  for(const row of person.portrait.entries){assert.ok(row.sourceIds.length);for(const sourceId of row.sourceIds){const source=store.require('sources',sourceId);assert.equal(source.demo,true);assert.ok(source.text.length>0);assert.ok(person.sourceIds.includes(sourceId));}}
 }
 const self=store.require('people','person-self');assert.equal(new Set(self.portrait.entries.map(row=>row.kind)).size,7);assert.ok(self.portrait.entries.some(row=>row.status==='inferred'));assert.ok(self.portrait.entries.some(row=>row.kind==='goal'&&row.status==='candidate'));
 assert.equal(store.list('facts').length,0,'contact portraits must not create personal facts');
 const before=store.list('people'),report=store.meta('demo-person-portraits-v2');applyDemoPortraits(store,data,stamp);assert.deepEqual(store.list('people'),before);
 const reopened=new Store(directory,{seed:false});assert.deepEqual(reopened.list('people'),before);assert.deepEqual(reopened.meta('demo-person-portraits-v2'),report);reopened.close();
});

test('portrait fixture upgrades preserve edited contacts, edited evidence, existing portraits and deletions',t=>{
 const {store}=fixture(t),{data,stamp}=installPreviousDemo(store);
 const modified={...store.require('people','person-qiao'),description:'User corrected this contact'};store.put('people',modified);
 const customized=createEntity(store,'people',{portrait:body().portrait,basePortraitVersion:0},store.require('people','person-chen'));store.put('people',customized);
 const changedSource={...store.require('sources','demo-v2-source-chat-du'),text:'User corrected this source'};store.put('sources',changedSource);
 const mother=store.require('people','demo-v2-person-du');store.delete('people','demo-v2-person-lin');
 applyDemoPortraits(store,data,stamp);
 assert.deepEqual(store.require('people','person-qiao'),modified);assert.deepEqual(store.require('people','person-chen'),customized);assert.deepEqual(store.require('people',mother.id),mother);assert.deepEqual(store.require('sources',changedSource.id),changedSource);assert.equal(store.get('people','demo-v2-person-lin'),undefined);
 assert.ok(store.require('people','person-self').portrait);
});

test('formal spaces never receive authored portrait examples',t=>{
 const {store}=fixture(t),{data,stamp}=installPreviousDemo(store);store.setMeta('profile',{name:'Personal space',description:'',demo:false});const before=store.list('people');
 applyDemoPortraits(store,data,stamp);assert.deepEqual(store.list('people'),before);assert.equal(store.get('meta','demo-person-portraits-v2'),undefined);
});
