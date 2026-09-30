import {ConnectorPicker} from './connectors/Connectors';
import {ComposerTools,DigitalTwinMode,ComposerContextBar} from './composer/ComposerTools';
import { useAttachments, AttachmentDrafts, MessageAttachments } from './composer/attachments';
import { pasteComposerLinks } from './composer/composerInput';
import { ProjectPicker } from './ProjectWorkspace';
import { TaskProgress, type WorkbenchTab } from './TaskWorkbench';
import { showRoomTaskSummary } from './agents/roomTaskPresentation';
import { t, getLocale } from './i18n';
import { ComposerSurface } from './composer/ComposerSurface';
import { shouldSend } from './appearance';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Bootstrap, Task, Fact, TaskEvent } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { selectTaskContext, selectDigitalTwinContext } from './contextSelection';
import './composer/personal-context.css';
import { ModelPicker } from './composer/ModelPicker';
import { VoiceInput } from './composer/VoiceInput';
import { WelcomeLettering } from './WelcomeLettering';
import { HitherMark } from './HitherMark';
import { TaskActivity } from './design-system/TaskActivity';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { ArrowUp, Stop, Plus, Folder, User, Agent, Document, ArrowRight, Check, CloseBold, Clock, Sparkles, Desktop } from '@openai/apps-sdk-ui/components/Icon';
import { WorkbenchPanel } from './WorkbenchPanel';
import { TaskResources, TaskChatActions } from './TaskResourceMenu';
import { Dialog, Empty, ErrorNotice, TaskBadge, when, Busy, RichText } from './components';
import { write, messageOf } from './api';
import { TaskApproval } from './design-system/TaskApproval';
import { FeedbackAction } from './cognition/TaskFeedback';
import { ArtifactCard } from './design-system/ArtifactCard';

const getStatusDescription = (): Partial<Record<Task['status'], string>> => ({ queued: t("任务已保存，等待开始。", "Saved and ready to start."), needs_input: t("补充下面的信息后，可以继续这项工作。", "Add the requested information to continue."), interrupted: t("上一次执行已中断。已保存的对话和成果仍在。", "The last run was interrupted. Your saved messages and files are still available."), cancelled: t("任务已停止。你可以补充新要求后继续。", "Stopped. Add instructions whenever you want to continue.") });
export type TaskComposition = { projectId?: string; id: string; prompt: string; factIds?: string[]; agentIds: string[] };
type ContextFact = Pick<Fact,'id'|'statement'|'status'|'sourceIds'|'version'>;
function taskContext(task: Task, data: Bootstrap): ContextFact[] {
  const event = [...task.events].reverse().find(item => item.type === 'context');
  if (event?.detail) { try { const value: unknown = JSON.parse(event.detail); if (Array.isArray(value)) return value.filter((fact): fact is ContextFact => !!fact && typeof fact.statement === 'string' && typeof fact.id === 'string' && Array.isArray(fact.sourceIds)); } catch { return []; } }
  return task.status === 'queued' ? data.facts.filter(fact => task.contextFactIds.includes(fact.id)) : [];
}
type Props = { navigation?:ReactNode; data: Bootstrap; taskId?: string; composition?: TaskComposition; onRefresh: () => Promise<void>; onCreateTask: (prompt: string, facts?: string[], agents?: string[], mode?: 'demo'|'live', connectionId?: string, projectId?: string, attachmentIds?: string[], connectorIds?: string[], digitalTwinEnabled?:boolean) => Promise<void> };

function ContextFacts({ facts, queued }: { facts: ContextFact[]; queued: boolean }) { return facts.length ? <details className="task-context"><summary>{queued ? t("将参考", "Will use") : t("本轮参考了", "Used")} {facts.length} {t("条关于你的认识", "personal context entries")}</summary><ul>{facts.map(fact => <li key={fact.id}>{fact.statement}<small>{fact.status === 'confirmed' ? t("已确认", "Confirmed") : fact.status === 'inferred' ? t("推断", "Inferred") : fact.status === 'superseded' ? t("已替代", "Superseded") : t("待确认", "Unconfirmed")}{t("，第", ", version ")}{fact.version} {t("版，", ", ")}{fact.sourceIds.length} {t("份来源", "sources")}</small></li>)}</ul><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#self">{t("检查与纠正", "Review and correct")}<ArrowRight /></ButtonLink></details> : null; }

export function AssistantWorkspace({ navigation, data, taskId, composition, onRefresh, onCreateTask }: Props) {
  const task = data.tasks.find(item => item.id === taskId);
  const attachments = useAttachments({contextKey:taskId || composition?.id || 'new'});
  const statusDescription=getStatusDescription();
  const [prompt, setPrompt] = useState('');
  const promptRevision = useRef(0);
  function replacePrompt(value: string) { promptRevision.current += 1; setPrompt(value); }
  const [mode, setMode] = useState<'demo'|'live'>('live');
  const [connectionId, setConnectionId] = useState<string>();
  const [connectorIds,setConnectorIds]=useState<string[]>([]);
  const [projectId,setProjectId]=useState<string>();
  const project=(data.projects||[]).find(p=>p.id===(task?task.projectId:projectId));
  const [factIds, setFactIds] = useState<string[]>(() => data.facts.filter(fact => fact.status === 'confirmed').map(fact => fact.id));
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [automaticContext,setAutomaticContext]=useState(true);
  const [digitalTwinEnabled,setDigitalTwinEnabled]=useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [artifactDirty,setArtifactDirty]=useState(false);
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();
  const [workbenchOpen,setWorkbenchOpen]=useState(false);
  const [workbenchTab,setWorkbenchTab]=useState<WorkbenchTab>();
  const [workbenchEventId,setWorkbenchEventId]=useState<string>();
  const [artifactOverlay, setArtifactOverlay] = useState(() => matchMedia('(max-width: 1000px)').matches);
  const artifactPaneRef = useRef<HTMLElement>(null);
  const artifactOpenerRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const initialTask = useRef(taskId);
  const working = task?.status === 'running' || task?.status === 'queued';
  const currentMode = task?.mode || mode;
  const example = !!data.profile.demo || task?.mode === 'demo';
  const currentConnectionId = task ? task.connectionId : connectionId;
  const selectedConnection = currentConnectionId ? data.modelConnections?.find(item=>item.id===currentConnectionId) : data.settings;
  const selectedAgents=(task?.agentIds || agentIds).flatMap(id=>data.agents.find(agent=>agent.id===id)||[]);
  const agentModels=selectedAgents.map(agent=>{const conn=agent.connectionId?data.modelConnections?.find(item=>item.id===agent.connectionId):selectedConnection;return{id:agent.id,name:agent.name,model:conn?.model||t("连接已不可用", "Connection unavailable"),connectionName:agent.connectionId?data.modelConnections?.find(item=>item.id===agent.connectionId)?.name||t("连接已移除", "Connection removed"):currentConnectionId?t("本次任务模型", "Task model"):t("默认连接", "Default connection"),hasKey:!!conn?.hasKey};});
  const modelReady=agentModels.length?agentModels.every(agent=>agent.hasKey):!!selectedConnection?.hasKey;
  const configurationMissing = !example && ((currentMode === 'live' && (!modelReady || !data.computer.codexAvailable)) || (!!project && project.execution.status!=='ready'));
  const artifact = data.artifacts.find(item => item.id === openArtifactId);
  const panelOpen=workbenchOpen&&(!!artifact||!!workbenchTab);
  const showWorkbench=!!task&&showRoomTaskSummary(task,data.artifacts);
  function rememberWorkbenchOpener(){if(panelOpen)return;const active=document.activeElement;artifactOpenerRef.current=active instanceof HTMLElement&&!active.closest('[data-radix-popper-content-wrapper]')?active:document.querySelector<HTMLElement>('[data-task-resources-trigger]');}
  function openWorkbench(tab:WorkbenchTab){rememberWorkbenchOpener();setWorkbenchOpen(true);setWorkbenchTab(tab);if(tab==='activity')setWorkbenchEventId(undefined);}
  function closeWorkbench(){if(artifactDirty&&!window.confirm(t('还有未保存的修改，仍然关闭？','You have unsaved changes. Close anyway?')))return;setWorkbenchOpen(false);requestAnimationFrame(()=>{if(artifactOpenerRef.current?.isConnected)artifactOpenerRef.current.focus();});}
  function openEvent(event:TaskEvent){openWorkbench('activity');setWorkbenchEventId(event.id);}
  const taskArtifacts = data.artifacts.filter(item => item.taskId === task?.id && item.classification !== 'reply_snapshot');
  useEffect(() => {
    const media = matchMedia('(max-width: 1000px)');
    const update = () => setArtifactOverlay(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const pane = artifactPaneRef.current;
    if (!panelOpen || !artifactOverlay || !pane) return;
    const opener = artifactOpenerRef.current;
    const menuOpen = () => [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].some(el => el.querySelector('[data-state="open"]'));
    const focusable = () => [...pane.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]')].filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'));
    const focusStart = () => (pane.querySelector<HTMLButtonElement>('button[data-close-artifact], button[data-close-workbench]') || pane).focus();
    if (!pane.contains(document.activeElement)) focusStart();
    const keys = (event: KeyboardEvent) => {
      if (menuOpen() || event.defaultPrevented || pane.closest('[inert]')) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        // Reuse the editor's close action so unsaved changes still require confirmation.
        pane.querySelector<HTMLButtonElement>('button[data-close-artifact], button[data-close-workbench]')?.click();
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
  }, [artifact?.id, panelOpen, artifactOverlay]);
  useEffect(() => { if (initialTask.current !== taskId) { replacePrompt(''); setError(''); setOpenArtifactId(undefined); setWorkbenchTab(undefined); setWorkbenchOpen(false); initialTask.current = taskId; } }, [taskId]);
  useEffect(() => { if (composition && !taskId) { setProjectId(composition.projectId);setConnectorIds([]);setDigitalTwinEnabled(true); replacePrompt(composition.prompt); setFactIds(composition.factIds??data.facts.filter(f=>f.status==='confirmed').map(f=>f.id));setAutomaticContext(composition.factIds===undefined); setAgentIds(composition.agentIds); setError(''); composerRef.current?.focus(); } }, [composition?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' }); }, [task?.messages.length, task?.approvals.length]);
  async function send() {
    if (example || (!prompt.trim() && !attachments.items.length) || busy || attachments.busy || attachments.hasErrors || configurationMissing) return;
    const submittedRevision = promptRevision.current;
    const submittedAttachments = attachments.items.map(item=>item.id);
    setBusy(true); setError('');
    try { if (task) { await write<Task>(`/tasks/${task.id}/message`, { content: prompt.trim(), attachmentIds:attachments.attachmentIds }); await onRefresh(); } else { await onCreateTask(prompt.trim(), digitalTwinEnabled?(automaticContext?selectDigitalTwinContext(data.facts,prompt):factIds):[], agentIds, mode, connectionId, projectId, attachments.attachmentIds, connectorIds, digitalTwinEnabled); } submittedAttachments.forEach(attachments.remove); if (promptRevision.current === submittedRevision) replacePrompt(''); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function action(path: string, body?: unknown) {
    if (!task || busy || example) return;
    setBusy(true); setError('');
    try { await write<Task>(`/tasks/${task.id}/${path}`, body); await onRefresh(); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  function openArtifact(id?:string){if(id!==openArtifactId&&artifactDirty&&!window.confirm(t('还有未保存的修改，仍然切换？','You have unsaved changes. Switch anyway?')))return;rememberWorkbenchOpener();setWorkbenchTab('files');setWorkbenchOpen(true);setOpenArtifactId(id);}
  const controlsLocked=example||busy||working||task?.status==='awaiting_approval';
  async function updateTaskConfig(body:Record<string,unknown>){if(!task||controlsLocked)return false;setBusy(true);setError('');try{await write(`/tasks/${task.id}`,body,'PUT');await onRefresh();return true;}catch(e){setError(messageOf(e));return false;}finally{setBusy(false);}}
  async function chooseConnection(id:string|undefined){if(task)return updateTaskConfig({connectionId:id||null});setConnectionId(id);setMode('live');}
  async function chooseMode(value:'live'|'demo'){if(task){if(task.mode!==value)return updateTaskConfig({mode:value});return;}setMode(value);}
  const contextTools=<><ConnectorPicker data={data} value={task?.connectorIds||connectorIds} onChange={controlsLocked?undefined:task?ids=>{void updateTaskConfig({connectorIds:ids});}:setConnectorIds} disabled={controlsLocked}/><DigitalTwinMode enabled={task?task.digitalTwinEnabled!==false:digitalTwinEnabled} onChange={controlsLocked?undefined:enabled=>{if(task){void updateTaskConfig({digitalTwinEnabled:enabled});}else{setDigitalTwinEnabled(enabled);setAutomaticContext(true);}}} disabled={controlsLocked}/></>;
  const exampleStories=data.profile.demo?['demo-showcase-task-launch','demo-showcase-task-family','demo-showcase-task-demo-story'].flatMap(id=>data.tasks.find(item=>item.id===id&&!item.archived)||[]):[];
  const compactComposer = !task && !prompt.includes('\n') && prompt.length < 48 && !attachments.items.length;
  const composer = <div className="composer-wrap">
    {task&&showWorkbench&&<TaskProgress task={task} fileCount={taskArtifacts.length} onOpen={openWorkbench} onEvent={openEvent}/>}
    <ErrorNotice error={error}/>
    {configurationMissing&&<Alert color="primary" variant="soft" indicator={false} description={project&&project.execution.status!=='ready'?t('该项目尚未连接执行环境。请选择本地项目。','This project has no connected runtime. Choose a local project.'):!modelReady?t('连接模型后，就可以开始真实任务。','Connect a model to run this task.'):t('还需要在这台电脑上启用执行环境。','Set up the runtime on this computer first.')} actions={<ButtonLink as="a" color="secondary" variant="outline" size="sm" href="#settings">{t('前往设置','Open settings')}</ButtonLink>}/>}
    <ComposerSurface compact={compactComposer} context={!task&&<ComposerContextBar><ProjectPicker data={data} value={projectId} onChange={setProjectId} disabled={busy}/>{contextTools}</ComposerContextBar>} onDragOver={event=>{if(example)event.preventDefault();else attachments.onDragOver(event);}} onDrop={event=>{if(!busy&&!example)attachments.onDrop(event);else event.preventDefault();}} onSubmit={event=>{event.preventDefault();void send();}}>
      <AttachmentDrafts controller={attachments} disabled={busy||example}/>
      <div className="composer-leading"><ComposerTools onAttach={()=>attachments.inputRef.current?.click()} disabled={busy||example}>{task&&contextTools}</ComposerTools></div>
      <div className="composer-input"><Textarea ref={composerRef} variant="soft" aria-label={task?t('补充任务要求','Additional instructions'):t('发送消息','Message SecondU')} placeholder={task?t('继续对话','Message SecondU'):data.profile.demo?t('选择下方的完整案例','Choose a complete story below'):t('询问 SecondU','Ask SecondU')} rows={1} maxRows={7} autoResize disabled={busy} value={prompt} onPaste={event=>{if(example||!attachments.onPaste(event))pasteComposerLinks(event,prompt,replacePrompt);}} onChange={event=>replacePrompt(event.target.value)} onKeyDown={event=>{if(shouldSend(event)){event.preventDefault();void send();}}}/></div>
      <div className="composer-trailing"><ModelPicker example={example} settings={data.settings} connections={data.modelConnections} defaultConnectionId={data.defaultConnectionId} connectionId={currentConnectionId} onConnection={chooseConnection} agentModels={agentModels.length?agentModels:undefined} mode={currentMode} onMode={chooseMode} onSettings={()=>{location.hash='settings/model';}} disabled={controlsLocked}/><VoiceInput disabled={example||busy||working} contextKey={taskId||'new'} onTranscript={text=>{replacePrompt(`${prompt}${prompt&&!/\s$/.test(prompt)?' ':''}${text}`);composerRef.current?.focus();}}/>{working?<Button type="button" color="primary" uniform aria-label={t('停止任务','Stop task')} disabled={busy} onClick={()=>action('cancel')}><Stop/></Button>:<Button type="submit" color="primary" uniform aria-label={task?t('发送补充要求','Send instructions'):t('发送消息','Send message')} disabled={example||(!prompt.trim()&&!attachments.items.length)||busy||attachments.busy||attachments.hasErrors||configurationMissing} loading={busy}><ArrowUp/></Button>}</div>
    </ComposerSurface>

  </div>;
  return <div className={`assistant-workspace ${panelOpen ? 'with-artifact' : ''} ${task ? 'has-task' : 'is-home'}`}>
    <div className="conversation-pane" inert={panelOpen && artifactOverlay}>
      {(task||navigation)&&<header className="conversation-header">{navigation}<h1 title={task?.title}>{task?.title||'SecondU'}</h1>{task&&<div className="conversation-header-actions"><TaskChatActions task={task} onRefresh={onRefresh}/><TaskResources data={data} tasks={[task]} projectId={task.projectId} agentIds={task.agentIds} onOpen={(_task,tab,id)=>id?openArtifact(id):openWorkbench(tab)}/></div>}</header>}
      <div className="conversation-scroll">
        {!task ? <section className="assistant-welcome">
          <div className="welcome-start"><div className="welcome-artwork"><WelcomeLettering /></div><div className="welcome-intro"><h1>{data.profile.demo?t("从哪件事开始看？", "Which story would you like to explore?"):t("今天想做些什么？", "What shall we work on?")}</h1></div>
          {composer}
          {exampleStories.length>0&&<nav className="assistant-example-stories" aria-label={t("完整案例", "Complete stories")}>{exampleStories.map(story=><a key={story.id} href={`#task/${story.id}`}><span>{story.title}</span><ArrowRight/></a>)}</nav>}

          </div></section> : <div className="task-thread">{project&&<a className="task-project-reference" href={`#projects/${project.id}`}><Folder/>{project.name}<ArrowRight/></a>}
          {task.status!=='completed'&&<header className="thread-heading"><TaskBadge status={task.status} /></header>}
          {example && <span className="demo-thread-note">{t("示例", "Example")}</span>}
          {task.interaction==='task' && task.agentIds.length > 1 && <div className="task-agents"><Agent />{task.agentIds.map(id => data.agents.find(agent => agent.id === id)?.name || t("未命名角色", "Unnamed agent")).join('、')} {t("参与此任务", "on this task")}</div>}
          <div className="messages">{task.messages.map((message,index) => {
            const priorUser=task.messages.slice(0,index+1).reverse().find(item=>item.role==='user');
            const nextUser=task.messages.slice(index+1).find(item=>item.role==='user');
            const firstReply=message.role==='assistant'&&task.messages.slice(task.messages.findIndex(item=>item.id===priorUser?.id)+1,index).every(item=>item.role!=='assistant');
            const turnEvents=priorUser?task.events.filter(event=>event.createdAt>=priorUser.createdAt&&(!nextUser||event.createdAt<nextUser.createdAt)):[];
            const turnTask={...task,events:turnEvents,status:nextUser?'completed' as const:task.status};
            const author=message.agentId&&message.agentId!=='hither'?data.agents.find(agent=>agent.id===message.agentId):undefined;
            return <div className={`message message-${message.role}`} key={message.id}>
              {firstReply&&<TaskActivity task={turnTask} agents={data.agents} onEvent={openEvent}/>}
              {author&&<div className="message-author">{author.name}</div>}
              <MessageAttachments attachments={(data.attachments||[]).filter(item=>message.attachmentIds?.includes(item.id))}/>{message.content&&<RichText className="message-content">{message.content}</RichText>}{message.role==='assistant'&&!example&&<FeedbackAction task={task} messageId={message.id} artifacts={taskArtifacts} onRefresh={onRefresh}/>}
            </div>;
          })}</div>
          {task.messages.at(-1)?.role==='user'&&<TaskActivity task={{...task,events:task.events.filter(event=>event.createdAt>=(task.messages.at(-1)?.createdAt||''))}} agents={data.agents} onEvent={openEvent}/>}
          <ContextFacts key={task.id} facts={taskContext(task,data)} queued={task.status === 'queued'} />
          {task.approvals.map(approval => <TaskApproval key={approval.id} approval={approval} busy={busy||example} onDecision={decision => { void action('approval', { approvalId: approval.id, decision }); }} />)}
          {working && !example && <Busy label={task.mode === 'demo' ? t("正在运行本地流程", "Running the local demo") : t("助理正在处理", "Working")} />}
          {task.error && <Alert color="danger" variant="soft" title={t("这一步没有完成", "This step failed")} description={task.error} />}
          {statusDescription[task.status] && <p className="task-state-note">{statusDescription[task.status]}</p>}
          {(task.status === 'queued' || task.status === 'interrupted' || task.status === 'failed') && !configurationMissing && !example && <Button color="secondary" variant="outline" disabled={busy} onClick={() => action('run')}>{t("继续任务", "Continue task")}<ArrowRight /></Button>}
          {taskArtifacts.length > 0 && <div className="task-artifacts"><h3>{t("生成的文件", "Created files")}</h3>{taskArtifacts.map(item => <ArtifactCard key={item.id} artifact={item} onOpen={() => openArtifact(item.id)} />)}</div>}
          <div ref={endRef} />
        </div>}
      </div>
      {task && composer}
    </div>
    {panelOpen && task && <aside ref={artifactPaneRef} className="task-artifact-pane workbench-pane" role={artifactOverlay ? 'dialog' : undefined} aria-modal={artifactOverlay ? true : undefined} aria-label={t("任务工作区","Task workspace")} tabIndex={-1}><WorkbenchPanel data={data} task={task} tab={workbenchTab||'files'} artifactId={openArtifactId} eventId={workbenchEventId} onEvent={openEvent} onTab={setWorkbenchTab} onClose={closeWorkbench} onArtifact={openArtifact} onDirtyChange={setArtifactDirty} onRefresh={onRefresh}/></aside>}
    {taskId && !task && <div className="missing-task"><Empty title={t("找不到这个任务", "Task not found")} description={t("它可能不属于当前本地空间。", "It may belong to another workspace.")} action={<ButtonLink as="a" color="primary" href="#assistant">{t("回到助理", "New chat")}</ButtonLink>} /></div>}
  </div>;
}
