import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store,collections} from '../server/store.mjs';
import {localizeDemoBootstrap,canonicalDemoValue} from '../shared/demo-localization.mjs';
import {buildGraphFilterIndex} from '../shared/graph-filtering.mjs';
import v5 from '../server/fixtures/demo-baseline-v5.json' with {type:'json'};
const stamp='2026-09-30T10:00:00.000Z';
function fixture(t,options){const root=mkdtempSync(path.join(tmpdir(),'secondu-localization-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const store=new Store(root,options);return {root,store};}
const snapshot=store=>({profile:store.meta('profile'),...Object.fromEntries(collections.map(c=>[c,store.list(c)]))});
const cjk=/[\u3400-\u9fff]/u;
function displayStrings(value,key='',parent=''){
 if(typeof value==='string')return /(?:Id|Ids)$/.test(key)||['id','date','dueDate','recordedAt','createdAt','updatedAt','time','kind','status','type','reason','path','directory','scope','schema','role'].includes(key)&&parent==='messages'?[]:[[key,value]];
 if(Array.isArray(value))return value.flatMap(v=>displayStrings(v,'',key));
 if(value&&typeof value==='object')return Object.entries(value).flatMap(([k,v])=>displayStrings(v,k,parent));
 return [];
}
test('thirty conversations cover all contacts and preserve bilingual relationships, dates, senders and evidence',t=>{
 const {store}=fixture(t);t.after(()=>store.close());const zh=snapshot(store),en=localizeDemoBootstrap(zh,'en');
 assert.equal(zh.people.length,22);assert.equal(zh.conversations.length,30);assert.equal(zh.conversations.flatMap(c=>c.messages).length,268);
 for(const p of zh.people.filter(p=>p.id!=='person-self'))assert.ok(zh.conversations.some(c=>c.kind==='direct'&&c.personIds.includes(p.id)),p.id);
 for(const c of en.conversations){const original=zh.conversations.find(x=>x.id===c.id);assert.deepEqual(c.personIds,original.personIds);assert.equal(c.messages.length,original.messages.length);for(let n=0;n<c.messages.length;n++){const m=c.messages[n];assert.equal(m.senderId,original.messages[n].senderId);assert.equal(m.sourceId,original.messages[n].sourceId);assert.equal(m.time,original.messages[n].time);assert.ok(c.personIds.includes(m.senderId));assert.equal(cjk.test(m.content),false,m.content);assert.ok(en.sources.find(s=>s.id===m.sourceId)?.text.includes(m.content),m.id);}}
 const counts=data=>Object.fromEntries(buildGraphFilterIndex({...data,selfPersonId:'person-self'}).categories.map(c=>[c.id,c.count]));
 assert.deepEqual(counts(zh),{family:3,friends:5,classmates:3,colleagues:11,mentors:2,contacts:0});assert.deepEqual(counts(en),counts(zh));
 for(const c of ['profile','people','sources','events','facts','goals','agents','agentRooms','relationships']){
  const values=c==='profile'?[en.profile]:en[c];for(const record of values)for(const [key,value] of displayStrings(record))if(!['reason','history'].includes(key))assert.equal(cjk.test(value),false,`${c} ${record.id||''} ${key}: ${value}`);
 }
});
test('sample translation is display-only and reverses unchanged fields without rewriting user edits',t=>{
 const {store}=fixture(t);t.after(()=>store.close());const zh=snapshot(store),before=structuredClone(zh),en=localizeDemoBootstrap(zh,'en');assert.deepEqual(zh,before);assert.equal(localizeDemoBootstrap(zh,'zh-CN'),zh);
 const personal={...zh,profile:{...zh.profile,demo:false}};assert.equal(localizeDemoBootstrap(personal,'en'),personal);
 const modified={...zh,people:zh.people.map(p=>p.id==='person-self'?{...p,description:'用户亲自修改的描述'}:p)};assert.equal(localizeDemoBootstrap(modified,'en').people.find(p=>p.id==='person-self').description,'用户亲自修改的描述');
 const englishPerson=en.people.find(p=>p.id==='person-self');assert.deepEqual(canonicalDemoValue('people',englishPerson.id,englishPerson),zh.people.find(p=>p.id===englishPerson.id));assert.equal(canonicalDemoValue('people',englishPerson.id,{description:'My own new wording'}).description,'My own new wording');
});
function installV5(t){const f=fixture(t,{seed:false}),materialize=v=>JSON.parse(JSON.stringify(v).replaceAll(v5.stamp,stamp));for(const data of [v5.seed,v5.expansion,v5.life,...v5.installed])for(const c of collections)for(const item of data[c]??[])f.store.put(c,materialize(item));f.store.setMeta('profile',materialize(v5.installed[0].profile));f.store.setMeta('demo-migrations',{versions:[2,4,5]});f.store.setMeta('demo-engineer-v4',{version:5,matcherVersion:3});f.store.setMeta('demo-person-portraits-v2',{appliedAt:stamp});return f;}
test('verified v5 records upgrade to thirty conversations and correct speakers without losing portraits',t=>{
 const {root,store}=installV5(t);store.close();const s=new Store(root);assert.equal(s.list('conversations').length,30);assert.equal(s.get('conversations','demo-v2-chat-jiang').messages[0].senderId,'demo-v2-person-jiang');assert.equal(s.get('conversations','demo-v2-chat-liang').messages[0].senderId,'demo-v2-person-liang');assert.equal(s.list('people').filter(p=>p.portrait?.entries.length).length,22);assert.equal(s.meta('demo-engineer-v4').matcherVersion,4);assert.deepEqual(s.meta('demo-engineer-v4').preservedReasons,{});
 const state=snapshot(s);s.close();const again=new Store(root);assert.deepEqual(snapshot(again),state);again.close();
});
test('v5 user corrections retain their evidence and deleted defaults are not recreated',t=>{
 const f=installV5(t),person=f.store.require('people','demo-v2-person-jiang'),source=f.store.require('sources','demo-v2-source-chat-jiang');person.description='用户修改的家庭记录';person.portrait.entries[0].statement='保留这条本人确认的内容';f.store.put('people',person);f.store.delete('conversations','demo-v2-chat-gao');f.store.close();const s=new Store(f.root);t.after(()=>s.close());assert.deepEqual(s.get('people',person.id),person);assert.deepEqual(s.get('sources',source.id),source);assert.equal(s.get('conversations','demo-v2-chat-gao'),undefined);assert.equal(s.get('conversations','demo-v2-chat-jiang').messages[0].senderId,'person-self');assert.ok(s.meta('demo-engineer-v4').preserved.length>0);
});
