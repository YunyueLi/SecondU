import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationPreferencesClient,normalizePinnedModules,readLegacyNavigationPreferences} from '../src/optional-navigation-model.mjs';

const storage=values=>({getItem:key=>values[key]??null});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const empty={pinned:[],financeExpanded:false,agentsExpanded:true};

test('legacy migration reads explicit pinned and expanded values, including all unpinned and collapsed',()=>{
  const key='hither.space.personal:hither.optionalModules.pinned.v1';
  assert.deepEqual(readLegacyNavigationPreferences(storage({[key]:'["finance","agents","finance","settings"]','hither.financeNavigationOpen':'true'}),key),{pinned:['agents','finance'],financeExpanded:true});
  assert.deepEqual(readLegacyNavigationPreferences(storage({[key]:'[]','hither.financeNavigationOpen':'false'}),key),{pinned:[],financeExpanded:false});
  assert.equal(readLegacyNavigationPreferences(storage({}),key),null);
  assert.deepEqual(normalizePinnedModules(['finance','unknown','finance']),['finance']);
  assert.throws(()=>readLegacyNavigationPreferences(storage({[key]:'{'}),key));
  assert.throws(()=>readLegacyNavigationPreferences({getItem(){throw new Error('blocked');}},key),/blocked/);
});

test('an empty browser does not initialize server defaults before another browser can migrate',async()=>{
  let writes=0;
  const client=createNavigationPreferencesClient({read:async()=>null,readLegacy:()=>null,write:async()=>{writes++;return empty;}});
  assert.equal(await client.refresh(),true);
  assert.equal(writes,0);
  assert.deepEqual(client.getSnapshot().value,empty);
});

test('desktop and mobile subscribers wait for the same acknowledged migration',async()=>{
  const acknowledgement=deferred();let reads=0;let mutation;let notifications=0;
  const legacy={pinned:['finance'],financeExpanded:true};
  const client=createNavigationPreferencesClient({read:async()=>{reads++;return null;},readLegacy:()=>legacy,write:body=>{mutation=body;return acknowledgement.promise;}});
  client.subscribe(()=>notifications++);client.subscribe(()=>notifications++);
  const desktop=client.refresh(),mobile=client.refresh();
  assert.equal(desktop,mobile);
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(mutation,{migrate:legacy});assert.equal(reads,1);
  assert.equal(client.getSnapshot().ready,false);
  acknowledgement.resolve(legacy);await desktop;
  assert.deepEqual(client.getSnapshot().value,{...legacy,agentsExpanded:true});
  assert.equal(client.getSnapshot().ready,true);assert.ok(notifications>=4);
});

test('saved server state wins over obsolete pins and expansion on browser reopen',async()=>{
  const saved={pinned:['agents'],financeExpanded:false};
  const client=createNavigationPreferencesClient({read:async()=>saved,readLegacy:()=>{throw new Error('must not read stale browser values');},write:async()=>{throw new Error('must not migrate');}});
  assert.equal(await client.refresh(),true);
  assert.deepEqual(client.getSnapshot().value,{...saved,agentsExpanded:true});
  assert.deepEqual(saved,{pinned:['agents'],financeExpanded:false});
});

test('saved Agents expansion is retained independently from finance expansion',async()=>{
  const saved={pinned:['agents','finance'],financeExpanded:true,agentsExpanded:false};
  const client=createNavigationPreferencesClient({read:async()=>saved,readLegacy:()=>null,write:async()=>{throw new Error('must not initialize defaults');}});
  assert.equal(await client.refresh(),true);
  assert.deepEqual(client.getSnapshot().value,saved);
});

test('Agents expansion waits for the acknowledged save and preserves pins and finance state',async()=>{
  const acknowledgement=deferred();let mutation;
  const saved={pinned:['agents','finance'],financeExpanded:true,agentsExpanded:true};
  const client=createNavigationPreferencesClient({read:async()=>saved,readLegacy:()=>null,write:body=>{mutation=body;return acknowledgement.promise;}});
  await client.refresh();
  const save=client.setAgentsExpanded(false);
  await Promise.resolve();
  assert.deepEqual(mutation,{agentsExpanded:false});
  assert.deepEqual(client.getSnapshot().value,saved);
  acknowledgement.resolve({...saved,agentsExpanded:false});
  assert.equal(await save,true);
  assert.deepEqual(client.getSnapshot().value,{...saved,agentsExpanded:false});
});

test('failed save keeps confirmed state, exposes the failure, and permits a later explicit retry',async()=>{
  let fail=true;let saved=empty;
  const client=createNavigationPreferencesClient({read:async()=>saved,readLegacy:()=>null,write:async body=>{if(fail)throw new Error('disk unavailable');saved={...saved,pinned:body.pin.pinned?['finance']:[]};return saved;}});
  await client.refresh();
  assert.equal(await client.setPinned('finance',true),false);
  assert.deepEqual(client.getSnapshot().value,empty);assert.equal(client.getSnapshot().errorOperation,'save');assert.match(client.getSnapshot().error.message,/disk/);
  fail=false;assert.equal(await client.setPinned('finance',true),true);
  assert.deepEqual(client.getSnapshot().value.pinned,['finance']);assert.equal(client.getSnapshot().error,null);
});

test('failed load or migration never advertises a locally saved preference',async()=>{
  for(const failAt of ['read','migration']){
    let writes=0;
    const client=createNavigationPreferencesClient({read:async()=>{if(failAt==='read')throw new Error('offline');return null;},readLegacy:()=>({pinned:['finance'],financeExpanded:true}),write:async()=>{writes++;throw new Error('disk unavailable');}});
    assert.equal(await client.refresh(),false);assert.equal(client.getSnapshot().ready,false);assert.equal(client.getSnapshot().errorOperation,'load');
    assert.deepEqual(client.getSnapshot().value,empty);
    assert.equal(await client.setPinned('finance',true),false);assert.equal(await client.setAgentsExpanded(false),false);assert.equal(writes,failAt==='read'?0:1);
  }
});

test('a focus reload cannot overtake an in-flight expansion save',async()=>{
  const acknowledgement=deferred();let reads=0;
  const client=createNavigationPreferencesClient({read:async()=>{reads++;return {pinned:['finance'],financeExpanded:true};},readLegacy:()=>null,write:()=>acknowledgement.promise});
  await client.refresh();
  const save=client.setFinanceExpanded(false);const refresh=client.refresh();
  assert.equal(save,refresh);assert.equal(reads,1);
  assert.equal(client.getSnapshot().value.financeExpanded,true);
  acknowledgement.resolve({pinned:['finance'],financeExpanded:false});await save;
  assert.equal(client.getSnapshot().value.financeExpanded,false);
});
