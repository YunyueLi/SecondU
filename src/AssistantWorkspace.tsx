import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, Task, Fact } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { ArrowUp, Stop, Plus, User, Agent, Document, ArrowRight, Check, CloseBold, Clock, Sparkles } from '@openai/apps-sdk-ui/components/Icon';
import { ArtifactEditor } from './ArtifactWorkspace';
import { Dialog, Empty, ErrorNotice, TaskBadge, when, Busy, RichText } from './components';
import { write, messageOf } from './api';
import { TaskApproval } from './design-system/TaskApproval';
import { ArtifactCard } from './design-system/ArtifactCard';
import { TaskFeedback } from './cognition/TaskFeedback';

const statusDescription: Partial<Record<Task['status'], string>> = { queued: '任务已保存，等待开始。', needs_input: '补充下面的信息后，可以继续这项工作。', interrupted: '上一次执行已中断。已保存的对话和成果仍在。', cancelled: '任务已停止。你可以补充新要求后继续。' };
export type TaskComposition = { id: string; prompt: string; factIds: string[]; agentIds: string[] };
type ContextFact = Pick<Fact,'id'|'statement'|'status'|'sourceIds'|'version'>;
function taskContext(task: Task, data: Bootstrap): ContextFact[] {
  const event = [...task.events].reverse().find(item => item.type === 'context');
  if (event?.detail) { try { const value: unknown = JSON.parse(event.detail); if (Array.isArray(value)) return value.filter((fact): fact is ContextFact => !!fact && typeof fact.statement === 'string' && typeof fact.id === 'string' && Array.isArray(fact.sourceIds)); } catch { return []; } }
  return task.status === 'queued' ? data.facts.filter(fact => task.contextFactIds.includes(fact.id)) : [];
}
type Props = { data: Bootstrap; taskId?: string; composition?: TaskComposition; onRefresh: () => Promise<void>; onCreateTask: (prompt: string, facts?: string[], agents?: string[], mode?: 'demo'|'live') => Promise<void> };

function ContextPicker({ data, factIds, agentIds, onFacts, onAgents, onClose }: { data: Bootstrap; factIds: string[]; agentIds: string[]; onFacts: (ids: string[]) => void; onAgents: (ids: string[]) => void; onClose: () => void }) {
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids,id];
  return <Dialog title="给这次任务的上下文" onClose={onClose}><p className="secondary">只使用你选中的认识和角色。来源与推断的状态会一并提供给助理。</p><div className="context-picker-section"><h3>关于我的认识</h3>{data.facts.filter(fact => fact.status !== 'superseded').length ? data.facts.filter(fact => fact.status !== 'superseded').map(fact => <div className="check-row" key={fact.id}><Checkbox checked={factIds.includes(fact.id)} onCheckedChange={() => onFacts(toggle(factIds, fact.id))} label={<span>{fact.statement}<small>{fact.status === 'confirmed' ? '已确认' : fact.status === 'inferred' ? '推断' : '待确认'} · {fact.sourceIds.length} 份依据</small></span>} /></div>) : <p className="secondary">还没有可选的认识。可以先在“认识我”中添加。</p>}</div><div className="context-picker-section"><h3>一起参与的 Agents</h3>{data.agents.map(agent => <div className="check-row" key={agent.id}><Checkbox checked={agentIds.includes(agent.id)} onCheckedChange={() => onAgents(toggle(agentIds, agent.id))} label={<span>{agent.name}<small>{agent.role}</small></span>} /></div>)}</div><div className="dialog-actions"><Button color="primary" onClick={onClose}>使用所选内容</Button></div></Dialog>;
}

function ContextFacts({ facts, queued }: { facts: ContextFact[]; queued: boolean }) { return facts.length ? <details className="task-context"><summary>{queued ? '将参考' : '本轮参考了'} {facts.length} 条关于你的认识</summary><ul>{facts.map(fact => <li key={fact.id}>{fact.statement}<small>{fact.status === 'confirmed' ? '已确认' : fact.status === 'inferred' ? '推断' : fact.status === 'superseded' ? '已替代' : '待确认'} · 第 {fact.version} 版 · {fact.sourceIds.length} 份来源</small></li>)}</ul><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#self">检查与纠正<ArrowRight /></ButtonLink></details> : null; }

export function AssistantWorkspace({ data, taskId, composition, onRefresh, onCreateTask }: Props) {
  const task = data.tasks.find(item => item.id === taskId);
  const [prompt, setPrompt] = useState('');
  const promptRevision = useRef(0);
  function replacePrompt(value: string) { promptRevision.current += 1; setPrompt(value); }
  const [mode, setMode] = useState<'demo'|'live'>('demo');
  const [factIds, setFactIds] = useState<string[]>(() => data.facts.filter(fact => fact.status === 'confirmed').map(fact => fact.id));
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [learning, setLearning] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();
  const [artifactOverlay, setArtifactOverlay] = useState(() => matchMedia('(max-width: 1000px)').matches);
  const artifactPaneRef = useRef<HTMLElement>(null);
  const artifactOpenerRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const initialTask = useRef(taskId);
  const working = task?.status === 'running' || task?.status === 'queued';
  const currentMode = task?.mode || mode;
  const configurationMissing = currentMode === 'live' && (!data.settings.hasKey || !data.computer.codexAvailable);
  const artifact = data.artifacts.find(item => item.id === openArtifactId);
  const taskArtifacts = data.artifacts.filter(item => item.taskId === task?.id);
  useEffect(() => {
    const media = matchMedia('(max-width: 1000px)');
    const update = () => setArtifactOverlay(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const pane = artifactPaneRef.current;
    if (!artifact || !artifactOverlay || !pane) return;
    const opener = artifactOpenerRef.current;
    const menuOpen = () => [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].some(el => el.querySelector('[data-state="open"]'));
    const focusable = () => [...pane.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]')].filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'));
    const focusStart = () => (pane.querySelector<HTMLButtonElement>('button[aria-label="关闭成果"]') || pane).focus();
    if (!pane.contains(document.activeElement)) focusStart();
    const keys = (event: KeyboardEvent) => {
      if (menuOpen() || event.defaultPrevented || pane.closest('[inert]')) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        // Reuse the editor's close action so unsaved changes still require confirmation.
        pane.querySelector<HTMLButtonElement>('button[aria-label="关闭成果"]')?.click();
      }
      if (event.key === 'Tab') {
        const elements = focusable(); const first = elements[0]; const last = elements.at(-1);
        if (!first) { event.preventDefault(); pane.focus(); }
        else if (!pane.contains(document.activeElement) || document.activeElement === pane) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (!menuOpen() && !pane.closest('[inert]') && event.target instanceof Node && !pane.contains(event.target)) focusStart();
    };
    document.addEventListener('keydown', keys);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', keys);
      document.removeEventListener('focusin', containFocus);
      if (!pane.isConnected && opener?.isConnected) opener.focus();
    };
  }, [artifact?.id, artifactOverlay]);
  useEffect(() => { if (initialTask.current !== taskId) { replacePrompt(''); setError(''); setOpenArtifactId(undefined); initialTask.current = taskId; } }, [taskId]);
  useEffect(() => { if (composition && !taskId) { replacePrompt(composition.prompt); setFactIds(composition.factIds); setAgentIds(composition.agentIds); setError(''); composerRef.current?.focus(); } }, [composition?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [task?.messages.length, task?.approvals.length]);
  async function send() {
    if (!prompt.trim() || busy || configurationMissing) return;
    const submittedRevision = promptRevision.current;
    setBusy(true); setError('');
    try { if (task) { await write<Task>(`/tasks/${task.id}/message`, { content: prompt.trim() }); await onRefresh(); } else { await onCreateTask(prompt.trim(), factIds, agentIds, mode); } if (promptRevision.current === submittedRevision) replacePrompt(''); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function action(path: string, body?: unknown) {
    if (!task || busy) return;
    setBusy(true); setError('');
    try { await write<Task>(`/tasks/${task.id}/${path}`, body); await onRefresh(); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  function useSuggestion(text: string) { replacePrompt(text); composerRef.current?.focus(); }
  function openArtifact(id: string) { artifactOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpenArtifactId(id); }
  const suggestions = data.profile.demo ? [
    { title: '把想法变成计划', text: '结合我当前的目标和时间约束，为社区声音展做一份可执行的本周计划。标出需要我确认的取舍。' },
    { title: '帮我看清取舍', text: '我想为声音展增加互动装置，但又担心时间不够。请根据你对我的了解，列出两种可行选择和各自代价。' },
    { title: '写一份合作草稿', text: '帮我写一份给合作伙伴的声音展提案草稿。先说明目标、分工与还没有确认的事情，不要代我发送。' },
  ] : [
    {title:'把想法变成计划',text:'根据我当前的目标和时间约束，和我一起制定一份本周计划，标出需要确认的取舍。'},
    {title:'帮我看清取舍',text:'我有一件正在犹豫的事。请先了解我的目标和约束，再帮我比较可行选项。'},
    {title:'一起完成一份草稿',text:'我想一起写一份工作草稿。请先问我希望达成的目的，以及需要提供的材料。'},
  ];
  const composer = <div className="composer-wrap"><ErrorNotice error={error} />{configurationMissing && <Alert color="primary" variant="soft" indicator={false} description={!data.settings.hasKey ? '连接你自己的模型后，就可以开始真实任务。' : '还需要在这台电脑上启用执行环境。'} actions={<ButtonLink as="a" color="secondary" variant="outline" size="sm" href="#settings">前往设置</ButtonLink>} />}
        <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}><Textarea ref={composerRef} variant="soft" aria-label={task ? '补充任务要求' : '向助理说明任务'} placeholder={task ? working ? '补充想法，或告诉我需要调整什么…' : '继续这件事，或补充你的想法…' : '告诉我你想做什么…'} rows={2} maxRows={7} autoResize disabled={busy} value={prompt} onChange={event => replacePrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div className="composer-controls"><div className="row">{!task && <Button type="button" color="secondary" variant="ghost" size="sm" onClick={() => setContextOpen(true)}><Plus />{factIds.length || agentIds.length ? `${factIds.length} 条认识${agentIds.length ? ` · ${agentIds.length} 个角色` : ''}` : '上下文与角色'}</Button>}{!task && <Select block={false} size="sm" variant="ghost" value={mode} onChange={option => setMode(option.value as 'demo'|'live')} options={[{value:'demo',label:'本地演示'},{value:'live',label:'我的模型'}]} />}{task && <span className="composer-mode">{currentMode === 'demo' ? '本地演示' : data.settings.model}</span>}</div><div className="row">{working && <Button type="button" color="secondary" variant="outline" uniform aria-label="停止任务" disabled={busy} onClick={() => action('cancel')}><Stop /></Button>}<Button type="submit" color="primary" uniform size="lg" aria-label={task ? '发送补充要求' : '开始任务'} disabled={!prompt.trim() || busy || configurationMissing} loading={busy}><ArrowUp /></Button></div></div></form><p className="composer-footnote">Enter 发送 · Shift + Enter 换行{currentMode === 'demo' ? ' · 演示不调用模型' : ' · 重要操作会单独请你确认'}</p>
      </div>;
  return <div className={`assistant-workspace ${artifact ? 'with-artifact' : ''} ${task ? 'has-task' : 'is-home'}`}>
    <div className="conversation-pane" inert={!!artifact && artifactOverlay}>
      <div className="conversation-scroll">
        {!task ? <section className="assistant-welcome">
          <div className="welcome-intro"><h1>今天，想一起推进什么？</h1><p>从你的目标、经历和偏好出发。</p></div>
          {composer}
          <div className="suggestion-list">{suggestions.map((item,index) => <Button key={item.title} color="secondary" variant="outline" size="sm" onClick={() => useSuggestion(item.text)}>{index === 0 ? <Clock /> : index === 1 ? <Sparkles /> : <Document />}<span>{item.title}</span></Button>)}</div>
          <div className="home-context">
            <section><header><h2>正在关注</h2><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#life" aria-label="查看当前生活"><ArrowRight /></ButtonLink></header>{data.goals.filter(goal => goal.status === 'active').length ? data.goals.filter(goal => goal.status === 'active').slice(0,2).map(goal => <a className="home-goal" key={goal.id} href="#life"><span className="home-goal-mark"><Clock /></span><span><strong>{goal.title}</strong><small>{goal.description}</small></span><ArrowRight /></a>) : <p className="home-empty">在“当前生活”里，留下你想推进的事。</p>}</section>
            <section><header><h2>从了解你开始</h2><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#self" aria-label="查看个人认知"><ArrowRight /></ButtonLink></header><div className="home-understanding">{data.facts.filter(fact => fact.status === 'confirmed' && fact.kind === 'constraint').slice(0,2).map(fact => <a href="#self" key={fact.id}><span className="knowledge-dot" /><span>{fact.statement}</span></a>)}<a className="home-understanding-more" href="#self">查看与纠正关于你的认识 <ArrowRight /></a></div></section>
          </div>
          {data.tasks.length > 0 && <section className="home-recent"><header><h2>接着上次的事</h2><span>任务和成果都在这里</span></header>{[...data.tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,2).map(item=><a className="home-task" href={`#task/${item.id}`} key={item.id}><span className="home-task-icon"><Document /></span><strong>{item.title}</strong><TaskBadge status={item.status}/><ArrowRight /></a>)}</section>}
          <p className="welcome-note">{data.profile.demo ? '你正在体验虚构示例空间，人物与记录均为演示资料。' : '个人资料保存在本机，由你选择这次任务需要的上下文。'}</p>
        </section> : <div className="task-thread">
          <header className="thread-heading"><div className="row"><TaskBadge status={task.status} /><Badge variant="outline">{task.mode === 'demo' ? '本地流程演示' : '模型任务'}</Badge></div></header>
          {task.mode === 'demo' && <p className="demo-thread-note">这是本地流程演示，未调用模型。对话、审批和成果版本会真实保存在本机。</p>}
          <ContextFacts facts={taskContext(task,data)} queued={task.status === 'queued'} />
          {task.agentIds.length > 0 && <div className="task-agents"><Agent />{task.agentIds.map(id => data.agents.find(agent => agent.id === id)?.name || '未命名角色').join('、')} 参与此任务</div>}
          <div className="messages">{task.messages.map(message => <div className={`message message-${message.role}`} key={message.id}>{message.role !== 'user' && <div className="message-author"><span className="assistant-avatar"><Agent /></span>{message.agentId ? data.agents.find(agent => agent.id === message.agentId)?.name || '助理' : message.role === 'system' ? '任务记录' : 'Hither'}</div>}<RichText className="message-content">{message.content}</RichText>{message.role === 'user' && message.id !== task.messages[0]?.id && <Button color="secondary" variant="ghost" size="sm" onClick={() => setLearning(message.content)}>记为个人反馈</Button>}</div>)}</div>
          {task.events.length > 0 && <details className="activity-details" open={working || task.status === 'awaiting_approval'}><summary><Clock /><span>{working ? '正在推进' : '查看活动记录'} · {task.events.length} 项</span></summary><ol>{task.events.map(event => <li key={event.id}><span className="event-dot" /><div><strong>{event.label}</strong>{event.detail && event.type !== 'context' && (event.type === 'evidence' ? <details><summary>查看本轮来源摘录</summary><pre className="evidence-detail">{event.detail}</pre></details> : <p>{event.detail}</p>)}<small>{when(event.createdAt)}{event.agentId ? ` · ${data.agents.find(agent => agent.id === event.agentId)?.name || 'Agent'}` : ''}</small></div></li>)}</ol></details>}
          {task.approvals.map(approval => <TaskApproval key={approval.id} approval={approval} busy={busy} onDecision={decision => { void action('approval', { approvalId: approval.id, decision }); }} />)}
          {working && <Busy label={task.mode === 'demo' ? '正在运行本地流程…' : '助理正在处理…'} />}
          {task.error && <Alert color="danger" variant="soft" title="这一步没有完成" description={task.error} />}
          {statusDescription[task.status] && <p className="task-state-note">{statusDescription[task.status]}</p>}
          {(task.status === 'queued' || task.status === 'interrupted' || task.status === 'failed') && !configurationMissing && <Button color="secondary" variant="outline" disabled={busy} onClick={() => action('run')}>继续任务<ArrowRight /></Button>}
          {taskArtifacts.length > 0 && <div className="task-artifacts"><h3>这次的成果</h3>{taskArtifacts.map(item => <ArtifactCard key={item.id} artifact={item} onOpen={() => openArtifact(item.id)} />)}</div>}
          <div ref={endRef} />
        </div>}
      </div>
      {task && composer}
    </div>
    {artifact && <aside ref={artifactPaneRef} className="task-artifact-pane" role={artifactOverlay ? 'dialog' : undefined} aria-modal={artifactOverlay ? true : undefined} aria-label={`成果：${artifact.name}`} tabIndex={-1}><ArtifactEditor key={artifact.id} artifact={artifact} compact onRefresh={onRefresh} onClose={() => setOpenArtifactId(undefined)} /></aside>}
    {task && learning !== undefined && <TaskFeedback task={task} feedback={learning} onRefresh={onRefresh} onClose={() => setLearning(undefined)} />}
    {contextOpen && <ContextPicker data={data} factIds={factIds} agentIds={agentIds} onFacts={setFactIds} onAgents={setAgentIds} onClose={() => setContextOpen(false)} />}
    {taskId && !task && <div className="missing-task"><Empty title="找不到这个任务" description="它可能不属于当前本地空间。" action={<ButtonLink as="a" color="primary" href="#assistant">回到助理</ButtonLink>} /></div>}
  </div>;
}
