import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,unlinkSync,realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {ensureDemoShowcase} from '../server/demo-showcase.mjs';
import {ensureUSDemoFiles} from '../server/demo-us.mjs';
import {applyDemoCopy,DEMO_COPY_MARKER} from '../server/demo-copy.mjs';
import manifest from '../server/fixtures/demo-copy-v3.json' with {type:'json'};
const snapshot=store=>store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();
const stamp='2026-09-30T04:00:00.000Z';
const materialize=value=>JSON.parse(JSON.stringify(value).replaceAll('__DEMO_STAMP__',stamp).replaceAll('__DEMO_TIMESTAMP__',stamp));
function fixture(t,locale='zh-CN'){
 const directory=realpathSync(mkdtempSync(path.join(os.tmpdir(),'secondu-demo-copy-'))),store=new Store(path.join(directory,'data'),{seedLocale:locale});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 locale==='en'?ensureUSDemoFiles(store):ensureDemoShowcase(store);
 for(const change of manifest.changes.filter(c=>c.locale===locale)){const current=store.get(change.collection,change.id);assert.ok(current,change.id);store.put(change.collection,{...current,[change.field]:materialize(change.from)});}
 for(const bundle of manifest.bundles.filter(b=>b.locale===locale))for(const entry of bundle.records){store.put(entry.collection,materialize(entry.before));if(entry.collection==='artifacts'){const folder=store.require('projects',bundle.projectId).path;writeFileSync(path.join(folder,entry.before.name),entry.before.content);}}
 for(const readme of (manifest.readmes??[]).filter(item=>item.locale===locale))writeFileSync(path.join(store.require('projects',readme.projectId).path,'README.md'),readme.from);
 store.delete('meta',DEMO_COPY_MARKER);return {store,directory};
}
function bundleFiles(store,bundle){const a=bundle.records.find(e=>e.collection==='artifacts');const folder=store.require('projects',bundle.projectId).path;return {a,old:path.join(folder,a.before.name),next:path.join(folder,a.after.name)};}

test('exact authored copy upgrades complete histories and files, retaining renamed originals and reopening idempotently',t=>{
 const {store}=fixture(t);const report=applyDemoCopy(store);assert.ok(report.updated.length>150);assert.deepEqual(report.preserved,[]);
 for(const bundle of manifest.bundles.filter(b=>b.locale==='zh-CN')){
  for(const entry of bundle.records)assert.deepEqual(store.require(entry.collection,entry.after.id),materialize(entry.after));
  const files=bundleFiles(store,bundle);assert.equal(readFileSync(files.next,'utf8'),files.a.after.content);if(files.old!==files.next)assert.equal(readFileSync(files.old,'utf8'),files.a.before.content);
 }
 for(const readme of manifest.readmes??[])if(readme.locale==='zh-CN')assert.equal(readFileSync(path.join(store.require('projects',readme.projectId).path,'README.md'),'utf8'),readme.to);
 const before=snapshot(store);ensureDemoShowcase(store);assert.deepEqual(snapshot(store),before);
});

test('an edited message protects the entire task, output, room and linked source material',t=>{
 const {store}=fixture(t);const bundle=manifest.bundles.find(b=>b.id==='demo-showcase-task-launch'),files=bundleFiles(store,bundle);
 const current=store.require('tasks',bundle.id);current.messages.push({id:'user-edit',role:'user',content:'Keep my actual decision',createdAt:stamp});store.put('tasks',current);
 const source=store.require('sources','demo-showcase-source');applyDemoCopy(store);
 assert.deepEqual(store.require('tasks',current.id),current);assert.deepEqual(store.require('artifacts',files.a.before.id),files.a.before);assert.equal(readFileSync(files.old,'utf8'),files.a.before.content);assert.equal(store.require('sources',source.id).text,source.text);
});

test('edited files, symlinks, removed records and alternate project folders never get replaced',t=>{
 const {store,directory}=fixture(t);const bundles=manifest.bundles.filter(b=>b.locale==='zh-CN');
 const changed=bundleFiles(store,bundles[0]);writeFileSync(changed.old,'User disk edit');
 const linked=bundleFiles(store,bundles[1]),outside=path.join(directory,'outside.txt');writeFileSync(outside,'Outside data');unlinkSync(linked.next);symlinkSync(outside,linked.next);
 const removed=bundles[2];store.delete('tasks',removed.id);
 const moved=bundles[3],project=store.require('projects',moved.projectId);store.put('projects',{...project,path:store.require('projects',bundles[0].projectId).path});
 const report=applyDemoCopy(store);assert.equal(readFileSync(changed.old,'utf8'),'User disk edit');assert.equal(readFileSync(outside,'utf8'),'Outside data');assert.equal(store.get('tasks',removed.id),undefined);
 assert.ok(report.preserved.some(p=>p.id===bundles[0].id));assert.ok(report.preserved.some(p=>p.id===bundles[1].id));assert.ok(report.preserved.some(p=>p.id===removed.id));assert.ok(report.preserved.some(p=>p.id===moved.id));
});

test('conversation corrections protect their paired source, while unrelated timeline copy can update',t=>{
 const {store}=fixture(t);const room=store.require('conversations','demo-story-chat-cost');room.messages[0].content='User corrected cost';store.put('conversations',room);
 const source=store.require('sources','demo-story-source-cost');applyDemoCopy(store);assert.deepEqual(store.require('conversations',room.id),room);assert.deepEqual(store.require('sources',source.id),source);
 const event=manifest.changes.find(c=>c.locale==='zh-CN'&&c.collection==='events');assert.deepEqual(store.require('events',event.id)[event.field],event.to);
});

test('migration retry handles files written before a database rollback',t=>{
 const {store}=fixture(t),put=store.put.bind(store);let once=true;store.put=(collection,record)=>{if(collection==='tasks'&&once){once=false;throw Error('fixture rollback');}return put(collection,record);};
 assert.throws(()=>applyDemoCopy(store),/fixture rollback/);assert.equal(store.get('meta',DEMO_COPY_MARKER),undefined);store.put=put;
 const report=applyDemoCopy(store);assert.deepEqual(report.preserved,[]);assert.ok(report.updated.length>150);
});

test('American timeline migration stays within the American space',t=>{
 const {store}=fixture(t,'en');const report=applyDemoCopy(store);assert.ok(report.updated.length>=100);assert.equal(store.list('events').some(e=>!e.id.startsWith('demo-us-')),false);assert.ok(report.updated.every(key=>!key.includes('demo-story-')));
});

test('personal stores receive neither demo records nor migration markers',t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-personal-copy-')),store=new Store(directory,{seed:false});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});const before=snapshot(store);assert.equal(applyDemoCopy(store),undefined);assert.deepEqual(snapshot(store),before);
});
