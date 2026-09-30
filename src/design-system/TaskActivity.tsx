import { t, getLocale } from '../i18n';
import type { AgentProfile, Task, TaskEvent } from '../../shared/contracts';
import { ChevronRight, Code, Search, Document, Sparkles, Clock, CheckCircle, CloseBold, User } from '@openai/apps-sdk-ui/components/Icon';
import { RichText } from '../components';
import './task-activity.css';
import { visibleTaskEvents } from './taskActivityEvents';

function eventKind(event: TaskEvent) {
  if (event.type === 'runtime.reasoning_summary') return 'reasoning';
  if (event.type.includes('failed') || event.type.includes('error')) return 'error';
  if (event.type.startsWith('runtime.action') || event.type.startsWith('connector.')) return 'tool';
  if (event.type.startsWith('approval') || event.type.startsWith('runtime.approval')) return 'approval';
  if (event.type === 'context' || event.type === 'evidence') return 'context';
  return 'event';
}
export function TaskEventDetails({ event }: { event: TaskEvent }) {
  if (event.type === 'runtime.reasoning_summary') return <RichText>{event.detail || ''}</RichText>;
  if (event.type === 'context') {
    try { const facts = JSON.parse(event.detail || '[]'); if (Array.isArray(facts)) return <ul className="activity-context">{facts.map((fact, i)=><li key={fact.id || i}><span>{String(fact.statement || '')}</span><small>{fact.status==='confirmed'?t("已确认", "Confirmed"):fact.status==='inferred'?t("推断", "Inferred"):t("待确认", "Needs confirmation")}</small></li>)}</ul>; } catch { /* Older events remain inspectable as recorded text. */ }
  }
  let text = event.detail || '';
  try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Plain tool output is already readable. */ }
  return <pre>{text}</pre>;
}

export function TaskActivity({ task, agents = [], onEvent }: { task: Task; agents?: AgentProfile[]; onEvent?: (event: TaskEvent)=>void }) {
  const events=visibleTaskEvents(task.events).filter(event=>event.type!=='context'&&event.type!=='evidence');
  const running=task.status==='running'||task.status==='queued';
  if (!events.length) return null;
  return <details className="task-activity" open={running || undefined}>
    <summary><span className={`activity-status-icon ${running?'is-running':''}`}>{running?<Clock/>:<CheckCircle/>}</span><span>{running?t("正在推进", "In progress"):task.status==='awaiting_approval'?t("等待你的确认", "Waiting for your approval"):t("查看工作过程", "View activity")}</span><ChevronRight className="activity-chevron"/></summary>
    <ol>{events.map((event,index)=>{
      const kind=eventKind(event);const person=agents.find(agent=>agent.id===event.agentId);
      const Icon=kind==='reasoning'?Sparkles:kind==='error'?CloseBold:kind==='tool'?/网页|web|search/i.test(event.label)?Search:/文件|file|document/i.test(event.label)?Document:Code:kind==='context'?User:kind==='approval'?Clock:CheckCircle;
      return <li key={event.id} className={`activity-item activity-${kind} ${running&&index===events.length-1?'is-current':''}`}><span className="activity-event-icon"><Icon/></span><details><summary onClick={onEvent && kind!=='reasoning'?e=>{e.preventDefault();onEvent(event);}:undefined}><span>{event.label}</span>{event.detail&&<ChevronRight/>}<time>{new Date(event.createdAt).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'})}</time></summary>{person&&<p className="activity-agent">{person.name}</p>}{event.detail&&<div className="activity-detail"><TaskEventDetails event={event}/></div>}</details></li>;
    })}</ol>
  </details>;
}
