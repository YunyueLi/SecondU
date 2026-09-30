import type {Bootstrap,Task} from '../shared/contracts';

export function recentChatEntries(data:Bootstrap,query:string,archived=false){
  const search=query.trim().toLowerCase();
  const allRooms=data.agentRooms||[];
  const roomTaskIds=new Set(allRooms.flatMap(room=>room.taskIds));
  return [
    ...allRooms.filter(room=>search||archived||!room.projectId).map(room=>({id:room.id,title:room.title,date:room.updatedAt,archived:!!room.archived,route:'agents' as const,room,task:data.tasks.find(task=>task.id===(room.activeTaskId||room.taskIds.at(-1)))})),
    ...data.tasks.filter(task=>!roomTaskIds.has(task.id)&&(search||archived||!task.projectId)).map(task=>({id:task.id,title:task.title,date:task.updatedAt,archived:!!task.archived,route:'task' as const,room:undefined,task})),
  ].filter(entry=>entry.archived===archived&&`${entry.title} ${entry.room?.messages.at(-1)?.content||entry.task?.prompt||''}`.toLowerCase().includes(search)).sort((a,b)=>b.date.localeCompare(a.date));
}

/** Routine answers do not get a task outcome label in the chat navigation. */
export function recentChatStatus(task:Task|undefined,_data:Bootstrap){
  return task&&['running','queued','awaiting_approval','needs_input','interrupted','failed'].includes(task.status)?task.status:undefined;
}
