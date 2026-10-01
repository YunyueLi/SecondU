import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync,unlinkSync,symlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
import {ensureDemoShowcase} from '../server/demo-showcase.mjs';
import {ensureUSDemoFiles} from '../server/demo-us.mjs';
import {applyDemoReadableCopy,DEMO_READABLE_COPY_MARKER} from '../server/demo-readable-copy.mjs';
import {DEMO_COPY_MARKER} from '../server/demo-copy.mjs';
import copyBaseline from '../server/fixtures/demo-copy-v3.json' with {type:'json'};
import usBaseline from '../server/fixtures/demo-us.json' with {type:'json'};

const stamp='2026-10-01T00:00:00.000Z';
const materialize=value=>JSON.parse(JSON.stringify(value).replaceAll('__DEMO_STAMP__',stamp).replaceAll('__DEMO_TIMESTAMP__',stamp));
const rows=store=>store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();
const fileFor=(store,artifact)=>path.join(store.require('projects',store.require('tasks',artifact.taskId).projectId).path,artifact.name);
function fixture(t,locale='zh-CN',{legacy=true,seed=true}={}){
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'secondu-readable-copy-'))),store=new Store(path.join(root,'data'),{seedLocale:locale,seed});
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 if(!seed)return {store,root};
 (locale==='en'?ensureUSDemoFiles:ensureDemoShowcase)(store);
 if(legacy){
  if(locale==='en'){
   for(const record of usBaseline.artifacts){const original=materialize(record);store.put('artifacts',original);writeFileSync(fileFor(store,original),original.content);}
  }else{
   for(const bundle of copyBaseline.bundles.filter(item=>item.locale==='zh-CN'))for(const entry of bundle.records){
    const original=materialize(entry.after);store.put(entry.collection,original);
    if(entry.collection==='artifacts')writeFileSync(fileFor(store,original),original.content);
   }
  }
  store.delete('meta',DEMO_READABLE_COPY_MARKER);
 }
 return {store,root};
}

for(const locale of ['zh-CN','en'])test(`${locale} fresh examples and saved versions have readable headings with matching files`,t=>{
 const {store}=fixture(t,locale,{legacy:false});
 const report=store.meta(DEMO_READABLE_COPY_MARKER);
 assert.deepEqual(report.preserved,[]);
 assert.equal(report.updated.length,locale==='en'?3:14);
 for(const artifact of store.list('artifacts')){
  assert.doesNotMatch(artifact.content,/[·•・]/);
  for(const version of artifact.versions)assert.doesNotMatch(version.content,/[·•・]/);
  assert.equal(readFileSync(fileFor(store,artifact),'utf8'),artifact.content);
 }
});

for(const locale of ['zh-CN','en'])test(`${locale} prior v3 installations upgrade once without changing conversations or version identities`,t=>{
 const {store}=fixture(t,locale);
 assert.ok(store.get('meta',DEMO_COPY_MARKER));
 const taskRows=store.list('tasks'),roomRows=store.list('agentRooms');
 const versions=store.list('artifacts').map(item=>({id:item.id,version:item.version,ids:item.versions.map(version=>version.version)}));
 const report=applyDemoReadableCopy(store);
 assert.deepEqual(report.preserved,[]);
 assert.equal(report.updated.length,locale==='en'?3:14);
 assert.deepEqual(store.list('tasks'),taskRows);assert.deepEqual(store.list('agentRooms'),roomRows);
 assert.deepEqual(store.list('artifacts').map(item=>({id:item.id,version:item.version,ids:item.versions.map(version=>version.version)})),versions);
 const after=rows(store);(locale==='en'?ensureUSDemoFiles:ensureDemoShowcase)(store);assert.deepEqual(rows(store),after);
 const directory=store.directory;store.close();store.close=()=>{};
 const reopened=new Store(directory,{seedLocale:locale});
 try{(locale==='en'?ensureUSDemoFiles:ensureDemoShowcase)(reopened);assert.deepEqual(rows(reopened),after);}finally{reopened.close();}
});

test('edited tasks, version content, external files and removed artifacts are preserved as whole units',t=>{
 const {store}=fixture(t);
 const task=store.require('tasks','demo-showcase-task-launch');task.messages.push({id:'my-message',role:'user',content:'保留我的选择',createdAt:stamp});store.put('tasks',task);
 const taskArtifact=store.require('artifacts','demo-showcase-artifact-launch');
 const edited=store.require('artifacts','demo-showcase-artifact-family');edited.versions[0].content+='\n我的补充 · 请保留\n';store.put('artifacts',edited);
 const disk=store.require('artifacts','demo-showcase-artifact-demo-story');writeFileSync(fileFor(store,disk),'我自己的正文 · 不要替换');
 const removed=store.require('artifacts','demo-showcase-artifact-weekly');store.delete('artifacts',removed.id);
 const own={...taskArtifact,id:'my-own-copy',content:'我自己的标题 · 初稿'};store.put('artifacts',own);
 const report=applyDemoReadableCopy(store);
 assert.deepEqual(store.require('artifacts',taskArtifact.id),taskArtifact);assert.deepEqual(store.require('tasks',task.id),task);
 assert.deepEqual(store.require('artifacts',edited.id),edited);assert.deepEqual(store.require('artifacts',disk.id),disk);
 assert.equal(readFileSync(fileFor(store,disk),'utf8'),'我自己的正文 · 不要替换');assert.equal(store.get('artifacts',removed.id),undefined);
 assert.deepEqual(store.require('artifacts',own.id),own);assert.equal(report.preserved.length,4);
});

test('an edited linked American room protects its result while unrelated examples update',t=>{
 const {store}=fixture(t,'en'),room=store.require('agentRooms','demo-us-room-travel');
 room.messages.push({id:'my-room-message',role:'user',content:'My changed plans',createdAt:stamp});store.put('agentRooms',room);
 const artifact=store.require('artifacts','demo-us-artifact-birthday');const report=applyDemoReadableCopy(store);
 assert.deepEqual(store.require('agentRooms',room.id),room);assert.deepEqual(store.require('artifacts',artifact.id),artifact);
 assert.equal(readFileSync(fileFor(store,artifact),'utf8'),artifact.content);assert.equal(report.preserved.length,1);assert.equal(report.updated.length,2);
});

test('missing files, symlinks and a moved project never trigger writes or recreation',t=>{
 const {store,root}=fixture(t,'en');
 const missing=store.require('artifacts','demo-us-artifact-birthday');unlinkSync(fileFor(store,missing));
 const linked=store.require('artifacts','demo-us-artifact-staff-note'),outside=path.join(root,'outside.md');writeFileSync(outside,'Outside · original');unlinkSync(fileFor(store,linked));symlinkSync(outside,fileFor(store,linked));
 const moved=store.require('projects','demo-us-project-home');store.put('projects',{...moved,path:store.require('projects','demo-us-project-birthday').path});
 const before=store.list('artifacts'),report=applyDemoReadableCopy(store);
 assert.deepEqual(store.list('artifacts'),before);assert.equal(report.preserved.length,3);assert.equal(report.updated.length,0);assert.equal(readFileSync(outside,'utf8'),'Outside · original');assert.equal(existsSync(fileFor(store,missing)),false);
});

test('a failed database write can retry only the already-authored output safely',t=>{
 const {store}=fixture(t,'en'),put=store.put.bind(store);let once=true;
 store.put=(collection,record)=>{if(collection==='artifacts'&&once){once=false;throw Error('expected rollback');}return put(collection,record);};
 assert.throws(()=>applyDemoReadableCopy(store),/expected rollback/);assert.equal(store.get('meta',DEMO_READABLE_COPY_MARKER),undefined);store.put=put;
 const report=applyDemoReadableCopy(store);assert.deepEqual(report.preserved,[]);assert.equal(report.updated.length,3);
 for(const artifact of store.list('artifacts'))assert.equal(readFileSync(fileFor(store,artifact),'utf8'),artifact.content);
});

test('personal spaces receive no example records or migration marker',t=>{
 const {store}=fixture(t,'zh-CN',{seed:false}),before=rows(store);
 assert.equal(applyDemoReadableCopy(store),undefined);assert.deepEqual(rows(store),before);
});
