import type {AgentRoomMessage,AgentRoom,Task} from '../../shared/contracts';

/** Identity grouping never merges message content, actions or provenance. */
export function continuesMessage(previous:AgentRoomMessage|undefined,current:AgentRoomMessage,boundary=false){
  if(!previous||boundary||current.role!=='assistant'||previous.role!==current.role||!current.agentId||current.agentId!==previous.agentId||!current.taskId||current.taskId!==previous.taskId||current.demo!==previous.demo)return false;
  if(current.replyToMessageId||previous.replyToMessageId||current.attachmentIds?.length||previous.attachmentIds?.length)return false;
  const a=new Date(previous.createdAt),b=new Date(current.createdAt),gap=b.getTime()-a.getTime();
  return Number.isFinite(gap)&&gap>=0&&gap<=300000&&a.toDateString()===b.toDateString();
}

export function roomAttention(task:Task){
  const status=task.status;
  if(status==='needs_input')return 'input';
  if(status==='failed')return 'failed';
  if(status==='interrupted'||status==='cancelled')return 'stopped';
  if(status==='queued')return 'queued';
  return undefined;
}

export type RoomDisplayMessage=AgentRoomMessage&{progress?:true};
/** Only public message events enter chat. Child tools and reasoning stay in the inspector. */
export function conversationMessages(room:AgentRoom|undefined,tasks:Task[]):RoomDisplayMessage[]{
  if(!room)return [];
  const messages:RoomDisplayMessage[]=[...room.messages];
  for(const task of tasks.filter(item=>room.taskIds.includes(item.id))){
    const updates=new Map<string,RoomDisplayMessage>();
    for(const event of task.events){
      if(event.type!=='runtime.message'||event.activity?.kind!=='message'||event.activity.messagePhase!=='commentary'||!event.detail?.trim()||!event.agentId)continue;
      if(task.team&&event.agentId!==task.team.leadAgentId)continue;
      if(event.teamNodeId&&task.teamRuns?.some(run=>run.nodes.some(node=>node.id===event.teamNodeId&&node.kind==='worker')))continue;
      const key=event.activity.callId??event.id,prior=updates.get(key);
      updates.set(key,{id:prior?.id??`progress-${task.id}-${event.id}`,role:'assistant',content:event.detail,createdAt:prior?.createdAt??event.createdAt,agentId:event.agentId,taskId:task.id,progress:true,demo:task.mode==='demo'});
    }
    messages.push(...updates.values());
  }
  return messages.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
