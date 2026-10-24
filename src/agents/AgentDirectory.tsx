import { useUnsavedChanges } from '../useUnsavedChanges';
import {ExampleExecutionNotice} from '../ExampleExecutionNotice';
import { t } from '../i18n';
import { lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AgentProfile, AgentRoom, AgentRoomTaskResult, Bootstrap } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Plus, Group, Document } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field, PageHeading, PageNavigationContext } from '../components';
import { write, messageOf } from '../api';
import { AgentAvatar } from './AgentIdentity';
import { selectTaskContext } from '../contextSelection';
import { ScanIcon } from './ScanIcon';
import { ExpertLibrary } from './ExpertLibrary';
import { BulkAvatarStyle } from './BulkAvatarStyle';
import { SavedAgentBrowser } from './SavedAgentBrowser';
import type { OpenAgentDetails } from './AgentQuickActions';
import { AGENTS_SECTIONS, agentHref } from '../agents-navigation-model.mjs';
import './directory-layout.css';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';

const ProfessionalNetwork=lazy(()=>import('../future/ProfessionalNetwork').then(module=>({default:module.ProfessionalNetwork})));
const DatingNetwork=lazy(()=>import('../future/DatingNetwork').then(module=>({default:module.DatingNetwork})));

export function AgentDirectory({navigation,initialTab='mine',data,onOpen,onTrial,onWork,onCreate,onImport,onGroup,onExpertCreated,onRefresh}:{navigation?:ReactNode;initialTab?:string;data:Bootstrap;onOpen:OpenAgentDetails;onTrial:(agent:AgentProfile)=>void;onWork:(agent:AgentProfile)=>void;onCreate:()=>void;onImport:()=>void;onGroup:()=>void;onExpertCreated:(agent:AgentProfile)=>Promise<void>;onRefresh:()=>Promise<void>}) {
  const [tab,setTab]=useState(initialTab),[groupsOpen,setGroupsOpen]=useState(false);
  useEffect(()=>setTab(initialTab),[initialTab]);
  const inheritedNavigation=useContext(PageNavigationContext);
  const pageNavigation=navigation?{button:navigation,register:()=>()=>{}}:inheritedNavigation;
  const section=AGENTS_SECTIONS.find(item=>item.id===tab)||AGENTS_SECTIONS[0];
  const groups=data.agentRooms.filter(room=>room.kind==='group');
  return <section className="ag-directory is-discover"><PageNavigationContext.Provider value={pageNavigation}><PageHeading className="ag-directory-intro" title={t(section.zh,section.en)} description={t("管理专业 Agent，按领域与任务选择协作对象。","Manage specialist agents and select collaborators.")} compactDescription={t("管理 Agent 与专业协作。","Manage agents and collaboration.")} illustration="/art/page-agents-v1.png" action={<div className="ag-directory-actions"><BulkAvatarStyle compact agents={data.agents} defaultStyle={data.defaultAgentAvatarStyle} onRefresh={onRefresh}/><Popover open={groupsOpen} onOpenChange={setGroupsOpen}><Popover.Trigger><Button color="secondary" variant="ghost"><Group/>{t('群聊','Groups')}</Button></Popover.Trigger><Popover.Content side="bottom" align="end" width={270} minWidth="auto" className="ag-directory-groups">{groups.map(room=><a key={room.id} href={`#agents/${room.id}`} onClick={()=>setGroupsOpen(false)}><Group/><span>{room.title}</span></a>)}<Button color="secondary" variant="ghost" onClick={()=>{setGroupsOpen(false);onGroup();}}><Plus/>{t('创建群聊','New group chat')}</Button></Popover.Content></Popover><Button color="secondary" variant="outline" onClick={onImport}><ScanIcon/>{t("扫码创建", "Scan QR code")}</Button><Button color="primary" onClick={onCreate}><Plus/>{t("创建 Agent", "Create agent")}</Button></div>} /></PageNavigationContext.Provider>

    {tab==='market'||tab==='dating'?<div className="ag-future-shell"><div className="ag-future-viewport"><Suspense fallback={<p className="ag-future-loading" role="status">{t('正在打开…','Opening…')}</p>}>{tab==='market'?<ProfessionalNetwork avatarStyle={data.defaultAgentAvatarStyle}/>:<DatingNetwork/>}</Suspense></div></div>:tab==='discover'?<ExpertLibrary data={data} onOpen={onOpen} onRefresh={onRefresh} onCreated={async agent=>{await onExpertCreated(agent);setTab('mine');location.hash=agentHref('mine');}}/>:<SavedAgentBrowser data={data} onOpen={onOpen} onTrial={onTrial} onRefresh={onRefresh}/>}

  </section>;
}

export function AgentWorkDialog({agent,data,onClose,onCreated}:{agent:AgentProfile;data:Bootstrap;onClose:()=>void;onCreated:(result:AgentRoomTaskResult)=>Promise<void>}) {
  const [prompt,setPrompt]=useState('');const [exampleNotice,setExampleNotice]=useState(false);const mode='live';const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [savedPrompt,setSavedPrompt]=useState(prompt);
  useUnsavedChanges({unsaved:prompt!==savedPrompt,busy});
  return <Dialog title={t(`交给${agent.name}的工作`, `Assign work to ${agent.name}`)} onClose={onClose}>{exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>}<form className="ag-form" onSubmit={async event=>{event.preventDefault();if(!prompt.trim()||busy)return;if(data.profile.demo){setExampleNotice(true);return;}setBusy(true);setError('');try{
    let room=data.agentRooms.find(room=>room.kind==='direct'&&room.agentIds[0]===agent.id&&room.mode===mode&&!room.activeTaskId);
    if(!room)room=await write<AgentRoom>('/agent-rooms',{kind:'direct',agentIds:[agent.id],mode,title:agent.name});
    const result=await write<AgentRoomTaskResult>(`/agent-rooms/${room.id}/tasks`,{prompt:prompt.trim(),contextFactIds:selectTaskContext(data.facts,prompt.trim()),run:false});setSavedPrompt(prompt);await onCreated(result);
  }catch(err){setError(messageOf(err));}finally{setBusy(false);}}}><div className="ag-share-person"><AgentAvatar agent={agent} size={42}/><div><h3>{agent.name}</h3><p>{agent.role}</p></div></div><Field label={t("希望完成什么", "What should get done?")}><Textarea rows={5} value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={t("描述目标、需要的成果，以及你在意的要求。", "Describe your goal, the result you need, and any requirements.")} required maxLength={12000}/></Field><ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t("取消", "Cancel")}</Button><Button type="submit" color="primary" loading={busy} disabled={!prompt.trim()}><Document/>{t("创建任务", "Create task")}</Button></div></form></Dialog>;
}
