import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,symlinkSync,mkdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {apiUrl,currentSpace,spaceStorageKey,spaceHref,exampleSpaceForLocale} from '../src/space.ts';
const namespace='spaces/demo-cn-v1/';
async function fixture(t,directory=mkdtempSync(path.join(os.tmpdir(),'hither-spaces-'))){
 const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 let closed=false;const close=async()=>{if(!closed){closed=true;await app.close();}};
 const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();return {status:response.status,value:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text};};
 t.after(async()=>{await close();rmSync(directory,{recursive:true,force:true});});return {app,api,directory,close};
}
test('creating a fictional space leaves originals, keys, tasks, files and downloads isolated',async t=>{
 const f=await fixture(t);f.app.store.setMeta('profile',{name:'Original',description:'keep',demo:false});
 const connection=f.app.store.connection();f.app.store.setKey(connection,'local-fixture-key');
 const task=(await f.api('tasks',{prompt:'Original task: 保存计划文档',mode:'demo'})).value;
 const artifact=(await f.api('artifacts',{taskId:task.id,name:'original.txt',content:'original file'})).value;
 await f.api(`tasks/${task.id}/run`,{});assert.equal(f.app.runner.active.has(task.id),true);
 assert.equal((await f.api(namespace+'bootstrap')).status,404);assert.equal(existsSync(path.join(realpathSync(f.directory),'spaces')),false);
 const creation=await f.api('spaces/demo-cn-v1',{});assert.equal(creation.status,200);
 const demo=(await f.api(namespace+'bootstrap')).value,original=(await f.api('bootstrap')).value;
 assert.equal(demo.profile.demo,true);assert.match(demo.profile.description,/月之暗面/);assert.equal(demo.people.length,22);assert.equal(demo.tasks.length,15);assert.ok(demo.tasks.every(task=>task.mode==='demo'&&task.status==='completed'));assert.equal(demo.automations.length,2);assert.ok(demo.automations.every(automation=>!automation.enabled));assert.equal(demo.settings.hasKey,false);
 assert.equal(original.profile.name,'Original');assert.equal(original.settings.hasKey,true);assert.equal(original.tasks[0].id,task.id);
 assert.notEqual(demo.computer.workspace,original.computer.workspace);assert.ok(demo.computer.workspace.startsWith(path.join(realpathSync(f.directory),'spaces')));
 assert.equal((await f.api(namespace+`tasks/${task.id}/cancel`,{})).status,404);assert.equal(f.app.store.require('tasks',task.id).status,'awaiting_approval');assert.equal(f.app.runner.active.has(task.id),true);
 assert.equal((await f.api(namespace+`artifacts/${artifact.id}/download`)).status,404);assert.equal((await f.api(`artifacts/${artifact.id}/download`)).value,'original file');
 const demoTask=(await f.api(namespace+'tasks',{prompt:'Demo task only',mode:'demo'})).value;assert.equal(f.app.store.get('tasks',demoTask.id),undefined);
 assert.equal((await f.api(namespace+'export')).value.tasks.length,demo.tasks.length+1);assert.equal((await f.api('export')).value.tasks[0].id,task.id);
 assert.doesNotMatch(JSON.stringify((await f.api(namespace+'export')).value),/local-fixture-key|Original task|original file/);
 await f.api(namespace+'people/person-self',{description:'Example edit'},'PUT');await f.api('spaces/demo-cn-v1',{});
 assert.equal((await f.api(namespace+'people/person-self')).value.description,'Example edit'); // Entering again never resets it.
 await f.close();const after=await fixture(t,f.directory); // Same local database may be reopened; no reset of original or demo.
 assert.equal((await after.api(namespace+'people/person-self')).value.description,'Example edit');assert.equal((await after.api('bootstrap')).value.profile.name,'Original');
});
test('unknown nested spaces and symlinked directories never fall back to the original database',async t=>{
 const f=await fixture(t);
 assert.equal((await f.api('spaces/other/tasks',{prompt:'wrong',mode:'demo'})).status,404);assert.equal(f.app.store.list('tasks').length,0);
 const other=mkdtempSync(path.join(os.tmpdir(),'hither-not-a-space-'));t.after(()=>rmSync(other,{recursive:true,force:true}));mkdirSync(path.join(realpathSync(f.directory),'spaces'));symlinkSync(other,path.join(f.directory,'spaces','demo-cn-v1'));
 assert.equal((await f.api('spaces/demo-cn-v1',{})).status,409);assert.equal(existsSync(path.join(other,'hither.sqlite')),false);
});
test('space-specific API paths, local images, drafts and favorites do not cross tabs or silently fall back',()=>{
 const query='?space=demo-cn-v1';
 assert.equal(apiUrl('/tasks',''),'/api/tasks');assert.equal(apiUrl('/tasks',query),'/api/spaces/demo-cn-v1/tasks');assert.equal(apiUrl('/api/avatars/a.png',query),'/api/spaces/demo-cn-v1/avatars/a.png');
 assert.notEqual(spaceStorageKey('hither.agent-room.draft.same',''),spaceStorageKey('hither.agent-room.draft.same',query));assert.throws(()=>currentSpace('?space=unknown'));assert.throws(()=>apiUrl('/tasks','?space=unknown'));
 assert.equal(spaceHref('main','http://127.0.0.1:58645/?space=demo-cn-v1#agents/x'),'/?space=main#settings/personal');assert.equal(spaceHref('demo-cn-v1','http://127.0.0.1:58645/'),'/?space=demo-cn-v1#settings/personal');
});
test('a real personal space starts without fictional people and preserves all three spaces after restart',async t=>{
 const f=await fixture(t);f.app.store.setMeta('profile',{name:'Original',description:'keep',demo:false});
 const original=(await f.api('sources',{title:'Original only',text:'Must remain in original'})).value;
 await f.api('spaces/demo-cn-v1',{});
 assert.equal((await f.api('spaces/personal/bootstrap')).status,404);
 assert.equal((await f.api('spaces/personal',{})).status,200);
 const initial=(await f.api('spaces/personal/bootstrap')).value;
 for(const key of ['people','facts','sources','projects','events','goals','agents','tasks','automations'])assert.equal(initial[key].length,0,key);
 assert.equal(initial.profile.demo,false);assert.equal(initial.settings.hasKey,false);
 await f.api('spaces/personal/profile',{name:'A real local user',description:'Real project work'},'PUT');
 const source=(await f.api('spaces/personal/sources',{title:'Project source',text:'Real local document'})).value;
 const person=(await f.api('spaces/personal/people',{name:'Person in own space',sourceIds:[source.id]})).value;
 assert.equal((await f.api('profile',{selfPersonId:person.id},'PUT')).status,404);
 assert.equal((await f.api('spaces/personal/profile',{selfPersonId:person.id},'PUT')).value.selfPersonId,person.id);
 assert.equal((await f.api('spaces/personal/profile',{description:'Updated'},'PUT')).value.selfPersonId,person.id);
 assert.equal((await f.api(`spaces/personal/people/${person.id}`,{},'DELETE')).status,409);
 const fact=(await f.api('spaces/personal/facts',{statement:'Confirmed project context',status:'confirmed',sourceIds:[source.id]})).value;
 assert.equal((await f.api(`sources/${source.id}`)).status,404);
 assert.equal((await f.api(`spaces/demo-cn-v1/sources/${source.id}`)).status,404);
 assert.equal((await f.api('spaces/personal/spaces/demo-cn-v1/bootstrap')).status,404);
 assert.equal((await f.api('spaces/personal/facts',{statement:'Wrong-space ref',sourceIds:[original.id]})).status,404);
 await f.api('spaces/personal',{});assert.equal((await f.api('spaces/personal/bootstrap')).value.facts[0].id,fact.id);
 await f.close();const after=await fixture(t,f.directory);
 const recovered=(await after.api('spaces/personal/bootstrap')).value;
 assert.equal(recovered.profile.name,'A real local user');assert.equal(recovered.profile.demo,false);assert.equal(recovered.facts[0].id,fact.id);
 assert.equal(recovered.profile.selfPersonId,person.id);
 assert.equal((await after.api('spaces/demo-cn-v1/bootstrap')).value.profile.demo,true);
 assert.equal((await after.api('bootstrap')).value.sources[0].id,original.id);
 assert.equal(apiUrl('/facts','?space=personal'),'/api/spaces/personal/facts');
 assert.notEqual(spaceStorageKey('draft','?space=personal'),spaceStorageKey('draft','?space=demo-cn-v1'));
 assert.equal(spaceHref('personal','http://127.0.0.1:58645/'),'/?space=personal#settings/personal');
});

test('Chinese and American examples remain separate lives with independent files, edits and keys after restart',async t=>{
 const f=await fixture(t);
 assert.equal((await f.api('spaces/demo-us-v1',{})).status,200);
 assert.equal((await f.api('spaces/demo-cn-v1',{})).status,200);
 const us=(await f.api('spaces/demo-us-v1/bootstrap')).value,zh=(await f.api(namespace+'bootstrap')).value;
 assert.equal(us.profile.demoLocale,'en');
 assert.equal(us.profile.name,'Caspian');
 assert.equal(zh.profile.name,'万叶');
 assert.notEqual(us.profile.selfPersonId,zh.profile.selfPersonId);
 for(const collection of ['people','conversations','tasks','artifacts','projects']){
  const ids=new Set(zh[collection].map(item=>item.id));
  assert.ok(us[collection].length>0,collection);
  assert.ok(us[collection].every(item=>!ids.has(item.id)),`${collection} identities must not cross spaces`);
 }
 const person=us.people.find(person=>person.id===us.profile.selfPersonId);
 assert.equal((await f.api(`spaces/demo-us-v1/people/${person.id}`,{description:'My own English edit'},'PUT')).status,200);
 assert.equal((await f.api(namespace+`people/${person.id}`)).status,404);
 const file=us.artifacts[0];
 const download=await f.api(`spaces/demo-us-v1/artifacts/${file.id}/download`);
 assert.equal(download.status,200);assert.equal(download.value,file.content);
 assert.equal((await f.api(namespace+`artifacts/${file.id}/download`)).status,404);
 assert.equal(us.settings.hasKey,false);assert.equal(zh.settings.hasKey,false);
 await f.close();const again=await fixture(t,f.directory);
 assert.equal((await again.api(`spaces/demo-us-v1/people/${person.id}`)).value.description,'My own English edit');
 assert.equal((await again.api(namespace+'bootstrap')).value.profile.name,'万叶');
 assert.equal(exampleSpaceForLocale('en'),'demo-us-v1');
 assert.equal(exampleSpaceForLocale('zh-CN'),'demo-cn-v1');
 assert.notEqual(spaceStorageKey('draft','?space=demo-us-v1'),spaceStorageKey('draft','?space=demo-cn-v1'));
});
