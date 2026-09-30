import { useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Folder, Document, Desktop, Agent, ArrowRight, DotsHorizontalMoreMenu, Archive, Edit } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap, Task } from '../shared/contracts';
import type { WorkbenchTab } from './TaskWorkbench';
import { taskResources, type TaskSourceSnapshot } from './taskResourceData';
import { Dialog, Field, ErrorNotice } from './components';
import { write, messageOf } from './api';
import { t } from './i18n';

function ResourcesIcon(){return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="5" r="1.8"/><circle cx="5" cy="12" r="1.8"/><circle cx="5" cy="19" r="1.8"/><path d="M11 5h10M11 12h7M11 19h10"/></svg>;}
export function TaskResources({data,tasks,projectId,agentIds,onOpen,onAgent}:{data:Bootstrap;tasks:Task[];projectId?:string;agentIds:string[];onOpen:(task:Task,tab:WorkbenchTab,artifactId?:string)=>void;onAgent?:(id:string)=>void}){
  const [open,setOpen]=useState(false),[source,setSource]=useState<TaskSourceSnapshot>();
  const trigger=useRef<HTMLButtonElement>(null);
  const resources=taskResources(data,tasks),latest=tasks.at(-1);
  const project=data.projects.find(item=>item.id===projectId);
  const agents=agentIds.flatMap(id=>data.agents.find(item=>item.id===id)||[]);
  function show(task:Task,tab:WorkbenchTab,artifactId?:string){setOpen(false);onOpen(task,tab,artifactId);}
  return <><Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button ref={trigger} data-task-resources-trigger color="secondary" variant="ghost" uniform aria-label={t('任务资料','Task resources')}><ResourcesIcon/></Button></Popover.Trigger><Popover.Content side="bottom" align="end" width={340} minWidth="auto" className="task-resources-popover">
    <section><h3>{t('项目','Project')}</h3>{project?<a className="task-resource-row" href={`#projects/${project.id}`}><Folder/><span>{project.name}</span><ArrowRight/></a>:<p>{t('本次对话未关联项目','No project linked to this chat')}</p>}</section>
    <section><h3>{t('输出文件','Created files')}<span>{resources.files.length}</span></h3>{resources.files.length?resources.files.map(file=><button className="task-resource-row" key={file.id} onClick={()=>{const task=tasks.find(item=>item.id===file.taskId);if(task)show(task,'files',file.id);}}><Document/><span>{file.name}</span><ArrowRight/></button>):<p>{t('还没有生成文件','No files created yet')}</p>}</section>
    <section><h3>{t('参与助理','Participating agents')}<span>{agents.length}</span></h3>{agents.length?agents.map(agent=>onAgent?<button className="task-resource-row" key={agent.id} onClick={()=>{setOpen(false);onAgent(agent.id);}}><Agent/><span>{agent.name}<small>{agent.role}</small></span><ArrowRight/></button>:<div className="task-resource-row" key={agent.id}><Agent/><span>{agent.name}<small>{agent.role}</small></span></div>):<p>SecondU</p>}</section>
    <section><h3>{t('来源与附件','Sources and attachments')}<span>{resources.sources.length+resources.attachments.length}</span></h3>{resources.sources.map(item=><button key={`${item.taskId}:${item.id}`} className="task-resource-row" onClick={()=>{setOpen(false);setSource(item);}}><Document/><span>{item.title}<small>{t('任务保存的来源节选','Source excerpt saved with the task')}</small></span><ArrowRight/></button>)}{resources.attachments.map(item=><a className="task-resource-row" key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><Document/><span>{item.name}</span><ArrowRight/></a>)}{!resources.sources.length&&!resources.attachments.length&&<p>{t('本次对话没有已记录的来源或附件','No recorded sources or attachments in this chat')}</p>}</section>
    {latest&&<footer><Button color="secondary" variant="ghost" size="sm" onClick={()=>show(latest,'activity')}>{t('工作过程','Activity')}</Button><Button color="secondary" variant="ghost" size="sm" onClick={()=>show(latest,'computer')}><Desktop/>{t('执行电脑','Execution computer')}</Button></footer>}
  </Popover.Content></Popover>{source&&<Dialog title={source.title} onClose={()=>{setSource(undefined);requestAnimationFrame(()=>trigger.current?.focus());}} className="task-source-dialog"><p className="secondary">{source.truncated?t('这是本轮使用的来源节选。','This is the excerpt used by this task.'):t('这是任务保存的来源快照。','This source snapshot was saved with the task.')}</p><pre>{source.excerpt}</pre></Dialog>}</>;
}

export function TaskChatActions({task,onRefresh}:{task:Task;onRefresh:()=>Promise<void>}){
  const [editing,setEditing]=useState(false),[title,setTitle]=useState(task.title),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const locked=busy||['running','awaiting_approval','needs_input'].includes(task.status);
  async function save(patch:{title?:string;archived?:boolean}){setBusy(true);setError('');try{await write(`/tasks/${task.id}`,patch,'PUT');await onRefresh();setEditing(false);}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
  return <><Menu><Menu.Trigger><Button color="secondary" variant="ghost" uniform aria-label={t('会话操作','Chat actions')}><DotsHorizontalMoreMenu/></Button></Menu.Trigger><Menu.Content align="end" minWidth={170}><Menu.Item disabled={locked} onSelect={()=>{setTitle(task.title);setEditing(true);}}><Edit/>{t('重命名','Rename')}</Menu.Item><Menu.Item disabled={locked} onSelect={()=>void save({archived:!task.archived})}><Archive/>{task.archived?t('取消归档','Unarchive chat'):t('归档对话','Archive chat')}</Menu.Item></Menu.Content></Menu>{editing&&<Dialog title={t('重命名对话','Rename chat')} className="recent-rename-dialog" onClose={()=>{if(!busy)setEditing(false);}}><form onSubmit={event=>{event.preventDefault();if(title.trim()&&!busy)void save({title:title.trim()});}}><Field label={t('对话名称','Chat name')}><Input autoFocus value={title} onChange={event=>setTitle(event.target.value)} maxLength={300}/></Field><ErrorNotice error={error}/><footer><Button color="primary" type="submit" loading={busy} disabled={!title.trim()||busy}>{t('保存','Save')}</Button></footer></form></Dialog>}{error&&!editing&&<Dialog title={t('会话操作未完成','Chat action failed')} onClose={()=>setError('')}><ErrorNotice error={error}/></Dialog>}</>;
}
