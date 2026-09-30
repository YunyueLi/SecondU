import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {ensureDemoShowcase} from '../server/demo-showcase.mjs';
import {publicProject} from '../server/projects.mjs';
import {localizeDemoBootstrap} from '../shared/demo-localization.mjs';
import {createHash} from 'node:crypto';
import copyChanges from '../server/fixtures/demo-showcase-copy-v2.json' with {type:'json'};
import projectNames from '../server/fixtures/demo-showcase-project-names-v1.json' with {type:'json'};

const currentProjectNames=['工作台内测','国庆回杭州','青岛照片','十月安排'];
const projectEnglishNames=['Kimi Workbench','Hangzhou Trip','Personal Portfolio','Quarterly Plan'];

test('authored examples have working project files, linked deliverables and no executable automation',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-showcase-'));const store=new Store(path.join(dir,'data'));
 try{
  const report=ensureDemoShowcase(store);assert.equal(report.records.filter(x=>x.collection==='projects').length,4);
  for(const project of store.list('projects'))assert.equal(publicProject(project,store.directory).execution.status,'ready');
  for(const task of store.list('tasks').filter(x=>x.id.startsWith('demo-showcase-'))){
   assert.equal(task.mode,'demo');assert.equal(task.status,'completed');assert.ok(task.messages.length>=6);
   for(const id of task.artifactIds){const artifact=store.require('artifacts',id);const project=store.require('projects',task.projectId);assert.equal(readFileSync(path.join(project.path,artifact.name),'utf8'),artifact.content);}
  }
  assert.ok(store.list('automations').filter(x=>x.id.startsWith('demo-showcase-')).every(x=>!x.enabled));
  const current=store.require('tasks','demo-showcase-task-launch');store.put('tasks',{...current,title:'My edited title'});assert.equal(ensureDemoShowcase(store),undefined);assert.equal(store.require('tasks',current.id).title,'My edited title');
  const data={profile:store.meta('profile'),tasks:store.list('tasks'),artifacts:store.list('artifacts'),projects:store.list('projects')};const en=localizeDemoBootstrap(data,'en');
  assert.equal(en.tasks.find(x=>x.id===current.id).title,'My edited title');assert.equal(en.artifacts.find(x=>x.id==='demo-showcase-artifact-launch').content,data.artifacts.find(x=>x.id==='demo-showcase-artifact-launch').content);assert.equal(data.artifacts.find(x=>x.id==='demo-showcase-artifact-launch').content.startsWith('# 内测反馈分析与发布建议'),true);
  projectNames.forEach((change,index)=>{
   const project=store.require('projects',change.id);
   assert.equal(project.name,currentProjectNames[index]);
   const readme=readFileSync(path.join(project.path,'README.md'),'utf8');assert.ok(readme.startsWith(`# ${currentProjectNames[index]}\n`));assert.ok(!readme.includes('undefined'));
  });
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('personal stores never receive authored demonstration data',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-personal-'));const store=new Store(path.join(dir,'data'),{seed:false});try{assert.equal(ensureDemoShowcase(store),undefined);assert.equal(store.list('projects').length,0);assert.equal(store.list('tasks').length,0);assert.equal(store.get('meta','demo-showcase-copy-v2'),undefined);assert.equal(store.get('meta','demo-showcase-project-names-v1'),undefined);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('project names migrate independently after task copy, preserving paths, files and linked records',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-showcase-project-names-'));const store=new Store(path.join(dir,'data'));
 try{
  ensureDemoShowcase(store);
  const installation=store.meta('demo-showcase-v1'),taskCopyReport=store.meta('demo-showcase-copy-v2');
  for(const change of projectNames){
   const record={...store.require(change.collection,change.id),name:change.from};store.put(change.collection,record);
   installation.records.find(item=>item.collection===change.collection&&item.id===change.id).sha256=createHash('sha256').update(JSON.stringify(record)).digest('hex');
  }
  store.setMeta('demo-showcase-v1',installation);store.delete('meta','demo-showcase-project-names-v1');
  const beforeProjects=store.list('projects'),beforeTasks=store.list('tasks'),beforeArtifacts=store.list('artifacts');
  const readmes=new Map(beforeProjects.filter(project=>projectNames.some(change=>change.id===project.id)).map(project=>[project.id,readFileSync(path.join(project.path,'README.md'),'utf8')]));
  ensureDemoShowcase(store);
  assert.equal(store.meta('demo-showcase-project-names-v1').updated.length,4);assert.deepEqual(store.meta('demo-showcase-copy-v2'),taskCopyReport);
  for(const before of beforeProjects){
   const change=projectNames.find(item=>item.id===before.id),after=store.require('projects',before.id);
   assert.deepEqual(after,{...before,name:change?.to??before.name});
   if(change){assert.equal(readFileSync(path.join(after.path,'README.md'),'utf8'),readmes.get(after.id));assert.equal(store.meta('demo-showcase-v1').records.find(item=>item.id===after.id).sha256,createHash('sha256').update(JSON.stringify(after)).digest('hex'));}
  }
  assert.deepEqual(store.list('tasks'),beforeTasks);assert.deepEqual(store.list('artifacts'),beforeArtifacts);
  const en=localizeDemoBootstrap({profile:store.meta('profile'),projects:store.list('projects')},'en');
  projectNames.forEach((change,index)=>assert.equal(en.projects.find(item=>item.id===change.id).name,projectEnglishNames[index]));
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('project name migration preserves custom fields, custom names, missing seeds and later edits',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-showcase-project-preserve-'));const store=new Store(path.join(dir,'data'));
 try{
  ensureDemoShowcase(store);
  for(const change of projectNames)store.put('projects',{...store.require('projects',change.id),name:change.from});
  const [workbench,hangzhou,fieldnotes,quarter]=projectNames;
  const moved={...store.require('projects',workbench.id),path:path.join(dir,'my-existing-folder'),description:'My own project description'};store.put('projects',moved);
  const renamed={...store.require('projects',hangzhou.id),name:'My family itinerary'};store.put('projects',renamed);
  const installation=store.meta('demo-showcase-v1');installation.records=installation.records.filter(item=>item.id!==fieldnotes.id);store.setMeta('demo-showcase-v1',installation);
  store.delete('projects',quarter.id);store.delete('meta','demo-showcase-project-names-v1');
  ensureDemoShowcase(store);
  assert.deepEqual(store.require('projects',workbench.id),{...moved,name:workbench.to});assert.deepEqual(store.require('projects',hangzhou.id),renamed);
  assert.equal(store.require('projects',fieldnotes.id).name,fieldnotes.from);assert.equal(store.get('projects',quarter.id),undefined);
  const report=store.meta('demo-showcase-project-names-v1');assert.equal(report.updated.length,1);assert.equal(report.preserved.length,3);
  const en=localizeDemoBootstrap({profile:store.meta('profile'),projects:[renamed]},'en');assert.equal(en.projects[0].name,renamed.name);
  store.put('projects',{...moved,name:workbench.from});ensureDemoShowcase(store);assert.deepEqual(store.require('projects',workbench.id),{...moved,name:workbench.from});assert.deepEqual(store.meta('demo-showcase-project-names-v1'),report);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('copy migration changes only an installed example title that still matches its authored text',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-showcase-copy-'));const store=new Store(path.join(dir,'data'));
 try{
  ensureDemoShowcase(store);
  const installation=store.meta('demo-showcase-v1');
  for(const change of copyChanges){
   const record={...store.require(change.collection,change.id),[change.field]:change.from};
   store.put(change.collection,record);
   installation.records.find(item=>item.collection===change.collection&&item.id===change.id).sha256=createHash('sha256').update(JSON.stringify(record)).digest('hex');
  }
  const launch=store.require('tasks','demo-showcase-task-launch');
  launch.messages.push({id:'user-added-message',role:'user',content:'Keep this added message.',createdAt:'2026-10-01T00:00:00.000Z'});store.put('tasks',launch);
  const family=store.require('tasks','demo-showcase-task-family');family.title='My family plan';store.put('tasks',family);
  installation.records=installation.records.filter(item=>item.id!=='demo-showcase-task-demo-story');store.setMeta('demo-showcase-v1',installation);
  store.delete('meta','demo-showcase-copy-v2');
  const beforeTasks=store.list('tasks'),beforeArtifacts=store.list('artifacts');
  ensureDemoShowcase(store);
  const report=store.meta('demo-showcase-copy-v2');assert.equal(report.updated.length,4);assert.equal(report.preserved.length,2);
  for(const before of beforeTasks){
   const after=store.require('tasks',before.id),change=copyChanges.find(item=>item.id===before.id);
   const shouldChange=!!change&&before.title===change.from&&installation.records.some(item=>item.id===before.id);
   assert.deepEqual(after,{...before,title:shouldChange?change.to:before.title});
  }
  assert.deepEqual(store.list('artifacts'),beforeArtifacts);
  const current=store.require('tasks',launch.id),en=localizeDemoBootstrap({profile:store.meta('profile'),tasks:[current]},'en');
  assert.equal(current.messages.at(-1).content,'Keep this added message.');
  assert.equal(en.tasks[0].title,'Review user feedback and choose three priorities for the next release');
  store.put('tasks',{...current,title:copyChanges.find(item=>item.id===launch.id).from});
  ensureDemoShowcase(store);assert.equal(store.require('tasks',launch.id).title,copyChanges.find(item=>item.id===launch.id).from);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
