import {CollaborationEvent} from './Collaboration';
import {WorkflowProgramDetails} from './WorkflowProgram';
import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {LoadingIndicator} from '@openai/apps-sdk-ui/components/Indicator';
import {ChevronRight,ChevronLeft,ChevronDown,Check,CloseBold,CheckCircle,Clock,Document,Code,Stop,ArrowUpRight,Expand,SavedXs} from '@openai/apps-sdk-ui/components/Icon';
import type {Bootstrap,Task,TeamRun,TeamWorkflowStage,AgentProfile,TaskStatus} from '../../shared/contracts';
import type {WorkflowPlan} from '../../shared/team-run-types';
import {ErrorNotice,TaskBadge} from '../components';
import {write,messageOf} from '../api';
import {t} from '../i18n';
import {AgentAvatar} from './AgentIdentity';
import {ProviderMark} from '../models/providers';
import {WorkflowModelSelect} from './WorkflowModels';
import {workflowStages,stageStatus,latestStageNode,workflowModel,type WorkflowSelection} from './workflowModel';
import {workflowTimeline,STATION_WIDTH,STATION_PITCH,MARK_X} from './workflowTimeline';
import {taskLabels} from '../components';
import './workflow.css';
import './workflow-card.css';

export function WorkflowGlyph(){return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="2.5" y="2.5" width="5" height="5" rx="1.2"/><rect x="12.5" y="12.5" width="5" height="5" rx="1.2"/><path d="M5 7.5v5a2.5 2.5 0 0 0 2.5 2.5h5M7.5 5h5A2.5 2.5 0 0 1 15 7.5v5"/></svg>;}
export function WorkflowState({status}:{status:TaskStatus}){return <span className="workflow-state-icon" data-status={status} aria-hidden="true">{status==='completed'?<Check/>:status==='running'?<LoadingIndicator size={12}/>:status==='awaiting_approval'?<Clock/>:status==='failed'?<span>!</span>:<span className="workflow-state-dot"/>}</span>;}
export function WorkflowConcurrency({value,onChange,disabled}:{value:number;onChange:(value:number)=>void;disabled?:boolean}){
  return <div className="workflow-concurrency"><span>{t('最多','Up to')}</span><Button size="sm" color="secondary" variant="ghost" uniform disabled={disabled||value<=1} aria-label={t('减少并发','Decrease concurrency')} onClick={()=>onChange(value-1)}>−</Button><strong aria-live="polite">{value}</strong><Button size="sm" color="secondary" variant="ghost" uniform disabled={disabled||value>=4} aria-label={t('增加并发','Increase concurrency')} onClick={()=>onChange(value+1)}>+</Button><span>{t('位成员同时运行','members at once')}</span></div>;
}
/** SecondU's reviewed dependency drawing; the run card and inspector share it. */
export function WorkflowDiagram({stages,agents,run,task,data,onDetails,collapsed=false}:{stages:TeamWorkflowStage[];agents:AgentProfile[];run?:TeamRun;task?:Task;data?:Bootstrap;onDetails?:(selection?:WorkflowSelection)=>void;collapsed?:boolean}){
  const scroll=useRef<HTMLDivElement>(null),diagramId=useId();
  const [available,setAvailable]=useState(0),[position,setPosition]=useState(0),[focused,setFocused]=useState<string>(),[expandedStages,setExpandedStages]=useState<Record<string,boolean>>({});
  useLayoutEffect(()=>{
    const element=scroll.current;if(!element)return;
    const measure=()=>setAvailable(element.clientWidth);measure();
    const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
  },[]);
  const layout=workflowTimeline(stages),width=layout.width,overflow=available>0&&width>available+1;
  const planned=task?.workflowPlans?.some(plan=>plan.runId===run?.id&&plan.status==='pending');
  const running=stages.findIndex(stage=>run&&['running','awaiting_approval'].includes(stageStatus(run,stage)));
  useEffect(()=>{
    if(running<0||!scroll.current)return;
    scroll.current.scrollTo({left:Math.max(0,running*STATION_PITCH-(scroll.current.clientWidth-STATION_WIDTH)/2),behavior:'auto'});
  },[running,run?.id]);
  const hiddenBefore=layout.stations.filter(station=>station.x+MARK_X<position),hiddenAfter=layout.stations.filter(station=>station.x+MARK_X>position+available-8);
  const locate=(index:number)=>scroll.current?.scrollTo({left:Math.max(0,index*STATION_PITCH-(available-STATION_WIDTH)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  const shift=(direction:number)=>scroll.current?.scrollBy({left:STATION_PITCH*direction,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  return <div className="workflow-plan-graph" data-overflow={overflow} data-collapsed={collapsed} hidden={collapsed}>
    <div className="workflow-graph-toolbar"><span>{t('阶段与分工','Stages and assignments')}</span>{overflow&&<span>{t('横向查看全部阶段','Scroll to see all phases')}</span>}</div>
    {overflow&&[hiddenBefore,hiddenAfter].map((hidden,side)=>hidden.length>0&&<div key={side} className="workflow-timeline-ledge" data-side={side===0?'left':'right'} style={{top:24+layout.captionTop-12}}>{side===0&&hidden.length>3&&<small>+{hidden.length-3}</small>}{(side===0?hidden.slice(-3):hidden.slice(0,3)).map(station=><button type="button" key={station.stage.id} aria-label={`${station.stage.title}：${taskLabels[run?stageStatus(run,station.stage):'queued']}`} title={station.stage.title} onClick={()=>locate(stages.indexOf(station.stage))}><WorkflowState status={run?stageStatus(run,station.stage):'queued'}/></button>)}{side===1&&hidden.length>3&&<small>+{hidden.length-3}</small>}</div>)}
    <div ref={scroll} className="workflow-diagram-scroll" tabIndex={overflow?0:undefined} role="region" aria-label={t('工作流阶段与依赖，可横向滚动','Workflow stages and dependencies, scroll horizontally')} onScroll={event=>setPosition(event.currentTarget.scrollLeft)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();shift(event.key==='ArrowLeft'?-1:1);}}}>
      <div className="workflow-diagram" style={{width,gridAutoColumns:STATION_PITCH,paddingTop:layout.captionTop}}>
        <svg className="workflow-edges" width={width} height={layout.captionTop+4} aria-hidden="true">
          <defs><marker id={`${diagramId}-arrow`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L5 4L1 7"/></marker></defs>
          {layout.edges.map(edge=><path key={`${edge.from}-${edge.to}`} className="workflow-dependency" data-emphasis={focused?(focused===stages[edge.from].id||focused===stages[edge.to].id?'strong':'quiet'):undefined} d={edge.path} markerEnd={`url(#${diagramId}-arrow)`}/>)}
          {layout.stations.filter(station=>station.track>0).map(station=><path key={station.stage.id} className="workflow-stage-leader" d={`M${station.x+MARK_X} ${station.y+8}V${layout.captionTop-4}`}/>)}
        </svg>
        {layout.stations.map(({stage,y,track})=>{
          const dependencies=stage.after.map(id=>stages.find(item=>item.id===id)?.title??id).join('；'),status=run?stageStatus(run,stage):'queued';
          const members=stage.agentIds.flatMap(id=>{
            const instances=run?.nodes.filter(node=>node.kind==='worker'&&node.stageId===stage.id&&node.agentId===id)??[];
            return (instances.length?instances:[undefined]).map(node=>({id,node}));
          });
          return <div className="workflow-diagram-stage" key={stage.id} data-stage-id={stage.id} data-status={status} data-track={track} onMouseEnter={()=>setFocused(stage.id)} onMouseLeave={()=>setFocused(undefined)} onFocus={()=>setFocused(stage.id)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(undefined);}}>
            <span className="workflow-stage-point" data-status={status} style={{top:y-layout.captionTop-7,left:MARK_X-7}}/>
            <button className="workflow-stage-heading" type="button" onClick={()=>onDetails?.({stageId:stage.id,runId:run?.id})} aria-label={`${stage.title}：${taskLabels[status]}`} title={`${stage.title}：${dependencies?`${t('等待：','After: ')}${dependencies}`:t('可直接开始','Ready to start')}`}><strong>{stage.title||t('任务分工','Assignments')}</strong></button>
            <div className="workflow-diagram-members">{members.slice(0,expandedStages[stage.id]?members.length:3).map(({id,node})=>{
              const agent=agents.find(item=>item.id===id),model=node?.model??(task&&data?workflowModel(task,run,stage,id,data):undefined),name=agent?.name??node?.name??id;
              return <button type="button" key={node?.id??id} onClick={()=>onDetails?.({stageId:stage.id,agentId:id,nodeId:node?.id,runId:run?.id})} className="workflow-member-chip" aria-label={t(`打开 ${name} 的会话记录`,`Open ${name}'s session`)} title={model?.model?`${name}：${model.model}`:name}><AgentAvatar agent={agent??{id,name}} size={20}/><span>{name}</span>{node?<WorkflowState status={node.status}/>:(!run||planned)&&model?.provider?<ProviderMark provider={model.provider} size={13}/>:run?<WorkflowState status="queued"/>:<ChevronRight/>}</button>;
            })}{members.length>3&&<button type="button" className="workflow-more-members" aria-expanded={!!expandedStages[stage.id]} onClick={()=>setExpandedStages(current=>({...current,[stage.id]:!current[stage.id]}))}>{expandedStages[stage.id]?t('收起','Show less'):t(`还有 ${members.length-3} 项`,`+${members.length-3} more`)}<ChevronRight/></button>}</div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

function WorkflowDecisionReceipt({plan}:{plan:WorkflowPlan}){
  const label=plan.status==='confirmed'?t('已确认运行','Confirmed'):plan.status==='revision_requested'?t('已要求修改','Changes requested'):plan.status==='rejected'?t('已选择暂不运行','Declined'):t('确认已中断','Review interrupted');
  return <details className="workflow-decision-receipt"><summary>{plan.status==='confirmed'?<Check/>:plan.status==='rejected'?<CloseBold/>:<Clock/>}<span>{label}</span><small>{plan.title}</small><ChevronDown/></summary>{plan.feedback&&<p>{plan.feedback}</p>}<ol>{plan.team.workflow?.map(stage=><li key={stage.id}>{stage.title}</li>)}</ol>{plan.team.program&&<WorkflowProgramDetails program={plan.team.program}/>}</details>;
}
function WorkflowReview({task,plan,data,onOpen,onRefresh}:{task:Task;plan:WorkflowPlan;data:Bootstrap;onOpen:(selection?:WorkflowSelection)=>void;onRefresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[revising,setRevising]=useState(false),[feedback,setFeedback]=useState(''),[expanded,setExpanded]=useState(false);
  const run=task.teamRuns?.find(item=>item.id===plan.runId),stages=plan.team.workflow??[];
  const inherited=stages.flatMap(stage=>stage.agentIds.map(id=>workflowModel(task,run,stage,id,data,{inherit:true,memberDefault:true})));
  async function update(body:Record<string,unknown>){if(busy)return;setBusy(true);setError('');try{await write(`/tasks/${task.id}/workflow`,{...body,planId:plan.id,revision:plan.revision});await onRefresh();}catch(reason){setError(messageOf(reason));try{await onRefresh();}catch{/* Keep the original actionable error. */}}finally{setBusy(false);}}
  return <section className="workflow-review workflow-review-conversation" aria-label={t('确认工作流','Review workflow')} aria-busy={busy}><div className="workflow-review-body">
    <div className="workflow-review-state">{t('方案已准备好，等你确认','The plan is ready for your review')}</div>
    <header><WorkflowGlyph/><h3>{plan.title}</h3></header>
    <ol className="workflow-review-summary">{stages.map(stage=><li key={stage.id}><span>{stage.title}</span><small>{stage.agentIds.map(id=>data.agents.find(agent=>agent.id===id)?.name??id).join('、')}</small></li>)}</ol>
    {stages.at(-1)?.expectedOutput&&<p className="workflow-review-output">{t('完成后交付：','Deliverable: ')}{stages.at(-1)!.expectedOutput}</p>}
    {plan.team.program&&<details className="workflow-review-inputs"><summary>{t('核对本次材料','Review this run’s inputs')}<ChevronDown/></summary><WorkflowProgramDetails program={plan.team.program}/></details>}
    <button className="workflow-disclosure" type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><ChevronDown/>{t('查看分工与模型','View assignments and models')}</button>
    {expanded&&<div className="workflow-review-details"><div className="workflow-settings"><div className="workflow-model-row"><label htmlFor={`workflow-model-${plan.id}`}>{t('默认模型','Default model')}</label><WorkflowModelSelect id={`workflow-model-${plan.id}`} value={plan.team.defaultConnectionId??'inherit'} onChange={id=>void update({action:'configure',defaultConnectionId:id==='inherit'?null:id})} connections={data.modelConnections} inherited={inherited} disabled={busy}/></div><WorkflowConcurrency value={plan.team.concurrency??4} onChange={concurrency=>void update({action:'configure',concurrency})} disabled={busy}/></div><WorkflowDiagram stages={stages} agents={data.agents} run={run} task={task} data={data} onDetails={onOpen}/><ol className="workflow-plan-outline">{stages.map(stage=><li key={stage.id}><strong>{stage.title}</strong><p>{stage.description}</p>{stage.expectedOutput&&<small>{t('成果：','Output: ')}{stage.expectedOutput}</small>}</li>)}</ol><Button color="secondary" variant="ghost" size="sm" onClick={()=>onOpen()}>{t('在工作区查看','Open workspace')}<ChevronRight/></Button></div>}
    {revising&&<form className="workflow-revision" onSubmit={event=>{event.preventDefault();void update({action:'revise',feedback});}}><label htmlFor={`workflow-feedback-${plan.id}`}>{t('希望怎么调整？','What should change?')}</label><Textarea id={`workflow-feedback-${plan.id}`} autoFocus placeholder={t('说明需要调整的内容','Describe your changes')} value={feedback} onChange={event=>setFeedback(event.target.value)} rows={2} maxLength={6000} disabled={busy}/><div><Button type="submit" size="sm" color="primary" loading={busy} disabled={busy||!feedback.trim()}>{t('提交修改','Submit changes')}</Button><Button type="button" size="sm" color="secondary" variant="ghost" disabled={busy} onClick={()=>setRevising(false)}>{t('返回选择','Back to choices')}</Button></div></form>}
    <ErrorNotice error={error}/></div>{!revising&&<footer><Button size="sm" color="primary" loading={busy} disabled={busy} onClick={()=>void update({action:'confirm'})}>{t('确认运行','Confirm run')}</Button><Button size="sm" color="secondary" variant="outline" disabled={busy} onClick={()=>setRevising(true)}>{t('修改方案','Revise plan')}</Button><Button size="sm" color="secondary" variant="ghost" disabled={busy} onClick={()=>void update({action:'reject'})}>{t('暂不运行','Not now')}</Button></footer>}
  </section>;
}
export function WorkflowCard({task,runId,data,onOpen,onRefresh}:{task:Task;runId?:string;data:Bootstrap;onOpen:(selection?:WorkflowSelection)=>void;onRefresh:()=>Promise<void>;onArtifact?:(id:string)=>void}){
  const run=task.teamRuns?.find(item=>item.id===runId)??task.teamRuns?.at(-1);
  const plan=task.workflowPlans?.find(item=>item.id===run?.workflowPlanId);
  if(!run||!run.workflowPlanId&&!run.nodes.some(node=>node.kind==='worker'))return null;
  const decisions=task.workflowPlans?.filter(item=>item.runId===run.id&&item.status!=='pending')??[];
  return <>{decisions.map(item=><WorkflowDecisionReceipt key={item.id} plan={item}/>)}{plan?.status==='pending'&&task.status==='awaiting_approval'?<WorkflowReview key={plan.id} task={task} plan={plan} data={data} onOpen={onOpen} onRefresh={onRefresh}/>:run.nodes.some(node=>node.kind==='worker')?<CollaborationEvent task={task} run={run} data={data} onOpen={onOpen}/>:null}</>;
}
