import { t } from '../i18n';
import { useState } from 'react';
import type { AgentProfile, AgentRoom, AgentRoomTaskResult, Bootstrap } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Plus, Group, Document } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field } from '../components';
import { write, messageOf } from '../api';
import { AgentAvatar } from './AgentIdentity';
import { selectTaskContext } from '../contextSelection';
import { ScanIcon } from './ScanIcon';
import { ExpertLibrary } from './ExpertLibrary';
import { SavedAgentBrowser } from './SavedAgentBrowser';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';

export function AgentDirectory({data,onOpen,onTrial,onWork,onCreate,onImport,onGroup,onExpertCreated,onRefresh}:{data:Bootstrap;onOpen:(agent:AgentProfile)=>void;onTrial:(agent:AgentProfile)=>void;onWork:(agent:AgentProfile)=>void;onCreate:()=>void;onImport:()=>void;onGroup:()=>void;onExpertCreated:(agent:AgentProfile)=>Promise<void>;onRefresh:()=>Promise<void>}) {
  const [tab,setTab]=useState('mine'),[groupsOpen,setGroupsOpen]=useState(false);
  const groups=data.agentRooms.filter(room=>room.kind==='group');
  const directoryTabs=<SegmentedControl value={tab} onChange={setTab} size="md" aria-label={t('助理目录视图','Agent directory view')}><SegmentedControl.Option value="mine">{t('我的 Agent','My agents')}</SegmentedControl.Option><SegmentedControl.Option value="discover">{t('发现专家','Discover experts')}</SegmentedControl.Option></SegmentedControl>;
  return <section className={`ag-directory is-discover`}><div className="ag-directory-intro"><div><h1>Agents</h1></div><div className="ag-directory-actions"><Popover open={groupsOpen} onOpenChange={setGroupsOpen}><Popover.Trigger><Button color="secondary" variant="ghost"><Group/>{t('群聊','Groups')}</Button></Popover.Trigger><Popover.Content side="bottom" align="end" width={270} minWidth="auto" className="ag-directory-groups">{groups.map(room=><a key={room.id} href={`#agents/${room.id}`} onClick={()=>setGroupsOpen(false)}><Group/><span>{room.title}</span></a>)}<Button color="secondary" variant="ghost" onClick={()=>{setGroupsOpen(false);onGroup();}}><Plus/>{t('创建群聊','New group chat')}</Button></Popover.Content></Popover><Button color="secondary" variant="outline" onClick={onImport}><ScanIcon/>{t("扫码创建", "Scan QR code")}</Button><Button color="primary" onClick={onCreate}><Plus/>{t("自己创建", "Create your own")}</Button></div></div>

    {tab==='discover'?<ExpertLibrary navigation={directoryTabs} data={data} onOpen={onOpen} onCreated={async agent=>{await onExpertCreated(agent);setTab('mine');}}/>:<SavedAgentBrowser data={data} navigation={directoryTabs} onOpen={onOpen} onTrial={onTrial} onRefresh={onRefresh}/>}

  </section>;
}

export function AgentWorkDialog({agent,data,onClose,onCreated}:{agent:AgentProfile;data:Bootstrap;onClose:()=>void;onCreated:(result:AgentRoomTaskResult)=>Promise<void>}) {
  const [prompt,setPrompt]=useState('');const mode='live';const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <Dialog title={t(`交给${agent.name}的工作`, `Assign work to ${agent.name}`)} onClose={onClose}><form className="ag-form" onSubmit={async event=>{event.preventDefault();if(!prompt.trim()||busy||data.profile.demo)return;setBusy(true);setError('');try{
    let room=data.agentRooms.find(room=>room.kind==='direct'&&room.agentIds[0]===agent.id&&room.mode===mode&&!room.activeTaskId);
    if(!room)room=await write<AgentRoom>('/agent-rooms',{kind:'direct',agentIds:[agent.id],mode,title:agent.name});
    const result=await write<AgentRoomTaskResult>(`/agent-rooms/${room.id}/tasks`,{prompt:prompt.trim(),contextFactIds:selectTaskContext(data.facts,prompt.trim()),run:false});await onCreated(result);
  }catch(err){setError(messageOf(err));}finally{setBusy(false);}}}><div className="ag-share-person"><AgentAvatar agent={agent} size={42}/><div><h3>{agent.name}</h3><p>{agent.role}</p></div></div><Field label={t("希望完成什么", "What should get done?")}><Textarea rows={5} value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={t("描述目标、需要的成果，以及你在意的要求。", "Describe your goal, the result you need, and any requirements.")} required maxLength={12000}/></Field><ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t("取消", "Cancel")}</Button><Button type="submit" color="primary" loading={busy} disabled={!prompt.trim()||data.profile.demo}><Document/>{t("创建任务", "Create task")}</Button></div></form></Dialog>;
}
