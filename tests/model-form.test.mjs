import test from 'node:test';
import assert from 'node:assert/strict';
import { saveConnectionForm } from '../src/models/connectionSave.ts';
const saved={id:'same-connection',model:'openrouter/free',hasKey:true};
function harness(overrides={}) {
 const state={draft:{name:' OpenRouter ',model:'openrouter/free'},key:'dummy-local-fixture',stored:undefined};
 const original=structuredClone(state);
 const options={persist:async()=>saved,onPersisted:async connection=>{state.stored=connection;},acceptInput:()=>{state.draft={name:'OpenRouter',model:'openrouter/free'};state.key='';},...overrides};
 return {state,original,options};
}
test('failed save preserves every draft field and password without treating the connection as saved',async()=>{
 const h=harness({persist:async()=>{throw new Error('local validation failed');}});
 await assert.rejects(saveConnectionForm(h.options),/validation failed/);assert.deepEqual(h.state,h.original);
});
test('failed test preserves input but retains the saved identity for a safe retry',async()=>{
 for(const testResult of [async()=>({ok:false,message:'invalid model'}),async()=>{throw new Error('service unavailable');}]){
  const h=harness({test:testResult});try{await saveConnectionForm(h.options);}catch(error){assert.match(error.message,/unavailable/);}
  assert.deepEqual(h.state.draft,h.original.draft);assert.equal(h.state.key,h.original.key);assert.equal(h.state.stored.id,saved.id);
 }
});
test('successful save or test acknowledges saved input and clears only the password entry',async()=>{
 for(const testResult of [undefined,async()=>({ok:true})]){
  const h=harness({test:testResult});await saveConnectionForm(h.options);assert.equal(h.state.key,'');assert.deepEqual(h.state.stored,saved);assert.equal(h.state.draft.model,saved.model);
 }
});
