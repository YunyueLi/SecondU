import {ExampleExecutionNotice} from '../ExampleExecutionNotice';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { ArrowLeft, ArrowUp, Lock, Plus, Reload, CheckCircle } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, Field, ErrorNotice } from '../components';
import { api, write, messageOf } from '../api';
import { t, getLocale } from '../i18n';
import type { ImConnection, ImDraft } from '../../shared/im';
import type { ChatImportPreview, ChatImportResult, ChatImportPlatform } from '../../shared/contracts';
import { PlatformSelect } from '../cognition/PlatformSelect';
import { ComposerSurface } from '../composer/ComposerSurface';
import { ComposerTools } from '../composer/ComposerTools';
import './im.css';
import {ImSetupWizard} from './ImSetupWizard';
const channelOptions=[['slack','Slack'],['discord','Discord'],['telegram','Telegram'],['whatsapp','WhatsApp'],['signal','Signal'],['imessage','iMessage'],['msteams','Microsoft Teams'],['googlechat','Google Chat'],['matrix','Matrix'],['mattermost','Mattermost']].map(([value,label])=>({value,label}));
const statusLabel=(connection:ImConnection)=>connection.status==='ready'?t('已连接','Connected'):connection.status==='untested'?t('尚未检查','Not checked'):t('需要连接','Needs connection');
const draftLabel=(draft:ImDraft)=>({draft:t('草稿','Draft'),sending:t('正在提交','Submitting'),accepted:t('已取得提交回执','Submission acknowledged'),failed:t('未发出','Not sent'),unknown:t('结果待核对','Check original platform')}[draft.status]);

export function ImReply({connection,onConnected}:{connection:ImConnection;onConnected?:()=>void}){
  const [content,setContent]=useState(''),[drafts,setDrafts]=useState<ImDraft[]>([]),[confirm,setConfirm]=useState<ImDraft>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
  useEffect(()=>{let cancelled=false;setDrafts([]);setConfirm(undefined);setError('');api<ImDraft[]>(`/im-outbox?connectionId=${encodeURIComponent(connection.id)}`).then(values=>{if(!cancelled)setDrafts(values);}).catch(err=>{if(!cancelled)setError(messageOf(err));});return()=>{cancelled=true;};},[connection.id]);
  async function perform(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
  const save=()=>perform(async()=>{const draft=await write<ImDraft>(`/im-connections/${connection.id}/drafts`,{text:content});setDrafts(values=>[...values,draft]);setContent('');setExpanded(true);});
  const prepare=(draft:ImDraft)=>perform(async()=>{setConfirm(await write<ImDraft>(`/im-outbox/${draft.id}/prepare`));});
  const send=()=>perform(async()=>{if(!confirm?.confirmation)return;const result=await write<ImDraft>(`/im-outbox/${confirm.id}/send`,{confirmed:true,...confirm.confirmation});setDrafts(values=>values.map(d=>d.id===result.id?result:d));setConfirm(undefined);});
  return <div className="im-reply">
    <div className="im-reply-heading"><span className="im-meta-parts"><span>{connection.name}</span><span>{statusLabel(connection)}</span></span>{onConnected&&<Button size="sm" color="secondary" variant="ghost" onClick={onConnected}>{t('管理连接','Manage')}</Button>}</div>
    {confirm?<div className="im-send-review"><strong>{t('确认这次发送','Review this message')}</strong><dl><dt>{t('账号','Account')}</dt><dd className="im-meta-parts"><span>{confirm.channel}</span><span>{confirm.accountId}</span></dd><dt>{t('发送给','To')}</dt><dd>{confirm.target}</dd></dl><p>{confirm.text}</p><div className="im-actions"><Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={()=>setConfirm(undefined)}>{t('返回草稿','Back to draft')}</Button><Button color="primary" loading={busy} disabled={busy} onClick={send}>{t('确认发送这条消息','Send this message')}</Button></div></div>:<><Textarea value={content} onChange={event=>setContent(event.target.value)} rows={2} aria-label={t('回复草稿','Reply draft')} placeholder={t('写一条回复，保存后再确认发送…','Write a reply. Review before sending…')} disabled={busy}/><div className="im-actions"><Button color="secondary" variant="ghost" size="sm" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{t(`草稿与发送记录（${drafts.length}）`,`Drafts and history (${drafts.length})`)}</Button><Button color="primary" size="sm" disabled={!content.trim()||busy} loading={busy} onClick={save}>{t('保存草稿','Save draft')}</Button></div></>}
    {expanded&&!confirm&&<div className="im-outbox">{[...drafts].reverse().map(draft=><article key={draft.id}><div><span>{draftLabel(draft)}</span><time>{new Date(draft.createdAt).toLocaleString(getLocale())}</time></div><p>{draft.text}</p>{draft.statusMessage&&<small>{draft.statusMessage}</small>}{draft.status==='draft'&&<Button color="secondary" variant="outline" size="sm" disabled={busy||!connection.canSend} onClick={()=>prepare(draft)}>{t('查看并发送','Review and send')}</Button>}</article>)}{!drafts.length&&<p>{t('尚无草稿或发送记录。','No drafts or sent messages.')}</p>}</div>}
    <ErrorNotice error={error}/>
  </div>;
}

export function ConversationReply({conversationId,refreshKey,readOnly=false,onConnect}:{conversationId:string;refreshKey:number;readOnly?:boolean;onConnect:()=>void|Promise<void>}){
  const [connection,setConnection]=useState<ImConnection>(),[error,setError]=useState(''),[checking,setChecking]=useState(!readOnly),[opening,setOpening]=useState(false);
  const hintId=useId();
  const [previewDraft,setPreviewDraft]=useState(''),[exampleNotice,setExampleNotice]=useState(false);
  useEffect(()=>{
    let cancelled=false;setConnection(undefined);setError('');setChecking(!readOnly);
    if(readOnly)return;
    api<ImConnection[]>('/im-connections').then(values=>{if(!cancelled)setConnection(values.find(c=>c.conversationId===conversationId));}).catch(err=>{if(!cancelled)setError(messageOf(err));}).finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{cancelled=true;};
  },[conversationId,refreshKey,readOnly]);
  async function connect(){setOpening(true);setError('');try{await onConnect();}catch(err){setError(messageOf(err));}finally{setOpening(false);}}
  if(!readOnly&&connection?.status==='ready'&&connection.canSend)return <ImReply key={connection.id} connection={connection} onConnected={()=>void connect()}/>;
  const hint=readOnly?t('示例会话可编辑草稿与连接配置，发送时需要进入个人空间。','Edit a draft and connection settings here; sending requires your personal workspace.'):checking?t('正在检查通信连接…','Checking messaging connection…'):connection?t('当前连接暂时无法发送，请检查连接。','Sending is unavailable. Check this connection.'):t('连接通信工具后，即可在这里接收和回复消息。','Connect a messaging tool to receive and reply here.');
  return <div className="im-conversation-composer">{exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>}
    <div className="im-composer-hint" id={hintId}><Lock aria-hidden="true"/><p>{hint}</p>{!checking&&<Button type="button" color="secondary" variant="ghost" size="sm" loading={opening} disabled={opening} onClick={()=>void connect()}>{readOnly?t('配置连接','Configure connection'):connection?t('管理连接','Manage connection'):t('连接通信工具','Connect messaging')}</Button>}</div>
    <ComposerSurface compact aria-label={t('会话回复','Conversation reply')} aria-describedby={hintId} onSubmit={event=>{event.preventDefault();if(readOnly&&previewDraft.trim())setExampleNotice(true);}}>
      <div className="composer-leading"><ComposerTools disabled onAttach={()=>{}}/></div>
      <div className="composer-input"><Textarea variant="soft" rows={1} disabled={!readOnly} value={previewDraft} onChange={event=>setPreviewDraft(event.target.value)} aria-label={t('回复消息','Reply to conversation')} aria-describedby={hintId} placeholder={t('回复消息','Reply to conversation')}/></div>
      <div className="composer-trailing"><Button type="submit" color="primary" uniform disabled={!readOnly||!previewDraft.trim()} aria-label={t('发送消息','Send message')}><ArrowUp/></Button></div>
    </ComposerSurface>
    <ErrorNotice error={error}/>
  </div>;
}

export function ImConnections({onClose,onImported,onSaved,embedded=false,onBack,onBusyChange}:{onClose:()=>void;onImported:(result:ChatImportResult)=>void;onSaved:()=>Promise<void>;embedded?:boolean;onBack?:()=>void;onBusyChange?:(busy:boolean)=>void}){
  const [connections,setConnections]=useState<ImConnection[]>([]),[selected,setSelected]=useState<string>(),[adding,setAdding]=useState(false),[editing,setEditing]=useState<ImConnection>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<ChatImportPreview>(),[notice,setNotice]=useState('');
  const [wizard,setWizard]=useState(true),[wizardBusy,setWizardBusy]=useState(false);
  const contentRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(embedded)contentRef.current?.focus();},[embedded]);
  useEffect(()=>{onBusyChange?.(busy||wizardBusy);},[busy,wizardBusy,onBusyChange]);
  useEffect(()=>()=>{onBusyChange?.(false);},[onBusyChange]);
  const [adapter,setAdapter]=useState<'openclaw'|'hither-cli'>('openclaw'),[name,setName]=useState(''),[channel,setChannel]=useState('slack'),[platform,setPlatform]=useState<ChatImportPlatform>('generic'),[account,setAccount]=useState('default'),[target,setTarget]=useState(''),[command,setCommand]=useState('openclaw'),[selfId,setSelfId]=useState('');
  const connection=connections.find(c=>c.id===selected);
  useEffect(()=>{let cancelled=false;api<ImConnection[]>('/im-connections').then(values=>{if(!cancelled){setConnections(values);setSelected(values[0]?.id);setAdding(!values.length);}}).catch(err=>{if(!cancelled)setError(messageOf(err));});return()=>{cancelled=true;};},[]);
  async function perform(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
  const save=()=>perform(async()=>{const value=await write<ImConnection>(editing?`/im-connections/${editing.id}`:'/im-connections',{adapter,name,channel,platform,accountId:account,target,command,selfId,...(editing?{revision:editing.revision,runtimeId:editing.runtimeId}:{})},editing?'PUT':'POST');setConnections(values=>editing?values.map(c=>c.id===value.id?value:c):[...values,value]);setSelected(value.id);setAdding(false);setEditing(undefined);});
  const probe=()=>perform(async()=>{if(!connection)return;const value=await write<ImConnection>(`/im-connections/${connection.id}/probe`);setConnections(values=>values.map(c=>c.id===value.id?value:c));});
  const read=()=>perform(async()=>{if(!connection)return;const value=await write<ChatImportPreview|{empty:true}>(`/im-connections/${connection.id}/preview`);if('empty'in value)setNotice(t('本次没有读取到消息。','No messages returned.'));else setPreview(value);});
  const commit=()=>perform(async()=>{if(!connection||!preview)return;const result=await write<ChatImportResult>(`/im-connections/${connection.id}/commit`,{previewId:preview.previewId});await onSaved();onImported(result);setPreview(undefined);setNotice(t(`已保存 ${result.added.messages} 条新消息。`,`Saved ${result.added.messages} new messages.`));setConnections(await api<ImConnection[]>('/im-connections'));});
  function editConnection(){if(!connection)return;setEditing(connection);setAdapter(connection.adapter);setName(connection.name);setChannel(connection.channel);setPlatform(connection.platform);setAccount(connection.accountId);setTarget(connection.target);setCommand(connection.command);setSelfId(connection.selfId);setPreview(undefined);setWizard(false);setAdding(true);}
  const content=<div ref={contentRef} tabIndex={-1} className="im-connections">
    {onBack&&!adding&&!preview&&<div className="im-back-nav"><Button color="secondary" variant="ghost" size="sm" disabled={busy||wizardBusy} onClick={onBack}><ArrowLeft/>{t('返回导入记录','Back to import')}</Button></div>}
    <p className="im-intro">{t('连接通信账号，手动读取指定会话，预览后保存。','Connect a messaging account, retrieve a specific conversation and review it before saving.')}</p>
    {!adding&&<div className="im-switch"><Select size="sm" aria-label={t('选择通信连接','Select connection')} value={selected||''} options={connections.map(c=>({value:c.id,label:c.name}))} onChange={option=>{setSelected(option.value);setPreview(undefined);setNotice('');}}/><Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={()=>{setAdding(true);setWizard(true);setEditing(undefined);setName('');setTarget('');setPreview(undefined);}}><Plus/>{t('添加','Add')}</Button></div>}
    {adding&&wizard?<ImSetupWizard onBusyChange={setWizardBusy} onAdvanced={()=>setWizard(false)} onBack={connections.length?()=>setAdding(false):onBack} onBackLabel={connections.length?undefined:t('返回导入记录','Back to import')} onConnected={value=>{setConnections(values=>[...values,value]);setSelected(value.id);setAdding(false);setEditing(undefined);}}/>:adding?<div className="im-form">{!editing&&<div className="im-back-nav"><Button color="secondary" variant="ghost" size="sm" onClick={()=>setWizard(true)}><ArrowLeft/>{t('选择通信平台','Choose a platform')}</Button></div>}<Field label={t('通过什么连接','Connect through')}><Select value={adapter} options={[{value:'openclaw',label:'OpenClaw'},{value:'hither-cli',label:t('其他本机 CLI','Other local CLI')}]} onChange={option=>{setAdapter(option.value as typeof adapter);setCommand(option.value==='openclaw'?'openclaw':'');setChannel(option.value==='openclaw'?'slack':'');}}/></Field>
      <Field label={t('连接名称','Connection name')}><Input aria-label={t('连接名称','Connection name')} value={name} onChange={event=>setName(event.target.value)} placeholder={t('例如：项目讨论','For example: Project chat')}/></Field>
      <Field label={t('通信平台','Channel')}>{adapter==='openclaw'?<PlatformSelect value={channel} options={channelOptions} disabled={busy} onChange={setChannel}/>:<><Input aria-label={t('CLI 渠道标识','CLI channel ID')} value={channel} onChange={event=>setChannel(event.target.value)} placeholder="wechat"/><PlatformSelect value={platform} disabled={busy} onChange={value=>setPlatform(value as ChatImportPlatform)}/></>}</Field>
      <div className="im-field-pair"><Field label={t('工具中的账号','Account in the tool')}><Input aria-label={t('通信账号标识','Messaging account ID')} value={account} onChange={event=>setAccount(event.target.value)} placeholder="default"/></Field><Field label={t('会话或收件人标识','Conversation or recipient ID')}><Input aria-label={t('通信目标标识','Messaging target ID')} value={target} onChange={event=>setTarget(event.target.value)} placeholder={channel==='slack'?'channel:C0123456789':channel==='discord'?'channel:123456789':t('原工具中的准确标识','Exact ID in the tool')}/></Field></div>
      <details open={adapter==='hither-cli'}><summary>{t('本机工具设置','Local tool settings')}</summary><Field label={t('可执行文件路径','Executable path')} hint={t('直接运行可执行文件；不接受整段命令或 shell 脚本。','An executable path, not a command line.')}><Input aria-label={t('通信工具路径','Messaging executable')} value={command} onChange={event=>setCommand(event.target.value)} placeholder="/opt/homebrew/bin/openclaw"/></Field><Field label={t('本人在平台中的用户 ID（可选）','Your platform user ID (optional)')}><Input aria-label={t('本人平台用户标识','Your platform user ID')} value={selfId} onChange={event=>setSelfId(event.target.value)}/></Field></details>
      <p className="im-help">{adapter==='openclaw'?t('可用能力以检查结果为准。当前已适配 Slack、Discord 的最近消息读取；其他列出的渠道支持发送接入。','Capabilities depend on the account check. Recent-message reading is adapted for Slack and Discord; other listed channels support sending.'):t('可接入实现 hither.im.v1 协议的可执行程序。它通过标准输入接收 JSON，返回能力、消息或发送回执；登录凭据由原工具保管。','Use an executable implementing hither.im.v1. It accepts JSON on stdin and returns capabilities, messages or receipts. The tool manages its credentials.')}</p>
      <div className="im-actions">{editing?<Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={()=>setAdding(false)}><ArrowLeft/>{t('返回已有连接','Back to connections')}</Button>:<span/>}<Button color="primary" disabled={busy||!name.trim()||!target.trim()||!account.trim()||!command.trim()||!channel.trim()} loading={busy} onClick={save}>{t('保存连接','Save connection')}</Button></div>
    </div>:connection&&<><div className="im-connection-status"><div><strong>{statusLabel(connection)}</strong><p>{connection.statusMessage||t('保存配置后，请检查账号和可用能力。','Check the account and its capabilities.')}</p></div><div className="im-status-actions"><Button color="secondary" variant="ghost" size="sm" disabled={busy} loading={busy} onClick={probe}><Reload/>{t('检查连接','Check connection')}</Button><Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={editConnection}>{t('修改连接','Edit connection')}</Button></div></div><dl className="im-destination"><dt>{t('账号','Account')}</dt><dd className="im-meta-parts"><span>{connection.channel}</span><span>{connection.accountId}</span></dd><dt>{t('会话','Conversation')}</dt><dd>{connection.target}</dd></dl>
      {preview?<section className="im-read-preview"><strong>{t('核对本次读取的消息','Review retrieved messages')}</strong><p>{t(`共 ${preview.counts.messages} 条消息，其中 ${preview.counts.newMessages} 条新增，${preview.counts.duplicates} 条重复`,`${preview.counts.messages} messages, including ${preview.counts.newMessages} new and ${preview.counts.duplicates} duplicates`)}</p><div>{preview.conversations.flatMap(c=>c.messages).map((m,index)=><article key={index}><strong>{m.sender}</strong><time>{new Date(m.time).toLocaleString(getLocale())}</time><p>{m.content}</p></article>)}</div><div className="im-actions"><Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={()=>setPreview(undefined)}><ArrowLeft/>{t('返回','Back')}</Button><Button color="primary" disabled={busy} loading={busy} onClick={commit}>{t('保存这些记录','Save these records')}</Button></div></section>:<div className="im-read-action"><span>{connection.canRead?t('手动读取最近消息，预览后保存。','Retrieve recent messages, then review and save.'):t('这个连接尚无可用的读取能力。历史文件仍可单独导入。','Reading is not available. You can still import historical files separately.')}</span><Button color="secondary" variant="outline" size="sm" disabled={busy||!connection.canRead} loading={busy} onClick={read}>{t('读取最近消息','Read recent messages')}</Button></div>}
      {!preview&&<ImReply key={connection.id} connection={connection}/>}</>}
    {notice&&<p role="status" className="im-notice"><CheckCircle/>{notice}</p>}<ErrorNotice error={error}/>
  </div>;
  return embedded?content:<Dialog title={t('通信工具','Messaging tools')} className="im-connections-dialog" onClose={()=>{if(!busy&&!wizardBusy)onClose();}}>{content}</Dialog>;
}
