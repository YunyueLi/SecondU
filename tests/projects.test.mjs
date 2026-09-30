import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,realpathSync,statSync,chmodSync,renameSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
async function fixture(t,runCodex){const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'hither-project-'))),directory=path.join(root,'data'),workspace=path.join(root,'project');mkdirSync(workspace);const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},runCodex});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});const api=async(route,body,method=body===undefined?'GET':'POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:r.status,value:await r.json()};};return {root,app,api,workspace,settled:async id=>{await app.runner.active.get(id)?.promise;return app.store.require('tasks',id);}};}
const projectBody=path=>({name:'Fixture repository',kind:'local',path,description:'Only local fixture data.'});

test('project CRUD validates real directories, preserves referenced locations, archives instead of deleting, and labels remote execution unavailable',async t=>{
 const f=await fixture(t);assert.equal((await f.api('bootstrap')).value.projects.length,0);assert.equal((await f.api('projects',projectBody(f.root))).status,400);assert.equal((await f.api('projects',projectBody(f.app.store.directory))).status,400);
 assert.equal((await f.api('projects',projectBody('relative/path'))).status,400);assert.equal((await f.api('projects',projectBody(path.join(f.root,'missing')))).status,400);
 writeFileSync(path.join(f.root,'file.txt'),'not a directory');assert.equal((await f.api('projects',projectBody(path.join(f.root,'file.txt')))).status,400);
 const created=await f.api('projects',projectBody(f.workspace));assert.equal(created.status,201);const p=created.value;assert.equal(p.path,realpathSync(f.workspace));assert.equal(p.execution.status,'ready');
 const task=(await f.api('tasks',{prompt:'Discuss only',mode:'demo',projectId:p.id})).value;assert.equal(task.projectId,p.id);
 assert.equal((await f.api(`tasks/${task.id}`,{projectId:null},'PUT')).status,409);
 assert.equal((await f.api(`projects/${p.id}`,{path:f.root},'PUT')).status,409);assert.equal((await f.api(`projects/${p.id}`,{},'DELETE')).status,405);
 const archived=await f.api(`projects/${p.id}`,{name:'Renamed',archived:true},'PUT');assert.equal(archived.value.execution.status,'unavailable');assert.equal((await f.api('tasks',{prompt:'No run',mode:'demo',projectId:p.id})).status,409);
 assert.equal((await f.api(`projects/${p.id}`,{archived:false},'PUT')).value.execution.status,'ready');
 const remote=await f.api('projects',{name:'Linked repository',kind:'remote',url:'https://example.com/repository',description:'No executor'});assert.equal(remote.value.execution.status,'unavailable');assert.match(remote.value.execution.reason,/未连接远端执行器/);assert.equal((await f.api('tasks',{prompt:'Remote',mode:'live',projectId:remote.value.id})).status,409);
 assert.equal((await f.api('projects',{name:'Bad',kind:'remote',url:'https://user:password@example.com/repo'})).status,400);
 renameSync(f.workspace,path.join(f.root,'moved'));assert.equal((await f.api(`projects/${p.id}`)).value.execution.status,'unavailable');assert.equal((await f.api(`tasks/${task.id}/run`,{})).status,409);assert.equal((await f.api(`projects/${p.id}`,{archived:true},'PUT')).status,200);
});

test('a project is the actual execution cwd; only changed/new eligible files become artifacts and no-project tasks remain isolated',async t=>{
 const seen=[];const f=await fixture(t,async options=>{seen.push(options.workspace);if(seen.length===1){writeFileSync(path.join(options.workspace,'src/main.ts'),'export const version = 2;');writeFileSync(path.join(options.workspace,'new.md'),'New document.');writeFileSync(path.join(options.workspace,'.env'),'SECRET=do-not-copy');writeFileSync(path.join(options.workspace,'credentials.json'),'{"secret":"do-not-copy"}');writeFileSync(path.join(options.workspace,'config.json'),'{"apiKey":"another-secret-value"}');}return {text:'A normal reply.'};});
 mkdirSync(path.join(f.workspace,'src'));mkdirSync(path.join(f.workspace,'node_modules'));writeFileSync(path.join(f.workspace,'existing.md'),'Unchanged');writeFileSync(path.join(f.workspace,'src/main.ts'),'export const version = 1;');chmodSync(path.join(f.workspace,'src/main.ts'),0o755);writeFileSync(path.join(f.workspace,'node_modules/dependency.js'),'Unchanged dependency');symlinkSync(f.root,path.join(f.workspace,'outside-link'));
 const p=(await f.api('projects',projectBody(f.workspace))).value;await f.api('settings/provider',{apiKey:'fake-project-key'},'PUT');
 const task=(await f.api('tasks',{prompt:'Update source and write a document.',mode:'live',projectId:p.id})).value;await f.api(`tasks/${task.id}/run`,{});const done=await f.settled(task.id);
 assert.equal(done.status,'completed',done.error);assert.equal(seen[0],f.workspace);const artifacts=done.artifactIds.map(id=>f.app.store.require('artifacts',id));assert.deepEqual(artifacts.map(a=>a.name).sort(),['new.md','src/main.ts']);assert.ok(artifacts.every(a=>a.origin.kind==='workspace'));assert.equal(statSync(path.join(f.workspace,'src/main.ts')).mode&0o777,0o755,'collection must not rewrite project files');assert.equal(readFileSync(path.join(f.workspace,'existing.md'),'utf8'),'Unchanged');
 assert.ok(done.events.some(e=>e.type==='artifact_collection_warning'));
 const script=artifacts.find(a=>a.name==='src/main.ts');assert.equal((await f.api(`artifacts/${script.id}`,{baseVersion:script.version,content:'export const version = 3;'},'PUT')).status,200);assert.equal(readFileSync(path.join(f.workspace,'src/main.ts'),'utf8'),'export const version = 3;');assert.equal(statSync(path.join(f.workspace,'src/main.ts')).mode&0o777,0o755,'editing a project file must preserve its executable mode');
 const isolated=(await f.api('tasks',{prompt:'Hi',mode:'live'})).value;await f.api(`tasks/${isolated.id}/run`,{});await f.settled(isolated.id);assert.equal(seen[1],path.join(f.app.store.workspace,isolated.id));assert.notEqual(seen[1],f.workspace);
});

test('demo spaces cannot bind or browse another space data directory through a project',async t=>{
 const f=await fixture(t);await f.api('spaces/demo-engineer-v4',{});const prefix='spaces/demo-engineer-v4/';
 const result=await f.api(prefix+'projects',projectBody(f.app.store.workspace));assert.equal(result.status,400);assert.equal(result.value.code,'invalid_project_path');
 assert.equal((await f.api(prefix+'projects',projectBody(f.workspace))).status,201,'explicit external project folders remain usable');
});

test('project greetings and follow-ups keep the task cwd without producing artifacts or file approvals',async t=>{
 const seen=[];const f=await fixture(t,async options=>{seen.push(options.workspace);return {text:'Hello from a local fixture.'};});const p=(await f.api('projects',projectBody(f.workspace))).value;await f.api('settings/provider',{apiKey:'fake-project-key'},'PUT');
 writeFileSync(path.join(f.workspace,'existing.md'),'Keep existing file.');
 for(const mode of ['demo','live']){
  const task=(await f.api('tasks',{prompt:'你好',mode,projectId:p.id})).value;await f.api(`tasks/${task.id}/run`,{});const first=await f.settled(task.id);assert.equal(first.status,'completed',first.error);assert.deepEqual(first.artifactIds,[]);assert.deepEqual(first.approvals,[]);
  assert.equal((await f.api(`tasks/${task.id}`,{projectId:null},'PUT')).status,409);await f.api(`tasks/${task.id}/message`,{content:'谢谢你'});const continued=await f.settled(task.id);assert.equal(continued.status,'completed',continued.error);assert.equal(continued.projectId,p.id);assert.deepEqual(continued.artifactIds,[]);assert.deepEqual(continued.approvals,[]);
 }
 assert.deepEqual(seen,[f.workspace,f.workspace]);assert.equal(readFileSync(path.join(f.workspace,'existing.md'),'utf8'),'Keep existing file.');
});

test('project conversations inherit a fixed project and two tasks cannot concurrently write the same project',async t=>{
 let release,enter;const entered=new Promise(r=>enter=r),paused=new Promise(r=>release=r);const f=await fixture(t,async()=>{enter();await paused;return {text:'Done.'};});
 const p=(await f.api('projects',projectBody(f.workspace))).value,agent=(await f.api('agents',{name:'Fixture',role:'Assistant',instructions:'Fixture'})).value;
 const room=(await f.api('agent-rooms',{kind:'direct',agentIds:[agent.id],projectId:p.id,mode:'live'})).value;assert.equal(room.projectId,p.id);await f.api('settings/provider',{apiKey:'fake-project-key'},'PUT');
 const sent=(await f.api(`agent-rooms/${room.id}/messages`,{content:'Hi'})).value;await entered;assert.equal(sent.task.projectId,p.id);
 const second=(await f.api('tasks',{prompt:'Another',mode:'live',projectId:p.id})).value;assert.equal((await f.api(`tasks/${second.id}/run`,{})).status,409);const before=f.app.store.require('tasks',second.id);assert.equal((await f.api(`tasks/${second.id}/message`,{content:'Must not append'})).status,409);assert.deepEqual(f.app.store.require('tasks',second.id),before);
 const overlap=(await f.api('projects',{...projectBody(f.workspace),name:'Same folder alias'})).value;const third=(await f.api('tasks',{prompt:'Overlap',mode:'live',projectId:overlap.id})).value;assert.equal((await f.api(`tasks/${third.id}/run`,{})).status,409);assert.equal((await f.api(`projects/${p.id}`,{archived:true},'PUT')).status,409);release();await f.settled(sent.task.id);
 const cleared=await f.api(`agent-rooms/${room.id}`,{projectId:null},'PUT');assert.equal(cleared.value.projectId,undefined);
});

test('a room with an interrupted task cannot switch its project before continuing the original task',async t=>{
 const f=await fixture(t,async()=>{throw Object.assign(new Error('Fixture runtime interrupted'),{name:'AbortError'});});const p=(await f.api('projects',projectBody(f.workspace))).value;await f.api('settings/provider',{apiKey:'fake-project-key'},'PUT');
 const agent=(await f.api('agents',{name:'Fixture',role:'Assistant',instructions:'Fixture'})).value,room=(await f.api('agent-rooms',{kind:'direct',agentIds:[agent.id],projectId:p.id,mode:'live'})).value;
 const sent=(await f.api(`agent-rooms/${room.id}/messages`,{content:'Hi'})).value;assert.equal((await f.settled(sent.task.id)).status,'interrupted');
 assert.equal((await f.api(`agent-rooms/${room.id}`,{projectId:null},'PUT')).status,409);assert.equal((await f.api(`agent-rooms/${room.id}`,{title:'Still the same project'},'PUT')).status,200);assert.equal(f.app.store.require('tasks',sent.task.id).projectId,p.id);
 await f.api(`tasks/${sent.task.id}/cancel`,{});assert.equal((await f.api(`agent-rooms/${room.id}`,{projectId:null},'PUT')).status,200);
});

test('project file listing is bounded and rejects traversal/symlinks; edits protect external changes and deletion retains originals',async t=>{
 const f=await fixture(t,async({workspace})=>{writeFileSync(path.join(workspace,'generated.md'),'Generated.');return {text:'Done.'};});const p=(await f.api('projects',projectBody(f.workspace))).value;
 mkdirSync(path.join(f.workspace,'src'));writeFileSync(path.join(f.workspace,'src/file.ts'),'text');writeFileSync(path.join(f.workspace,'.env'),'secret');writeFileSync(path.join(f.workspace,'api-key.txt'),'secret');symlinkSync(f.root,path.join(f.workspace,'linked'));
 const files=await f.api(`projects/${p.id}/files`);assert.equal(files.status,200);assert.deepEqual(files.value.entries.map(e=>e.name),['src']);assert.equal((await f.api(`projects/${p.id}/files?path=src`)).value.entries[0].path,'src/file.ts');for(const value of ['..','../','linked','.env','src/../../'])assert.equal((await f.api(`projects/${p.id}/files?path=${encodeURIComponent(value)}`)).status,400);
 for(let i=0;i<205;i++)writeFileSync(path.join(f.workspace,`item-${i}.txt`),'x');const many=await f.api(`projects/${p.id}/files`);assert.equal(many.value.entries.length,200);assert.equal(many.value.truncated,true);
 await f.api('settings/provider',{apiKey:'fake-project-key'},'PUT');const task=(await f.api('tasks',{prompt:'Create a document.',mode:'live',projectId:p.id})).value;await f.api(`tasks/${task.id}/run`,{});const done=await f.settled(task.id);assert.equal(done.artifactIds.length,1);const artifact=f.app.store.require('artifacts',done.artifactIds[0]);
 assert.equal((await f.api('artifacts',{taskId:task.id,name:'src/file.ts',content:'Overwrite'})).status,409);assert.equal(readFileSync(path.join(f.workspace,'src/file.ts'),'utf8'),'text');
 writeFileSync(path.join(f.workspace,'generated.md'),'User edited outside Hither.');assert.equal((await f.api(`artifacts/${artifact.id}`,{baseVersion:1,content:'Stale edit'},'PUT')).status,409);assert.equal((await f.api(`artifacts/${artifact.id}`,{},'DELETE')).status,405);
 assert.equal((await f.api(`tasks/${task.id}`,{},'DELETE')).status,200);assert.equal(readFileSync(path.join(f.workspace,'generated.md'),'utf8'),'User edited outside Hither.');
});
