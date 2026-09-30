import type { Artifact, Task } from '../../shared/contracts';

// A completed model reply is not a completed job. Show a closeout only when
// the record contains work, an explicit task, or something requiring attention.
// Older replies without routing metadata default to a plain conversation;
// their full trace remains available through the message menu.
export function showRoomTaskSummary(task:Task, artifacts:Artifact[],_names:string[]=[]):boolean {
  if(task.status!=='completed'||task.error)return true;
  if(artifacts.some(artifact=>artifact.taskId===task.id&&artifact.classification!=='reply_snapshot')||task.approvals.length)return true;
  if(task.events.some(event=>event.type.startsWith('runtime.action')||event.type.startsWith('approval')||event.type.startsWith('runtime.approval')||/(?:failed|error|warning|conflict)$/.test(event.type)||['artifact_pending','configuration_required','needs_input','runtime.unsupported','write_rejected'].includes(event.type)))return true;
  if(task.interaction==='task')return true;
  // The room sender records chat explicitly; its execution plan distinguishes
  // an in-chat file request from a reply. Do not infer that from message keywords
  // or treat old generic `kind: task` bookkeeping as proof of requested work.
  const plan=task.events.filter(event=>event.type==='turn_plan').at(-1);
  if(task.interaction==='chat'&&plan?.detail){
    try{return JSON.parse(plan.detail)?.conversationOnly===false;}catch{/* Old or incomplete metadata is not evidence of work. */}
  }
  return false;
}

/** Progress needs recorded work; lifecycle bookkeeping alone is just a reply. */
export function showRoomTaskProgress(task:Task, artifacts:Artifact[]):boolean {
  if(artifacts.some(artifact=>artifact.taskId===task.id&&artifact.classification!=='reply_snapshot'))return true;
  if(task.error||task.approvals.length)return true;
  if(task.events.some(event=>event.type.startsWith('runtime.action')||event.type.startsWith('connector.')||event.type.startsWith('approval')||event.type.startsWith('runtime.approval')||event.type==='runtime.plan'&&!!event.detail?.trim()))return true;
  // A resolved configuration error must not turn a later ordinary answer into
  // a completed job. Its old record remains in the workbench reached by menu.
  return task.status!=='completed'&&task.events.some(event=>/(?:failed|error|warning|conflict)$/.test(event.type)||['artifact_pending','configuration_required','needs_input','runtime.unsupported','write_rejected'].includes(event.type));
}
