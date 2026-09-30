import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceAfterPatch, reconcileAppearanceLoad } from '../src/appearanceState.ts';
import { defaultAppearance } from '../server/local-appearance.mjs';

const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
globalThis.document={documentElement:{lang:''}};
globalThis.window=new EventTarget();
const {getLocale,setLocale,subscribeLocale}=await import('../src/i18n.ts');
function otherWindowLocale(value){values.set('hither.locale',value);const event=new Event('storage');Object.assign(event,{key:'hither.locale',newValue:value});window.dispatchEvent(event);}

test('another window language change updates the current appearance before a theme edit',()=>{
  setLocale('zh-CN');let current={...defaultAppearance};
  const unsubscribe=subscribeLocale(()=>{current=appearanceAfterPatch(current,{},getLocale());});
  otherWindowLocale('en');
  assert.equal(current.language,'en');assert.equal(document.documentElement.lang,'en');
  const patch={theme:'dark'};current=appearanceAfterPatch(current,patch,getLocale());
  assert.equal(current.language,'en');assert.equal(current.theme,'dark');
  assert.deepEqual(patch,{theme:'dark'}); // Only the edited field is sent to the merging API.
  // Even a delayed callback with a stale snapshot keeps the latest shared language.
  assert.equal(appearanceAfterPatch(defaultAppearance,{accent:'green'},getLocale()).language,'en');
  unsubscribe();
});

test('an old appearance response cannot undo a language change made while it was loading',()=>{
  const staleResponse={...defaultAppearance,language:'zh-CN'};
  const result=reconcileAppearanceLoad(defaultAppearance,staleResponse,defaultAppearance,{theme:'dark'},'en',true);
  assert.equal(result.appearance.language,'en');assert.equal(result.appearance.theme,'dark');
  assert.deepEqual(result.patch,{theme:'dark'});
  // Without a newer local change, the durable server language remains authoritative.
  const fresh=reconcileAppearanceLoad(defaultAppearance,{...defaultAppearance,language:'en'},defaultAppearance,{},'zh-CN',false);
  assert.equal(fresh.appearance.language,'en');assert.deepEqual(fresh.patch,{});
});

test('old settings migrate only the missing language, and explicit language edits are retained',()=>{
  const {language,...oldSettings}=defaultAppearance;
  const migrated=reconcileAppearanceLoad(defaultAppearance,oldSettings,defaultAppearance,{},'en',false);
  assert.deepEqual(migrated.patch,{language:'en'});
  const explicit=reconcileAppearanceLoad(defaultAppearance,defaultAppearance,defaultAppearance,{language:'en',fontSize:16},'en',false);
  assert.equal(explicit.appearance.language,'en');assert.deepEqual(explicit.patch,{language:'en',fontSize:16});
});
