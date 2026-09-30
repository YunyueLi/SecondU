import {HttpError} from './store.mjs';

export const CONTEXT_DOMAINS=['auto','personal','project'];
export const CONTEXT_PURPOSES=['auto','assistance','writing','planning','decision','relationship','verification'];
const englishStop=new Set('a an the and or but if then than that this these those for from with without about into onto over under between are was were been being have has had does did doing can could would should will shall may might must you your yours our ours their theirs they them its what which who whom when where why how please help need needs want wants just also some any'.split(' '));
const chineseStop=new Set(['我们','我的','帮我','可以','需要','进行','一个','一下','目前','今天','现在','任务','什么','如何','根据','结合','请问','这些','自己','个人','事情','以及']);
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
const short=(value,max)=>({text:String(value||'').slice(0,max),truncated:String(value||'').length>max});
const sourceRefs=value=>Array.isArray(value.sourceIds)?[...new Set(value.sourceIds)]:[];
const textOf=value=>[value.title,value.statement,value.name,value.description].filter(Boolean).join(' ');

export function normalizeContextRequest(value){
  if(value===undefined)return {domain:'auto',purpose:'auto',budgetChars:20000};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['domain','purpose','budgetChars'].includes(key)))throw new HttpError(400,'个人上下文设置无效。','invalid_context_request');
  const domain=value.domain??'auto',purpose=value.purpose??'auto',budgetChars=value.budgetChars??20000;
  if(!CONTEXT_DOMAINS.includes(domain)||!CONTEXT_PURPOSES.includes(purpose)||!Number.isInteger(budgetChars)||budgetChars<4000||budgetChars>40000)throw new HttpError(400,'个人上下文范围、用途或预算无效。','invalid_context_request');
  return {domain,purpose,budgetChars};
}

function tokens(value){
  const text=normalize(value),english=new Set((text.match(/[a-z0-9]{3,}/g)||[]).filter(word=>!englishStop.has(word))),chinese=new Set();
  for(const word of text.match(/[\u3400-\u9fff]{2,}/g)||[])for(let i=0;i<word.length-1;i++){const gram=word.slice(i,i+2);if(!chineseStop.has(gram))chinese.add(gram);}
  return {english,chinese};
}
function score(value,queryTokens){
  const normalized=normalize(value),english=new Set(normalized.match(/[a-z0-9]{3,}/g)||[]);
  return [...queryTokens.english].filter(word=>english.has(word)).length*3+[...queryTokens.chinese].filter(word=>normalized.includes(word)).length;
}
function nameMentioned(name,prompt){
  const value=normalize(name).trim(),text=normalize(prompt);if(!value)return false;
  if(/[\u3400-\u9fff]/.test(value))return value.length>=2&&text.includes(value);
  const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return value.length>=2&&new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,'i').test(text);
}
function purposeFor(prompt){
  if(/(?:写|撰写|文案|邮件|文章|措辞|回复|表达)|\b(?:write|draft|rewrite|email|wording)\b/i.test(prompt))return 'writing';
  if(/(?:取舍|决策|选择|选哪个|比较|权衡)|\b(?:decide|decision|choose|compare|tradeoffs?)\b/i.test(prompt))return 'decision';
  if(/(?:安排|计划|日程|待办|下周|本周)|\b(?:plan|schedule|agenda|prioriti[sz]e)\b/i.test(prompt))return 'planning';
  if(/(?:关系|联系谁|联系一下|介绍一下.*(?:朋友|同事|家人))|\b(?:relationship|contact|introduce)\b/i.test(prompt))return 'relationship';
  return 'assistance';
}
function learningApplies(record,domain,purpose,projectId){
  const scope=record.scope||{};
  if(scope.projectId&&scope.projectId!==projectId)return false;
  if(scope.domain&&scope.domain!=='any'&&scope.domain!==domain)return false;
  if(scope.purpose&&scope.purpose!=='any'&&scope.purpose!==purpose)return false;
  return true;
}
function periodIsCurrent(entry,at){
  const date=at.slice(0,10);
  const end=entry.validTo?.length===4?entry.validTo+'-12-31':entry.validTo?.length===7?entry.validTo+'-31':entry.validTo;
  const start=entry.validFrom?.length===4?entry.validFrom+'-01-01':entry.validFrom?.length===7?entry.validFrom+'-01':entry.validFrom;
  return (!start||start<=date)&&(!end||end>=date);
}

/** Select bounded, inspectable context from this space's existing records.
 * This is deterministic retrieval, not a claim of semantic understanding.
 * Structural records have no confirmation flag; they remain "recorded" and
 * never acquire the authority of a confirmed fact or portrait entry.
 */
export function personalContextFor(store,task,{request=task.contextRequest,at=new Date().toISOString()}={}){
  const config=normalizeContextRequest(request),prompt=task.messages?.filter(value=>value.role==='user').at(-1)?.content??task.prompt??'';
  const purpose=config.purpose==='auto'?purposeFor(prompt):config.purpose;
  const technical=/(?:代码|仓库|组件|接口|编译|测试|修复|bug)|\b(?:code|repository|component|compile|debug|test|api)\b/i.test(prompt);
  const domain=config.domain==='auto'?(task.projectId||technical?'project':'personal'):config.domain;
  const verification=purpose==='verification',queryTokens=tokens(prompt),profile=store.meta('profile');
  const selfId=profile.selfPersonId??'person-self',sourceById=new Map(store.list('sources').map(source=>[source.id,source]));
  const project=task.projectId?store.get('projects',task.projectId):undefined,projectTokens=tokens(project?.name||'');
  const learningByFact=new Map(store.list('taskFeedback').map(value=>[value.factId,value]));
  const all={facts:store.list('facts'),people:store.list('people'),relationships:store.list('relationships'),events:store.list('events'),goals:store.list('goals')};
  const existingRefs=value=>sourceRefs(value).filter(id=>sourceById.has(id));
  const projectMatch=value=>!!project&&(score(textOf(value),projectTokens)>0||existingRefs(value).some(id=>score(sourceById.get(id).title,projectTokens)>0));
  const aboutSelf=/(?:我是谁|了解我|我的(?:背景|经历|情况|目标|偏好|习惯))|\b(?:about me|my background|my experience|who am i)\b/i.test(prompt);
  const result={schema:'secondu.context.v1',retrievedAt:at,request:config,domain,purpose,method:'deterministic_terms_and_explicit_references',profile:{name:profile.name,...(profile.englishName?{englishName:profile.englishName}:{}),demo:profile.demo,description:short(profile.description,600).text,descriptionTruncated:String(profile.description||'').length>600},facts:[],people:[],relationships:[],events:[],goals:[],learnings:[],unconfirmed:[],...(project?{project:{id:project.id,name:project.name,kind:project.kind,description:short(project.description,600).text,archived:project.archived,recordStatus:'recorded'}}:{}),budget:{maxChars:config.budgetChars,structuredMaxChars:Math.floor(config.budgetChars*.55),evidenceMaxChars:Math.floor(config.budgetChars*.45),usedChars:0,omitted:{facts:0,people:0,relationships:0,events:0,goals:0,learnings:0,unconfirmed:0},omittedIds:[]}};
  if(task.digitalTwinEnabled!==true){delete result.profile;delete result.project;result.disabled=true;result.budget.usedChars=JSON.stringify(result).length;return result;}
  const capacity=result.budget.structuredMaxChars-JSON.stringify(result).length-300;
  let used=0;
  const limits={facts:32,people:8,relationships:12,events:8,goals:10,learnings:8,unconfirmed:6};
  const append=(kind,value)=>{const cost=JSON.stringify(value).length+1;if(result[kind].length>=limits[kind]||used+cost>capacity){result.budget.omitted[kind]++;if(result.budget.omittedIds.length<20)result.budget.omittedIds.push({kind,id:value.id});return false;}result[kind].push(value);used+=cost;return true;};
  const baseline=all.facts.filter(fact=>fact.status==='confirmed'&&(fact.kind==='identity'&&domain==='personal'||fact.kind==='preference'&&(domain==='personal'||fact.preferenceDomain!=='taste'))&&!learningByFact.has(fact.id)).slice(0,4).map(fact=>fact.id);
  const requestedFacts=new Set(task.contextFactIds||[]);
  const rankedFacts=all.facts.map((fact,index)=>{
    const learning=learningByFact.get(fact.id);if(learning&&!learningApplies(learning,domain,purpose,task.projectId))return undefined;
    const direct=score(fact.statement,queryTokens),base=baseline.includes(fact.id),globalLearning=learning?.scope?.domain==='any'&&!learning?.scope?.purpose;
    const applicability=learning&&(globalLearning||learning.scope?.purpose===purpose||learning.scope?.projectId===task.projectId&&task.projectId);
    if(!direct&&!base&&!applicability&&!requestedFacts.has(fact.id)&&!aboutSelf)return undefined;
    return {fact,index,score:direct*4+(requestedFacts.has(fact.id)?30:0)+(applicability?12:0)+(base?2:0)+(projectMatch(fact)?2:0)};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index);
  for(const {fact} of rankedFacts){
    const snapshot={id:fact.id,kind:fact.kind,...(fact.preferenceDomain?{preferenceDomain:fact.preferenceDomain}:{}),version:fact.version,statement:fact.statement,status:fact.status,sourceIds:existingRefs(fact),updatedAt:fact.updatedAt};
    if(fact.status==='confirmed')append('facts',snapshot);
    else if(verification&&['candidate','inferred'].includes(fact.status))append('unconfirmed',{...snapshot,recordType:'fact'});
  }
  for(const fact of result.facts){const learning=learningByFact.get(fact.id);if(learning)append('learnings',{id:learning.id,factId:fact.id,factVersion:fact.version,statement:fact.statement,status:'confirmed',scope:learning.scope,sourceIds:[learning.sourceId].filter(id=>sourceById.has(id)),originalTaskId:learning.taskId});}
  const mentionedPeople=all.people.filter(person=>person.id!==selfId&&nameMentioned(person.name,prompt));
  const mentionedIds=new Set(mentionedPeople.map(person=>person.id));
  const relevantEvents=all.events.map((event,index)=>({event,index,score:score(event.title,queryTokens)*4+score(event.description,queryTokens)+(event.personIds?.some(id=>mentionedIds.has(id))?15:0)+(aboutSelf&&event.personIds?.includes(selfId)?2:0)+(projectMatch(event)?3:0)})).filter(item=>item.score>0&&(domain==='personal'||projectMatch(item.event)||item.event.personIds?.some(id=>mentionedIds.has(id)))).sort((a,b)=>b.score-a.score||String(b.event.date).localeCompare(String(a.event.date))||a.index-b.index);
  const relatedIds=new Set(mentionedIds);
  for(const {event} of relevantEvents.slice(0,8))for(const id of event.personIds||[])relatedIds.add(id);
  if(aboutSelf)relatedIds.add(selfId);
  const selectedPeople=all.people.filter(person=>relatedIds.has(person.id)).sort((a,b)=>(mentionedIds.has(b.id)?1:0)-(mentionedIds.has(a.id)?1:0));
  // A self node is only an identifier anchor; adding it does not import its life
  // history or expand the 2,000+ contact graph into the prompt.
  if(mentionedPeople.length&&all.relationships.some(relation=>(relation.from===selfId&&mentionedIds.has(relation.to))||(relation.to===selfId&&mentionedIds.has(relation.from)))){const self=all.people.find(person=>person.id===selfId);if(self&&!selectedPeople.includes(self))selectedPeople.unshift(self);}
  for(const person of selectedPeople){
    const entries=(person.portrait?.entries||[]).filter(entry=>entry.status==='confirmed'&&periodIsCurrent(entry,at)&&(person.id!==selfId||aboutSelf)).slice(0,6).map(entry=>({id:entry.id,kind:entry.kind,statement:entry.statement,status:'confirmed',sourceIds:existingRefs(entry),...(entry.validFrom?{validFrom:entry.validFrom}:{}),...(entry.validTo?{validTo:entry.validTo}:{})}));
    append('people',{id:person.id,name:person.name,role:person.role,recordStatus:'recorded',portraitVersion:person.portrait?.version,entries,sourceIds:existingRefs(person),descriptionIncluded:false});
    if(verification)for(const entry of person.portrait?.entries||[])if(['candidate','inferred'].includes(entry.status))append('unconfirmed',{id:entry.id,personId:person.id,recordType:'portrait',statement:entry.statement,status:entry.status,sourceIds:existingRefs(entry)});
  }
  const selectedPersonIds=new Set(result.people.map(person=>person.id));
  for(const relation of all.relationships)if(selectedPersonIds.has(relation.from)&&selectedPersonIds.has(relation.to))append('relationships',{id:relation.id,from:relation.from,to:relation.to,label:relation.label,description:short(relation.description,700).text,truncated:String(relation.description||'').length>700,recordStatus:'recorded',sourceIds:existingRefs(relation)});
  for(const {event} of relevantEvents)append('events',{id:event.id,title:event.title,date:event.date,...(event.endDate?{endDate:event.endDate}:{}),category:event.category,description:short(event.description,900).text,truncated:String(event.description||'').length>900,personIds:event.personIds||[],recordStatus:'recorded',sourceIds:existingRefs(event)});
  const today=at.slice(0,10),soon=new Date(Date.parse(at)+14*86400000).toISOString().slice(0,10);
  const relevantGoals=all.goals.map((goal,index)=>({goal,index,score:score(goal.title,queryTokens)*4+score(goal.description,queryTokens)+(projectMatch(goal)?3:0)+(domain==='personal'&&purpose==='planning'&&goal.status==='active'?(goal.flagged?5:0)+(goal.dueDate&&goal.dueDate<=soon?4:1):0)})).filter(item=>item.score>0&&(domain==='personal'||projectMatch(item.goal))).sort((a,b)=>b.score-a.score||String(a.goal.dueDate||'9999').localeCompare(String(b.goal.dueDate||'9999'))||a.index-b.index);
  for(const {goal} of relevantGoals)append('goals',{id:goal.id,title:goal.title,description:short(goal.description,700).text,truncated:String(goal.description||'').length>700,status:goal.status,...(goal.dueDate?{dueDate:goal.dueDate,overdue:goal.status==='active'&&goal.dueDate<today}:{}),flagged:!!goal.flagged,listId:goal.listId,updatedAt:goal.updatedAt,recordStatus:'recorded',sourceIds:existingRefs(goal)});
  while(result.budget.omittedIds.length&&JSON.stringify(result).length+5>result.budget.structuredMaxChars)result.budget.omittedIds.pop();
  for(const kind of ['unconfirmed','learnings','goals','events','relationships','people','facts'])while(result[kind].length&&JSON.stringify(result).length+5>result.budget.structuredMaxChars){result[kind].pop();result.budget.omitted[kind]++;}
  const present=new Set(result.people.map(person=>person.id));result.relationships=result.relationships.filter(relation=>present.has(relation.from)&&present.has(relation.to));
  result.budget.usedChars=JSON.stringify(result).length;
  result.budget.usedChars=JSON.stringify(result).length;
  return result;
}

export function contextSourceRecords(bundle){
  if(bundle.disabled)return [];
  return [...bundle.facts,...bundle.people.flatMap(person=>person.entries),...bundle.relationships,...bundle.events,...bundle.goals,...bundle.learnings,...bundle.unconfirmed];
}
