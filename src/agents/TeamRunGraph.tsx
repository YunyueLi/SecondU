import {CollaborationSpace} from './Collaboration';
import {WorkflowIdentityProvider} from './zcode/identity';
import {BookmarkIcon} from 'lucide-react';
import {WorkflowRunPhaseList as ZCodePhaseList} from './zcode/app-shell/WorkflowRunPhaseList';
import {WorkflowRunStatusHeader as ZCodeRunHeader} from './zcode/app-shell/WorkflowRunSidePaneSections';
import {Button as ZCodeButton} from './zcode/components/ui/button';
import {zcodeWorkflow} from './zcodeAdapter';
import {WorkflowSession} from './WorkflowSession';
import {WorkflowArtifacts} from './WorkflowArtifacts';
import {workflowFiles,workflowPrimaryFile,workflowRunModel} from './workflowRunPresentation';
import {workflowDisplayTitle} from './workflowMessage';
import {WorkflowProgramDetails} from './WorkflowProgram';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {CheckCircle,ChevronDown,ChevronRight,ChevronLeft,Clock,Code,Document,Stop,ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import type {AgentProfile,Bootstrap,Task,TaskEvent,TeamWorkflowStage} from '../../shared/contracts';
import {AgentAvatar} from './AgentIdentity';
import {ErrorNotice,TaskBadge,RichText,taskLabels} from '../components';
import {write,messageOf} from '../api';
import {t} from '../i18n';
import {artifactDisplayName} from '../artifacts/format.mjs';
import {WorkflowModelSelect,WorkflowModelBadge,workflowModelSource} from './WorkflowModels';
import {WorkflowConcurrency,WorkflowState,WorkflowDiagram} from './WorkflowCard';
import {workflowStages,stageStatus,stageNodes,latestStageNode,workflowModel,type WorkflowSelection} from './workflowModel';
import './workflow.css';

/** Run snapshots retain their original stages and model choices after later turns. */
export function TeamRunGraph({task,agents,data,onRefresh,onArtifact,onActivity,onEvent,initialSelection,onSelectionChange,onClose}:{onClose?:()=>void;initialSelection?:WorkflowSelection;onSelectionChange?:(selection:WorkflowSelection)=>void;task:Task;agents:AgentProfile[];data?:Bootstrap;onRefresh?:()=>Promise<void>;onArtifact?:(id:string)=>void;onActivity?:()=>void;onEvent?:(event:TaskEvent)=>void}){
  const [viewMode,setViewMode]=useState<'collaboration'|'graph'>(initialSelection?.view??'graph');
  const [runId,setRunId]=useState(initialSelection?.runId??''),[selection,setSelection]=useState<{stageId:string;agentId:string;nodeId?:string}>(),[expanded,setExpanded]=useState<Record<string,boolean>>({}),[openStages,setOpenStages]=useState<Record<string,boolean>>({}),[configuration,setConfiguration]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[savedRoom,setSavedRoom]=useState('');
  const collaborationView=useRef({member:'',scrollTop:0,expanded:{} as Record<string,boolean>});
  const inspector=useRef<HTMLElement>(null),[wide,setWide]=useState(false);
  useLayoutEffect(()=>{const element=inspector.current;if(!element)return;const measure=()=>setWide(element.clientWidth>=720);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[selection?.agentId,viewMode]);
  useEffect(()=>{if(!initialSelection)return;setRunId(initialSelection.runId??'');setViewMode(initialSelection.view??'graph');setSelection(initialSelection.agentId?{stageId:initialSelection.stageId,agentId:initialSelection.agentId,nodeId:initialSelection.nodeId}:undefined);setOpenStages(current=>({...current,[initialSelection.stageId]:true}));},[initialSelection]);
  useEffect(()=>{if(!initialSelection||initialSelection.agentId)return;const frame=requestAnimationFrame(()=>{inspector.current?.querySelector<HTMLElement>(`[data-stage-id="${CSS.escape(initialSelection.stageId)}"]`)?.scrollIntoView({block:'nearest'});});return()=>cancelAnimationFrame(frame);},[initialSelection,openStages]);
  useEffect(()=>{const body=inspector.current?.closest('.workbench-panel-content');if(body)body.scrollTop=0;},[selection?.stageId,selection?.agentId]);
  const runs=(task.teamRuns??[]).filter(item=>item.execution!=='conversation'),run=runs.find(item=>item.id===runId)??runs.at(-1);
  if(!run)return null;
  const plan=task.workflowPlans?.find(item=>item.id===run.workflowPlanId),pending=plan?.status==='pending'&&task.status==='awaiting_approval',stages=workflowStages(task,run);
  const notRun=plan&&['rejected','revision_requested'].includes(plan.status)&&!run.nodes.some(node=>node.kind==='worker');
  const current=run.id===runs.at(-1)?.id,active=current&&['running','awaiting_approval'].includes(task.status),editable=!!data&&!!onRefresh&&task.mode==='live';
  const selectedStage=stages.find(stage=>stage.id===selection?.stageId),selectedNode=selectedStage&&selection?(selection.nodeId?run.nodes.find(n=>n.id===selection.nodeId&&n.stageId===selectedStage.id&&n.agentId===selection.agentId):latestStageNode(run,selectedStage,selection.agentId)):undefined,selectedAgent=agents.find(agent=>agent.id===selection?.agentId);
  const connectionId=selectedStage?.connectionIds?.[selection?.agentId??'']??'inherit';
  const selectedModel=data&&selectedStage&&selection?workflowModel(task,run,selectedStage,selection.agentId,data):undefined;
  const inheritedModel=data&&selectedStage&&selection?workflowModel(task,run,selectedStage,selection.agentId,data,{inherit:true}):undefined;
  const completed=stages.filter(stage=>stageStatus(run,stage)==='completed').length,files=run.nodes.flatMap(node=>node.artifacts??[]).filter((file,index,all)=>all.findIndex(item=>item.id===file.id)===index);
  async function act(operation:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await operation();await onRefresh?.();}catch(reason){setError(messageOf(reason));await onRefresh?.();}finally{setBusy(false);}}
  function chooseModel(id:string){if(!selection||!selectedStage)return;const agentId=selection.agentId;void act(()=>pending?write(`/tasks/${task.id}/workflow`,{action:'configure',planId:plan.id,revision:plan.revision,stageConnections:{[selectedStage.id]:Object.fromEntries(Object.entries({...selectedStage.connectionIds,[agentId]:id}).filter(([,value])=>value!=='inherit'))}}):write(`/tasks/${task.id}/workflow`,{action:'model',runId:run!.id,stageId:selectedStage.id,agentId,connectionId:id==='inherit'?null:id}));}
  function select(next:typeof selection){setSelection(next);onSelectionChange?.({stageId:next?.stageId??selection?.stageId??'',agentId:next?.agentId,nodeId:next?.nodeId,runId:run!.id,view:viewMode});}
  function member(stage:TeamWorkflowStage,agentId:string){
    const agent=agents.find(item=>item.id===agentId),node=latestStageNode(run,stage,agentId),model=data?workflowModel(task,run,stage,agentId,data):undefined;
    const statusLabel=node?taskLabels[node.status]:run?.blockedStageIds?.includes(stage.id)?t('前序未完成','Prerequisite incomplete'):t('待开始','Not started');
    return <button type="button" key={agentId} className="workflow-member-row" onClick={()=>select({stageId:stage.id,agentId})}>
      <AgentAvatar agent={agent??{id:agentId,name:node?.name??agentId}} size={24}/><span className="workflow-member-copy"><strong>{agent?.name??node?.name??agentId}</strong>{model&&<WorkflowModelBadge value={model} compact/>}</span><span className="workflow-member-status" title={statusLabel}><small>{statusLabel}</small><WorkflowState status={node?.status??'queued'}/></span><ChevronRight/>
    </button>;
  }
  function chooseView(view:'collaboration'|'graph'){setViewMode(view);setSelection(undefined);onSelectionChange?.({stageId:'',runId:run!.id,view});}
  if(selectedStage&&selection)return <WorkflowSession key={`${run.id}:${selection.agentId}:${selectedNode?.id??'pending'}`} task={task} run={run} stage={selectedStage} node={selectedNode} agent={selectedAgent??{id:selection.agentId,name:selectedNode?.name??selection.agentId}} model={selectedModel} instances={stageNodes(run,selectedStage).filter(n=>n.agentId===selection.agentId)} onSelectNode={nodeId=>select({...selection,nodeId})} controls={editable&&active&&!selectedNode&&data?<WorkflowModelSelect value={connectionId} onChange={chooseModel} connections={data.modelConnections} inherited={inheritedModel?[inheritedModel]:[]} scope="assignment" disabled={busy}/>:undefined} backLabel={viewMode==='collaboration'?t('返回协作记录','Back to collaboration'):undefined} onBack={()=>select(undefined)} onArtifact={onArtifact} onEvent={onEvent} artifacts={data?data.artifacts.filter(file=>selectedNode?.artifacts?.some(item=>item.id===file.id)):[]}/>;
  if(viewMode==='collaboration'&&data)return <CollaborationSpace viewState={collaborationView.current} task={task} run={run} data={data} onGraph={()=>chooseView('graph')} onBack={onClose} onMember={node=>select({stageId:node.stageId??'assignments',agentId:node.agentId,nodeId:node.id})} onArtifact={onArtifact}/>;
  const view=zcodeWorkflow(stages,agents,run,task,data),resumable=!!(editable&&!active&&current&&run.configuration&&['interrupted','cancelled'].includes(run.status));
  const save=editable&&!pending?<ZCodeButton size="sm" variant="ghost" disabled={busy} onClick={()=>savedRoom?location.hash=`agents/${savedRoom}`:void act(async()=>{const room=await write<{id:string}>(`/tasks/${task.id}/save-workflow`,{runId:run.id});setSavedRoom(room.id);})}><BookmarkIcon className="size-3.5"/>{savedRoom?t('再次运行','Run again'):t('保存','Save')}</ZCodeButton>:undefined;
  return <WorkflowIdentityProvider agents={agents}><section ref={inspector} data-layout={wide?'horizontal':'vertical'} className="zcode-workflow zc-host-pane" aria-label={t('工作流详情','Workflow details')}>
    {data&&<div className="collaboration-graph-back"><Button color="secondary" variant="ghost" size="sm" onClick={()=>chooseView('collaboration')}><ChevronLeft/>{t('协作记录','Collaboration')}</Button></div>}
    <ZCodeRunHeader title={workflowDisplayTitle(task,run.title)} run={view.run} usage={undefined} summaryLabels={[...(workflowRunModel(run)?[t('模型','Model')]:[]),t('阶段','Phases'),t('分工','Assignments')]} summaryParts={[...(workflowRunModel(run)?[workflowRunModel(run)]:[]),`${completed}/${stages.length}`,`${run.nodes.filter(n=>n.kind==='worker').length}`]} subagentModel={workflowRunModel(run)?{name:workflowRunModel(run),title:workflowRunModel(run)}:undefined} cancellable={editable&&active&&!busy} onCancel={()=>void act(()=>write(`/tasks/${task.id}/cancel`))} resumable={resumable&&!busy} onResume={()=>void act(()=>write(`/tasks/${task.id}/resume-workflow`,{runId:run.id}))} configureOpen={configuration} onConfigureFrom={editable&&active?()=>setConfiguration(!configuration):undefined} saveSlots={{trailing:save}}/>
    {runs.length>1&&<nav className="zc-host-actions" aria-label={t('运行记录','Run history')}>{runs.map((item,index)=><ZCodeButton size="sm" variant="ghost" key={item.id} selected={item.id===run.id} onClick={()=>{setRunId(item.id);setSelection(undefined);onSelectionChange?.({stageId:'',runId:item.id,view:'graph'});setError('');setSavedRoom('');}}>{t(`第 ${index+1} 轮`,`Run ${index+1}`)}</ZCodeButton>)}</nav>}
    {configuration&&editable&&active&&<div className="zc-host-config"><WorkflowConcurrency value={(pending?plan.team.concurrency:run.limits?.concurrency)??4} disabled={busy} onChange={concurrency=>void act(()=>write(`/tasks/${task.id}/workflow`,pending?{action:'configure',planId:plan.id,revision:plan.revision,concurrency}:{action:'concurrency',runId:run.id,concurrency}))}/></div>}
    <ErrorNotice error={error}/>
    {wide?<div className="zc-host-timeline"><WorkflowDiagram stages={stages} agents={agents} run={run} task={task} data={data} onDetails={next=>{if(!next)return;if(next.agentId){select({stageId:next.stageId,agentId:next.agentId,nodeId:next.nodeId});return;}const stage=stages.find(stage=>stage.id===next.stageId);if(stage?.agentIds[0])select({stageId:stage.id,agentId:stage.agentIds[0]});}}/></div>:(

    <ZCodePhaseList dependencyEdges={view.dependencies} graph={view.graph} model={view.model} run={view.run} pendingQuestions={[]} landing={initialSelection?.stageId?{phaseId:initialSelection.stageId,key:`${run.id}:${initialSelection.stageId}`}:undefined} onOpenActor={actor=>{const next=view.selections.get(`${actor.siteId}@${actor.ordinal}`);if(next)select(next);}}/>
    )}
    <WorkflowArtifacts artifacts={workflowFiles(run,data?.artifacts??[])} primaryId={workflowPrimaryFile(run)} onOpen={onArtifact}/>
  </section></WorkflowIdentityProvider>;
}
