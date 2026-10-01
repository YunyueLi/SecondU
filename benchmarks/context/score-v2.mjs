import {MODES} from './suite-v2.mjs';
const same=(a,b,ordered)=>JSON.stringify(ordered?a:[...a].sort())===JSON.stringify(ordered?b:[...b].sort());
const includesSelection=(sets,selection,ordered)=>sets?.some(set=>same(set,selection,ordered))??false;
export function judgeReply(stage,input,result){
 let reply=null,error=null;
 try{reply=JSON.parse(result.output);}catch{error='invalid_json';}
 const keys=['action','selection','reason','usedSourceIds','clarificationFields','clarification'];
 const labels=stage.options.map(option=>option.split(':',1)[0]);
 if(!error&&(!reply||Array.isArray(reply)||typeof reply!=='object'||Object.keys(reply).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(reply,key))||!['choose','clarify'].includes(reply.action)||!Array.isArray(reply.selection)||reply.selection.some(item=>!labels.includes(item))||new Set(reply.selection).size!==reply.selection.length||typeof reply.reason!=='string'||!reply.reason.trim()||!Array.isArray(reply.usedSourceIds)||reply.usedSourceIds.some(id=>typeof id!=='string')||!Array.isArray(reply.clarificationFields)||reply.clarificationFields.some(field=>typeof field!=='string')||!(reply.clarification===null||typeof reply.clarification==='string')||(reply.action==='choose'&&(!reply.selection.length||reply.clarification!==null||reply.clarificationFields.length))||(reply.action==='clarify'&&(reply.selection.length||typeof reply.clarification!=='string'||!reply.clarification.trim()))))error='invalid_response_schema';
 if(!error&&(reply.clarificationFields.some(field=>!stage.fields.includes(field))||new Set(reply.clarificationFields).size!==reply.clarificationFields.length))error='invalid_clarification_fields';
 const schemaValid=result.status==='completed'&&!error;
 const gold=input.mode==='no_context'?stage.gold.noContext:stage.gold;
 const requiredFields=gold.fields??gold.clarificationFields??[];
 const decisionCorrect=schemaValid&&reply.action===gold.action&&(gold.action==='choose'?includesSelection(gold.selections,reply.selection,stage.gold.orderedSelection):same(requiredFields,reply.clarificationFields,false));
 const citations=schemaValid?[...new Set(reply.usedSourceIds)]:[];
 const provided=new Set(input.providedSourceIds),invalid=citations.filter(id=>!provided.has(id));
 const requiredSets=input.mode==='no_context'?[[]]:stage.gold.requiredSourceSets;
 const evidenceRequired=!requiredSets.some(set=>set.length===0);
 const maxCoverage=evidenceRequired?Math.max(...requiredSets.map(set=>set.filter(id=>citations.includes(id)&&provided.has(id)).length/set.length)):null;
 const evidenceCovered=evidenceRequired?schemaValid&&maxCoverage===1:null;
 const hardOracle=input.mode==='no_context'?(gold.action==='choose'?(Object.hasOwn(gold,'hardValidSelections')?gold.hardValidSelections:gold.selections):null):stage.gold.hardValidSelections;
 const hardApplicable=gold.action==='choose'&&Array.isArray(hardOracle);
 const constraintsSatisfied=hardApplicable?schemaValid&&reply.action==='choose'&&includesSelection(hardOracle,reply.selection,stage.gold.orderedSelection):null;
 const superseded=citations.filter(id=>stage.gold.supersededSourceIds.includes(id));
 const candidate=citations.filter(id=>stage.gold.candidateSourceIds.includes(id));
 const canaries=[...new Set(stage.sourceEvents.flatMap(row=>row.event.statement.match(/(?:UNRELATED|UNCONFIRMED|QUOTED)_CANARY_[A-Z0-9_]+/g)??[]))];
 const repeated=canaries.filter(value=>String(result.output??'').includes(value));
 return {schemaValid,schemaError:error,decisionCorrect,constraintsSatisfied,requiredEvidenceCovered:evidenceCovered,evidenceCoverage:maxCoverage,invalidCitations:invalid,supersededCitations:superseded,candidateCitations:candidate,citedSourceCount:citations.length,validCitationCount:citations.length-invalid.length,canaryRepeated:repeated.length>0,repeatedCanaries:repeated,contaminationSelection:schemaValid&&reply.action==='choose'&&stage.gold.contaminationSelections?includesSelection(stage.gold.contaminationSelections,reply.selection,stage.gold.orderedSelection):null,appropriateClarificationOnRetrievalMiss:input.mode!=='no_context'&&stage.gold.action==='choose'&&!input.retrieval.requiredEvidenceAvailable?schemaValid&&reply.action==='clarify':null};
}
const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null;};
export function aggregateRows(rows,repetitions){
 return MODES.map(mode=>{
  const selected=rows.filter(row=>row.mode===mode),caseIds=[...new Set(selected.map(row=>row.caseId))],cases=caseIds.map(id=>selected.filter(row=>row.caseId===id));
  return {mode,total:selected.length,completed:selected.filter(row=>row.status==='completed').length,failed:selected.filter(row=>row.status!=='completed').length,schemaValid:selected.filter(row=>row.judgement.schemaValid).length,decisionCorrect:selected.filter(row=>row.judgement.decisionCorrect).length,decisionDenominator:selected.length,constraintsSatisfied:selected.filter(row=>row.judgement.constraintsSatisfied===true).length,constraintDenominator:selected.filter(row=>row.judgement.constraintsSatisfied!==null).length,requiredEvidenceCovered:selected.filter(row=>row.judgement.requiredEvidenceCovered===true).length,evidenceDenominator:selected.filter(row=>row.judgement.requiredEvidenceCovered!==null).length,validCitations:selected.reduce((n,row)=>n+row.judgement.validCitationCount,0),citationDenominator:selected.reduce((n,row)=>n+row.judgement.citedSourceCount,0),invalidCitations:selected.reduce((n,row)=>n+row.judgement.invalidCitations.length,0),supersededCitations:selected.reduce((n,row)=>n+row.judgement.supersededCitations.length,0),candidateCitations:selected.reduce((n,row)=>n+row.judgement.candidateCitations.length,0),canaryRepetitions:selected.filter(row=>row.judgement.canaryRepeated).length,inputEvidenceAvailable:selected.filter(row=>row.retrieval.requiredEvidenceAvailable).length,inputCandidateExposure:selected.filter(row=>row.retrieval.candidateSourceIdsExposed.length).length,inputUnrelatedCanaryExposure:selected.filter(row=>row.retrieval.unrelatedCanaryExposed).length,inputTokens:selected.reduce((n,row)=>n+(row.usage?.input_tokens??0),0),cachedInputTokens:selected.reduce((n,row)=>n+(row.usage?.cached_input_tokens??0),0),outputTokens:selected.reduce((n,row)=>n+(row.usage?.output_tokens??0),0),usageMeasuredCalls:selected.filter(row=>row.usage!==null).length,medianLatencyMs:median(selected.map(row=>row.latencyMs)),medianContextChars:median(selected.map(row=>row.contextChars)),casesCorrectAllRepeats:cases.filter(items=>items.length===repetitions&&items.every(row=>row.judgement.decisionCorrect)).length,caseDenominator:caseIds.length,repeatAgreement:cases.filter(items=>items.length===repetitions&&items.every(row=>row.judgement.schemaValid)&&new Set(items.map(row=>JSON.stringify([row.action,row.orderedSelection?(row.selection??[]):[...(row.selection??[])].sort(),[...(row.parsedOutput?.clarificationFields??[])].sort()]))).size===1).length};
 });
}
export function pairedCases(rows,repetitions){
 const ids=[...new Set(rows.map(row=>row.caseId))],out={unit:'Authored scenario, requiring correct decisions in every repetition',cases:ids.length,bothCorrect:0,structuredOnly:0,rawOnly:0,neither:0,rows:[]};
 for(const id of ids){const correct=mode=>{const items=rows.filter(row=>row.caseId===id&&row.mode===mode);return items.length===repetitions&&items.every(row=>row.judgement.decisionCorrect);};const structured=correct('structured'),raw=correct('raw_retrieval'),category=structured&&raw?'bothCorrect':structured?'structuredOnly':raw?'rawOnly':'neither';out[category]++;out.rows.push({caseId:id,structured,raw,category});}
 return out;
}
