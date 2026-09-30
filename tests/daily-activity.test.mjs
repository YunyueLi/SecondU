import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
import { activityTimestamp, previewActivityImport, commitActivityImport, dailyActivity } from '../server/daily-activity.mjs';

const doc=(overrides={})=>({format:'hither.activity.v1',sourceId:'local-fixture',demo:true,activities:[{id:'a',title:'Fictional work session',summary:'Fixture only.',start:'2026-09-29T00:10:00+08:00',end:'2026-09-29T00:20:00+08:00',app:'Fixture editor',sourceUrl:'https://example.com/note',reference:'/local/export/a'}],...overrides});
function fixture(t){const dir=mkdtempSync(path.join(os.tmpdir(),'hither-daily-'));const store=new Store(dir,{seed:false});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const preview=(s,d=doc())=>previewActivityImport(s,{filename:'activity.json',content:JSON.stringify(d)});

test('activity timestamps require explicit offsets and valid calendar time without inventing local time',()=>{
 assert.equal(activityTimestamp('2026-09-29T00:10:00+08:00'),'2026-09-28T16:10:00.000Z');assert.equal(activityTimestamp('2024-02-29T23:59:59.125Z'),'2024-02-29T23:59:59.125Z');
 for(const value of ['2026-02-30T10:00:00Z','2026-09-29T10:00:00','2026-09-29','2026-09-29T24:00:00Z','2026-09-29T10:00:00+14:30','2026-09-29T10:00:60Z'])assert.throws(()=>activityTimestamp(value),undefined,value);
});
test('preview is not an imported event; confirmation saves exact evidence, deduplicates normalized instants and survives restart',t=>{
 const s=fixture(t),original=JSON.stringify(doc(),null,2),p=previewActivityImport(s,{filename:'original.json',content:original});assert.equal(s.list('sources').length,0);assert.equal(s.list('dailyActivities').length,0);assert.equal(s.list('events').length,0);assert.equal(p.items[0].startAt,'2026-09-28T16:10:00.000Z');
 const result=commitActivityImport(s,p.previewId),source=s.require('sources',result.sourceId);assert.equal(source.text,original);assert.equal(source.activityImport.sha256,createHash('sha256').update(original).digest('hex'));assert.equal(source.demo,true);assert.equal(result.added,1);assert.equal(s.list('events').length,0);assert.equal(s.list('facts').length,0);assert.equal(commitActivityImport(s,p.previewId).alreadyImported,true);
 const second=doc();second.activities[0].start='2026-09-28T16:10:00Z';second.activities[0].end='2026-09-28T16:20:00Z';const secondResult=commitActivityImport(s,preview(s,second).previewId);assert.equal(secondResult.added,0);assert.equal(s.list('dailyActivities').length,1);assert.equal(s.list('dailyActivities')[0].sourceIds.length,2);assert.equal(s.list('dailyActivities')[0].reference,'/local/export/a');
 const reopened=new Store(s.directory,{seed:false});assert.equal(dailyActivity(reopened).length,1);assert.equal(reopened.list('sources').length,2);reopened.close();
});
test('invalid/conflicting files and expired previews preserve prior originals and all data',t=>{
 const s=fixture(t),p=preview(s);commitActivityImport(s,p.previewId);const before=JSON.stringify(s.list('dailyActivities')),changed=doc();changed.activities[0].summary='Different content';assert.throws(()=>preview(s,changed),{status:409});
 for(const url of ['file:///private/file','javascript:alert(1)','https://user:password@example.com']){const bad=doc();bad.activities[0].sourceUrl=url;assert.throws(()=>preview(s,bad),{status:400});}
 const bad=doc();bad.activities[0].end='2026-09-28T00:00:00+08:00';assert.throws(()=>preview(s,bad),{status:400});assert.equal(JSON.stringify(s.list('dailyActivities')),before);
 const fresh=doc({sourceId:'new-source'}),expired=preview(s,fresh),record=s.require('activityPreviews',expired.previewId);s.put('activityPreviews',{...record,expiresAt:'2000-01-01T00:00:00.000Z'});assert.throws(()=>commitActivityImport(s,expired.previewId),{status:409});assert.equal(s.list('sources').length,1);
});
test('an import storage failure rolls back both evidence and records',t=>{
 const s=fixture(t),p=preview(s),put=s.put.bind(s);s.put=(collection,record)=>{if(collection==='dailyActivities')throw Error('fixture storage failure');return put(collection,record);};assert.throws(()=>commitActivityImport(s,p.previewId),/fixture storage/);s.put=put;assert.equal(s.list('sources').length,0);assert.equal(s.list('dailyActivities').length,0);assert.equal(s.list('activityImports').length,0);
});
test('HTTP activity stays space-local, protects sources, never triggers automations and does not promote greetings into milestones',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'hither-daily-http-'));const app=createApp({dataDir:dir,seed:false,scheduler:false,computerInfo:{codexAvailable:false},runCodex:()=>{throw Error('No model calls allowed');}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const api=async(route,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};};
 await api('automations',{title:'Do not trigger',prompt:'Should never run',trigger:'source_import',enabled:true,mode:'live',agentIds:[]});
 const p=(await api('imports/activity/preview',{filename:'fixture.json',content:JSON.stringify(doc())})).data;assert.equal((await api('bootstrap')).data.dailyActivities.length,0);const imported=(await api('imports/activity/commit',{previewId:p.previewId})).data;assert.equal(app.store.list('tasks').length,0);assert.equal((await api(`sources/${imported.sourceId}`,{},'DELETE')).status,409);
 const task=(await api('tasks',{prompt:'你好',mode:'demo'})).data;await api(`tasks/${task.id}/run`,{});await app.runner.active.get(task.id)?.promise;const activities=(await api('daily-activity')).data;assert.equal(activities.length,2);const row=activities.find(item=>item.taskId===task.id);assert.equal(row.kind,'task');assert.equal(row.status,'completed');assert.equal(row.demo,true);assert.equal(app.store.require('tasks',task.id).artifactIds.length,0);assert.equal(app.store.list('events').length,0);
 await api('spaces/demo-engineer-v4',{});assert.equal((await api(`spaces/demo-engineer-v4/imports/activity/commit`,{previewId:p.previewId})).status,404);assert.ok(!(await api('spaces/demo-engineer-v4/daily-activity')).data.some(item=>item.id===activities[0].id));
 const exported=(await api('export')).data;assert.ok(exported.dailyActivities.some(item=>item.kind==='import'));assert.equal(exported.sources.find(source=>source.id===imported.sourceId).text,JSON.stringify(doc()));assert.equal((await api('activity-capture/samples',{samples:[]})).status,404,'no native capture endpoint is registered');
});
