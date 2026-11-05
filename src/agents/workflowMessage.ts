import type {Artifact,Task,TeamRun,TeamRunNode} from '../../shared/contracts';
/** Render only the exact auto-generated launch message from older saved runs.
 * The stored message and editable source remain untouched. */
export function workflowLaunchText(content:string,task?:Task){
  const prefix='运行已保存工作流：',marker='\n本次参数：';
  if(!task||!content.startsWith(prefix)||!content.includes(marker))return content;
  const program=task.teamRuns?.[0]?.configuration?.program??task.team?.program;
  if(!program)return content;
  const cut=content.indexOf(marker);let args:Record<string,unknown>;
  try{args=JSON.parse(content.slice(cut+marker.length));}catch{return content;}
  if(!args||typeof args!=='object'||Object.keys(args).length!==Object.keys(program.args).length||Object.entries(args).some(([key,value])=>program.args[key]!==value))return content;
  const title=content.slice(prefix.length,cut);
  return `运行「${title}」\n\n`+program.parameters.map(p=>`${p.label}：${typeof args[p.name]==='boolean'?(args[p.name]?'开启':'关闭'):args[p.name]??'未填写'}`).join('；');
}
/** Files have their own inspection controls; internal handoff paths add no value
 * to chat prose. Keep full paths in the original message and operation record. */
export function workflowReplyText(content:string,artifacts:Artifact[]){
  let result=content;
  for(const file of artifacts.filter(f=>f.teamOrigin).sort((a,b)=>b.name.length-a.name.length))result=result.split(file.name).join(file.name.split('/').at(-1)!);
  return result;
}
export function workflowDisplayTitle(task:Task,title?:string){
  const value=title||task.title;
  return task.prompt.startsWith('运行已保存工作流：')&&value.startsWith('运行已保存工作流：')?value.slice('运行已保存工作流：'.length):value;
}

/** Translate only the known generated parameter wrapper; full assignment remains inspectable. */
export function workflowAssignmentText(node:TeamRunNode,run:TeamRun){
  const program=run.configuration?.program;
  if(!program)return node.objective;
  const raw=JSON.stringify(program.args),labels=program.parameters.filter(p=>Object.hasOwn(program.args,p.name)).map(p=>`${p.label}：${typeof program.args[p.name]==='boolean'?(program.args[p.name]?'开启':'关闭'):program.args[p.name]}`).join('；');
  const parameterLine='\n\n流程参数：'+raw;
  if(!node.objective.endsWith(parameterLine))return node.objective;
  let text=node.objective.slice(0,-parameterLine.length);
  if(text.endsWith('\n\n本次脚本输入：'+raw))text=text.slice(0,-('\n\n本次脚本输入：'+raw).length);
  else text=text.replace('本次脚本输入：','本次要求：').replace(raw,labels);
  return text+(labels?'\n\n'+labels:'');
}
