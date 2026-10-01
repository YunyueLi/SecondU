import { ImConnections, ConversationReply } from '../communications/ImConnections';
import { plainTextPreview } from '../agents/preview';
import { t, getLocale } from '../i18n';
import { UserAvatar } from '../UserAvatar';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Bootstrap, Conversation, Person, Relationship } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { PlatformFilter } from './PlatformFilter';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Search, Group, FileUpload, SidebarRight, CloseBold, ArrowLeft, Edit } from '@openai/apps-sdk-ui/components/Icon';
import { Empty, Dialog } from '../components';
import { ThemeDecoration } from '../themes/ThemeDecoration';
import { PortraitView } from './PortraitView';
import { PersonForm, RelationshipForm } from './RecordForms';
import { ConversationFileImport } from './ConversationFileImport';
import { platformLabels } from './PlatformSelect';
import { displayRole } from './display';
import { PlatformIcon, PlatformOption } from './PlatformIcon';
import { useInboxResize } from './useInboxResize';
import { api } from '../api';
import './explorer.css';
import './inbox-resize.css';

type Props = { data: Bootstrap; refs: (ids: string[], compact?: boolean) => ReactNode; onRefresh: () => Promise<void> };
const day = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(getLocale(), { month: 'long', day: 'numeric' }) : '';
const clock = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }) : value;
const dayKey = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(getLocale()) : value;
function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  return index < 0 ? <>{text}</> : <>{text.slice(0, index)}<mark>{text.slice(index, index + term.length)}</mark>{text.slice(index + term.length)}</>;
}

export function ConversationInbox({ data, refs, onRefresh }: Props) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const [selected, setSelected] = useState(() => [...data.conversations].sort((a, b) => (b.messages.at(-1)?.time || '').localeCompare(a.messages.at(-1)?.time || ''))[0]?.id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [threadOpen, setThreadOpen] = useState(false);
  const [contactId, setContactId] = useState<string>();
  const [editingPerson, setEditingPerson] = useState<Person>();
  const [editingRelationship,setEditingRelationship]=useState<Relationship>();
  const [dialogView,setDialogView]=useState<'import'|'connect'|null>(()=>!data.profile.demo&&location.hash==='#conversations/connect'?'connect':null);
  const [importOrigin,setImportOrigin]=useState(false);
  const [dialogBusy,setDialogBusy]=useState(false);
  const [importTitle,setImportTitle]=useState(t('导入外部记录','Import records'));
  const [connectionRefresh,setConnectionRefresh]=useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const root = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const scrollAnchor = useRef<{ height: number; top: number } | null>(null);
  const resize = useInboxResize(containerWidth, detailsOpen && !compact);
  const people = useMemo(() => new Map(data.people.map(person => [person.id, person])), [data.people]);
  const selfIds = new Set([
    ...(data.profile.selfPersonId ? [data.profile.selfPersonId] : data.profile.demo ? ['person-self'] : []),
    ...data.people.filter(person => person.role === '导出记录中的本人').map(person => person.id),
  ]);
  const conversations = [...data.conversations].filter(conversation => {
    const matchesPlatform = platform === 'all' || (conversation.platform || 'generic') === platform;
    const text = [conversation.title, ...conversation.personIds.map(id => people.get(id)?.name || ''), ...conversation.messages.map(message => message.content)].join(' ').toLocaleLowerCase();
    return matchesPlatform && text.includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => (b.messages.at(-1)?.time || '').localeCompare(a.messages.at(-1)?.time || ''));
  const conversation = conversations.find(item => item.id === selected) || conversations[0];
  const participants = conversation?.personIds.map(id => people.get(id)).filter((person): person is Person => !!person) || [];
  const contact = participants.find(person => person.id === contactId) || participants.find(person => !selfIds.has(person.id)) || participants[0];
  const messages = conversation ? [...conversation.messages].sort((a, b) => a.time.localeCompare(b.time)) : [];
  const matchingMessages = query.trim() ? messages.filter(message => message.content.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const browsedMessages = matchingMessages.length ? matchingMessages : messages;
  const visibleMessages = browsedMessages.slice(-visibleCount);
  const sourceIds = [...new Set(messages.flatMap(message => message.sourceIds?.length ? message.sourceIds : [message.sourceId]))];
  const related = contact ? data.relationships.filter(relation => relation.from === contact.id || relation.to === contact.id) : [];
  const platformName = platformLabels()[conversation?.platform || 'generic'];

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(element.clientWidth);
      const next = element.clientWidth >= 1000;
      setCompact(!next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setContactId(undefined);
  }, [conversation?.id]);
  useLayoutEffect(() => {
    setVisibleCount(100); scrollAnchor.current = null;
    if (messageList.current) messageList.current.scrollTop = query.trim() ? 0 : messageList.current.scrollHeight;
  }, [conversation?.id, query]);
  useLayoutEffect(() => {
    const anchor = scrollAnchor.current, element = messageList.current;
    if (anchor && element) { element.scrollTop = anchor.top + element.scrollHeight - anchor.height; scrollAnchor.current = null; }
  }, [visibleCount]);

  function avatar(item: Conversation) {
    if (item.kind === 'group') return <Group aria-hidden="true" />;
    return item.personIds.map(id => people.get(id)).find(person => person && !selfIds.has(person.id))?.name[0] || '?';
  }
  function select(id: string) { setSelected(id); setThreadOpen(true); }
  function openImport(){setImportOrigin(true);setDialogView('import');}
  async function openConnections(){setImportOrigin(false);setDialogView('connect');}
  function closeImportFlow(){if(dialogBusy)return;setDialogView(null);setImportOrigin(false);if(location.hash==='#conversations/connect')location.hash='conversations';setConnectionRefresh(value=>value+1);}

  return <div ref={root} style={{ '--inbox-list-width': `${resize.width}px` } as CSSProperties} className={`inbox-workspace inbox-reading resizable-inbox ${resize.dragging ? 'is-resizing' : ''} ${compact ? 'is-compact' : ''} ${detailsOpen ? 'has-details' : ''} ${threadOpen ? 'is-thread-open' : ''}`}>
    <aside className="inbox-list-pane" aria-label={t("联系人会话", "Contact conversations")}>
      <div className="inbox-list-heading"><ThemeDecoration kind="conversations"/><h1>{t("聊天记录", "Chat history")}</h1><Button color="secondary" variant="ghost" uniform size="lg" title={t("导入外部记录", "Import records")} aria-label={t("导入外部记录", "Import records")} onClick={() => openImport()}><FileUpload /></Button></div>
      <div className="inbox-search"><Input size="lg" variant="soft" startAdornment={<Search />} aria-label={t("搜索联系人和消息", "Search contacts and messages")} placeholder={t("搜索联系人和消息", "Search contacts and messages")} value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="inbox-platform-filter"><PlatformFilter label={t('筛选聊天平台','Filter chat platforms')} value={platform} onChange={setPlatform} options={[{value:'all',label:t('所有平台','All platforms')},...Object.entries(platformLabels()).filter(([value])=>data.conversations.some(item=>(item.platform||'generic')===value)).map(([value,label])=>({value,label}))]}/><span aria-label={t(`${conversations.length} 个会话`, `${conversations.length} conversations`)}>{conversations.length}</span></div>
      <nav className="inbox-conversations" aria-label={t("会话列表", "Conversation list")}>{conversations.map(item => <Button key={item.id} color="secondary" variant="ghost" pill={false} className="inbox-conversation" title={item.title} aria-label={item.title} selected={conversation?.id === item.id} aria-current={conversation?.id === item.id ? 'page' : undefined} onClick={() => select(item.id)}>
        <span className={`inbox-avatar ${item.kind === 'group' ? 'is-group' : ''}`}>{avatar(item)}<span className="inbox-avatar-platform" role="img" aria-label={item.platform&&item.platform!=='generic'?platformLabels()[item.platform]:t('记录文件','Imported file')} title={item.platform&&item.platform!=='generic'?platformLabels()[item.platform]:t('记录文件','Imported file')}><PlatformIcon platform={item.platform || 'generic'}/></span></span><span className="inbox-conversation-copy"><span className="inbox-conversation-title"><strong title={item.title}>{item.title}</strong><time>{day(item.messages.at(-1)?.time)}</time></span><span className="inbox-conversation-preview">{plainTextPreview(item.messages.at(-1)?.content || '', 160) || t("暂无消息", "No messages yet")}</span></span>
      </Button>)}{!conversations.length && <div className="inbox-list-empty"><p>{query || platform !== 'all' ? t("没有匹配的会话", "No matching conversations") : t("还没有导入会话", "No conversations imported")}</p>{query || platform !== 'all' ? <Button color="secondary" variant="ghost" size="sm" onClick={() => { setQuery(''); setPlatform('all'); }}>{t("清除筛选", "Clear filters")}</Button> : <Button color="secondary" variant="outline" size="sm" onClick={() => openImport()}>{t("导入记录", "Import records")}</Button>}</div>}</nav>
      <div className="inbox-list-footer"><FileUpload /><span>{data.conversations.some(item=>item.demo)?t('包含虚构示例记录','Includes fictional sample records'):t("聚合你的外部通信记录", "Imported conversation records")}</span></div>
    </aside>
    <div className="inbox-pane-resizer" role="separator" aria-orientation="vertical" aria-label={t('调整联系人列表宽度', 'Resize conversation list')} aria-valuemin={resize.minWidth} aria-valuemax={resize.maxWidth} aria-valuenow={resize.width} aria-valuetext={t(`${resize.width} 像素`, `${resize.width} pixels`)} tabIndex={containerWidth > 620 ? 0 : -1} title={t('拖动调整宽度，双击恢复默认', 'Drag to resize. Double-click to reset.')} {...resize.separatorProps} />
    <section className="inbox-thread" aria-label={conversation?.title || t("对话记录", "Conversation records")}>
      {conversation ? <>
        <header className="inbox-thread-heading"><Button color="secondary" variant="ghost" uniform size="sm" className="inbox-back" aria-label={t("返回会话列表", "Back to conversations")} onClick={() => setThreadOpen(false)}><ArrowLeft /></Button><span className={`inbox-avatar ${conversation.kind === 'group' ? 'is-group' : ''}`}>{avatar(conversation)}</span><div><h2>{conversation.title}</h2><p><PlatformOption value={conversation.platform || 'generic'} label={platformName}/><span>{conversation.kind === 'group' ? t(`${participants.length} 位参与者`, `${participants.length} participants`) : participants.map(person => person.name).join(t('、', ', '))}</span></p></div><Button color="secondary" variant="ghost" uniform size="lg" aria-label={detailsOpen ? t("收起会话资料", "Hide conversation details") : t("查看会话资料", "Show conversation details")} title={t("会话资料", "Conversation details")} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}><SidebarRight /></Button></header>
        <div className="inbox-messages" ref={messageList}>
          {matchingMessages.length > 0 && <p className="inbox-search-match-count">{t("找到", "Found ")}{matchingMessages.length} {t("条相关消息", " matching messages")}</p>}
          {browsedMessages.length > visibleCount && <div className="inbox-load-earlier"><Button color="secondary" variant="ghost" size="sm" onClick={() => { const element = messageList.current; if (element) scrollAnchor.current = { height: element.scrollHeight, top: element.scrollTop }; setVisibleCount(count => count + 100); }}>{t("加载更早的记录", "Load earlier messages")}</Button></div>}
          {visibleMessages.map((message, index) => {
            const isSelf = selfIds.has(message.senderId), sender = people.get(message.senderId);
            const newDay = !index || dayKey(visibleMessages[index - 1].time) !== dayKey(message.time);
            const messageSources = message.sourceIds?.length ? message.sourceIds : [message.sourceId];
            return <div className="inbox-message-group" key={message.id}>{newDay && <div className="inbox-day"><time dateTime={message.time}>{Number.isFinite(Date.parse(message.time)) ? new Date(message.time).toLocaleDateString(getLocale(), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : message.time}</time></div>}<article className={`inbox-message ${isSelf ? 'is-self' : ''}`}>{isSelf?<UserAvatar size={28} className="user-avatar--message"/>:<span className="inbox-message-avatar">{sender?.name[0] || '?'}</span>}<div className="inbox-message-content"><div className="inbox-message-meta"><strong>{sender?.name || t("未知联系人", "Unknown contact")}</strong><time dateTime={message.time}>{clock(message.time)}</time></div><p><Highlight text={message.content} query={query} /></p>{refs(messageSources, true)}</div></article></div>;
          })}
          {!messages.length && <Empty title={t("这个会话还没有消息", "No messages in this conversation")} action={<Button color="secondary" variant="outline" onClick={() => openImport()}>{t("导入记录", "Import records")}</Button>} />}
        </div>
        <ConversationReply key={conversation.id} conversationId={conversation.id} refreshKey={connectionRefresh} readOnly={!!(data.profile.demo||conversation.demo)} onConnect={openConnections}/>
      </> : <div className="inbox-empty"><Empty title={t("把重要的交流留在一起", "No conversations yet")} description={t("导入微信、Slack、飞书等平台的记录文件，浏览原始消息和联系人画像。", "Import exported records to browse original messages and contact context.")} action={<Button color="primary" onClick={() => openImport()}><FileUpload />{t("导入外部记录", "Import records")}</Button>} /></div>}
    </section>
    {detailsOpen && conversation && <aside className="inbox-details" aria-label={t("会话资料", "Conversation details")}><header><h2>{t("会话资料", "Conversation details")}</h2><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t("关闭会话资料", "Close conversation details")} onClick={() => setDetailsOpen(false)}><CloseBold /></Button></header>
      <section className="inbox-detail-section"><h3>{t("参与者", "Participants")}</h3><div className="inbox-participants">{participants.map(person => <Button color="secondary" variant="ghost" size="sm" key={person.id} selected={person.id === contact?.id} onClick={() => setContactId(person.id)}>{selfIds.has(person.id)?<UserAvatar size={21}/>:<span className="inbox-person-initial">{person.name[0]}</span>}{person.name}</Button>)}</div></section>
      {contact && <section className="inbox-contact-profile"><div className="inbox-contact-title"><h3>{contact.name}</h3><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t(`编辑${contact.name}资料`, `Edit ${contact.name}`)} title={t("编辑资料", "Edit profile")} onClick={() => setEditingPerson(contact)}><Edit /></Button></div><p className="inbox-contact-role">{displayRole(contact.role)}</p><p>{contact.description || t("尚未补充联系人背景。", "No contact context added yet.")}</p>{refs(contact.sourceIds, true)}<PortraitView person={contact} refs={refs} relationships={related}/></section>}
      {related.length > 0 && <section className="inbox-detail-section"><h3>{t("已知关系", "Known relationships")}</h3><div className="inbox-known-relations">{related.map(relation => { const other = people.get(relation.from === contact?.id ? relation.to : relation.from); return <article key={relation.id}><div><strong>{other?.name || t("未知人物", "Unknown person")}</strong><span>{relation.label}</span><Button size="sm" uniform color="secondary" variant="ghost" aria-label={t(`编辑与${other?.name||'此人'}的关系`,`Edit relationship with ${other?.name||'this person'}`)} onClick={()=>setEditingRelationship(relation)}><Edit/></Button></div><p>{relation.description}</p>{refs(relation.sourceIds,true)}</article>; })}</div></section>}
      <section className="inbox-detail-section"><h3>{t("记录来源", "Record sources")}</h3><div className="inbox-source-summary"><span className="platform-option"><PlatformIcon platform={conversation.platform || 'generic'}/>{platformName}</span><span>{messages.length} {t("条消息", " messages")}</span>{conversation.demo && <Badge color="secondary" variant="outline" size="sm">{t("虚构示例", "Fictional sample")}</Badge>}</div>{refs(sourceIds)}<Button color="secondary" variant="outline" size="sm" onClick={() => openImport()}><FileUpload />{t("导入更多记录", "Import more records")}</Button></section>
    </aside>}
    {dialogView&&<Dialog title={dialogView==='connect'?t('通信工具','Messaging tools'):importTitle} className={dialogView==='connect'?'im-connections-dialog':'chat-import-dialog'} onClose={closeImportFlow}>
      {importOrigin&&<ConversationFileImport embedded onBusyChange={setDialogBusy} hidden={dialogView!=='import'} onTitleChange={setImportTitle} onConnect={()=>setDialogView('connect')} onClose={closeImportFlow} onSaved={onRefresh} onImported={result=>{if(result.conversationIds[0]){setQuery('');setPlatform('all');select(result.conversationIds[0]);}}}/>}
      {dialogView==='connect'&&<ImConnections embedded onBusyChange={setDialogBusy} onBack={importOrigin?()=>setDialogView('import'):undefined} onClose={closeImportFlow} onSaved={onRefresh} onImported={result=>{if(result.conversationIds[0]){setQuery('');setPlatform('all');select(result.conversationIds[0]);}setConnectionRefresh(value=>value+1);}}/>}
    </Dialog>}
    {editingRelationship&&<RelationshipForm relationship={editingRelationship} data={data} onClose={()=>setEditingRelationship(undefined)} onSaved={onRefresh}/>}
    {editingPerson && <PersonForm person={editingPerson} data={data} onClose={() => setEditingPerson(undefined)} onSaved={onRefresh} />}
  </div>;
}
