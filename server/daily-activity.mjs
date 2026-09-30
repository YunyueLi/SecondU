import brand from '../shared/brand.json' with {type:'json'};
import { createHash } from 'node:crypto';
import { HttpError, id, now } from './store.mjs';
import { validLifeDate } from './life-date.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=(prefix,...values)=>`${prefix}-${hash(JSON.stringify(values)).slice(0,32)}`;
const fail=(message,status=400,code='invalid_activity')=>{throw new HttpError(status,message,code);};
const string=(value,name,max,empty=false)=>{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))fail(`${name} 无效或过长`);return value;};
export const ACTIVITY_IMPORT_LIMIT=512*1024;

export function activityTimestamp(value) {
  const match=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if(!match||!validLifeDate(match[1])||+match[2]>23||+match[3]>59||+match[4]>59||+match[7]>14||+match[8]>59||(+match[7]===14&&+match[8]!==0))fail('活动时间须为有效且带时区的 ISO 8601 时间，例如 2026-09-29T09:30:00+08:00。');
  const instant=new Date(value);if(!Number.isFinite(instant.getTime()))fail('活动时间无效。');return instant.toISOString();
}
function sourceUrl(value) {
  if(value===undefined)return undefined;
  string(value,'sourceUrl',2000);let url;try{url=new URL(value);}catch{fail('来源链接只接受不含凭据的 HTTP(S) 地址。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\x00-\x20]/.test(value))fail('来源链接只接受不含凭据的 HTTP(S) 地址。');
  return url.href;
}
function normalize(body) {
  const content=string(body.content,'content',ACTIVITY_IMPORT_LIMIT),filename=string(body.filename||'activities.json','filename',300);
  if(Buffer.byteLength(content)>ACTIVITY_IMPORT_LIMIT)fail('活动文件最多 512 KiB，请按日期拆分。',413);
  let data;try{data=JSON.parse(content.replace(/^\uFEFF/,''));}catch{fail('请使用 hither.activity.v1 格式的有效 JSON。');}
  if(!data||data.format!=='hither.activity.v1'||!Array.isArray(data.activities)||!data.activities.length||data.activities.length>500)fail('活动文件须使用 hither.activity.v1 格式，包含 1 至 500 条 activities。');
  const namespace=string(data.sourceId,'sourceId',200).trim();if(data.demo!==undefined&&typeof data.demo!=='boolean')fail('demo 必须为布尔值');
  const items=new Map();let repeatedInFile=0;
  for(const item of data.activities){
    if(!item||typeof item!=='object'||Array.isArray(item))fail('每条活动必须是对象。');
    const externalId=string(item.id,'activity.id',200).trim(),startAt=activityTimestamp(item.start),endAt=item.end===undefined?undefined:activityTimestamp(item.end);
    if(endAt&&endAt<startAt)fail('活动结束时间不能早于开始时间。');
    const record={id:stable('activity',namespace,externalId),kind:'import',externalId,namespace,title:string(item.title,'title',300),summary:string(item.summary,'summary',4000,true),startAt,...(endAt?{endAt}:{}),...(item.app!==undefined?{app:string(item.app,'app',200)}:{}),...(item.sourceUrl!==undefined?{sourceUrl:sourceUrl(item.sourceUrl)}:{}),...(item.reference!==undefined?{reference:string(item.reference,'reference',2000,true)}:{}),status:'recorded',demo:data.demo===true};
    const before=items.get(record.id);if(before&&JSON.stringify(before)!==JSON.stringify(record))fail('同一活动 ID 的内容冲突；没有覆盖原始记录。',409,'activity_conflict');if(before)repeatedInFile++;items.set(record.id,record);
  }
  return {content,filename,namespace,sha256:hash(content),items:[...items.values()],repeatedInFile};
}
function inspect(store,data) {
  let duplicates=data.repeatedInFile;
  for(const item of data.items){const before=store.get('dailyActivities',item.id);if(!before)continue;const {sourceIds,createdAt,...original}=before;if(JSON.stringify(original)!==JSON.stringify(item))fail('已存在同一来源、同一 ID 的不同活动内容。请保留旧记录并为修正记录使用新 ID。',409,'activity_conflict');duplicates++;}
  return {total:data.items.length+data.repeatedInFile,added:data.items.filter(item=>!store.get('dailyActivities',item.id)).length,duplicates};
}
export function previewActivityImport(store,body) {
  const data=normalize(body),counts=inspect(store,data),previewId=id('activity-preview'),expiresAt=new Date(Date.now()+30*60*1000).toISOString();
  for(const preview of store.list('activityPreviews'))if(preview.expiresAt<now())store.delete('activityPreviews',preview.id);
  const previous=store.list('activityPreviews');if(previous.length>=20)store.delete('activityPreviews',previous[0].id);
  store.put('activityPreviews',{id:previewId,data,expiresAt});
  return {previewId,filename:data.filename,sha256:data.sha256,sourceId:data.namespace,counts,items:data.items.map(item=>({...item,sourceIds:[]})),expiresAt};
}
export function commitActivityImport(store,previewId) {
  const preview=store.require('activityPreviews',string(previewId,'previewId',200)),data=preview.data,importId=stable('activity-import',data.namespace,data.sha256),prior=store.get('activityImports',importId);
  if(prior)return {...prior.result,added:0,alreadyImported:true};
  if(preview.expiresAt<now())fail('导入预览已过期，请重新预览后确认。',409,'preview_expired');
  const counts=inspect(store,data),stamp=now(),sourceId=`source-${importId}`;
  const result={importId,sourceId,activityIds:data.items.map(item=>item.id),added:counts.added,duplicates:counts.duplicates,alreadyImported:false};
  store.transaction(()=>{
    store.put('sources',{id:sourceId,title:data.filename,kind:'document',text:data.content,createdAt:stamp,demo:data.items.every(item=>item.demo),activityImport:{format:'hither.activity.v1',sourceId:data.namespace,sha256:data.sha256,filename:data.filename,importedAt:stamp}});
    for(const item of data.items){const old=store.get('dailyActivities',item.id);store.put('dailyActivities',{...item,sourceIds:[...new Set([...(old?.sourceIds??[]),sourceId])],createdAt:old?.createdAt??stamp});}
    store.put('activityImports',{id:importId,result});
  });
  // Importing private activity is not an automatic model/automation trigger.
  return result;
}

export function dailyActivity(store) {
  const showcase=store.meta('profile').demo;
  const rooms=new Map(store.list('agentRooms').map(room=>[room.id,room])),sources=new Map(store.list('sources').map(source=>[source.id,source]));
  const tasks=store.list('tasks').filter(task=>!showcase||!task.archived).map(task=>{
    const room=task.roomId&&rooms.get(task.roomId),finished=[...task.events].reverse().find(event=>['completed','failed','cancelled','interrupted'].includes(event.type));
    return {id:`activity-task-${task.id}`,kind:room?'room':'task',title:task.title,summary:(task.messages.filter(message=>message.role==='user').at(-1)?.content||task.prompt).slice(0,1000),startAt:task.createdAt,...(finished&&!['running','queued','awaiting_approval','needs_input'].includes(task.status)?{endAt:finished.createdAt}:{}),app:`${brand.name}`,status:task.status,taskId:task.id,...(room?{roomId:room.id,roomTitle:room.title}:{}),sourceIds:[],demo:task.mode==='demo'};
  });
  const notes=store.list('events').filter(event=>event.scope==='note').map(event=>({id:`activity-note-${event.id}`,kind:'manual',lifeEventId:event.id,title:event.title,summary:event.description,date:event.date,...(event.endDate?{endDate:event.endDate}:{}),status:'recorded',sourceIds:event.sourceIds,demo:!!event.sourceIds.length&&event.sourceIds.every(id=>sources.get(id)?.demo)}));
  return [...tasks,...notes,...store.list('dailyActivities')].sort((a,b)=>(b.startAt||b.date).localeCompare(a.startAt||a.date));
}
