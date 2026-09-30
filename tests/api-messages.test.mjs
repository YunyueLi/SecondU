import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadClient() {
  const i18nExports = {};
  const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compile('../src/i18n.ts'), {exports:i18nExports,require});
  const spaceExports = {};
  vm.runInNewContext(compile('../src/space.ts'), {exports:spaceExports,URL,URLSearchParams});
  const exports = {};
  let fetchResult;
  vm.runInNewContext(compile('../src/api.ts'), {
    exports, Error,
    require: name=>name==='./i18n'?i18nExports:name==='./space'?spaceExports:require(name),
    fetch: async (...args)=>typeof fetchResult==='function'?fetchResult(...args):fetchResult,
  });
  return {...exports, ...i18nExports, respond: result=>{fetchResult=result;}};
}

test('known API errors and generic fallbacks follow the current locale', async()=>{
  const client=loadClient();
  client.setLocale('en');
  client.respond(new Response(JSON.stringify({error:'文件已被更新，请刷新后再保存',code:'version_conflict'}),{status:409}));
  let conflict;
  await assert.rejects(client.api('/artifacts/a'),error=>{
    conflict=error;
    assert.equal(error.status,409);
    assert.equal(error.code,'version_conflict');
    assert.equal(error.message,'This file has changed. Refresh before saving.');
    return true;
  });
  client.setLocale('zh-CN');
  assert.equal(client.messageOf(conflict),'文件已被更新，请刷新后再保存');
  client.setLocale('en');
  assert.equal(client.messageOf(undefined),'The operation did not finish. Please try again.');
  client.respond(new Response('{}',{status:503}));
  await assert.rejects(client.api('/bootstrap'),error=>error.message==='The request did not finish (503).');
});

test('unknown provider diagnostics stay verbatim even when their code is known', async()=>{
  const client=loadClient();client.setLocale('en');
  const diagnostic='第三方原始诊断：model xyz, trace abc-123';
  client.respond(new Response(JSON.stringify({error:diagnostic,code:'internal_error'}),{status:502}));
  await assert.rejects(client.api('/connections/test'),error=>{
    assert.equal(error.rawMessage,diagnostic);
    assert.equal(client.messageOf(error),diagnostic);
    return true;
  });
  assert.equal(client.messageOf(new Error('Unknown diagnostic: E_17')),'Unknown diagnostic: E_17');
});

test('unreadable responses, network errors, and known field errors have actionable translations', async()=>{
  const client=loadClient();client.setLocale('en');
  client.respond(new Response('<html>not json</html>',{status:500}));
  await assert.rejects(client.api('/bootstrap'),error=>error.message==='The local service returned an unreadable response. Please try again.');
  assert.equal(client.messageOf(new TypeError('Failed to fetch')),'Could not reach the local service. Make sure the app is running, then try again.');
  assert.equal(client.messageOf(new client.APIError('title 无效或过长',400)),'title is invalid or too long.');
});
