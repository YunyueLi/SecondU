import {createHash} from 'node:crypto';
import {HttpError,id,now} from './store.mjs';
import {text,addEvent} from './domain.mjs';
import {messageInput} from './attachments.mjs';
import {resolveApprovalMode} from './execution-settings.mjs';
import {assertTaskExecution} from './execution-policy.mjs';
import {sensitiveWorkspaceContent} from './workspace-files.mjs';
import {syncRoomTask} from './rooms.mjs';

const busy=new Set(['running','awaiting_approval']);
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,structuredClone(value[key])]));
const messageFields=['id','role','content','createdAt','agentId','attachmentIds','recipientIds','replyToMessageId'];
const taskFields=['projectId','connectionId','agentIds','contextFactIds','digitalTwinEnabled','connectorIds','contextRequest','team','interaction','mode'];
const modes=['ask','auto','full'];
function fixedApproval(store,source){
  const current=resolveApprovalMode(store,source),previous=source.resolvedApprovalMode;
  return modes.includes(previous)?modes[Math.min(modes.indexOf(current),modes.indexOf(previous))]:current;
}
function result(store,record,reused){
  const task=store.require('tasks',record.taskId);
  return {task,...(task.roomId?{room:store.require('agentRooms',task.roomId)}:{}),reused,...(record.startError&&['queued','needs_input'].includes(task.status)?{startError:record.startError}:{})};
}

/** Editing creates a separately addressable history branch; originals are immutable. */
export function reviseTaskMessage(store,runner,taskId,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['requestId','messageId','content','run'].includes(key)))throw new HttpError(400,'编辑消息字段无效。','revision_invalid');
  const requestId=text(body.requestId,'请求标识',100),messageId=text(body.messageId,'消息标识',200);
  if(!/^[\w-]{8,100}$/.test(requestId)||body.run!==undefined&&typeof body.run!=='boolean')throw new HttpError(400,'请求标识或执行选项无效。','revision_invalid');
  const content=text(body.content,'编辑后的消息',200000,false),run=body.run===true;
  const fingerprint=createHash('sha256').update(JSON.stringify({messageId,content,run})).digest('hex');
  const receiptId=`message-revision:${taskId}:${requestId}`,receipt=store.get('messageRevisions',receiptId);
  if(receipt){if(receipt.fingerprint!==fingerprint)throw new HttpError(409,'同一编辑请求标识不能用于不同内容。','revision_request_conflict');return result(store,receipt,true);}
  const source=store.require('tasks',taskId);
  if(source.remoteExecution)throw new HttpError(409,'远端任务不能在本机分支重跑，请重新选择执行电脑。','revision_remote_unsupported');
  if(runner.active.has(taskId)||busy.has(source.status))throw new HttpError(409,'请先停止本轮执行，再编辑已发送的消息。','revision_task_active');
  const index=source.messages.findIndex(message=>message.id===messageId&&message.role==='user');
  if(index<0)throw new HttpError(400,'只能编辑当前任务中自己发送的消息。','revision_message_scope');
  const original=source.messages[index],input=messageInput(store,content,original.attachmentIds);
  if(run){
    if(source.mode!=='live')throw new HttpError(409,'示例可以保存编辑预览，实际执行请进入个人空间。','revision_demo_read_only');
    assertTaskExecution(runner.executionPolicy,source);
  }
  const originalRoom=source.roomId?store.require('agentRooms',source.roomId):undefined;
  const roomIndex=originalRoom?.messages.findIndex(message=>message.taskId===taskId&&message.taskMessageId===messageId);
  if(originalRoom&&roomIndex<0)throw new HttpError(409,'原会话没有对应消息，未创建不完整的分支。','revision_room_message_missing');
  const activeRoomTask=originalRoom?.activeTaskId?store.get('tasks',originalRoom.activeTaskId):undefined;
  if(activeRoomTask&&(runner.active.has(activeRoomTask.id)||busy.has(activeRoomTask.status)))throw new HttpError(409,'原会话仍有任务在执行，请先停止再创建分支。','revision_room_active');
  const prefix=source.messages.slice(0,index).map(message=>pick(message,messageFields));
  const roomPrefix=originalRoom?.messages.slice(0,roomIndex).map(message=>pick(message,[...messageFields,'taskId','taskMessageId','demo']))??[];
  const keys=Object.values(store.getKeys()).filter(value=>typeof value==='string');
  if(sensitiveWorkspaceContent(JSON.stringify({content:input.content,prefix,roomPrefix}),keys))throw new HttpError(400,'消息或历史包含凭据信息，未复制到新分支。','revision_sensitive_content');
  const stamp=now(),newId=id('task'),edited={...pick(original,['attachmentIds','recipientIds','replyToMessageId']),id:id('message'),role:'user',content:input.content,createdAt:stamp};
  const task={...pick(source,taskFields),id:newId,title:source.title,prompt:prefix.find(message=>message.role==='user')?.content??input.content,approvalMode:fixedApproval(store,source),status:'queued',createdAt:stamp,updatedAt:stamp,messages:[...prefix,edited],events:[],artifactIds:[],approvals:[],forkedFrom:{taskId,messageId}};
  // The source snapshot predates this task's conversation. It contains no reply
  // after the edited message and is copied only through known public fields.
  if(source.roomContext)task.roomContext=source.roomContext.map(message=>pick(message,['role','agentId','content','attachmentIds','demo']));
  if(original.replyToMessageId&&source.replyContext?.id===original.replyToMessageId)task.replyContext=pick(source.replyContext,['id','role','agentId','content','attachmentIds','truncated']);
  if(original.recipientIds)task.recipientIds=[...original.recipientIds];
  addEvent(task,'message_revised','已保存编辑分支','原始消息、后续回复和产物仍保留在原版本。');
  let room;
  if(originalRoom){
    const prefixIds=new Set(prefix.map(message=>message.id));
    let roster=source.agentIds;
    try{const recorded=JSON.parse(source.events.find(event=>event.type==='room')?.detail??'{}');if(Array.isArray(recorded.agentIds)&&recorded.agentIds.length&&recorded.agentIds.every(key=>typeof key==='string'&&store.get('agents',key)))roster=recorded.agentIds;}catch{} // Older imports may have no roster event.
    if(!roster.length)roster=originalRoom.agentIds;
    room={...pick(originalRoom,['title','demo']),...pick(source,['mode','projectId','digitalTwinEnabled','connectorIds','team']),agentIds:[...roster],kind:roster.length>1?'group':'direct',approvalMode:task.approvalMode,id:id('room'),createdAt:stamp,updatedAt:stamp,messages:roomPrefix.map(message=>message.taskId===taskId&&prefixIds.has(message.taskMessageId)?{...message,taskId:newId}:message),taskIds:[],forkedFrom:{roomId:originalRoom.id,messageId:originalRoom.messages[roomIndex].id}};
    room.taskIds=[...new Set(room.messages.map(message=>message.taskId).filter(Boolean))];task.roomId=room.id;
  }
  if(sensitiveWorkspaceContent(JSON.stringify({task,room}),keys))throw new HttpError(400,'历史上下文包含凭据信息，未创建分支。','revision_sensitive_content');
  const saved={id:receiptId,taskId:newId,fingerprint,createdAt:stamp};
  store.transaction(()=>{
    if(room)store.put('agentRooms',room);
    store.put('tasks',task);syncRoomTask(store,task);
    source.revisionTaskIds=[...new Set([...(source.revisionTaskIds??[]),newId])];store.put('tasks',source);
    store.put('messageRevisions',saved);
  });
  if(run){
    try{
      const started=runner.start(newId);
      if(started.status==='needs_input')saved.startError={code:'configuration_required',message:started.error??'请补齐运行配置后重试。'};
    }catch(error){
      saved.startError={code:error.code??'revision_start_failed',message:runner.cleanError(error.status?error.message:'分支已保存，运行暂未启动。请检查配置后重试。')};
      runner.mutate(newId,draft=>{draft.error=saved.startError.message;addEvent(draft,'revision_start_failed','分支已保存，等待重新运行',saved.startError.message);});
    }
    store.put('messageRevisions',saved);
  }
  return result(store,saved,false);
}
