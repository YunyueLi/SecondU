import { useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Dialog, ErrorNotice, Field } from './components';
import { messageOf, write } from './api';
import { t } from './i18n';
import { useUnsavedChanges } from './useUnsavedChanges';
import './folder-library.css';

export type LibraryCollection = { id: string; name: string; mode: string };
export function LibraryImportDialog({ onClose, onDone, collection, onNote }: {
  onClose: () => void; onDone: (root: LibraryCollection) => void | Promise<void>;
  collection?: LibraryCollection; onNote?: () => void;
}) {
  const [kind, setKind] = useState('files'), [name, setName] = useState(collection?.name ?? ''), [mode, setMode] = useState(collection?.mode ?? 'linked');
  const [paths, setPaths] = useState<string[]>([]), [directory, setDirectory] = useState(''), [interval, setIntervalMinutes] = useState('30');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const committed = useRef<LibraryCollection>(collection), working = useRef(false);
  useUnsavedChanges({ unsaved: !!(paths.length || directory || name), busy });
  async function choose(folder: boolean) {
    if (working.current) return; working.current = true; setBusy(true); setError('');
    try {
      if (folder) {
        const result = { path: window.hitherDesktop ? await window.hitherDesktop.chooseDirectory() : (await write<{ path: string | null }>('/projects/choose-directory', {})).path };
        if (result.path) { setDirectory(result.path); if (!name) setName(result.path.replace(/\/$/, '').split('/').at(-1) ?? ''); }
      } else {
        const result = { paths: window.hitherDesktop?.chooseFiles ? await window.hitherDesktop.chooseFiles() : (await write<{ paths: string[] }>('/library/choose-files', {})).paths };
        if (result.paths.length) { setPaths(old => [...new Set([...old, ...result.paths])]); if (!name) setName(t('我的资料集', 'My collection')); }
      }
    } catch (cause) { setError(messageOf(cause)); } finally { working.current = false; setBusy(false); }
  }
  async function submit() {
    if (working.current) return; working.current = true; setBusy(true); setError('');
    try {
      let root = committed.current;
      if (kind === 'folder' && !collection) {
        root ??= await write<LibraryCollection>('/library/roots', { path: directory, name, mode, intervalMinutes: Number(interval) });
        committed.current = root;
      } else {
        root ??= await write<LibraryCollection>('/library/collections', { name, mode });
        committed.current = root;
        await write(`/library/roots/${root.id}/pause`);
        for (let offset = 0; offset < paths.length; offset += 250) {
          await write(`/library/collections/${root.id}/files`, { paths: paths.slice(offset, offset + 250) });
          setProgress(t(`已登记检查 ${Math.min(offset + 250, paths.length)} / ${paths.length} 个文件`, `Registered ${Math.min(offset + 250, paths.length)} / ${paths.length} files`));
        }
        await write(`/library/roots/${root.id}/scan`);
      }
      await onDone(root); onClose();
    } catch (cause) { setError(`${messageOf(cause)}${committed.current ? t(' 已登记部分保留在资料集中，重试会去重。', ' Registered files are retained; retrying skips duplicates.') : ''}`); }
    finally { working.current = false; setBusy(false); }
  }
  return <Dialog title={collection ? t('向资料集添加文件', 'Add files to collection') : t('添加资料集', 'Add a collection')} className="library-import-dialog" onClose={() => { if (!busy) onClose(); }}>
    <div className="cog-stack">
      <p>{t('一次选择多个文件或整个文件夹，归入同一资料集。原件分别保存，正文按需读取。', 'Choose multiple files or a whole folder for one collection. Files stay separate and text is read on demand.')}</p>
      {!collection && <div className="folder-connection-actions"><Button color="secondary" variant="outline" selected={kind === 'files'} disabled={busy || !!committed.current} onClick={() => setKind('files')}>{t('多个文件', 'Multiple files')}</Button><Button color="secondary" variant="outline" selected={kind === 'folder'} disabled={busy || !!committed.current} onClick={() => setKind('folder')}>{t('整个文件夹', 'Whole folder')}</Button>{onNote && <Button color="secondary" variant="ghost" disabled={busy || !!committed.current} onClick={onNote}>{t('粘贴短笔记', 'Paste a note')}</Button>}</div>}
      <Field label={t('资料集名称', 'Collection name')}><Input aria-label={t('资料集名称', 'Collection name')} maxLength={300} value={name} disabled={busy || !!committed.current} onChange={event => setName(event.target.value)}/></Field>
      {kind === 'files' ? <>
        <Button color="secondary" variant="outline" loading={busy && !progress} disabled={busy} onClick={() => void choose(false)}>{t('选择文件（可多选）', 'Choose files (multiple)')}</Button>
        <p role="status">{t(`已选择 ${paths.length} 个文件`, `${paths.length} files selected`)}{paths.length > 0 && <Button size="sm" color="secondary" variant="ghost" disabled={busy} onClick={() => setPaths([])}>{t('清空选择', 'Clear selection')}</Button>}</p>
        {!!paths.length && <ul className="library-selected-files">{paths.slice(0, 8).map(file => <li key={file} title={file}>{file.split(/[\\/]/).at(-1)}</li>)}{paths.length > 8 && <li>{t(`另有 ${paths.length - 8} 个文件`, `${paths.length - 8} more files`)}</li>}</ul>}
        <details><summary>{t('手动填写文件路径', 'Enter file paths manually')}</summary><Textarea aria-label={t('文件完整路径，每行一个', 'Full file paths, one per line')} rows={4} disabled={busy} value={paths.join('\n')} onChange={event => setPaths([...new Set(event.target.value.split('\n').filter(Boolean))])}/></details>
      </> : <div className="folder-picker"><Input aria-label={t('资料文件夹路径', 'Materials folder path')} value={directory} disabled={busy || !!committed.current} onChange={event => setDirectory(event.target.value)} placeholder={t('完整文件夹路径', 'Full folder path')}/><Button color="secondary" variant="outline" disabled={busy || !!committed.current} onClick={() => void choose(true)}>{t('选择文件夹', 'Choose folder')}</Button></div>}
      {!collection && <Field label={t('原件保存方式', 'Original storage')}><Select value={mode} disabled={busy || !!committed.current} onChange={option => setMode(option.value)} options={[{ value: 'linked', label: t('引用原件（推荐）', 'Link originals (recommended)') }, { value: 'copied', label: t('同时保存原件副本', 'Also save copies') }]}/></Field>}
      <p className="folder-hint">{mode === 'linked' ? t('文件留在原位置，保存文字和搜索索引。移动或删除原件后，已提取文字仍在，原件可能无法打开。无需手动创建软链。', 'Files stay in place; text and search indexes are saved. Moving originals may make them unavailable. No manual symlinks needed.') : t('另存成功处理的原件副本，会占用更多空间。超过 64 MiB 的单个文件只登记位置并提示，尚不保存副本。', 'Keeps copies of processed originals, using more space. Files over 64 MiB are registered but not copied.')}</p>
      {kind === 'folder' && <Field label={t('检查更新', 'Check for changes')}><Select value={interval} disabled={busy || !!committed.current} onChange={option => setIntervalMinutes(option.value)} options={[15, 30, 60, 120, 360, 1440].map(minutes => ({ value: String(minutes), label: t(`每 ${minutes} 分钟`, `Every ${minutes} minutes`) }))}/></Field>}
      <p className="folder-hint">{t('支持文字、PDF、Word 和媒体原件。后台分批处理，不自动调用模型；未识别和未接入的文件会单独列明。单文件解析上限仍为 64 MiB。', 'Text, PDF, Word and media originals are supported. Processing stays local, with no automatic model calls. Unprocessed files are listed. Parsing remains bounded at 64 MiB per file.')}</p>
      {progress && <p role="status">{progress}</p>}<ErrorNotice error={error}/>
      <Button color="primary" loading={busy} disabled={busy || !name.trim() || (kind === 'files' ? !paths.length : !directory.trim())} onClick={() => void submit()}>{t('加入并开始整理', 'Add and process')}</Button>
    </div>
  </Dialog>;
}
