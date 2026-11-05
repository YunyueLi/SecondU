import {capabilityUiPreviewEnabled} from './capabilityPreview';
import { useUnsavedChanges } from '../useUnsavedChanges';
import { useState } from 'react';
import type { AgentRoom, Bootstrap } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Check, Plus, X } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field } from '../components';
import { ProjectPicker } from '../ProjectWorkspace';
import { write, messageOf } from '../api';
import { t } from '../i18n';
import { AgentAvatar } from './AgentIdentity';
import {TeamWorkflowFields} from './TeamWorkflowFields';
import type {TeamWorkflowStage} from '../../shared/team-run-types';
import './room-editor.css';

export function RoomEditor({ data, room, initialAgentId, initialKind, onClose, onSaved, onRefresh }: {data:Bootstrap;onRefresh:()=>Promise<void>;room?:AgentRoom;initialAgentId?:string;initialKind?:'direct'|'group';onClose:()=>void;onSaved:(room:AgentRoom)=>Promise<void>}) {
  const [kind,setKind]=useState<'direct'|'group'>(room?.kind||initialKind||'direct');
  const [title,setTitle]=useState(room?.title||'');
  const [teamMode,setTeamMode]=useState(!!room?.team);
  const [maxNodes,setMaxNodes]=useState(room?.team?.maxNodes??8),[concurrency,setConcurrency]=useState(room?.team?.concurrency??4);
  const [workflow,setWorkflow]=useState<TeamWorkflowStage[]>(room?.team?.workflow??[]);
  const memberLimit=teamMode?24:12;
  const [leadId,setLeadId]=useState(room?.team?.leadAgentId||'');
  const [ids,setIds]=useState<string[]>(room?.agentIds||(initialAgentId?[initialAgentId]:[]));
  const [query,setQuery]=useState('');
  const [projectId,setProjectId]=useState<string|undefined>(room?.projectId);
  const [savedId,setSavedId]=useState(room?.id);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const draftSnapshot=JSON.stringify({kind,title,teamMode,leadId,ids,projectId,maxNodes,concurrency,workflow});
  const [savedSnapshot,setSavedSnapshot]=useState(draftSnapshot);
  useUnsavedChanges({unsaved:draftSnapshot!==savedSnapshot,busy});
  const projectLocked=!!room&&data.tasks.find(task=>task.id===room.taskIds.at(-1))?.status==='interrupted';
  const workflowValid=workflow.every(stage=>stage.title.trim()&&stage.agentIds.length&&stage.agentIds.every(id=>ids.includes(id)&&id!==leadId));
  const minimumNodes=1+workflow.reduce((sum,stage)=>sum+stage.agentIds.length,0);
  const valid=kind==='direct'?ids.length===1:ids.length>=2&&ids.length<=memberLimit&&(!teamMode||ids.includes(leadId)&&workflowValid&&Number.isSafeInteger(maxNodes)&&maxNodes>=Math.max(2,minimumNodes)&&maxNodes<=72);
  const selected=ids.flatMap(id=>data.agents.find(agent=>agent.id===id)||[]);
  const normalized=query.trim().toLocaleLowerCase();
  const matches=data.agents.filter(agent=>!normalized||`${agent.name} ${agent.role}`.toLocaleLowerCase().includes(normalized));
  function choose(id:string){setIds(previous=>kind==='direct'?[id]:previous.includes(id)?previous.filter(value=>value!==id):previous.length<memberLimit?[...previous,id]:previous);}
  async function save(){
    if(!valid||busy)return;
    setBusy(true);setError('');
    try{
      const result=await write<AgentRoom>(savedId?`/agent-rooms/${savedId}`:'/agent-rooms',{title:title.trim()||undefined,kind,agentIds:ids,mode:data.profile.demo?'demo':room?.mode||'live',projectId:projectId||null,team:kind==='group'&&teamMode?{...room?.team,leadAgentId:leadId,maxNodes,concurrency,workflow,reviewBeforeRun:true}:null},savedId?'PUT':'POST');
      setSavedId(result.id);setSavedSnapshot(draftSnapshot);await onSaved(result);
    }catch(err){setError(messageOf(err));}finally{setBusy(false);}
  }
  return <Dialog className="ag-room-dialog settings-type-scale" title={room?t('会话设置','Chat settings'):kind==='group'?t('发起群聊','New group'):t('发起会话','New chat')} onClose={()=>{if(!busy)onClose();}}>
    <form className="ag-room-editor" onSubmit={event=>{event.preventDefault();void save();}}>
      {!room&&<div className="ag-room-type"><SegmentedControl size="md" disabled={busy} value={kind} onChange={value=>{setKind(value);if(value==='direct')setIds(ids.slice(0,1));}} aria-label={t('会话类型','Chat type')}><SegmentedControl.Option value="direct">{t('私聊','Direct')}</SegmentedControl.Option><SegmentedControl.Option value="group">{t('群聊','Group')}</SegmentedControl.Option></SegmentedControl></div>}
      <div className="ag-room-picker">
        <section className="ag-room-candidates" aria-label={t('选择成员','Choose members')}>
          <div className="ag-room-section-heading"><strong>{t('选择成员','Choose members')}</strong><span>{kind==='group'?t('可选多位','Multiple selection'):t('选择一位','Select one')}</span></div>
          <Input autoFocus size="md" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('搜索名字或职责','Search name or role')} aria-label={t('搜索助理','Search agents')} disabled={busy}/>
          <div className="ag-room-candidate-list">
            {matches.map(agent=>{const checked=ids.includes(agent.id);return <button type="button" className="ag-room-candidate" key={agent.id} aria-pressed={checked} disabled={busy||kind==='group'&&!checked&&ids.length>=memberLimit} onClick={()=>choose(agent.id)}><AgentAvatar agent={agent} size={36}/><span className="ag-room-member-copy"><strong>{agent.name}</strong><small>{agent.role}</small></span><span className="ag-room-check" aria-hidden="true">{checked?<Check/>:<Plus/>}</span></button>;})}
            {!matches.length&&<p className="ag-room-empty">{t('没有找到匹配的助理','No matching agents')}</p>}
          </div>
        </section>
        <section className="ag-room-selection" aria-label={t('已选成员','Selected members')}>
          <div className="ag-room-roster">
            <div className="ag-room-section-heading"><strong>{t('已选成员','Selected members')}</strong><span aria-live="polite">{kind==='group'?`${ids.length} / ${memberLimit}`:ids.length}</span></div>
            <div className="ag-room-selected-list">{selected.map(agent=><div key={agent.id} className="ag-room-selected"><AgentAvatar agent={agent} size={30}/><span className="ag-room-selected-name"><strong>{agent.name}</strong><small>{agent.role}</small></span>{kind==='group'&&teamMode&&(agent.id===leadId?<span className="ag-room-lead-label"><Check/>{t('负责人','Lead')}</span>:<Button className="ag-room-assign-lead" size="xs" variant="ghost" color="secondary" disabled={busy} aria-label={t(`设 ${agent.name} 为负责人`,`Make ${agent.name} the lead`)} onClick={()=>setLeadId(agent.id)}>{t('设为负责人','Make lead')}</Button>)}<Button uniform size="sm" variant="ghost" color="secondary" disabled={busy} aria-label={t(`移除 ${agent.name}`,`Remove ${agent.name}`)} onClick={()=>setIds(previous=>previous.filter(id=>id!==agent.id))}><X/></Button></div>)}{!selected.length&&<p className="ag-room-empty">{kind==='group'?t('从左侧选择一起参与的助理','Choose agents from the list'):t('选择你想对话的助理','Choose an agent to talk to')}</p>}</div>
            {kind==='group'&&ids.length<2&&<p className="ag-room-limit">{t('至少选择 2 位成员','Select at least 2 members')}</p>}
          </div>
          {kind==='group'&&<section className="ag-room-coordination" aria-label={t('协作方式','Collaboration')}>
            <strong>{t('协作方式','Collaboration')}</strong>
            <SegmentedControl className="ag-room-mode-control" size="md" disabled={busy} value={teamMode?'team':'discussion'} onChange={value=>{setTeamMode(value==='team');if(value==='team'&&!ids.includes(leadId))setLeadId(ids[0]||'');}} aria-label={t('协作方式','Collaboration')}><SegmentedControl.Option value="discussion">{t('共同讨论','Discussion')}</SegmentedControl.Option><SegmentedControl.Option value="team">{t('负责人调度','Led team')}</SegmentedControl.Option></SegmentedControl>
            <p>{teamMode?t('负责人按需分工，汇总结果。','The lead delegates as needed and gathers results.'):t('成员按话题和 @ 提及参与。','Members join by topic and @ mention.')}</p>
            {capabilityUiPreviewEnabled&&teamMode&&<details className="ag-work-capabilities"><summary>{t('工作量限制','Work limits')}</summary><div className="ag-room-options"><Field label={t('每轮任务上限','Tasks per turn')} hint={t('包含负责人；任务越多，耗时和模型用量通常越高。','Includes the lead. More tasks usually take more time and model usage.')}><Input type="number" min={2} max={72} value={String(maxNodes)} onChange={event=>setMaxNodes(Number(event.target.value))} disabled={busy}/></Field><Field label={t('同时工作的专家','Concurrent specialists')}><Select value={String(concurrency)} onChange={option=>setConcurrency(Number(option.value))} options={[1,2,3,4].map(value=>({value:String(value),label:String(value)}))} disabled={busy}/></Field></div></details>}
            {teamMode&&selected.length>0&&!ids.includes(leadId)&&<small role="status">{t('在成员旁指定一位负责人','Choose a lead beside a member above')}</small>}
            {capabilityUiPreviewEnabled&&teamMode&&<details className="ag-work-capabilities"><summary>{t('阶段分工（可选）','Stages (optional)')}</summary><TeamWorkflowFields value={workflow} onChange={setWorkflow} members={selected} leadId={leadId} disabled={busy}/>{minimumNodes>maxNodes&&<p role="status">{t(`当前流程至少需要 ${minimumNodes} 个任务节点，请提高每轮上限或减少阶段。`,`This workflow needs at least ${minimumNodes} task nodes. Increase the limit or remove stages.`)}</p>}</details>}
          </section>}
          {room&&<div className="ag-room-options"><Field label={t('会话名称','Chat name')}><Input value={title} disabled={busy} maxLength={120} onChange={event=>setTitle(event.target.value)}/></Field><Field label={t('所属项目','Project')} hint={projectLocked?t('当前中断任务保留原项目。','The interrupted task keeps its project.'):undefined}><ProjectPicker data={data} value={projectId} onChange={setProjectId} disabled={busy||projectLocked}/></Field></div>}
        </section>
      </div>
      <div className="ag-room-footer"><div className="ag-room-footer-note"><ErrorNotice error={error}/>{data.profile.demo?<p>{t('配置保存在示例中，执行时需切换到个人空间。','Settings stay in this example. Switch to your own space to run tasks.')}</p>:!room&&<p>{kind==='group'?t('群名与项目可在创建后设置','Set the name and project after creation'):t('选好助理即可开始','Choose an agent to get started')}</p>}</div><div className="ag-room-footer-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('取消','Cancel')}</Button><Button color="primary" type="submit" loading={busy} disabled={!valid}>{room?t('保存','Save'):kind==='group'?t(`创建群聊${ids.length?`（${ids.length}）`:''}`,`Create group${ids.length?` (${ids.length})`:''}`):t('开始会话','Start chat')}</Button></div></div>
    </form>
  </Dialog>;
}
