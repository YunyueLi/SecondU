import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {exportCanonicalExamples} from '../website/export-examples.mjs';
import {partitionCanonicalExampleData} from '../website/example-module.mjs';

const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let examples,sequence=0;
test.before(async()=>{examples=partitionCanonicalExampleData(await exportCanonicalExamples());});

async function adapter(t,load){
 const key=`__websiteDevelopmentTest${++sequence}`,state={locale:'zh-CN',calls:[],load:language=>{state.calls.push(language);return load(language);}};
 globalThis[key]=state;
 const originalListener=globalThis.addEventListener;globalThis.addEventListener=()=>{};
 t.after(()=>{delete globalThis[key];if(originalListener===undefined)delete globalThis.addEventListener;else globalThis.addEventListener=originalListener;});
 const fixture=moduleUrl(`const initial=${JSON.stringify(examples.initial)};export const createWebsiteExample=language=>structuredClone(initial[language]);export const loadWebsiteDevelopment=language=>globalThis[${JSON.stringify(key)}].load(language);`);
 const i18n=moduleUrl(`export const getLocale=()=>globalThis[${JSON.stringify(key)}].locale;export const t=(zh,en)=>getLocale()==='en'?en:zh;`);
 const original=await readFile(new URL('../website/src/embed/api.ts',import.meta.url),'utf8');
 const linked=original.replace("'../../../src/i18n'",JSON.stringify(i18n)).replace("'./fixture'",JSON.stringify(fixture))
  .replace("'./memory-runtime.mjs'",JSON.stringify(new URL('../website/src/embed/memory-runtime.mjs',import.meta.url).href))
  .replace("'../../../shared/demo-decision.mjs'",JSON.stringify(new URL('../shared/demo-decision.mjs',import.meta.url).href));
 const {outputText}=ts.transpileModule(linked,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
 return {...await import(moduleUrl(outputText)),state};
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const records=language=>({...structuredClone(examples.development[language].responses),'/development/test-locale':{language,items:['original']}});

test('real website API avoids the chunk on first paint and shares concurrent development reads per captured language',async t=>{
 const zh=deferred(),en=deferred();
 const {api,state}=await adapter(t,language=>(language==='zh'?zh:en).promise);
 assert.equal((await api('/bootstrap')).profile.name,'万叶');assert.deepEqual(state.calls,[]);
 await assert.rejects(api('/development/review',{method:'PUT',body:'{}'}),error=>error.code==='showcase_read_only');assert.deepEqual(state.calls,[]);
 const first=api('/development/test-locale'),second=api('/development/review');assert.deepEqual(state.calls,['zh']);
 state.locale='en';const english=api('/development/test-locale');assert.deepEqual(state.calls,['zh','en']);
 zh.resolve(records('zh'));en.resolve(records('en'));
 assert.equal((await first).language,'zh');assert.deepEqual(await second,examples.development.zh.responses['/development/review']);
 const answer=await english;assert.equal(answer.language,'en');answer.items[0]='changed';
 assert.deepEqual((await api('/development/test-locale')).items,['original']);assert.deepEqual(state.calls,['zh','en']);
 assert.equal((await api('/bootstrap')).profile.name,'Caspian');
 await assert.rejects(api('/development/unknown'),error=>error.code==='not_found');
});

test('a failed development import may be retried without clearing workspace changes',async t=>{
 let attempt=0;
 const {api,state}=await adapter(t,language=>++attempt===1?Promise.reject(new Error('Synthetic module-load failure')):Promise.resolve(records(language)));
 await api('/profile',{method:'PUT',body:JSON.stringify({name:'Synthetic page edit'})});
 await assert.rejects(api('/development/review'),/Synthetic module-load failure/);
 assert.deepEqual(await api('/development/review'),examples.development.zh.responses['/development/review']);
 assert.equal((await api('/bootstrap')).profile.name,'Synthetic page edit');assert.deepEqual(state.calls,['zh','zh']);
});

test('development loading respects aborts before and during import without affecting other reads',async t=>{
 const pending=deferred();const {api,state}=await adapter(t,()=>pending.promise);
 const already=new AbortController();already.abort();
 await assert.rejects(api('/development/review',{signal:already.signal}),error=>error.name==='AbortError');assert.deepEqual(state.calls,[]);
 const controller=new AbortController(),aborted=api('/development/review',{signal:controller.signal}),other=api('/development/test-locale');
 controller.abort();pending.resolve(records('zh'));
 await assert.rejects(aborted,error=>error.name==='AbortError');assert.equal((await other).language,'zh');
 assert.deepEqual(state.calls,['zh']);assert.deepEqual(await api('/development/review'),examples.development.zh.responses['/development/review']);
});
