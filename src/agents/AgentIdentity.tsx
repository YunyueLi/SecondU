import { apiUrl } from '../api';
import { t } from '../i18n';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAvatarSource } from './avatars';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Edit, Share } from '@openai/apps-sdk-ui/components/Icon';
import type { AgentResourceKind } from '../../shared/agent-resources';
import type { AgentProfile, Bootstrap, Task } from '../../shared/contracts';
import { TaskBadge, Dialog } from '../components';
import { HitherMark } from '../HitherMark';
import { HitherWordmark } from '../HitherWordmark';
import { isSelfAgent } from './agentProfiles';
import './identity.css';
import { AgentWorkPanel, canLeaveAgentPanel, type AgentPanelState, type AgentPanelView } from './AgentWorkPanel';

export function AgentAvatar({ agent, size = 36, className = '' }: { agent: Pick<AgentProfile,'id'|'name'>&{avatarStyle?:string;avatarImage?:string}; size?: number; className?: string }) {
  const generated=useAvatarSource(agent.id,agent.avatarStyle);const [imageFailed,setImageFailed]=useState(false);
  const localImage=agent.avatarImage&&/^\/api\/avatars\/[a-f0-9-]+\.(png|jpg|webp)$/.test(agent.avatarImage)?agent.avatarImage:undefined;
  useEffect(()=>setImageFailed(false),[localImage]);const uploaded=!!localImage&&!imageFailed;
  if(isSelfAgent(agent))return <span className={`ag-avatar ag-twin-avatar ${className}`} style={{width:size,height:size}} aria-hidden="true"><HitherMark/></span>;
  return <span className={`ag-avatar ${!uploaded&&generated.pixel?'is-pixel':''} ${className}`} style={{width:size,height:size} as CSSProperties} aria-hidden="true"><img src={uploaded&&localImage?apiUrl(localImage):generated.source} alt="" draggable={false} onError={()=>setImageFailed(true)}/></span>;
}
export function AgentGroupAvatar({ agents, size = 38 }: { agents: AgentProfile[]; size?: number }) {
  return <span className="ag-group-avatar" style={{width:size,height:size}} aria-hidden="true">{agents.slice(0,3).map((agent,index) => <AgentAvatar key={agent.id} agent={agent} size={Math.round(size * .7)} className={`ag-group-face ag-group-face-${index}`} />)}</span>;
}

export function AgentIdentityDrawer({ agent, data, initialView = 'model', resourceKind, onClose, onEdit, onShare, onTask, onRefresh }: { agent: AgentProfile; data: Bootstrap; initialView?: AgentPanelView; resourceKind?: AgentResourceKind; onClose: () => void; onDirect: () => void; onWork: () => void; onEdit: () => void; onShare: () => void; onTask: (id:string) => void; onRefresh:()=>Promise<void> }) {
  const [panelState,setPanelState]=useState<AgentPanelState>({dirty:false,busy:false});
  function act(action:()=>void){if(canLeaveAgentPanel(panelState))action();}
  return <Dialog title={agent.name} className="ag-agent-details-dialog settings-type-scale" onClose={()=>act(onClose)}>
    <div className="agent-details-person"><AgentAvatar agent={agent} size={40}/><p>{agent.role}</p><Button size="sm" color="secondary" variant="ghost" uniform aria-label={t('编辑资料','Edit profile')} onClick={()=>act(onEdit)}><Edit/></Button><Button size="sm" color="secondary" variant="ghost" uniform aria-label={t('分享受限分身','Share limited delegate')} onClick={()=>act(onShare)}><Share/></Button></div>
    <div className="agent-details-body"><AgentWorkPanel agent={agent} data={data} initialView={initialView} resourceKind={resourceKind} onTask={onTask} onSettings={()=>{onClose();location.hash='settings/model';}} onRefresh={onRefresh} onStateChange={setPanelState}/></div>
  </Dialog>;
}

/** The same physical badge is used for a saved Agent and a role preview. */
export function AgentBadgeStage({agent,face,onFaceChange,tasks=[],onTask=()=>{},headerLabel}:{agent:AgentProfile;face:'identity'|'role'|'history';onFaceChange:(face:'identity'|'role'|'history')=>void;tasks?:Task[];onTask?:(id:string)=>void;headerLabel?:string}) {
  const isSelf=isSelfAgent(agent);
  const roleButtonRef=useRef<HTMLButtonElement>(null);
  const frontButtonRef=useRef<HTMLButtonElement>(null);
  const restoreFaceFocus=useRef(false);
  function setFace(next:'identity'|'role'|'history'){
    restoreFaceFocus.current=true;
    onFaceChange(next);
  }
  useEffect(()=>{
    if(!restoreFaceFocus.current)return;
    restoreFaceFocus.current=false;
    (face==='identity'?roleButtonRef:frontButtonRef).current?.focus({preventScroll:true});
  },[face]);
  const swingRef=useRef<HTMLDivElement>(null);
  const tiltRef=useRef<HTMLDivElement>(null);
  function resetTilt(){if(tiltRef.current){tiltRef.current.style.setProperty('--badge-x','0deg');tiltRef.current.style.setProperty('--badge-y','0deg');tiltRef.current.style.setProperty('--badge-z','0deg');}}
  useEffect(()=>{
    resetTilt();
    const swing=swingRef.current;
    if(!swing||document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    // Replay only the badge's arrival when its identity changes. Keeping the
    // existing DOM preserves the selected role, panel state and keyboard focus.
    swing.style.animation='none';
    void swing.offsetWidth;
    swing.style.removeProperty('animation');
  },[agent.id]);
  return <div className={`ag-pass-stage ${isSelf?'is-self-pass':''}`} onPointerMove={event=>{if(event.pointerType==='touch'||document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const box=event.currentTarget.getBoundingClientRect();const x=Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1));const y=Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1));tiltRef.current?.style.setProperty('--badge-x',`${-y*5}deg`);tiltRef.current?.style.setProperty('--badge-y',`${x*8}deg`);tiltRef.current?.style.setProperty('--badge-z',`${x*1.4}deg`);}} onPointerLeave={resetTilt}>
      <div className="ag-pass-swing" ref={swingRef}><div className="ag-pass-tilt" ref={tiltRef}><div className="ag-pass-lanyard" aria-hidden="true"/><div className={`ag-pass-card ${face!=='identity'?'is-flipped':''}`}>
        <article className="ag-pass-face ag-pass-face-front" aria-hidden={face!=='identity'} inert={face!=='identity'}>
          <div className="ag-pass-slot" aria-hidden="true"/><div className="ag-pass-strip"><span title={headerLabel}>{headerLabel??(isSelf?t('你的数字分身','YOUR DIGITAL TWIN'):agent.name)}</span>{isSelf&&<strong>{t('代表你','YOU')}</strong>}</div>
          <div className="ag-pass-front"><AgentAvatar agent={agent} size={84}/><h2 title={agent.name}>{agent.name}</h2><p>{agent.role}</p>{isSelf&&<small className="ag-pass-owner">{t('在你的授权范围内行动','Acts within your authorization')}</small>}</div>
          <footer><span className="ag-pass-brand"><HitherMark/><HitherWordmark/></span><button ref={roleButtonRef} type="button" aria-label={t('角色说明','Role description')} onClick={()=>setFace('role')}>{t('角色说明','Role')}</button></footer>
        </article>
        <article className="ag-pass-face ag-pass-face-back" aria-hidden={face==='identity'} inert={face==='identity'}>
          <div className="ag-pass-slot" aria-hidden="true"/><header><button ref={frontButtonRef} type="button" aria-label={t('翻回工牌正面','Turn to front')} onClick={()=>setFace('identity')}>‹</button><h2>{face==='history'?t('工作记录','Recent work'):t('角色说明','Role description')}</h2></header>
          <div className="ag-pass-reading">{face!=='history'?<><p>{agent.instructions}</p>{agent.sourceUrl&&<small>{t('名片来源：','Card source: ')}{agent.sourceUrl}</small>}</>:tasks.length?tasks.slice(0,6).map(task=><button className="ag-pass-task" key={task.id} onClick={()=>onTask(task.id)}><span>{task.title}</span><TaskBadge status={task.status}/></button>):<p>{t('还没有工作记录','No work yet')}</p>}</div>
        </article>
      </div></div></div>
    </div>;
}
