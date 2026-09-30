import { teamConfiguration, assertTeamProvider } from './team-runs.mjs';
import { approvalMode } from './execution-settings.mjs';
import { connectorSelection } from './connectors.mjs';
import { HttpError, id, now } from './store.mjs';
import { text, choice, bool, refs, createTask, addEvent } from './domain.mjs';
import { projectReference } from './projects.mjs';
import { messageInput } from './attachments.mjs';

const pending = new Set(['queued','running','awaiting_approval','needs_input']);
export function activeRoomTask(store, room) {
  const task=room.activeTaskId ? store.get('tasks',room.activeTaskId) : undefined;
  return task && pending.has(task.status) ? task : undefined;
}
export function createRoom(store, body, existing) {
  const active=existing&&activeRoomTask(store,existing);
  const configurationOnly=Object.keys(body).length>0&&Object.keys(body).every(key=>['mode','digitalTwinEnabled','connectorIds','approvalMode'].includes(key));
  if(active&&(!configurationOnly||!['queued','needs_input'].includes(active.status)))throw new HttpError(409,'会话还有待处理任务，请先处理审批、补充要求或停止任务。','room_busy');
  const v={...existing,...body}, agentIds=refs(store,v.agentIds??[],'agents','agentIds');
  if(body.archived!==undefined&&typeof body.archived!=='boolean')throw new HttpError(400,'archived 必须为布尔值。');
  const digitalTwinEnabled=v.digitalTwinEnabled===undefined?undefined:bool(v.digitalTwinEnabled,'digitalTwinEnabled');
  const connectorIds=v.connectorIds===undefined?undefined:connectorSelection(store,v.connectorIds);
  const kind=choice(v.kind??(agentIds.length>1?'group':'direct'),['direct','group'],'kind');
  if(kind==='direct' ? agentIds.length!==1 : agentIds.length<2||agentIds.length>12)throw new HttpError(400,'私聊需选择 1 个 Agent，群聊需选择 2–12 个 Agent。');
  const team=teamConfiguration(v.team,agentIds,kind);
  const stamp=now(),projectId=projectReference(store,v.projectId);
  const lastTask=existing?.taskIds.at(-1)?store.get('tasks',existing.taskIds.at(-1)):undefined;
  if(existing&&lastTask?.status==='interrupted'&&projectId!==existing.projectId)throw new HttpError(409,'这段会话有中断的任务，继续时沿用原项目。请新建会话使用另一项目。','room_project_fixed');
  return store.put('agentRooms',{...(team?{team}:{}),...(v.approvalMode===undefined?{}:{approvalMode:approvalMode(v.approvalMode,{nullable:true})}),...(digitalTwinEnabled===undefined?{}:{digitalTwinEnabled}),...(connectorIds===undefined?{}:{connectorIds}),...(projectId?{projectId}:{}),id:existing?.id??id('room'),...(v.archived!==undefined?{archived:v.archived}:{}),title:text(v.title??agentIds.map(key=>store.require('agents',key).name).join('、'),'title',300),kind,agentIds,mode:choice(v.mode??'demo',['demo','live'],'mode'),createdAt:existing?.createdAt??stamp,updatedAt:stamp,messages:existing?.messages??[],taskIds:existing?.taskIds??[],...(existing?.activeTaskId?{activeTaskId:existing.activeTaskId}:{}),...(existing?.demo?{demo:true}:{})});
}
export function syncRoomTask(store, task) {
  if(!task.roomId)return;
  const room=store.get('agentRooms',task.roomId);if(!room)return;
  if(!room.taskIds.includes(task.id))room.taskIds.push(task.id);
  const existing=new Set(room.messages.filter(m=>m.taskId===task.id).map(m=>m.taskMessageId));
  for(const m of task.messages)if(!existing.has(m.id))room.messages.push({id:`room-${m.id}`,role:m.role,content:m.content,createdAt:m.createdAt,agentId:m.agentId,taskId:task.id,taskMessageId:m.id,...(m.attachmentIds?.length?{attachmentIds:m.attachmentIds}:{}),...(m.recipientIds?{recipientIds:m.recipientIds}:{}),...(m.replyToMessageId?{replyToMessageId:m.replyToMessageId}:{}),demo:task.mode==='demo'});
  if(pending.has(task.status))room.activeTaskId=task.id;
  else if(room.activeTaskId===task.id)delete room.activeTaskId;
  room.updatedAt=task.updatedAt;
  store.put('agentRooms',room);
}
export function roomTask(store, runner, roomId, body, {send=false}={}) {
  const room=store.require('agentRooms',roomId);
  if(activeRoomTask(store,room))throw new HttpError(409,'会话已有待处理任务。请在原任务中补充、处理审批或停止后再发送。','room_busy');
  if(room.team && (send || body.run===true)) {
    if(room.mode!=='live')throw new HttpError(409,'团队调度需要真实模型连接，示例不会伪造执行。','team_live_required');
    assertTeamProvider(store.connection(store.require('agents',room.team.leadAgentId).connectionId));
  }
  const {content:prompt,attachmentIds}=messageInput(store,send?body.content:body.prompt,body.attachmentIds);
  const recipientIds=refs(store,body.recipientIds??[],'agents','recipientIds');
  if(recipientIds.some(key=>!room.agentIds.includes(key)))throw new HttpError(400,'只能 @ 当前群聊中的成员。','invalid_room_recipient');
  const replyId=body.replyToMessageId==null?undefined:text(body.replyToMessageId,'replyToMessageId',200);
  const reply=replyId?room.messages.find(message=>message.id===replyId):undefined;
  if(replyId&&!reply)throw new HttpError(400,'引用的消息不在当前会话中。','invalid_room_reply');
  let task;
  store.transaction(()=>{
    task=createTask(store,{approvalMode:body.approvalMode===undefined?room.approvalMode:body.approvalMode,digitalTwinEnabled:body.digitalTwinEnabled===undefined?room.digitalTwinEnabled:body.digitalTwinEnabled,connectorIds:body.connectorIds===undefined?room.connectorIds:body.connectorIds,projectId:room.projectId,prompt,attachmentIds,agentIds:room.team?room.agentIds:recipientIds.length?recipientIds:room.agentIds,contextFactIds:body.contextFactIds??[],mode:room.mode});
    if(room.team)task.team={...room.team};
    task.roomId=room.id;task.interaction=send?'chat':'task';
    if(recipientIds.length){task.recipientIds=recipientIds;task.messages[0].recipientIds=recipientIds;}
    if(reply){task.messages[0].replyToMessageId=reply.id;task.replyContext={id:reply.id,role:reply.role,agentId:reply.agentId,content:reply.content.slice(0,6000),...(reply.attachmentIds?.length?{attachmentIds:reply.attachmentIds}:{}),truncated:reply.content.length>6000};}
    // A bounded snapshot is context only; later membership changes cannot rewrite this run.
    let budget=16000;const context=[];
    for(const m of [...room.messages].reverse().slice(0,30)){if(budget<=0)break;const content=m.content.slice(0,Math.min(3000,budget));budget-=content.length;context.unshift({role:m.role,agentId:m.agentId,content,...(m.attachmentIds?.length?{attachmentIds:m.attachmentIds}:{}),demo:!!m.demo});}
    task.roomContext=context;
    addEvent(task,'room','来自 Agent 会话',JSON.stringify({roomId:room.id,kind:room.kind,agentIds:room.agentIds}));
    store.put('tasks',task);syncRoomTask(store,task);
  });
  if(send || body.run===true)task=runner.start(task.id);
  return {room:store.require('agentRooms',roomId),task};
}
