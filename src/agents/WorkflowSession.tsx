import {continuesMessage} from './conversationModel';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ChevronLeft,ChevronDown,ChevronRight,Code,Document,Search,Clock,Check,CloseBold,ArrowDown} from '@openai/apps-sdk-ui/components/Icon';
import type {AgentProfile,Task,TaskEvent,TeamRun,TeamRunNode,TeamWorkflowStage} from '../../shared/contracts';
import {RichText,TaskBadge} from '../components';
import {TaskEventDetails} from '../design-system/TaskActivity';
import {activityEventLabel} from '../design-system/taskActivityPresentation';
import {t,getLocale} from '../i18n';
import {AgentAvatar} from './AgentIdentity';
import {WorkflowState} from './WorkflowCard';
import {WorkflowModelBadge} from './WorkflowModels';
import {workflowSessionRows} from './workflowSessionModel';
import type {WorkflowModel} from './workflowModel';
import {WorkflowArtifacts} from './WorkflowArtifacts';
import './conversation-detail.css';
import './workflow-session.css';

/** ZCode's workflow actor pane opens the actor's read-only conversation. This
 * adapter renders SecondU's persisted node events through that same structure. */
export function WorkflowSession({task,run,stage,node,agent,model,onBack,onArtifact,onEvent,artifacts,controls,instances,onSelectNode,backLabel}:{backLabel?:string;
  task:Task;run:TeamRun;stage:TeamWorkflowStage;node?:TeamRunNode;agent:Pick<AgentProfile,'id'|'name'>;model?:WorkflowModel;
  onBack:()=>void;onArtifact?:(id:string)=>void;onEvent?:(event:TaskEvent)=>void;artifacts:Parameters<typeof WorkflowArtifacts>[0]['artifacts'];
  controls?:ReactNode;instances?:TeamRunNode[];onSelectNode?:(id:string)=>void;
}){
  const viewport=useRef<HTMLDivElement>(null),following=useRef(true),[newOutput,setNewOutput]=useState(false);
  const rows=node?workflowSessionRows(task,run,node):[],last=rows.at(-1),active=!!node&&['running','queued','awaiting_approval'].includes(node.status);
  useEffect(()=>{const el=viewport.current;if(!el)return;if(following.current)el.scrollTop=el.scrollHeight;else setNewOutput(true);},[node?.id,rows.length,last?.event.id,last?.event.detail]);
  useEffect(()=>{if(document.activeElement===document.body)viewport.current?.parentElement?.querySelector<HTMLButtonElement>('header button')?.focus({preventScroll:true});},[node?.id]);
  const time=(date:string)=>new Date(date).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const inputs=node?.inputArtifacts??[];
  return <section className="workflow-session" aria-label={`${agent.name}：${t('执行会话','Execution conversation')}`}>
    <header className="workflow-session-header conversation-detail-header"><Button color="secondary" variant="ghost" size="sm" uniform aria-label={backLabel??t('返回工作流','Back to workflow')} onClick={onBack}><ChevronLeft/></Button><AgentAvatar agent={agent} size={26}/><div><strong>{agent.name}</strong><small>{stage.title}</small></div><span className="workflow-session-readonly">{t('只读会话','Read-only')}</span></header>
    <div className="workflow-session-meta">{model&&<WorkflowModelBadge value={model} compact/>}<span/><TaskBadge status={node?.status??'queued'}/></div>
    {controls&&<div className="workflow-session-controls">{controls}</div>}
    {instances&&instances.length>1&&<nav className="workflow-session-instances" aria-label={t('分工执行记录','Assignment executions')}>{instances.map((item,index)=><Button key={item.id} color="secondary" variant="ghost" size="sm" selected={item.id===node?.id} onClick={()=>onSelectNode?.(item.id)}>{t(`第 ${index+1} 次`,`Execution ${index+1}`)}<WorkflowState status={item.status}/></Button>)}</nav>}
    <div ref={viewport} className="workflow-session-scroll" onScroll={event=>{const el=event.currentTarget;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;if(following.current)setNewOutput(false);}}>
      {!node?<div className="workflow-session-empty"><Clock/><h3>{t('尚未开始','Not started yet')}</h3><p>{t('这位成员尚未收到任务。开始执行后，对话和操作会自动显示在这里。','This member has not received an assignment. Its conversation will appear here when work starts.')}</p></div>:<>
        <article className="workflow-session-request"><div className="workflow-session-message-meta"><strong>{t('派发任务','Assignment')}</strong><time>{time(node.createdAt)}</time></div><div className="workflow-session-request-body"><RichText>{stage.description||node.objective}</RichText>{stage.expectedOutput&&<p className="workflow-session-expected">{t('交付要求：','Deliverable: ')}{stage.expectedOutput}</p>}{run.configuration?.program&&<dl>{run.configuration.program.parameters.map(p=><div key={p.name}><dt>{p.label}</dt><dd>{typeof run.configuration!.program!.args[p.name]==='boolean'?(run.configuration!.program!.args[p.name]?t('开启','On'):t('关闭','Off')):String(run.configuration!.program!.args[p.name]??t('未填写','Not supplied'))}</dd></div>)}</dl>}{inputs.length>0&&<div className="workflow-session-inputs">{inputs.map(file=><button type="button" key={file.artifactId} onClick={()=>onArtifact?.(file.artifactId)}><Document/><span>{file.name.split('/').at(-1)}</span><small>v{file.version}</small></button>)}</div>}{node.objective!==(stage.description||node.objective)&&<details><summary><ChevronRight/>{t('完整派发指令','Full assignment')}</summary><pre>{node.objective}</pre></details>}</div></article>
        <div className="workflow-session-transcript" role="log" aria-live="polite" aria-relevant="additions text" aria-label={t('成员对话与操作','Member conversation and operations')}>
          {rows.map((row,index)=>{const event=row.event,label=activityEventLabel(event),phase=row.interrupted?'interrupted':event.activity?.phase,Icon=event.activity?.kind==='file_change'?Document:event.activity?.kind==='web_search'?Search:Code;
            if(row.kind==='message'){const prior=rows[index-1];const continuing=prior?.kind==='message'&&continuesMessage({id:prior.id,role:'assistant',agentId:agent.id,taskId:task.id,createdAt:prior.event.createdAt,content:prior.event.detail??''},{id:row.id,role:'assistant',agentId:agent.id,taskId:task.id,createdAt:event.createdAt,content:event.detail??''});return <article className={`workflow-session-reply${continuing?' is-continuation':''}`} key={row.id}><div className={`workflow-session-message-meta${continuing?' sr-only':''}`}><AgentAvatar agent={agent} size={20}/><strong>{agent.name}</strong><time>{time(event.createdAt)}</time></div><RichText>{event.detail??''}</RichText></article>;}
            if(row.kind==='summary')return <details className="workflow-session-summary" key={row.id}><summary><ChevronRight/>{t('工作摘要','Work summary')}</summary><RichText>{event.detail??''}</RichText></details>;
            if(row.kind==='notice')return <div className="workflow-session-notice" key={row.id}><Clock/><div><strong>{t(label.zh,label.en)}</strong>{event.detail&&<p>{event.detail}</p>}</div></div>;
            return <details className="workflow-session-tool" key={row.id} data-status={phase}><summary><Icon/><span>{t(label.zh,label.en)}</span><time>{time(row.startedAt)}</time>{phase==='running'?<WorkflowState status="running"/>:phase==='failed'||phase==='rejected'?<CloseBold/>:phase==='interrupted'?<Clock/>:<Check/>}<ChevronDown/></summary><div className="workflow-session-tool-body">{row.interrupted&&<p>{t('中断前没有收到这项操作的完成记录。','No completion was recorded before this operation was interrupted.')}</p>}<TaskEventDetails event={event} rawExpanded/>{onEvent&&<button className="workflow-session-source" type="button" onClick={()=>onEvent(event)}>{t('打开操作详情','Open operation details')}<ChevronRight/></button>}</div></details>;
          })}
        </div>
        {node.error&&<p className="workflow-session-error" role="alert">{node.error}</p>}
        {active&&<div className="workflow-session-live"><WorkflowState status={node.status}/><span>{node.status==='awaiting_approval'?t('等待操作确认','Waiting for approval'):node.status==='queued'?t('等待开始','Waiting to start'):t('正在处理任务','Working on the assignment')}</span></div>}
        {!!artifacts.length&&<WorkflowArtifacts artifacts={artifacts} onOpen={onArtifact}/>}
      </>}
    </div>
    {newOutput&&<Button className="workflow-session-new" color="secondary" size="sm" onClick={()=>{following.current=true;setNewOutput(false);viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}><ArrowDown/>{t('查看新进展','View new progress')}</Button>}
  </section>;
}
