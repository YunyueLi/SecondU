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
    case 'sources': str('title',300); str('text',200000); entity.text=value.text; entity.kind=choice(value.kind??'note',['note','conversation','document','feedback'],'kind'); entity.demo=existing?.demo??false; entity.createdAt=existing?.createdAt??now(); break;
    case 'facts': {
      str('statement',10000); entity.kind=choice(value.kind??'preference',['preference','value','capability','constraint','identity','decision'],'kind'); entity.status=choice(value.status??'candidate',['confirmed','inferred','candidate','superseded'],'status'); sourceRefs();
      if(existing && body.baseVersion!==existing.version) throw new HttpError(409,'这条认知已更新，请刷新后再修改','version_conflict');
      const reason=text(body.reason??(existing?'用户修正':'用户添加'),'reason',2000);
      entity.version=(existing?.version??0)+1; entity.updatedAt=now(); entity.history=[...(existing?.history??[]),{version:entity.version,kind:entity.kind,statement:entity.statement,status:entity.status,sourceIds:[...entity.sourceIds],reason,recordedAt:entity.updatedAt}]; break;
    }
    case 'people': str('name',200); str('role',300,false); str('description',10000,false); sourceRefs(); break;
    case 'relationships': str('from',100); str('to',100); store.require('people',entity.from); store.require('people',entity.to); if(entity.from===entity.to) throw new HttpError(400,'关系双方不能相同'); str('label',200); str('description',10000,false); sourceRefs(); break;
    case 'events': str('date',50); if(!/^\d{4}-\d{2}-\d{2}$/.test(entity.date) || !Number.isFinite(Date.parse(entity.date))) throw new HttpError(400,'日期格式应为 YYYY-MM-DD'); str('title',300); str('description',20000,false); str('category',100,false); entity.personIds=refs(store,value.personIds??[],'people','personIds'); sourceRefs(); break;
    case 'goals': str('title',300); str('description',20000,false); entity.status=choice(value.status??'active',['active','done','paused'],'status'); if(value.dueDate) str('dueDate',50); sourceRefs(); break;
    case 'agents': str('name',200); str('role',300,false); str('instructions',30000,false); if(value.sourceUrl) { str('sourceUrl',2000); let u;try{u=new URL(entity.sourceUrl);}catch{throw new HttpError(400,'资料链接无效');} if(!['https:','http:'].includes(u.protocol))throw new HttpError(400,'资料链接仅接受 HTTP(S)'); } entity.createdAt=existing?.createdAt??now(); break;
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
  const prompt=text(body.prompt,'prompt',50000), stamp=now();
  return store.put('tasks',{id:id('task'),title:text(body.title??prompt.slice(0,60),'title',300),prompt,agentIds:refs(store,body.agentIds??[],'agents','agentIds'),contextFactIds:refs(store,body.contextFactIds??[],'facts','contextFactIds'),mode:choice(body.mode,['live','demo'],'mode'),status:'queued',createdAt:stamp,updatedAt:stamp,messages:[{id:id('message'),role:'user',content:prompt,createdAt:stamp}],events:[{id:id('event'),type:'created',label:body.mode==='demo'?'本地流程演示已建立':'任务已建立',createdAt:stamp}],artifactIds:[],approvals:[]});
}
export function assertDeletable(store,collection,key) {
  const targets=[];
  if(collection==='sources') for(const c of ['facts','people','relationships','events','goals']) if(store.list(c).some(e=>e.sourceIds?.includes(key)))targets.push(c);
  if(collection==='sources' && store.list('conversations').some(c=>c.messages.some(m=>m.sourceId===key)))targets.push('conversations');
  if(collection==='people') for(const c of ['relationships','events','conversations']) if(store.list(c).some(e=>e.from===key||e.to===key||e.personIds?.includes(key)))targets.push(c);
  if(collection==='facts' && store.list('tasks').some(t=>t.contextFactIds.includes(key)))targets.push('tasks');
  if(collection==='agents') for(const c of ['tasks','automations'])if(store.list(c).some(e=>e.agentIds.includes(key)))targets.push(c);
  if(targets.length)throw new HttpError(409,'记录仍被引用，请先修改关联记录','record_in_use');
}
