import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {localizeDemoBootstrap,canonicalDemoValue} from '../shared/demo-localization.mjs';
import {createDemoPortraits} from '../server/demo-portraits.mjs';

const planner={id:'agent-planner',name:'筹划伙伴',role:'把目标拆成可执行的小步',instructions:'Original instructions',createdAt:'2026-09-01T00:00:00.000Z'};
const fixture=()=>({profile:{name:'万叶',englishName:'Caspian',description:'',demo:true},agents:[structuredClone(planner)]});
const english=data=>localizeDemoBootstrap(data,'en');

test('an unchanged English alias returns to its exact original field without adding metadata',()=>{
 const before=fixture(),translated=english(before).agents[0];
 assert.equal(translated.name,'Project planner');
 const patch={name:translated.name,role:translated.role,instructions:'New instructions'};
 assert.deepEqual(canonicalDemoValue('agents',planner.id,patch,'en',planner),{name:planner.name,role:planner.role,instructions:'New instructions'});
 const renamed={...planner,name:'项目规划师'};
 assert.equal(canonicalDemoValue('agents',planner.id,{name:'Project planner'},'en',renamed).name,'项目规划师');
 // A translated phrase typed into a different field is user input, not an untouched value.
 assert.equal(canonicalDemoValue('agents',planner.id,{instructions:translated.role},'en',planner).instructions,translated.role);
 assert.equal(canonicalDemoValue('agents',planner.id,{name:'My planner'},'en',planner).name,'My planner');
 assert.equal(canonicalDemoValue('agents',planner.id,{name:'Project planner'}).name,'Project planner');
 assert.deepEqual(before,fixture());
});

test('nested portrait edits follow entry IDs when reordered and keep newly inserted text',()=>{
 const entries=createDemoPortraits()['person-self'].slice(0,2);
 const person={id:'person-self',name:'万叶',portrait:{schema:'hither.person.v1',version:3,entries,history:['read-only history']}};
 const translated=english({profile:{demo:true},people:[person]}).people[0];
 const patch={portrait:{schema:'hither.person.v1',entries:[translated.portrait.entries[1],{id:'new-user-entry',statement:translated.portrait.entries[0].statement},translated.portrait.entries[0]]}};
 const result=canonicalDemoValue('people',person.id,patch,'en',person);
 assert.deepEqual(result.portrait.entries[0],entries[1]);
 assert.deepEqual(result.portrait.entries[2],entries[0]);
 assert.equal(result.portrait.entries[1].statement,translated.portrait.entries[0].statement);
 assert.deepEqual(Object.keys(result),['portrait']);
 assert.deepEqual(Object.keys(result.portrait),['schema','entries']);
 assert.equal(person.portrait.version,3);
});

const require=createRequire(import.meta.url);
function loadClient(search='?space=demo-engineer-v4'){
 const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const i18n={},space={},exports={},location={search};
 vm.runInNewContext(compile('../src/i18n.ts'),{exports:i18n,require});
 vm.runInNewContext(compile('../src/space.ts'),{exports:space,URL,URLSearchParams,location});
 let fetchResult;
 vm.runInNewContext(compile('../src/api.ts'),{exports,Error,structuredClone,require:name=>name==='./i18n'?i18n:name==='./space'?space:require(name),fetch:(...args)=>fetchResult(...args)});
 return {...exports,...i18n,location,respond:fn=>{fetchResult=fn;}};
}
const response=value=>new Response(JSON.stringify(value));

test('API caches the raw bootstrap and sends only submitted fields when editing an English sample',async()=>{
 const client=loadClient();client.setLocale('en');let sent;
 client.respond(async(url,init)=>{
  if(url.endsWith('/bootstrap'))return response(fixture());
  sent={url,body:JSON.parse(init.body)};return response({ok:true});
 });
 const data=await client.api('/bootstrap');
 const translated=english(data).agents[0];
 data.agents[0].name='Mutation of a returned view';
 await client.write('/agents/agent-planner',{name:translated.name,role:translated.role,instructions:'New instructions'},'PUT');
 assert.deepEqual(sent,{url:'/api/spaces/demo-engineer-v4/agents/agent-planner',body:{name:planner.name,role:planner.role,instructions:'New instructions'}});
 await client.write('/profile',{name:'Caspian',description:'Edited introduction'},'PUT');
 assert.deepEqual(sent.body,{name:'万叶',description:'Edited introduction'});
 // A field not present in the raw record cannot be reverse translated by coincidence.
 await client.write('/agents/agent-planner',{note:translated.role},'PATCH');
 assert.deepEqual(sent.body,{note:translated.role});
});

test('personal, original, Chinese and uncached writes keep the submitted text verbatim',async()=>{
 const client=loadClient();client.setLocale('en');const payload={name:'Project planner',role:'Breaks goals into practical steps'};let sent;
 client.respond(async(url,init)=>{
  if(url.endsWith('/bootstrap'))return response(url==='/api/bootstrap'?{...fixture(),agents:[{...planner,name:'Original-space name'}]}:fixture());
  sent=JSON.parse(init.body);return response({ok:true});
 });
 await client.write('/agents/agent-planner',payload,'PUT');assert.deepEqual(sent,payload);
 await client.api('/bootstrap');
 await client.api('/bootstrap',{},true);
 await client.write('/agents/agent-planner',{name:'Project planner'},'PUT');assert.equal(sent.name,planner.name);
 client.location.search='?space=personal';
 await client.write('/agents/agent-planner',payload,'PUT');assert.deepEqual(sent,payload);
 client.location.search='';
 await client.write('/agents/agent-planner',payload,'PUT');assert.deepEqual(sent,payload);
 client.location.search='?space=demo-engineer-v4';client.setLocale('zh-CN');
 await client.write('/agents/agent-planner',payload,'PUT');assert.deepEqual(sent,payload);
 client.setLocale('en');await client.write('/agents',payload);assert.deepEqual(sent,payload);
});

test('a delayed bootstrap cannot replace a newer original snapshot',async()=>{
 const client=loadClient();client.setLocale('en');const pending=[];let sent;
 client.respond((url,init)=>url.endsWith('/bootstrap')?new Promise(resolve=>pending.push(resolve)):(sent=JSON.parse(init.body),Promise.resolve(response({ok:true}))));
 const old=client.api('/bootstrap'),latest=client.api('/bootstrap');
 pending[1](response({...fixture(),agents:[{...planner,name:'项目规划师'}]}));await latest;
 pending[0](response(fixture()));await old;
 await client.write('/agents/agent-planner',{name:'Project planner'},'PUT');
 assert.equal(sent.name,'项目规划师');
 // A successful refresh of a non-demo profile must not retain a previous sample snapshot.
 const refreshed=client.api('/bootstrap');pending[2](response({profile:{demo:false},agents:[]}));await refreshed;
 await client.write('/agents/agent-planner',{name:'Project planner'},'PUT');assert.equal(sent.name,'Project planner');
});
