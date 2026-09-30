import {useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Popover} from '@openai/apps-sdk-ui/components/Popover';
import type {AgentRoomMessage} from '../../shared/contracts';
import {messageOf,write} from '../api';
import {t} from '../i18n';
import './message-reactions.css';

const common=[['👍','赞同','Agree'],['❤️','喜欢','Love'],['🙌','感谢','Thanks'],['😂','开心','Laugh'],['😢','难过','Sad'],['😮','惊讶','Surprised']];
function ReactIcon(){return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20.7 13a9 9 0 1 1-9.7-9.7M8 14s1.4 3 4 3 4-3 4-3M8 9h.01M14 9h.01M18 2v6m-3-3h6" strokeLinecap="round"/></svg>;}
export function MessageReactions({roomId,message,onRefresh}:{roomId:string;message:AgentRoomMessage;onRefresh:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function react(emoji:string){
    if(busy)return;setBusy(true);setError('');
    try{await write(`/agent-rooms/${roomId}/reactions`,{messageId:message.id,emoji,active:!message.reactions?.some(item=>item.emoji===emoji&&item.actor==='self')},'PUT');await onRefresh();setOpen(false);}
    catch(error){setError(messageOf(error));}finally{setBusy(false);}
  }
  return <span className="message-reactions">{message.reactions?.map(item=><button key={`${item.actor}:${item.emoji}`} type="button" className="message-reaction-chip" aria-pressed="true" aria-label={t(`撤回 ${item.emoji} 回应`,`Remove ${item.emoji} reaction`)} disabled={busy} onClick={()=>void react(item.emoji)}><span>{item.emoji}</span><small>1</small></button>)}<Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button type="button" color="secondary" variant="ghost" size="sm" uniform aria-label={t('添加表情回应','Add reaction')}><ReactIcon/></Button></Popover.Trigger><Popover.Content side="top" align="start" width={252} minWidth="auto" className="message-reaction-picker"><div role="group" aria-label={t('表情回应','Reactions')}>{common.map(([emoji,zh,en])=><button type="button" key={emoji} aria-label={t(zh,en)} title={t(zh,en)} aria-pressed={!!message.reactions?.some(item=>item.emoji===emoji)} disabled={busy} onClick={()=>void react(emoji)}>{emoji}</button>)}</div>{error&&<p role="alert">{error}</p>}</Popover.Content></Popover>{error&&!open&&<small role="alert">{error}</small>}</span>;
}
