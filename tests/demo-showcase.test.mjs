import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {ensureDemoShowcase} from '../server/demo-showcase.mjs';
import {publicProject} from '../server/projects.mjs';
import {localizeDemoBootstrap} from '../shared/demo-localization.mjs';

test('authored examples have working project files, linked deliverables and no executable automation',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-showcase-'));const store=new Store(path.join(dir,'data'));
 try{
  const report=ensureDemoShowcase(store);assert.equal(report.records.filter(x=>x.collection==='projects').length,4);
  for(const project of store.list('projects'))assert.equal(publicProject(project,store.directory).execution.status,'ready');
  for(const task of store.list('tasks').filter(x=>x.id.startsWith('demo-showcase-'))){
   assert.equal(task.mode,'demo');assert.equal(task.status,'completed');assert.equal(task.messages.length,4);
   for(const id of task.artifactIds){const artifact=store.require('artifacts',id);const project=store.require('projects',task.projectId);assert.equal(readFileSync(path.join(project.path,artifact.name),'utf8'),artifact.content);}
  }
  assert.ok(store.list('automations').filter(x=>x.id.startsWith('demo-showcase-')).every(x=>!x.enabled));
  const current=store.require('tasks','demo-showcase-task-launch');store.put('tasks',{...current,title:'My edited title'});assert.equal(ensureDemoShowcase(store),undefined);assert.equal(store.require('tasks',current.id).title,'My edited title');
  const data={profile:store.meta('profile'),tasks:store.list('tasks'),artifacts:store.list('artifacts'),projects:store.list('projects')};const en=localizeDemoBootstrap(data,'en');
  assert.equal(en.tasks.find(x=>x.id===current.id).title,'My edited title');assert.match(en.artifacts.find(x=>x.id==='demo-showcase-artifact-launch').content,/Two-day pilot/);assert.equal(data.artifacts.find(x=>x.id==='demo-showcase-artifact-launch').content.startsWith('# 两天'),true);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('personal stores never receive authored demonstration data',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-personal-'));const store=new Store(path.join(dir,'data'),{seed:false});try{assert.equal(ensureDemoShowcase(store),undefined);assert.equal(store.list('projects').length,0);assert.equal(store.list('tasks').length,0);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
