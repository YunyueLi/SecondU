import { useCallback, useEffect, useState } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Document, ArrowLeft, Download } from '@openai/apps-sdk-ui/components/Icon';
import { api, apiUrl, write, messageOf } from './api';
import { Dialog, ErrorNotice, when } from './components';
import { t } from './i18n';
import type { Source } from '../shared/contracts';
import './folder-library.css';
import { ExistingAttachmentIndex } from './ExistingAttachmentIndex';
import { LibraryImportDialog } from './LibraryImportDialog';
import { LibraryStoragePanel } from './LibraryStoragePanel';

type Folder = { id: string; kind?: string; importIssues: number; registeredFiles?: number; name: string; path: string; mode: string; status: string; documents: number; lastScan: string | null; intervalMinutes: number; error: string; progress: Record<string, number> };
type FileItem = { id: string; name: string; path: string; rootId: string; status: string; detail: string; available: boolean; revision: string | null; updatedAt: string; size: number; ordinal?: number; excerpt?: string; location?: string; line?: number };
type Chunk = { ordinal: number; text: string; location: string; line: number; citation: string };
type Reading = { document: FileItem; revision?: string; version?: {status: string; detail: string; pages: number | null; createdAt: string}; items: Chunk[]; total?: number; nextOffset: number | null };
const stateLabel = (status: string) => ({ ready: t('可搜索', 'Searchable'), pending: t('等待处理', 'Queued'), error: t('需要重试', 'Retry needed'), needs_ocr: t('待文字识别', 'Needs OCR'), needs_attention: t('需要检查', 'Needs attention'), empty: t('没有可提取文字', 'No extracted text'), too_large: t('文件过大', 'File too large'), original_only: t('仅原件', 'Original only'), running: t('正在整理', 'Processing'), idle: t('已完成', 'Up to date'), paused: t('已暂停', 'Paused'), paused_storage: t('等待存储空间', 'Waiting for storage'), waiting_storage: t('等待存储空间', 'Waiting for storage'), missing: t('原位置不可用', 'Original unavailable'), cancelled: t('已停止', 'Stopped') }[status] ?? status);
const sizeLabel = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function FileReader({ file, onClose, onRefresh }: { file: FileItem; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [offset, setOffset] = useState(file.ordinal ?? 0), [revision, setRevision] = useState(file.revision ?? '');
  const [data, setData] = useState<Reading>(), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [versions, setVersions] = useState<{ revision: string; observedAt: string }[]>([]);
  useEffect(() => { const controller = new AbortController(); void api<{ items: typeof versions }>(`/library/documents/${file.id}/versions`, { signal: controller.signal }).then(result => setVersions(result.items)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); }); return () => controller.abort(); }, [file.id]);
  useEffect(() => {
    const controller = new AbortController(); setData(undefined); setError('');
    void api<Reading>(`/library/documents/${file.id}?${new URLSearchParams({ offset: String(offset), ...(revision ? { revision } : {}) })}`, { signal: controller.signal }).then(setData).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [file.id, offset, revision]);
  async function useEvidence() {
    if (!data?.items.length) return; setSaving(true); setError('');
    try {
      const source = await write<Source>(`/library/documents/${file.id}/evidence`, { revision: data.revision, offset });
      await onRefresh(); onClose(); location.hash = `building/${source.id}`;
    } catch (error) { setError(messageOf(error)); } finally { setSaving(false); }
  }
  return <Dialog title={file.name} onClose={onClose} className="folder-document-dialog">
    <p className="folder-path">{file.path}</p><ErrorNotice error={error}/>
    {versions.length > 1 && <Select aria-label={t('文档版本', 'Document version')} value={revision} options={versions.map(version => ({ value: version.revision, label: when(version.observedAt) }))} onChange={option => { setRevision(option.value); setOffset(0); }}/>}
    {data && <>
      {!mediaError && /\.(?:png|jpe?g|webp|gif)$/i.test(file.name) && <img className="folder-media" src={apiUrl(`/library/documents/${file.id}/original?inline=true`)} alt={file.name} onError={() => setMediaError(true)}/>}
      {!mediaError && /\.(?:mp3|wav|m4a|ogg)$/i.test(file.name) && <audio className="folder-media" controls preload="none" src={apiUrl(`/library/documents/${file.id}/original?inline=true`)} onError={() => setMediaError(true)}/>}
      {!mediaError && /\.(?:mp4|mov|webm)$/i.test(file.name) && <video className="folder-media" controls preload="metadata" src={apiUrl(`/library/documents/${file.id}/original?inline=true`)} onError={() => setMediaError(true)}/>}
      {mediaError && <p className="folder-hint">{t('当前无法预览这个文件；可下载原件后用本机应用打开。', 'This file cannot be previewed here. Download the original to open it in a local app.')}</p>}
      {!data.document.available && <Alert color="warning" title={t('原位置已不可用', 'Original location unavailable')} description={t('已提取的文字和引用仍保留。副本模式下仍可下载已保存原件。', 'Extracted text and citations are retained. Saved originals remain downloadable in copy mode.')}/>}
      <p className="folder-status">{stateLabel(data.version?.status ?? data.document.status)} · {data.version?.detail ?? data.document.detail}</p>
      {data.document.status==='error'&&<p className="folder-issue">{t('当前文件更新失败，正在显示上一次保存的文字。','The current file could not be refreshed. Showing previously saved text.')} {data.document.detail}</p>}
      {data.items.map(item => <section className="folder-excerpt" key={item.ordinal}><div className="folder-location">{item.location} · {t(`第 ${item.line} 行起`, `From line ${item.line}`)}</div><pre>{item.text}</pre><Button size="sm" color="secondary" variant="ghost" onClick={() => void navigator.clipboard.writeText(item.citation).catch(error => setError(messageOf(error)))}>{t('复制引用位置', 'Copy citation')}</Button></section>)}
      <div className="folder-pagination"><Button color="secondary" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 3))}>{t('上一部分', 'Previous')}</Button><span>{data.total ? t(`第 ${offset + 1}–${offset + data.items.length} 段，共 ${data.total} 段`, `${offset + 1}–${offset + data.items.length} of ${data.total} excerpts`) : t('暂无正文', 'No extracted text')}</span><Button color="secondary" variant="outline" disabled={data.nextOffset === null} onClick={() => setOffset(data.nextOffset!)}>{t('下一部分', 'Next')}</Button></div>
      <div className="folder-reader-actions"><ButtonLink color="secondary" variant="outline" href={apiUrl(`/library/documents/${file.id}/original`)} download><Download/>{t('下载当前原件', 'Download current original')}</ButtonLink><Button color="primary" disabled={!data.items.length} loading={saving} onClick={() => void useEvidence()}>{t('将这部分用于分身建设', 'Use these excerpts for my twin')}</Button></div>
      <p className="folder-hint">{t('这里只保存所选部分的证据副本。进入分身建设后，你可以决定是否整理和确认记忆。', 'This saves a copy of these excerpts as evidence. In twin building, you decide whether to process and confirm memories.')}</p>
    </>}
    {!data && !error && <p role="status">{t('正在读取这部分…', 'Reading these excerpts…')}</p>}
  </Dialog>;
}

export function FolderLibrary({ query, reference, onRefresh, onAsk }: { query: string; reference?: string; onRefresh: () => Promise<void>; onAsk?: () => Promise<void> }) {
  const [roots, setRoots] = useState<Folder[]>([]), [rootId, setRootId] = useState(''), [prefix, setPrefix] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]), [folders, setFolders] = useState<{ name: string; prefix: string; documents: number }[]>([]);
  const [offset, setOffset] = useState(0), [total, setTotal] = useState(0), [next, setNext] = useState<number | null>(null);
  const [folderOffset, setFolderOffset] = useState(0), [nextFolderOffset, setNextFolderOffset] = useState<number | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0), [file, setFile] = useState<FileItem>();
  const [adding, setAdding] = useState(false), [append, setAppend] = useState<Folder>(), [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [issues, setIssues] = useState<{ items: {name: string; detail: string}[]; total: number; nextOffset: number | null }>(), [issueOffset, setIssueOffset] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => {
    if (reference && /^(collection_|folder_)/.test(reference)) { setRootId(reference); setPrefix(''); reload(); return; }
    if (!reference?.startsWith('document_')) return;
    const controller = new AbortController(); const [id, encodedRevision, ordinal] = reference.split('~');
    let revision: string; try { revision = encodedRevision ? decodeURIComponent(encodedRevision) : ''; } catch { setError(t('引用位置无效。', 'Invalid citation.')); return; }
    void api<Reading>(`/library/documents/${id}?${new URLSearchParams(revision ? { revision } : {})}`, { signal: controller.signal }).then(result => setFile({ ...result.document, revision: revision || result.revision || null, ordinal: Number(ordinal) || 0 })).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [reference, reload]);
  useEffect(() => { setOffset(0); setFolderOffset(0); }, [query, rootId, prefix]);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ items: Folder[] }>('/library/roots', { signal: controller.signal }).then(result => setRoots(result.items)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    const timer = window.setTimeout(reload, roots.some(root => root.status === 'running') ? 2000 : 30000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh, reload, roots.some(root => root.status === 'running')]);
  useEffect(() => {
    const controller = new AbortController(); const params = new URLSearchParams({ ...(rootId ? { rootId } : {}), prefix, offset: String(offset), folderOffset: String(folderOffset), direct: String(!!rootId) });
    const search = query.trim();
    if (search) { params.set('query', search); params.set('pageSize', '30'); }
    void api<{ items: FileItem[]; total?: number; nextOffset?: number | null }>(`/library/${search ? 'search' : 'documents'}?${params}`, { signal: controller.signal }).then(result => { setFiles(result.items); setTotal(result.total ?? result.items.length); setNext(result.nextOffset ?? null); }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    if (rootId && !search) void api<{ items: typeof folders; nextOffset: number | null }>(`/library/folders?${params}`, { signal: controller.signal }).then(result => { setFolders(result.items); setNextFolderOffset(result.nextOffset); }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); }); else { setFolders([]); setNextFolderOffset(null); }
    return () => controller.abort();
  }, [query, rootId, prefix, offset, folderOffset, refresh]);
  async function showIssues(offset = 0) {
    setError(''); try { setIssues(await api(`/library/collections/${rootId}/issues?offset=${offset}`)); setIssueOffset(offset); } catch (cause) { setError(messageOf(cause)); }
  }
  async function renameCollection() {
    setBusy(true); setError(''); try { await write(`/library/collections/${rootId}`, { name }, 'PUT'); setRenaming(false); reload(); } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }
  async function action(id: string, action: string) {
    setBusy(true); setError('');
    try { await write(`/library/roots/${id}/${action}`); reload(); } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  const selected = roots.find(root => root.id === rootId);
  return <section className="folder-library" aria-label={t('本机全文资料', 'Local indexed materials')}>
    <header className="folder-library-heading"><div><h2>{t('本机全文资料', 'Local indexed materials')}</h2><p>{t('保留原件与来源，按需搜索和阅读全文。', 'Keep originals and sources. Search and read full text on demand.')}</p></div><Button color="primary" onClick={() => { setError(''); setAdding(true); }}>{t('添加文件或文件夹', 'Add files or folder')}</Button></header>
    <ErrorNotice error={error}/>
    <LibraryStoragePanel refresh={refresh} onChange={reload}/>
    <ExistingAttachmentIndex refresh={refresh} onChange={reload} onBrowse={id => { setRootId(id); setPrefix(''); }}/>
    {roots.length > 0 && <div className="folder-root-list"><Button color="secondary" variant="ghost" selected={!rootId} onClick={() => { setRootId(''); setPrefix(''); }}>{t('全部全文资料', 'All indexed materials')}</Button>{roots.map(root => <Button color="secondary" variant="ghost" key={root.id} selected={rootId === root.id} onClick={() => { setRootId(root.id); setPrefix(''); }} title={root.path}>{root.name}<span className="folder-status">{root.documents}</span></Button>)}</div>}
    {selected && <div className="folder-connection"><div><strong>{selected.name}</strong><p className="folder-path">{selected.path}</p><p className="folder-status">{stateLabel(selected.status)} · {selected.mode === 'stored' ? t('已有原件', 'Existing originals') : selected.mode === 'linked' ? t('引用原件', 'Linked originals') : t('保存副本', 'Saved copies')} · {t(`每 ${selected.intervalMinutes} 分钟检查`, `Checks every ${selected.intervalMinutes} minutes`)}{selected.lastScan ? ` · ${when(selected.lastScan)}` : ''}</p>{selected.status === 'running' && <p role="status">{t(`已处理 ${selected.progress.done ?? 0} 项，等待 ${selected.progress.pending ?? 0} 项`, `${selected.progress.done ?? 0} processed, ${selected.progress.pending ?? 0} queued`)}</p>}{selected.error && <p className="folder-issue">{selected.error}</p>}</div><div className="folder-connection-actions">
      {selected.status === 'running' ? <Button size="sm" color="secondary" variant="outline" disabled={busy} onClick={() => void action(selected.id, 'pause')}>{t('暂停', 'Pause')}</Button> : ['paused', 'cancelled', 'paused_storage'].includes(selected.status) ? <Button size="sm" color="secondary" variant="outline" disabled={busy} onClick={() => void action(selected.id, 'resume')}>{t('继续整理', 'Resume')}</Button> : <Button size="sm" color="secondary" variant="outline" disabled={busy} onClick={() => void action(selected.id, 'scan')}>{t('立即刷新', 'Refresh now')}</Button>}
      {selected.status === 'error' && <Button size="sm" color="secondary" variant="outline" disabled={busy} onClick={() => void action(selected.id, 'retry')}>{t('重试未完成项', 'Retry incomplete')}</Button>}
      {['running', 'paused'].includes(selected.status) && <Button size="sm" color="secondary" variant="ghost" disabled={busy} onClick={() => void action(selected.id, 'cancel')}>{t('停止本次整理', 'Stop this scan')}</Button>}
      {selected.kind !== 'saved_attachments' && <Button size="sm" color="secondary" variant="ghost" disabled={busy} onClick={() => { setName(selected.name); setRenaming(true); }}>{t('重命名', 'Rename')}</Button>}
      {selected.kind === 'files' && <Button size="sm" color="secondary" variant="outline" disabled={busy} onClick={() => setAppend(selected)}>{t('添加文件', 'Add files')}</Button>}
      {!!selected.importIssues && <Button size="sm" color="secondary" variant="outline" onClick={() => void showIssues()}>{t(`${selected.importIssues} 个文件未接入`, `${selected.importIssues} files not added`)}</Button>}
    </div></div>}
    {prefix && <div className="folder-breadcrumb"><Button color="secondary" variant="ghost" size="sm" onClick={() => setPrefix(prefix.split('/').slice(0, -2).join('/') + (prefix.split('/').length > 2 ? '/' : ''))}><ArrowLeft/>{t('上一级', 'Up')}</Button><span>{prefix}</span></div>}
    {folders.map(folder => <button className="folder-directory" key={folder.prefix} onClick={() => setPrefix(folder.prefix)}><span>{folder.name} /</span><span>{t(`${folder.documents} 份资料`, `${folder.documents} files`)} →</span></button>)}
    {(folderOffset > 0 || nextFolderOffset !== null) && <div className="folder-pagination"><Button color="secondary" variant="ghost" disabled={!folderOffset} onClick={() => setFolderOffset(Math.max(0, folderOffset - 50))}>{t('上一组文件夹', 'Previous folders')}</Button><Button color="secondary" variant="ghost" disabled={nextFolderOffset === null} onClick={() => setFolderOffset(nextFolderOffset!)}>{t('下一组文件夹', 'Next folders')}</Button></div>}
    <div className="folder-file-list">{files.map((item, index) => <button className="folder-file" key={`${item.id}:${item.ordinal ?? index}`} onClick={() => setFile(item)}><Document/><span className="folder-file-copy"><strong>{item.name}</strong>{item.path!==item.name&&<span className="folder-path">{item.path}</span>}{item.excerpt && <span className="folder-search-excerpt">{item.excerpt}</span>}<span className="folder-status">{stateLabel(item.status)} · {sizeLabel(item.size)}{!item.available ? ` · ${t('原位置不可用', 'Original location unavailable')}` : ''}{item.location ? ` · ${item.location}` : ''}</span></span><span aria-hidden="true">→</span></button>)}</div>
    {!roots.length && <p className="folder-hint">{t('选择资料所在的文件夹即可，无需逐个导入。后台处理不会自动调用模型。', 'Choose the folder holding your materials. Background indexing does not automatically call a model.')}</p>}
    {!!roots.length && !files.length && !folders.length && <p className="folder-hint">{query ? t('没有找到相关文字。试试人名、项目名或原话中的关键词。', 'No matching text. Try a name, project, or words from the original.') : t('这个位置暂无已登记资料，整理过程和未完成项会显示在上方。', 'No registered files here yet. Processing status appears above.')}</p>}
    {(!query && (offset > 0 || next !== null)) && <div className="folder-pagination"><Button color="secondary" variant="ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 40))}>{t('上一页', 'Previous')}</Button><span>{t(`共 ${total} 份资料`, `${total} files`)}</span><Button color="secondary" variant="ghost" disabled={next === null} onClick={() => setOffset(next!)}>{t('下一页', 'Next')}</Button></div>}
    {query && files.length === 30 && <p className="folder-hint">{t('显示最相关的 30 个片段；缩小关键词或选择文件夹可进一步筛选。', 'Showing 30 relevant excerpts. Refine your words or select a folder.')}</p>}
    {!!roots.length && onAsk && <div className="folder-ask"><Button color="secondary" variant="outline" disabled={busy} onClick={() => { setBusy(true); void onAsk().finally(() => setBusy(false)); }}>{t('向资料库提问', 'Ask my library')}</Button><p className="folder-hint">{t('打开一份提问草稿。发送后，所选模型可检索当前空间的资料，并收到相关片段。', 'Opens a question draft. After you send it, the selected model can search this space’s library and receive relevant excerpts.')}</p></div>}
    {(adding || append) && <LibraryImportDialog collection={append} onClose={() => { setAdding(false); setAppend(undefined); }} onDone={root => { setRootId(root.id); setPrefix(''); reload(); }}/>}
    {renaming && <Dialog title={t('重命名资料集', 'Rename collection')} onClose={() => { if (!busy) setRenaming(false); }}><div className="cog-stack"><Input aria-label={t('新的资料集名称', 'New collection name')} maxLength={300} value={name} onChange={event => setName(event.target.value)}/><ErrorNotice error={error}/><Button color="primary" loading={busy} disabled={!name.trim()} onClick={() => void renameCollection()}>{t('保存名称', 'Save name')}</Button></div></Dialog>}
    {issues && <Dialog title={t('未接入的文件', 'Files not added')} onClose={() => setIssues(undefined)}><p>{t('这些文件没有进入资料集。更正位置或权限后，可以重新添加；已接入的文件会去重。', 'These files were not added. Correct their paths or permissions, then add them again; existing files are deduplicated.')}</p><ul className="library-import-issues">{issues.items.map((item, index) => <li key={index}><strong>{item.name}</strong><p>{item.detail}</p></li>)}</ul><div className="folder-pagination"><Button color="secondary" variant="outline" disabled={!issueOffset} onClick={() => void showIssues(Math.max(0, issueOffset - 40))}>{t('上一页', 'Previous')}</Button><span>{t(`共 ${issues.total} 个`, `${issues.total} files`)}</span><Button color="secondary" variant="outline" disabled={issues.nextOffset === null} onClick={() => void showIssues(issues.nextOffset!)}>{t('下一页', 'Next')}</Button></div></Dialog>}
    {file && <FileReader key={`${file.id}:${file.ordinal ?? 0}`} file={file} onClose={() => setFile(undefined)} onRefresh={onRefresh}/>}
  </section>;
}
