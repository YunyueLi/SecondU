import {useRef,useState} from 'react';
import type { Bootstrap, TaskStatus } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import {Menu} from '@openai/apps-sdk-ui/components/Menu';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Archive,Edit,DotsHorizontalMoreMenu} from '@openai/apps-sdk-ui/components/Icon';
import { AgentAvatar, AgentGroupAvatar } from './agents/AgentIdentity';
import { HitherMark } from './HitherMark';
import {Dialog,Field,ErrorNotice} from './components';
import {write,messageOf} from './api';
import {recentChatEntries,recentChatStatus} from './recentChatEntries';
import { t } from './i18n';
import { useUnsavedChanges } from './useUnsavedChanges';
import './sidebarScroll.css';
function statusText(status:TaskStatus){return status==='running'?t('正在处理','Working'):status==='queued'?t('尚未开始','Not started'):status==='awaiting_approval'?t('等待你确认','Needs approval'):status==='needs_input'?t('等待你补充','Needs input'):status==='completed'?t('已完成','Completed'):status==='cancelled'?t('已停止','Stopped'):status==='interrupted'?t('已中断，可继续','Interrupted, ready to resume'):t('执行未完成','Run failed');}
type RecentEntry=ReturnType<typeof recentChatEntries>[number];
export function RecentChats({data,query,view,id,onRefresh}:{data:Bootstrap;query:string;view:string;id?:string;onRefresh?:()=>Promise<void>}) {
 const [editing,setEditing]=useState<RecentEntry>(),[name,setName]=useState(''),[busy,setBusy]=useState<string>(),[error,setError]=useState('');
 const baseline=useRef('');
 useUnsavedChanges(()=>({unsaved:!!editing&&name!==baseline.current,busy:!!busy}));
 const entries=recentChatEntries(data,query);
 async function save(entry:RecentEntry,patch:{title?:string;archived?:boolean}){
   setBusy(entry.id);setError('');
   try{await write(`/${entry.room?'agent-rooms':'tasks'}/${entry.id}`,patch,'PUT');if(editing?.id===entry.id&&patch.title!==undefined)baseline.current=name;await onRefresh?.();setEditing(undefined);}
   catch(error){setError(messageOf(error));}
   finally{setBusy(undefined);}
 }
 return <><nav aria-label={t('最近对话','Recent chats')}>
   {error&&!editing&&<p className="recent-chat-error" role="alert">{error}</p>}
   {entries.map(entry=>{
     const members=entry.room?.agentIds.flatMap(id=>data.agents.find(a=>a.id===id)||[])||[];
     const status=recentChatStatus(entry.task,data),needsAttention=!!status;
     const description=status?`${entry.title}${t('，', ', ')}${statusText(status)}`:entry.title;
     const locked=busy===entry.id||!!entry.task&&['running','awaiting_approval','needs_input',...(entry.room?['queued']:[])].includes(entry.task.status);
     return <div className="recent-chat-row" key={entry.id} data-attention={needsAttention?true:undefined} data-current={view===entry.route&&id===entry.id?true:undefined}>
       <ButtonLink as="a" href={`#${entry.route}/${entry.id}`} color="secondary" variant="ghost" pill={false} className="nav-item recent-room-link" title={description} aria-label={description} aria-current={view===entry.route&&id===entry.id?'page':undefined}>
         {entry.room?.kind==='group'?<AgentGroupAvatar agents={members} size={22}/>:members[0]?<AgentAvatar agent={members[0]} size={22}/>:<span className="recent-hither-avatar"><HitherMark/></span>}
         <span className="recent-chat-copy"><strong>{entry.title}</strong></span>{needsAttention&&<span className={`chat-status-dot ${status==='running'||status==='queued'?'is-running':'needs-attention'}`} aria-hidden="true"/>}
       </ButtonLink>
       <Menu><Menu.Trigger><Button type="button" className="recent-chat-menu" color="secondary" variant="ghost" size="sm" uniform aria-label={t(`管理对话：${entry.title}`,`Manage chat: ${entry.title}`)}><DotsHorizontalMoreMenu/></Button></Menu.Trigger><Menu.Content align="end" minWidth={150}>
         <Menu.Item disabled={locked} onSelect={()=>{baseline.current=entry.title;setName(entry.title);setError('');setEditing(entry);}}><Edit/>{t('重命名','Rename')}</Menu.Item>
         <Menu.Item disabled={locked} onSelect={()=>void save(entry,{archived:true})}><Archive/>{t('归档对话','Archive chat')}</Menu.Item>
       </Menu.Content></Menu>
     </div>;
   })}
   {entries.length===0&&<p className="recent-chat-empty">{query?t('没有匹配的对话','No matching chats'):t('还没有对话','No conversations yet')}</p>}
 </nav>
 {editing&&<Dialog title={t('重命名对话','Rename chat')} className="recent-rename-dialog" onClose={()=>{if(!busy)setEditing(undefined);}}><form onSubmit={event=>{event.preventDefault();if(name.trim()&&!busy)void save(editing,{title:name.trim()});}}><Field label={t('对话名称','Chat name')}><Input autoFocus value={name} onChange={event=>setName(event.target.value)} maxLength={300} disabled={!!busy}/></Field><ErrorNotice error={error}/><footer><Button type="button" color="secondary" variant="ghost" disabled={!!busy} onClick={()=>setEditing(undefined)}>{t('取消','Cancel')}</Button><Button type="submit" color="primary" loading={!!busy} disabled={!name.trim()||!!busy}>{t('保存','Save')}</Button></footer></form></Dialog>}
 </>;
}
