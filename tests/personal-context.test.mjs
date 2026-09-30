import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {personalContextFor,contextSourceRecords,normalizeContextRequest} from '../server/personal-context.mjs';
import {evidenceFor,buildPrompt} from '../server/runner.mjs';

const task=(prompt,extra={})=>({prompt,messages:[{role:'user',content:prompt}],digitalTwinEnabled:true,contextFactIds:[],...extra});
function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-context-')),store=new Store(directory,{seed:false});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return store;}
const source=(store,id,text)=>store.put('sources',{id,title:id,kind:'document',text,demo:true});

test('context joins only relevant people, recorded relationships, events and goals with status and source provenance',t=>{
 const store=fixture(t);store.setMeta('profile',{name:'测试本人',demo:true,selfPersonId:'self',description:'测试档案'});
 source(store,'confirmed-source','林舟喜欢先确认时间。');source(store,'candidate-source','UNCONFIRMED_PORTRAIT_MUST_NOT_RECALL');source(store,'event-source','和林舟于六月完成地图项目。');source(store,'goal-source','地图项目本周进行一次复盘。');
 store.put('people',{id:'self',name:'测试本人',role:'本人',sourceIds:[]});
 store.put('people',{id:'friend',name:'林舟',role:'朋友',description:'UNCONFIRMED_DESCRIPTION_MUST_NOT_RECALL',sourceIds:['confirmed-source','candidate-source'],portrait:{version:3,entries:[{id:'confirmed',kind:'preference',statement:'林舟喜欢先确认时间。',status:'confirmed',sourceIds:['confirmed-source']},{id:'candidate',kind:'note',statement:'UNCONFIRMED_PORTRAIT_MUST_NOT_RECALL',status:'candidate',sourceIds:['candidate-source']},{id:'expired',kind:'note',statement:'EXPIRED_ENTRY',status:'confirmed',validTo:'2020',sourceIds:[]}]}});
 for(let n=0;n<2800;n++)store.put('people',{id:`unrelated-${n}`,name:`联系人甲${n}`,role:'联系人',sourceIds:[]});
 store.put('relationships',{id:'rel',from:'self',to:'friend',label:'朋友',description:'一同参与地图项目。',sourceIds:['event-source']});
 store.put('events',{id:'event',title:'地图项目完成',description:'和林舟共同完成',date:'2026-06',category:'项目',personIds:['friend'],sourceIds:['event-source']});
 store.put('goals',{id:'goal',title:'地图项目复盘',description:'向林舟同步进度',status:'active',dueDate:'2026-10-02',sourceIds:['goal-source']});
 const input=task('安排和林舟的地图项目复盘'),bundle=personalContextFor(store,input,{at:'2026-09-30T00:00:00.000Z'});
 assert.deepEqual(bundle.people.map(person=>person.id),['self','friend']);assert.equal(bundle.people[1].portraitVersion,3);assert.equal(bundle.relationships[0].recordStatus,'recorded');assert.equal(bundle.events[0].date,'2026-06');assert.equal(bundle.goals[0].id,'goal');assert.equal(bundle.people[1].entries.length,1);assert.equal(bundle.unconfirmed.length,0);
 const evidence=evidenceFor(store,contextSourceRecords(bundle),{budgetChars:bundle.budget.evidenceMaxChars,bounded:true}),prompt=buildPrompt(input,[],undefined,[],evidence,undefined,'zh-CN',bundle.profile,bundle);
 assert.doesNotMatch(prompt,/UNCONFIRMED_|EXPIRED_ENTRY|联系人甲/);assert.ok(evidence.sources.every(item=>item.sha256.length===64));
 const verify=personalContextFor(store,{...input,contextRequest:{purpose:'verification'}});assert.equal(verify.unconfirmed[0].status,'candidate');assert.equal(verify.unconfirmed[0].recordType,'portrait');
 assert.deepEqual(personalContextFor(store,{...input,digitalTwinEnabled:false}).facts,[]);assert.equal(personalContextFor(store,{...input,digitalTwinEnabled:false}).profile,undefined);
});

test('retrieval exceeds the former eight-fact cap while enforcing combined structured and source budgets',t=>{
 const store=fixture(t);source(store,'long-source','Padding '.repeat(10000)+' Relevant fact 29. '+'Ending '.repeat(10000));
 for(let n=0;n<40;n++)store.put('facts',{id:`fact-${n}`,kind:'constraint',statement:`Relevant fact ${n}.`,status:'confirmed',version:n+1,sourceIds:['long-source']});
 const bundle=personalContextFor(store,task('Relevant fact'),{request:{budgetChars:20000}}),evidence=evidenceFor(store,contextSourceRecords(bundle),{budgetChars:bundle.budget.evidenceMaxChars,bounded:true});
 assert.ok(bundle.facts.length>8);assert.ok(bundle.facts.every(fact=>fact.status==='confirmed'));assert.equal(bundle.budget.usedChars,JSON.stringify(bundle).length);assert.ok(JSON.stringify(bundle).length+JSON.stringify(evidence).length<=20000);assert.ok(bundle.budget.omitted.facts>0);
 const small=personalContextFor(store,task('Relevant fact'),{request:{budgetChars:4000}}),smallEvidence=evidenceFor(store,contextSourceRecords(small),{budgetChars:small.budget.evidenceMaxChars,bounded:true});assert.ok(JSON.stringify(small).length+JSON.stringify(smallEvidence).length<=4000);
 assert.throws(()=>normalizeContextRequest({domain:'all-private-data'}),error=>error.status===400);assert.throws(()=>normalizeContextRequest({budgetChars:3999}),error=>error.status===400);
});

test('project domain carries the current project but does not inject taste or unmentioned contact histories',t=>{
 const store=fixture(t);store.put('projects',{id:'project',name:'Atlas',kind:'local',description:'Mapping editor',archived:false});
 store.put('facts',{id:'work',kind:'preference',preferenceDomain:'work',statement:'Keep changes small.',status:'confirmed',version:2,sourceIds:[]});store.put('facts',{id:'taste',kind:'preference',preferenceDomain:'taste',statement:'喜欢清晨跑步。',status:'confirmed',version:1,sourceIds:[]});store.put('goals',{id:'atlas',title:'Atlas delivery',description:'Ship editor',status:'active',sourceIds:[]});
 const bundle=personalContextFor(store,task('Fix editor API',{projectId:'project'}));assert.equal(bundle.domain,'project');assert.equal(bundle.project.id,'project');assert.deepEqual(bundle.facts.map(fact=>fact.id),['work']);assert.equal(bundle.goals[0].id,'atlas');assert.deepEqual(bundle.people,[]);
});
