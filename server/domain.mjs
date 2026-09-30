import { normalizeContextRequest } from './personal-context.mjs';
import { connectorSelection } from './connectors.mjs';
import { updatePersonPortrait, portraitSourceIds } from './person-portrait.mjs';
import { messageInput } from './attachments.mjs';
import { chatTitle } from './chat-title.mjs';
import { defaultAgentAvatarStyle } from './avatars.mjs';
import { createProject, projectReference } from './projects.mjs';
import { normalizeAgentSourceUrl, AgentSourceError } from '../shared/agent-source.mjs';
import { validLifeDate, lifeDateStart } from './life-date.mjs';
import { timelineMedia } from './timeline-media.mjs';
import { HttpError, id, now } from './store.mjs';
export function text(value, field, max=200000, required=true) { if(typeof value!=='string' || (required && !value.trim()) || value.length>max) throw new HttpError(400,`${field} 无效或过长`); return value.trim(); }
export function choice(value,values,field) { if(!values.includes(value)) throw new HttpError(400,`${field} 无效`); return value; }
export function bool(value,field) { if(typeof value!=='boolean') throw new HttpError(400,`${field} 必须为布尔值`); return value; }
export function refs(store,value,collection,field) { if(!Array.isArray(value) || value.length>200 || value.some(x=>typeof x!=='string')) throw new HttpError(400,`${field} 必须是标识列表`); const result=[...new Set(value)]; for(const key of result) store.require(collection,key); return result; }
export function addEvent(task,type,label,detail,agentId) { task.events.push({id:id('event'),type,label,detail,agentId,createdAt:now()}); task.updatedAt=now(); return task; }
export function createEntity(store, collection, body, existing) {
  const value={...existing,...body}, entity={id:existing?.id ?? id(collection.slice(0,-1))};
  const str=(key,max=10000,required=true)=>entity[key]=text(value[key]??(required?undefined:''),key,max,required);
  const sourceRefs=()=>entity.sourceIds=refs(store,value.sourceIds??[],'sources','sourceIds');
  switch(collection) {
    case 'projects': return createProject(store,body,existing);
    case 'sources': str('title',300); str('text',200000); entity.text=value.text; entity.kind=choice(value.kind??'note',['note','conversation','document','feedback'],'kind'); entity.demo=existing?.demo??false; entity.createdAt=existing?.createdAt??now(); break;
    case 'facts': {
      str('statement',10000); entity.kind=choice(value.kind??'preference',['preference','value','capability','constraint','identity','decision'],'kind'); entity.status=choice(value.status??'candidate',['confirmed','inferred','candidate','superseded'],'status'); sourceRefs();
      if(Object.hasOwn(body,'preferenceDomain')) {
        if(entity.kind!=='preference')throw new HttpError(400,'只有偏好可以设置偏好分类','invalid_preference_domain');
        entity.preferenceDomain=choice(body.preferenceDomain,['work','taste','general'],'preferenceDomain');
      } else if(entity.kind==='preference'&&existing?.kind==='preference'&&existing.preferenceDomain)entity.preferenceDomain=existing.preferenceDomain;
      if(existing && body.baseVersion!==existing.version) throw new HttpError(409,'这条认知已更新，请刷新后再修改','version_conflict');
      const reason=text(body.reason??(existing?'用户修正':'用户添加'),'reason',2000);
      entity.version=(existing?.version??0)+1; entity.updatedAt=now(); entity.history=[...(existing?.history??[]),{version:entity.version,kind:entity.kind,...(entity.preferenceDomain?{preferenceDomain:entity.preferenceDomain}:{}),statement:entity.statement,status:entity.status,sourceIds:[...entity.sourceIds],reason,recordedAt:entity.updatedAt}]; break;
    }
    case 'people': {
      str('name',200); str('role',300,false); str('description',10000,false); sourceRefs();
      const portrait=updatePersonPortrait(store,body,existing?.portrait);
      if(portrait) {entity.portrait=portrait;entity.sourceIds=[...new Set([...entity.sourceIds,...portraitSourceIds(portrait)])];}
      break;
    }
    case 'relationships': str('from',100); str('to',100); store.require('people',entity.from); store.require('people',entity.to); if(entity.from===entity.to) throw new HttpError(400,'关系双方不能相同'); str('label',200); str('description',10000,false); sourceRefs(); break;
    case 'events': str('date',10); if(!validLifeDate(entity.date))throw new HttpError(400,'请填写有效的年份、月份或日期','invalid_life_date'); if(value.endDate){str('endDate',10);if(!validLifeDate(entity.endDate)||lifeDateStart(entity.endDate)<lifeDateStart(entity.date))throw new HttpError(400,'结束日期不能早于开始日期','invalid_life_date');} entity.scope=choice(value.scope??'milestone',['milestone','note'],'scope'); str('title',300); str('description',20000,false); str('category',100,false); entity.personIds=refs(store,value.personIds??[],'people','personIds'); sourceRefs(); Object.assign(entity,timelineMedia(store,value)); break;
    case 'goals': {
      str('title',300); str('description',20000,false); entity.status=choice(value.status??'active',['active','done','paused'],'status');
      if(value.dueDate){str('dueDate',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(entity.dueDate)||!validLifeDate(entity.dueDate))throw new HttpError(400,'请选择有效的待办日期','invalid_due_date');}
      entity.listId=text(value.listId||'goal-list-inbox','listId',200);store.require('goalLists',entity.listId);
      entity.flagged=bool(value.flagged??false,'flagged');entity.createdAt=existing?.createdAt??now();entity.updatedAt=now();
      if(entity.status==='done')entity.completedAt=existing?.status==='done'&&existing.completedAt?existing.completedAt:entity.updatedAt;
      sourceRefs();break;
    }
    case 'goalLists': str('name',100);entity.color=choice(value.color??'blue',['blue','orange','red','purple','green','gray'],'color');entity.createdAt=existing?.createdAt??now();entity.updatedAt=now();break;
    case 'agents': if(!existing&&!value.avatarStyle)entity.avatarStyle=defaultAgentAvatarStyle(store);if(value.avatarStyle)entity.avatarStyle=choice(value.avatarStyle,['pixelArt','notionists','openPeeps','lorelei','micah','adventurer','avataaars','bottts','thumbs','shapes'],'avatarStyle');if(existing?.avatarImage&&body.clearAvatar!==true)entity.avatarImage=existing.avatarImage; if(value.connectionId){entity.connectionId=text(value.connectionId,'connectionId',200);store.require('modelConnections',entity.connectionId);} str('name',200); str('role',300,false); str('instructions',30000,false); if(value.sourceUrl) { try{entity.sourceUrl=normalizeAgentSourceUrl(value.sourceUrl);}catch(error){throw new HttpError(400,error instanceof AgentSourceError&&error.code==='source_url_credentials'?'资料链接不能包含用户名或密码':'资料链接必须是有效的 HTTP(S) 地址',error instanceof AgentSourceError?error.code:'invalid_source_url');} } entity.createdAt=existing?.createdAt??now(); break;
    case 'conversations':
      str('title',300); entity.kind=choice(value.kind??'direct',['direct','group'],'kind'); entity.personIds=refs(store,value.personIds??[],'people','personIds');
      if(!Array.isArray(value.messages) || value.messages.length>1000)throw new HttpError(400,'messages 无效');
      entity.messages=value.messages.map(m=>{store.require('people',m.senderId);store.require('sources',m.sourceId);return {id:typeof m.id==='string'?m.id:id('message'),senderId:m.senderId,sourceId:m.sourceId,content:text(m.content,'content',30000),time:m.time&&Number.isFinite(Date.parse(m.time))?m.time:now()};});break;
    case 'automations': {
      str('title',300); str('prompt',30000); entity.enabled=bool(value.enabled??false,'enabled'); entity.trigger=choice(value.trigger,['daily','interval','source_import'],'trigger'); entity.mode=choice(value.mode??'demo',['live','demo'],'mode'); entity.agentIds=refs(store,value.agentIds??[],'agents','agentIds');
      if(entity.trigger==='daily'){str('time',5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(entity.time))throw new HttpError(400,'time 应为本机时间 HH:mm');}
      if(entity.trigger==='interval'){const n=value.intervalMinutes;if(!Number.isFinite(n)||n<1||n>525600)throw new HttpError(400,'间隔应为 1–525600 分钟');entity.intervalMinutes=n;}
      entity.nextRunAt=entity.enabled && entity.trigger!=='source_import' ? nextRunAt(entity) : undefined;
      if(existing){entity.lastRunAt=existing.lastRunAt;entity.lastTaskId=existing.lastTaskId;} break;
    }
    default: throw new HttpError(405,'此记录不支持通用编辑');
  }
  return entity;
}
export function nextRunAt(automation, from=new Date()) {
  if(automation.trigger==='interval') return new Date(from.getTime()+automation.intervalMinutes*60000).toISOString();
  if(automation.trigger==='daily'){const [h,m]=automation.time.split(':').map(Number);const d=new Date(from);d.setHours(h,m,0,0);if(d<=from)d.setDate(d.getDate()+1);return d.toISOString();}
  return undefined;
}
export function createTask(store, body) {
  const {content:prompt,attachmentIds}=messageInput(store,body.prompt,body.attachmentIds),stamp=now(),projectId=projectReference(store,body.projectId,{runnable:true});
  const connectionId=body.connectionId?text(body.connectionId,'connectionId',200):undefined;if(connectionId)store.require('modelConnections',connectionId);
  const digitalTwinEnabled=body.digitalTwinEnabled===undefined?undefined:bool(body.digitalTwinEnabled,'digitalTwinEnabled');
  const connectorIds=body.connectorIds===undefined?undefined:connectorSelection(store,body.connectorIds);
  const contextRequest=body.contextRequest===undefined?undefined:normalizeContextRequest(body.contextRequest);
  const title=body.title!==undefined?text(body.title,'title',300):chatTitle(prompt,prompt?'新对话':store.require('attachments',attachmentIds[0]).name);
  return store.put('tasks',{...(contextRequest?{contextRequest}:{}),...(digitalTwinEnabled===undefined?{}:{digitalTwinEnabled}),...(connectorIds===undefined?{}:{connectorIds}),...(projectId?{projectId}:{}),...(connectionId?{connectionId}:{}),id:id('task'),title,prompt,agentIds:refs(store,body.agentIds??[],'agents','agentIds'),contextFactIds:refs(store,body.contextFactIds??[],'facts','contextFactIds'),mode:choice(body.mode,['live','demo'],'mode'),status:'queued',createdAt:stamp,updatedAt:stamp,messages:[{id:id('message'),role:'user',content:prompt,...(attachmentIds.length?{attachmentIds}:{}),createdAt:stamp}],events:[{id:id('event'),type:'created',label:body.mode==='demo'?'本地流程演示已建立':'任务已建立',createdAt:stamp}],artifactIds:[],approvals:[]});
}
export function assertDeletable(store,collection,key) {
  const targets=[];
  if(collection==='people'&&store.meta('profile').selfPersonId===key)throw new HttpError(409,'此人物是当前空间的本人，请先修改个人身份关联。','profile_person_in_use');
  if(collection==='goalLists'&&key==='goal-list-inbox')throw new HttpError(409,'默认提醒事项清单需要保留','default_goal_list');
  if(collection==='goalLists'&&store.list('goals').some(goal=>(goal.listId||'goal-list-inbox')===key))targets.push('goals');
  if(collection==='sources') for(const c of ['facts','people','relationships','events','goals']) if(store.list(c).some(e=>e.sourceIds?.includes(key)))targets.push(c);
  if(collection==='sources' && store.list('conversations').some(c=>c.messages.some(m=>m.sourceId===key||m.sourceIds?.includes(key))))targets.push('conversations');
  if(collection==='people') for(const c of ['relationships','events','conversations']) if(store.list(c).some(e=>e.from===key||e.to===key||e.personIds?.includes(key)))targets.push(c);
  if(collection==='facts' && store.list('tasks').some(t=>t.contextFactIds.includes(key)))targets.push('tasks');
  if(collection==='agents') for(const c of ['tasks','automations','agentRooms'])if(store.list(c).some(e=>e.agentIds.includes(key)))targets.push(c);
  if(collection==='tasks' && store.list('agentRooms').some(room=>room.taskIds.includes(key)))targets.push('agentRooms');
  if(collection==='attachments' && store.list('events').some(event=>event.attachmentIds?.includes(key)))targets.push('events');
  if(['sources','facts','tasks','artifacts'].includes(collection)&&store.list('taskFeedback').some(record=>collection==='sources'?record.sourceId===key:collection==='facts'?record.factId===key:collection==='tasks'?record.taskId===key:record.original.artifact?.id===key||record.adoption?.artifact?.id===key))targets.push('taskFeedback');
  if(targets.length)throw new HttpError(409,'记录仍被引用，请先修改关联记录','record_in_use');
}
