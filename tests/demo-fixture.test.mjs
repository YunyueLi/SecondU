import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,collections} from '../server/store.mjs';
import {createTask} from '../server/domain.mjs';
import baseline from '../server/fixtures/demo-baseline-v3.json' with {type:'json'};
import engineerBaseline from '../server/fixtures/demo-baseline-v4.json' with {type:'json'};
const stamp='2026-08-01T12:00:00.000Z';
const materialize=value=>JSON.parse(JSON.stringify(value).replaceAll(baseline.stamp,stamp));
function directory(t){const value=mkdtempSync(path.join(os.tmpdir(),'hither-demo-v4-'));t.after(()=>rmSync(value,{recursive:true,force:true}));return value;}
function legacy(t,{head=false}={}){
 const root=directory(t),store=new Store(root,{seed:false});
 for(const data of [head?baseline.gitHeadSeed:baseline.seed,baseline.expansion,baseline.life,{events:baseline.scopedEvents}])for(const collection of collections)for(const item of data[collection]??[])store.put(collection,materialize(item));
 store.setMeta('profile',materialize((head?baseline.gitHeadSeed:baseline.seed).profile));store.setMeta('demo-migrations',{versions:[2],appliedAt:stamp});store.setMeta('demo-life-v3',{appliedAt:stamp});
 return {root,store};
}
function assertReferences(store){
 for(const collection of ['facts','people','relationships','events','goals'])for(const item of store.list(collection))for(const id of item.sourceIds??[])assert.ok(store.get('sources',id),`${collection}:${item.id} source ${id}`);
 for(const item of store.list('relationships'))for(const id of [item.from,item.to])assert.ok(store.get('people',id));
 for(const item of store.list('events'))for(const id of item.personIds)assert.ok(store.get('people',id));
 for(const item of store.list('conversations'))for(const message of item.messages){assert.ok(item.personIds.includes(message.senderId));assert.ok(store.get('people',message.senderId));assert.ok(store.get('sources',message.sourceId));}
}
test('new demo is a coherent fictional product-engineer life with family, teachers, colleagues and usable conversations',t=>{
 const store=new Store(directory(t));t.after(()=>store.close());
 assert.match(store.meta('profile').description,/2016.*2020.*月之暗面/);assert.equal(store.meta('profile').demo,true);
 assert.equal(store.meta('profile').name,'万叶');assert.equal(store.meta('profile').englishName,undefined);assert.equal(store.meta('profile').demoLocale,'zh-CN');
 assert.equal(store.list('people').filter(person=>person.portrait?.entries.length).length,22);
 assert.equal(store.settings().provider,'moonshot');assert.equal(store.settings().model,'kimi-k3');
 assert.equal(store.list('people').length,22);assert.ok(store.list('relationships').length>=30);assert.ok(store.list('conversations').reduce((sum,item)=>sum+item.messages.length,0)>=140);
 for(const role of ['母亲','父亲','妹妹','大学导师','高中班主任','同事，算法工程师','同事，测试工程师','同事，产品运营'])assert.ok(store.list('people').some(person=>person.role===role),role);
 assert.ok(store.list('events').some(event=>event.date==='2016-09'&&event.endDate==='2020-06'));
 assert.ok(store.list('events').some(event=>event.date==='2023-03'&&event.title.includes('产品工程')));
 const workbench=store.require('events','demo-life-v3-workbench');
 assert.equal(workbench.date,'2026-07');assert.equal(workbench.scope,'milestone');assert.equal(workbench.category,'career');
 assert.match(workbench.description,/暂定.*10\s*月\s*12\s*日.*8\s*人.*试用/,'the trial remains a proposed future date, not a completed July event');
 assert.match(workbench.description,/3\s*人.*(?:还没|尚未|未)回复/,'three participant replies are still outstanding');
 assert.match(workbench.description,/具体时段.*(?:没有定|没定|未定|待定|未确认)/,'no exact trial time has been confirmed');
 assert.deepEqual(workbench.sourceIds,['demo-life-v3-biography']);
 assert.ok(store.require('sources',workbench.sourceIds[0]).text.includes(workbench.description),'the milestone preserves its source wording and uncertainty');
 for(const source of store.list('sources')){assert.equal(source.demo,true);assert.doesNotMatch(source.text,/虚构示例|以下.*全部虚构/);}
 assert.doesNotMatch(JSON.stringify(collections.map(collection=>store.list(collection).map(({history,...item})=>item))),/声音展|音频协作者|社区志愿者|两段声音|南川|青禾|远山智能|林遥/);
 assert.equal(store.list('tasks').length,0);assert.equal(store.list('automations').length,0);assertReferences(store);
});
test('both archived defaults migrate without changing task prompts, model configuration or imported sources, then remain idempotent',t=>{
 for(const head of [false,true]){
  const f=legacy(t,{head}),task=createTask(f.store,{prompt:'用户原始 prompt，不允许迁移重写。',mode:'demo'});
  const imported={id:'user-source',title:'本人资料',kind:'note',text:'不要改这里。',demo:false,createdAt:stamp};f.store.put('sources',imported);
  const connection={...f.store.connection(),name:'用户已经配置的模型',provider:'custom',model:'keep-exact-model',baseUrl:'https://example.test/v1',api:'responses'};f.store.put('modelConnections',connection);f.store.close();
  const upgraded=new Store(f.root);assert.match(upgraded.meta('profile').description,/月之暗面/);assert.deepEqual(upgraded.get('tasks',task.id),task);assert.deepEqual(upgraded.get('sources',imported.id),imported);assert.deepEqual(upgraded.connection(),connection);
  assert.doesNotMatch(JSON.stringify(['sources','people','relationships','events','conversations','goals'].map(c=>upgraded.list(c))),/声音展|音频协作者|社区志愿者|两段声音|南川|青禾|远山智能|林遥/);
  const fact=upgraded.get('facts','fact-budget');assert.equal(fact.version,2);assert.match(fact.history[0].statement,/声音展/);assert.match(fact.history[1].statement,/工作台.*2000.*680/);
  assertReferences(upgraded);const snapshot=Object.fromEntries(collections.map(c=>[c,upgraded.list(c)])),migration=upgraded.meta('demo-engineer-v4');assert.ok(migration.updated.length>70);upgraded.close();
  const again=new Store(f.root);assert.deepEqual(Object.fromEntries(collections.map(c=>[c,again.list(c)])),snapshot);assert.deepEqual(again.meta('demo-engineer-v4'),migration);again.close();
 }
});
test('edits and deletions are protected with their evidence, including populated agent rooms',t=>{
 const f=legacy(t),snapshots=[];
 const change=(collection,id,patch)=>{const before=f.store.require(collection,id),next={...before,...patch};f.store.put(collection,next);snapshots.push([collection,id,structuredClone(next)]);};
 change('people','person-self',{description:'用户亲自写下的人物描述'});
 change('facts','fact-budget',{statement:'用户已纠正为五百元',version:2,history:[...f.store.require('facts','fact-budget').history,{version:2,statement:'用户已纠正为五百元',status:'confirmed',reason:'本人纠正',recordedAt:stamp}]});
 change('conversations','conversation-xuan',{messages:[...f.store.require('conversations','conversation-xuan').messages,{id:'personal-message',senderId:'person-self',content:'我后来补充的真实原话',time:stamp,sourceId:'source-chat'}]});
 change('relationships','rel-chen',{label:'本人确认的新关系'});change('events','event-chat',{date:'2025-01-03'});change('agents','agent-planner',{instructions:'用户自定义助理指令'});
 change('agentRooms','demo-v2-room-studio',{taskIds:['user-task'],messages:[{id:'user-message',role:'user',content:'实际用户已发送的内容',createdAt:stamp}]});
 change('sources','demo-v2-source-chat-song',{demo:false,text:'导入的用户资料'});
 for(const id of ['source-exhibition','source-chat'])snapshots.push(['sources',id,structuredClone(f.store.get('sources',id))]);
 f.store.delete('people','demo-v2-person-lu');f.store.close();
 const upgraded=new Store(f.root);for(const [c,id,value] of snapshots)assert.deepEqual(upgraded.get(c,id),value,`${c}:${id}`);assert.equal(upgraded.get('people','demo-v2-person-lu'),undefined);assert.ok(upgraded.meta('demo-engineer-v4').preserved.length>0);upgraded.close();
});
test('a formal personal space never receives the fixture rewrite',t=>{
 const f=legacy(t);f.store.setMeta('profile',{name:'我的真实空间',description:'用户真实资料',demo:false});const before=Object.fromEntries(collections.map(c=>[c,f.store.list(c)]));f.store.close();
 const reopened=new Store(f.root);assert.equal(reopened.meta('profile').name,'我的真实空间');assert.deepEqual(Object.fromEntries(collections.map(c=>[c,reopened.list(c)])),before);assert.equal(reopened.get('meta','demo-engineer-v4'),undefined);reopened.close();
});

test('formal relationships retain the identity and evidence of the demo people they reference',t=>{
 const f=legacy(t),person=f.store.require('people','demo-v2-person-jiang'),source=f.store.require('sources','demo-v2-source-community');
 const relation={id:'formal-relationship',from:'person-self',to:person.id,label:'用户确认的联系人',description:'真实记录引用了这个原有身份，不能随示例改名。',sourceIds:[]};
 f.store.put('relationships',relation);f.store.close();
 const upgraded=new Store(f.root);assert.deepEqual(upgraded.get('people',person.id),person);assert.equal(upgraded.get('people',person.id).name,'江月');assert.deepEqual(upgraded.get('sources',source.id),source);assert.deepEqual(upgraded.get('relationships',relation.id),relation);upgraded.close();
});


test('verified early FactRevision schema is recognized even after the first conservative migration',t=>{
 const f=legacy(t);
 for(const fact of baseline.preFactRevisionSchema.facts)f.store.put('facts',materialize(fact));
 f.store.setMeta('demo-engineer-v4',{version:4,appliedAt:stamp,updated:[],added:[],preserved:[]});f.store.close();
 const upgraded=new Store(f.root);
 assert.match(upgraded.get('facts','fact-budget').statement,/工作台.*2000.*680/);
 assert.doesNotMatch(JSON.stringify(['sources','people','relationships','events','conversations','goals'].map(c=>upgraded.list(c))),/声音展|音频协作者|社区志愿者|两段声音|南川|青禾|远山智能|林遥/);
 assert.equal(upgraded.meta('demo-engineer-v4').matcherVersion,4);assert.deepEqual(upgraded.meta('demo-engineer-v4').preservedReasons,{});
 const before=upgraded.meta('demo-engineer-v4');upgraded.close();const again=new Store(f.root);assert.deepEqual(again.meta('demo-engineer-v4'),before);again.close();
});

function previousEngineer(t,variant='fresh'){
 const root=directory(t),store=new Store(root,{seed:false}),data=engineerBaseline.installed.find(item=>item.variant===variant);
 for(const collection of collections)for(const row of data[collection]??[])store.put(collection,materialize(row));
 store.setMeta('profile',materialize(data.profile));store.setMeta('demo-migrations',{versions:[2,4],appliedAt:stamp});store.setMeta('demo-life-v3',{appliedAt:stamp});store.setMeta('demo-engineer-v4',{version:4,matcherVersion:2});store.setMeta('demo-person-portraits-v1',{appliedAt:stamp});
 return {root,store};
}
test('all installed engineer fixture variants upgrade to the Chinese persona with coherent portraits, goals and source links',t=>{
 for(const {variant} of engineerBaseline.installed){
  const f=previousEngineer(t,variant);f.store.close();const s=new Store(f.root);
  assert.equal(s.meta('profile').name,'万叶',variant);assert.equal(s.meta('profile').englishName,undefined);assert.equal(s.meta('profile').demoLocale,'zh-CN');
  assert.equal(s.get('people','person-self').name,'万叶');assert.equal(s.get('people','demo-v2-person-jiang').name,'万婷婷');
  assert.equal(s.list('people').filter(row=>row.portrait?.entries.length).length,22);
  for(const person of s.list('people')){
   assert.doesNotMatch(JSON.stringify(person),/南川|青禾|远山智能|林遥|虚构示例/);
   for(const entry of person.portrait.entries)for(const id of entry.sourceIds)assert.ok(s.get('sources',id));
  }
  assert.equal(s.get('goals','goal-exhibition').listId,'goal-list-work');assert.equal(s.get('goals','demo-v2-goal-rest').listId,'goal-list-personal');
  for(const term of ['浙江大学','字节跳动','飞书','月之暗面','奥森','青岛','水槽','片儿川'])assert.ok(JSON.stringify(s.list('sources')).includes(term),term);
  assertReferences(s);assert.deepEqual(s.meta('demo-engineer-v4').preservedReasons,{},variant);
  const snapshot=Object.fromEntries(collections.map(c=>[c,s.list(c)]));s.close();const again=new Store(f.root);assert.deepEqual(Object.fromEntries(collections.map(c=>[c,again.list(c)])),snapshot);again.close();
 }
});
test('engineer migration preserves user-edited portraits and their evidence, deleted defaults, configured resources and live tasks',t=>{
 const f=previousEngineer(t),person=f.store.require('people','person-self');
 person.portrait.entries[0].statement='用户已经亲自改过的身份';person.portrait.version=2;f.store.put('people',person);
 const source=f.store.require('sources','source-exhibition');
 const room=f.store.require('agentRooms','demo-v2-room-studio');room.messages.push({id:'actual-user-message',role:'user',content:'不能被示例更新改写',createdAt:stamp});room.taskIds=['actual-task'];f.store.put('agentRooms',room);
 const task={id:'actual-task',status:'running',prompt:'保留实际任务',messages:[],events:[]};f.store.put('tasks',task);
 const resource={id:'resource-preserved',agentId:'hither',kind:'email',identifier:'fixture@example.com',enabled:false};f.store.put('agentResources',resource);
 f.store.delete('goals','demo-v2-goal-interactive');f.store.close();
 const s=new Store(f.root);assert.deepEqual(s.get('people',person.id),person);assert.deepEqual(s.get('sources',source.id),source);assert.deepEqual(s.get('agentRooms',room.id),room);assert.deepEqual(s.get('tasks',task.id),task);assert.deepEqual(s.get('agentResources',resource.id),resource);assert.equal(s.get('goals','demo-v2-goal-interactive'),undefined);assert.ok(s.meta('demo-engineer-v4').preserved.length>0);s.close();
});
