import conversations from './demo-conversation-translations.json' with {type:'json'};
import core from './demo-translations.json' with {type:'json'};
import showcase from './demo-showcase-translations.json' with {type:'json'};
import life from './demo-life-translations.json' with {type:'json'};
import agents from './demo-agent-translations.json' with {type:'json'};
import cognition from './demo-cognition-translations.json' with {type:'json'};
const dictionaries={};
for(const source of [core,life,conversations,showcase,agents,cognition])for(const [collection,records] of Object.entries(source)){dictionaries[collection]??={};for(const [id,entries] of Object.entries(records))dictionaries[collection][id]={...(dictionaries[collection][id]||{}),...entries};}
export const demoTranslationEntries=dictionaries;
const demoRoomIntroIds=new Map(['planner','writer','studio','balance'].map(key=>[`demo-v2-room-${key}`,`demo-v2-room-intro-${key}`]));
const authoredRoomNotices=new Set([
 '这是虚构示例会话。发送后会运行明确标注的本地流程演示，结果与审批关联到真实本地任务；尚未运行模型。',
 '这是虚构示例会话。发送后运行本地流程演示，不调用模型；新任务及其结果会保存在本机。',
 '本地演示会话；连接模型后可继续处理自己的任务。',
]);
const roomNotice=locale=>locale==='en'
 ?'You can edit this example and its settings. Switch to your own space to run tasks.'
 :'可以修改示例内容与配置。实际执行任务时，请切换到自己的空间。';
function isAuthoredRoomNotice(room,message){
 return room?.demo===true&&room.mode==='demo'&&demoRoomIntroIds.has(room.id)
  &&message?.id===demoRoomIntroIds.get(room.id)&&message.role==='system'&&message.demo===true
  &&authoredRoomNotices.has(message.content);
}
function currentDemoRoomNotices(data,locale){
 if(!Array.isArray(data.agentRooms))return data;
 let changed=false;
 const agentRooms=data.agentRooms.map(room=>{
  if(!Array.isArray(room.messages))return room;
  let roomChanged=false;
  const messages=room.messages.map(message=>{
   if(!isAuthoredRoomNotice(room,message)||message.content===roomNotice(locale))return message;
   changed=true;roomChanged=true;return {...message,content:roomNotice(locale)};
  });
  return roomChanged?{...room,messages}:room;
 });
 return changed?{...data,agentRooms}:data;
}
const opaque=new Set(['id','kind','status','type','mode','platform','date','startDate','endDate','dueDate','createdAt','updatedAt','recordedAt','time','path','url','filePath','directory','avatarSeed','avatarStyle','connectionId','catalogId']);
function project(value,entries,key=''){
 if(opaque.has(key)||/(?:Id|Ids)$/.test(key))return value;
 if(typeof value==='string')return Object.hasOwn(entries,value)?entries[value]:value;
 if(Array.isArray(value))return value.map(item=>project(item,entries));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,project(item,entries,field)]));
 return value;
}
/** Display-only projection of authored sample text. Imported and edited text has no matching entry. */
export function localizeDemoBootstrap(data,locale){
 if(data?.profile?.demo!==true)return data;
 data=currentDemoRoomNotices(data,locale);
 if(locale!=='en')return data;
 const result={...data};
 for(const [collection,records] of Object.entries(dictionaries)){
  if(collection==='profile'){result.profile=project(data.profile,records.profile||{});continue;}
  if(!Array.isArray(data[collection]))continue;
  result[collection]=data[collection].map(record=>records[record.id]?project(record,records[record.id]):record);
 }
 if(Array.isArray(data.dailyActivities)){
  const tasks=new Map((result.tasks||[]).map(item=>[item.id,item]));
  const events=new Map((result.events||[]).map(item=>[item.id,item]));
  const rooms=new Map((result.agentRooms||[]).map(item=>[item.id,item]));
  result.dailyActivities=data.dailyActivities.map(activity=>{
   const task=activity.id===`activity-task-${activity.taskId}`&&tasks.get(activity.taskId);
   if(task)return {...activity,title:task.title,summary:(task.messages.filter(message=>message.role==='user').at(-1)?.content||task.prompt).slice(0,1000),...(activity.roomId&&rooms.has(activity.roomId)?{roomTitle:rooms.get(activity.roomId).title}:{})};
   const event=activity.id===`activity-note-${activity.lifeEventId}`&&events.get(activity.lifeEventId);
   return event?{...activity,title:event.title,summary:event.description}:activity;
  });
 }
 return result;
}
function restoreFields(value,original,entries,key=''){
 if(opaque.has(key)||/(?:Id|Ids)$/.test(key))return value;
 if(typeof value==='string')return typeof original==='string'&&value===project(original,entries,key)?original:value;
 if(Array.isArray(value)){
  const previous=Array.isArray(original)?original:[];
  const byId=new Map(previous.filter(item=>item&&typeof item==='object'&&typeof item.id==='string').map(item=>[item.id,item]));
  return value.map((item,index)=>restoreFields(item,item&&typeof item==='object'&&typeof item.id==='string'?byId.get(item.id):previous[index],entries));
 }
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[
  field,restoreFields(item,original&&typeof original==='object'&&Object.hasOwn(original,field)?original[field]:undefined,entries,field),
 ]));
 return value;
}
/** Restore submitted fields only; the original record is never merged into a patch. */
export function canonicalDemoValue(collection,id,value,locale='en',originalRecord){
 if(collection==='agentRooms'&&Array.isArray(value?.messages)&&Array.isArray(originalRecord?.messages)){
  const originals=new Map(originalRecord.messages.map(message=>[message.id,message]));
  value={...value,messages:value.messages.map(message=>{
   const original=originals.get(message.id);
   return isAuthoredRoomNotice(originalRecord,original)&&message.role==='system'&&message.demo===true&&message.content===roomNotice(locale)
    ?{...message,content:original.content}:message;
  })};
 }
 if(locale!=='en')return value;
 const pairs=dictionaries[collection]?.[id];if(!pairs)return value;
 if(originalRecord!==undefined)return restoreFields(value,originalRecord,pairs);
 const reverse={},ambiguous=new Set();
 for(const [zh,en] of Object.entries(pairs)){if(Object.hasOwn(reverse,en)&&reverse[en]!==zh){ambiguous.add(en);delete reverse[en];}else if(!ambiguous.has(en))reverse[en]=zh;}
 return project(value,reverse);
}
