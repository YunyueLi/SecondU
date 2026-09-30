import { useState, type ChangeEvent } from 'react';
import type { Bootstrap, LifeEvent } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { ImageSquare, CloseBold, Reload, ChevronDown } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field } from '../components';
import { useAttachments } from '../composer/attachments';
import { t } from '../i18n';
import { SpotIllustration } from '../SpotIllustration';
import { write, messageOf } from '../api';
import { RecordDateInput } from './RecordDateInput';
import { SourceSelectField } from './SourceSelectField';
import { timelineCategoryOptions, timelineCategoryLabel, timelinePlatformOptions, timelinePhotoUrl } from './timelinePresentation';
import './record-forms.css';

export function EventForm({ event, data, initialScope = 'note', onClose, onSaved }: { event?: LifeEvent; data: Bootstrap; initialScope?: 'milestone'|'note'; onClose: () => void; onSaved: () => Promise<void> }) {
  const sourcePlatform = event?.sourceIds.map(id => data.sources.find(source => source.id === id)?.import?.platform).find(Boolean);
  const [draft, setDraft] = useState<Partial<LifeEvent>>(() => { const today = new Date(); return event ? { ...event, platform: event.platform || sourcePlatform || 'hither' } : { title: '', description: '', date: initialScope === 'note' ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` : '', endDate: '', scope: initialScope, category: 'life', platform: 'hither', location: '', personIds: [], sourceIds: [] }; });
  const [existing, setExisting] = useState(event?.attachmentIds || []), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const attachments = useAttachments({ maxFiles: 9, contextKey: event?.id || 'new-timeline-record' });
  const total = existing.length + attachments.items.length;
  const waiting = busy || attachments.busy;
  const update = <K extends keyof LifeEvent>(key: K, value: LifeEvent[K]) => setDraft(current => ({ ...current, [key]: value }));
  const categories = timelineCategoryOptions();
  if (draft.category && !categories.some(item => item.value === draft.category)) categories.push({ value: draft.category, label: timelineCategoryLabel(draft.category) });

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = '';
    if (!files.length) return;
    setError('');
    if (files.some(file => !/^image\/(png|jpeg|webp|gif)$/.test(file.type))) { setError(t('请选择 PNG、JPEG、WebP 或 GIF 图片。', 'Choose PNG, JPEG, WebP, or GIF images.')); return; }
    if (total + files.length > 9) { setError(t(`还可以添加 ${Math.max(0, 9 - total)} 张图片，每条记录最多 9 张。`, `You can add ${Math.max(0, 9 - total)} more photos, up to 9 per record.`)); return; }
    void attachments.addFiles(files);
  }

  return <Dialog title={event ? t('编辑记录', 'Edit record') : t('记录这一刻', 'Add a moment')} onClose={() => { if (!waiting) onClose(); }} className="record-dialog timeline-entry-dialog">
    <form className="cog-stack record-form" onSubmit={async e => {
      e.preventDefault(); if (waiting || attachments.hasErrors) return;
      setBusy(true); setError('');
      try {
        if (!saved) {
          if (!draft.date) throw new Error(t('请选择日期；只知道年份或月份也可以。', 'Choose a date. A year or month is enough.'));
          await write(event ? `/events/${event.id}` : '/events', { ...draft, attachmentIds: [...existing, ...attachments.attachmentIds] }, event ? 'PUT' : 'POST');
          setSaved(true);
        }
        await onSaved(); onClose();
      } catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || saved} className="timeline-form-fields">
        <div className={!event?'spot-field-heading':undefined}><Field label={t('一句话记下这一刻', 'A title for this moment')}><Input aria-label={t('记录标题', 'Record title')} required maxLength={300} placeholder={t('例如：和老朋友一起走了新的路线', 'For example: a new route with an old friend')} value={draft.title || ''} onChange={e => update('title', e.target.value)} /></Field>{!event&&<SpotIllustration scene="milestone"/>}</div>
        <Field label={t('发生了什么', 'What happened?')}><Textarea aria-label={t('记录内容', 'Record text')} rows={4} maxLength={20000} placeholder={t('写下想留下的细节。', 'Keep the details you want to remember.')} value={draft.description || ''} onChange={e => update('description', e.target.value)} /></Field>
        <div className="timeline-photo-field"><div className="timeline-photo-field-heading"><span className="field-label">{t('照片', 'Photos')}</span><small>{total} / 9</small></div>
          <input ref={attachments.inputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" aria-label={t('选择记录图片', 'Choose record photos')} disabled={waiting} onChange={addImages} />
          <div className="timeline-draft-images">
            {existing.map(id => { const photo = data.attachments?.find(item => item.id === id); return <div className="timeline-draft-image" key={id}>{photo ? <img src={timelinePhotoUrl(id)} alt={photo.name} /> : <span>{t('图片不可用', 'Unavailable')}</span>}<Button type="button" color="secondary" variant="solid" uniform size="xs" aria-label={t(`从记录移除 ${photo?.name || id}`, `Remove ${photo?.name || id} from record`)} disabled={busy} onClick={() => setExisting(ids => ids.filter(value => value !== id))}><CloseBold /></Button></div>; })}
            {attachments.items.map(item => <div className={`timeline-draft-image is-${item.status}`} key={item.id}>{item.previewUrl && <img src={item.previewUrl} alt={item.file.name} />}<Button type="button" color="secondary" variant="solid" uniform size="xs" aria-label={t(`从记录移除 ${item.file.name}`, `Remove ${item.file.name} from record`)} disabled={busy} onClick={() => attachments.remove(item.id)}><CloseBold /></Button>{item.status === 'uploading' && <span className="timeline-draft-state" role="status">{t('保存中', 'Saving')}</span>}{item.status === 'error' && <span className="timeline-draft-state is-error"><small>{item.error?.code === 'too_large' ? t('超过 8 MiB', 'Over 8 MiB') : item.error?.message || t('保存失败', 'Could not save')}</small>{item.error?.code === 'upload_failed' && <Button type="button" color="secondary" variant="solid" size="xs" aria-label={t(`重试 ${item.file.name}`, `Retry ${item.file.name}`)} onClick={() => void attachments.retry(item.id)}><Reload />{t('重试', 'Retry')}</Button>}</span>}</div>)}
            {total < 9 && <Button type="button" color="secondary" variant="outline" className="timeline-add-image" disabled={waiting} onClick={() => attachments.inputRef.current?.click()}><ImageSquare /><span>{t('添加照片', 'Add photos')}</span></Button>}
          </div><p className="field-hint">{t('原图保存在当前电脑，每张最多 8 MiB。从记录移除图片会保留本机原件。', 'Originals stay on this computer, up to 8 MiB each. Removing a photo from this record keeps its local original.')}</p>
        </div>
        <div className="timeline-form-pair"><Field label={t('日期', 'Date')}><RecordDateInput required allowPartial value={draft.date || ''} onChange={value => update('date', value)} disabled={busy} /></Field><Field label={t('放在哪一类', 'Record type')}><Select value={draft.scope || 'note'} options={[{ value: 'note', label: t('日常片段', 'Everyday moment') }, { value: 'milestone', label: t('人生经历', 'Life milestone') }]} align="start" onChange={option => update('scope', option.value as 'note'|'milestone')} /></Field></div>
        <details className="timeline-form-details"><summary>{t('来源、地点与相关人', 'Source, location, and people')}<ChevronDown /></summary><div className="timeline-form-fields">
          <div className="timeline-form-pair"><Field label={t('来源平台', 'Source platform')}><Select value={draft.platform || 'hither'} options={timelinePlatformOptions()} align="start" listMaxWidth={260} onChange={option => update('platform', option.value)} /></Field><Field label={t('地点（可选）', 'Location (optional)')}><Input aria-label={t('记录地点', 'Record location')} maxLength={300} value={draft.location || ''} onChange={e => update('location', e.target.value)} /></Field></div>
          <p className="field-hint">{t('平台用于标记这条记录的出处；选择平台不会连接账号。', 'The platform labels this record’s origin. Choosing it does not connect an account.')}</p>
          <SourceSelectField label={t('关联原始来源', 'Link original sources')} sources={data.sources} value={draft.sourceIds || []} onChange={ids => update('sourceIds', ids)} disabled={busy} />
          <SourceSelectField label={t('相关人', 'People in this moment')} sources={data.people.filter(person => person.id !== (data.profile.selfPersonId ?? 'person-self')).map(person => ({ id: person.id, title: person.name }))} value={draft.personIds || []} placeholder={t('选择相关人物（可选）', 'Choose people (optional)')} onChange={ids => update('personIds', ids)} disabled={busy} />
          <div className="timeline-form-pair"><Field label={t('主题', 'Topic')}><Select value={draft.category || 'life'} options={categories} align="start" onChange={option => update('category', option.value)} /></Field><Field label={t('结束日期（可选）', 'End date (optional)')}><RecordDateInput allowPartial value={draft.endDate || ''} onChange={value => update('endDate', value)} disabled={busy} /></Field></div>
        </div></details>
      </fieldset>
      {saved && <p className="field-hint" role="status">{t('记录已保存。若列表尚未刷新，重试不会重复添加。', 'Your record is saved. Retrying refresh will not add a duplicate.')}</p>}<ErrorNotice error={error} /><div className="record-actions"><Button type="button" color="secondary" variant="ghost" disabled={waiting} onClick={onClose}>{saved ? t('关闭', 'Close') : t('取消', 'Cancel')}</Button><Button type="submit" color="primary" loading={busy} disabled={waiting || attachments.hasErrors || !draft.title?.trim()}>{saved ? t('重试刷新', 'Retry refresh') : t('保存记录', 'Save record')}</Button></div>
    </form>
  </Dialog>;
}
