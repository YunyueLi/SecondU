import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,unlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {createEntity,createTask} from '../server/domain.mjs';
import {saveAttachment} from '../server/attachments.mjs';
import authored from '../server/fixtures/demo-zh-content-v1.json' with {type:'json'};

const fixtureText=authored.life.sources.find(source=>source.id==='demo-life-v3-biography').text;
const photoGoal=authored.expansion.goals.find(goal=>goal.id==='demo-v2-goal-photos');
const photoSource=authored.stories.sources.find(source=>source.id==='demo-story-source-photos');
const candidates=capture=>[
  {kind:'fact',value:{statement:'万叶，杭州人，现居北京海淀。',kind:'identity'},evidence:[{sourceId:capture.sourceId,excerpt:'万叶，杭州人，现居北京海淀。'}]},
  {kind:'event',value:{date:'2020-07',title:'毕业后到北京工作',description:'2020 年 7 月入职字节跳动，做飞书前端。',category:'工作',scope:'milestone'},evidence:[{sourceId:capture.sourceId,excerpt:'2020 年 7 月入职字节跳动，做飞书前端。'}]},
  {kind:'person',value:{name:'王磊',role:'隔壁寝室的同学',description:'王磊住隔壁寝室。'},evidence:[{sourceId:capture.sourceId,excerpt:'王磊住隔壁寝室，李娜是社团里认识的朋友。'}]},
];
const output=(capture,items=candidates(capture))=>JSON.stringify({schema:'secondu.twin-candidates.v1',summary:'材料记录了万叶的求学、工作与生活经历。',candidates:items});
const proactiveOutput=(evaluation,patch={})=>{const excerpt=evaluation.input.currentSource.text.split('\n').filter(line=>line.trim()).at(-1);return JSON.stringify({schema:'secondu.proactive.v1',decision:'message',reason:'新资料给出了当前事项中可以核对的下一步。',prepared:{kind:'analysis',text:`根据新增材料，可以先核对这一点：${excerpt}`},question:'要先从这一点继续吗？',evidence:[{sourceId:evaluation.sourceId,changeId:evaluation.changeId,excerpt}],...patch});};
async function fixture(t,{model,configured=true,executionPolicy}={}){
  const root=mkdtempSync(path.join(os.tmpdir(),'secondu-twin-building-')),directory=path.join(root,'data'),calls=[];
  let app;
  const open=async()=>{
    app=createApp({dataDir:directory,seed:false,scheduler:false,executionPolicy,computerInfo:{codexAvailable:false},runCodex:async options=>{calls.push(options);const capture=app.store.list('twinCaptures').find(value=>value.status==='running'),evaluation=app.store.list('twinProactiveEvaluations').find(value=>value.status==='running');return model?model({options,capture,evaluation,app}):{text:evaluation?proactiveOutput(evaluation):capture?output(capture):'根据已给材料整理出的下一步，等待用户审阅。'};}});
    if(configured)app.store.setKey(app.store.connection(),'synthetic-fixture-key');
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  };
  await open();t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  const api=async(route,body,method=body===undefined?'GET':'POST',headers={})=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,value:await response.json()};};
  return {root,calls,get app(){return app;},api,reopen:async()=>{await app.close();await open();},create:async(body={})=>(await api('twin-building/captures',{text:fixtureText,purpose:'personal',idempotencyKey:'fixture-capture',...body})).value,ready:async capture=>{assert.equal((await api(`twin-building/captures/${capture.id}/process`,{})).status,200);await app.twinBuilding.settled();return (await api(`twin-building/captures/${capture.id}`)).value;}};
}
const decisions=(capture,action='accept')=>({baseRevision:capture.revision,decisions:capture.candidates.map(candidate=>({candidateId:candidate.id,action}))});
async function setProactive(f,enabled=true){const previous=(await f.api('settings/proactive')).value;const result=await f.api('settings/proactive',{enabled,baseRevision:previous.revision},'PUT');assert.equal(result.status,200);return result.value;}
function addPhotoGoal(f){const goal=createEntity(f.app.store,'goals',{title:photoGoal.title,description:photoGoal.description,status:'active',sourceIds:[]});f.app.store.put('goals',goal);return goal;}
const publicChats=f=>f.app.store.list('tasks').filter(task=>!task.archived);
const addPhotoSource=async(f,text=photoSource.text)=>(await f.api('sources',{title:photoSource.title,text})).value;

test('capture preserves originals and idempotency across restart without generating understanding on save',async t=>{
  const f=await fixture(t),capture=await f.create();
  assert.equal(capture.text,fixtureText);assert.equal(capture.status,'queued');assert.equal(capture.events[0].type,'received');assert.equal(f.calls.length,0);assert.equal(f.app.store.list('sources').length,1);
  assert.equal((await f.create()).id,capture.id);assert.equal(f.app.store.list('twinCaptures').length,1);
  const conflict=await f.api('twin-building/captures',{text:'Different text.',purpose:'personal',idempotencyKey:'fixture-capture'});assert.equal(conflict.status,409);
  await f.reopen();assert.equal((await f.api(`twin-building/captures/${capture.id}`)).value.text,fixtureText);assert.equal((await f.api('bootstrap')).value.twinBuilding.captures[0].id,capture.id);assert.equal(f.calls.length,0);
});

test('existing sources can be explored idempotently without changing the original',async t=>{
  const f=await fixture(t),source=(await f.api('sources',{title:'Synthetic existing material',text:fixtureText})).value;f.app.twinBuilding.rememberSource(source);
  assert.equal((await f.api('twin-building')).value.suggestions.length,0);
  const first=await f.api(`twin-building/sources/${source.id}/explore`,{idempotencyKey:'explore-fixture'});assert.equal(first.status,200);await f.app.twinBuilding.settled();
  const again=await f.api(`twin-building/sources/${source.id}/explore`,{idempotencyKey:'explore-fixture'});assert.equal(again.value.id,first.value.id);assert.equal(again.value.upstreamSourceId,source.id);assert.equal(again.value.status,'review');assert.equal(f.calls.length,1);assert.deepEqual(f.app.store.require('sources',source.id),source);
  assert.equal(again.value.sourceId,source.id);assert.equal((await f.api(`twin-building/captures/${again.value.id}/review`,decisions(again.value))).status,200);assert.equal(f.app.store.list('sources').length,1);assert.deepEqual(f.app.store.require('sources',source.id),source);assert.deepEqual(f.app.store.list('facts')[0].sourceIds,[source.id]);
  assert.equal((await f.api(`sources/${source.id}`,undefined,'DELETE')).status,409);
});

test('legacy exploration review keeps the original identity and metadata without migration or duplicate sources',async t=>{
  const f=await fixture(t),source=(await f.api('sources',{title:'万叶的经历原文',kind:'document',text:fixtureText})).value;
  source.memoryImport={filename:'万叶经历.md',sha256:'fixture-original-digest'};f.app.store.put('sources',source);
  const response=await f.api(`twin-building/sources/${source.id}/explore`,{idempotencyKey:'legacy-explore'});await f.app.twinBuilding.settled();const capture=f.app.twinBuilding.get(response.value.id);
  capture.sourceId='source-legacy-capture-snapshot';for(const candidate of capture.candidates)for(const evidence of candidate.evidence)evidence.sourceId=capture.sourceId;f.app.store.put('twinCaptures',capture);
  const result=await f.api(`twin-building/captures/${capture.id}/review`,decisions(capture));assert.equal(result.status,200);assert.equal(f.app.store.list('sources').length,1);assert.deepEqual(f.app.store.require('sources',source.id),source);assert.deepEqual(f.app.store.list('facts')[0].sourceIds,[source.id]);assert.equal(f.app.twinBuilding.get(capture.id).sourceId,capture.sourceId);
});

test('long source exploration retains the entire original but labels and validates the actual bounded model input',async t=>{
  const f=await fixture(t),full=fixtureText+'A'.repeat(50000)+'SYNTHETIC_UNSENT_TAIL',source=(await f.api('sources',{title:'Long synthetic source',text:full})).value;
  const response=await f.api(`twin-building/sources/${source.id}/explore`,{idempotencyKey:'long-fixture'});await f.app.twinBuilding.settled();const capture=f.app.twinBuilding.get(response.value.id);
  assert.equal(capture.status,'review',capture.error);assert.equal(capture.text,full);assert.equal(capture.textTruncated,true);assert.match(capture.events.at(-1).label,/40000/);assert.doesNotMatch(f.calls[0].prompt,/SYNTHETIC_UNSENT_TAIL/);
});

test('existing TaskRunner produces review candidates and explicit review writes linked facts, people and events atomically',async t=>{
  const f=await fixture(t),capture=await f.ready(await f.create());
  assert.equal(capture.status,'review',capture.error);assert.equal(capture.candidates.length,3);assert.equal(f.calls.length,1);assert.equal(f.app.store.list('facts').length,0);assert.equal(f.app.store.list('people').length,0);assert.equal(f.app.store.list('sources').length,1);
  const task=f.app.store.require('tasks',capture.activeTaskId);assert.equal(task.mode,'live');assert.equal(task.digitalTwinEnabled,false);assert.deepEqual(task.connectorIds,[]);assert.equal(task.status,'completed');assert.deepEqual(task.artifactIds,[]);
  assert.match(f.calls[0].prompt,/secondu.twin-candidates.v1/);assert.equal(f.calls[0].approvalMode,'ask');
  assert.equal(f.calls[0].extractOnly,true);assert.equal(f.calls[0].allowSubagents,false);assert.equal(f.calls[0].threadId,undefined);
  assert.equal(task.twinExtraction.captureId,capture.id);assert.ok(task.events.some(event=>event.type==='extraction_mode'));
  const review=decisions(capture);review.decisions[0]={candidateId:capture.candidates[0].id,action:'correct',value:{kind:'identity',statement:'万叶现居北京海淀。'}};
  const done=await f.api(`twin-building/captures/${capture.id}/review`,review);assert.equal(done.status,200);assert.equal(done.value.status,'completed');assert.equal(done.value.events.at(-1).type,'corrected');
  const fact=f.app.store.list('facts')[0];assert.equal(fact.status,'confirmed');assert.equal(fact.version,1);assert.equal(fact.statement,'万叶现居北京海淀。');assert.equal(fact.history[0].reason,'用户审阅材料并修正');assert.ok(fact.sourceIds.includes(capture.sourceId));assert.equal(fact.sourceIds.length,2);assert.equal(f.app.store.require('sources',done.value.reviewHistory[0].feedbackSourceId).kind,'feedback');
  assert.equal(f.app.store.require('sources',capture.sourceId).text,fixtureText);assert.equal(f.app.store.list('people')[0].name,'王磊');assert.equal(f.app.store.list('events')[0].date,'2020-07');
  assert.equal((await f.api(`twin-building/captures/${capture.id}/review`,review)).status,409);assert.equal(f.app.store.list('facts').length,1);assert.equal((await f.api('twin-building')).value.suggestions.length,0);
  await f.reopen();assert.equal(f.app.store.list('facts')[0].statement,fact.statement);assert.equal((await f.api(`twin-building/captures/${capture.id}`)).value.reviewHistory.length,1);
});

test('extraction output mode is chosen before execution for Responses, DeepSeek Chat and Messages',async t=>{
  for(const api of ['responses','chat_completions','messages']){
    const f=await fixture(t),connection=f.app.store.connection(),updated={...connection,api,provider:api==='chat_completions'?'deepseek':connection.provider};f.app.store.put('modelConnections',updated);f.app.store.setKey(updated,'synthetic-protocol-key');
    const capture=await f.ready(await f.create());assert.equal(capture.status,'review',capture.error);assert.equal(f.calls.length,1);assert.equal(f.calls[0].extractOnly,true);assert.equal(f.calls[0].allowSubagents,false);
    const task=f.app.store.require('tasks',capture.activeTaskId),mode=JSON.parse(task.events.find(event=>event.type==='extraction_mode').detail);
    assert.equal(mode.mode,api==='responses'?'native_output_schema':'text_json_validation');assert.equal(mode.protocol,api);
    assert.deepEqual(JSON.parse(task.events.find(event=>event.type==='started').detail).permissions,{approvalPolicy:'never',approvalsReviewer:'user',access:'read-only'});
    if(api==='responses'){assert.equal(f.calls[0].outputSchema.properties.schema.enum[0],'secondu.twin-candidates.v1');assert.equal(f.calls[0].outputSchema.additionalProperties,false);}
    else assert.equal(Object.hasOwn(f.calls[0],'outputSchema'),false);
  }
});

test('session-only capture is never promoted into long-term sources or personal records',async t=>{
  const f=await fixture(t),capture=await f.ready(await f.create({purpose:'session',origin:'screen'}));
  const done=await f.api(`twin-building/captures/${capture.id}/review`,decisions(capture));assert.equal(done.status,200);assert.equal(done.value.status,'completed');
  for(const collection of ['sources','facts','people','events'])assert.equal(f.app.store.list(collection).length,0,collection);
  assert.match(done.value.events.at(-1).label,/未加入长期/);
});

test('empty grounded extraction can be reviewed without inventing a fact or a completed-personality score',async t=>{
  const f=await fixture(t,{model:({capture})=>({text:output(capture,[])})}),capture=await f.ready(await f.create());assert.equal(capture.status,'review');assert.deepEqual(capture.candidates,[]);
  assert.equal((await f.api(`twin-building/captures/${capture.id}/review`,decisions(capture))).status,200);assert.equal(f.app.store.list('facts').length,0);assert.equal(f.app.store.list('sources').length,1);
});

test('fabricated quotes, out-of-scope sources and malformed model JSON fail without writing records',async t=>{
  for(const variant of ['quote','source','format']){
    const f=await fixture(t,{model:({capture})=>{const items=candidates(capture);if(variant==='quote')items[0].evidence[0].excerpt='模型臆造的引文';if(variant==='source')items[0].evidence[0].sourceId='other-source';return {text:variant==='format'?'```json\n{}\n```':output(capture,items)};}});
    const capture=await f.ready(await f.create());assert.equal(capture.status,'failed');assert.equal(capture.errorCode,'invalid_candidate_result');assert.equal(capture.candidates.length,0);assert.equal(f.app.store.list('facts').length,0);assert.equal(f.app.store.list('sources').length,1);
  }
});

test('missing configuration and interrupted processing are truthful and retry reuses the capture',async t=>{
  const f=await fixture(t,{configured:false}),created=await f.create(),failed=await f.ready(created);
  assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'configuration_required');assert.equal(f.calls.length,0);
  f.app.store.setKey(f.app.store.connection(),'synthetic-new-key');assert.equal((await f.api(`twin-building/captures/${failed.id}/retry`,{})).status,200);await f.app.twinBuilding.settled();
  const ready=f.app.twinBuilding.get(failed.id);assert.equal(ready.status,'review');assert.equal(ready.taskIds.length,2);assert.equal(f.app.store.list('twinCaptures').length,1);assert.equal(f.calls.length,1);
  const orphan=await f.create({idempotencyKey:'orphan'}),task=createTask(f.app.store,{prompt:'Synthetic interrupted fixture',mode:'live'});task.status='running';f.app.store.put('tasks',task);f.app.store.put('twinCaptures',{...orphan,status:'running',activeTaskId:task.id,taskIds:[task.id]});
  await f.reopen();const recovered=f.app.twinBuilding.get(orphan.id);assert.equal(recovered.status,'failed');assert.equal(recovered.errorCode,'capture_interrupted');assert.equal(f.calls.length,1);assert.equal(f.app.store.require('tasks',task.id).status,'interrupted');
});

test('stale review and a bad target version cannot partially write personal records',async t=>{
  const f=await fixture(t),capture=await f.ready(await f.create()),existing=createEntity(f.app.store,'facts',{statement:'Synthetic preexisting record',status:'confirmed',sourceIds:[]});f.app.store.put('facts',existing);
  assert.equal((await f.api(`twin-building/captures/${capture.id}/review`,{...decisions(capture),baseRevision:0})).status,409);
  const review=decisions(capture);review.decisions[0]={...review.decisions[0],targetId:existing.id,baseVersion:0};
  assert.equal((await f.api(`twin-building/captures/${capture.id}/review`,review)).status,409);assert.equal(f.app.store.list('facts').length,1);assert.equal(f.app.store.list('people').length,0);assert.equal(f.app.store.list('sources').length,1);assert.equal(f.app.twinBuilding.get(capture.id).status,'review');
  review.decisions[0].baseVersion=existing.version;assert.equal((await f.api(`twin-building/captures/${capture.id}/review`,review)).status,200);assert.equal(f.app.store.require('facts',existing.id).version,2);assert.equal(f.app.store.require('facts',existing.id).history.length,2);
});

test('real image attachment blocks are sent and their provenance is retained through review',async t=>{
  const f=await fixture(t,{model:({capture})=>({text:output(capture,[{kind:'fact',value:{statement:'用户提供了一张红色像素示例图。',kind:'decision'},evidence:[{sourceId:capture.sourceId,attachmentId:capture.attachmentIds[0]}]}])})});
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',attachment=saveAttachment(f.app.store,{name:'synthetic.png',mime:'image/png',data:png}),capture=await f.ready(await f.create({text:'',attachmentIds:[attachment.id]}));
  assert.equal(capture.status,'review',capture.error);assert.equal(f.calls[0].images.length,1);assert.equal(f.calls[0].images[0].url,`data:image/png;base64,${png}`);
  assert.equal((await f.api(`twin-building/captures/${capture.id}/review`,decisions(capture))).status,200);assert.deepEqual(f.app.store.require('sources',capture.sourceId).attachmentIds,[attachment.id]);
});

test('a missing original attachment fails visibly before invoking the model',async t=>{
  const f=await fixture(t),attachment=saveAttachment(f.app.store,{name:'synthetic.txt',mime:'text/plain',data:Buffer.from('Synthetic original text.').toString('base64')}),capture=await f.create({text:'',attachmentIds:[attachment.id]});
  unlinkSync(path.join(f.app.store.directory,'attachments',`${attachment.id}.bin`));const failed=await f.ready(capture);assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'attachment_unavailable');assert.equal(f.calls.length,0);assert.equal(f.app.store.list('tasks').length,0);
});

test('an unsupported original can remain in the source library without pretending it has been analyzed',async t=>{
 const f=await fixture(t),attachment=saveAttachment(f.app.store,{name:'原始资料.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7\nfixture-only').toString('base64')}),capture=await f.create({text:'',attachmentIds:[attachment.id]});
 assert.deepEqual(f.app.store.require('sources',capture.sourceId).attachmentIds,[attachment.id]);assert.equal(f.app.store.require('sources',capture.sourceId).text,'');
 const failed=await f.ready(capture);assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'unsupported_attachment');assert.equal(f.calls.length,0);assert.equal(f.app.store.list('tasks').length,0);assert.equal(f.app.store.list('sources').length,1);assert.equal(f.app.store.list('facts').length,0);
});

test('cancelling uses the existing runner and never turns an interrupted model response into candidates',async t=>{
  let entered;const started=new Promise(resolve=>entered=resolve),f=await fixture(t,{model:({options})=>new Promise((resolve,reject)=>{entered();options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Stopped fixture'),{name:'AbortError'})),{once:true});})});
  const capture=await f.create();await f.api(`twin-building/captures/${capture.id}/process`,{});await started;const running=f.app.twinBuilding.get(capture.id);assert.equal(running.status,'running');
  assert.equal((await f.api(`tasks/${running.activeTaskId}/cancel`,{})).status,200);await f.app.twinBuilding.settled();const failed=f.app.twinBuilding.get(capture.id);assert.equal(failed.status,'failed');assert.deepEqual(failed.candidates,[]);assert.equal(f.app.store.list('facts').length,0);
});

test('a real change runs one bounded read-only evaluation, delivers prepared work in chat, and continues through the same runner',async t=>{
  const f=await fixture(t),goal=addPhotoGoal(f);f.app.store.put('modelConnections',{...f.app.store.connection(),api:'responses'});await setProactive(f);
  const source=await addPhotoSource(f);await f.app.twinBuilding.settled();const snapshot=(await f.api('twin-building')).value;
  assert.equal(snapshot.changes.length,1);const suggestion=snapshot.suggestions[0];assert.equal(suggestion.kind,'help_goal');assert.equal(suggestion.goalId,goal.id);assert.equal(suggestion.relevanceMethod,'model_evaluation');assert.equal(f.calls.length,1);
  const evaluation=snapshot.evaluations[0],evaluationTask=f.app.store.require('tasks',evaluation.evaluationTaskId);assert.equal(evaluation.status,'delivered');assert.equal(evaluationTask.archived,true);assert.equal(evaluationTask.proactiveEvaluation.evaluationId,evaluation.id);
  assert.equal(f.calls[0].extractOnly,true);assert.equal(f.calls[0].allowSubagents,false);assert.equal(f.calls[0].threadId,undefined);assert.deepEqual(f.calls[0].dynamicTools,[]);assert.equal(f.calls[0].outputSchema.properties.schema.enum[0],'secondu.proactive.v1');
  assert.deepEqual(JSON.parse(evaluationTask.events.find(event=>event.type==='started').detail).permissions,{approvalPolicy:'never',approvalsReviewer:'user',access:'read-only'});
  assert.equal(publicChats(f).length,1);const delivered=f.app.store.require('tasks',suggestion.followUpTaskId);assert.equal(delivered.messages[0].origin.generator,'model');assert.equal(delivered.messages[0].origin.evaluationTaskId,evaluationTask.id);assert.equal(delivered.messages.length,1);assert.equal(delivered.messages[0].role,'assistant');
  assert.equal((await f.api(`tasks/${delivered.id}/run`,{})).status,409);assert.equal(f.calls.length,1);
  const accepted=await f.api(`twin-building/suggestions/${suggestion.id}/respond`,{baseRevision:suggestion.revision,action:'correct',text:'下单前先看店里会不会自动裁边。'});assert.equal(accepted.status,200);assert.equal(accepted.value.suggestion.status,'corrected');const task=accepted.value.task;assert.ok(task.id);await f.app.runner.active.get(task.id)?.promise;
  assert.equal(f.app.store.require('tasks',task.id).status,'completed');assert.equal(f.app.store.require('goals',goal.id).status,'active');assert.deepEqual(f.app.store.require('goals',goal.id).helpTaskIds,[task.id]);assert.equal(f.app.store.list('facts').length,0);assert.equal(f.app.store.list('sources').length,1);assert.equal(f.calls.length,2);assert.match(f.calls[1].prompt,/自动裁边/);assert.match(f.calls[1].prompt,new RegExp(source.id));assert.equal(f.calls[1].extractOnly,undefined);
  assert.equal((await f.api(`twin-building/suggestions/${suggestion.id}/respond`,{baseRevision:suggestion.revision,action:'accept'})).status,409);assert.equal((await f.api('twin-building')).value.suggestions.length,1);
  assert.equal(task.id,suggestion.followUpTaskId);assert.equal(publicChats(f).length,1);
});

test('a source without a current related goal stays quiet; a later change can notify and dismissal does not infer a preference',async t=>{
  const f=await fixture(t);await setProactive(f);const source=(await f.api('sources',{title:photoSource.title,text:photoSource.text.split('\n').slice(0,4).join('\n')})).value;
  assert.equal((await f.api('twin-building')).value.suggestions.length,0);assert.equal(f.app.store.list('tasks').length,0);
  addPhotoGoal(f);f.app.store.put('sources',{...source,text:photoSource.text});await f.api('twin-building');await f.app.twinBuilding.settled();const next=(await f.api('twin-building')).value;assert.equal(next.changes.length,2);assert.equal(next.changes[1].kind,'updated');const suggestion=next.suggestions[0];assert.equal(suggestion.status,'pending');
  const dismissed=await f.api(`twin-building/suggestions/${suggestion.id}/respond`,{baseRevision:suggestion.revision,action:'dismiss'});assert.equal(dismissed.status,200);assert.equal(dismissed.value.suggestion.status,'dismissed');assert.equal(f.calls.length,1);assert.equal(f.app.store.list('facts').length,0);assert.equal(publicChats(f).length,1);
  await f.reopen();assert.equal((await f.api('twin-building')).value.changes.length,2);
  assert.equal((await f.api('twin-building')).value.suggestions.length,1);assert.equal(f.app.store.list('facts').length,0);
});

test('a reviewed capture can suggest concrete help for an active goal without asking to organize the same source again',async t=>{
  const f=await fixture(t);addPhotoGoal(f);await setProactive(f);
  const capture=await f.ready(await f.create());await f.api(`twin-building/captures/${capture.id}/review`,decisions(capture));await f.api('twin-building');await f.app.twinBuilding.settled();const suggestions=(await f.api('twin-building')).value.suggestions;
  assert.equal(suggestions.length,1);assert.equal(suggestions[0].kind,'help_goal');assert.equal(suggestions[0].sourceId,capture.sourceId);assert.equal(f.calls.length,2);
});

test('proactive messages default off, persist, and establish baselines without replaying old or disabled-period material',async t=>{
  const f=await fixture(t);addPhotoGoal(f);const initial=(await f.api('settings/proactive')).value;assert.equal(initial.enabled,false);assert.equal(initial.revision,1);
  const source=await addPhotoSource(f,photoSource.text.split('\n').slice(0,4).join('\n'));assert.equal(f.calls.length,0);assert.equal(publicChats(f).length,0);
  const enabled=await setProactive(f);assert.equal(enabled.revision,2);await f.reopen();assert.deepEqual((await f.api('settings/proactive')).value,enabled);await f.api('twin-building');assert.equal(f.calls.length,0);
  await setProactive(f,false);f.app.store.put('sources',{...source,text:photoSource.text});await setProactive(f,true);f.app.runner.tick();await f.app.twinBuilding.settled();assert.equal(f.calls.length,0);assert.equal(f.app.store.list('twinProactiveEvaluations').length,0);
  const before=(await f.api('settings/proactive')).value;
  const races=await Promise.all([f.api('settings/proactive',{enabled:false,baseRevision:before.revision},'PUT'),f.api('settings/proactive',{enabled:false,baseRevision:before.revision},'PUT')]);assert.deepEqual(races.map(result=>result.status).sort(),[200,409]);
  assert.equal((await f.api('settings/proactive',{enabled:'true',baseRevision:before.revision},'PUT')).status,400);
});

test('missing model leaves a durable pending evaluation and creates no task until a configured connection exists',async t=>{
  const f=await fixture(t,{configured:false});addPhotoGoal(f);await setProactive(f);await addPhotoSource(f);
  assert.equal(f.calls.length,0);assert.equal(f.app.store.list('tasks').length,0);assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'awaiting_configuration');
  await f.reopen();assert.equal(f.calls.length,0);f.app.store.setKey(f.app.store.connection(),'synthetic-fixture-key');f.app.runner.tick();await f.app.twinBuilding.settled();assert.equal(f.calls.length,1);assert.equal(publicChats(f).length,1);
  f.app.runner.tick();await f.api('twin-building');assert.equal(f.calls.length,1);
});

test('quiet and defer decisions remain private and never infer a personal preference or replay a model turn',async t=>{
  for(const decision of ['quiet','defer']){
    const f=await fixture(t,{model:({evaluation})=>({text:proactiveOutput(evaluation,{decision,prepared:{kind:'analysis',text:''},question:'',evidence:[]})})});addPhotoGoal(f);await setProactive(f);await addPhotoSource(f);await f.app.twinBuilding.settled();
    assert.equal(publicChats(f).length,0);assert.equal(f.app.store.list('twinSuggestions').length,0);assert.equal(f.app.store.list('facts').length,0);assert.equal(f.calls.length,1);
    await f.reopen();f.app.runner.tick();await f.api('twin-building');assert.equal(f.calls.length,1);assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,decision==='quiet'?'quiet':'deferred');
  }
});

test('unverifiable evidence, old-only evidence and empty prepared work never become proactive messages',async t=>{
  for(const variant of ['source','quote','old','empty','external']){
    const f=await fixture(t,{model:({evaluation})=>{const result=JSON.parse(proactiveOutput(evaluation));if(variant==='source')result.evidence[0].changeId='unrelated-change';if(variant==='quote')result.evidence[0].excerpt='没有出现在原文里的内容';if(variant==='old')result.evidence[0].excerpt=photoSource.text.split('\n')[0];if(variant==='empty')result.prepared.text='';if(variant==='external')result.prepared.text='我已经下单购买了这一套青岛相册。';return {text:JSON.stringify(result)};}});
    addPhotoGoal(f);const source=await addPhotoSource(f,photoSource.text.split('\n').slice(0,4).join('\n'));await setProactive(f);f.app.store.put('sources',{...source,text:photoSource.text});f.app.runner.tick();await f.app.twinBuilding.settled();
    const evaluation=f.app.store.list('twinProactiveEvaluations')[0];assert.equal(evaluation.status,'failed',variant);assert.equal(publicChats(f).length,0);assert.equal(f.app.store.list('facts').length,0);f.app.runner.tick();assert.equal(f.calls.length,1);
  }
});

test('concurrent source checks and restart cannot duplicate evaluation or delivery, and a normal reply continues the same chat',async t=>{
  const f=await fixture(t);addPhotoGoal(f);await setProactive(f);await addPhotoSource(f);
  await Promise.all(Array.from({length:12},()=>f.api('twin-building')));f.app.runner.tick();await f.app.twinBuilding.settled();assert.equal(f.calls.length,1);assert.equal(publicChats(f).length,1);assert.equal(f.app.store.list('twinProactiveEvaluations').length,1);
  const delivered=publicChats(f)[0],beforeFactCount=f.app.store.list('facts').length;await f.reopen();f.app.runner.tick();await f.api('twin-building');assert.equal(publicChats(f).length,1);assert.equal(f.calls.length,1);
  assert.equal((await f.api(`tasks/${delivered.id}/message`,{content:'下单前先看店里会不会自动裁边。'})).status,200);await f.app.runner.active.get(delivered.id)?.promise;const continued=f.app.store.require('tasks',delivered.id);
  assert.equal(continued.messages.length,3);assert.equal(continued.messages[1].role,'user');assert.equal(f.calls.length,2);assert.equal(f.app.store.list('facts').length,beforeFactCount);assert.equal(f.app.store.list('twinSuggestions')[0].status,'pending');
});

test('disabling during a model turn aborts it and prevents late delivery or automatic replay',async t=>{
  let enter;const entered=new Promise(resolve=>enter=resolve);
  const f=await fixture(t,{model:({options})=>new Promise((resolve,reject)=>{enter();options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Stopped proactive fixture'),{name:'AbortError'})),{once:true});})});addPhotoGoal(f);await setProactive(f);await addPhotoSource(f);await entered;
  await setProactive(f,false);await f.app.twinBuilding.settled();assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'cancelled');assert.equal(publicChats(f).length,0);assert.equal(f.calls.length,1);
  await setProactive(f,true);f.app.runner.tick();await f.app.twinBuilding.settled();assert.equal(publicChats(f).length,0);assert.equal(f.calls.length,1);
});

test('a changed source or target invalidates in-flight work before it can enter a conversation',async t=>{
  for(const variant of ['source','goal']){
    let release,enter;const entered=new Promise(resolve=>enter=resolve);
    const f=await fixture(t,{model:({evaluation})=>new Promise(resolve=>{release=()=>resolve({text:proactiveOutput(evaluation)});enter();})}),goal=addPhotoGoal(f);await setProactive(f);const source=await addPhotoSource(f);await entered;
    if(variant==='source')f.app.store.put('sources',{...source,text:photoSource.text.split('\n').slice(0,4).join('\n')});else f.app.store.put('goals',{...goal,status:'completed'});
    release();await f.app.twinBuilding.settled();assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'stale');assert.equal(publicChats(f).length,0);
  }
});

test('a task being handled defers evaluation; completion lets the existing tick evaluate it once',async t=>{
  for(const status of ['queued','running'])await t.test(status,async t=>{
    let releaseTarget,enterTarget;const entered=new Promise(resolve=>enterTarget=resolve);
    const reply='已经根据此前的材料整理了照片方案，新增资料还需另行核对。';
    const f=await fixture(t,{model:({evaluation})=>evaluation?{text:proactiveOutput(evaluation)}:new Promise(resolve=>{releaseTarget=()=>resolve({text:reply});enterTarget();})});
    const target=createTask(f.app.store,{title:photoGoal.title,prompt:photoGoal.description,mode:'live',agentIds:[],contextFactIds:[]});await setProactive(f);
    if(status==='running'){f.app.runner.start(target.id);await entered;}
    await addPhotoSource(f);assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'deferred');
    if(status==='queued'){f.app.runner.start(target.id);await entered;}
    const completion=f.app.runner.active.get(target.id).promise;releaseTarget();await completion;
    assert.equal(f.app.store.require('tasks',target.id).status,'completed');assert.equal(f.app.store.require('tasks',target.id).messages.at(-1).content,reply);
    f.app.runner.tick();await f.app.twinBuilding.settled();
    const evaluation=f.app.store.list('twinProactiveEvaluations')[0];assert.equal(evaluation.status,'delivered');assert.equal(evaluation.input.target.latestReply,reply);
    assert.equal(f.calls.length,2);const contact=publicChats(f).find(task=>task.proactive);assert.equal(contact.proactive.relatedTaskId,target.id);assert.equal(f.app.store.list('twinSuggestions')[0].kind,'help_task');
    f.app.runner.tick();await f.app.twinBuilding.settled();assert.equal(f.calls.length,2);
  });
});

test('a changed task reply after evaluation starts still invalidates its result',async t=>{
  let release,enter;const entered=new Promise(resolve=>enter=resolve);
  const f=await fixture(t,{model:({evaluation})=>new Promise(resolve=>{release=()=>resolve({text:proactiveOutput(evaluation)});enter();})});
  const target=createTask(f.app.store,{title:photoGoal.title,prompt:photoGoal.description,mode:'live',agentIds:[],contextFactIds:[]});
  f.app.store.put('tasks',{...target,status:'completed'});await setProactive(f);await addPhotoSource(f);await entered;
  f.app.store.put('tasks',{...target,status:'completed',messages:[...target.messages,{id:'synthetic-new-reply',role:'assistant',content:'关联任务已经给出了新的答复。',createdAt:new Date().toISOString()}]});
  release();await f.app.twinBuilding.settled();assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'stale');assert.equal(publicChats(f).filter(task=>task.proactive).length,0);
});

test('cancelling a task while its evaluation waits prevents later evaluation or delivery',async t=>{
  const f=await fixture(t),target=createTask(f.app.store,{title:photoGoal.title,prompt:photoGoal.description,mode:'live',agentIds:[],contextFactIds:[]});
  await setProactive(f);await addPhotoSource(f);assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'deferred');
  assert.equal((await f.api(`tasks/${target.id}/cancel`,{})).status,200);assert.equal(f.app.store.require('tasks',target.id).status,'cancelled');
  f.app.runner.tick();await f.app.twinBuilding.settled();assert.equal(f.app.store.list('twinProactiveEvaluations')[0].status,'stale');
  assert.equal(f.calls.length,0);assert.equal(publicChats(f).filter(task=>task.proactive).length,0);
});

test('delivery is atomic and duplicate prepared content is not sent again',async t=>{
  const f=await fixture(t);addPhotoGoal(f);await setProactive(f);await addPhotoSource(f);await f.app.twinBuilding.settled();assert.equal(publicChats(f).length,1);
  await addPhotoSource(f);await f.app.twinBuilding.settled();assert.equal(f.calls.length,2);assert.equal(publicChats(f).length,1);assert.equal(f.app.store.list('twinProactiveEvaluations')[1].status,'quiet');assert.ok(f.calls[1].prompt.includes('previousContact'));
  const failing=await fixture(t);addPhotoGoal(failing);await setProactive(failing);const put=failing.app.store.put.bind(failing.app.store);failing.app.store.put=(collection,value)=>{if(collection==='tasks'&&value.proactive)throw new Error('Fixture delivery failure');return put(collection,value);};
  await addPhotoSource(failing);await failing.app.twinBuilding.settled();failing.app.store.put=put;assert.equal(publicChats(failing).length,0);assert.equal(failing.app.store.list('twinSuggestions').length,0);assert.equal(failing.app.store.list('twinProactiveEvaluations')[0].status,'failed');
});

test('queued changes receive the latest contact summary at execution time',async t=>{
  let release,enter;const entered=new Promise(resolve=>enter=resolve);let count=0;
  const f=await fixture(t,{model:({evaluation})=>{count++;if(count===1)return new Promise(resolve=>{release=()=>resolve({text:proactiveOutput(evaluation)});enter();});assert.ok(evaluation.input.previousContact?.prepared.text);return {text:proactiveOutput(evaluation,{decision:'quiet',prepared:{kind:'analysis',text:''},question:'',evidence:[]})};}});addPhotoGoal(f);await setProactive(f);await addPhotoSource(f);await entered;
  await addPhotoSource(f);assert.equal(f.app.store.list('twinProactiveEvaluations')[1].input.previousContact,null);release();await f.app.twinBuilding.settled();f.app.runner.tick();await f.app.twinBuilding.settled();
  assert.equal(f.calls.length,2);assert.equal(publicChats(f).length,1);assert.ok(f.app.store.list('twinProactiveEvaluations')[1].input.previousContact?.prepared.text);
});

test('showcase and cross-origin guards reject capture writes',async t=>{
  const demo=await fixture(t,{executionPolicy:'showcase'});assert.equal((await demo.api('twin-building/captures',{text:'Synthetic',idempotencyKey:'x'})).status,403);assert.equal(demo.calls.length,0);
  assert.equal((await demo.api('settings/proactive',{enabled:true,baseRevision:1},'PUT')).status,403);assert.equal((await demo.api('settings/proactive')).value.enabled,false);
  const personal=await fixture(t);assert.equal((await personal.api('twin-building/captures',{text:'Synthetic',idempotencyKey:'x'},'POST',{Origin:'https://invalid.example'})).status,403);
});

test('automation saves context, connector and project selection and passes them into the existing runner',async t=>{
  const f=await fixture(t),workspace=path.join(f.root,'synthetic-project');mkdirSync(workspace);
  const project=(await f.api('projects',{name:'Synthetic project',kind:'local',path:workspace})).value,fact=createEntity(f.app.store,'facts',{statement:'Synthetic preference',status:'confirmed',sourceIds:[]});f.app.store.put('facts',fact);
  const body={title:'Synthetic contextual reminder',prompt:'Discuss this project briefly.',mode:'live',enabled:false,trigger:'source_import',agentIds:[],projectId:project.id,connectionId:f.app.store.defaultConnectionId(),digitalTwinEnabled:true,contextRequest:{domain:'project',purpose:'planning',budgetChars:8000},contextFactIds:[fact.id],connectorIds:[],approvalMode:'ask'};
  const created=await f.api('automations',body);assert.equal(created.status,201);const task=(await f.api(`automations/${created.value.id}/run`,{})).value;await f.app.runner.active.get(task.id)?.promise;
  for(const key of ['projectId','connectionId','digitalTwinEnabled','contextRequest','contextFactIds','connectorIds','approvalMode'])assert.deepEqual(task[key],body[key],key);
  assert.equal(f.app.store.require('tasks',task.id).status,'completed');assert.equal(f.calls[0].workspace,project.path);
});
