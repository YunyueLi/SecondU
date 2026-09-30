import { useId, useEffect } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { CloseBold, Document, Code, Desktop } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap, Task, TaskEvent } from '../shared/contracts';
import { ArtifactEditor, type ArtifactViewState } from './ArtifactWorkspace';
import { TaskWorkbench, type WorkbenchTab } from './TaskWorkbench';
import { t } from './i18n';

/** Shared chrome for the task and room inspectors. The chat owns neither row. */
export function WorkbenchPanel({data,task,tab,artifactId,eventId,onTab,onClose,onArtifact,onEvent,onDirtyChange,onRefresh,editorView,onEditorViewChange}:{
  data:Bootstrap;task:Task;tab:WorkbenchTab;artifactId?:string;eventId?:string;
  onTab:(tab:WorkbenchTab)=>void;onClose:()=>void;onArtifact:(id?:string)=>void;onEvent:(event:TaskEvent)=>void;
  onDirtyChange:(dirty:boolean)=>void;onRefresh:()=>Promise<void>;
  editorView?:ArtifactViewState;onEditorViewChange?:(view:ArtifactViewState)=>void;
}) {
  const id=useId();
  const artifact=data.artifacts.find(item=>item.id===artifactId&&item.taskId===task.id);
  useEffect(()=>{if(document.activeElement===document.body)document.getElementById(`${id}-${tab}`)?.focus();},[artifact?.id,id,tab]);
  const tabs=[{id:'files',label:t('文件','Files'),Icon:Document},{id:'activity',label:t('工作过程','Activity'),Icon:Code},{id:'computer',label:t('电脑','Computer'),Icon:Desktop}] as const;
  return <div className="workbench-panel">
    <header className="workbench-panel-bar">
      <div className="workbench-panel-tabs" role="tablist" aria-label={t('任务内容','Task content')} onKeyDown={event=>{
        const index=tabs.findIndex(item=>item.id===tab);
        const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
        if(next<0)return;event.preventDefault();onTab(tabs[next].id);document.getElementById(`${id}-${tabs[next].id}`)?.focus();
      }}>{tabs.map(item=><Button key={item.id} id={`${id}-${item.id}`} role="tab" tabIndex={tab===item.id?0:-1} aria-selected={tab===item.id} aria-controls={`${id}-content`} selected={tab===item.id} color="secondary" variant="ghost" size="sm" onClick={()=>onTab(item.id)}><item.Icon/><span>{item.label}</span></Button>)}</div>
      <Button data-close-workbench color="secondary" variant="ghost" uniform size="sm" aria-label={t('关闭右侧栏','Close side panel')} onClick={onClose}><CloseBold/></Button>
    </header>
    <div id={`${id}-content`} className="workbench-panel-content" role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {artifact&&<div className="workbench-document" hidden={tab!=='files'}><ArtifactEditor key={artifact.id} artifact={artifact} compact readOnly={!!data.profile.demo} onDirtyChange={onDirtyChange} onRefresh={onRefresh} onBack={()=>onArtifact(undefined)} viewState={editorView} onViewStateChange={onEditorViewChange}/></div>}
      {(!artifact||tab!=='files')&&<TaskWorkbench data={data} task={task} tab={tab} eventId={eventId} onEvent={onEvent} onTab={onTab} onArtifact={onArtifact}/>}
    </div>
  </div>;
}
