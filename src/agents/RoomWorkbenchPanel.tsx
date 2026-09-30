import { useEffect, useState } from 'react';
import type { Bootstrap, Task, TaskEvent } from '../../shared/contracts';
import { WorkbenchPanel } from '../WorkbenchPanel';
import type { ArtifactViewState } from '../ArtifactWorkspace';
import { type WorkbenchTab } from '../TaskWorkbench';
import { Dialog } from '../components';
import { t } from '../i18n';

export type RoomWorkbenchSelection = { roomId:string; taskId:string; tab:WorkbenchTab; eventId?:string; artifactId?:string };

export function RoomWorkbenchPanel({data,task,selection,onChange,onClose,onEvent,onArtifact,onDirtyChange,onRefresh}:{
  data:Bootstrap;task:Task;selection:RoomWorkbenchSelection;
  onChange:(tab:WorkbenchTab)=>void;onClose:()=>void;onEvent:(event:TaskEvent)=>void;onArtifact:(id?:string)=>void;
  onDirtyChange:(dirty:boolean)=>void;onRefresh:()=>Promise<void>;
}) {
  const [overlay,setOverlay]=useState(()=>matchMedia('(max-width: 1000px)').matches);
  const [editorViews,setEditorViews]=useState<Record<string,ArtifactViewState>>({});
  useEffect(()=>{const media=matchMedia('(max-width: 1000px)');const update=()=>setOverlay(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const artifact=data.artifacts.find(item=>item.id===selection.artifactId&&item.taskId===task.id);
  const title=artifact?t(`成果：${artifact.name}`,`File: ${artifact.name}`):t('任务工作区','Task workspace');
  const editorView=artifact?(editorViews[artifact.id]||{tab:'preview' as const,historyVersion:String(artifact.version)}):undefined;
  const content=<WorkbenchPanel data={data} task={task} tab={selection.tab} artifactId={selection.artifactId} eventId={selection.eventId} onEvent={onEvent} onTab={onChange} onClose={onClose} onArtifact={onArtifact} onDirtyChange={onDirtyChange} onRefresh={onRefresh} editorView={editorView} onEditorViewChange={artifact?view=>setEditorViews(previous=>({...previous,[artifact.id]:view})):undefined}/>;
  return overlay
    ? <Dialog title={title} onClose={onClose} className="ag-workbench-dialog">{content}</Dialog>
    : <aside className="ag-workbench-pane" aria-label={title}>{content}</aside>;
}
