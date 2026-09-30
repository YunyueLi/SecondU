import { apiUrl } from '../api';
import { t } from '../i18n';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAvatarSource } from './avatars';
import type { AgentProfile, Bootstrap, Task } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { CloseBold, Chat, Edit, Document, Share, ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import { TaskBadge, Dialog } from '../components';
import { HitherMark } from '../HitherMark';
import { HitherWordmark } from '../HitherWordmark';
import { isSelfAgent } from './agentProfiles';
import { ProviderMark } from '../models/providers';
import './identity.css';
import { AgentResources } from './AgentResources';

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

export function AgentIdentityDrawer({ agent, data, onClose, onDirect, onWork, onEdit, onShare, onTask, onRefresh }: { agent: AgentProfile; data: Bootstrap; onClose: () => void; onDirect: () => void; onWork: () => void; onEdit: () => void; onShare: () => void; onTask: (id:string) => void; onRefresh:()=>Promise<void> }) {
  const isSelf=isSelfAgent(agent);
  const [resourcesOpen,setResourcesOpen]=useState(false);
  const [face,setFace]=useState<'identity'|'role'|'history'>('identity');
  const ref = useRef<HTMLElement>(null); const closeRef = useRef(onClose); closeRef.current=onClose;
  const previousFace=useRef(face);
  useEffect(()=>{if(previousFace.current!==face){previousFace.current=face;requestAnimationFrame(()=>ref.current?.querySelector<HTMLButtonElement>(face==='identity'?'.ag-pass-face-front footer button':'.ag-pass-face-back header button')?.focus());}},[face]);
  const tasks = data.tasks.filter(task => isSelf?!task.agentIds.length:task.agentIds.includes(agent.id)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  useEffect(() => {
    if(resourcesOpen)return;
    const opener = document.activeElement as HTMLElement|null;
    const shell = document.querySelector<HTMLElement>('.app-shell'); const prior = shell?.inert || false; if (shell) shell.inert=true;
    const elements = () => [...ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]') || []].filter(element => element.getClientRects().length&&!element.closest('[inert]'));
    elements()[0]?.focus();
    const key = (event:KeyboardEvent) => { if (event.key==='Escape') { event.preventDefault(); closeRef.current(); } if (event.key==='Tab') { const all=elements(); const first=all[0]; const last=all.at(-1); if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();} else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();} } };
    document.addEventListener('keydown',key); return () => {document.removeEventListener('keydown',key);if(shell)shell.inert=prior;if(opener?.isConnected)opener.focus();};
  },[resourcesOpen]);
  const connection=data.modelConnections?.find(item=>item.id===(agent.connectionId||data.defaultConnectionId));
  if(resourcesOpen)return <Dialog title={t(`${agent.name}的身份与权限`,`${agent.name}’s identity and permissions`)} className="ag-resources-panel-dialog" onClose={()=>setResourcesOpen(false)}><AgentResources data={data} agentId={agent.id} isSelf={isSelf} onRefresh={onRefresh}/></Dialog>;
  return createPortal(<div className="ag-drawer-overlay ag-pass-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className={`ag-pass-dialog ${isSelf?'is-self-pass':''}`} ref={ref} role="dialog" aria-modal="true" aria-label={t(`${agent.name}的工牌`, `${agent.name}’s badge`)}>
    <header className="ag-pass-tools"><span>{t('Agent 工牌','Agent badge')}</span><div><Button color="secondary" variant="ghost" uniform aria-label={isSelf?t('编辑个人画像','Edit your profile'):t('编辑 Agent','Edit agent')} onClick={onEdit}><Edit/></Button><Button color="secondary" variant="ghost" uniform aria-label={t('分享角色说明','Share role instructions')} onClick={onShare}><Share/></Button><Button color="secondary" variant="ghost" uniform aria-label={t('关闭工牌','Close badge')} onClick={onClose}><CloseBold/></Button></div></header>
    <AgentBadgeStage agent={agent} face={face} onFaceChange={setFace} tasks={tasks} onTask={onTask}/>
    <div className="ag-pass-meta"><button type="button" onClick={isSelf?()=>{location.hash="settings/model";onClose();}:onEdit}>{connection&&<ProviderMark provider={connection.provider}/>}<span>{connection?.model||data.settings.model}</span><Edit/></button><button type="button" onClick={()=>setFace(face==='history'?'identity':'history')}>{t('工作记录','Recent work')}<ArrowRight/></button></div>
    <button className="ag-pass-resources" type="button" onClick={()=>setResourcesOpen(true)}><span>{t("身份与权限","Identity and permissions")}</span><ArrowRight/></button>
    <div className="ag-pass-actions"><Button color="primary" onClick={onDirect}><Chat/>{t('开始对话','Start a chat')}</Button><Button color="secondary" variant="outline" onClick={onWork}><Document/>{t('交办工作','Assign a task')}</Button></div>
  </aside></div>,document.body);
}

/** The same physical badge is used for a saved Agent and a role preview. */
export function AgentBadgeStage({agent,face,onFaceChange,tasks=[],onTask=()=>{}}:{agent:AgentProfile;face:'identity'|'role'|'history';onFaceChange:(face:'identity'|'role'|'history')=>void;tasks?:Task[];onTask?:(id:string)=>void}) {
  const isSelf=isSelfAgent(agent),setFace=onFaceChange;
  const tiltRef=useRef<HTMLDivElement>(null);
  function resetTilt(){if(tiltRef.current){tiltRef.current.style.setProperty('--badge-x','0deg');tiltRef.current.style.setProperty('--badge-y','0deg');tiltRef.current.style.setProperty('--badge-z','0deg');}}
  return <div className={`ag-pass-stage ${isSelf?'is-self-pass':''}`} onPointerMove={event=>{if(event.pointerType==='touch'||document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const box=event.currentTarget.getBoundingClientRect();const x=Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1));const y=Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1));tiltRef.current?.style.setProperty('--badge-x',`${-y*5}deg`);tiltRef.current?.style.setProperty('--badge-y',`${x*8}deg`);tiltRef.current?.style.setProperty('--badge-z',`${x*1.4}deg`);}} onPointerLeave={resetTilt}>
      <div className="ag-pass-swing"><div className="ag-pass-tilt" ref={tiltRef}><div className="ag-pass-lanyard" aria-hidden="true"/><div className={`ag-pass-card ${face!=='identity'?'is-flipped':''}`}>
        <article className="ag-pass-face ag-pass-face-front" aria-hidden={face!=='identity'} inert={face!=='identity'}>
          <div className="ag-pass-slot" aria-hidden="true"/><div className="ag-pass-strip"><span>{isSelf?t('你的数字分身','YOUR DIGITAL TWIN'):agent.name}</span>{isSelf&&<strong>{t('代表你','YOU')}</strong>}</div>
          <div className="ag-pass-front"><AgentAvatar agent={agent} size={84}/><h2>{agent.name}</h2><p>{agent.role}</p>{isSelf&&<small className="ag-pass-owner">{t('在你的授权范围内行动','Acts within your authorization')}</small>}</div>
          <footer><span className="ag-pass-brand"><HitherMark/><HitherWordmark/></span><button type="button" onClick={()=>setFace('role')}>{t('角色说明','Role description')}</button></footer>
        </article>
        <article className="ag-pass-face ag-pass-face-back" aria-hidden={face==='identity'} inert={face==='identity'}>
          <div className="ag-pass-slot" aria-hidden="true"/><header><button type="button" aria-label={t('翻回工牌正面','Turn to front')} onClick={()=>setFace('identity')}>‹</button><h2>{face==='history'?t('工作记录','Recent work'):t('角色说明','Role description')}</h2></header>
          <div className="ag-pass-reading">{face!=='history'?<><p>{agent.instructions}</p>{agent.sourceUrl&&<small>{t('名片来源：','Card source: ')}{agent.sourceUrl}</small>}</>:tasks.length?tasks.slice(0,6).map(task=><button className="ag-pass-task" key={task.id} onClick={()=>onTask(task.id)}><span>{task.title}</span><TaskBadge status={task.status}/></button>):<p>{t('还没有工作记录','No work yet')}</p>}</div>
        </article>
      </div></div></div>
    </div>;
}
