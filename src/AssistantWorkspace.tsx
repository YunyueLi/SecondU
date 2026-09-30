import {ExampleExecutionNotice} from './ExampleExecutionNotice';
import {ConnectorPicker} from './connectors/Connectors';
import {ComposerTools,DigitalTwinMode,ComposerContextBar} from './composer/ComposerTools';
import { useAttachments, AttachmentDrafts, MessageAttachments } from './composer/attachments';
import { pasteComposerLinks } from './composer/composerInput';
import { ProjectPicker } from './ProjectWorkspace';
import { type WorkbenchTab } from './TaskWorkbench';
import { t, getLocale } from './i18n';
import { ComposerSurface } from './composer/ComposerSurface';
import {ApprovalPicker,ContextUsage} from './composer/ExecutionControls';
import { shouldSend } from './appearance';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ApprovalMode, Bootstrap, Task, TaskEvent } from '../shared/contracts';
import { Button, ButtonLink, CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { SetupHint } from './design-system/SetupHint';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { selectTaskContext, selectDigitalTwinContext } from './contextSelection';
import './composer/personal-context.css';
import './composer/home-context-bar.css';
import { ModelPicker } from './composer/ModelPicker';
import { VoiceInput } from './composer/VoiceInput';
import { WelcomeLettering } from './WelcomeLettering';
import { HitherMark } from './HitherMark';
import { TaskActivity } from './design-system/TaskActivity';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { ArrowUp, Stop, Plus, Folder, User, Agent, Document, ArrowRight, Check, CloseBold, Clock, Sparkles, Desktop, ChevronRight } from '@openai/apps-sdk-ui/components/Icon';
import { WorkbenchPanel } from './WorkbenchPanel';
import { WorkbenchPane } from './workbench/WorkbenchPane';
import { TaskResources, TaskChatActions } from './TaskResourceMenu';
import { Dialog, Empty, ErrorNotice, when, RichText } from './components';
import { write, messageOf } from './api';
import { TaskApproval } from './design-system/TaskApproval';
import { FeedbackAction } from './cognition/TaskFeedback';
import { ArtifactCard } from './design-system/ArtifactCard';
import { SuggestionRow } from './design-system/SuggestionRow';
import { taskConversationTurns, type ConversationContextFact } from './taskConversation';
import './assistant-conversation.css';
import { MessageRevision, RevisionNavigation } from './composer/MessageRevision';

const getStatusDescription = (): Partial<Record<Task['status'], string>> => ({ queued: t("任务已保存，等待开始。", "Saved and ready to start."), needs_input: t("补充下面的信息后，可以继续这项工作。", "Add the requested information to continue."), interrupted: t("上一次执行已中断。已保存的对话和成果仍在。", "The last run was interrupted. Your saved messages and files are still available."), cancelled: t("任务已停止。你可以补充新要求后继续。", "Stopped. Add instructions whenever you want to continue.") });
export type TaskComposition = { projectId?: string; id: string; prompt: string; factIds?: string[]; agentIds: string[] };
type Props = { navigation?:ReactNode; data: Bootstrap; taskId?: string; composition?: TaskComposition; onRefresh: () => Promise<void>; onCreateTask: (prompt: string, facts?: string[], agents?: string[], mode?: 'demo'|'live', connectionId?: string, projectId?: string, attachmentIds?: string[], connectorIds?: string[], digitalTwinEnabled?:boolean, approvalMode?:ApprovalMode|null) => Promise<void> };

function ContextFacts({ facts, queued }: { facts: ConversationContextFact[]; queued: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!facts.length) return null;
  return <>
    <button type="button" className="task-context-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)} aria-label={queued?t(`将参考 ${facts.length} 条个人背景`,`Will use ${facts.length} personal context entries`):t(`本轮使用 ${facts.length} 条个人背景`,`Used ${facts.length} personal context entries`)}><Document/><span>{t('个人背景','Personal context')}</span><small>{facts.length}</small><ChevronRight className="context-chevron"/></button>
    {open && <div id={panelId} className="task-context" role="region" aria-label={t('个人背景','Personal context')}><ul>{facts.map((fact,index) => <li key={`${fact.id}:${fact.version}:${index}`}>{fact.statement}<small>{fact.status === 'confirmed' ? t("已确认", "Confirmed") : fact.status === 'inferred' ? t("推断", "Inferred") : fact.status === 'superseded' ? t("已替代", "Superseded") : t("待确认", "Unconfirmed")}{t("，第", ", version ")}{fact.version} {t("版，", ", ")}{fact.sourceIds.length} {t("份来源", "sources")}</small></li>)}</ul><a className="task-context-review" href="#self">{t("检查与纠正", "Review and correct")}<ArrowRight /></a></div>}
  </>;
}

export function AssistantWorkspace({ navigation, data, taskId, composition, onRefresh, onCreateTask }: Props) {
  const task = data.tasks.find(item => item.id === taskId);
  const attachments = useAttachments({contextKey:taskId || composition?.id || 'new'});
  const statusDescription=getStatusDescription();
  const [prompt, setPrompt] = useState('');
  const promptRevision = useRef(0);
  function replacePrompt(value: string) { promptRevision.current += 1; setPrompt(value); }
  const [mode, setMode] = useState<'demo'|'live'>('live');
  const [connectionId, setConnectionId] = useState<string>();
  const [approvalMode,setApprovalMode]=useState<ApprovalMode|null>(null);
  const [connectorIds,setConnectorIds]=useState<string[]>([]);
  const [projectId,setProjectId]=useState<string>();
  const project=(data.projects||[]).find(p=>p.id===(task?task.projectId:projectId));
  const [factIds, setFactIds] = useState<string[]>(() => data.facts.filter(fact => fact.status === 'confirmed').map(fact => fact.id));
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [automaticContext,setAutomaticContext]=useState(true);
  const [digitalTwinEnabled,setDigitalTwinEnabled]=useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exampleNotice,setExampleNotice]=useState(false);
  const [artifactDirty,setArtifactDirty]=useState(false);
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();
  const [workbenchOpen,setWorkbenchOpen]=useState(false);
  const [workbenchTab,setWorkbenchTab]=useState<WorkbenchTab>();
  const [workbenchEventId,setWorkbenchEventId]=useState<string>();
  const artifactOpenerRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const initialTask = useRef(taskId);
  const exampleRevision = !!task?.forkedFrom && (!!data.profile.demo || task.mode === 'demo');
  const working = !exampleRevision && (task?.status === 'running' || task?.status === 'queued');
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
  const turns=task?taskConversationTurns(task,data.facts):[];
  function rememberWorkbenchOpener(){if(panelOpen)return;const active=document.activeElement;artifactOpenerRef.current=active instanceof HTMLElement&&!active.closest('[data-radix-popper-content-wrapper]')?active:document.querySelector<HTMLElement>('[data-task-resources-trigger]');}
  function openWorkbench(tab:WorkbenchTab){rememberWorkbenchOpener();setWorkbenchOpen(true);setWorkbenchTab(tab);if(tab==='activity')setWorkbenchEventId(undefined);}
  function closeWorkbench(){if(artifactDirty&&!window.confirm(t('还有未保存的修改，仍然关闭？','You have unsaved changes. Close anyway?')))return;setWorkbenchOpen(false);requestAnimationFrame(()=>{if(artifactOpenerRef.current?.isConnected)artifactOpenerRef.current.focus();});}
  function openEvent(event:TaskEvent){openWorkbench('activity');setWorkbenchEventId(event.id);}
  const taskArtifacts = data.artifacts.filter(item => item.taskId === task?.id && item.classification !== 'reply_snapshot');
  useEffect(() => { if (initialTask.current !== taskId) { replacePrompt(''); setError(''); setOpenArtifactId(undefined); setWorkbenchTab(undefined); setWorkbenchOpen(false); initialTask.current = taskId; } }, [taskId]);
  useEffect(() => { if (composition && !taskId) { setProjectId(composition.projectId);setConnectorIds([]);setDigitalTwinEnabled(true); replacePrompt(composition.prompt); setFactIds(composition.factIds??data.facts.filter(f=>f.status==='confirmed').map(f=>f.id));setAutomaticContext(composition.factIds===undefined); setAgentIds(composition.agentIds); setError(''); composerRef.current?.focus(); } }, [composition?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' }); }, [task?.messages.length, task?.approvals.length]);
  async function send() {
    if ((!prompt.trim() && !attachments.items.length) || busy || attachments.busy || attachments.hasErrors || configurationMissing) return;
    if(example){setExampleNotice(true);return;}
    const submittedRevision = promptRevision.current;
    const submittedAttachments = attachments.items.map(item=>item.id);
    setBusy(true); setError('');
    try { if (task) { await write<Task>(`/tasks/${task.id}/message`, { content: prompt.trim(), attachmentIds:attachments.attachmentIds }); await onRefresh(); } else { await onCreateTask(prompt.trim(), digitalTwinEnabled?(automaticContext?selectDigitalTwinContext(data.facts,prompt):factIds):[], agentIds, mode, connectionId, projectId, attachments.attachmentIds, connectorIds, digitalTwinEnabled, approvalMode); } submittedAttachments.forEach(attachments.remove); if (promptRevision.current === submittedRevision) replacePrompt(''); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function action(path: string, body?: unknown) {
    if (!task || busy) return;
    if(example){setExampleNotice(true);return;}
    setBusy(true); setError('');
    try { await write<Task>(`/tasks/${task.id}/${path}`, body); await onRefresh(); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  function openArtifact(id?:string){if(id!==openArtifactId&&artifactDirty&&!window.confirm(t('还有未保存的修改，仍然切换？','You have unsaved changes. Switch anyway?')))return;rememberWorkbenchOpener();setWorkbenchTab('files');setWorkbenchOpen(true);setOpenArtifactId(id);}
  const controlsLocked=busy||working||task?.status==='awaiting_approval';
  async function updateTaskConfig(body:Record<string,unknown>){if(!task||controlsLocked)return false;setBusy(true);setError('');try{await write(`/tasks/${task.id}`,body,'PUT');await onRefresh();return true;}catch(e){setError(messageOf(e));return false;}finally{setBusy(false);}}
  async function chooseConnection(id:string|undefined){if(task)return updateTaskConfig({connectionId:id||null});setConnectionId(id);setMode('live');}
  async function chooseMode(value:'live'|'demo'){if(example)return;if(task){if(task.mode!==value)return updateTaskConfig({mode:value});return;}setMode(value);}
  const contextTools=<><ConnectorPicker data={data} value={task?.connectorIds||connectorIds} onChange={controlsLocked?undefined:task?ids=>{void updateTaskConfig({connectorIds:ids});}:setConnectorIds} disabled={controlsLocked}/><DigitalTwinMode enabled={task?task.digitalTwinEnabled!==false:digitalTwinEnabled} onChange={controlsLocked?undefined:enabled=>{if(task){void updateTaskConfig({digitalTwinEnabled:enabled});}else{setDigitalTwinEnabled(enabled);setAutomaticContext(true);}}} disabled={controlsLocked}/></>;
  const exampleStories=data.profile.demo?(data.profile.exampleTaskIds?.length?data.profile.exampleTaskIds.flatMap(id=>{const story=data.tasks.find(item=>item.id===id&&!item.archived);return story?[story]:[];}):data.tasks.filter(item=>!item.archived&&!item.roomId&&item.status==='completed').slice(0,3)):[];

  const compactComposer = !task && !prompt.includes('\n') && prompt.length < 48 && !attachments.items.length;
  const composer = <div className="composer-wrap">
    <ErrorNotice error={error}/>
    {exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>}
    <ComposerSurface compact={compactComposer} context={!task&&<ComposerContextBar><ProjectPicker data={data} value={projectId} onChange={setProjectId} disabled={busy}/>{contextTools}<ApprovalPicker value={approvalMode} defaultValue={data.executionSettings?.approvalMode} onChange={setApprovalMode} disabled={controlsLocked}/></ComposerContextBar>} onDragOver={attachments.onDragOver} onDrop={event=>{if(!busy)attachments.onDrop(event);else event.preventDefault();}} onSubmit={event=>{event.preventDefault();void send();}}>
      <AttachmentDrafts controller={attachments} disabled={busy}/>
      <div className="composer-leading"><ComposerTools onAttach={()=>attachments.inputRef.current?.click()} disabled={busy}>{task&&contextTools}</ComposerTools>{task&&<ApprovalPicker value={Object.hasOwn(task,'approvalMode')?task.approvalMode:'ask'} defaultValue={data.executionSettings?.approvalMode} onChange={value=>{if(task)void updateTaskConfig({approvalMode:value});else setApprovalMode(value);}} disabled={controlsLocked}/>}</div>
      <div className="composer-input"><Textarea ref={composerRef} variant="soft" aria-label={task?t('补充任务要求','Additional instructions'):t('发送消息','Message SecondU')} placeholder={task?t('继续对话','Message SecondU'):t('询问 SecondU','Ask SecondU')} rows={1} maxRows={7} autoResize disabled={busy} value={prompt} onPaste={event=>{if(!attachments.onPaste(event))pasteComposerLinks(event,prompt,replacePrompt);}} onChange={event=>replacePrompt(event.target.value)} onKeyDown={event=>{if(shouldSend(event)){event.preventDefault();void send();}}}/></div>
      <div className="composer-trailing"><ModelPicker example={example} settings={data.settings} connections={data.modelConnections} defaultConnectionId={data.defaultConnectionId} connectionId={currentConnectionId} onConnection={chooseConnection} agentModels={agentModels.length?agentModels:undefined} mode={currentMode} onMode={chooseMode} onSettings={()=>{location.hash='settings/model';}} disabled={controlsLocked}/><ContextUsage usage={task?.contextUsage}/><VoiceInput disabled={busy||working} contextKey={taskId||'new'} onTranscript={text=>{replacePrompt(`${prompt}${prompt&&!/\s$/.test(prompt)?' ':''}${text}`);composerRef.current?.focus();}}/>{working?<Button type="button" color="primary" uniform aria-label={t('停止任务','Stop task')} disabled={busy} onClick={()=>action('cancel')}><Stop/></Button>:<Button type="submit" color="primary" uniform aria-label={task?t('发送补充要求','Send instructions'):t('发送消息','Send message')} disabled={(!prompt.trim()&&!attachments.items.length)||busy||attachments.busy||attachments.hasErrors||configurationMissing} loading={busy}><ArrowUp/></Button>}</div>
    </ComposerSurface>
    {configurationMissing&&<SetupHint href={!modelReady?'#settings/model':'#settings'} action={!modelReady?t('连接模型','Connect a model'):t('前往设置','Open settings')}>{project&&project.execution.status!=='ready'?t('请先为项目选择本地目录。','Choose a local folder for this project.'):!modelReady?t('连接后即可开始对话。','Connect to start a conversation.'):t('请先启用本机执行环境。','Set up the runtime on this computer.')}</SetupHint>}
  </div>;
  return <div className={`assistant-workspace ${panelOpen ? 'with-artifact' : ''} ${task ? 'has-task' : 'is-home'}`}>
    <div className="conversation-pane">
      {(task||navigation)&&<header className="conversation-header">{navigation}<h1 title={task?.title}>{task?.title||'SecondU'}</h1>{task&&<div className="conversation-header-actions"><TaskChatActions task={task} onRefresh={onRefresh}/><TaskResources data={data} tasks={[task]} projectId={task.projectId} agentIds={task.agentIds} onOpen={(_task,tab,id)=>id?openArtifact(id):openWorkbench(tab)}/></div>}</header>}
      <div className="conversation-scroll">
        {!task ? <section className="assistant-welcome">
          <div className="welcome-start"><div className="welcome-artwork"><WelcomeLettering /></div><div className="welcome-intro"><h1>{t("今天想做些什么？", "What shall we work on?")}</h1></div>
          {composer}
          {exampleStories.length>0&&<nav className="assistant-example-stories" aria-label={t("示例任务", "Example tasks")}>{exampleStories.map(story=><SuggestionRow key={story.id} href={`#task/${story.id}`}>{story.title}</SuggestionRow>)}</nav>}

          </div></section> : <div className="task-thread"><RevisionNavigation task={task} tasks={data.tasks} rooms={data.agentRooms}/>{project&&<a className="task-project-reference" href={`#projects/${project.id}`}><Folder/>{project.name}<ArrowRight/></a>}
          {example && <span className="demo-thread-note">{t("示例", "Example")}</span>}
          {task.interaction==='task' && task.agentIds.length > 1 && <div className="task-agents"><Agent />{task.agentIds.map(id => data.agents.find(agent => agent.id === id)?.name || t("未命名角色", "Unnamed agent")).join(t('、', ', '))} {t("参与此任务", "on this task")}</div>}
          <div className="messages">{turns.map(turn=>{
            const replies=turn.messages.filter(message=>message.role==='assistant');
            const firstReply=replies[0]?.id,lastReply=replies.at(-1)?.id;
            const turnTask={...task,events:turn.events,status:turn.status};
            return <Fragment key={turn.id}>{turn.messages.map(message=>{
              const author=message.agentId&&message.agentId!=='hither'?data.agents.find(agent=>agent.id===message.agentId):undefined;
              return <div className={`message message-${message.role}`} key={message.id}>
                {message.id===firstReply&&<TaskActivity task={turnTask} agents={data.agents} onEvent={openEvent}/>}
                {author&&<div className="message-author">{author.name}</div>}
                {message.role==='user'?<MessageRevision key={`${task.id}:${message.id}`} task={task} messageId={message.id} content={message.content} busy={busy} example={example} onRefresh={onRefresh}>{({editor,editAction})=><>{editor||<div className="message-user-bubble"><MessageAttachments attachments={(data.attachments||[]).filter(item=>message.attachmentIds?.includes(item.id))}/><RichText className="message-content">{message.content}</RichText></div>}{editAction&&<div className="message-actions message-user-actions" aria-label={t('消息操作','Message actions')}>{editAction}</div>}</>}</MessageRevision>:<><MessageAttachments attachments={(data.attachments||[]).filter(item=>message.attachmentIds?.includes(item.id))}/>{message.content&&<RichText className="message-content">{message.content}</RichText>}</>}
                {message.role==='assistant'&&<div className="message-footer"><div className="message-actions" aria-label={t('答复操作','Reply actions')}>
                  {message.content&&<CopyButton copyValue={message.content} color="secondary" variant="ghost" uniform size="sm" aria-label={t('复制答复','Copy reply')} title={t('复制答复','Copy reply')}/>}
                  {!example&&<FeedbackAction task={task} messageId={message.id} artifacts={taskArtifacts} onRefresh={onRefresh} onRevise={()=>{const quote=message.content.slice(0,4000)+(message.content.length>4000?'…':'');replacePrompt(`${prompt?`${prompt}\n\n`:''}${t('请修改以下答复：','Please revise the following reply:')}\n${quote.split('\n').map(line=>`> ${line}`).join('\n')}\n\n${t('修改要求：','Requested changes: ')}`);composerRef.current?.focus();}}/>}
                </div>{message.id===lastReply&&<ContextFacts facts={turn.context} queued={false}/>}</div>}
              </div>;
            })}{!replies.length&&<div className="message message-assistant message-pending">
              {!exampleRevision&&<TaskActivity task={turnTask} agents={data.agents} onEvent={openEvent}/>}
              {turn.context.length>0&&<div className="message-footer"><ContextFacts facts={turn.context} queued={turn.status==='queued'}/></div>}
            </div>}</Fragment>;
          })}</div>
          {task.approvals.map(approval => <TaskApproval key={approval.id} approval={approval} busy={busy||example} onDecision={decision => { void action('approval', { approvalId: approval.id, decision }); }} />)}
          {task.error && <Alert color="danger" variant="soft" title={t("这一步没有完成", "This step failed")} description={task.error} />}
          {exampleRevision?<p className="task-state-note" role="status">{t("修改版本已保存。示例可查看与继续编辑，不会执行任务。","Revision saved. You can review and edit this example; it will not run.")}</p>:statusDescription[task.status] && <p className="task-state-note">{statusDescription[task.status]}</p>}
          {(task.status === 'queued' || task.status === 'interrupted' || task.status === 'failed') && !configurationMissing && !example && <Button color="secondary" variant="outline" disabled={busy} onClick={() => action('run')}>{t("继续任务", "Continue task")}<ArrowRight /></Button>}
          {taskArtifacts.length > 0 && <div className="task-artifacts"><h3>{t("生成的文件", "Created files")}</h3>{taskArtifacts.map(item => <ArtifactCard key={item.id} artifact={item} onOpen={() => openArtifact(item.id)} />)}</div>}
          <div ref={endRef} />
        </div>}
      </div>
      {task && composer}
    </div>
    {panelOpen && task && <WorkbenchPane title={t("任务工作区","Task workspace")} onClose={closeWorkbench}><WorkbenchPanel data={data} task={task} tab={workbenchTab||'files'} artifactId={openArtifactId} eventId={workbenchEventId} onEvent={openEvent} onTab={setWorkbenchTab} onClose={closeWorkbench} onArtifact={openArtifact} onDirtyChange={setArtifactDirty} onRefresh={onRefresh}/></WorkbenchPane>}
    {taskId && !task && <div className="missing-task"><Empty title={t("找不到这个任务", "Task not found")} description={t("它可能不属于当前本地空间。", "It may belong to another workspace.")} action={<ButtonLink as="a" color="primary" href="#assistant">{t("回到助理", "New chat")}</ButtonLink>} /></div>}
  </div>;
}
