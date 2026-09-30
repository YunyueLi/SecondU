import { useMemo, useState } from 'react';
import type { Bootstrap, LifeEvent, Attachment } from '../../shared/contracts';
import { timelineFeed, type TimelineItem } from '../../shared/timeline-feed.mjs';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { PlatformFilter } from './PlatformFilter';
import { Plus, Edit, ChevronDown, ArrowLeft, ArrowRight, MapPin, Desktop, FileUpload } from '@openai/apps-sdk-ui/components/Icon';
import { Empty, PageHeading, TaskBadge } from '../components';
import { t, getLocale } from '../i18n';
import { ActivityImportDialog, DailyActivities } from './DailyActivityPanel';
import { ComputerActivityDemo } from './ComputerActivityDemo';
import { PlatformIcon, PlatformOption } from './PlatformIcon';
import { EventForm } from './TimelineEventForm';
import { TimelineImages, TimelinePhotoViewer } from './TimelineMedia';
import { fullTimelineDate, timelineCategoryLabel, timelinePlatformLabel } from './timelinePresentation';
import './timeline.css';

function originLabel(item: TimelineItem) {
  return item.origin === 'import' ? t('导入记录', 'Imported record') : item.origin === 'source' ? t('关联来源', 'Linked source') : item.origin === 'task' ? t('任务记录', 'Task activity') : item.origin === 'room' ? t('对话记录', 'Chat activity') : t('手动记录', 'Manual record');
}
function timeLabel(value: string) { return new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }

function Moment({ item, data, refs, onEdit, onPhotos }: { item: TimelineItem; data: Bootstrap; refs: (ids: string[], compact?: boolean) => React.ReactNode; onEdit: (event: LifeEvent) => void; onPhotos: (images: Attachment[], index: number) => void }) {
  const event = item.eventId ? data.events.find(event => event.id === item.eventId) : undefined;
  const people = item.personIds.filter(id => id !== (data.profile.selfPersonId ?? 'person-self')).flatMap(id => data.people.find(person => person.id === id) || []);
  const [expanded, setExpanded] = useState(false);
  const lengthy = item.description.length > 320;
  const platformLabel = item.platform === 'other' && item.app ? item.app : timelinePlatformLabel(item.platform);
  return <article className={`timeline-moment ${event ? 'is-record' : 'is-activity'}`} data-record-id={item.eventId || item.activityId}>
    <header className="timeline-moment-heading"><span className="timeline-person-avatar" aria-hidden="true">{Array.from(data.profile.name)[0] || 'H'}</span><div className="timeline-moment-author"><strong>{data.profile.name}</strong><span><PlatformIcon platform={item.platform} /><span>{platformLabel}</span><span>{originLabel(item)}</span>{item.startAt && <><time dateTime={item.startAt}>{timeLabel(item.startAt)}</time></>}</span></div>{event && <Button color="secondary" variant="ghost" uniform size="sm" aria-label={t(`编辑记录：${item.title}`, `Edit record: ${item.title}`)} onClick={() => onEdit(event)}><Edit /></Button>}</header>
    <div className="timeline-moment-body"><h3>{item.title}</h3>{item.description && <><p className={`timeline-moment-text ${lengthy && !expanded ? 'is-collapsed' : ''}`}>{item.description}</p>{lengthy && <button type="button" className="timeline-text-toggle" onClick={() => setExpanded(value => !value)}>{expanded ? t('收起', 'Show less') : t('展开全文', 'Read more')}</button>}</>}
      {!!item.attachments.length && <TimelineImages images={item.attachments} onOpen={index => onPhotos(item.attachments, index)} />}
      {item.attachmentIds.length > item.attachments.length && <p className="timeline-photo-missing">{t('部分图片暂时不可用，可在编辑记录时重新添加。', 'Some photos are unavailable. Re-add them when editing this record.')}</p>}
      <footer className="timeline-moment-meta">{item.scope === 'milestone' && <span>{t('人生经历', 'Milestone')}{item.category&&<span className="timeline-meta-category">{timelineCategoryLabel(item.category)}</span>}</span>}{item.location && <span className="timeline-location"><MapPin />{item.location}</span>}{people.length > 0 && <span>{t('和 ', 'With ')}{people.map(person => person.name).join(t('、', ', '))}</span>}{item.endDate && <span>{t('至 ', 'Until ')}{fullTimelineDate(item.endDate)}</span>}{item.demo && <span>{item.origin === 'task' || item.origin === 'room' ? t('示例记录', 'Example record') : t('虚构示例', 'Fictional example')}</span>}</footer>
      {(item.sourceIds.length > 0 || item.taskId || item.sourceUrl) && <div className="timeline-record-links">{item.sourceIds.length > 0 && <details><summary>{t(`原始来源 ${item.sourceIds.length}`, `${item.sourceIds.length} original sources`)}<ChevronDown /></summary><div className="timeline-source-content">{refs(item.sourceIds, true)}</div></details>}{item.taskId && <a href={`#task/${item.taskId}`}>{t('查看原任务', 'Open task')}<ArrowRight /></a>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{t('原始链接', 'Source link')}<ArrowRight /></a>}{item.status && item.status !== 'recorded' && <TaskBadge status={item.status as Parameters<typeof TaskBadge>[0]['status']} />}</div>}
    </div>
  </article>;
}

export function LifeTimeline({ data, refs, onRefresh, onAsk }: { data: Bootstrap; refs: (ids: string[], compact?: boolean) => React.ReactNode; onRefresh: () => Promise<void>; onAsk: (prompt: string) => void|Promise<void> }) {
  const [scope, setScope] = useState<'all'|'milestone'|'note'>('all'), [platform, setPlatform] = useState('all');
  const [editing, setEditing] = useState<LifeEvent | 'new'>(), [importing, setImporting] = useState(false), [computer, setComputer] = useState<'demo'|'saved'>();
  const [photos, setPhotos] = useState<{ images: Attachment[]; index: number }>(), [limit, setLimit] = useState(60);
  const items = useMemo(() => timelineFeed(data), [data]);
  const platformOptions = [{ value: 'all', label: t('所有来源', 'All sources') }, ...[...new Set(items.map(item => item.platform))].map(value => ({ value, label: timelinePlatformLabel(value) }))];
  const filtered = items.filter(item => (scope === 'all' || item.scope === scope) && (platform === 'all' || item.platform === platform));
  const visible = filtered.slice(0, limit), dates = [...new Set(visible.map(item => item.date))];
  return <section className="life-timeline-page">
    <PageHeading title={t('时间轴', 'Timeline')} description={t('把经历、日常和各处保存的片段，放在同一条时间线上。', 'Your milestones, everyday moments, and saved records in one timeline.')} action={<div className="timeline-heading-actions"><Button color="primary" size="sm" onClick={() => setEditing('new')}><Plus />{t('记录一下', 'Add a moment')}</Button></div>} />
    <div className="timeline-view-switch"><SegmentedControl value={computer?'computer':'timeline'} onChange={value=>setComputer(value==='computer'?'demo':undefined)} aria-label={t('时间轴视图','Timeline view')}><SegmentedControl.Option value="timeline">{t('时间轴','Timeline')}</SegmentedControl.Option><SegmentedControl.Option value="computer">{t('电脑活动','Computer activity')}</SegmentedControl.Option></SegmentedControl></div>
    {computer ? <div className="timeline-computer-view"><div className="timeline-computer-toolbar">{computer === 'saved' && <Button color="secondary" variant="ghost" size="sm" onClick={() => setComputer('demo')}>{t('电脑活动演示', 'Computer activity demo')}</Button>}</div>{computer === 'demo' ? <ComputerActivityDemo hideTitle onAsk={onAsk} onRecords={() => setComputer('saved')} onImport={() => setImporting(true)} onAddNote={() => setEditing('new')} /> : <DailyActivities items={data.dailyActivities || []} filter="all" refs={refs} onEdit={id => { const event = data.events.find(item => item.id === id); if (event) setEditing(event); }} />}</div> : <>
      <div className="life-timeline-toolbar"><div className="life-timeline-tabs" aria-label={t('记录类型', 'Record types')}>{([{ value: 'all', label: t('全部', 'All') }, { value: 'milestone', label: t('人生经历', 'Milestones') }, { value: 'note', label: t('日常片段', 'Everyday') }] as const).map(item => <Button key={item.value} color="secondary" variant="ghost" selected={scope === item.value} size="sm" onClick={() => { setScope(item.value); setLimit(60); }}>{item.label}</Button>)}</div><div className="timeline-filter-actions"><PlatformFilter label={t('筛选来源','Filter sources')} value={platform} options={platformOptions} align="end" onChange={value => { setPlatform(value); setLimit(60); }} /><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('导入已有活动记录', 'Import saved activity')} title={t('导入已有活动记录', 'Import saved activity')} onClick={() => setImporting(true)}><FileUpload /></Button></div></div>
      <p className="timeline-scope-note">{data.profile.demo ? t('示例故事为虚构。新增内容单独保存在这个空间。', 'The example stories are fictional. New records stay in this space.') : t('展示你已保存和导入的记录。', 'Showing records you have saved or imported.')}<span>{t(`${filtered.length} 条`, `${filtered.length} records`)}</span></p>
      <div className="timeline-stream">{dates.map(date => <section className="timeline-date-group" key={date} aria-label={fullTimelineDate(date)}><h2 className="timeline-date"><time dateTime={date}>{fullTimelineDate(date)}</time></h2><div className="timeline-date-moments">{visible.filter(item => item.date === date).map(item => <Moment key={item.id} item={item} data={data} refs={refs} onEdit={setEditing} onPhotos={(images, index) => setPhotos({ images, index })} />)}</div></section>)}{!filtered.length && <Empty title={t('留下一段自己的记录', 'Keep a moment of your own')} description={t('一张照片、一段日常，或一次重要改变。可以添加来源、地点与相关人。', 'A photo, an everyday moment, or an important change. Add its source, place, and people.')} action={<Button color="secondary" variant="outline" onClick={() => setEditing('new')}>{t('记录一下', 'Add a moment')}</Button>} />}{filtered.length > limit && <Button className="timeline-more" color="secondary" variant="outline" onClick={() => setLimit(value => value + 60)}>{t('更早的记录', 'Earlier records')}<ChevronDown /></Button>}</div>
    </>}
    {importing && <ActivityImportDialog onClose={() => setImporting(false)} onRefresh={onRefresh} />}
    {editing && <EventForm event={editing === 'new' ? undefined : editing} data={data} initialScope={scope === 'milestone' ? 'milestone' : 'note'} onClose={() => setEditing(undefined)} onSaved={onRefresh} />}
    {photos && <TimelinePhotoViewer images={photos.images} initialIndex={photos.index} onClose={() => setPhotos(undefined)} />}
  </section>;
}
