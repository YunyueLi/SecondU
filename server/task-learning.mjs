import {createHash} from 'node:crypto';
import {HttpError,id,now} from './store.mjs';
import {createEntity,text} from './domain.mjs';
import {CONTEXT_PURPOSES,personalContextFor} from './personal-context.mjs';
import {sensitiveWorkspaceContent} from './workspace-files.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const cleanString=(value,field,max,required=true)=>text(value,field,max,required);
const originalString=(value,field,max,required=true)=>{text(value,field,max,required);return value;};
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function jsonEvent(task,type,before,eventId){
  const event=eventId?task.events.find(event=>event.id===eventId&&event.type===type):[...task.events].reverse().find(event=>event.type===type&&(!before||event.createdAt<=before));
  if(!event)return {status:'unavailable'};
  try{return {status:'recorded',eventId:event.id,recordedAt:event.createdAt,value:JSON.parse(event.detail)};}
  catch{return {status:'unavailable',eventId:event.id,reason:'invalid_historical_snapshot'};}
}
function snapshotArtifact(store,task,ref){
  if(!object(ref)||Object.keys(ref).some(key=>!['id','version'].includes(key))||typeof ref.id!=='string'||!Number.isInteger(ref.version)||ref.version<1)throw new HttpError(400,'请选择产物及明确版本。','invalid_feedback_artifact');
  const artifact=store.require('artifacts',ref.id);
  if(artifact.taskId!==task.id)throw new HttpError(400,'产物不属于本次任务。','feedback_artifact_scope');
  const revision=artifact.versions.find(value=>value.version===ref.version);
  if(!revision)throw new HttpError(409,'所选产物版本不存在，请重新选择。','feedback_artifact_version');
  const content=originalString(revision.content,'产物正文',1024*1024,false);
  return {id:artifact.id,name:artifact.name,version:revision.version,content,sha256:hash(content),createdAt:revision.createdAt,author:revision.author};
}
function normalizeScope(raw,bundle,task){
  if(raw===undefined)return {domain:bundle.domain,purpose:bundle.purpose};
  if(!object(raw)||Object.keys(raw).some(key=>!['domain','purpose','projectId'].includes(key)))throw new HttpError(400,'反馈适用范围无效。','invalid_feedback_scope');
  const domain=raw.domain??bundle.domain;
  if(!['personal','project','any'].includes(domain)||raw.purpose!==undefined&&!CONTEXT_PURPOSES.filter(value=>value!=='auto').includes(raw.purpose))throw new HttpError(400,'反馈适用范围或用途无效。','invalid_feedback_scope');
  if(raw.projectId!==undefined&&(raw.projectId!==task.projectId||domain!=='project'))throw new HttpError(400,'反馈只能限定到本次任务所在项目。','feedback_project_scope');
  return {domain,...(raw.purpose?{purpose:raw.purpose}:{}),...(raw.projectId?{projectId:raw.projectId}:{})};
}
function describe(record){
  return [
    `任务反馈：${record.context.taskTitle}`,
    `反馈记录：${record.id}`,
    `任务：${record.taskId}`,
    `记录时间：${record.createdAt}`,
    `当前要求：${record.context.userMessage?.content||'未记录'}`,
    record.original.message?`原答复：${record.original.message.id}；SHA-256 ${record.original.message.sha256}`:'',
    record.original.artifact?`原产物：${record.original.artifact.name} v${record.original.artifact.version}；SHA-256 ${record.original.artifact.sha256}`:'',
    `用户纠正原文：\n${record.correction.text}`,
    `待确认的长期理解：\n${record.correction.statement}`,
    `适用范围：${JSON.stringify(record.scope)}`,
    record.adoption?`用户明确采纳：\n${record.adoption.artifact?`${record.adoption.artifact.name} v${record.adoption.artifact.version}；SHA-256 ${record.adoption.artifact.sha256}`:record.adoption.text}`:'',
    record.outcome?`用户报告的实际结果：\n${record.outcome.text}`:'',
    '原答复、指定产物版本及当时上下文保存在本机反馈记录中；本记录不自动确认事实，也不代表系统验证了用户报告的结果。',
  ].filter(Boolean).join('\n\n');
}
export function feedbackRecord(store,key){
  const record=store.require('taskFeedback',key),fact=store.get('facts',record.factId);
  return {...record,factStatus:fact?.status??'missing',factVersion:fact?.version??null};
}
export function taskFeedback(store,taskId){store.require('tasks',taskId);return store.list('taskFeedback').filter(value=>value.taskId===taskId).map(value=>feedbackRecord(store,value.id));}

/** Capture four layers atomically. The client can select existing references,
 * but never supplies the original assistant output, source snapshot or hashes.
 */
export function saveTaskFeedback(store,taskId,body){
  if(!object(body)||Object.keys(body).some(key=>!['requestId','messageId','artifact','feedback','statement','kind','preferenceDomain','scope','adoption','outcome'].includes(key)))throw new HttpError(400,'反馈字段无效。','invalid_feedback');
  const requestId=cleanString(body.requestId,'反馈请求标识',160),requestDigest=hash(JSON.stringify(canonical(body)));
  return store.transaction(()=>{
    const task=store.require('tasks',taskId);
    const existing=store.list('taskFeedback').find(value=>value.taskId===taskId&&value.requestId===requestId);
    if(existing){if(existing.requestDigest!==requestDigest)throw new HttpError(409,'本次反馈请求已保存，请刷新后再修改。','feedback_request_conflict');return feedbackRecord(store,existing.id);}
    if(['running','queued','awaiting_approval'].includes(task.status))throw new HttpError(409,'请等本轮结束或停止后再记录反馈。','feedback_task_active');
    const correction=originalString(body.feedback,'用户纠正',30000),statement=cleanString(body.statement,'以后使用的理解',10000);
    const kind=body.kind??'preference';if(!['preference','value','capability','constraint','identity','decision'].includes(kind))throw new HttpError(400,'理解类型无效。','invalid_feedback_kind');
    const selectedMessage=body.messageId===undefined?[...task.messages].reverse().find(value=>value.role==='assistant'):task.messages.find(value=>value.id===body.messageId);
    if(body.messageId!==undefined&&(!selectedMessage||selectedMessage.role!=='assistant'))throw new HttpError(400,'只能关联本次任务的助手答复。','feedback_message_scope');
    if(!selectedMessage&&!body.artifact)throw new HttpError(400,'请先选择已有答复或产物。','feedback_original_missing');
    const original={};
    if(selectedMessage){const content=originalString(selectedMessage.content,'原答复',1024*1024,false);original.message={id:selectedMessage.id,role:'assistant',content,sha256:hash(content),createdAt:selectedMessage.createdAt,...(selectedMessage.agentId?{agentId:selectedMessage.agentId}:{})};}
    if(body.artifact)original.artifact=snapshotArtifact(store,task,body.artifact);
    const before=original.message?.createdAt??original.artifact?.createdAt;
    const lastUser=task.messages.filter(value=>value.role==='user'&&(!before||value.createdAt<=before)).at(-1);
    const personal=jsonEvent(task,'personal_context',before,selectedMessage?.contextEventIds?.personal_context),facts=jsonEvent(task,'context',before,selectedMessage?.contextEventIds?.context),evidence=jsonEvent(task,'evidence',before,selectedMessage?.contextEventIds?.evidence);
    const current=personal.status==='recorded'?personal.value:personalContextFor(store,task);
    const scope=normalizeScope(body.scope,current,task);
    const stamp=now(),record={schema:'secondu.task-feedback.v1',id:id('feedback'),taskId,requestId,requestDigest,createdAt:stamp,context:{taskTitle:task.title,...(task.projectId?{projectId:task.projectId}:{}),...(lastUser?{userMessage:{id:lastUser.id,content:lastUser.content,createdAt:lastUser.createdAt}}:{}),personalContext:personal,facts,evidence},original,correction:{text:correction,statement,kind,...(body.preferenceDomain?{preferenceDomain:body.preferenceDomain}:{})},scope};
    if(body.adoption!==undefined){
      const adoption=body.adoption;
      if(!object(adoption)||Object.keys(adoption).some(key=>!['confirmed','text','artifact'].includes(key))||adoption.confirmed!==true||!!adoption.text===!!adoption.artifact)throw new HttpError(400,'采纳内容需要你明确确认，并选择一份正文或产物版本。','invalid_feedback_adoption');
      record.adoption={confirmedBy:'user',recordedAt:stamp,...(adoption.artifact?{artifact:snapshotArtifact(store,task,adoption.artifact)}:{text:originalString(adoption.text,'采纳的内容',30000)})};
    }
    if(body.outcome!==undefined){if(!object(body.outcome)||Object.keys(body.outcome).some(key=>key!=='text'))throw new HttpError(400,'实际结果格式无效。','invalid_feedback_outcome');record.outcome={status:'user_reported',text:originalString(body.outcome.text,'实际结果',10000),recordedAt:stamp};}
    if(sensitiveWorkspaceContent(JSON.stringify(record),Object.values(store.getKeys()).filter(value=>typeof value==='string')))throw new HttpError(400,'原答复或所选资料包含凭据信息，不能写入反馈记录。','feedback_sensitive_content');
    const source=createEntity(store,'sources',{title:`任务反馈：${task.title}`,kind:'feedback',text:describe(record)});
    store.put('sources',source);
    const fact=createEntity(store,'facts',{statement,kind,status:'candidate',sourceIds:[source.id],reason:'由任务反馈保存，等待本人确认。',...(body.preferenceDomain!==undefined?{preferenceDomain:body.preferenceDomain}:{})});
    record.sourceId=source.id;record.factId=fact.id;
    store.put('facts',fact);store.put('taskFeedback',record);
    return feedbackRecord(store,record.id);
  });
}
