import {ExampleExecutionNotice} from './ExampleExecutionNotice';
import { useState } from 'react';
import { useUnsavedChanges } from './useUnsavedChanges';
import type { Automation, Bootstrap, Task } from '../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Plus, Play, Edit, Clock, Search, Document, Trash, ArrowRight, ArrowRotateCw } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, Empty, ErrorNotice, Field, PageHeading, PageToolbar, TaskBadge, when } from './components';
import { write, messageOf } from './api';
import { t } from './i18n';
import './automations.css';

const pendingStatuses = new Set<Task['status']>(['queued', 'running', 'awaiting_approval', 'needs_input']);
function scheduleOf(item: Pick<Automation, 'trigger' | 'time' | 'intervalMinutes'>) {
  return item.trigger === 'daily' ? t(`每天 ${item.time || '09:00'}`, `Daily at ${item.time || '09:00'}`) : item.trigger === 'interval' ? t(`每 ${item.intervalMinutes || 60} 分钟`, `Every ${item.intervalMinutes || 60} minutes`) : t('导入新资料后', 'When new data is imported');
}

function AutomationForm({ initial, data, onRefresh, onClose }: { initial?: Automation; data: Bootstrap; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [savedRecord, setSavedRecord] = useState(initial);
  const [exampleNotice,setExampleNotice]=useState(false);
  const [draft, setDraft] = useState({ title: initial?.title || '', prompt: initial?.prompt || '', trigger: initial?.trigger || 'daily', time: initial?.time || '09:00', intervalMinutes: initial?.intervalMinutes || 60, enabled: initial?.enabled ?? true, mode: initial?.mode || 'live', agentIds: initial?.agentIds || [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [baseline, setBaseline] = useState(draft);
  useUnsavedChanges({ unsaved: JSON.stringify(draft) !== JSON.stringify(baseline), busy });
  const example=!!data.profile.demo||initial?.mode==='demo';
  const valid = !!draft.title.trim() && !!draft.prompt.trim() && (draft.trigger !== 'interval' || (Number.isFinite(draft.intervalMinutes) && draft.intervalMinutes >= 1 && draft.intervalMinutes <= 525600));
  async function save() {
    if (busy || !valid) return;
    setBusy(true); setError('');
    try { const saved = await write<Automation>(savedRecord ? `/automations/${savedRecord.id}` : '/automations', example?{...draft,mode:'demo',enabled:false}:draft, savedRecord ? 'PUT' : 'POST'); setSavedRecord(saved); setBaseline(draft); await onRefresh(); if(example&&draft.enabled){setExampleNotice(true);return;}onClose(); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  return <Dialog className="automation-editor-dialog" title={initial ? t('编辑自动化', 'Edit automation') : t('新的自动化', 'New automation')} onClose={() => { if (!busy) onClose(); }}>{exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>}<form className="automation-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <Field label={t('名称', 'Name')}><Input size="lg" aria-label={t('自动化名称', 'Automation name')} value={draft.title} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder={t('例如：每天整理项目进展', 'For example: Daily project update')} maxLength={300} required /></Field>
    <Field label={t('任务要求', 'Task instructions')}><Textarea size="lg" aria-label={t('自动化任务要求', 'Automation instructions')} value={draft.prompt} disabled={busy} onChange={event => setDraft({ ...draft, prompt: event.target.value })} placeholder={t('填写任务目标、输出要求和执行限制。', 'Describe the goal, deliverables and execution constraints.')} rows={4} maxLength={30000} required /></Field>
    <div className="automation-form-columns"><Field label={t('触发方式', 'Trigger')}><Select size="lg" disabled={busy} align="start" listWidth={220} listMinWidth={200} listMaxWidth={260} value={draft.trigger} onChange={option => setDraft({ ...draft, trigger: option.value as Automation['trigger'] })} options={[{ value: 'daily', label: t('每天固定时间', 'Daily at a set time') }, { value: 'interval', label: t('固定间隔', 'At a regular interval') }, { value: 'source_import', label: t('导入新资料后', 'On data import') }]} /></Field>
      {draft.trigger === 'daily' ? <Field label={t('本机时间', 'Local time')}><Input size="lg" aria-label={t('每天运行时间', 'Daily run time')} type="time" value={draft.time} disabled={busy} onChange={event => setDraft({ ...draft, time: event.target.value })} required /></Field> : draft.trigger === 'interval' ? <Field label={t('间隔分钟数', 'Interval in minutes')}><Input size="lg" aria-label={t('自动化间隔分钟', 'Automation interval in minutes')} type="number" min={1} max={525600} value={String(draft.intervalMinutes)} disabled={busy} onChange={event => setDraft({ ...draft, intervalMinutes: Number(event.target.value) })} required /></Field> : <div className="automation-trigger-note"><Document /><p>{t('新资料保存后建立任务。同一自动化已有待处理任务时，会跳过重复触发。', 'Creates a task after new data is saved. Repeated triggers are skipped while a previous task is pending.')}</p></div>}
    </div>

    {data.agents.length > 0 && <fieldset className="automation-agent-field"><legend>{t('参与助理', 'Assistants')}</legend><p>{t('留空时由 SecondU 处理；指定助理后，使用各自的模型设置。', 'Leave empty for SecondU, or choose assistants with their own model settings.')}</p><div className="automation-agent-choices">{data.agents.map(agent => <Checkbox key={agent.id} disabled={busy} label={agent.name} checked={draft.agentIds.includes(agent.id)} onCheckedChange={checked => setDraft({ ...draft, agentIds: checked ? [...draft.agentIds, agent.id] : draft.agentIds.filter(id => id !== agent.id) })} />)}</div></fieldset>}
    <div className="automation-enable-row"><div><strong>{t('保存后启用', 'Enable after saving')}</strong><p>{example ? t('配置可保存在示例空间，启用执行需进入个人空间。', 'Save settings here; open your personal workspace to enable execution.') : t('使用已配置的模型，缺少密钥时会等待你补充。', 'Uses configured models. Tasks wait for you if a key is missing.')}</p></div><Switch label={t('保存后启用自动化', 'Enable this automation after saving')} className="automation-switch" checked={draft.enabled} disabled={busy} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
    <p className="automation-form-note">{t('电脑唤醒且本机服务运行时才会执行。需要批准的操作仍会等待你的确认。', 'Runs while this computer is awake and the local service is running. Actions that need approval still wait for you.')}</p>
    <ErrorNotice error={error} /><div className="automation-form-actions"><Button type="button" color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('取消', 'Cancel')}</Button><Button type="submit" color="primary" loading={busy} disabled={busy || !valid}>{t('保存自动化', 'Save automation')}</Button></div>
  </form></Dialog>;
}

export function AutomationWorkspace({ data, onRefresh, onTask }: { data: Bootstrap; onRefresh: () => Promise<void>; onTask: (id: string) => void }) {
  const [editing, setEditing] = useState<Automation | null>();
  const [exampleNotice,setExampleNotice]=useState(false);
  const [deleting, setDeleting] = useState<Automation>();
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const activeCount = data.automations.filter(item => item.enabled).length;
  const needle = query.trim().toLocaleLowerCase();
  const shown = data.automations.filter(item => (filter === 'all' || (filter === 'active' ? item.enabled : !item.enabled)) && (!needle || `${item.title} ${item.prompt}`.toLocaleLowerCase().includes(needle)));
  async function act(item: Automation, kind: 'toggle' | 'run' | 'delete', enabled?: boolean) {
    if (busy) return;
    if((data.profile.demo||item.mode==='demo')&&(kind==='run'||kind==='toggle'&&enabled)){setExampleNotice(true);return;} setBusy(`${item.id}:${kind}`); setError('');
    try {
      if (kind === 'toggle') await write(`/automations/${item.id}`, { enabled }, 'PUT');
      else if (kind === 'delete') { await write(`/automations/${item.id}`, {}, 'DELETE'); setDeleting(undefined); }
      else { const task = await write<Task>(`/automations/${item.id}/run`); await onRefresh(); onTask(task.id); return; }
      await onRefresh();
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(''); }
  }
  return <div className="automations-workspace">{exampleNotice&&<ExampleExecutionNotice onClose={()=>setExampleNotice(false)}/>}
    <PageHeading title={t('自动化', 'Automations')} description={t('配置定时任务与触发条件，查看执行结果。', 'Schedule tasks, configure triggers and review results.')} compactDescription={t('配置任务计划与触发条件。', 'Schedule tasks and triggers.')} illustration="/art/paper-rhythm.png" action={<Button color="primary" onClick={() => setEditing(null)}><Plus />{t('新建自动化', 'New automation')}</Button>} />
    <PageToolbar className="automations-toolbar" label={t('自动化筛选','Automation filters')}><SegmentedControl value={filter} onChange={setFilter} aria-label={t('筛选自动化', 'Filter automations')}><SegmentedControl.Option value="all"><span className="automation-filter-label"><span>{t('全部', 'All')}</span><span className="automation-filter-count">{data.automations.length}</span></span></SegmentedControl.Option><SegmentedControl.Option value="active"><span className="automation-filter-label"><span>{t('已启用', 'Enabled')}</span><span className="automation-filter-count">{activeCount}</span></span></SegmentedControl.Option><SegmentedControl.Option value="paused"><span className="automation-filter-label"><span>{t('已暂停', 'Paused')}</span><span className="automation-filter-count">{data.automations.length - activeCount}</span></span></SegmentedControl.Option></SegmentedControl><Input size="lg" variant="soft" startAdornment={<Search />} aria-label={t('搜索自动化', 'Search automations')} placeholder={t('搜索自动化', 'Search automations')} value={query} onChange={event => setQuery(event.target.value)} /></PageToolbar>
    <ErrorNotice error={error} />
    {shown.length ? <div className="automation-table"><div className="automation-table-heading" aria-hidden="true"><span>{t('任务', 'Routine')}</span><span>{t('触发安排', 'Schedule')}</span><span>{t('下一次', 'Next run')}</span><span>{t('管理', 'Actions')}</span></div>{shown.map(item => {
      const example=!!data.profile.demo||item.mode==='demo';
      const lastTask = data.tasks.find(task => task.id === item.lastTaskId), pending = !!lastTask && pendingStatuses.has(lastTask.status);
      return <article className="automation-entry" key={item.id}><div className="automation-main"><span className={`automation-routine-icon ${item.enabled ? 'is-enabled' : ''}`}>{item.trigger === 'source_import' ? <Document /> : item.trigger === 'interval' ? <ArrowRotateCw /> : <Clock />}</span><div className="automation-routine-copy"><Button color="secondary" variant="ghost" className="automation-title-button" onClick={() => setEditing(item)}><h2>{item.title}</h2></Button><p className="automation-instructions" title={item.prompt}>{item.prompt}</p><div className="automation-routine-meta"><span className={`automation-enabled-state ${item.enabled ? 'is-enabled' : ''}`}>{item.enabled ? t('已启用', 'Enabled') : t('已暂停', 'Paused')}</span><span>{example ? t('示例', 'Example') : t('使用模型', 'Uses models')}</span>{lastTask && <Button color="secondary" variant="ghost" size="sm" className="automation-last-task" onClick={() => onTask(lastTask.id)}><TaskBadge status={lastTask.status} /><ArrowRight /></Button>}</div></div></div><div className="automation-schedule"><strong>{scheduleOf(item)}</strong><small>{item.trigger === 'daily' ? t('按这台电脑的时区', 'This computer’s time zone') : item.trigger === 'source_import' ? t('资料保存后触发', 'After data is saved') : t('从启用时开始计算', 'From the time it is enabled')}</small></div><div className="automation-next"><span>{example?t('不会执行','Does not run'):!item.enabled ? t('已暂停', 'Paused') : item.nextRunAt ? when(item.nextRunAt) : t('等待新资料', 'Waiting for new data')}</span><small>{item.lastRunAt ? t(`上次 ${when(item.lastRunAt)}`, `Last run ${when(item.lastRunAt)}`) : t('尚未运行', 'No runs yet')}</small></div><div className="automation-row-actions"><Switch className="automation-switch" label={t(`启用“${item.title}”`, `Enable “${item.title}”`)} checked={item.enabled} disabled={!!busy} onCheckedChange={enabled => void act(item, 'toggle', enabled)} /><div><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t(`运行“${item.title}”一次`, `Run “${item.title}” once`)} title={pending ? t('先处理上一次任务', 'Resolve the previous task first') : t('运行一次', 'Run once')} disabled={!!busy || pending} loading={busy === `${item.id}:run`} onClick={() => void act(item, 'run')}><Play /></Button><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t(`编辑“${item.title}”`, `Edit “${item.title}”`)} title={t('编辑', 'Edit')} disabled={!!busy} onClick={() => setEditing(item)}><Edit /></Button><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t(`删除“${item.title}”`, `Delete “${item.title}”`)} title={t('删除', 'Delete')} disabled={!!busy} onClick={() => { setError(''); setDeleting(item); }}><Trash /></Button></div></div></article>;
    })}</div> : data.automations.length ? <div className="automations-empty"><Empty title={t('没有符合条件的安排', 'No matching routines')} description={t('试试其他关键词，或查看全部自动化。', 'Try another search or show all automations.')} action={<Button color="secondary" variant="outline" onClick={() => { setQuery(''); setFilter('all'); }}>{t('显示全部', 'Show all')}</Button>} /></div> : <div className="automations-empty"><Empty title={t('从一件常做的事开始', 'Start with one recurring task')} description={t('每天整理项目进展，或在导入资料后提醒你检查新的认识。', 'Prepare a daily project update or review new insights after importing data.')} action={<Button color="secondary" variant="outline" onClick={() => setEditing(null)}>{t('创建第一项自动化', 'Create your first automation')}</Button>} /></div>}
    <footer className="automations-footer"><span className={`automations-device-dot ${data.computer.status === 'online' ? 'is-online' : ''}`} /><p>{data.computer.status === 'online' ? t('当前电脑已连接', 'This computer is connected') : t('当前电脑离线', 'This computer is offline')}<span>{data.profile.demo?t('示例配置可编辑，实际执行需进入个人空间。','Example settings are editable. Use your personal workspace for execution.'):t('电脑保持唤醒、本机服务运行时执行；每次结果都可回看。', 'Runs while this computer is awake and the local service is running. Every result remains available to review.')}</span></p></footer>
    {editing !== undefined && <AutomationForm initial={editing || undefined} data={data} onRefresh={onRefresh} onClose={() => setEditing(undefined)} />}
    {deleting && <Dialog title={t('删除自动化', 'Delete automation')} onClose={() => { if (!busy) setDeleting(undefined); }}><div className="automation-delete-confirm"><p>{t(`确定删除“${deleting.title}”？`, `Delete “${deleting.title}”?`)}</p><small>{t('不再创建后续任务，已经运行的任务与成果会保留。', 'No new tasks will be scheduled. Existing tasks and deliverables will remain.')}</small><ErrorNotice error={error} /><div className="automation-form-actions"><Button color="secondary" variant="ghost" disabled={!!busy} onClick={() => setDeleting(undefined)}>{t('取消', 'Cancel')}</Button><Button color="danger" loading={busy === `${deleting.id}:delete`} disabled={!!busy} onClick={() => void act(deleting, 'delete')}>{t('删除自动化', 'Delete automation')}</Button></div></div></Dialog>}
  </div>;
}
