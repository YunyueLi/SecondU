import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {applyDemoNames,DEMO_NAMES_MARKER,DEMO_NAME_PAIRS,renameDemoText} from '../server/demo-names.mjs';
import baseline from '../server/fixtures/demo-names-before-v1.json' with {type:'json'};
import previousCaspian from '../server/fixtures/demo-baseline-v5.json' with {type:'json'};
import {localizeDemoBootstrap} from '../shared/demo-localization.mjs';
const stamp='2026-09-30T00:00:00.000Z';
const materialize=value=>JSON.parse(JSON.stringify(value).replaceAll(baseline.stamp,stamp));
function oldStore(t){
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'secondu-demo-names-'))),store=new Store(path.join(root,'data'),{seed:false});
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 for(const data of [baseline.seed,baseline.expansion,baseline.life,{people:baseline.installedPeople}])for(const [collection,records] of Object.entries(data))if(Array.isArray(records))for(const record of records)store.put(collection,materialize(record));
 store.setMeta('profile',baseline.seed.profile);
 return {root,store};
}
function oldShowcase(root,store){
 const folder=path.join(root,'examples');mkdirSync(folder);
 const records=[];
 for(const [collection,items] of Object.entries(baseline.showcase))for(const original of items){
  const record=structuredClone(original);
  if(collection==='projects'){record.path=path.join(folder,record.showcaseFolder);mkdirSync(record.path);delete record.showcaseFolder;}
  store.put(collection,record);records.push({collection,id:record.id});
 }
 for(const artifact of store.list('artifacts')){
  const task=store.require('tasks',artifact.taskId),project=store.require('projects',task.projectId);
  writeFileSync(path.join(project.path,artifact.name),artifact.content);
  const english=baseline.showcaseTranslations.artifacts[artifact.id]?.[artifact.content];
  if(english)writeFileSync(path.join(project.path,artifact.name.replace(/\.md$/,'.en.md')),english);
 }
 store.setMeta('demo-showcase-v1',{root:folder,records});
}
test('common names migrate across authored people, sources, conversations, portraits, tasks and files without changing IDs or paths',t=>{
 const {root,store}=oldStore(t);oldShowcase(root,store);
 const beforeProjects=store.list('projects'),result=applyDemoNames(store);
 assert.ok(result.updated.length>50);assert.equal(result.untouchedAfterHash,result.untouchedBeforeHash);
 const backup=JSON.parse(readFileSync(result.backupPath,'utf8'));assert.ok(backup.rows.some(row=>row.collection==='people'&&JSON.parse(row.data).name==='许安'));
 assert.deepEqual(store.list('projects'),beforeProjects);
 assert.equal(store.require('people','person-xuan').name,'王磊');assert.equal(store.require('people','demo-v2-person-lu').name,'刘建国');
 assert.equal(store.require('people','person-self').name,'万叶');assert.equal(store.require('people','demo-v2-person-lin').name,'万建明');assert.equal(store.require('people','demo-v2-person-gao').name,'高远');
 for(const collection of ['people','sources','relationships','events','conversations','goals','tasks','artifacts']){
  const text=JSON.stringify(store.list(collection));for(const [old] of DEMO_NAME_PAIRS)assert.ok(!text.includes(old),`${collection} still contains ${old}`);
 }
 for(const artifact of store.list('artifacts')){
  const task=store.require('tasks',artifact.taskId),project=store.require('projects',task.projectId);
  assert.equal(readFileSync(path.join(project.path,artifact.name),'utf8'),artifact.content);
  for(const [old] of DEMO_NAME_PAIRS)assert.ok(!readFileSync(path.join(project.path,artifact.name.replace(/\.md$/,'.en.md')),'utf8').includes(old));
 }
 const en=localizeDemoBootstrap({profile:store.meta('profile'),people:store.list('people'),sources:store.list('sources'),conversations:store.list('conversations'),artifacts:store.list('artifacts'),tasks:store.list('tasks')},'en');
 assert.equal(en.people.find(person=>person.id==='person-xuan').name,'Wang Lei');assert.equal(en.people.find(person=>person.id==='demo-v2-person-lu').name,'Liu Jianguo');
 const after=store.db.prepare('SELECT * FROM entities ORDER BY collection,id').all();assert.deepEqual(applyDemoNames(store),{updated:[],preserved:[]});assert.deepEqual(store.db.prepare('SELECT * FROM entities ORDER BY collection,id').all(),after);
});
test('edits, appended messages, imported same-name text, custom identities and deleted records remain untouched',t=>{
 const {store}=oldStore(t);
 const personEvidence=store.require('sources','source-chat'),conversationEvidence=store.require('sources','demo-v2-source-chat-he');
 const person={...store.require('people','person-xuan'),description:'用户自己写的许安说明'};store.put('people',person);
 const source={...store.require('sources','source-exhibition'),text:'用户原文提到乔宁，不能重写。'};store.put('sources',source);
 const imported={id:'user-import',title:'许安',text:'乔宁和许安是我自己的资料',demo:false};store.put('sources',imported);
 const conversation=store.require('conversations','demo-v2-chat-he');conversation.messages[0].content='我亲自改过何舟这条消息';conversation.messages.unshift({id:'my-message',content:'何舟与乔宁，这是新增原话'});store.put('conversations',conversation);
 store.delete('people','demo-v2-person-song');applyDemoNames(store);
 assert.deepEqual(store.require('people',person.id),person);assert.deepEqual(store.require('sources',source.id).text,source.text);assert.deepEqual(store.require('sources',imported.id),imported);
 assert.equal(store.require('conversations',conversation.id).messages[0].content,conversation.messages[0].content);assert.equal(store.require('conversations',conversation.id).messages[1].content,conversation.messages[1].content);
 assert.equal(store.get('people','demo-v2-person-song'),undefined);
 assert.deepEqual(store.require('sources',personEvidence.id),personEvidence);assert.deepEqual(store.require('sources',conversationEvidence.id),conversationEvidence);
});
test('installed portrait timestamps and known prior fact history match while formal references preserve identity and evidence',t=>{
 const {store}=oldStore(t),installed=JSON.parse(JSON.stringify(previousCaspian.installed[0]).replaceAll(previousCaspian.stamp,stamp));
 for(const [collection,records] of Object.entries(installed))if(Array.isArray(records))for(const record of records)store.put(collection,record);
 const originalPeople=store.list('people'),result=applyDemoNames(store);assert.ok(result.updated.length>50);
 assert.equal(store.list('people').length,22);
 for(const original of originalPeople){const current=store.require('people',original.id);assert.equal(current.name,renameDemoText(original.name));assert.deepEqual(current.portrait?.entries.map(entry=>[entry.id,entry.recordedAt]),original.portrait?.entries.map(entry=>[entry.id,entry.recordedAt]));}
 const second=oldStore(t).store,person=second.require('people','person-xuan'),source=second.require('sources','source-chat');
 const formal={id:'formal-relationship',from:'person-self',to:person.id,label:'用户自己确认的关系',sourceIds:[]};second.put('relationships',formal);applyDemoNames(second);
 assert.deepEqual(second.require('people',person.id),person);assert.deepEqual(second.require('sources',source.id),source);assert.deepEqual(second.require('relationships',formal.id),formal);
});
test('edited deliverable files preserve their database record and both languages',t=>{
 const {root,store}=oldStore(t);oldShowcase(root,store);
 const artifact=store.require('artifacts','demo-showcase-artifact-launch'),task=store.require('tasks',artifact.taskId),project=store.require('projects',task.projectId),file=path.join(project.path,artifact.name);
 writeFileSync(file,'用户修改过的结果，乔宁。');const result=applyDemoNames(store);
 assert.equal(readFileSync(file,'utf8'),'用户修改过的结果，乔宁。');assert.deepEqual(store.require('artifacts',artifact.id),artifact);assert.ok(result.preserved.some(item=>item.id===artifact.id&&item.reason==='edited_example_file'));
});
test('personal databases are skipped even with authored IDs and text',t=>{
 const {store}=oldStore(t);store.setMeta('profile',{name:'本人空间',demo:false});const before=store.db.prepare('SELECT * FROM entities ORDER BY collection,id').all();
 assert.equal(applyDemoNames(store),undefined);assert.deepEqual(store.db.prepare('SELECT * FROM entities ORDER BY collection,id').all(),before);assert.equal(store.get('meta',DEMO_NAMES_MARKER),undefined);
});
test('authored replacement retains self and father and is idempotent',()=>{
 const text='万叶 Caspian 万建明 高远 陆老师 Professor Lu Teacher Lu 许安 Xu An';
 const renamed=renameDemoText(text);assert.equal(renamed,'万叶 Caspian 万建明 高远 刘老师 Professor Liu Teacher Liu 王磊 Wang Lei');assert.equal(renameDemoText(renamed),renamed);
});
