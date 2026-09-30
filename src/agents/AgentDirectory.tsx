import {ExampleExecutionNotice} from '../ExampleExecutionNotice';
import { t } from '../i18n';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { AgentProfile, AgentRoom, AgentRoomTaskResult, Bootstrap } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Plus, Group, Document, Heart, Suitcase } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field, PageHeading } from '../components';
import { write, messageOf } from '../api';
import { AgentAvatar } from './AgentIdentity';
import { selectTaskContext } from '../contextSelection';
import { ScanIcon } from './ScanIcon';
import { ExpertLibrary } from './ExpertLibrary';
import { BulkAvatarStyle } from './BulkAvatarStyle';
import { SavedAgentBrowser } from './SavedAgentBrowser';
import type { OpenAgentDetails } from './AgentQuickActions';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';

const ProfessionalNetwork=lazy(()=>import('../future/ProfessionalNetwork').then(module=>({default:module.ProfessionalNetwork})));
const DatingNetwork=lazy(()=>import('../future/DatingNetwork').then(module=>({default:module.DatingNetwork})));

export function AgentDirectory({initialTab='mine',data,onOpen,onTrial,onWork,onCreate,onImport,onGroup,onExpertCreated,onRefresh}:{initialTab?:string;data:Bootstrap;onOpen:OpenAgentDetails;onTrial:(agent:AgentProfile)=>void;onWork:(agent:AgentProfile)=>void;onCreate:()=>void;onImport:()=>void;onGroup:()=>void;onExpertCreated:(agent:AgentProfile)=>Promise<void>;onRefresh:()=>Promise<void>}) {
  const [tab,setTab]=useState(initialTab),[groupsOpen,setGroupsOpen]=useState(false);
  useEffect(()=>setTab(initialTab),[initialTab]);
  function selectTab(value:string){setTab(value);location.hash=value==='mine'?'agents':`agents/${value}`;}
  const groups=data.agentRooms.filter(room=>room.kind==='group');
  const directoryTabs=<div className="ag-directory-view-navigation"><SegmentedControl className="ag-directory-view-tabs" value={tab} onChange={selectTab} size="md" aria-label={t('助理目录视图','Agent directory view')}><SegmentedControl.Option value="mine">{t('我的 Agent','My agents')}</SegmentedControl.Option><SegmentedControl.Option value="discover">{t('专家库','Expert library')}</SegmentedControl.Option><SegmentedControl.Option value="market"><span className="ag-future-tab-label is-market"><Suitcase/>{t('Agent 市场','Agent market')}<small>Dev</small></span></SegmentedControl.Option><SegmentedControl.Option value="dating"><span className="ag-future-tab-label is-dating"><Heart/>Agent Dating<small>Dev</small></span></SegmentedControl.Option></SegmentedControl><BulkAvatarStyle compact agents={data.agents} defaultStyle={data.defaultAgentAvatarStyle} onRefresh={onRefresh}/></div>;
  return <section className={`ag-directory is-discover`}><PageHeading className="ag-directory-intro" title="Agents" description={t("管理专业 Agent，按领域与任务选择协作对象。","Manage specialist agents and select collaborators.")} compactDescription={t("管理 Agent 与专业协作。","Manage agents and collaboration.")} illustration="/art/page-agents-v1.png" action={<div className="ag-directory-actions"><Popover open={groupsOpen} onOpenChange={setGroupsOpen}><Popover.Trigger><Button color="secondary" variant="ghost"><Group/>{t('群聊','Groups')}</Button></Popover.Trigger><Popover.Content side="bottom" align="end" width={270} minWidth="auto" className="ag-directory-groups">{groups.map(room=><a key={room.id} href={`#agents/${room.id}`} onClick={()=>setGroupsOpen(false)}><Group/><span>{room.title}</span></a>)}<Button color="secondary" variant="ghost" onClick={()=>{setGroupsOpen(false);onGroup();}}><Plus/>{t('创建群聊','New group chat')}</Button></Popover.Content></Popover><Button color="secondary" variant="outline" onClick={onImport}><ScanIcon/>{t("扫码创建", "Scan QR code")}</Button><Button color="primary" onClick={onCreate}><Plus/>{t("创建 Agent", "Create agent")}</Button></div>} />

    {tab==='market'||tab==='dating'?<div className="ag-future-shell"><div className="ag-directory-toolbar expert-directory-toolbar">{directoryTabs}</div><div className="ag-future-viewport"><Suspense fallback={<p className="ag-future-loading" role="status">{t('正在打开…','Opening…')}</p>}>{tab==='market'?<ProfessionalNetwork avatarStyle={data.defaultAgentAvatarStyle}/>:<DatingNetwork/>}</Suspense></div></div>:tab==='discover'?<ExpertLibrary navigation={directoryTabs} data={data} onOpen={onOpen} onRefresh={onRefresh} onCreated={async agent=>{await onExpertCreated(agent);setTab('mine');}}/>:<SavedAgentBrowser data={data} navigation={directoryTabs} onOpen={onOpen} onTrial={onTrial} onRefresh={onRefresh}/>}

  </section>;
}

export function AgentWorkDialog({agent,data,onClose,onCreated}:{agent:AgentProfile;data:Bootstrap;onClose:()=>void;onCreated:(result:AgentRoomTaskResult)=>Promise<void>}) {
  const [prompt,setPrompt]=useState('');const [exampleNotice,setExampleNotice]=useState(false);const mode='live';const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <Dialog title={t(`交给${agent.name}的工作`, `Assign work to ${agent.name}`)} onClose={onClose}>{exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>}<form className="ag-form" onSubmit={async event=>{event.preventDefault();if(!prompt.trim()||busy)return;if(data.profile.demo){setExampleNotice(true);return;}setBusy(true);setError('');try{
    let room=data.agentRooms.find(room=>room.kind==='direct'&&room.agentIds[0]===agent.id&&room.mode===mode&&!room.activeTaskId);
    if(!room)room=await write<AgentRoom>('/agent-rooms',{kind:'direct',agentIds:[agent.id],mode,title:agent.name});
    const result=await write<AgentRoomTaskResult>(`/agent-rooms/${room.id}/tasks`,{prompt:prompt.trim(),contextFactIds:selectTaskContext(data.facts,prompt.trim()),run:false});await onCreated(result);
  }catch(err){setError(messageOf(err));}finally{setBusy(false);}}}><div className="ag-share-person"><AgentAvatar agent={agent} size={42}/><div><h3>{agent.name}</h3><p>{agent.role}</p></div></div><Field label={t("希望完成什么", "What should get done?")}><Textarea rows={5} value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={t("描述目标、需要的成果，以及你在意的要求。", "Describe your goal, the result you need, and any requirements.")} required maxLength={12000}/></Field><ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t("取消", "Cancel")}</Button><Button type="submit" color="primary" loading={busy} disabled={!prompt.trim()}><Document/>{t("创建任务", "Create task")}</Button></div></form></Dialog>;
}
