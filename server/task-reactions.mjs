import {HttpError,now} from './store.mjs';
import {text} from './domain.mjs';
import {sensitiveWorkspaceContent} from './workspace-files.mjs';

const reasons=['not_helpful','inaccurate','instructions','personal_context','other'];

/** A reply rating is local product feedback, never a new personal fact. */
export function saveTaskReaction(store,taskId,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['messageId','value','reason','comment'].includes(key)))throw new HttpError(400,'答复评价字段无效。','invalid_reaction');
  const messageId=text(body.messageId,'答复标识',200);
  if(!['up','down',null].includes(body.value))throw new HttpError(400,'请选择有效的答复评价。','invalid_reaction');
  if(body.reason!==undefined&&!reasons.includes(body.reason))throw new HttpError(400,'反馈原因无效。','invalid_reaction_reason');
  const comment=body.comment===undefined?'':text(body.comment,'补充反馈',5000,false);
  if(body.value!=='down'&&(body.reason!==undefined||comment))throw new HttpError(400,'只有负面评价可以附带原因。','invalid_reaction_reason');
  if(comment&&sensitiveWorkspaceContent(comment,Object.values(store.getKeys()).filter(value=>typeof value==='string')))throw new HttpError(400,'反馈包含凭据信息，请移除后再保存。','reaction_sensitive_content');
  return store.transaction(()=>{
    const task=store.require('tasks',taskId);
    if(['queued','running','awaiting_approval'].includes(task.status))throw new HttpError(409,'请等本轮结束或停止后再评价。','reaction_task_active');
    const message=task.messages.find(message=>message.id===messageId&&message.role==='assistant');
    if(!message)throw new HttpError(400,'只能评价本次任务的助手答复。','reaction_message_scope');
    if(body.value===null)delete message.reaction;
    else message.reaction={value:body.value,...(body.reason?{reason:body.reason}:{}),...(comment?{comment}:{}),updatedAt:now()};
    task.updatedAt=now();store.put('tasks',task);
    return message;
  });
}
