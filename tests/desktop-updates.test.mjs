import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopUpdateStore, createUnsavedChangesRegistry, downloadPercent, hasSessionDrafts, prepareDesktopQuit, updateAction, updateIndicatorVisible } from '../src/desktop-updates.ts';

const idle = { supported:true,currentVersion:'0.1.4',phase:'idle',canCheckForUpdates:true,canShow:false,sessionInProgress:false };
test('one native feed drives multiple subscribers and an old read cannot erase a newer update event', async () => {
  let emit, resolveRead, subscriptions = 0;
  const bridge = { onChange(callback) { subscriptions++; emit = callback; return () => {}; }, get: () => new Promise(resolve => { resolveRead = resolve; }) };
  const store = createDesktopUpdateStore(() => bridge);
  const a = store.subscribe(() => {}), b = store.subscribe(() => {});
  assert.equal(subscriptions, 1);
  emit({ ...idle, phase:'available',updateVersion:'0.1.5' });
  resolveRead(idle); await Promise.resolve(); await Promise.resolve();
  assert.equal(store.getSnapshot().phase, 'available');
  a(); b(); store.dispose();
});
test('opening the update window retains native availability until native state changes', async () => {
  const available = { ...idle,phase:'available',updateVersion:'0.1.5' };
  const store = createDesktopUpdateStore(() => ({ onChange:()=>()=>{},get:async()=>available,show:async()=>available }));
  store.subscribe(() => {}); await Promise.resolve(); await Promise.resolve();
  await store.show(); assert.equal(updateIndicatorVisible(store.getSnapshot()),true);
  store.dispose();
});
test('native update actions do not fabricate a renderer download or installation command', () => {
  assert.equal(updateAction(idle),'check');
  for(const phase of ['idle','up-to-date','no-update','error']) assert.equal(updateAction({...idle,phase,canShow:true}),'check');
  for(const phase of ['available','downloading','downloaded','extracting','ready','awaiting-relaunch','installing']) assert.equal(updateAction({...idle,phase,canShow:true}),'show');
  for(const phase of ['downloading','downloaded','extracting','ready','awaiting-relaunch','installing']) assert.equal(updateAction({...idle,phase,canShow:false}),undefined);
  assert.equal(updateAction({...idle,phase:'checking',canCheckForUpdates:false}),undefined);
  assert.equal(updateAction({...idle,phase:'error',canCheckForUpdates:false}),'refresh');
  assert.equal(updateAction({...idle,supported:false}),undefined);
  assert.equal(updateIndicatorVisible({...idle,phase:'up-to-date'}),false);
  assert.equal(updateIndicatorVisible({...idle,phase:'error'}),false);
  assert.equal(updateIndicatorVisible({...idle,phase:'no-update',noUpdateReason:'system-too-old'}),false);
});
test('download percentage uses real bounded byte counts and remains unknown without a valid total', () => {
  assert.equal(downloadPercent({...idle,downloadedBytes:42,totalBytes:100}),42);
  assert.equal(downloadPercent({...idle,downloadedBytes:110,totalBytes:100}),100);
  for(const state of [{},{downloadedBytes:10},{downloadedBytes:10,totalBytes:0},{downloadedBytes:NaN,totalBytes:100},{downloadedBytes:-1,totalBytes:100}]) assert.equal(downloadPercent({...idle,...state}),undefined);
});
test('quit registry aggregates independent editors, updates live, and returns only booleans', () => {
  const registry = createUnsavedChangesRegistry();
  let dirty = true, uploading = true;
  const a=registry.register(()=>({unsaved:dirty,busy:false,content:'fixture text never returned'}));
  const b=registry.register(()=>({unsaved:false,busy:uploading}));
  assert.deepEqual(registry.read(),{unsaved:true,busy:true});
  dirty=false; assert.deepEqual(registry.read(),{unsaved:false,busy:true});
  uploading=false; assert.deepEqual(registry.read(),{unsaved:false,busy:false});
  a();b(); assert.deepEqual(registry.read(),{unsaved:false,busy:false});
});
test('failed readers block a quit, and only a clean reply freezes further input', () => {
  let frozen=0;
  const freeze=()=>{frozen++;};
  for(const value of [{unsaved:true,busy:false},{unsaved:false,busy:true}]) assert.deepEqual(prepareDesktopQuit(()=>value,freeze),value);
  assert.equal(frozen,0);
  assert.deepEqual(prepareDesktopQuit(()=>{throw Error('fixture');},freeze),{unsaved:true,busy:true});
  assert.deepEqual(prepareDesktopQuit(()=>({unsaved:false,busy:false}),freeze),{unsaved:false,busy:false});
  assert.equal(frozen,1);
  const registry=createUnsavedChangesRegistry();registry.register(()=>{throw Error('fixture');});
  assert.deepEqual(registry.read(),{unsaved:true,busy:true});
});
test('closed editors and other spaces retain session draft protection without inspecting unrelated storage', () => {
  function storage(entries){return {length:entries.length,key:index=>entries[index][0],getItem:key=>entries.find(item=>item[0]===key)?.[1]??null};}
  assert.equal(hasSessionDrafts(storage([['hither.agent-room.draft.fixture','unsent'] ])),true);
  assert.equal(hasSessionDrafts(storage([['hither.space.personal:hither.artifact.fixture','{"content":"draft","baseContent":"saved","baseVersion":1}']])),true);
  assert.equal(hasSessionDrafts(storage([['hither.agent-room.draft.fixture','  '],['unrelated','private']])),false);
  for(const value of ['{}','null','invalid','{"content":""}','{"content":"saved","baseContent":"saved","baseVersion":1}']) assert.equal(hasSessionDrafts(storage([['hither.artifact.fixture',value]])),false);
  assert.equal(hasSessionDrafts(storage([['hither.artifact.fixture','{"content":"","baseContent":"deleted text","baseVersion":1}']])),true);
  assert.equal(hasSessionDrafts(storage([['unrelated:hither.agent-room.draft.fixture','text'],['hither.space.unknown:hither.agent-room.draft.fixture','text']])),false);
});
