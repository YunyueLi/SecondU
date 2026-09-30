import { useState } from 'react';
import type { Bootstrap, Task, TaskEvent } from '../../shared/contracts';
import { WorkbenchPanel } from '../WorkbenchPanel';
import type { ArtifactViewState } from '../ArtifactWorkspace';
import { type WorkbenchTab } from '../TaskWorkbench';
import { WorkbenchPane } from '../workbench/WorkbenchPane';
import { t } from '../i18n';

export type RoomWorkbenchSelection = { roomId:string; taskId:string; tab:WorkbenchTab; eventId?:string; artifactId?:string };

export function RoomWorkbenchPanel({data,task,selection,onChange,onClose,onEvent,onArtifact,onDirtyChange,onRefresh}:{
  data:Bootstrap;task:Task;selection:RoomWorkbenchSelection;
  onChange:(tab:WorkbenchTab)=>void;onClose:()=>void;onEvent:(event:TaskEvent)=>void;onArtifact:(id?:string)=>void;
  onDirtyChange:(dirty:boolean)=>void;onRefresh:()=>Promise<void>;
}) {
  const [editorViews,setEditorViews]=useState<Record<string,ArtifactViewState>>({});
  const artifact=data.artifacts.find(item=>item.id===selection.artifactId&&item.taskId===task.id);
  const title=artifact?t(`成果：${artifact.name}`,`File: ${artifact.name}`):t('任务工作区','Task workspace');
  const editorView=artifact?(editorViews[artifact.id]||{tab:'preview' as const,historyVersion:String(artifact.version)}):undefined;
  const content=<WorkbenchPanel data={data} task={task} tab={selection.tab} artifactId={selection.artifactId} eventId={selection.eventId} onEvent={onEvent} onTab={onChange} onClose={onClose} onArtifact={onArtifact} onDirtyChange={onDirtyChange} onRefresh={onRefresh} editorView={editorView} onEditorViewChange={artifact?view=>setEditorViews(previous=>({...previous,[artifact.id]:view})):undefined}/>;
  return <WorkbenchPane title={title} onClose={onClose}>{content}</WorkbenchPane>;
}
