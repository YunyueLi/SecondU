import {useId,useState,type ClipboardEvent,type RefObject} from 'react';
import type {AgentProfile,AgentRoomMessage} from '../../shared/contracts';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {CloseBold} from '@openai/apps-sdk-ui/components/Icon';
import {shouldSend} from '../appearance';
import {t} from '../i18n';
import {mentionQuery,type InlineMention} from './mentionQuery';
import './room-mentions.css';

export function RoomComposerInput({value,onChange,members,onMention,inputRef,disabled,locked,label,placeholder,onSend,onPaste}:{value:string;onChange:(value:string)=>void;members:AgentProfile[];onMention:(value:string,mention:InlineMention)=>void;inputRef:RefObject<HTMLTextAreaElement|null>;disabled:boolean;locked:boolean;label:string;placeholder:string;onSend:()=>void;onPaste?:(event:ClipboardEvent<HTMLTextAreaElement>)=>void}){
  const listId=useId();const [mention,setMention]=useState<ReturnType<typeof mentionQuery>>();const [active,setActive]=useState(0);
  const options=[{id:'all',name:t('所有人','Everyone')},...members].filter(agent=>!mention?.query||agent.name.toLocaleLowerCase().includes(mention.query.toLocaleLowerCase())||agent.id==='all'&&'everyone'.startsWith(mention.query.toLocaleLowerCase()));
  const open=!!mention&&!disabled&&!locked&&members.length>1;
  const focused=Math.min(active,Math.max(0,options.length-1));
  function select(id:string){
    if(!mention)return;
    const member=members.find(member=>member.id===id);if(id!=='all'&&!member)return;
    const token=id==='all'?'@everyone':`@${member!.name}`;
    const next=value.slice(0,mention.start)+token+' '+value.slice(mention.end);
    onMention(next,{start:mention.start,end:mention.start+token.length,text:token,recipientIds:id==='all'?members.map(member=>member.id):[id]});
    const caret=mention.start+token.length+1;setMention(undefined);requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(caret,caret);});
  }
  return <div className="ag-mention-input">
    {open&&<div className="ag-mention-picker"><div className="ag-mention-heading">{t('选择回应这条消息的助理','Choose who should respond')}</div><div id={listId} role="listbox" aria-label={t('群聊成员','Group members')}>{options.length?options.map((agent,index)=><button type="button" role="option" id={`${listId}-${index}`} aria-selected={focused===index} className={focused===index?'is-active':''} key={agent.id} onPointerMove={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>select(agent.id)}><span>@</span>{agent.name}</button>):<p>{t('没有匹配的成员','No matching members')}</p>}</div><small>{t('上下键选择，Enter 确认，Esc 关闭','Arrow keys to choose, Enter to confirm, Esc to close')}</small></div>}
    <Textarea onPaste={onPaste} ref={inputRef} variant="soft" value={value} aria-label={label} placeholder={placeholder} rows={1} autoResize maxRows={7} disabled={disabled} aria-controls={open?listId:undefined} aria-activedescendant={open&&options.length?`${listId}-${focused}`:undefined} onChange={event=>{onChange(event.target.value);setMention(locked?undefined:mentionQuery(event.target.value,event.target.selectionStart));setActive(0);}} onSelect={event=>{if(mention)setMention(mentionQuery(event.currentTarget.value,event.currentTarget.selectionStart));}} onBlur={()=>setMention(undefined)} onKeyDown={event=>{
      if(event.nativeEvent.isComposing)return;
      if(open){if(event.key==='Escape'){event.preventDefault();setMention(undefined);return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(options.length?(focused+(event.key==='ArrowDown'?1:-1)+options.length)%options.length:0);return;}if(event.key==='Enter'){event.preventDefault();if(options[focused])select(options[focused].id);return;}}
      if(shouldSend(event)){event.preventDefault();onSend();}
    }}/>
  </div>;
}

export function ReplyReference({message,author,onOpen,onClear}:{message:AgentRoomMessage;author:string;onOpen:()=>void;onClear?:()=>void}){
  const firstParagraph=message.content.trim().split(/\n\s*\n/)[0];
  const excerpt=firstParagraph.slice(0,180)||(message.attachmentIds?.length?t('附件','Attachment'):'');
  return <div className="ag-reply-reference"><button type="button" onClick={onOpen}><strong>{t(`引用 ${author}`,`Reply to ${author}`)}</strong><span>{excerpt}</span>{firstParagraph.length>180&&<small>{t("引用片段，点击查看原消息","Excerpt. Open the original message")}</small>}</button>{onClear&&<Button type="button" size="sm" color="secondary" variant="ghost" uniform aria-label={t('取消引用','Cancel reply')} onClick={onClear}><CloseBold/></Button>}</div>;
}
