import { spaceStorageKey } from './space';
import { t, getLocale } from './i18n';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Artifact, Bootstrap, Source } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Search, Document, Download, CloseBold, Edit, Check, ArrowLeft } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice, Empty, PageHeading, PageToolbar, when, RichText, Dialog } from './components';
import { apiUrl, write, messageOf } from './api';
import { PlatformIcon } from './cognition/PlatformIcon';
import './library.css';
import { ArtifactPreview, ArtifactThumbnail, ArtifactIcon } from './artifacts/ArtifactPreview';
import { artifactFormat, embeddedFile } from './artifacts/format.mjs';

type Draft = { content: string; baseContent: string; baseVersion: number };
export type ArtifactViewState = { tab:'preview'|'edit'|'history'; historyVersion:string };
function savedDraft(artifact: Artifact): Draft {
  try { const draft = JSON.parse(sessionStorage.getItem(spaceStorageKey(`hither.artifact.${artifact.id}`)) || 'null'); if (draft && typeof draft.content === 'string' && typeof draft.baseContent === 'string' && Number.isInteger(draft.baseVersion)) return draft; } catch { /* A missing session draft does not affect the saved artifact. */ }
  return { content: artifact.content, baseContent: artifact.content, baseVersion: artifact.version };
}

export function ArtifactEditor({ artifact, onRefresh, onClose, onBack, compact = false, readOnly = false, onDirtyChange, viewState, onViewStateChange }: { artifact: Artifact; onRefresh: () => Promise<void>; onClose?: () => void; onBack?: () => void; compact?: boolean; readOnly?: boolean; onDirtyChange?: (dirty:boolean)=>void; viewState?:ArtifactViewState; onViewStateChange?:(value:ArtifactViewState)=>void }) {
  const [localTab, setLocalTab] = useState<ArtifactViewState['tab']>('preview');
  const [initial] = useState(() => readOnly?{content:artifact.content,baseContent:artifact.content,baseVersion:artifact.version}:savedDraft(artifact));
  const [draft, setDraft] = useState(initial.content);
  const [baseContent, setBaseContent] = useState(initial.baseContent);
  const [baseVersion, setBaseVersion] = useState(initial.baseVersion);
  const [localHistoryVersion, setLocalHistoryVersion] = useState(String(artifact.version));
  const tab=viewState?.tab??localTab,historyVersion=viewState?.historyVersion??localHistoryVersion;
  const setTab=(next:ArtifactViewState['tab'])=>onViewStateChange?onViewStateChange({tab:next,historyVersion}):setLocalTab(next);
  const setHistoryVersion=(next:string)=>onViewStateChange?onViewStateChange({tab,historyVersion:next}):setLocalHistoryVersion(next);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [draftWarning, setDraftWarning] = useState('');
  const [exampleDownload, setExampleDownload] = useState<{ content:string; version:number; url:string }>();
  const format = artifactFormat(artifact);
  // The selected saved revision owns its bytes and metadata. A draft is never a download source.
  const selected = tab !== 'history' || historyVersion === String(artifact.version) ? artifact : artifact.versions.find(v => String(v.version) === historyVersion);
  const selectedVersion = selected?.version;
  const selectedContent = selected?.content;
  const binaryBytes = useMemo(() => selectedContent !== undefined && !format.editable ? embeddedFile(selectedContent, format.mime) : null, [selectedContent, format.mime, format.editable]);
  const hasDownload = !!selected && (format.editable || !!binaryBytes);
  const exampleDownloadUrl = exampleDownload && exampleDownload.content === selectedContent && exampleDownload.version === selectedVersion ? exampleDownload.url : undefined;
  const downloadUrl = hasDownload ? readOnly ? exampleDownloadUrl : apiUrl(`/artifacts/${artifact.id}/download?version=${selectedVersion}`) : undefined;
  const canDownload = !!downloadUrl;
  const downloadLabel = t(`下载已保存的第 ${selectedVersion} 版`, `Download saved version ${selectedVersion}`);
  const dirty = draft !== baseContent;
  useEffect(() => {
    if (!readOnly || !hasDownload || selectedContent === undefined || selectedVersion === undefined) { setExampleDownload(undefined); return; }
    const url = URL.createObjectURL(new Blob([binaryBytes || selectedContent], { type:format.mime }));
    setExampleDownload({ content:selectedContent, version:selectedVersion, url });
    return () => URL.revokeObjectURL(url);
  }, [readOnly, selectedContent, selectedVersion, format.mime, hasDownload, binaryBytes]);
  useEffect(()=>{onDirtyChange?.(dirty&&!readOnly);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange,readOnly]);
  useEffect(() => { if ((readOnly||!dirty) && !saveInFlight.current) { setDraft(artifact.content); setBaseContent(artifact.content); setBaseVersion(artifact.version); } }, [artifact.content, artifact.version]);
  useEffect(() => { if(readOnly)return; try { if (dirty) sessionStorage.setItem(spaceStorageKey(`hither.artifact.${artifact.id}`), JSON.stringify({content:draft,baseContent,baseVersion})); else sessionStorage.removeItem(spaceStorageKey(`hither.artifact.${artifact.id}`)); setDraftWarning(''); } catch { setDraftWarning(t("无法暂存草稿，请在离开前保存修改。", "Could not cache this draft. Save your changes before leaving.")); } }, [artifact.id,draft,baseContent,baseVersion,dirty,readOnly]);
  useEffect(() => { if (!dirty||readOnly) return; const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; addEventListener('beforeunload', prevent); return () => removeEventListener('beforeunload', prevent); }, [dirty,readOnly]);
  async function save() {
    if (readOnly || !format.editable || !dirty || saveInFlight.current) return;
    saveInFlight.current = true;
    const submittedDraft = draft;
    setSaving(true); setError(''); setSaved(false);
    try { const result = await write<Artifact>(`/artifacts/${artifact.id}`, { content: submittedDraft, baseVersion }, 'PUT'); setBaseVersion(result.version); setBaseContent(result.content); setDraft(current => current === submittedDraft ? result.content : current); await onRefresh(); setSaved(true); }
    catch (e) { setError(messageOf(e)); }
    finally { saveInFlight.current = false; setSaving(false); }
  }
  const preview = tab === 'history' ? selectedContent ?? '' : draft;
  const selectedDate = selected && ('createdAt' in selected ? selected.createdAt : selected.updatedAt);
  return <section className={`artifact-editor ${compact ? 'compact' : ''}`} aria-label={t(`成果：${artifact.name}`, `File: ${artifact.name}`)}>
    <div className="artifact-chrome"><header className="artifact-header"><div>{onBack?<Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('返回文件列表','Back to files')} onClick={onBack}><ArrowLeft/></Button>:<ArtifactIcon format={format} />}<div><h2 title={artifact.name}>{artifact.name}</h2><span role="status">{selectedVersion === undefined ? t('此版本不可用', 'Version unavailable') : t(`第 ${selectedVersion} 版，`, `Version ${selectedVersion}, `)}{tab === 'history' ? selectedDate && when(selectedDate) : readOnly ? t("示例文件", "Example file") : saving ? t("正在保存", "Saving") : dirty ? t("有未保存的修改", "Unsaved changes") : saved ? t("修改已保存", "Changes saved") : when(artifact.updatedAt)}</span></div></div><div className="row"><ButtonLink as="a" color="secondary" variant="ghost" href={downloadUrl} download={exampleDownloadUrl?artifact.name:undefined} aria-disabled={!canDownload} onClick={(event:MouseEvent<HTMLAnchorElement>)=>{if(!canDownload)event.preventDefault();}} title={!hasDownload?t("当前版本没有原始文件数据", "Original bytes for this version are unavailable"):downloadLabel} aria-label={selectedVersion === undefined ? t("下载不可用", "Download unavailable") : downloadLabel}><Download /></ButtonLink>{onClose && <Button color="secondary" variant="ghost" uniform data-close-artifact aria-label={t("关闭成果", "Close file")} onClick={() => { if (readOnly || !dirty || window.confirm(t("还有未保存的修改，仍然关闭？", "You have unsaved changes. Close anyway?"))) onClose(); }}><CloseBold /></Button>}</div></header>
    <div className="artifact-toolbar"><SegmentedControl aria-label={t("成果视图", "File view")} value={tab} onChange={setTab} size="sm"><SegmentedControl.Option value="preview">{t("预览", "Preview")}</SegmentedControl.Option><SegmentedControl.Option value="edit" disabled={!format.editable}>{t("编辑", "Edit")}</SegmentedControl.Option><SegmentedControl.Option value="history">{t("版本", "Versions")}</SegmentedControl.Option></SegmentedControl><Button color="primary" size="sm" disabled={readOnly || !format.editable || !dirty || saving} loading={saving} onClick={save}><Check />{t("保存修改", "Save changes")}</Button></div>
    </div>
    {artifact.reviewStatus === 'pending' && <Alert color="warning" variant="soft" title={t("中断前留下的成果，等待核对", "Review this file from an interrupted task")} description={t("任务没有完整结束。这份文件可能不完整，查看内容后再决定如何继续。", "The task was interrupted. Review this file for missing content before continuing.")} />}
    <ErrorNotice error={error || draftWarning} />
    {artifact.version !== baseVersion && dirty && <Alert color="warning" variant="soft" title={t("有更新的版本", "A newer version is available")} description={t("你的草稿仍在。请先查看新版本，避免覆盖其他修改。", "Your draft is safe. Review the newer version before saving.")} actions={<Button color="secondary" variant="outline" size="sm" onClick={() => { if (confirm(t("放弃当前草稿并载入最新版本？", "Discard this draft and load the latest version?"))) { setDraft(artifact.content); setBaseContent(artifact.content); setBaseVersion(artifact.version); setError(''); } }}>{t("载入新版本", "Load latest")}</Button>} />}
    {tab === 'history' && <div className="history-picker"><div className="artifact-version-select"><Select aria-label={t("选择已保存版本", "Choose a saved version")} value={historyVersion} onChange={option => setHistoryVersion(option.value)} options={[...artifact.versions].sort((a,b) => b.version-a.version).map(v => ({ value: String(v.version), label: t(`第 ${v.version} 版，${when(v.createdAt)}`, `Version ${v.version}, ${when(v.createdAt)}`), description: v.author }))} /></div><Button className="artifact-history-edit" color="secondary" variant="outline" size="sm" disabled={!format.editable || !selected} onClick={() => { setDraft(preview); setBaseContent(artifact.content); setBaseVersion(artifact.version); setTab('edit'); }}>{t("以此版本继续编辑", "Edit from this version")}</Button></div>}
    <div className="artifact-body">{tab === 'edit' && format.editable ? <Textarea className="artifact-textarea" aria-label={t("编辑成果内容", "Edit file content")} value={draft} onChange={event => { setDraft(event.target.value); setSaved(false); }} rows={24} spellCheck={false} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void save(); } }} /> : selected ? <ArtifactPreview embedded artifact={artifact} content={preview} fileBytes={binaryBytes} version={selectedVersion}/> : <p className="artifact-preview-notice" role="alert">{t('此历史版本已不可用，请选择其他版本。', 'This saved version is unavailable. Choose another version.')}</p>}</div>
    {dirty && tab !== 'history' && <p className="editor-footnote">{t(`下载使用已保存的第 ${artifact.version} 版。`, `Downloads use saved version ${artifact.version}.`)}</p>}
    {readOnly&&<p className="editor-footnote">{format.editable?t("示例可预览、试改与查看版本，修改不会保存。", "Preview, try edits, and browse versions. Example changes are not saved."):t("示例文件可预览、下载原件与查看版本。", "Preview the example file, download the original, and browse versions.")}</p>}
    {tab === 'edit' && !readOnly && <p className="editor-footnote">{dirty ? t("有未保存的修改", "Unsaved changes") : t("所有修改已保存", "All changes saved")}{t("，⌘ / Ctrl + S 保存", ". ⌘ / Ctrl + S to save")}</p>}
  </section>;
}

function ViewIcon({list=false}:{list?:boolean}) {return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{list?<><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h1M3 12h1M3 18h1"/></>:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>}</svg>}
function BookmarkIcon({filled=false}:{filled?:boolean}) {return <svg width="17" height="17" viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/></svg>}
type LibraryItem={id:string;title:string;text:string;date:string;kind:'artifact'|'source';source?:Source;artifact?:Artifact};
export function ArtifactWorkspace({ data, id, onRefresh }: { data: Bootstrap; id?: string; onRefresh: () => Promise<void> }) {
  const [search,setSearch]=useState(''); const [filter,setFilter]=useState('all');
  const [layout,setLayout]=useState(()=>localStorage.getItem('hither.library.view')==='list'?'list':'grid');
  const favoritesKey=`hither.library.saved.${data.computer.id}`;
  const [saved,setSaved]=useState<string[]>(()=>{try{const value=JSON.parse(localStorage.getItem(spaceStorageKey(favoritesKey))||'[]');return Array.isArray(value)?value:[];}catch{return[];}});
  const [sourceId,setSourceId]=useState<string>();const [error,setError]=useState('');const [importing,setImporting]=useState(false);const fileRef=useRef<HTMLInputElement>(null);
  const artifact=data.artifacts.find(item=>item.id===id);const source=data.sources.find(item=>item.id===sourceId);
  function toggleSaved(key:string){const next=saved.includes(key)?saved.filter(v=>v!==key):[...saved,key];setSaved(next);try{localStorage.setItem(spaceStorageKey(favoritesKey),JSON.stringify(next));}catch{setError(t('收藏暂时无法保存。','Could not save this bookmark.'));}}
  async function importFile(file?:File){if(!file)return;setError('');if(file.size>1024*1024){setError(t('请选择小于 1 MB 的文字文件。','Choose a text file smaller than 1 MB.'));return;}if(!/\.(txt|md|markdown|csv|json)$/i.test(file.name)){setError(t('支持 TXT、Markdown、CSV 和 JSON 文字文件。','Supported formats: TXT, Markdown, CSV, and JSON.'));return;}setImporting(true);try{const text=await file.text();if(text.includes('\0'))throw new Error(t('这个文件不是可读取的文字文件。','This file is not readable text.'));await write('/sources',{title:file.name,text,kind:'document'});await onRefresh();setFilter('sources');}catch(e){setError(messageOf(e));}finally{setImporting(false);if(fileRef.current)fileRef.current.value='';}}
  if(artifact)return <div className="artifact-page"><ButtonLink as="a" color="secondary" variant="ghost" href="#artifacts">{t('返回资料库','Back to library')}</ButtonLink><ArtifactEditor key={artifact.id} artifact={artifact} readOnly={false} onRefresh={onRefresh}/></div>;
  const all:LibraryItem[]=[...data.artifacts.filter(a=>a.classification!=='reply_snapshot'&&(!data.profile.demo||!data.tasks.find(task=>task.id===a.taskId)?.archived)).map(a=>({id:`artifact:${a.id}`,title:a.name,text:a.content,date:a.updatedAt,kind:'artifact' as const,artifact:a})),...data.sources.map(s=>({id:`source:${s.id}`,title:s.title,text:s.text,date:s.createdAt,kind:'source' as const,source:s}))];
  const items=all.filter(item=>(filter==='all'||filter==='saved'&&saved.includes(item.id)||filter==='artifacts'&&item.kind==='artifact'||filter==='sources'&&item.kind==='source')&&`${item.title} ${item.text}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
  return <div className="library-workspace"><PageHeading title={t('资料库','Library')} description={t('浏览、编辑与整理保存的文档和任务成果。','Browse, edit and organize documents and deliverables.')} compactDescription={t('管理文档与任务成果。','Manage documents and deliverables.')} illustration="/art/page-library-v1.png" /><PageToolbar className="library-toolbar" label={t('资料库筛选与视图','Library filters and views')}><nav className="library-tabs" aria-label={t('资料分类','Library filters')}>{[{id:'all',label:t('全部','All')},{id:'saved',label:t('收藏','Saved')},{id:'artifacts',label:t('成果','Created')},{id:'sources',label:t('来源','Sources')}].map(item=><Button key={item.id} color="secondary" variant="ghost" selected={filter===item.id} onClick={()=>setFilter(item.id)}>{item.label}</Button>)}<span className="library-count">{t(`${items.length} 项`,`${items.length} items`)}</span></nav><div className="library-tools"><Button color="secondary" variant="ghost" uniform selected={layout==='grid'} aria-label={t('网格视图','Grid view')} onClick={()=>{setLayout('grid');localStorage.setItem('hither.library.view','grid');}}><ViewIcon/></Button><Button color="secondary" variant="ghost" uniform selected={layout==='list'} aria-label={t('列表视图','List view')} onClick={()=>{setLayout('list');localStorage.setItem('hither.library.view','list');}}><ViewIcon list/></Button><Input size="md" variant="outline" pill value={search} onChange={e=>setSearch(e.target.value)} startAdornment={<Search/>} aria-label={t('搜索资料库','Search library')} placeholder={t('搜索资料库','Search library')}/><Menu><Menu.Trigger><Button color="primary" loading={importing}>{t('新建','New')}<span aria-hidden="true">⌄</span></Button></Menu.Trigger><Menu.Content align="end" minWidth={190}><Menu.Item onSelect={()=>{location.hash='assistant';}}><Edit/>{t('开始创作','Start creating')}</Menu.Item><Menu.Item onSelect={()=>fileRef.current?.click()}><Download/>{t('导入文字文件','Import text file')}</Menu.Item><Menu.Item onSelect={()=>{location.hash='sources';}}><Document/>{t('管理来源','Manage sources')}</Menu.Item></Menu.Content></Menu></div></PageToolbar>
  <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json" hidden onChange={e=>void importFile(e.target.files?.[0])}/><ErrorNotice error={error}/>

  {items.length?<div className={`library-${layout}`}>{items.map(item=><article className="library-card" key={item.id}><button className="library-open" onClick={()=>item.artifact?location.hash=`artifacts/${item.artifact.id}`:setSourceId(item.source!.id)}><div className={`library-preview ${item.artifact?.type==='code'?'is-code':''}`} aria-hidden="true">{item.artifact?<ArtifactThumbnail artifact={item.artifact} large/>:<div className="library-paper"><strong>{item.title}</strong><p>{item.text.replace(/[#*>`]/g,'').slice(0,380)}</p></div>}</div><div className="library-card-label"><strong title={item.title}>{item.title}</strong><div className="library-card-meta"><span className="library-card-kind">{item.source?.import?<PlatformIcon platform={item.source.import.platform}/>:<Document/>}{item.artifact?artifactFormat(item.artifact).label:t('来源','Source')}</span><time dateTime={item.date}>{when(item.date)}</time></div></div></button><Button className="library-favorite" color="secondary" variant="ghost" size="sm" uniform aria-pressed={saved.includes(item.id)} aria-label={saved.includes(item.id)?t(`取消收藏 ${item.title}`,`Unsave ${item.title}`):t(`收藏 ${item.title}`,`Save ${item.title}`)} onClick={()=>toggleSaved(item.id)}><BookmarkIcon filled={saved.includes(item.id)}/></Button></article>)}</div>:<div className="library-empty"><img className="paper-spot" src="/art/paper-notebook.png" alt=""/><h2>{search?t('没有找到相关资料','No matching files'):filter==='saved'?t('还没有收藏','No saved items yet'):t('你的资料会显示在这里','Your files will appear here')}</h2><p>{search?t('试试其他关键词。','Try another search.'):filter==='saved'?t('点击资料旁的书签，将它留在这里。','Bookmark a file to find it here.'):t('导入资料，或保存对话中实际创建的文件。','Import a source or save a file you create in a conversation.')}</p><Button color="secondary" variant="outline" onClick={()=>search?setSearch(''):fileRef.current?.click()}>{search?t('清除搜索','Clear search'):t('导入资料','Import a file')}</Button></div>}
  {source&&<Dialog title={source.title} className="library-source-dialog" onClose={()=>setSourceId(undefined)}><div className="library-source-meta">{source.import?<PlatformIcon platform={source.import.platform}/>:<Document/>}<span>{when(source.createdAt)}</span><span>{source.demo?t('虚构示例','Fictional example'):t('本机资料','Local source')}</span></div><pre className="library-source-body">{source.text}</pre><div className="dialog-actions"><Button color="secondary" variant="ghost" onClick={()=>{setSourceId(undefined);location.hash='sources';}}>{t('管理来源','Manage sources')}</Button><Button color="primary" onClick={()=>setSourceId(undefined)}>{t('完成','Done')}</Button></div></Dialog>}
  </div>;
}
