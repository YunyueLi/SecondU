import { useUnsavedChanges } from '../useUnsavedChanges';
import { t, getLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { ChatImportPlatform, ChatImportPreview, ChatImportResult } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { FileUpload, Document, CheckCircle, Download, ArrowLeft } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field } from '../components';
import { messageOf, write } from '../api';
import { PlatformSelect, platformLabels } from './PlatformSelect';

const formatDescription=(platform:ChatImportPlatform)=>{
 if(platform==='instagram')return t('支持 Instagram 的 message_*.json 导出文件，也支持通用格式。','Supports Instagram message_*.json exports and the general format.');
 if(platform==='slack')return t('支持解压后的单频道消息 JSON 数组。填写稳定频道 ID；不读取 ZIP，用户 ID 可在预览后核对。','Supports a single channel message JSON file extracted from an export. Supply its stable channel ID. ZIP files are not read; verify user IDs in the preview.');
 if(platform==='telegram')return t('支持 Telegram Desktop 的 result.json 或单会话 JSON。读取 Unix 时间戳与文字，附件只保留原始引用。','Supports Telegram Desktop result.json or a single-chat JSON export. Reads timestamps and text; attachments remain source references.');
 if(platform==='feishu')return t('支持已保存的飞书消息列表 JSON 响应（data.items 或 items），也支持通用格式。只读取选中的文件，不调用平台 API。','Supports saved Feishu message-list JSON responses (data.items or items) and the general format. Only the chosen file is read; no platform API is called.');
 return t(`${platformLabels()[platform]} 支持 hither.chat.v1 规范 JSON。未适配的平台专用格式需先整理，不连接账号或读取加密数据库。`,`${platformLabels()[platform]} supports hither.chat.v1 JSON. Convert other platform-specific exports first. No account connection or encrypted database access.`);
};
const LIMIT = 1024 * 1024;
// Translate known application warnings only; preserve any unrecognized source text.
function importWarning(value: string): string {
  switch (value) {
    case "Slack 原生文件以用户 ID 显示联系人；频道标识须与原导出一致。线程、编辑与附件字段留在原始来源中，不连接账号或下载附件。": return t("Slack 原生文件以用户 ID 显示联系人；频道标识须与原导出一致。线程、编辑与附件字段留在原始来源中，不连接账号或下载附件。", "Slack contacts use exported user IDs. Keep the original channel ID. Threads, edits and attachments remain in the source file; no account is connected and no attachment is downloaded.");
    case "Telegram 读取 Desktop JSON 的时间戳与文字片段。成员只包含本文件有发言的人；附件、服务事件和格式信息保留在原始来源中，不下载媒体。": return t("Telegram 读取 Desktop JSON 的时间戳与文字片段。成员只包含本文件有发言的人；附件、服务事件和格式信息保留在原始来源中，不下载媒体。", "Telegram Desktop timestamps and text fragments are read. Participants include only senders in this file. Attachments, service events and formatting remain in the source; media is not downloaded.");
    case "飞书读取用户已保存的消息列表 JSON 响应，仅导入本页。不会调用飞书 API 或自动翻页；富文本、撤回与附件字段保留在原始来源中。": return t("飞书读取用户已保存的消息列表 JSON 响应，仅导入本页。不会调用飞书 API 或自动翻页；富文本、撤回与附件字段保留在原始来源中。", "Feishu imports only this saved message-list page. It does not call the API or fetch more pages. Rich text, retractions and attachments remain in the source.");
    case "这份飞书文件标记还有后续页。当前只导入文件已有消息，请另选其余文件。": return t("这份飞书文件标记还有后续页。当前只导入文件已有消息，请另选其余文件。", "This Feishu file indicates more pages exist. Only messages in this file are imported; choose the remaining files separately.");

    case "没有填写账号标识。本文件按摘要独立归档，不与其他文件自动合并；连续导入同一账号时请填写稳定标识。": return t("没有填写账号标识。本文件按摘要独立归档，不与其他文件自动合并；连续导入同一账号时请填写稳定标识。", "No account ID was provided. This file is archived separately and will not merge with other files. Use a consistent account ID for future imports.");
    case "Instagram 导出以名称识别参与人，无法据此证明跨文件真实身份；同名人物请先核对账号与会话。附件只保存原始引用，未下载媒体。": return t("Instagram 导出以名称识别参与人，无法据此证明跨文件真实身份；同名人物请先核对账号与会话。附件只保存原始引用，未下载媒体。", "Instagram exports identify participants by name, which cannot establish identity across files. Check the account and conversation for people with the same name. Attachment references are preserved; media is not downloaded.");
    case "没有平台消息 ID 时使用发送人、时间和内容摘要去重；完全相同的导出记录无法区分为两次独立发送。": return t("没有平台消息 ID 时使用发送人、时间和内容摘要去重；完全相同的导出记录无法区分为两次独立发送。", "Without platform message IDs, duplicates are detected by sender, timestamp and content. Identical exported records cannot be distinguished as separate messages.");
    case "预览每个会话显示前 50 条消息，确认导入将保留文件中的全部有效消息。": return t("预览每个会话显示前 50 条消息，确认导入将保留文件中的全部有效消息。", "The preview shows the first 50 messages in each conversation. Importing preserves all valid messages in the file.");
    default: return value;
  }
}

const example = () => ({
  format: 'hither.chat.v1', accountId: 'my-account',
  people: [{ id: 'me', name: t("我的称呼", "My name"), isSelf: true }, { id: 'contact-1', name: t("联系人", "Contact") }],
  conversations: [{ id: 'conversation-1', title: t("一次交流", "A conversation"), kind: 'direct', participantIds: ['me', 'contact-1'], messages: [{ id: 'message-1', senderId: 'contact-1', text: t("这里保留导出的原始消息。", "Keep the original exported message here."), time: '2026-09-29T10:00:00+08:00' }] }],
});
type Props = { onClose: () => void; onConnect?: () => void; onSaved: () => Promise<void>; onImported: (result: ChatImportResult) => void; embedded?:boolean; hidden?:boolean; onTitleChange?:(title:string)=>void;onBusyChange?:(busy:boolean)=>void };

export function ConversationFileImport({ onClose, onSaved, onImported, onConnect, embedded=false, hidden=false, onTitleChange,onBusyChange }: Props) {
  const [platform, setPlatform] = useState<ChatImportPlatform>('generic');
  const [accountId, setAccountId] = useState('');
  const [conversationId,setConversationId]=useState('');
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ChatImportPreview>();
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<ChatImportResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useUnsavedChanges({unsaved:!result&&(!!file||!!accountId||!!conversationId||platform!=='generic'),busy});
  const fileInput = useRef<HTMLInputElement>(null);
  const conversation = preview?.conversations[selected];
  const contentRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(embedded&&!hidden)contentRef.current?.focus();},[embedded,hidden]);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>()=>{onBusyChange?.(false);},[onBusyChange]);

  function chooseFile(next?: File) {
    setError(''); setPreview(undefined); setResult(undefined); setSelected(0);
    if (!next) return;
    if (next.size > LIMIT) { setFile(undefined); setError(t("文件超过 1 MiB，请按会话或时间段拆分后再导入。", "The file exceeds 1 MiB. Split it by conversation or date range before importing.")); return; }
    if (!next.name.toLowerCase().endsWith('.json')) { setFile(undefined); setError(t("请选择 JSON 文件。可读取的格式见当前平台说明。", "Choose a JSON file in a format listed for this platform.")); return; }
    setFile(next);
  }
  async function readPreview() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const content = await file.text();
      const next = await write<ChatImportPreview>('/imports/chat/preview', { platform, filename: file.name, content, ...(conversationId.trim()?{conversationId:conversationId.trim()}:{}), ...(accountId.trim() ? { accountId: accountId.trim() } : {}) });
      setPreview(next); setSelected(0);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const next = await write<ChatImportResult>('/imports/chat/commit', { previewId: preview.previewId });
      setResult(next);
      await onSaved(); onImported(next);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  function downloadExample() {
    const href = URL.createObjectURL(new Blob([JSON.stringify({...example(),platform}, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = href; link.download = 'hither-chat-format.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  const title=result ? t("导入完成", "Import complete") : preview ? t("预览对话记录", "Preview conversations") : t("导入外部记录", "Import records");
  useEffect(()=>{onTitleChange?.(title);},[title,onTitleChange]);
  const content=<div ref={contentRef} tabIndex={-1} className="chat-import" hidden={hidden} style={hidden?{display:'none'}:undefined}>
    {result ? <div className="chat-import-complete"><CheckCircle /><h3>{result.alreadyImported ? t("这份记录已导入", "Already imported") : t("原始交流已保存", "Original messages saved")}</h3><p>{result.alreadyImported ? t("没有重复添加已有消息。", "Existing messages were not added again.") : t(`新增 ${result.added.conversations} 个会话、${result.added.messages} 条消息和 ${result.added.people} 位联系人。`, `Added ${result.added.conversations} conversations, ${result.added.messages} messages and ${result.added.people} contacts.`)}</p>{result.duplicates > 0 && <p>{t("已跳过", "Skipped ")}{result.duplicates} {t("条重复消息。", " duplicate messages.")}</p>}<p className="cog-muted">{t("原始文件保留为资料来源，内容不会自动成为已确认的个人认知。", "The original file remains a source. Its contents are not automatically confirmed as personal context.")}</p><ErrorNotice error={error} /><Button color="primary" disabled={busy} onClick={onClose}>{t("查看导入的会话", "View imported conversations")}</Button></div> : <>
      {!preview ? <>
        {onConnect&&<div className="chat-import-connect"><div><strong>{t("接收和回复消息","Receive and reply")}</strong><p>{t("连接常用平台，处理你指定的会话。","Connect your platforms and work with the conversations you choose.")}</p></div><Button color="secondary" variant="outline" size="sm" onClick={onConnect}>{t("连接通信工具","Connect messaging tool")}</Button></div>}
        <p className="chat-import-intro">{t("把平台导出的文件导入到本机，先查看内容，再决定是否保存。", "Preview an exported file before saving it locally.")}</p>
        <div className="chat-import-fields"><Field label={t("记录来自", "Platform")}><PlatformSelect value={platform} disabled={busy} onChange={value => { setPlatform(value as ChatImportPlatform); setError(''); }} /></Field><Field label={t("账号标识（可选）", "Account ID (optional)")} hint={t("同一账号保持一致，方便合并后续记录。留空时按文件区分。", "Use a consistent ID to merge future records. Leave blank to separate files.")}><Input size="md" aria-label={t("导入账号标识", "Import account ID")} autoComplete="off" value={accountId} disabled={busy} onChange={event => setAccountId(event.target.value)} placeholder={t("例如 my-wechat", "For example, my-wechat")} /></Field></div>
        <p className="chat-import-format">{formatDescription(platform)}</p>
        {(platform==='slack'||platform==='feishu')&&<Field label={platform==='slack'?t('频道标识','Channel ID'):t('会话标识（文件缺少时填写）','Chat ID (if missing from the file)')} hint={t('使用原平台的稳定标识，避免把不同会话合并。','Use the original stable ID to avoid merging unrelated conversations.')}><Input size="md" value={conversationId} disabled={busy} aria-label={t('导入会话标识','Import conversation ID')} onChange={event=>setConversationId(event.target.value)} placeholder={platform==='slack'?'C0123456789':'oc_example'}/></Field>}
        <div className={`chat-import-drop ${file ? 'has-file' : ''}`} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!busy) chooseFile(event.dataTransfer.files[0]); }}>
          <input ref={fileInput} type="file" accept=".json,application/json" aria-label={t("选择对话记录文件", "Choose conversation file")} hidden disabled={busy} onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
          {file ? <Document /> : <FileUpload />}<strong>{file?.name || t("拖入一份导出的 JSON 文件", "Drop an exported JSON file")}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KiB` : t("每次选择一个文件，最大 1 MiB", "One file at a time, up to 1 MiB")}</span><Button color="secondary" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>{file ? t("更换文件", "Change file") : t("选择文件", "Choose file")}</Button>
        </div>
        <div className="chat-import-protocol"><div><h3>{t("需要整理导出格式？", "Need a format example?")}</h3><p>{t("下载通用格式示例，保留平台的消息 ID、发送者和原始时间。", "Use the example format, preserving message IDs, senders and original timestamps.")}</p></div><Button color="secondary" variant="ghost" size="sm" onClick={downloadExample}><Download />{t("格式示例", "Example format")}</Button></div>
      </> : <>
        <div className="chat-import-file-summary"><Document /><div><strong>{preview.filename}</strong><p>{platformLabels()[preview.platform]}</p></div><Badge color="secondary" variant="outline">{t("尚未导入", "Not imported yet")}</Badge></div>
        <div className="chat-import-counts"><span><strong>{preview.counts.conversations}</strong>{t("个会话", " conversations")}</span><span><strong>{preview.counts.messages}</strong>{t("条消息", " messages")}</span><span><strong>{preview.counts.people}</strong>{t("位联系人", " contacts")}</span></div>
        {preview.warnings.length > 0 && <Alert color="warning" variant="soft" title={t("导入前请留意", "Before importing")} description={<ul className="chat-import-warnings">{preview.warnings.map((warning, index) => <li key={index}>{importWarning(warning)}</li>)}</ul>} />}
        {preview.conversations.length > 1 && <Select size="md" value={String(selected)} options={preview.conversations.map((item, index) => ({ value: String(index), label: item.title }))} onChange={option => setSelected(Number(option.value))} />}
        {conversation && <div className="chat-import-preview"><header><h3>{conversation.title}</h3><p>{conversation.participants.join(t('、', ', '))}</p></header><div className="chat-import-preview-messages">{conversation.messages.map((message, index) => <article key={index}><div><strong>{message.sender}</strong><time>{new Date(message.time).toLocaleString(getLocale())}</time></div><p>{message.content}</p></article>)}</div>{conversation.messages.length < conversation.messageCount && <p className="chat-import-preview-note">{t("预览显示前", "Showing the first ")}{conversation.messages.length} {t("条，确认后导入完整的", " messages. Import will include all ")}{conversation.messageCount} {t("条消息。", " messages.")}</p>}</div>}
        <div className="chat-import-merge-summary"><span>{t("将新增", "Adding ")}{preview.counts.newMessages} {t("条消息", " messages")}</span>{preview.counts.duplicates > 0 && <span>{t("跳过", "Skipping ")}{preview.counts.duplicates} {t("条重复消息", " duplicate messages")}</span>}</div>
        <p className="cog-muted">{t("导入保留原始文件和来源，不自动确认人物判断。预览在 30 分钟后失效。", "Original files and sources are preserved. Personal claims remain unconfirmed. This preview expires in 30 minutes.")}</p>
      </>}
      <ErrorNotice error={error} />
      <div className="chat-import-actions">{preview ? <Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={() => { setPreview(undefined); setError(''); }}><ArrowLeft />{t("返回选择", "Back")}</Button> : <span />}{preview ? <Button color="primary" disabled={busy} loading={busy} onClick={commit}>{t("确认导入", "Import")}</Button> : <Button color="primary" disabled={!file || busy} loading={busy} onClick={readPreview}>{t("预览记录", "Preview")}</Button>}</div>
    </>}
  </div>;
  return embedded?content:<Dialog className="chat-import-dialog" title={title} onClose={()=>{if(!busy)onClose();}}>{content}</Dialog>;
}
