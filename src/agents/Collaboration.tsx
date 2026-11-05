import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowRight,ArrowDown,ChevronLeft,ChevronRight,Document,Lock,Chat,Code,Clock} from '@openai/apps-sdk-ui/components/Icon';
import type {Artifact,Bootstrap,Task,TeamRun,TeamRunNode} from '../../shared/contracts';
import {RichText} from '../components';
import {t,getLocale} from '../i18n';
import {ArtifactThumbnail} from '../artifacts/ArtifactPreview';
import {artifactDisplayName,artifactFormat} from '../artifacts/format.mjs';
import {AgentAvatar} from './AgentIdentity';
import {collaborationRecords,collaborationMembers} from './collaborationModel';
import {workflowFiles,workflowPrimaryFile} from './workflowRunPresentation';
import {workflowReplyText,workflowAssignmentText} from './workflowMessage';
import type {WorkflowSelection} from './workflowModel';
import './conversation-detail.css';
import './collaboration.css';

export function CollaborationEvent({task,run,data,onOpen}:{task:Task;run:TeamRun;data:Bootstrap;onOpen:(selection:WorkflowSelection)=>void}){
  const count=collaborationRecords(task,run).length,members=collaborationMembers(run);
  const live=run.status==='running',waiting=['queued','awaiting_approval','needs_input'].includes(run.status);
  const problem=['failed','interrupted','cancelled'].includes(run.status);
  const label=waiting?(run.status==='queued'?t('协作等待开始','Collaboration queued'):run.status==='needs_input'?t('协作等待补充信息','Collaboration needs input'):t('协作等待确认','Collaboration needs approval')):live?t('正在协作','Working together'):problem?(run.status==='failed'?t('协作遇到问题','Collaboration failed'):t('协作已暂停','Collaboration paused')):t(`${count} 条协作记录`,`${count} collaboration records`);
  return <div className="collaboration-event" data-status={run.status}>
    <Button color="secondary" variant="ghost" size="sm" onClick={()=>onOpen({stageId:'',runId:run.id,view:'collaboration'})} aria-label={t(`查看协作记录：${label}`,`View collaboration: ${label}`)}>
      <span className="collaboration-event-state" aria-hidden="true">{live?<span className="collaboration-pulse"/>:waiting||problem?<Clock/>:<Chat/>}</span>
      <span className="collaboration-event-label">{label}</span>
      <span className="collaboration-event-people" aria-hidden="true">{members.slice(0,4).map(node=><AgentAvatar key={node.agentId} agent={data.agents.find(agent=>agent.id===node.agentId)??{id:node.agentId,name:node.name}} size={18}/>)}</span>
      {!!members.length&&<span className="collaboration-event-count">{t(`${members.length} 位成员`,`${members.length} members`)}</span>}
      <ChevronRight/>
    </Button>
  </div>;
}

export function CollaborationDeliverables({run,artifacts,onOpen}:{run:TeamRun;artifacts:Artifact[];onOpen:(id:string)=>void}){
  const files=workflowFiles(run,artifacts),primary=files.find(file=>file.id===workflowPrimaryFile(run))??(files.length===1?files[0]:undefined);
  const [expanded,setExpanded]=useState(false);
  if(!files.length)return null;
  const rest=files.filter(file=>file!==primary);
  return <div className="collaboration-deliverables" aria-label={t('本次成果','Deliverables')}>
    {primary&&<Button color="secondary" variant="outline" pill={false} className="collaboration-file" onClick={()=>onOpen(primary.id)} aria-label={t(`打开成果 ${artifactDisplayName(primary)}`,`Open deliverable ${artifactDisplayName(primary)}`)}><ArtifactThumbnail artifact={primary}/><span><strong>{artifactDisplayName(primary)}</strong><small>{artifactFormat(primary).label}</small></span><ArrowRight/></Button>}
    {!!rest.length&&<div className="collaboration-supporting"><Button color="secondary" variant="ghost" size="sm" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{primary?t(`另有 ${rest.length} 份协作文件`,`${rest.length} supporting files`):t(`${rest.length} 份成果`,`${rest.length} deliverables`)}<ChevronRight className={expanded?'is-open':''}/></Button>{expanded&&<div>{rest.map(file=><Button color="secondary" variant="ghost" size="sm" key={file.id} onClick={()=>onOpen(file.id)}><Document/><span>{file.teamOrigin?`${run.nodes.find(node=>node.id===file.teamOrigin?.nodeId)?.name??t('成员','Member')}：`:''}{artifactDisplayName(file)}</span><ArrowRight/></Button>)}</div>}</div>}
  </div>;
}

function CollaborationText({content,expanded,onToggle}:{content:string;expanded:boolean;onToggle:()=>void}){
  const long=content.length>260;
  return <><div className={`collaboration-record-bubble${long&&!expanded?' is-collapsed':''}`}><RichText>{content}</RichText></div>{long&&<Button className="collaboration-text-toggle" color="secondary" variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>{expanded?t('收起全文','Show less'):t('展开全文','Show more')}</Button>}</>;
}

export function CollaborationSpace({task,run,data,onGraph,onBack,onMember,onArtifact,viewState}:{viewState:{member:string;scrollTop:number;expanded:Record<string,boolean>};task:Task;run:TeamRun;data:Bootstrap;onGraph:()=>void;onBack?:()=>void;onMember:(node:TeamRunNode)=>void;onArtifact?:(id:string)=>void}){
  const records=useMemo(()=>collaborationRecords(task,run),[task,run]);
  const [expanded,setExpanded]=useState(viewState.expanded);
  const [member,setMember]=useState(viewState.member),[newOutput,setNewOutput]=useState(false);
  const viewport=useRef<HTMLDivElement>(null),following=useRef(true),lastSeen=useRef('');
  const members=collaborationMembers(run),visible=records.filter(record=>!member||record.agentId===member||record.recipientId===member);
  useLayoutEffect(()=>{if(viewport.current)viewport.current.scrollTop=viewState.scrollTop;if(document.activeElement===document.body)viewport.current?.parentElement?.querySelector<HTMLButtonElement>('.collaboration-space-header button')?.focus({preventScroll:true});},[run.id]);
  const signature=records.map(record=>record.id+':'+record.content.length).join('|');
  useEffect(()=>{const el=viewport.current;if(!el)return;if(lastSeen.current&&lastSeen.current!==signature){if(following.current)el.scrollTop=el.scrollHeight;else setNewOutput(true);}lastSeen.current=signature;},[signature]);
  const person=(id:string)=>data.agents.find(agent=>agent.id===id)??{id,name:run.nodes.find(node=>node.agentId===id)?.name??t('助理','Agent')};
  const time=(value:string)=>new Date(value).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'});
  const date=(value:string)=>new Date(value).toLocaleDateString(getLocale(),{month:'short',day:'numeric'});
  const openFile=(id:string)=>{if(data.artifacts.some(file=>file.id===id))onArtifact?.(id);};
  return <section className="collaboration-space" aria-label={t('协作记录','Collaboration')}>
    <header className="collaboration-space-header conversation-detail-header">{onBack&&<Button color="secondary" variant="ghost" size="sm" uniform onClick={onBack} aria-label={t('返回对话','Back to chat')}><ChevronLeft/></Button>}<div><h2>{t('协作记录','Collaboration')}</h2><span>{task.title}</span></div><Button color="secondary" variant="ghost" size="sm" onClick={onGraph}><Code/>{t('流程','Workflow')}</Button></header>
    {members.length>1&&<nav className="collaboration-filters" aria-label={t('按成员查看协作','Filter by member')}><Button color="secondary" variant="ghost" size="sm" selected={!member} aria-pressed={!member} onClick={()=>{setMember('');viewState.member='';}}>{t('全部','All')}</Button>{members.map(node=><Button color="secondary" variant="ghost" size="sm" selected={member===node.agentId} aria-pressed={member===node.agentId} key={node.agentId} onClick={()=>{setMember(node.agentId);viewState.member=node.agentId;}}><AgentAvatar agent={person(node.agentId)} size={18}/>{person(node.agentId).name}</Button>)}</nav>}
    <div className="collaboration-space-scroll" ref={viewport} onScroll={event=>{const el=event.currentTarget;viewState.scrollTop=el.scrollTop;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;if(following.current)setNewOutput(false);}}>
      <div className="collaboration-records" role="log" aria-label={t('任务分派、回复与文件交接','Assignments, replies and file handoffs')} aria-relevant="additions" aria-live="polite">
        {!visible.length&&<div className="collaboration-empty"><Chat/><p>{t('分工开始后，任务和回复会出现在这里。','Assignments and replies will appear here once work begins.')}</p></div>}
        {visible.map((record,index)=>{const node=run.nodes.find(node=>node.id===record.nodeId)!,agent=person(record.agentId),prior=visible[index-1],isNewTime=!prior||Date.parse(record.createdAt)-Date.parse(prior.createdAt)>300000||date(record.createdAt)!==date(prior.createdAt);const grouped=!isNewTime&&prior?.kind==='message'&&record.kind==='message'&&prior.agentId===record.agentId&&prior.recipientId===record.recipientId&&prior.nodeId===record.nodeId;return <div key={record.id} className={`collaboration-record${grouped?' is-continuation':''}`} data-kind={record.kind}>
          {isNewTime&&<time className="collaboration-time" dateTime={record.createdAt}>{date(record.createdAt)} {time(record.createdAt)}</time>}
          {record.kind==='handoff'?<div className="collaboration-handoff"><Document/><span>{t('已交接给','Files shared with')} {agent.name}</span><div>{record.artifactIds?.map(id=><Button key={id} color="secondary" variant="ghost" size="sm" disabled={!onArtifact||!data.artifacts.some(file=>file.id===id)} onClick={()=>openFile(id)}>{artifactDisplayName(data.artifacts.find(file=>file.id===id)??{name:node.inputArtifacts?.find(file=>file.artifactId===id)?.name??id})}</Button>)}</div></div>:<article>
            {!grouped&&<AgentAvatar agent={agent} size={24}/>}<div className="collaboration-record-body"><header className={grouped?'sr-only':undefined}><strong>{agent.name}</strong>{record.recipientId&&<><ArrowRight/><span>{person(record.recipientId).name}</span></>}<small>{record.kind==='assignment'?t('分派任务','Assignment'):record.kind==='result'?t('返回结果','Result'):record.kind==='problem'?t('遇到问题','Problem'):t('进展','Update')}</small></header>
              <CollaborationText expanded={!!expanded[record.id]} onToggle={()=>{const next={...expanded,[record.id]:!expanded[record.id]};setExpanded(next);viewState.expanded=next;}} content={workflowReplyText(record.kind==='assignment'?workflowAssignmentText(node,run):record.content,data.artifacts.filter(file=>file.taskId===task.id))}/>
              {record.truncated&&<p className="collaboration-truncated">{t('这条回复保存的是节选，可打开执行过程查看。','This saved reply is an excerpt. Open the execution for more context.')}</p>}
              {record.kind==='assignment'&&<Button className="collaboration-execution-link" color="secondary" variant="ghost" size="sm" onClick={()=>onMember(node)}>{t('查看执行过程','View execution')}<ChevronRight/></Button>}
              {record.kind==='result'&&!!record.artifactIds?.length&&<div className="collaboration-record-files">{record.artifactIds.map(id=>{const file=data.artifacts.find(file=>file.id===id);return file&&<Button key={id} color="secondary" variant="ghost" size="sm" onClick={()=>openFile(id)}><Document/>{artifactDisplayName(file)}<ArrowRight/></Button>;})}</div>}
            </div>
          </article>}
        </div>;})}
      </div>
      {['running','queued','awaiting_approval'].includes(run.status)&&<div className="collaboration-live" role="status"><span className={run.status==='running'?'collaboration-pulse':''}/>{run.status==='awaiting_approval'?t('等待确认后继续','Waiting for approval'):run.status==='queued'?t('等待开始','Waiting to start'):t('协作进行中','Work is in progress')}</div>}
    </div>
    {newOutput&&<Button className="collaboration-new" size="sm" color="secondary" onClick={()=>{following.current=true;setNewOutput(false);viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:'auto'});}}><ArrowDown/>{t('查看新进展','New updates')}</Button>}
    <footer className="collaboration-readonly"><Lock/>{t('只读','Read-only')}<span>{t('回到对话中补充要求','Return to the chat to give instructions')}</span></footer>
  </section>;
}
