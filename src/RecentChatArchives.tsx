import {useState} from 'react';
import type {Bootstrap} from '../shared/contracts';
import {Button,ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Archive,Unarchive,Search} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,ErrorNotice} from './components';
import {recentChatEntries} from './recentChatEntries';
import {write,messageOf} from './api';
import {t} from './i18n';
import './recentChatArchives.css';

export function RecentChatArchives({data,onRefresh}:{data:Bootstrap;onRefresh:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState<string>(),[error,setError]=useState('');
  const entries=recentChatEntries(data,query,true),count=recentChatEntries(data,'',true).length;
  async function restore(entry:ReturnType<typeof recentChatEntries>[number]) {
    setBusy(entry.id);setError('');
    try {await write(`/${entry.room?'agent-rooms':'tasks'}/${entry.id}`,{archived:false},'PUT');await onRefresh();}
    catch(error){setError(messageOf(error));}
    finally{setBusy(undefined);}
  }
  return <><div className="settings-data-action"><span className="settings-action-icon"><Archive/></span><div><h3>{t('已归档的对话','Archived chats')}</h3><p>{t(`共 ${count} 条，可随时查看或恢复。`,`${count} chats, available to view or restore.`)}</p></div><Button color="secondary" variant="outline" size="sm" aria-label={t('管理已归档的对话','Manage archived chats')} onClick={()=>{setOpen(true);setError('');}}>{t('管理','Manage')}</Button></div>
    {open&&<Dialog title={t('已归档的对话','Archived chats')} className="recent-archives-dialog" onClose={()=>setOpen(false)}>
      <Input aria-label={t('搜索已归档对话','Search archived chats')} placeholder={t('搜索对话','Search chats')} startAdornment={<Search/>} value={query} onChange={event=>setQuery(event.target.value)}/>
      <ErrorNotice error={error}/>
      <div className="recent-archives-list">{entries.map(entry=>{
        const locked=!!busy||!!entry.task&&['running','awaiting_approval','needs_input',...(entry.room?['queued']:[])].includes(entry.task.status);
        return <div className="recent-archive-row" key={entry.id}><ButtonLink as="a" href={`#${entry.route}/${entry.id}`} color="secondary" variant="ghost" pill={false} title={entry.title} className="recent-archive-title">{entry.title}</ButtonLink><Button color="secondary" variant="ghost" size="sm" uniform loading={busy===entry.id} disabled={locked} aria-label={t(`恢复对话：${entry.title}`,`Restore chat: ${entry.title}`)} title={t('恢复对话','Restore chat')} onClick={()=>void restore(entry)}><Unarchive/></Button></div>;
      })}{!entries.length&&<p className="recent-archives-empty">{query?t('没有匹配的对话','No matching chats'):t('没有已归档的对话','No archived chats')}</p>}</div>
    </Dialog>}
  </>;
}
