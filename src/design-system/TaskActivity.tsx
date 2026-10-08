import { useEffect, useState } from 'react';
import { t, getLocale } from '../i18n';
import type { AgentProfile, Task, TaskEvent, TaskStatus } from '../../shared/contracts';
import { ChevronRight, Code, Search, Document, Sparkles, Clock, CheckCircle, CloseBold, User } from '@openai/apps-sdk-ui/components/Icon';
import { LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator';
import { RichText } from '../components';
import './task-activity.css';
import { activityEventType, visibleTaskEvents } from './taskActivityEvents';
import { buildTaskActivityModel } from './taskActivityModel';
import { activityStatusLabel, activityElapsedLabel, activityEventLabel } from './taskActivityPresentation';

function eventKind(event: TaskEvent) {
  const type = activityEventType(event.type);
  if (['runtime.reasoning_summary', 'runtime.progress', 'progress', 'runtime.message'].includes(type)) return 'progress';
  if (event.activity?.phase === 'failed' || type.includes('failed') || type.includes('error')) return 'error';
  if (event.activity?.phase === 'rejected' || type === 'write_rejected' || type === 'runtime.auto_review' || type.startsWith('approval') || type.startsWith('runtime.approval')) return 'approval';
  if (type.startsWith('runtime.action') || type.startsWith('connector.')) return 'tool';
  if (type === 'context' || type === 'evidence') return 'context';
  if (type.startsWith('team.') || type.startsWith('runtime.collab') || type === 'runtime.subagent_activity') return 'collaboration';
  return 'event';
}

export function TaskEventDetails({ event, rawExpanded = false }: { event: TaskEvent; rawExpanded?: boolean }) {
  const type = activityEventType(event.type);
  if (['runtime.reasoning_summary','runtime.progress','progress','runtime.message'].includes(type)) return <RichText>{event.detail || ''}</RichText>;
  if (type === 'context') {
    try {
      const facts = JSON.parse(event.detail || '[]');
      if (Array.isArray(facts)) return <ul className="activity-context">{facts.map((fact, i)=><li key={fact.id || i}><span>{String(fact.statement || '')}</span><small>{fact.status==='confirmed'?t('已确认', 'Confirmed'):fact.status==='inferred'?t('推断', 'Inferred'):t('待确认', 'Needs confirmation')}</small></li>)}</ul>;
    } catch { /* Preserve legacy evidence as recorded. */ }
  }
  let text = event.detail || '';
  try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Plain tool output remains inspectable. */ }
  if (!text) return <p>{t('这条记录没有附加详情。','No additional detail was recorded.')}</p>;
  if (rawExpanded) return <pre>{text}</pre>;
  return <details className="activity-raw-record"><summary>{event.activity?.kind === 'command' ? t('查看命令与输出','View command and output') : t('查看原始记录','View recorded details')}</summary><pre>{text}</pre></details>;
}

const stateName = (status: TaskStatus | 'unknown') => ({queued:t('等待开始','Queued'),running:t('进行中','Working'),awaiting_approval:t('等待批准','Needs approval'),needs_input:t('需要补充信息','Needs input'),completed:t('已完成','Completed'),failed:t('未完成','Failed'),cancelled:t('已停止','Stopped'),interrupted:t('已中断','Interrupted'),unknown:t('状态待确认','Status unconfirmed')}[status]);

/** A compact entry into the existing workbench, using recorded item lifecycles. */
export function TaskActivity({ task, agents = [], onEvent }: { task: Task; agents?: AgentProfile[]; onEvent?: (event: TaskEvent)=>void }) {
  const [now,setNow]=useState(Date.now);
  const [expanded,setExpanded]=useState(false);
  const model=buildTaskActivityModel(task,now);
  useEffect(()=>{
    if (!model.elapsed.running) return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[model.elapsed.running]);
  const byId = new Map(task.events.map(event => [event.id,event]));
  // A repeated start receipt must not hide a confirmed result for that call.
  const superseded = new Set(model.actions.flatMap(action => {
    const representative = [...action.eventIds].reverse().find(id => {
      const phase = byId.get(id)?.activity?.phase;
      return phase && phase !== 'running';
    }) || action.eventIds.at(-1);
    return action.eventIds.filter(id => id !== representative);
  }));
  const collaborationRecords = new Set(onEvent ? model.collaborators.flatMap(person => person.eventIds) : []);
  const events=visibleTaskEvents(task.events).filter(event=> !superseded.has(event.id) && !(collaborationRecords.has(event.id) && eventKind(event)==='collaboration') && !['context','evidence','runtime.plan'].includes(activityEventType(event.type)));
  const label=activityStatusLabel(model), elapsed=activityElapsedLabel(model.elapsed);
  const reviewBlocked=!!model.review&&['running','rejected','failed','cancelled'].includes(model.review.status)&&!model.activeActions.length;
  const running=model.status==='running'&&!model.stopping&&!model.remote?.unconfirmed&&!reviewBlocked;
  const hasDetails=!!(events.length||model.plan?.steps.length||model.collaborators.length);
  if (model.status==='completed'&&!hasDetails&&model.elapsed.milliseconds===null) return null;
  const icon=running?<LoadingIndicator size={14} strokeWidth={1.5}/>:model.status==='completed'?<CheckCircle/>:['failed','cancelled','interrupted'].includes(model.status)?<CloseBold/>:model.status==='needs_input'?<User/>:<Clock/>;
  const summary=<><span className="activity-status-icon" aria-hidden="true">{icon}</span><span className="activity-label" aria-live="polite">{t(label.zh,label.en)}</span>{elapsed&&<span className="activity-duration" aria-live="off" title={t('本轮执行的经过时间，包含等待批准的时间。','Elapsed time for this turn, including approval waits.')}>{t(elapsed.zh,elapsed.en)}</span>}{hasDetails&&<ChevronRight className="activity-chevron"/>}</>;
  if (!hasDetails) return <div className={`task-activity task-activity-pending is-${model.status}`}><div className="activity-summary">{summary}</div></div>;
  return <details className={`task-activity is-${model.status}`} open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary className="activity-summary">{summary}</summary>
    <div className="activity-overview">
      {model.remote?.unconfirmed&&<p className="activity-notice">{t('远端状态尚未确认；这不表示任务已经停止。','The remote state is unconfirmed; this does not mean the task has stopped.')}</p>}
      {model.plan&&model.plan.steps.length>0&&<details className="activity-plan"><summary>{t('计划','Plan')}<span>{model.plan.steps.filter(step=>step.status==='completed').length}/{model.plan.steps.length}</span><ChevronRight/></summary><ol>{model.plan.steps.map((step,index)=><li key={`${index}:${step.text}`} data-step-status={step.status}><span className="activity-plan-marker">{step.status==='completed'?<CheckCircle/>:<Clock/>}</span><span>{step.text}</span><small>{step.status==='completed'?t('已完成','Done'):step.status==='pending'?t('待开始','Pending'):step.status==='unknown'||model.remote?.unconfirmed?t('状态待确认','Unconfirmed'):running?t('进行中','In progress'):model.review?.status==='running'?t('等待操作审查','Awaiting review'):model.status==='awaiting_approval'?t('等待批准','Awaiting approval'):model.status==='needs_input'?t('等待补充','Awaiting input'):t('未完成','Not completed')}</small></li>)}</ol></details>}
      {model.collaborators.length>0&&<details className="activity-collaborators"><summary>{t('协作','Collaboration')}<span>{t(`${model.collaborators.length} 项`,`${model.collaborators.length} tasks`)}</span><ChevronRight/></summary><ul>{model.collaborators.map((person,index)=><li key={person.id}><span className="activity-event-icon"><User/></span><div>{onEvent&&person.eventIds.length>0?<button type="button" className="activity-collaborator-trigger" onClick={()=>{const source=byId.get(person.eventIds.at(-1)!);if(source)onEvent(source);}}>{agents.find(agent=>agent.id===person.agentId)?.name||(person.name===person.id?t(`协作任务 ${index+1}`,`Collaborative task ${index+1}`):person.name.split('/').filter(Boolean).at(-1)||person.name)}</button>:<span>{agents.find(agent=>agent.id===person.agentId)?.name||(person.name===person.id?t(`协作任务 ${index+1}`,`Collaborative task ${index+1}`):person.name.split('/').filter(Boolean).at(-1)||person.name)}</span>}{person.objective&&<p>{person.objective}</p>}</div><small>{stateName(person.status)}</small></li>)}</ul></details>}
      {events.length>0&&<ol className="activity-history">{events.map(event=>{
        const kind=eventKind(event),person=agents.find(agent=>agent.id===event.agentId),eventLabel=activityEventLabel(event);
        const Icon=kind==='progress'?Sparkles:kind==='error'?CloseBold:kind==='tool'?event.activity?.kind==='web_search'?Search:event.activity?.kind==='file_change'?Document:Code:kind==='context'||kind==='collaboration'?User:Clock;
        const content=<><span>{t(eventLabel.zh,eventLabel.en)}</span>{event.detail&&<ChevronRight/>}<time>{new Date(event.createdAt).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'})}</time></>;
        return <li key={event.id} className={`activity-item activity-${kind}`}><span className="activity-event-icon" aria-hidden="true"><Icon/></span>{kind==='progress'?<div className="activity-progress-copy"><RichText>{event.detail||event.label}</RichText></div>:onEvent?<button className="activity-event-trigger" type="button" onClick={()=>onEvent(event)}>{content}</button>:<details><summary className="activity-event-trigger">{content}</summary>{person&&<p className="activity-agent">{person.name}</p>}{event.detail&&<div className="activity-detail"><TaskEventDetails event={event} rawExpanded/></div>}</details>}</li>;
      })}</ol>}
    </div>
  </details>;
}
