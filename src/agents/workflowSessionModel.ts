import type {Task,TaskEvent,TeamRun,TeamRunNode} from '../../shared/contracts';

export type WorkflowSessionRow = {
  id:string;kind:'message'|'tool'|'summary'|'notice';event:TaskEvent;
  startedAt:string;events:TaskEvent[];interrupted?:boolean;
};

/** A worker can appear in several parallel stages. Its node, not its persona,
 * identifies the conversation. Legacy events are used only when unambiguous. */
export function workflowNodeEvents(task:Task,run:TeamRun,node:TeamRunNode):TaskEvent[]{
  const attempts=[...(node.attempts??[]),node];
  const inWindow=(event:TaskEvent,candidate:TeamRunNode)=>[...(candidate.attempts??[]),candidate].some(attempt=>event.createdAt>=(attempt.startedAt??candidate.createdAt)&&(!attempt.finishedAt||event.createdAt<=attempt.finishedAt));
  return task.events.filter(event=>{
    if(event.teamNodeId)return event.teamNodeId===node.id;
    if(event.agentId!==node.agentId||!attempts.length||!inWindow(event,node))return false;
    const matches=(task.teamRuns??[run]).flatMap(item=>item.nodes).filter(candidate=>candidate.kind==='worker'&&candidate.agentId===node.agentId&&inWindow(event,candidate));
    return matches.length===1&&matches[0].id===node.id;
  });
}

/** Coalesce lifecycle updates without moving a call from its original position.
 * Final answers are read from the worker's transcript, with its saved result as
 * a fallback for runs created before runtime messages were recorded. */
export function workflowSessionRows(task:Task,run:TeamRun,node:TeamRunNode):WorkflowSessionRow[]{
  const rows:WorkflowSessionRow[]=[],calls=new Map<string,WorkflowSessionRow>();
  for(const event of workflowNodeEvents(task,run,node)){
    const type=event.type.startsWith('remote.runtime.')?event.type.slice(7):event.type;
    const kind:WorkflowSessionRow['kind']|undefined=type==='runtime.message'?'message':type==='runtime.reasoning_summary'?'summary':
      event.activity&&event.activity.kind!=='message'||type.startsWith('runtime.action')||['connector.call','connector.result','connector.rejected'].includes(type)?'tool':
      ['runtime.progress','progress'].includes(type)?'message':/(?:error|failed|rejected)$/.test(type)||type.startsWith('approval')||type.startsWith('runtime.approval')?'notice':undefined;
    if(!kind||kind==='message'&&!event.detail?.trim())continue;
    const key=event.activity?.callId&&`${kind}:${event.activity.callId}`;
    const existing=key?calls.get(key):undefined;
    if(existing){existing.event=event;existing.events.push(event);continue;}
    const row:WorkflowSessionRow={id:event.id,kind,event,startedAt:event.createdAt,events:[event]};
    rows.push(row);if(key)calls.set(key,row);
  }
  const final=rows.find(row=>row.kind==='message'&&row.event.activity?.messagePhase==='final_answer');
  if(node.result&&!final&&!rows.some(row=>row.kind==='message'&&row.event.detail===node.result)){
    const event:TaskEvent={id:`${node.id}-saved-answer`,type:'runtime.message',label:node.name,detail:node.result,createdAt:node.finishedAt??node.createdAt,agentId:node.agentId,teamNodeId:node.id,activity:{kind:'message',phase:'completed',messagePhase:'final_answer'}};
    rows.push({id:event.id,kind:'message',event,events:[event],startedAt:event.createdAt});
  }
  if(!['running','queued','awaiting_approval','needs_input'].includes(node.status))for(const row of rows)if(row.kind==='tool'&&row.event.activity?.phase==='running')row.interrupted=true;
  return rows;
}
