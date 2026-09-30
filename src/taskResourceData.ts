import type { Bootstrap, Task } from '../shared/contracts';

export type TaskSourceSnapshot={id:string;title:string;excerpt:string;truncated:boolean;taskId:string};
export function taskResources(data:Bootstrap,tasks:Task[]){
  const ids=new Set(tasks.map(task=>task.id));
  const sources:TaskSourceSnapshot[]=[];
  for(const task of tasks){
    // Use the recorded latest-turn evidence, never today's mutable fact links.
    const event=[...task.events].reverse().find(item=>item.type==='evidence');
    try { const evidence=JSON.parse(event?.detail||'null');
      for(const source of Array.isArray(evidence?.sources)?evidence.sources:[]){
        if(typeof source.id!=='string'||typeof source.title!=='string'||typeof source.excerpt!=='string')continue;
        if(!sources.some(item=>item.id===source.id&&item.excerpt===source.excerpt))sources.push({id:source.id,title:source.title,excerpt:source.excerpt,truncated:source.truncated===true,taskId:task.id});
      }
    } catch { /* Invalid legacy evidence is not replaced with current facts. */ }
  }
  const attachments=new Set(tasks.flatMap(task=>task.messages.flatMap(message=>message.attachmentIds||[])));
  return {files:data.artifacts.filter(item=>ids.has(item.taskId)&&item.classification!=='reply_snapshot'),sources,attachments:(data.attachments||[]).filter(item=>attachments.has(item.id))};
}
