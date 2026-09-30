import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Resolve from the SDK's actual import path, including any future nested dependency.
const sdkRequire = createRequire(import.meta.resolve('@openai/apps-sdk-ui/components/Button'));
const lodash = sdkRequire('lodash');

test('the SDK-resolved Lodash rejects executable template import identifiers', () => {
  const key = 'value=globalThis.__seconduTemplateProbe=true';
  assert.equal(Object.hasOwn(globalThis, '__seconduTemplateProbe'), false);
  try {
    assert.throws(() => lodash.template('synthetic output', { imports: { [key]: 1 } }));
    assert.equal(Object.hasOwn(globalThis, '__seconduTemplateProbe'), false);
  } finally {
    delete globalThis.__seconduTemplateProbe;
  }
});

test('the patched SDK dependency preserves ordinary template and collection behavior', () => {
  const render = lodash.template('Hello <%= user %>', { imports: { safe: value => value } });
  assert.equal(render({ user:'Fictional example' }), 'Hello Fictional example');
  const records = [{ id:1, name:'one' }, { id:1, name:'duplicate' }, { id:2, name:'two' }];
  assert.deepEqual(lodash.uniqBy(records, 'id').map(item => item.name), ['one', 'two']);
  const source = { nested:{ value:1 } }, copy = lodash.cloneDeep(source);
  copy.nested.value = 2;
  assert.equal(source.nested.value, 1);
});
