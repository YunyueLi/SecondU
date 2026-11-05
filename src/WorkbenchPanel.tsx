import type {WorkflowSelection} from './agents/workflowModel';
import { useId, useEffect, useRef } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { CloseBold, Document, Code, Desktop } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap, Task, TaskEvent } from '../shared/contracts';
import { ArtifactEditor, type ArtifactViewState } from './ArtifactWorkspace';
import { TaskWorkbench, type WorkbenchTab } from './TaskWorkbench';
import { t } from './i18n';
import { WorkbenchExpandButton } from './workbench/WorkbenchPane';

/** Shared chrome for the task and room inspectors. The chat owns neither row. */
export function WorkbenchPanel({data,task,tab,artifactId,eventId,workflowSelection,onTab,onClose,onArtifact,onEvent,onDirtyChange,onRefresh,editorView,onEditorViewChange}:{
  data:Bootstrap;task:Task;tab:WorkbenchTab;artifactId?:string;eventId?:string;workflowSelection?:WorkflowSelection;
  onTab:(tab:WorkbenchTab)=>void;onClose:()=>void;onArtifact:(id?:string)=>void;onEvent:(event:TaskEvent)=>void;
  onDirtyChange:(dirty:boolean)=>void;onRefresh:()=>Promise<void>;
  editorView?:ArtifactViewState;onEditorViewChange?:(view:ArtifactViewState)=>void;
}) {
  const id=useId();
  const workflowView=useRef<{taskId:string;source?:WorkflowSelection;selection?:WorkflowSelection}>({taskId:task.id});
  const cached=workflowView.current.taskId===task.id?workflowView.current:undefined;
  const effectiveWorkflowSelection=workflowSelection&&workflowSelection!==cached?.source?workflowSelection:cached?.selection??workflowSelection;
  useEffect(()=>{if(workflowView.current.taskId!==task.id)workflowView.current={taskId:task.id};if(workflowSelection)workflowView.current={taskId:task.id,source:workflowSelection,selection:workflowSelection};},[task.id,workflowSelection]);
  const artifact=data.artifacts.find(item=>item.id===artifactId&&item.taskId===task.id);
  const hasWorkflow=!!task.teamRuns?.length;
  const selectedTab=hasWorkflow&&tab==='activity'?'workflow':tab;
  useEffect(()=>{if(document.activeElement===document.body)document.getElementById(`${id}-${selectedTab}`)?.focus();},[artifact?.id,id,selectedTab]);
  const tabs=[hasWorkflow?{id:'workflow' as const,label:t('协作','Collaboration'),Icon:Code}:{id:'activity' as const,label:t('工作过程','Activity'),Icon:Code},{id:'files' as const,label:t('文件','Files'),Icon:Document},{id:'computer' as const,label:t('电脑','Computer'),Icon:Desktop}];
  return <div className="workbench-panel">
    <header className="workbench-panel-bar">
      <div className="workbench-panel-tabs" role="tablist" aria-label={t('任务内容','Task content')} onKeyDown={event=>{
        const index=tabs.findIndex(item=>item.id===selectedTab);
        const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
        if(next<0)return;event.preventDefault();onTab(tabs[next].id);document.getElementById(`${id}-${tabs[next].id}`)?.focus();
      }}>{tabs.map(item=><Button key={item.id} id={`${id}-${item.id}`} role="tab" tabIndex={selectedTab===item.id?0:-1} aria-selected={selectedTab===item.id} aria-controls={`${id}-content`} selected={selectedTab===item.id} color="secondary" variant="ghost" size="sm" onClick={()=>onTab(item.id)}><item.Icon/><span>{item.label}</span></Button>)}</div>
      <div className="workbench-panel-actions"><WorkbenchExpandButton/><Button data-close-workbench color="secondary" variant="ghost" uniform size="sm" aria-label={t('关闭右侧栏','Close side panel')} title={t('关闭右侧栏','Close side panel')} onClick={onClose}><CloseBold/></Button></div>
    </header>
    <div id={`${id}-content`} className="workbench-panel-content" data-view={tab} role="tabpanel" aria-labelledby={`${id}-${selectedTab}`}>
      {artifact&&<div className="workbench-document" hidden={tab!=='files'}><ArtifactEditor key={artifact.id} artifact={artifact} compact readOnly={false} onDirtyChange={onDirtyChange} onRefresh={onRefresh} onBack={()=>onArtifact(undefined)} viewState={editorView} onViewStateChange={onEditorViewChange}/></div>}
      {hasWorkflow&&<div className="workbench-workflow-view" hidden={tab!=='workflow'}><TaskWorkbench data={data} task={task} tab="workflow" eventId={eventId} workflowSelection={effectiveWorkflowSelection} onWorkflowSelection={selection=>{workflowView.current={taskId:task.id,source:workflowSelection,selection};}} onEvent={onEvent} onTab={onTab} onArtifact={onArtifact} onRefresh={onRefresh} onClose={onClose}/></div>}
      {tab!=='workflow'&&(!artifact||tab!=='files')&&<TaskWorkbench data={data} task={task} tab={tab} eventId={eventId} onEvent={onEvent} onTab={onTab} onArtifact={onArtifact} onRefresh={onRefresh} onClose={onClose}/>}
    </div>
  </div>;
}
