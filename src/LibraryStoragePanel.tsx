import { useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { api, write, messageOf } from './api';
import { Dialog, ErrorNotice, Field } from './components';
import { t } from './i18n';
type Storage = { budgetGiB: number; reserveGiB: number; usedBytes: number; freeBytes: number; state: string; breakdown: { attachmentsBytes: number; copiedOriginalBytes: number; indexBytes: number } };
const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
export function LibraryStoragePanel({ refresh, onChange }: { refresh: number; onChange: () => void }) {
  const [data, setData] = useState<Storage>(), [editing, setEditing] = useState(false), [budget, setBudget] = useState('10'), [reserve, setReserve] = useState('5');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); void api<Storage>('/library/storage', { signal: controller.signal }).then(setData).catch(cause => { if (!controller.signal.aborted) setError(messageOf(cause)); }); return () => controller.abort(); }, [refresh]);
  async function save() { setBusy(true); setError(''); try { setData(await write<Storage>('/library/storage', { budgetGiB: Number(budget), reserveGiB: Number(reserve) }, 'PUT')); setEditing(false); onChange(); } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); } }
  return <div className="library-storage-panel"><ErrorNotice error={!editing ? error : ''}/>{data && <>
    <div className="library-storage-summary"><span>{t(`资料占用 ${size(data.usedBytes)} / 预算 ${data.budgetGiB} GiB`, `Library ${size(data.usedBytes)} / ${data.budgetGiB} GiB budget`)}</span><Button color="secondary" variant="ghost" size="sm" onClick={() => { setBudget(String(data.budgetGiB)); setReserve(String(data.reserveGiB)); setEditing(true); }}>{t('调整存储预算', 'Storage budget')}</Button></div>
    {data.state !== 'ready' && <p className="folder-issue">{data.state === 'disk_low' ? t('磁盘空间低于保留量，新增处理已暂停。', 'Processing paused: disk reserve reached.') : t('资料预算已用满，新增处理已暂停。', 'Processing paused: library budget reached.')}</p>}
    {editing && <Dialog title={t('资料存储预算', 'Library storage budget')} onClose={() => { if (!busy) setEditing(false); }}><div className="cog-stack">
      <p>{t(`已保存附件 ${size(data.breakdown.attachmentsBytes)}，原件副本 ${size(data.breakdown.copiedOriginalBytes)}，索引 ${size(data.breakdown.indexBytes)}。`, `Attachments ${size(data.breakdown.attachmentsBytes)}, copies ${size(data.breakdown.copiedOriginalBytes)}, indexes ${size(data.breakdown.indexBytes)}.`)}</p>
      <p>{t(`磁盘当前可用 ${size(data.freeBytes)}。引用的外部原件不计入资料预算。`, `Disk free: ${size(data.freeBytes)}. Linked external originals are excluded from this budget.`)}</p>
      <Field label={t('资料预算（GiB）', 'Library budget (GiB)')}><Input aria-label={t('资料预算（GiB）', 'Library budget (GiB)')} type="number" min={1} max={10240} step={1} value={budget} disabled={busy} onChange={event => setBudget(event.target.value)}/></Field>
      <Field label={t('磁盘至少保留（GiB）', 'Keep disk space free (GiB)')}><Input aria-label={t('磁盘至少保留（GiB）', 'Keep disk space free (GiB)')} type="number" min={1} max={1024} step={1} value={reserve} disabled={busy} onChange={event => setReserve(event.target.value)}/></Field>
      <p className="folder-hint">{t('预算控制新增处理，包含索引和临时写入余量，因此可能提前暂停。降低预算不会删除已有资料；提高后自动继续因空间暂停的队列。模型每次读取的上限独立保留。', 'Admission includes processing headroom, so a queue may pause before the displayed budget is full. Lowering the budget never deletes data; increasing it resumes storage-paused queues. Model reading limits stay separate.')}</p>
      <ErrorNotice error={error}/><Button color="primary" loading={busy} onClick={() => void save()}>{t('保存预算', 'Save budget')}</Button>
    </div></Dialog>}
  </>}</div>;
}
