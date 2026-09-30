import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Desktop, Document, CloseBold, ArrowRight, Stop, Code, CheckCircle, Clock, ChevronRight } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap, Task, TaskEvent } from '../shared/contracts';
import { TaskEventDetails } from './design-system/TaskActivity';
import { visibleTaskEvents } from './design-system/taskActivityEvents';
import { ArtifactCard } from './design-system/ArtifactCard';
import { ErrorNotice, TaskBadge } from './components';
import { t, getLocale } from './i18n';
import './task-workbench.css';

export type WorkbenchTab = 'files' | 'activity' | 'computer';
export function recordedPlan(task: Task): Array<{step:string;status:string}> {
  const event = [...task.events].reverse().find(event=>event.type==='runtime.plan');
  if (!event?.detail) return [];
  try { const value = JSON.parse(event.detail); return Array.isArray(value.plan)?value.plan.filter((item: {step?:unknown;status?:unknown})=>typeof item.step==='string'&&['pending','in_progress','inProgress','completed'].includes(String(item.status))).map((item:{step:string;status:string})=>({...item,status:item.status==='inProgress'?'in_progress':item.status})):[]; } catch { return []; }
}
export function TaskProgress({task, fileCount, onOpen, onEvent}:{task:Task;fileCount:number;onOpen:(tab:WorkbenchTab)=>void;onEvent:(event:TaskEvent)=>void}) {
  const plan=recordedPlan(task);
  const current=plan.find(step=>step.status==='in_progress');
  const events=visibleTaskEvents(task.events).filter(event=>!['context','evidence','runtime.reasoning_summary'].includes(event.type));
  const latest=events.at(-1);
  const active=['running','queued'].includes(task.status);
  const label=task.status==='awaiting_approval'?t('等待你的确认','Waiting for your approval'):task.status==='completed'?t('工作已完成','Work completed'):current?.step||latest?.label||t('查看任务进展','View task progress');
  return <div className="task-progress-dock">
    <button className="task-progress-main" onClick={()=>latest?onEvent(latest):onOpen('activity')} aria-label={t(`查看进展：${label}`,`View progress: ${label}`)}>
      <span className={active?'task-progress-symbol is-running':'task-progress-symbol'}>{task.status==='completed'?<CheckCircle/>:<Clock/>}</span><span className="task-progress-copy">{label}</span>{plan.length>0&&<small>{plan.filter(step=>step.status==='completed').length}/{plan.length}</small>}<ChevronRight/>
    </button>
    <div className="task-progress-resources">{fileCount>0&&<Button color="secondary" variant="ghost" size="sm" onClick={()=>onOpen('files')}><Document/>{t(`${fileCount} 个文件`,`${fileCount} ${fileCount===1?'file':'files'}`)}</Button>}<Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('查看执行电脑','Open execution computer')} onClick={()=>onOpen('computer')}><Desktop/></Button></div>
  </div>;
}

export function TaskWorkbench({data,task,tab,eventId,onEvent,onTab,onArtifact}:{data:Bootstrap;task:Task;tab:WorkbenchTab;eventId?:string;onEvent:(event:TaskEvent)=>void;onTab:(tab:WorkbenchTab)=>void;onArtifact:(id:string)=>void}) {
  const artifacts=data.artifacts.filter(item=>item.taskId===task.id&&item.classification!=='reply_snapshot');
  const project=data.projects.find(item=>item.id===task.projectId);
  const events=visibleTaskEvents(task.events).filter(event=>!['context','evidence','runtime.reasoning_summary'].includes(event.type));
  const selected=events.find(event=>event.id===eventId)||events.at(-1);
  const plan=recordedPlan(task);
  const titles={files:t('任务文件','Task files'),activity:selected?.label||t('任务进展','Task progress'),computer:t('执行电脑','Execution computer')};
  const Icon=tab==='files'?Document:tab==='computer'?Desktop:Code;
  return <section className="task-workbench" aria-label={titles[tab]}>
    <header className="workbench-header"><Icon/><strong title={titles[tab]}>{titles[tab]}</strong></header>
    <div className="workbench-body">
      {tab==='files'&&<>{artifacts.length?<div className="workbench-files">{artifacts.map(artifact=><ArtifactCard key={artifact.id} artifact={artifact} onOpen={()=>onArtifact(artifact.id)}/>)}</div>:<div className="workbench-empty"><Document/><h3>{t('还没有生成文件','No files yet')}</h3><p>{t('任务生成的文件会保存在这里。','Files created by this task appear here.')}</p></div>}</>}
      {tab==='activity'&&<>
        {plan.length>0&&<ol className="workbench-plan">{plan.map((step,index)=><li key={index} data-status={step.status}>{step.status==='completed'?<CheckCircle/>:step.status==='in_progress'?<Clock/>:<span className="plan-dot"/>}<span>{step.step}</span></li>)}</ol>}
        {selected?<><div className="workbench-event-meta"><TaskBadge status={task.status}/><time>{new Date(selected.createdAt).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'})}</time></div><div className="workbench-operation"><TaskEventDetails event={selected}/></div>{artifacts.filter(file=>file.origin?.eventIds?.includes(selected.id)).map(file=><ArtifactCard key={file.id} artifact={file} onOpen={()=>onArtifact(file.id)}/>)}</>:<p className="workbench-note">{t('实际操作开始后，执行记录会显示在这里。','Operations will appear here when the task starts working.')}</p>}
        {events.length>1&&<details className="workbench-history"><summary>{t('其他操作','Other operations')}<span>{events.length}</span></summary><ol>{[...events].reverse().map(event=><li key={event.id}><button aria-current={selected?.id===event.id?'step':undefined} onClick={()=>onEvent(event)}><span>{event.label}</span><time>{new Date(event.createdAt).toLocaleTimeString(getLocale(),{hour:'2-digit',minute:'2-digit'})}</time></button></li>)}</ol></details>}
      </>}
      {tab==='computer'&&<><div className="workbench-computer"><Desktop/><div><strong>{data.computer.name}</strong><span className="workbench-computer-state"><span>{t('本机执行','Local execution')}</span><span>{data.computer.status==='online'?t('在线','Online'):t('离线','Offline')}</span></span></div></div>{project&&<a className="workbench-project" href={`#projects/${project.id}`}>{project.name}<ArrowRight/></a>}<ScreenPreview key={task.id}/><Button color="secondary" variant="ghost" size="sm" onClick={()=>onTab('activity')}><Code/>{t('查看本次操作记录','View task operations')}</Button><details className="workbench-details"><summary>{t('执行位置','Execution location')}</summary><dl><dt>{t('工作目录','Workspace')}</dt><dd>{project?.path||data.computer.workspace}</dd><dt>{t('执行环境','Runtime')}</dt><dd>{task.mode==='demo'?t('示例记录','Example record'):data.computer.codexAvailable?'Codex app-server':t('尚未配置','Not configured')}</dd></dl></details></>}
    </div>
  </section>;
}

function ScreenPreview() {
  const video=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null);
  const request=useRef(0);
  const mounted=useRef(true);
  const [sharing,setSharing]=useState(false);
  const [choosing,setChoosing]=useState(false);
  const [error,setError]=useState('');
  const available=typeof navigator.mediaDevices?.getDisplayMedia==='function';
  function stop(){request.current+=1;const current=stream.current;stream.current=null;current?.getTracks().forEach(track=>track.stop());if(video.current)video.current.srcObject=null;if(mounted.current){setSharing(false);setChoosing(false);}}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[]);
  async function start(){
    if(choosing||sharing||!available)return;
    const id=++request.current;setChoosing(true);setError('');
    try {
      const selected=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      if(!mounted.current||request.current!==id){selected.getTracks().forEach(track=>track.stop());return;}
      stream.current=selected;
      selected.getVideoTracks().forEach(track=>track.addEventListener('ended',stop,{once:true}));
      if(!selected.getVideoTracks().some(track=>track.readyState==='live')){stop();return;}
      if(video.current){video.current.srcObject=selected;await video.current.play();}
      if(mounted.current&&request.current===id)setSharing(true);
    } catch (e) {
      if(mounted.current&&request.current===id){stop();const name=e instanceof Error?e.name:'';setError(name==='NotAllowedError'?t('没有开始共享。你可以重新选择窗口，或检查系统的屏幕录制权限。','Sharing did not start. Choose a window again or check screen recording permissions.'):t('画面暂时无法打开，请重试或使用桌面应用。','Could not open the preview. Try again or use the desktop app.'));}
    } finally {if(mounted.current&&request.current===id)setChoosing(false);}
  }
  return <div className="screen-preview"><div className={`screen-preview-stage ${sharing?'is-sharing':''}`}><video ref={video} autoPlay muted playsInline aria-label={t('所选窗口的实时画面','Live preview of the selected window')}/>{!sharing&&<div className="screen-preview-placeholder"><Desktop/><strong>{t('看见正在操作的窗口','See the window you are working in')}</strong><p>{t('选择一个窗口或屏幕，在对话旁查看实时画面。','Choose a window or screen to see its live view beside the conversation.')}</p></div>}</div><div className="screen-preview-controls">{sharing?<><span role="status">{t('正在本机预览','Live local preview')}</span><Button color="secondary" variant="outline" size="sm" onClick={stop}><Stop/>{t('停止共享','Stop sharing')}</Button></>:<Button color="primary" size="sm" disabled={!available||choosing} loading={choosing} onClick={()=>void start()}><Desktop/>{choosing?t('正在选择窗口','Choosing a window'):t('选择窗口或屏幕','Choose a window or screen')}</Button>}</div><ErrorNotice error={error}/><p className="workbench-note">{available?t('画面仅在本机预览，不会发送给模型或保存。关闭此面板即停止共享。','This view stays on your computer. It is not sent to a model or saved. Closing this panel stops sharing.'):t('当前浏览器不支持画面共享，请在 SecondU 桌面应用中打开。','This browser does not support screen sharing. Open SecondU desktop to use it.')}</p></div>;
}
