import { useEffect, useMemo, useState } from 'react';
import type { Bootstrap, LifeEvent, Attachment } from '../../shared/contracts';
import { timelineFeed, type TimelineItem } from '../../shared/timeline-feed.mjs';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { PlatformFilter } from './PlatformFilter';
import { Plus, Edit, ChevronDown, ArrowRight, MapPin, FileUpload } from '@openai/apps-sdk-ui/components/Icon';
import { Empty, PageHeading, PageToolbar, TaskBadge } from '../components';
import { t, getLocale } from '../i18n';
import { ActivityImportDialog, DailyActivities } from './DailyActivityPanel';
import { ComputerActivityDemo } from './ComputerActivityDemo';
import { PlatformIcon } from './PlatformIcon';
import { EventForm } from './TimelineEventForm';
import { TimelineImages, TimelinePhotoViewer } from './TimelineMedia';
import { fullTimelineDate, timelineCategoryLabel, timelinePlatformLabel } from './timelinePresentation';
import { spaceStorageKey } from '../space';
import { timelineYearGroups, readTimelineYearState, timelineYearIsOpen } from './timelineGrouping.mjs';
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
    <header className="timeline-moment-heading"><h3>{item.title}</h3>{event && <Button color="secondary" variant="ghost" uniform size="sm" aria-label={t(`编辑记录：${item.title}`, `Edit record: ${item.title}`)} onClick={() => onEdit(event)}><Edit /></Button>}</header>
    <div className="timeline-moment-body">{item.description && <><p className={`timeline-moment-text ${lengthy && !expanded ? 'is-collapsed' : ''}`}>{item.description}</p>{lengthy && <button type="button" className="timeline-text-toggle" onClick={() => setExpanded(value => !value)}>{expanded ? t('收起', 'Show less') : t('展开全文', 'Read more')}</button>}</>}
      {!!item.attachments.length && <TimelineImages images={item.attachments} onOpen={index => onPhotos(item.attachments, index)} />}
      {item.attachmentIds.length > item.attachments.length && <p className="timeline-photo-missing">{t('部分图片暂时不可用，可在编辑记录时重新添加。', 'Some photos are unavailable. Re-add them when editing this record.')}</p>}
      {(item.scope === 'milestone' || item.location || people.length > 0 || item.endDate) && <footer className="timeline-moment-meta">{item.scope === 'milestone' && <span>{t('人生经历', 'Milestone')}{item.category&&<span className="timeline-meta-category">{timelineCategoryLabel(item.category)}</span>}</span>}{item.location && <span className="timeline-location"><MapPin />{item.location}</span>}{people.length > 0 && <span>{t('和 ', 'With ')}{people.map(person => person.name).join(t('、', ', '))}</span>}{item.endDate && <span>{t('至 ', 'Until ')}{fullTimelineDate(item.endDate)}</span>}</footer>}
      <div className="timeline-record-links"><details className="timeline-origin-details"><summary>{t('查看来源', 'View source')}<ChevronDown /></summary><div className="timeline-source-content"><p className="timeline-source-metadata"><PlatformIcon platform={item.platform} /><span>{platformLabel}</span><span>{originLabel(item)}</span>{item.startAt && <time dateTime={item.startAt}>{timeLabel(item.startAt)}</time>}{item.demo && <span>{item.origin === 'task' || item.origin === 'room' ? t('示例记录', 'Example record') : t('虚构示例', 'Fictional example')}</span>}</p>{item.sourceIds.length > 0 && refs(item.sourceIds, true)}<div className="timeline-source-actions">{item.taskId && <a href={`#task/${item.taskId}`}>{t('查看原任务', 'Open task')}<ArrowRight /></a>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{t('原始链接', 'Source link')}<ArrowRight /></a>}</div></div></details>{item.status && item.status !== 'recorded' && <TaskBadge status={item.status as Parameters<typeof TaskBadge>[0]['status']} />}</div>
    </div>
  </article>;
}

export function LifeTimeline({ data, refs, onRefresh, onAsk }: { data: Bootstrap; refs: (ids: string[], compact?: boolean) => React.ReactNode; onRefresh: () => Promise<void>; onAsk: (prompt: string) => void|Promise<void> }) {
  const [scope, setScope] = useState<'all'|'milestone'|'note'>('all'), [platform, setPlatform] = useState('all');
  const [editing, setEditing] = useState<LifeEvent | 'new'>(), [importing, setImporting] = useState(false), [computer, setComputer] = useState<'demo'|'saved'>();
  const [photos, setPhotos] = useState<{ images: Attachment[]; index: number }>();
  const [yearLimits, setYearLimits] = useState<Record<string, number>>({});
  const yearStateKey = spaceStorageKey('hither.timeline.expanded-years');
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>(() => {
    try { return readTimelineYearState(localStorage.getItem(yearStateKey)); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem(yearStateKey, JSON.stringify(expandedYears)); } catch {} }, [expandedYears, yearStateKey]);
  const currentYear = String(new Date().getFullYear());
  const items = useMemo(() => timelineFeed(data), [data]);
  const platformOptions = [{ value: 'all', label: t('所有来源', 'All sources') }, ...[...new Set(items.map(item => item.platform))].map(value => ({ value, label: timelinePlatformLabel(value) }))];
  const filtered = items.filter(item => (scope === 'all' || item.scope === scope) && (platform === 'all' || item.platform === platform));
  const years = timelineYearGroups(filtered);
  return <section className="life-timeline-page">
    <PageHeading illustration="/art/page-timeline-v2.png" compactDescription={t('查看经历、事件与记录。', 'Browse events and records.')} title={t('时间轴', 'Timeline')} description={t('按时间查看个人经历、重要事件与相关记录。', 'Review personal milestones, significant events, and related records over time.')} action={<div className="timeline-heading-actions"><Button color="primary" size="sm" onClick={() => setEditing('new')}><Plus />{t('新增记录', 'Add record')}</Button></div>} />
    <div className="timeline-view-switch"><SegmentedControl value={computer?'computer':'timeline'} onChange={value=>setComputer(value==='computer'?'demo':undefined)} aria-label={t('时间轴视图','Timeline view')}><SegmentedControl.Option value="timeline">{t('时间轴','Timeline')}</SegmentedControl.Option><SegmentedControl.Option value="computer"><span className="timeline-computer-tab-label">{t('电脑活动','Computer activity')}<small>Dev</small></span></SegmentedControl.Option></SegmentedControl></div>
    {computer ? <div className="timeline-computer-view"><div className="timeline-computer-toolbar">{computer === 'saved' && <Button color="secondary" variant="ghost" size="sm" onClick={() => setComputer('demo')}>{t('电脑活动演示', 'Computer activity demo')}</Button>}</div>{computer === 'demo' ? <ComputerActivityDemo hideTitle onAsk={onAsk} onRecords={() => setComputer('saved')} onImport={() => setImporting(true)} onAddNote={() => setEditing('new')} /> : <DailyActivities items={data.dailyActivities || []} filter="all" refs={refs} onEdit={id => { const event = data.events.find(item => item.id === id); if (event) setEditing(event); }} />}</div> : <>
      <PageToolbar className="life-timeline-toolbar" label={t('时间轴筛选','Timeline filters')}><div className="life-timeline-tabs" aria-label={t('记录类型', 'Record types')}>{([{ value: 'all', label: t('全部', 'All') }, { value: 'milestone', label: t('人生经历', 'Milestones') }, { value: 'note', label: t('日常片段', 'Everyday') }] as const).map(item => <Button key={item.value} color="secondary" variant="ghost" selected={scope === item.value} size="sm" onClick={() => { setScope(item.value); }}>{item.label}</Button>)}</div><div className="timeline-filter-actions"><PlatformFilter label={t('筛选来源','Filter sources')} value={platform} options={platformOptions} align="end" onChange={value => { setPlatform(value); }} /><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('导入已有活动记录', 'Import saved activity')} title={t('导入已有活动记录', 'Import saved activity')} onClick={() => setImporting(true)}><FileUpload /></Button></div></PageToolbar>
      <p className="timeline-scope-note">{data.profile.demo ? t('示例故事为虚构。新增内容单独保存在这个空间。', 'The example stories are fictional. New records stay in this space.') : t('展示你已保存和导入的记录。', 'Showing records you have saved or imported.')}<span>{t(`${filtered.length} 条`, `${filtered.length} records`)}</span></p>
      <div className="timeline-stream">{years.map(group => {
        const expanded = timelineYearIsOpen(group.year, expandedYears, currentYear);
        const yearLabel = group.year === 'undated' ? t('日期未注明', 'Undated') : fullTimelineDate(group.year);
        const limit = yearLimits[group.year] || 60;
        const visible = group.items.slice(0, limit);
        const dates = [...new Set(visible.map(item => item.date))];
        return <section className="timeline-year-group" data-year={group.year} key={group.year}>
          <h2><button type="button" className="timeline-year-toggle" aria-expanded={expanded} aria-controls={`timeline-year-${group.year}`} aria-label={expanded ? t(`收起${yearLabel}`, `Collapse ${yearLabel}`) : t(`展开${yearLabel}`, `Expand ${yearLabel}`)} onClick={() => setExpandedYears(values => ({ ...values, [group.year]: !expanded }))}><span className="timeline-year-label">{yearLabel}</span><span className="timeline-year-overview"><span>{t(`${group.items.length} 条记录`, `${group.items.length} records`)}</span><span className="timeline-year-preview">{group.titles.join(t('、', ', '))}</span></span><ChevronDown /></button></h2>
          <div id={`timeline-year-${group.year}`} className="timeline-year-records" hidden={!expanded}>{expanded && <>{dates.map(date => <section className="timeline-date-group" key={date} aria-label={date ? fullTimelineDate(date) : yearLabel}><h3 className="timeline-date"><time dateTime={date || undefined}>{date ? fullTimelineDate(date) : yearLabel}</time></h3><div className="timeline-date-moments">{visible.filter(item => item.date === date).map(item => <Moment key={item.id} item={item} data={data} refs={refs} onEdit={setEditing} onPhotos={(images, index) => setPhotos({ images, index })} />)}</div></section>)}{group.items.length > limit && <Button className="timeline-more" color="secondary" variant="outline" size="sm" onClick={() => setYearLimits(values => ({ ...values, [group.year]: limit + 60 }))}>{t(`展开这一年更早的 ${Math.min(60, group.items.length - limit)} 条`, `Show ${Math.min(60, group.items.length - limit)} earlier records from this year`)}<ChevronDown /></Button>}</>}</div>
        </section>;
      })}{!filtered.length && <Empty title={t('留下一段自己的记录', 'Keep a moment of your own')} description={t('一张照片、一段日常，或一次重要改变。可以添加来源、地点与相关人。', 'A photo, an everyday moment, or an important change. Add its source, place, and people.')} action={<Button color="secondary" variant="outline" onClick={() => setEditing('new')}>{t('记录一下', 'Add a moment')}</Button>} />}</div>
    </>}
    {importing && <ActivityImportDialog onClose={() => setImporting(false)} onRefresh={onRefresh} />}
    {editing && <EventForm event={editing === 'new' ? undefined : editing} data={data} initialScope={scope === 'milestone' ? 'milestone' : 'note'} onClose={() => setEditing(undefined)} onSaved={onRefresh} />}
    {photos && <TimelinePhotoViewer images={photos.images} initialIndex={photos.index} onClose={() => setPhotos(undefined)} />}
  </section>;
}
