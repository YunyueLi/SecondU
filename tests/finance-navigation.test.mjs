import test from 'node:test';
import assert from 'node:assert/strict';
import {FINANCE_SECTIONS,WORKSPACE_ORDER,financeSection,financeHref,financeFeatureDismissed,dismissFinanceFeature} from '../src/finance-navigation-model.mjs';

test('finance sits between the library and automations with distinct analysis and planning destinations',()=>{
  assert.deepEqual(WORKSPACE_ORDER,['agents','artifacts','finance','automations']);
  assert.deepEqual(FINANCE_SECTIONS.map(section=>section.id),['overview','accounts','holdings','market','liabilities','transactions','planning']);
  assert.equal(new Set(FINANCE_SECTIONS.map(section=>section.id)).size,7);
});

test('finance links keep valid sections and fall back to overview for missing or unknown routes',()=>{
  for(const {id} of FINANCE_SECTIONS){
    assert.equal(financeSection(id),id);
    assert.equal(financeHref(id),`#finance/${id}`);
  }
  for(const value of [undefined,'','history','privacy','settings','../accounts']){
    assert.equal(financeSection(value),'overview');
    assert.equal(financeHref(value),'#finance/overview');
  }
});

test('dismissing the home entry persists without affecting another space',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const personal='hither.space.personal:hither.financeFeatureDismissed.v1';
  const example='hither.space.demo-cn-v1:hither.financeFeatureDismissed.v1';
  assert.equal(financeFeatureDismissed(storage,personal),false);
  assert.equal(dismissFinanceFeature(storage,personal),true);
  assert.equal(financeFeatureDismissed(storage,personal),true);
  assert.equal(financeFeatureDismissed(storage,example),false);
  values.set(example,'false');
  assert.equal(financeFeatureDismissed(storage,example),false);
});

test('unavailable local storage does not break new-chat navigation',()=>{
  const unavailable={getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}};
  assert.equal(financeFeatureDismissed(unavailable,'entry'),false);
  assert.equal(dismissFinanceFeature(unavailable,'entry'),false);
  assert.equal(financeHref(),'#finance/overview');
});
