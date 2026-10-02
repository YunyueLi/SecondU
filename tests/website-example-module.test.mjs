import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createCanonicalExampleModule, partitionCanonicalExampleData } from '../website/example-module.mjs';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const examples = () => ({
  zh: { space: 'demo-cn-v1', bootstrap: { profile: { name: '万叶' } }, responses: {
    '/development/documents?path=DEVELOPMENT.md': { text: 'SHARED_DOCUMENT_SENTINEL', sections: [{ title: '公共资料' }] },
    '/settings/appearance': { language: 'zh-CN' }, '/empty': [], '/zh-only': { value: 1 },
  } },
  en: { space: 'demo-us-v1', bootstrap: { profile: { name: 'Caspian' } }, responses: {
    '/development/documents?path=DEVELOPMENT.md': { text: 'SHARED_DOCUMENT_SENTINEL', sections: [{ title: '公共资料' }] },
    '/settings/appearance': { language: 'en' }, '/empty': [], '/en-only': { value: 2 },
  } },
});

test('generated module preserves both locale snapshots and emits a shared response once', async () => {
  const input = examples(), before = structuredClone(input);
  const source = createCanonicalExampleModule(input);
  const { default: actual } = await import(moduleUrl(source));
  assert.deepEqual(actual, before);
  assert.deepEqual(input, before);
  assert.equal(source.split('SHARED_DOCUMENT_SENTINEL').length - 1, 1);
  assert.notEqual(actual.zh.responses, actual.en.responses);
});

test('the real fixture adapter keeps mutable examples isolated after sharing module data', async () => {
  const input = examples();
  const canonicalUrl = moduleUrl(createCanonicalExampleModule(input));
  const fixture = await readFile(new URL('../website/src/embed/fixture.ts', import.meta.url), 'utf8');
  const linked = fixture.replace("'virtual:secondu-canonical-examples'", JSON.stringify(canonicalUrl));
  assert.notEqual(linked, fixture);
  const { outputText } = ts.transpileModule(linked, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const { createWebsiteExample } = await import(moduleUrl(outputText));
  const zh = createWebsiteExample('zh'), en = createWebsiteExample('en');
  zh.responses['/development/documents?path=DEVELOPMENT.md'].sections[0].title = '本页修改';
  zh.responses['/empty'].push('changed');
  zh.bootstrap.profile.name = '已修改';
  assert.deepEqual(en, input.en);
  assert.deepEqual(createWebsiteExample('zh'), input.zh);
  assert.deepEqual(createWebsiteExample('en'), input.en);
});

test('missing and unequal responses stay locale-specific', async () => {
  const input = examples();
  input.en.responses['/development/documents?path=DEVELOPMENT.md'].sections[0].title = 'Different';
  input.zh.responses['/absent-in-en'] = null;
  const { default: actual } = await import(moduleUrl(createCanonicalExampleModule(input)));
  assert.deepEqual(actual, input);
  assert.equal(Object.hasOwn(actual.en.responses, '/absent-in-en'), false);
});

test('development records stay outside the initial module and load through the real fixture on demand', async () => {
  const input = examples(), { initial, development } = partitionCanonicalExampleData(input);
  const initialSource = createCanonicalExampleModule(initial);
  assert.ok(!initialSource.includes('SHARED_DOCUMENT_SENTINEL'));
  const developmentSource = createCanonicalExampleModule(development);
  assert.equal(developmentSource.split('SHARED_DOCUMENT_SENTINEL').length - 1, 1);
  const counter = `__developmentModuleLoads_${Date.now()}`;
  globalThis[counter] = 0;
  try {
    const fixture = (await readFile(new URL('../website/src/embed/fixture.ts', import.meta.url), 'utf8'))
      .replace("'virtual:secondu-canonical-examples'", JSON.stringify(moduleUrl(initialSource)))
      .replace("'virtual:secondu-development-examples'", JSON.stringify(moduleUrl(`globalThis[${JSON.stringify(counter)}]++;\n${developmentSource}`)));
    const { outputText } = ts.transpileModule(fixture, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    const { createWebsiteExample, loadWebsiteDevelopment } = await import(moduleUrl(outputText));
    assert.deepEqual(createWebsiteExample('zh'), initial.zh); assert.equal(globalThis[counter], 0);
    const [zh, en] = await Promise.all([loadWebsiteDevelopment('zh'), loadWebsiteDevelopment('en')]);
    assert.equal(globalThis[counter], 1); assert.deepEqual(zh, development.zh.responses); assert.deepEqual(en, development.en.responses);
    zh['/development/documents?path=DEVELOPMENT.md'].sections[0].title = 'Local edit';
    assert.deepEqual(await loadWebsiteDevelopment('zh'), development.zh.responses); assert.deepEqual(en, development.en.responses);
  } finally { delete globalThis[counter]; }
});
