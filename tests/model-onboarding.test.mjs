import test from 'node:test';
import assert from 'node:assert/strict';
import { accountModels, completeConnectionSetup, draftForProvider } from '../src/models/modelSetup.ts';

test('reselecting the active provider preserves the in-progress key and model',()=>{
  const draft={provider:'openai',name:'My connection',baseUrl:'https://api.openai.com/v1',api:'responses',reasoningEffort:'high',model:'selected-model',apiKey:'local-test-key',appTitle:'SecondU'};
  assert.equal(draftForProvider(draft,{id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1',api:'responses'}),draft);
});

test('switching provider applies its endpoint and protocol without carrying another provider key or model',()=>{
  const draft={provider:'openai',name:'My connection',baseUrl:'https://api.openai.com/v1',api:'responses',reasoningEffort:'high',model:'selected-model',apiKey:'local-test-key',appTitle:'SecondU'};
  const selected=draftForProvider(draft,{id:'anthropic',name:'Anthropic',baseUrl:'https://api.anthropic.com/v1',api:'messages',reasoningEffort:'low'});
  assert.deepEqual(selected,{provider:'anthropic',name:'Anthropic',baseUrl:'https://api.anthropic.com/v1',api:'messages',reasoningEffort:'low',model:'',apiKey:'',appTitle:''});
  assert.equal(draft.apiKey,'local-test-key');
  const custom=draftForProvider(selected,{id:'custom',name:'Custom service',baseUrl:'',api:'responses'});
  assert.equal(custom.baseUrl,'');assert.equal(custom.reasoningEffort,'medium');
});

test('catalogue keeps provider IDs and ordering without inserting a guessed model', () => {
  assert.deepEqual(accountModels({models:[{id:'vendor/exact-id',name:'Readable name'},{id:'second'},{id:'vendor/exact-id',name:'Duplicate'},null,{name:'No ID'}]}),[{id:'vendor/exact-id',name:'Readable name'},{id:'second',name:'second'}]);
  assert.deepEqual(accountModels({models:[]}),[]);
  assert.throws(()=>accountModels({data:[]}),/could not be read/);
});

test('an unsuccessful test preserves saved identity and never changes the default', async () => {
  const order=[];
  const result=await completeConnectionSetup({persist:async()=>({id:'saved'}),onPersisted:connection=>order.push(['saved',connection.id]),test:async()=>({ok:false}),setDefault:async()=>order.push(['default'])});
  assert.deepEqual(order,[['saved','saved']]);
  assert.equal(result.defaultSet,false);
  assert.equal(result.connection.id,'saved');
});

test('a thrown test error retains the persisted identity for retry and never sets default',async()=>{
  let stored,defaultCalled=false;
  await assert.rejects(completeConnectionSetup({persist:async()=>({id:'single-connection'}),onPersisted:value=>{stored=value;},test:async()=>{throw new Error('Test interrupted');},setDefault:async()=>{defaultCalled=true;}}),/Test interrupted/);
  assert.equal(stored.id,'single-connection');assert.equal(defaultCalled,false);
});

test('default changes only after a successful test, while save-only never tests',async()=>{
  const calls=[];
  const steps={persist:async()=>{calls.push('save');return{id:'connection'};},onPersisted:()=>calls.push('acknowledge'),test:async()=>{calls.push('test');return{ok:true};},setDefault:async()=>{calls.push('default');}};
  assert.equal((await completeConnectionSetup(steps)).defaultSet,true);assert.deepEqual(calls,['save','acknowledge','test','default']);
  calls.length=0;await completeConnectionSetup({persist:steps.persist,onPersisted:steps.onPersisted});assert.deepEqual(calls,['save','acknowledge']);
});

test('failed default update is not reported as successful completion',async()=>{
  await assert.rejects(completeConnectionSetup({persist:async()=>({id:'saved'}),onPersisted:()=>{},test:async()=>({ok:true}),setDefault:async()=>{throw new Error('Default update failed');}}),/Default update failed/);
});
