import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { api, write, messageOf } from './api';
import { ErrorNotice } from './components';
import { t } from './i18n';

type AttachmentIndexStatus = {
  rootId: string; enabled: boolean; status: string; error?: string;
  counts: { total: number; indexed: number; pending: number; failed: number; unsupported: number; needsAttention: number; missing: number };
};
type IndexedAttachment = { attachmentId: string; name: string; documentId?: string; status: string; detail: string; revision?: string | null };

/** Existing originals are indexed in place; starting this never uploads to a model. */
export function ExistingAttachmentIndex({ refresh, onChange, onBrowse }: { refresh: number; onChange: () => void; onBrowse: (rootId: string) => void }) {
  const [data, setData] = useState<AttachmentIndexStatus>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<AttachmentIndexStatus>('/library/existing-attachments/status', { signal: controller.signal }).then(setData).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [refresh]);
  async function act(action: string) {
    if (!data) return; setBusy(true); setError('');
    try {
      if (action === 'scan') setData(await write<AttachmentIndexStatus>('/library/existing-attachments/scan', {}));
      else await write(`/library/roots/${data.rootId}/${action}`);
      onChange();
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  if (!data) return error ? <ErrorNotice error={error}/> : null;
  if (!data.counts.total && !data.enabled) return null;
  const { counts } = data, waiting = data.status === 'running';
  return <section className="existing-attachment-index" aria-label={t('已保存附件的全文状态', 'Full-text status of saved attachments')}>
    <div><strong>{t('已保存的资料附件', 'Saved source attachments')}</strong>
      <p className="folder-hint">{data.enabled
        ? t(`共 ${counts.total} 份 · ${counts.indexed} 份已建立文字索引 · ${counts.pending} 份等待处理`, `${counts.total} files · ${counts.indexed} text-indexed · ${counts.pending} pending`)
        : t(`现有 ${counts.total} 份附件可在原位置补建全文索引，无需重新上传。`, `${counts.total} existing attachments can be indexed in place. No re-upload is needed.`)}</p>
      {!!(counts.failed + counts.unsupported + counts.needsAttention + counts.missing) && <p className="folder-issue">{t(`失败 ${counts.failed} · 未提取正文 ${counts.unsupported} · 待检查 ${counts.needsAttention} · 原件缺失 ${counts.missing}。打开附件列表查看具体原因。`, `${counts.failed} failed · ${counts.unsupported} without extracted text · ${counts.needsAttention} need review · ${counts.missing} originals missing. Open the list for details.`)}</p>}
      <p className="folder-hint">{t('本机处理，保留原资料和记忆关联。已完成的文字可搜索；不会自动发送给模型。', 'Processed locally, preserving sources and memory links. Indexed text is searchable. Nothing is automatically sent to a model.')}</p>
      <ErrorNotice error={error || data.error || ''}/>
    </div>
    <div className="folder-connection-actions">
      {!data.enabled ? <Button color="secondary" variant="outline" loading={busy} onClick={() => void act('scan')}>{t('补建全文索引', 'Index saved attachments')}</Button>
        : <><Button color="secondary" variant="outline" disabled={busy} onClick={() => onBrowse(data.rootId)}>{t('查看附件全文', 'Browse attachment text')}</Button>
          <Button color="secondary" variant="ghost" loading={busy} onClick={() => void act(waiting ? 'pause' : ['paused', 'cancelled'].includes(data.status) ? 'resume' : 'scan')}>{waiting ? t('暂停整理', 'Pause') : ['paused', 'cancelled'].includes(data.status) ? t('继续整理', 'Resume') : t('检查新增附件', 'Check new attachments')}</Button>
          {counts.failed > 0 && !waiting && <Button color="secondary" variant="ghost" disabled={busy} onClick={() => void act('retry')}>{t('重试失败项', 'Retry failed files')}</Button>}</>}
    </div>
  </section>;
}

export function SourceAttachmentText({ sourceId, onOpen }: { sourceId: string; onOpen?: () => void }) {
  const [items, setItems] = useState<IndexedAttachment[]>([]), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setItems([]); setError('');
    void api<{ items: IndexedAttachment[] }>(`/library/existing-attachments?${new URLSearchParams({ sourceId, pageSize: '100' })}`, { signal: controller.signal }).then(result => setItems(result.items)).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [sourceId]);
  return <div className="source-attachment-text"><ErrorNotice error={error}/>{items.map(item => <p key={item.attachmentId}>{item.documentId && item.revision
    ? <><ButtonLink color="secondary" variant="outline" href={`#artifacts/${item.documentId}`} onClick={onOpen}>{item.status === 'ready' ? t(`阅读全文：${item.name}`, `Read full text: ${item.name}`) : t(`查看附件处理情况：${item.name}`, `Check attachment: ${item.name}`)}</ButtonLink>{item.status !== 'ready' && <span className="folder-hint"> {item.detail}</span>}</>
    : <span className="folder-hint">{t(`${item.name}：${item.detail || '尚未建立全文索引，可到资料库补建。'}`, `${item.name}: ${item.detail || 'Full-text indexing has not finished. Open the library to index it.'}`)}</span>}</p>)}</div>;
}
