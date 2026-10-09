import { MessageRevision, RevisionNavigation } from '../composer/MessageRevision';
import {ExampleExecutionNotice} from '../ExampleExecutionNotice';
import {ConnectorPicker} from '../connectors/Connectors';
import {ComposerTools,DigitalTwinMode} from '../composer/ComposerTools';
import {ComposerSurface} from '../composer/ComposerSurface';
import { useUnsavedChanges } from '../useUnsavedChanges';
import {ApprovalPicker,ContextUsage} from '../composer/ExecutionControls';
import {useAttachments,AttachmentDrafts,MessageAttachments} from '../composer/attachments';
import {pasteComposerLinks} from '../composer/composerInput';
import { spaceStorageKey } from '../space';
import { FeedbackAction } from '../cognition/TaskFeedback';
import { t, getLocale } from '../i18n';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentProfile, AgentRoom, AgentRoomTaskResult, Bootstrap, Task, TaskEvent } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { selectDigitalTwinContext } from '../contextSelection';
import '../composer/personal-context.css';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { Plus, Search, ArrowUp, ArrowRight, ArrowLeft, Chat, Group, User, Stop, Edit, DotsHorizontalMoreMenu, Document, ChevronDown, CloseBold } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice, RichText } from '../components';
import { UserAvatar } from '../UserAvatar';
import { TaskActivity } from '../design-system/TaskActivity';
import { messageOf, write } from '../api';
import { TaskApproval } from '../design-system/TaskApproval';
import { ArtifactCard } from '../design-system/ArtifactCard';
import { AgentAvatar, AgentGroupAvatar, AgentIdentityDrawer } from './AgentIdentity';
import { AgentEditor, AgentCardDialog, RoomEditor } from './AgentDialogs';
import { AgentDirectory, AgentWorkDialog } from './AgentDirectory';
import type { AgentPanelView } from './AgentWorkPanel';
import type { AgentResourceKind } from '../../shared/agent-resources';
import { selfAgent, isSelfAgent, professionalAgent, SELF_AGENT_ID } from './agentProfiles';
import { ModelPicker } from '../composer/ModelPicker';
import { VoiceInput } from '../composer/VoiceInput';
import { ScanIcon } from './ScanIcon';
import { plainTextPreview, roomMessagePreview } from './preview';
import { RoomComposerInput, ReplyReference } from './RoomMentions';
import { updateInlineMentions, validInlineMentions, mentionRecipientIds, type InlineMention } from './mentionQuery';
import { conversationText } from '../../shared/conversation-intent.mjs';
import { showRoomTaskSummary, showRoomTaskProgress } from './roomTaskPresentation';
import { TaskProgress, type WorkbenchTab } from '../TaskWorkbench';
import { TaskResources } from '../TaskResourceMenu';
import { RoomWorkbenchPanel, type RoomWorkbenchSelection } from './RoomWorkbenchPanel';
import { roomRuntimeControls } from './roomRuntimeControls';
import './agents.css';
import {MessageReactions} from './MessageReactions';

function ReplyIcon(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5-6 6 6 6M3 11h10a7 7 0 0 1 7 7v1"/></svg>;}
export type AgentWorkspaceProps = { navigation?:ReactNode; data:Bootstrap; onRefresh:()=>Promise<void>; onCreateTask?:(prompt:string,contextFactIds?:string[],agentIds?:string[])=>void|Promise<void>; onTask?:(id:string)=>void; initialRoomId?:string };
const inProgress = new Set<Task['status']>(['queued','running','awaiting_approval','needs_input']);
function clockTime(value:string) {const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'});}
function dayLabel(value:string) {const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleDateString(getLocale(),{month:'long',day:'numeric'});}
function draftKey(roomId:string){return spaceStorageKey(`hither.agent-room.draft.${roomId}`);}
function readDraft(roomId:string){try{return sessionStorage.getItem(draftKey(roomId))||'';}catch{return '';}}
type MessageTarget={recipientIds:string[];mentions:InlineMention[];replyToMessageId?:string};
function readMessageTarget(roomId:string):MessageTarget{try{const saved=JSON.parse(sessionStorage.getItem(spaceStorageKey(`hither.agent-room.target.${roomId}`))||'{}');const mentions=validInlineMentions(readDraft(roomId),Array.isArray(saved.mentions)?saved.mentions:[]);return {mentions,recipientIds:mentionRecipientIds(readDraft(roomId),mentions),replyToMessageId:typeof saved.replyToMessageId==='string'?saved.replyToMessageId:undefined};}catch{return {recipientIds:[],mentions:[]};}}

function previewOf(room:AgentRoom,data:Bootstrap){const task=data.tasks.find(task=>task.id===room.activeTaskId);if(task?.status==='awaiting_approval')return t("有一项操作需要你确认", "An action needs your approval");if(task?.status==='needs_input')return t("等你补充信息", "Waiting for your input");if(task?.status==='running')return plainTextPreview(task.events.at(-1)?.label||t("正在处理你的委托", "Working on your request"));return roomMessagePreview(room);}

export function AgentWorkspace({navigation,data:originalData,onRefresh,onTask,initialRoomId}:AgentWorkspaceProps){
  const data=useMemo(()=>({...originalData,agents:originalData.agents.map(professionalAgent)}),[originalData]);
  const directoryTab=initialRoomId==='network'?'market':['market','dating','discover'].includes(initialRoomId||'')?initialRoomId:'mine';
  const isRoomRoute=!!initialRoomId&&!['network','market','dating','discover'].includes(initialRoomId);
  const [workspaceView,setWorkspaceView]=useState(isRoomRoute?'chat':'directory');
  const [workAgent,setWorkAgent]=useState<AgentProfile>();
  const rooms=useMemo(()=>[...(data.agentRooms||[])].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),[data.agentRooms]);
  const [selectedId,setSelectedId]=useState<string>(()=>{try{return sessionStorage.getItem(spaceStorageKey('hither.agent-room.selected'))||'';}catch{return '';}});
  const [railView,setRailView]=useState('rooms');const [query,setQuery]=useState('');const [roomOpen,setRoomOpen]=useState(false);
  const [creatingRoom,setCreatingRoom]=useState(false);const [createRoomKind,setCreateRoomKind]=useState<'direct'|'group'>('direct');const [editingRoom,setEditingRoom]=useState<AgentRoom>();const [editingAgent,setEditingAgent]=useState<{agent?:AgentProfile}>();const [card,setCard]=useState<{agent?:AgentProfile}>();const [identityId,setIdentityId]=useState<string>();const [identityView,setIdentityView]=useState<AgentPanelView>('model');const [identityResourceKind,setIdentityResourceKind]=useState<AgentResourceKind>();
  const [messageTargets,setMessageTargets]=useState<Record<string,MessageTarget>>({});
  const [revealedMessageId,setRevealedMessageId]=useState<string>();
  const revealTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [workbench,setWorkbench]=useState<RoomWorkbenchSelection>();
  const [workbenchVisible,setWorkbenchVisible]=useState(false);
  const workbenchOpener=useRef<HTMLElement|null>(null);
  const [artifactDirty,setArtifactDirty]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [actionError,setActionError]=useState<{roomId?:string;message:string}>();
  const draftsRef=useRef(drafts);draftsRef.current=drafts;
  const viewport=useRef<HTMLDivElement>(null);const composer=useRef<HTMLTextAreaElement>(null);const stickyBottom=useRef(true);const [newMessages,setNewMessages]=useState(false);
  const requestedRoomId=isRoomRoute?initialRoomId:selectedId;
  const room=rooms.find(item=>item.id===requestedRoomId)||(!isRoomRoute?rooms[0]:undefined);
  const attachments=useAttachments({contextKey:room?.id||'no-room'});
  const members=room?room.agentIds.map(id=>data.agents.find(agent=>agent.id===id)).filter((agent):agent is AgentProfile=>!!agent):[];
  const identity=identityId===SELF_AGENT_ID?selfAgent(data):data.agents.find(agent=>agent.id===identityId);
  function showIdentity(id:string,view:AgentPanelView='model',kind?:AgentResourceKind){setIdentityView(view);setIdentityResourceKind(kind);setIdentityId(id);}
  const groupModels=room?.kind==='group'?members.map(agent=>{const connection=data.modelConnections.find(item=>item.id===(agent.connectionId||data.defaultConnectionId));return {id:agent.id,name:agent.name,model:connection?.model||t("未选择模型", "No model selected"),connectionName:agent.connectionId?connection?.name||t("连接不可用", "Connection unavailable"):t("继承默认", "Use default"),hasKey:!!connection?.hasKey,provider:connection?.provider};}):undefined;
  const activeTask=data.tasks.find(task=>task.id===room?.activeTaskId);
  const lastTask=data.tasks.find(task=>task.id===room?.taskIds.at(-1));
  const task=activeTask||(lastTask?.status==='interrupted'?lastTask:undefined);
  const progressTask=task||lastTask;
  const example=!!data.profile.demo||room?.mode==='demo'||task?.mode==='demo';
  const [exampleNotice,setExampleNotice]=useState(false);
  const workbenchTask=workbenchVisible&&workbench&&workbench.roomId===room?.id?data.tasks.find(item=>item.id===workbench.taskId):undefined;
  const panelOpen=!!workbenchTask;
  const pending=!!activeTask&&inProgress.has(activeTask.status);
  const working=task?.status==='running';const waitingApproval=task?.status==='awaiting_approval';const canContinue=task?.status==='needs_input'||task?.status==='interrupted';
  const {digitalTwinEnabled:contextEnabled,locked:runtimeLocked}=roomRuntimeControls(room,task,busy);
  const contextLocked=runtimeLocked;
  const draft=room?(drafts[room.id]??readDraft(room.id)):'';
  useUnsavedChanges({ unsaved: !!draft.trim() || Object.values(drafts).some(value => !!value.trim()), busy });
  const messageTarget=room?(messageTargets[room.id]??readMessageTarget(room.id)):{recipientIds:[],mentions:[]};
  const replyMessage=room?.messages.find(message=>message.id===messageTarget.replyToMessageId);
  const targetingLocked=busy||!!task&&(pending||task.status==='interrupted');
  function setMessageTarget(next:MessageTarget){if(!room)return;setMessageTargets(previous=>({...previous,[room.id]:next}));try{sessionStorage.setItem(spaceStorageKey(`hither.agent-room.target.${room.id}`),JSON.stringify(next));}catch{}}
  function messageAuthor(message:AgentRoom['messages'][number]){return message.role==='user'?data.profile.name:data.agents.find(agent=>agent.id===message.agentId)?.name||t('助理','Agent');}
  function revealMessage(id:string){
    const element=document.getElementById(`room-message-${id}`);if(!element)return;
    element.scrollIntoView({block:'center',behavior:'auto'});element.focus({preventScroll:true});
    clearTimeout(revealTimer.current);setRevealedMessageId(id);
    revealTimer.current=setTimeout(()=>setRevealedMessageId(undefined),1600);
  }
  const lowerQuery=query.trim().toLowerCase();
  const shownRooms=rooms.filter(item=>[item.title,...item.agentIds.map(id=>data.agents.find(agent=>agent.id===id)?.name),item.messages.at(-1)?.content].join(' ').toLowerCase().includes(lowerQuery));
  const shownAgents=data.agents.filter(agent=>`${agent.name} ${agent.role}`.toLowerCase().includes(lowerQuery));
  useEffect(()=>{if(isRoomRoute&&initialRoomId){setSelectedId(initialRoomId);setRoomOpen(true);setWorkspaceView('chat');}else setWorkspaceView('directory');},[initialRoomId]);
  useEffect(()=>{setRevealedMessageId(undefined);return()=>clearTimeout(revealTimer.current);},[room?.id]);
  useEffect(()=>{stickyBottom.current=true;setNewMessages(false);requestAnimationFrame(()=>{if(viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight;});},[room?.id]);
  useEffect(()=>{if(stickyBottom.current){requestAnimationFrame(()=>{if(viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight;});}else setNewMessages(true);},[room?.messages.length,task?.events.length,task?.approvals.length]);
  function selectRoom(id:string){setWorkspaceView('chat');setSelectedId(id);if(location.hash!==`#agents/${id}`)location.hash=`agents/${id}`;setRoomOpen(true);setActionError(undefined);try{sessionStorage.setItem(spaceStorageKey('hither.agent-room.selected'),id);}catch{}stickyBottom.current=true;}
  async function setRuntimeConfiguration(body:{digitalTwinEnabled?:boolean;connectorIds?:string[];mode?:'demo'|'live';approvalMode?:import('../../shared/contracts').ApprovalMode|null}){
    if(!room||contextLocked)return;
    if(example&&body.mode)body={...body,mode:'demo'};
    const target=room, continuation=task;
    await act(async()=>{
      if(continuation)await write(`/tasks/${continuation.id}`,body,'PUT');
      try { await write(`/agent-rooms/${target.id}`,body,'PUT'); }
      catch(error){await refresh();throw error;}
    },target.id);
  }
  async function chooseDirectConnection(id:string|undefined){
    if(!room||room.kind!=='direct'||!members[0]||contextLocked)return false;
    const target=room, continuation=task, member=members[0];
    return act(async()=>{
      await write(`/agents/${member.id}`,{connectionId:id||null},'PUT');
      if(continuation)await write(`/tasks/${continuation.id}`,{connectionId:id||null,mode:example?'demo':'live'},'PUT');
      await write(`/agent-rooms/${target.id}`,{mode:example?'demo':'live'},'PUT');
    },target.id);
  }
  function editDraft(value:string,chosen?:InlineMention){if(!room)return;const mentions=updateInlineMentions(draft,value,messageTarget.mentions);if(chosen)mentions.push(chosen);if(chosen||messageTarget.mentions.length)setMessageTarget({...messageTarget,mentions,recipientIds:mentionRecipientIds(value,mentions)});draftsRef.current={...draftsRef.current,[room.id]:value};setDrafts(previous=>({...previous,[room.id]:value}));try{sessionStorage.setItem(draftKey(room.id),value);}catch{}}
  function openTask(id:string){setIdentityId(undefined);if(onTask)onTask(id);else location.hash=`task/${id}`;}
  function changeWorkbench(next:RoomWorkbenchSelection|undefined){
    const leavingDocument=!next||next.taskId!==workbench?.taskId||next.artifactId!==workbench?.artifactId;
    if(leavingDocument&&artifactDirty&&!window.confirm(t('还有未保存的修改，仍然切换？','You have unsaved changes. Switch anyway?')))return;
    if(next&&!panelOpen){const active=document.activeElement;workbenchOpener.current=active instanceof HTMLElement&&!active.closest('[data-radix-popper-content-wrapper]')?active:document.querySelector<HTMLElement>('[data-task-resources-trigger]');}
    if(leavingDocument)setArtifactDirty(false);setWorkbenchVisible(!!next);if(next)setWorkbench(next);else requestAnimationFrame(()=>{if(workbenchOpener.current?.isConnected)workbenchOpener.current.focus();});
  }
  function openWorkbench(target:Task,tab:WorkbenchTab='activity',event?:TaskEvent){
    if(room)changeWorkbench({...(workbench?.taskId===target.id?workbench:{}),roomId:room.id,taskId:target.id,tab,eventId:event?.id});
  }
  function openWorkbenchArtifact(id?:string){
    if(workbench)changeWorkbench({...workbench,tab:'files',artifactId:id});
  }
  async function refresh(){await onRefresh();}
  async function act(operation:()=>Promise<unknown>,roomId=room?.id){if(busy)return;setBusy(true);setActionError(undefined);try{await operation();await refresh();return true;}catch(err){setActionError({roomId,message:messageOf(err)});return false;}finally{setBusy(false);}}
  async function direct(agent:AgentProfile){if(busy)return;setIdentityId(undefined);if(isSelfAgent(agent)){location.hash="assistant";return;}const existing=rooms.find(item=>item.kind==='direct'&&item.agentIds[0]===agent.id);if(existing){selectRoom(existing.id);return;}await act(async()=>{const created=await write<AgentRoom>('/agent-rooms',{kind:'direct',agentIds:[agent.id],mode:example?'demo':'live',title:agent.name});selectRoom(created.id);},undefined);}
  async function send(asTask=false){if(!room||(!draft.trim()&&!attachments.items.length)||busy||attachments.busy||attachments.hasErrors||working||waitingApproval||task?.status==='queued')return;if(example){setExampleNotice(true);return;}const target=room;const submittedAttachments=attachments.items.map(item=>item.id);const content=draft.trim();const targetSnapshot=messageTarget;const targetFields={digitalTwinEnabled:contextEnabled,attachmentIds:attachments.attachmentIds,recipientIds:mentionRecipientIds(draft,messageTarget.mentions),replyToMessageId:messageTarget.replyToMessageId};const selectedFacts=contextEnabled?selectDigitalTwinContext(data.facts,conversationText(content,members.map(member=>member.name))):[];setBusy(true);setActionError(undefined);try{
    if(canContinue&&task&&!asTask)await write(`/tasks/${task.id}/message`,{content,attachmentIds:attachments.attachmentIds});
    else {const result=await write<AgentRoomTaskResult>(`/agent-rooms/${target.id}/${asTask?'tasks':'messages'}`,asTask?{prompt:content,contextFactIds:selectedFacts,run:false,...targetFields}:{content,contextFactIds:selectedFacts,...targetFields});if(asTask)openTask(result.task.id);}
    submittedAttachments.forEach(attachments.remove);
    if((!canContinue||asTask)&&(draftsRef.current[target.id]??readDraft(target.id)).trim()===content)setMessageTargets(previous=>{const current=previous[target.id]??readMessageTarget(target.id);if(JSON.stringify(current)!==JSON.stringify(targetSnapshot))return previous;try{sessionStorage.removeItem(spaceStorageKey(`hither.agent-room.target.${target.id}`));}catch{}return {...previous,[target.id]:{recipientIds:[],mentions:[]}};});
    if((draftsRef.current[target.id]??readDraft(target.id)).trim()===content){
      // Persist the acknowledgement before a route change can unmount the
      // composer; a sent session draft must not block the next app restart.
      try{sessionStorage.removeItem(draftKey(target.id));}catch{}
      draftsRef.current={...draftsRef.current,[target.id]:''};
      setDrafts(previous=>({...previous,[target.id]:''}));
    }
    await refresh();stickyBottom.current=true;composer.current?.focus();
  }catch(err){setActionError({roomId:target.id,message:messageOf(err)});}finally{setBusy(false);}}
  const afterRoom=async(saved:AgentRoom)=>{await refresh();setCreatingRoom(false);setEditingRoom(undefined);selectRoom(saved.id);};
  const afterAgent=async(saved:AgentProfile)=>{await refresh();setEditingAgent(undefined);showIdentity(saved.id);};
  const visibleError=actionError&&(!actionError.roomId||actionError.roomId===room?.id)?actionError.message:'';
  return <div className="ag-hub">{exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>} {workspaceView==='directory'?<><ErrorNotice error={visibleError}/><AgentDirectory initialTab={directoryTab} data={data} onRefresh={refresh} onExpertCreated={afterAgent} onOpen={(agent,view,kind)=>showIdentity(agent.id,view,kind)} onTrial={agent=>void direct(agent)} onWork={agent=>isSelfAgent(agent)?location.hash="assistant":setWorkAgent(agent)} onCreate={()=>setEditingAgent({})} onImport={()=>setCard({})} onGroup={()=>{setCreateRoomKind('group');setCreatingRoom(true);}}/></>:<div className={`ag-workspace ag-chat-only ag-room-open ${panelOpen?'with-workbench':''}`}>
    <section className="ag-conversation">{room?<>
      <header className="ag-room-header">{navigation}<Button color="secondary" variant="ghost" className="ag-room-heading" disabled={room.kind==='group'&&pending} onClick={()=>room.kind==='direct'&&members[0]?showIdentity(members[0].id):setEditingRoom(room)}>{room.kind==='group'?<AgentGroupAvatar agents={members} size={36}/>:members[0]&&<AgentAvatar agent={members[0]} size={36}/>}<span><strong>{room.title}</strong><small>{room.kind==='group'?(room.team?t(`${members.find(member=>member.id===room.team?.leadAgentId)?.name||'Agent'} 负责，${members.length} 位成员`,`${members.find(member=>member.id===room.team?.leadAgentId)?.name||'Agent'} leads ${members.length} members`):t(`${members.length} 位助理共同参与`, `${members.length} agents working together`)):members[0]?.role||t("个人助理", "Personal agent")}</small></span></Button>{room.projectId&&<a className="ag-project-reference" href={`#projects/${room.projectId}`}>{data.projects?.find(p=>p.id===room.projectId)?.name}</a>}<div className="ag-header-actions"><Badge color="secondary" size="sm">{room.mode==='demo'?t("示例", "Example"):t("实际运行", "Live model")}</Badge><Menu><Menu.Trigger><Button color="secondary" variant="ghost" uniform aria-label={t("会话操作", "Chat actions")}><DotsHorizontalMoreMenu/></Button></Menu.Trigger><Menu.Content align="end" minWidth={190}><Menu.Item disabled={pending} onSelect={()=>setEditingRoom(room)}><Edit/>{room.kind==='group'?t("名称与成员", "Name and members"):t("会话设置", "Chat settings")}</Menu.Item><Menu.Item onSelect={()=>{location.hash="self";}}><User/>{t("管理数字分身", "Manage digital twin")}</Menu.Item><Menu.Separator/><Menu.Item onSelect={()=>{setCreateRoomKind('direct');setCreatingRoom(true);}}><Plus/>{t("新的会话", "New chat")}</Menu.Item></Menu.Content></Menu><TaskResources data={data} tasks={room.taskIds.flatMap(id=>data.tasks.find(item=>item.id===id)||[])} projectId={room.projectId} agentIds={room.agentIds} onAgent={id=>showIdentity(id)} onOpen={(target,tab,id)=>{if(id)changeWorkbench({roomId:room.id,taskId:target.id,tab,artifactId:id});else openWorkbench(target,tab);}}/></div></header>
      {room.kind==='group'&&<div className="ag-member-strip">{members.map(agent=><Button color="secondary" variant="ghost" size="sm" key={agent.id} onClick={()=>setIdentityId(agent.id)}><AgentAvatar agent={agent} size={23}/>{agent.name}</Button>)}<Button color="secondary" variant="ghost" size="sm" disabled={pending} onClick={()=>setEditingRoom(room)}><Plus/>{t("成员", "Members")}</Button></div>}
      <div className="ag-message-scroll" ref={viewport} onScroll={()=>{const element=viewport.current;if(element){stickyBottom.current=element.scrollHeight-element.scrollTop-element.clientHeight<100;if(stickyBottom.current)setNewMessages(false);}}}>
        <div className="ag-message-column"><RevisionNavigation room={room} tasks={data.tasks} rooms={data.agentRooms}/>{!room.messages.length&&<div className="ag-start-conversation">{room.kind==='group'?<AgentGroupAvatar agents={members} size={62}/>:members[0]&&<AgentAvatar agent={members[0]} size={72}/>}<h2>{room.kind==='group'?t("把事情交给合适的伙伴", "Bring in the right people"):t(`和${members[0]?.name||'助理'}聊聊`, `Chat with ${members[0]?.name||'an agent'}`)}</h2><p>{room.kind==='group'?t("把共同目标写在这里，各位助理会沿用这段会话的背景。", "Share a goal here. Each agent will use the context in this chat."):members[0]?.role||t("从你眼下想推进的一件事开始。", "Start with something you want to move forward.")}</p></div>}
        {room.messages.map((message,index)=>{const agent=data.agents.find(agent=>agent.id===message.agentId);const prior=room.messages[index-1];const newDay=!prior||dayLabel(prior.createdAt)!==dayLabel(message.createdAt);const messageTask=data.tasks.find(item=>item.id===message.taskId);const files=message.taskId&&!room.messages.slice(index+1).some(item=>item.taskId===message.taskId)?data.artifacts.filter(item=>item.taskId===message.taskId&&item.classification!=='reply_snapshot'):[];return <div key={message.id} id={`room-message-${message.id}`} tabIndex={-1} className={`ag-message-entry${revealedMessageId===message.id?' is-revealed':''}`}>{newDay&&<div className="ag-day-separator"><time>{dayLabel(message.createdAt)}</time></div>}{message.role==='system'?<div className="ag-system-message"><RichText>{message.content}</RichText></div>:<article className={`ag-message ag-message-${message.role}`}>
          {message.role==='assistant'&&<Button color="secondary" variant="ghost" uniform className="ag-message-avatar" aria-label={t(`查看${agent?.name||'助理'}的资料`, `View ${agent?.name||'agent'} profile`)} disabled={!agent} onClick={()=>agent&&setIdentityId(agent.id)}>{agent?<AgentAvatar agent={agent} size={32}/>:<span className="ag-empty-avatar"><Chat/></span>}</Button>}
          <div className="ag-message-body"><div className="ag-message-author"><strong>{message.role==='user'?data.profile.name:agent?.name||t("助理", "Agent")}</strong><time>{clockTime(message.createdAt)}</time>{message.demo&&message.role==='assistant'&&<span className="ag-message-demo">{t("示例回复", "Example response")}</span>}</div>{message.replyToMessageId&&(()=>{const quoted=room.messages.find(item=>item.id===message.replyToMessageId);return quoted?<ReplyReference message={quoted} author={messageAuthor(quoted)} onOpen={()=>revealMessage(quoted.id)}/>:<small>{t("引用的消息已不可用","The referenced message is unavailable")}</small>;})()}{message.role==='user'?<MessageRevision key={`${room.id}:${message.taskId}:${message.taskMessageId}`} task={messageTask} messageId={message.taskMessageId} content={message.content} busy={busy} roomBusy={working||waitingApproval} example={example} onRefresh={refresh} onNavigate={result=>{if(result.room){selectRoom(result.room.id);if(result.startError)setActionError({roomId:result.room.id,message:result.startError.message});}else openTask(result.task.id);}}>{({editor,editAction})=><><div className="ag-message-bubble"><MessageAttachments attachments={(data.attachments||[]).filter(item=>message.attachmentIds?.includes(item.id))}/>{editor||(message.content&&<RichText>{message.content}</RichText>)}</div>{!editor&&<div className="ag-message-actions"><MessageReactions roomId={room.id} message={message} onRefresh={refresh}/><Button type="button" color="secondary" variant="ghost" size="sm" uniform aria-label={t("引用回复","Reply to message")} disabled={targetingLocked} title={targetingLocked?t("继续任务沿用原消息，完成后可发新的引用","Continue the current task; quote a new message after it finishes"):undefined} onClick={()=>{setMessageTarget({...messageTarget,replyToMessageId:message.id});requestAnimationFrame(()=>composer.current?.focus());}}><ReplyIcon/></Button>{editAction}</div>}</>}</MessageRevision>:<><div className="ag-message-bubble"><MessageAttachments attachments={(data.attachments||[]).filter(item=>message.attachmentIds?.includes(item.id))}/>{message.content&&<RichText>{message.content}</RichText>}</div><div className={`ag-message-followup${files.length?' has-files':''}`}>{messageTask&&files.length>0&&<div className="ag-message-files" aria-label={t('本次任务文件','Files from this task')}>{files.map(file=><ArtifactCard key={file.id} artifact={file} onOpen={()=>changeWorkbench({roomId:room.id,taskId:messageTask.id,tab:'files',artifactId:file.id})}/>)}</div>}<div className="ag-message-actions"><MessageReactions roomId={room.id} message={message} onRefresh={refresh}/><Button type="button" color="secondary" variant="ghost" size="sm" uniform aria-label={t("引用回复","Reply to message")} disabled={targetingLocked} title={targetingLocked?t("继续任务沿用原消息，完成后可发新的引用","Continue the current task; quote a new message after it finishes"):undefined} onClick={()=>{setMessageTarget({...messageTarget,replyToMessageId:message.id});requestAnimationFrame(()=>composer.current?.focus());}}><ReplyIcon/></Button>{message.role==='assistant'&&messageTask&&message.taskMessageId&&!example&&<FeedbackAction task={messageTask} messageId={message.taskMessageId} artifacts={data.artifacts.filter(item=>item.taskId===messageTask.id)} onRefresh={refresh}/>}</div></div></>}</div>
          {message.role==='user'&&<UserAvatar size={32} className="ag-message-user-avatar"/>}
        </article>}{message.role!=='assistant'&&messageTask&&files.length>0&&<div className="ag-message-files" aria-label={t('本次任务文件','Files from this task')}>{files.map(file=><ArtifactCard key={file.id} artifact={file} onOpen={()=>changeWorkbench({roomId:room.id,taskId:messageTask.id,tab:'files',artifactId:file.id})}/>)}</div>}</div>;})}
        {task&&<RoomTask task={task} data={data} busy={busy||example} onEvent={event=>openWorkbench(task,'activity',event)} onDecision={(approvalId,decision)=>{if(!example)void act(()=>write(`/tasks/${task.id}/approval`,{approvalId,decision}));}} onRun={()=>{if(!example)void act(()=>write(`/tasks/${task.id}/run`));}}/>}
        {!task&&lastTask&&<RoomTask task={lastTask} data={data} busy={busy||example} onEvent={event=>openWorkbench(lastTask,'activity',event)} onDecision={()=>{}} onRun={()=>{if(!example)void act(()=>write(`/tasks/${lastTask.id}/run`));}}/>}
        </div>
      </div>
      {newMessages&&<div className="ag-new-messages"><Button color="secondary" variant="outline" size="sm" onClick={()=>{stickyBottom.current=true;setNewMessages(false);viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}>{t("查看最新消息", "View latest messages")}<ChevronDown/></Button></div>}
      <div className="ag-compose-area"><div className="ag-compose-column">{progressTask&&showRoomTaskProgress(progressTask,data.artifacts)&&<TaskProgress task={progressTask} fileCount={data.artifacts.filter(item=>item.taskId===progressTask.id&&item.classification!=='reply_snapshot').length} onOpen={tab=>openWorkbench(progressTask,tab)} onEvent={event=>openWorkbench(progressTask,'activity',event)}/>}<ErrorNotice error={visibleError}/>{canContinue&&<p className="ag-compose-note">{task?.status==='interrupted'?t("上一次工作已中断。补充一句话，继续同一项任务。", "The last run was interrupted. Add a message to continue the same task."):t("助理需要更多信息。补充内容后会继续当前任务。", "The agent needs more information. Add a message to continue this task.")}</p>}{waitingApproval&&<p className="ag-compose-note">{t("先处理上方的单次批准，再继续这段工作。", "Review the one-time approval above to continue.")}</p>}
        {canContinue&&(replyMessage||messageTarget.recipientIds.length>0)&&<p className="ag-compose-note">{t('收件人与引用已留给下一条新消息，继续当前任务时不会使用。','Recipients and the reply are saved for your next new message, not for continuing this task.')}</p>}<ComposerSurface compact={false} className="ag-composer" onDragOver={attachments.onDragOver} onDrop={event=>{if(!busy&&!waitingApproval)attachments.onDrop(event);else event.preventDefault();}} onSubmit={event=>{event.preventDefault();void send();}}>
          <AttachmentDrafts controller={attachments} disabled={busy||waitingApproval}/>
          {replyMessage&&<ReplyReference message={replyMessage} author={messageAuthor(replyMessage)} onOpen={()=>revealMessage(replyMessage.id)} onClear={busy?undefined:()=>setMessageTarget({...messageTarget,replyToMessageId:undefined})}/>}
          <div className="composer-leading"><ComposerTools onAttach={()=>attachments.inputRef.current?.click()} disabled={busy||waitingApproval}><ConnectorPicker data={data} value={task?task.connectorIds||[]:room.connectorIds||[]} onChange={contextLocked?undefined:ids=>{void setRuntimeConfiguration({connectorIds:ids});}} disabled={contextLocked}/><DigitalTwinMode enabled={contextEnabled} onChange={contextLocked?undefined:enabled=>{void setRuntimeConfiguration({digitalTwinEnabled:enabled});}} disabled={contextLocked}/><Button type="button" color="secondary" variant="ghost" size="sm" onClick={()=>void send(true)} disabled={(!draft.trim()&&!attachments.items.length)||attachments.busy||attachments.hasErrors||pending||busy}><Document/>{t('作为独立任务打开','Open as a separate task')}</Button></ComposerTools><ApprovalPicker value={task?(Object.hasOwn(task,'approvalMode')?task.approvalMode:'ask'):room.approvalMode} defaultValue={data.executionSettings?.approvalMode} onChange={value=>{void setRuntimeConfiguration({approvalMode:value});}} disabled={contextLocked}/></div>
          <div className="composer-input"><RoomComposerInput onPaste={event=>{if(!attachments.onPaste(event))pasteComposerLinks(event,draft,editDraft);}} key={room.id} inputRef={composer} value={draft} onChange={editDraft} members={room.kind==='group'?members:[]} onMention={editDraft} label={t(`给${room.title}的消息`,`Message ${room.title}`)} placeholder={canContinue?t('补充要求，继续当前任务','Add instructions to continue'):t('发送消息','Send a message')} disabled={busy||waitingApproval} locked={targetingLocked} onSend={()=>void send()}/></div>
          <div className="composer-trailing"><ModelPicker example={example} settings={data.settings} connections={data.modelConnections} defaultConnectionId={data.defaultConnectionId} connectionId={room.kind==='direct'?task?.connectionId||members[0]?.connectionId:undefined} onConnection={room.kind==='direct'&&members[0]?chooseDirectConnection:undefined} agentModels={groupModels} onAgent={id=>showIdentity(id)} mode={task?.mode||room.mode} disabled={contextLocked} onMode={mode=>setRuntimeConfiguration({mode})} onSettings={()=>{location.hash='settings/model';}}/><ContextUsage usage={(task||lastTask)?.contextUsage}/><VoiceInput key={room.id} contextKey={`${room.id}:${task?.id||'new'}`} disabled={busy||waitingApproval} onTranscript={text=>{editDraft(draft.trim()?`${draft.trimEnd()}\n${text}`:text);requestAnimationFrame(()=>composer.current?.focus());}}/>{working?<Button color="primary" uniform aria-label={t('停止当前任务','Stop current task')} disabled={busy} onClick={()=>void act(()=>write(`/tasks/${task.id}/cancel`))}><Stop/></Button>:<Button color="primary" uniform type="submit" loading={busy} disabled={(!draft.trim()&&!attachments.items.length)||attachments.busy||attachments.hasErrors||busy||waitingApproval||task?.status==='queued'} aria-label={canContinue?t('补充并继续','Send and continue'):t('发送消息','Send message')}><ArrowUp/></Button>}</div>
        </ComposerSurface>

      </div></div>
    </>:isRoomRoute?<div className="ag-welcome"><h2>{t('这段会话已不可用','This conversation is unavailable')}</h2><p>{t('它可能已被移除，或属于另一个本地空间。','It may have been removed or belong to another local space.')}</p><Button color="secondary" variant="outline" onClick={()=>{location.hash='agents';}}>{t('返回助理列表','Back to agents')}</Button></div>:<div className="ag-welcome"><div className="ag-welcome-portraits">{data.agents.slice(0,3).map(agent=><AgentAvatar key={agent.id} agent={agent} size={64}/>)}</div><h2>{t("找一位助理聊聊", "Start a conversation")}</h2><p>{t("日常交流留在私聊里，需要不同角色一起思考时，开一个群聊。", "Use a direct chat for ongoing conversations, or bring multiple roles into a group.")}</p><div className="ag-welcome-actions"><Button color="primary" size="lg" disabled={!data.agents.length} onClick={()=>setCreatingRoom(true)}><Chat/>{t("开始会话", "Start a chat")}</Button><Button color="secondary" variant="outline" size="lg" onClick={()=>setEditingAgent({})}><Plus/>{t("创建助理", "Create agent")}</Button></div><ErrorNotice error={visibleError}/><div className="ag-welcome-roster">{data.agents.slice(0,4).map(agent=><Button color="secondary" variant="ghost" className="ag-welcome-person" key={agent.id} onClick={()=>void direct(agent)}><AgentAvatar agent={agent} size={36}/><span><strong>{agent.name}</strong><small>{agent.role}</small></span><ArrowRight/></Button>)}</div></div>}</section>{workbenchTask&&workbench&&<RoomWorkbenchPanel data={data} task={workbenchTask} selection={workbench} onChange={tab=>setWorkbench({...workbench,tab})} onClose={()=>changeWorkbench(undefined)} onEvent={event=>openWorkbench(workbenchTask,'activity',event)} onArtifact={openWorkbenchArtifact} onDirtyChange={setArtifactDirty} onRefresh={refresh}/>}</div>}
    {workAgent&&<AgentWorkDialog agent={workAgent} data={data} onClose={()=>setWorkAgent(undefined)} onCreated={async result=>{await refresh();setWorkAgent(undefined);selectRoom(result.room.id);openTask(result.task.id);}}/>}
    {creatingRoom&&<RoomEditor data={data} initialKind={createRoomKind} onClose={()=>setCreatingRoom(false)} onSaved={afterRoom}/>}{editingRoom&&<RoomEditor data={data} room={editingRoom} onClose={()=>setEditingRoom(undefined)} onSaved={afterRoom}/>}{editingAgent&&<AgentEditor data={data} agent={editingAgent.agent} onClose={()=>setEditingAgent(undefined)} onSaved={afterAgent}/>}{card&&<AgentCardDialog data={data} agent={card.agent} onClose={()=>setCard(undefined)} onImported={async agent=>{await refresh();setCard(undefined);setIdentityId(agent.id);}}/>}
    {identity&&<AgentIdentityDrawer agent={identity} data={data} initialView={identityView} resourceKind={identityResourceKind} onRefresh={refresh} onClose={()=>setIdentityId(undefined)} onDirect={()=>void direct(identity)} onWork={()=>{if(isSelfAgent(identity))location.hash="assistant";else setWorkAgent(identity);setIdentityId(undefined);}} onEdit={()=>{if(isSelfAgent(identity))location.hash="self";else setEditingAgent({agent:identity});setIdentityId(undefined);}} onShare={()=>{setCard({agent:identity});setIdentityId(undefined);}} onTask={openTask}/>}

  </div>;
}

function RoomTask({task,data,busy,onEvent,onDecision,onRun}:{task:Task;data:Bootstrap;busy:boolean;onEvent:(event:TaskEvent)=>void;onDecision:(approvalId:string,decision:'approve'|'reject')=>void;onRun:()=>void}){
  if(task.forkedFrom&&task.mode==='demo')return <p className="message-revision-note" role="status">{t('修改版本已保存。示例可查看与继续编辑，不会执行任务。','Revision saved. You can review and edit this example; it will not run.')}</p>;
  if(!showRoomTaskSummary(task,data.artifacts))return null;
  const pendingApprovals=task.approvals.filter(approval=>approval.status==='pending');
  const actionable=!!task.error||pendingApprovals.length>0||task.status==='queued'||task.status==='interrupted';
  if(!actionable&&!showRoomTaskProgress(task,data.artifacts))return null;
  return <>
    {actionable&&<section className="ag-room-task" aria-label={t('会话中的任务','Task in this chat')}>
      {task.error&&<p className="ag-task-error">{task.error}</p>}
      {pendingApprovals.map(approval=><TaskApproval key={approval.id} approval={approval} busy={busy} onDecision={decision=>onDecision(approval.id,decision)}/>)}
      {(task.status==='queued'||task.status==='interrupted')&&<Button color="secondary" variant="outline" size="sm" disabled={busy} onClick={onRun}>{task.status==='queued'?t('开始这项任务','Start task'):t('继续这项任务','Continue task')}</Button>}
    </section>}
    <TaskActivity task={task} agents={data.agents} onEvent={onEvent}/>
  </>;
}
