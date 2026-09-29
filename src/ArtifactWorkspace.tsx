import { useEffect, useRef, useState } from 'react';
import type { Artifact, Bootstrap } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Search, Document, Download, CloseBold, Edit, Check } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice, Empty, PageHeading, when, RichText } from './components';
import { write, messageOf } from './api';

type Draft = { content: string; baseContent: string; baseVersion: number };
function savedDraft(artifact: Artifact): Draft {
  try { const draft = JSON.parse(sessionStorage.getItem(`hither.artifact.${artifact.id}`) || 'null'); if (draft && typeof draft.content === 'string' && typeof draft.baseContent === 'string' && Number.isInteger(draft.baseVersion)) return draft; } catch { /* A missing session draft does not affect the saved artifact. */ }
  return { content: artifact.content, baseContent: artifact.content, baseVersion: artifact.version };
}

export function ArtifactEditor({ artifact, onRefresh, onClose, compact = false }: { artifact: Artifact; onRefresh: () => Promise<void>; onClose?: () => void; compact?: boolean }) {
  const [tab, setTab] = useState<'preview' | 'edit' | 'history'>('preview');
  const [initial] = useState(() => savedDraft(artifact));
  const [draft, setDraft] = useState(initial.content);
  const [baseContent, setBaseContent] = useState(initial.baseContent);
  const [baseVersion, setBaseVersion] = useState(initial.baseVersion);
  const [historyVersion, setHistoryVersion] = useState(String(artifact.version));
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [draftWarning, setDraftWarning] = useState('');
  const dirty = draft !== baseContent;
  useEffect(() => { if (!dirty && !saveInFlight.current) { setDraft(artifact.content); setBaseContent(artifact.content); setBaseVersion(artifact.version); } }, [artifact.content, artifact.version]);
  useEffect(() => { try { if (dirty) sessionStorage.setItem(`hither.artifact.${artifact.id}`, JSON.stringify({content:draft,baseContent,baseVersion})); else sessionStorage.removeItem(`hither.artifact.${artifact.id}`); setDraftWarning(''); } catch { setDraftWarning('无法暂存草稿，请在离开前保存修改。'); } }, [artifact.id,draft,baseContent,baseVersion,dirty]);
  useEffect(() => { if (!dirty) return; const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; addEventListener('beforeunload', prevent); return () => removeEventListener('beforeunload', prevent); }, [dirty]);
  async function save() {
    if (!dirty || saveInFlight.current) return;
    saveInFlight.current = true;
    const submittedDraft = draft;
    setSaving(true); setError(''); setSaved(false);
    try { const result = await write<Artifact>(`/artifacts/${artifact.id}`, { content: submittedDraft, baseVersion }, 'PUT'); setBaseVersion(result.version); setBaseContent(result.content); setDraft(current => current === submittedDraft ? result.content : current); await onRefresh(); setSaved(true); }
    catch (e) { setError(messageOf(e)); }
    finally { saveInFlight.current = false; setSaving(false); }
  }
  const historical = artifact.versions.find(v => String(v.version) === historyVersion);
  const preview = tab === 'history' ? historical?.content ?? artifact.content : draft;
  return <section className={`artifact-editor ${compact ? 'compact' : ''}`} aria-label={`成果：${artifact.name}`}>
    <div className="artifact-chrome"><header className="artifact-header"><div><Document /><div><h2>{artifact.name}</h2><span role="status">第 {artifact.version} 版 · {saving ? '正在保存…' : dirty ? '有未保存的修改' : saved ? '修改已保存' : when(artifact.updatedAt)}</span></div></div><div className="row"><ButtonLink as="a" color="secondary" variant="ghost" href={`/api/artifacts/${artifact.id}/download`} aria-label="下载成果"><Download /></ButtonLink>{onClose && <Button color="secondary" variant="ghost" uniform aria-label="关闭成果" onClick={() => { if (!dirty || window.confirm('还有未保存的修改，仍然关闭？')) onClose(); }}><CloseBold /></Button>}</div></header>
    <div className="artifact-toolbar"><SegmentedControl aria-label="成果视图" value={tab} onChange={setTab} size="sm"><SegmentedControl.Option value="preview">预览</SegmentedControl.Option><SegmentedControl.Option value="edit">编辑</SegmentedControl.Option><SegmentedControl.Option value="history">版本</SegmentedControl.Option></SegmentedControl><Button color="primary" size="sm" disabled={!dirty || saving} loading={saving} onClick={save}><Check />保存修改</Button></div>
    </div>
    {artifact.reviewStatus === 'pending' && <Alert color="warning" variant="soft" title="中断前留下的成果，等待核对" description="任务没有完整结束。这份文件可能不完整，查看内容后再决定如何继续。" />}
    <ErrorNotice error={error || draftWarning} />
    {artifact.version !== baseVersion && dirty && <Alert color="warning" variant="soft" title="有更新的版本" description="你的草稿仍在。请先查看新版本，避免覆盖其他修改。" actions={<Button color="secondary" variant="outline" size="sm" onClick={() => { if (confirm('放弃当前草稿并载入最新版本？')) { setDraft(artifact.content); setBaseContent(artifact.content); setBaseVersion(artifact.version); setError(''); } }}>载入新版本</Button>} />}
    {tab === 'history' && <div className="history-picker"><Select value={historyVersion} onChange={option => setHistoryVersion(option.value)} options={[...artifact.versions].sort((a,b) => b.version-a.version).map(v => ({ value: String(v.version), label: `第 ${v.version} 版 · ${when(v.createdAt)}`, description: v.author }))} /><Button color="secondary" variant="outline" size="sm" onClick={() => { setDraft(preview); setBaseContent(artifact.content); setBaseVersion(artifact.version); setTab('edit'); }}>以此版本继续编辑</Button></div>}
    <div className="artifact-body">{tab === 'edit' ? <Textarea className="artifact-textarea" aria-label="编辑成果内容" value={draft} onChange={event => { setDraft(event.target.value); setSaved(false); }} rows={24} spellCheck={false} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void save(); } }} /> : artifact.type === 'html' ? <iframe title={artifact.name} sandbox="" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">${preview}`} /> : <RichText className="document-markdown">{artifact.type === 'markdown' ? preview : `\`\`\`\n${preview}\n\`\`\``}</RichText>}</div>
    {tab === 'edit' && <p className="editor-footnote">{dirty ? '有未保存的修改' : '所有修改已保存'} · ⌘ / Ctrl + S 保存</p>}
  </section>;
}

export function ArtifactWorkspace({ data, id, onRefresh }: { data: Bootstrap; id?: string; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const artifact = data.artifacts.find(item => item.id === id);
  if (artifact) return <div className="artifact-page"><ButtonLink as="a" color="secondary" variant="ghost" href="#artifacts">返回全部成果</ButtonLink><ArtifactEditor key={artifact.id} artifact={artifact} onRefresh={onRefresh} /></div>;
  const items = [...data.artifacts].filter(item => `${item.name} ${item.content}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return <div className="page-content"><PageHeading title="成果" description="一起完成的文档和作品，都留在这里。" /><Input value={search} onChange={event => setSearch(event.target.value)} startAdornment={<Search />} aria-label="搜索成果" placeholder="搜索名称或内容" className="page-search" />{items.length ? <div className="artifact-list">{items.map(item => <ButtonLink as="a" color="secondary" variant="ghost" pill={false} className="artifact-list-item" href={`#artifacts/${item.id}`} key={item.id}><Document /><span><strong>{item.name}</strong><small>{data.tasks.find(task => task.id === item.taskId)?.title || '本地成果'} · 第 {item.version} 版{item.reviewStatus === 'pending' ? ' · 待验收' : ''}</small></span><time>{when(item.updatedAt)}</time><Edit /></ButtonLink>)}</div> : <Empty title={search ? '没有找到成果' : '成果会在这里留下来'} description={search ? '换一个关键词试试。' : '交给助理一个任务，完成后可预览、编辑并保留每次修订。'} action={<ButtonLink as="a" color="primary" href="#assistant">开始一个任务</ButtonLink>} />}</div>;
}
