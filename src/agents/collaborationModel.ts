import type {AgentRoomMessage,Task,TeamRun,TeamRunNode} from '../../shared/contracts';
import {workflowSessionRows} from './workflowSessionModel.ts';

export type CollaborationRecord={
  id:string;kind:'assignment'|'message'|'result'|'handoff'|'problem';createdAt:string;
  nodeId:string;agentId:string;recipientId?:string;content:string;
  artifactIds?:string[];truncated?:boolean;
};

/** Project persisted assignments and replies, never manufacture a Bot conversation. */
export function collaborationRecords(task:Task,run:TeamRun):CollaborationRecord[]{
  const records:CollaborationRecord[]=[];
  for(const node of run.nodes.filter(node=>node.kind==='worker')){
    const firstStarted=node.attempts?.[0]?.startedAt??node.createdAt;
    records.push({id:`${node.id}:assignment`,kind:'assignment',createdAt:firstStarted,nodeId:node.id,agentId:run.leadAgentId,recipientId:node.agentId,content:node.objective});
    if(node.inputArtifacts?.length)records.push({id:`${node.id}:handoff`,kind:'handoff',createdAt:node.startedAt??node.createdAt,nodeId:node.id,agentId:node.agentId,content:'',artifactIds:node.inputArtifacts.map(file=>file.artifactId)});
    const rows=workflowSessionRows(task,run,node);
    for(const row of rows){
      if(row.kind!=='message')continue;
      const final=row.event.activity?.messagePhase==='final_answer';
      records.push({id:row.id,kind:final?'result':'message',createdAt:row.event.createdAt,nodeId:node.id,agentId:node.agentId,recipientId:run.leadAgentId,content:row.event.detail??'',...(final?{artifactIds:node.artifacts?.map(file=>file.id),truncated:row.id===`${node.id}-saved-answer`&&node.resultTruncated}:{})});
    }
    if(node.result&&!rows.some(row=>row.kind==='message'&&row.event.activity?.messagePhase==='final_answer'))records.push({id:`${node.id}:result`,kind:'result',createdAt:node.finishedAt??node.createdAt,nodeId:node.id,agentId:node.agentId,recipientId:run.leadAgentId,content:node.result,truncated:node.resultTruncated,artifactIds:node.artifacts?.map(file=>file.id)});
    if(node.error)records.push({id:`${node.id}:problem`,kind:'problem',createdAt:node.finishedAt??node.createdAt,nodeId:node.id,agentId:node.agentId,content:node.error});
  }
  return records.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}

/** Bind each run to its actual initiating user message, including historical runs. */
export function collaborationAnchor(run:TeamRun,messages:AgentRoomMessage[],taskId:string):string|undefined{
  const users=messages.filter(message=>message.taskId===taskId&&message.role==='user');
  const exact=run.inputMessageId&&users.find(message=>message.taskMessageId===run.inputMessageId);
  return exact?exact.id:users.filter(message=>message.createdAt<=run.startedAt).at(-1)?.id??users[0]?.id;
}
export function collaborationMembers(run:TeamRun):TeamRunNode[]{
  return run.nodes.filter((node,index,nodes)=>node.kind==='worker'&&!nodes.slice(0,index).some(prior=>prior.kind==='worker'&&prior.agentId===node.agentId));
}
export function collaborationReply(run:TeamRun,messages:AgentRoomMessage[],taskId:string):string|undefined{
  const nextUser=messages.find(message=>message.taskId===taskId&&message.role==='user'&&message.createdAt>=(run.finishedAt??'\uffff'));
  return messages.filter(message=>message.taskId===taskId&&message.role==='assistant'&&message.createdAt>=run.startedAt&&(!nextUser||message.createdAt<nextUser.createdAt)).at(-1)?.id;
}
