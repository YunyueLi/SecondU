import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runContextSuiteV2,sha} from '../benchmarks/context/suite-v2.mjs';
import {FORMAL_CASES} from '../benchmarks/context/v2-cases.mjs';
import {judgeReply,aggregateRows,pairedCases} from '../benchmarks/context/score-v2.mjs';
import {reviewV2} from '../scripts/review-context-benchmark-v2.mjs';
const formal=runContextSuiteV2(),pilot=runContextSuiteV2({pilot:true});
const inputFor=(row,mode)=>row.inputs.find(input=>input.mode===mode);
function reply(row,mode,overrides={}){const gold=mode==='no_context'?row.gold.noContext:row.gold,choose=gold.action==='choose';return {action:gold.action,selection:choose?gold.selections[0]:[],reason:'Synthetic test fixture explanation.',usedSourceIds:mode==='no_context'?[]:row.gold.requiredSourceSets[0],clarificationFields:choose?[]:gold.fields??gold.clarificationFields??[],clarification:choose?null:'Please confirm the missing or conflicting fields.',...overrides};}
const result=object=>({status:'completed',output:JSON.stringify(object)});

test('formal and pilot are separate, with six capabilities and real production evidence/revisions',()=>{
 assert.equal(formal.cases.length,24);assert.equal(formal.protocol.plannedCalls,144);assert.equal(pilot.cases.length,4);assert.equal(pilot.protocol.plannedCalls,12);
 assert.equal(formal.summary.passed,formal.summary.checks);assert.equal(pilot.summary.passed,pilot.summary.checks);
 assert.equal(new Set(formal.cases.map(row=>row.subject)).size,23);
 for(const capability of formal.capabilities)assert.equal(formal.cases.filter(row=>row.capabilityId===capability.id).length,4);
 assert.ok(pilot.cases.every(row=>!formal.cases.some(other=>other.id===row.id)));
 const corrected=formal.cases.find(row=>row.id==='l01'),bundle=JSON.parse(inputFor(corrected,'structured').context),changed=corrected.sourceEvents.find(row=>row.eventKey==='correction');
 assert.ok(bundle.personalContext.facts.some(fact=>fact.version===3&&fact.sourceIds.includes(changed.sourceId)));
 assert.ok(bundle.evidence.sources.some(source=>source.id===changed.sourceId));
 assert.equal(bundle.personalContext.facts.find(fact=>fact.sourceIds.includes(changed.sourceId)).updatedAt,'2026-06-01T09:00:00.000Z');
 const conflict=JSON.parse(inputFor(formal.cases.find(row=>row.id==='u02'),'structured').context);assert.equal(conflict.personalContext.facts.length,2);
 const past=formal.cases.find(row=>row.id==='l04');assert.deepEqual(past.futureEventsExcluded,['future']);assert.ok(past.inputs.every(input=>!input.context.includes('60 credits')));
});

test('all modes share instructions and task, stay within the same character cap, and never receive evaluator answers',()=>{
 for(const row of formal.cases){assert.equal(new Set(row.inputs.map(input=>input.system)).size,1);for(const input of row.inputs){assert.ok(input.user.endsWith(row.prompt));assert.ok(input.contextChars<=8000);assert.equal(input.inputSha256,sha(`${input.system}\n\n${input.user}`));assert.ok(!input.user.includes('requiredSourceSets'));assert.ok(!input.user.includes('hardValidSelections'));}const off=JSON.parse(inputFor(row,'no_context').context);assert.equal(off.disabled,true);assert.deepEqual(off.facts,[]);}
 const old=FORMAL_CASES[0].gold.selections;try{FORMAL_CASES[0].gold.selections=[['Z']];const changed=runContextSuiteV2();assert.deepEqual(changed.cases[0].inputs.map(input=>input.inputSha256),formal.cases[0].inputs.map(input=>input.inputSha256));}finally{FORMAL_CASES[0].gold.selections=old;}
});

test('production retrieval misses remain visible rather than being repaired with gold',()=>{
 for(const id of ['h03','h04']){const row=formal.cases.find(item=>item.id===id);assert.equal(inputFor(row,'raw_retrieval').retrieval.requiredEvidenceAvailable,true);assert.equal(inputFor(row,'structured').retrieval.requiredEvidenceAvailable,false);const judged=judgeReply(row,inputFor(row,'structured'),result(reply(row,'structured',{action:'clarify',selection:[],clarificationFields:row.fields,clarification:'Please confirm these missing fields.',usedSourceIds:[]})));assert.equal(judged.decisionCorrect,false);assert.equal(judged.appropriateClarificationOnRetrievalMiss,true);}
});

test('scoring separates semantic choice proxy, feasibility, citation coverage, no-context calibration and malformed replies',()=>{
 const row=formal.cases[0],structured=inputFor(row,'structured'),off=inputFor(row,'no_context');
 assert.equal(judgeReply(row,structured,result(reply(row,'structured'))).decisionCorrect,true);
 const ungrounded=judgeReply(row,structured,result(reply(row,'structured',{usedSourceIds:[]})));assert.equal(ungrounded.decisionCorrect,true);assert.equal(ungrounded.requiredEvidenceCovered,false);
 const wrong=judgeReply(row,structured,result(reply(row,'structured',{selection:['A']})));assert.equal(wrong.decisionCorrect,false);assert.equal(wrong.constraintsSatisfied,true);
 const noContext=judgeReply(row,off,result(reply(row,'no_context')));assert.equal(noContext.decisionCorrect,true);assert.equal(noContext.requiredEvidenceCovered,null);
 assert.equal(judgeReply(row,off,result(reply(row,'structured',{usedSourceIds:[]}))).decisionCorrect,false);
 assert.equal(judgeReply(row,structured,{status:'completed',output:'not JSON'}).schemaValid,false);
 assert.equal(judgeReply(row,structured,{status:'missing',output:null}).decisionCorrect,false);
 const timeout=judgeReply(row,structured,{status:'timeout',output:null});assert.equal(timeout.constraintsSatisfied,false);
 const timeoutTotals=aggregateRows([{caseId:row.id,mode:'structured',status:'timeout',judgement:timeout,retrieval:structured.retrieval,usage:null,latencyMs:180000,contextChars:structured.contextChars}],1).find(item=>item.mode==='structured');assert.equal(timeoutTotals.constraintDenominator,1);assert.equal(timeoutTotals.constraintsSatisfied,0);
 assert.deepEqual(judgeReply(row,structured,result(reply(row,'structured',{usedSourceIds:['invented']}))).invalidCitations,['invented']);
 const missing=formal.cases.find(item=>item.id==='u01'),missingInput=inputFor(missing,'structured');
 assert.equal(judgeReply(missing,missingInput,result(reply(missing,'structured',{clarificationFields:['retreat_budget','invented_field']}))).schemaValid,false);
 assert.equal(judgeReply(missing,missingInput,result(reply(missing,'structured',{clarificationFields:['retreat_budget','retreat_budget']}))).schemaValid,false);
 assert.equal(judgeReply(missing,missingInput,result(reply(missing,'structured',{clarificationFields:['retreat_budget','room_type']}))).decisionCorrect,false);
});

test('review retains malformed and missing planned outputs with fixed denominators and audits duplicates',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-v2-review-test-'));
 try{
  const inputs={...pilot,cases:[pilot.cases[0]],protocol:{...pilot.protocol,cases:1,plannedCalls:3}},stage=inputs.cases[0],text=JSON.stringify(inputs)+'\n';
  const trials=stage.inputs.map(input=>({id:`${stage.id}--${input.mode}--r1--a1`,caseId:stage.id,capabilityId:stage.capabilityId,mode:input.mode,repetition:1,attempt:1}));
  const planText=JSON.stringify({trials})+'\n';
  const outputs=trials.slice(0,2).map((trial,index)=>{const input=inputFor(stage,trial.mode),output=index===0?JSON.stringify(reply(stage,trial.mode)):'invalid JSON';return {...trial,status:'completed',output,inputSha256:input.inputSha256,contextSha256:input.contextSha256,outputSha256:sha(output),usage:null,latencyMs:1,toolEventCount:0};});
  const run={synthetic:true,inputManifestSha256:sha(text),planSha256:sha(planText),outputs};
  writeFileSync(path.join(directory,'inputs.json'),text);writeFileSync(path.join(directory,'plan.json'),planText);writeFileSync(path.join(directory,'model-results.json'),JSON.stringify(run));
  const review=reviewV2(directory);assert.equal(review.summary.planned,3);assert.equal(review.summary.completed,2);assert.equal(review.summary.failed,1);assert.equal(review.rows.length,3);assert.equal(review.audit.missingTrialIds.length,1);assert.equal(review.summary.byMode.find(row=>row.mode==='raw_retrieval').schemaValid,0);assert.equal(review.summary.byMode.find(row=>row.mode==='structured').decisionDenominator,1);
  run.outputs.push(outputs[0]);writeFileSync(path.join(directory,'model-results.json'),JSON.stringify(run));assert.equal(reviewV2(directory).audit.valid,false);
  run.outputs.pop();run.outputs[0]={...run.outputs[0],caseId:'a-different-case'};writeFileSync(path.join(directory,'model-results.json'),JSON.stringify(run));assert.equal(reviewV2(directory).audit.valid,false);
  const malformedPlan=JSON.stringify({trials:[...trials.slice(0,2),{...trials[2],id:'invented--structured--r1--a1',caseId:'invented'}]})+'\n';run.planSha256=sha(malformedPlan);writeFileSync(path.join(directory,'plan.json'),malformedPlan);writeFileSync(path.join(directory,'model-results.json'),JSON.stringify(run));assert.throws(()=>reviewV2(directory),/exact case\/condition\/repetition/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('repeat agreement preserves execution order for a sequential planning task',()=>{
 const stage=formal.cases.find(row=>row.id==='p04'),input=inputFor(stage,'structured'),selection=stage.gold.selections[0];
 const rows=[selection,[...selection].reverse()].map((selected,index)=>{const answer=reply(stage,'structured',{selection:selected});return {caseId:stage.id,mode:'structured',repetition:index+1,orderedSelection:true,status:'completed',action:'choose',selection:selected,parsedOutput:answer,judgement:judgeReply(stage,input,result(answer)),retrieval:input.retrieval,usage:null,latencyMs:1,contextChars:input.contextChars};});
 assert.equal(aggregateRows(rows,2).find(row=>row.mode==='structured').repeatAgreement,0);
 assert.equal(pairedCases(rows,2).structuredOnly,0);
});
