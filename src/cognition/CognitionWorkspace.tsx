import { useEffect, useMemo, useState } from 'react';
import type { AgentProfile, Bootstrap, Fact, FactKind, FactStatus, Goal, Source, Person, Relationship } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { ArrowRight, Document, Group } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, Empty, ErrorNotice, Field, PageHeading, when } from '../components';
import { messageOf, write } from '../api';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { decodeCard, encodeCard, type AgentCard } from './qr';
import './cognition.css';
import { SourcePill } from '../design-system/SourcePill';
import { PersonForm, RelationshipForm, ConversationImport } from './RecordForms';

interface Props { view: string; data: Bootstrap; onRefresh: () => Promise<void>; onCreateTask: (prompt: string, contextFactIds?: string[], agentIds?: string[]) => void | Promise<void> }
const statusLabels: Record<FactStatus, string> = { confirmed: '已确认', inferred: '推断', candidate: '待确认', superseded: '已替代' };
const kindLabels: Record<FactKind, string> = { preference: '偏好', value: '价值取向', capability: '能力', constraint: '约束', identity: '身份', decision: '决定' };
const factOptions = Object.entries(kindLabels).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

export function CognitionWorkspace({ view, data, onRefresh, onCreateTask }: Props) {
  const [taskError, setTaskError] = useState('');
  const [sourceId, setSourceId] = useState<string>();
  const createTask: Props['onCreateTask'] = async (...args) => { setTaskError(''); try { await onCreateTask(...args); } catch (error) { setTaskError(messageOf(error)); } };
  const source = data.sources.find(s => s.id === sourceId);
  const refs = (ids: string[], compact = false) => ids.length ? <div className={`cog-refs ${compact ? 'is-compact' : ''}`} aria-label="资料来源">{ids.map(id => {
    const title = data.sources.find(s => s.id === id)?.title || '来源已不可用';
    return <SourcePill key={id} title={title} compact={compact} onOpen={() => setSourceId(id)} />;
  })}</div> : null;
  return <div className="cognition-workspace"><ErrorNotice error={taskError} />
    {view === 'conversations' ? <Conversations data={data} refs={refs} onRefresh={onRefresh} /> :
      view === 'timeline' ? <Timeline data={data} refs={refs} onRefresh={onRefresh} /> :
      view === 'relationships' ? <Relationships data={data} refs={refs} onRefresh={onRefresh} /> :
      view === 'life' ? <Life data={data} refs={refs} onRefresh={onRefresh} onCreateTask={createTask} /> :
      view === 'sources' ? <Sources data={data} onRefresh={onRefresh} onSelect={setSourceId} /> :
      view === 'agents' ? <Agents data={data} onRefresh={onRefresh} onCreateTask={createTask} /> :
      <Self data={data} refs={refs} onRefresh={onRefresh} onCreateTask={createTask} />}
    {source && <Dialog title="查看来源" onClose={() => setSourceId(undefined)}><div className="cog-stack"><div><h3>{source.title}</h3><p className="cog-muted">{when(source.createdAt)} · {source.demo ? '虚构示例资料' : '本机导入资料'}</p></div><pre className="source-text">{source.text}</pre><p className="cog-muted">来源保留原始表述。引用它的推断需要分别确认。</p></div></Dialog>}
  </div>;
}
type Refs = { refs: (ids: string[], compact?: boolean) => React.ReactNode };

function Conversations({ data, refs, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> } & Refs) {
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(data.conversations[0]?.id);
  const filtered = data.conversations.filter(c => [c.title, ...c.messages.map(m => m.content)].join(' ').includes(query));
  const conversation = filtered.find(c => c.id === selected) || filtered[0];
  const self = data.people.find(p => p.role.startsWith('我'))?.id;
  const sharedSources = [...new Set(conversation?.messages.map(m => m.sourceId) || [])].filter(id => (conversation?.messages.filter(m => m.sourceId === id).length || 0) > 1);
  return <>
    <PageHeading title="对话" description="从交流里理解背景，保留当时的原话。" action={<Button color="secondary" variant="outline" onClick={() => setImporting(true)}>导入对话</Button>} />
    <div className="cog-split conversation-layout">
      <aside className="cog-list-panel">
        <Input aria-label="搜索对话" placeholder="搜索对话和内容" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="cog-list-caption">已保存的对话 <span>{filtered.length}</span></div>
        <div className="cog-conversation-list">{filtered.map(c => <Button key={c.id} color="secondary" variant="ghost" className={`cog-list-item ${conversation?.id === c.id ? 'is-active' : ''}`} selected={conversation?.id === c.id} onClick={() => setSelected(c.id)}>
          <span className="cog-avatar">{c.kind === 'group' ? <Group aria-hidden="true" /> : c.title.slice(1, 2) || c.title[0]}</span>
          <span className="cog-list-copy"><strong>{c.title}</strong><small>{c.messages.at(-1)?.content || '尚无消息'}</small></span>
        </Button>)}</div>
      </aside>
      <section className="conversation-main">{conversation ? <>
        <header><div><h2>{conversation.title}</h2><p className="cog-muted">{conversation.personIds.map(id => data.people.find(p => p.id === id)?.name).filter(Boolean).join('、')}</p>{refs(sharedSources)}</div><Badge color="secondary" size="sm">{conversation.kind === 'group' ? '群组记录' : '私聊记录'}</Badge></header>
        <div className="conversation-messages"><div className="cog-record-label">仅查看已保存记录</div>{conversation.messages.map(m => <article key={m.id} className={`cog-message ${m.senderId === self ? 'is-self' : ''}`}>
          <div className="cog-message-meta"><strong>{data.people.find(p => p.id === m.senderId)?.name || '未知人物'}</strong><time>{when(m.time)}</time></div>
          <p>{m.content}</p>{refs([m.sourceId], true)}
        </article>)}</div>
      </> : <Empty title="没有匹配的对话" description="试试其他词语，或导入一份原始对话记录。" />}</section>
    </div>{importing && <ConversationImport data={data} onClose={() => setImporting(false)} onSaved={onRefresh} />}</>;
}

function Timeline({ data, refs, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> } & Refs) {
  const [filter, setFilter] = useState('全部');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(''); const [date, setDate] = useState(''); const [description, setDescription] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const events = [...data.events].filter(e => filter === '全部' || e.category === filter).sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <PageHeading title="经历" description="重要的经历、选择与变化，按时间留下来。" action={<Button color="secondary" variant="outline" onClick={() => setAdding(true)}>记下一段经历</Button>} />
    <div className="cog-tabs cog-filter-tabs">{['全部', ...new Set(data.events.map(e => e.category))].map(c => <Button key={c} color="secondary" variant="ghost" selected={filter === c} onClick={() => setFilter(c)}>{c}</Button>)}<span className="cog-filter-count">{events.length} 段经历</span></div>
    <div className="cog-timeline">{events.map(e => <article key={e.id}>
      <time dateTime={e.date}>{e.date}</time>
      <div className="cog-timeline-body"><div className="cog-timeline-title"><h2>{e.title}</h2><Badge color="secondary" size="sm">{e.category}</Badge></div><p>{e.description}</p>
        {e.personIds.length > 0 && <p className="cog-muted cog-event-people">{e.personIds.map(id => data.people.find(p => p.id === id)?.name).filter(Boolean).join(' · ')}</p>}{refs(e.sourceIds)}
      </div>
    </article>)}{!events.length && <Empty title="这里还没有经历" />}</div>{adding && <Dialog title="记下一段经历" onClose={() => setAdding(false)}><form className="cog-stack" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await write('/events', { title, date, description, category: '个人记录', personIds: [], sourceIds: [] }); await onRefresh(); setAdding(false); setTitle(''); setDescription(''); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><Field label="发生日期"><Input aria-label="发生日期" type="date" required value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="标题"><Input aria-label="经历标题" required value={title} onChange={e => setTitle(e.target.value)} /></Field><Field label="经历描述"><Textarea aria-label="经历描述" required value={description} onChange={e => setDescription(e.target.value)} /></Field><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存经历</Button></form></Dialog>}</>;
}

function Relationships({ data, refs, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> } & Refs) {
  const [personForm, setPersonForm] = useState<{person?: Person}>();
  const [relationshipForm, setRelationshipForm] = useState<{relationship?: Relationship}>();
  const [selected, setSelected] = useState(data.people[0]?.id);
  const person = data.people.find(p => p.id === selected);
  const positions = useMemo(() => new Map(data.people.map((p, i) => {
    const angle = (i - 1) * 2 * Math.PI / Math.max(1, data.people.length - 1) - Math.PI / 4;
    return [p.id, i === 0 ? { x: 330, y: 210 } : { x: 330 + 220 * Math.cos(angle), y: 210 + 142 * Math.sin(angle) }];
  })), [data.people]);
  const related = data.relationships.filter(r => r.from === person?.id || r.to === person?.id);
  return <>
    <PageHeading title="关系" description="人与人的联系，以及每一段关系的具体背景。" action={<div className="cog-actions"><Button color="secondary" variant="outline" onClick={() => setPersonForm({})}>添加人物</Button><Button color="primary" disabled={data.people.length < 2} onClick={() => setRelationshipForm({})}>添加关系</Button></div>} />
    <div className="cog-split relationship-layout">
      <div className="relationship-graph"><div className="cog-panel-heading"><h2>人物关系</h2><span>{data.people.length} 位人物 · {data.relationships.length} 段关系</span></div>
        {data.people.length ? <svg viewBox="0 0 660 430" role="img" aria-label="人物关系图，可通过下方人物列表选择详情"><title>人物关系图</title>
          {data.relationships.map(r => { const a = positions.get(r.from); const b = positions.get(r.to); return a && b ? <g key={r.id} className={`graph-edge ${r.from === selected || r.to === selected ? 'is-related' : ''}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10} textAnchor="middle">{r.label}</text></g> : null; })}
          {data.people.map((p, index) => { const at = positions.get(p.id)!; return <g key={p.id} className={`graph-node ${selected === p.id ? 'selected-node' : ''} ${index === 0 ? 'anchor-node' : ''}`} onClick={() => setSelected(p.id)} role="button" tabIndex={0} aria-label={`查看${p.name}`} aria-pressed={selected === p.id} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id); } }}>
            <title>{p.name} · {p.role}</title><circle cx={at.x} cy={at.y} r={index === 0 ? 31 : 25} /><text x={at.x} y={at.y + 5} textAnchor="middle" className="node-initial">{p.name[0]}</text><text x={at.x} y={at.y + (index === 0 ? 53 : 46)} textAnchor="middle" className="node-name">{p.name}</text>
          </g>; })}
        </svg> : <Empty title="还没有人物资料" description="添加人物后，可以从这里查看彼此的联系。" />}
        <div className="cog-person-list" aria-label="选择人物">{data.people.map(p => <Button key={p.id} color="secondary" variant="ghost" selected={selected === p.id} onClick={() => setSelected(p.id)}><span className="cog-person-dot" />{p.name}</Button>)}</div>
      </div>
      <aside className="cog-detail">{person ? <>
        <div className="cog-person-heading"><div className="cog-avatar large">{person.name[0]}</div><div><h2>{person.name}</h2><p className="cog-muted">{person.role}</p></div><Button color="secondary" variant="ghost" size="sm" onClick={() => setPersonForm({person})}>编辑人物</Button></div>
        <p className="cog-person-description">{person.description}</p>{refs(person.sourceIds)}
        <div className="cog-detail-section-title"><h3>关联背景</h3><span>{related.length}</span></div>
        {related.map(r => { const other = data.people.find(p => p.id === (r.from === person.id ? r.to : r.from)); return <div className="cog-relation" key={r.id}>
          <div className="cog-relation-heading"><strong>{other?.name || '未知人物'}</strong><Badge color="secondary" size="sm">{r.label}</Badge></div><p>{r.description}</p>{refs(r.sourceIds)}<Button color="secondary" variant="ghost" size="sm" onClick={() => setRelationshipForm({relationship:r})}>修正关系</Button>
        </div>; })}{!related.length && <p className="cog-muted">还没有关联背景。</p>}
      </> : <Empty title="选择一位人物" description="查看已保存的背景与关系。" />}</aside>
    </div>{personForm && <PersonForm person={personForm.person} data={data} onClose={() => setPersonForm(undefined)} onSaved={onRefresh} />}{relationshipForm && <RelationshipForm relationship={relationshipForm.relationship} data={data} onClose={() => setRelationshipForm(undefined)} onSaved={onRefresh} />}</>;
}

function Self({ data, refs, onRefresh, onCreateTask }: Pick<Props, 'data'|'onRefresh'|'onCreateTask'> & Refs) {
  const [filter, setFilter] = useState('all'); const [editing, setEditing] = useState<Fact>(); const [history, setHistory] = useState<Fact>();
  const [statement, setStatement] = useState(''); const [reason, setReason] = useState(''); const [status, setStatus] = useState<FactStatus>('confirmed'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const facts = data.facts.filter(f => filter === 'all' ? f.status !== 'superseded' : f.status === filter);
  const groups = (['confirmed', 'candidate', 'inferred', 'superseded'] as FactStatus[]).map(value => ({ status: value, facts: facts.filter(f => f.status === value) })).filter(group => group.facts.length);
  const descriptions: Record<FactStatus, string> = { confirmed: '用于助理判断的个人背景', candidate: '等待你确认后，再作为事实使用', inferred: '已有依据，仍需要你的核实', superseded: '保留过去的表述与修订过程' };
  return <>
    <PageHeading title="认识我" description="关于你的理解，有依据，也可以随时纠正。" />
    <section className="cog-self-intro"><div className="cog-avatar large">{data.profile.name[0]}</div><div className="cog-profile-copy"><div className="cog-profile-title"><h2>{data.profile.name}</h2>{data.profile.demo && <Badge color="secondary" size="sm">虚构示例</Badge>}</div><p>{data.profile.description}</p></div><div className="cog-profile-summary"><span>{data.facts.filter(f => f.status === 'confirmed').length} 条已确认</span><span>{data.facts.filter(f => f.status === 'candidate').length} 条待确认</span></div></section>
    <div className="cog-tabs cog-filter-tabs">{[{ value: 'all', label: '当前理解' }, ...statusOptions].map(o => <Button key={o.value} color="secondary" variant="ghost" selected={filter === o.value} onClick={() => setFilter(o.value)}>{o.label}</Button>)}<span className="cog-filter-count">{facts.length} 条理解</span></div>
    <div className="cog-facts">{groups.map(group => <section className="cog-fact-group" key={group.status}>
      <div className="cog-section-heading"><div><h2>{statusLabels[group.status]}<span>{group.facts.length}</span></h2><p>{descriptions[group.status]}</p></div></div>
      <div className="cog-fact-list">{group.facts.map(f => <article key={f.id} className="cog-fact">
        <div className="cog-fact-kind">{kindLabels[f.kind]}</div>
        <div className="cog-fact-content"><h3>{f.statement}</h3>{refs(f.sourceIds)}<div className="cog-fact-actions"><span className="cog-muted">第 {f.version} 版 · {when(f.updatedAt)}</span><div className="cog-actions"><Button color="secondary" variant="ghost" size="sm" onClick={() => { setEditing(f); setStatement(f.statement); setStatus(f.status); setReason(''); setError(''); }}>纠正理解</Button><Button color="secondary" variant="ghost" size="sm" onClick={() => setHistory(f)}>修订记录</Button><Button color="secondary" variant="ghost" size="sm" onClick={() => onCreateTask(`请根据这条个人背景，帮我安排今天能做的一步：${f.statement}`, [f.id])}>用于任务<ArrowRight aria-hidden="true" /></Button></div></div></div>
      </article>)}</div>
    </section>)}</div>{!facts.length && <Empty title="这个分类还没有记录" />}
    {editing && <Dialog title="纠正助理对你的理解" onClose={() => setEditing(undefined)}><form className="cog-stack" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await write(`/facts/${editing.id}`, { statement, status, reason, baseVersion: editing.version }, 'PUT'); await onRefresh(); setEditing(undefined); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><Field label="现在应当怎样理解"><Textarea aria-label="现在的理解" rows={4} required value={statement} onChange={e => setStatement(e.target.value)} /></Field><Field label="确认状态"><Select value={status} options={statusOptions} onChange={o => setStatus(o.value as FactStatus)} /></Field><Field label="修正原因"><Input aria-label="修正原因" required placeholder="例如：我的时间安排已经改变" value={reason} onChange={e => setReason(e.target.value)} /></Field><p className="cog-muted">原始来源和历次修订会保留。之后的新任务采用本次修正。</p><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存修正</Button></form></Dialog>}
    {history && <Dialog title="理解的修订记录" onClose={() => setHistory(undefined)}><div className="cog-stack">{[...history.history].reverse().map(h => <article key={h.version} className="cog-revision"><Badge color="secondary">第 {h.version} 版 · {statusLabels[h.status]}</Badge><p>{h.statement}</p><small>{h.reason} · {when(h.recordedAt)}</small></article>)}</div></Dialog>}
  </>;
}

function Life({ data, refs, onRefresh, onCreateTask }: Pick<Props, 'data'|'onRefresh'|'onCreateTask'> & Refs) {
  const [editing, setEditing] = useState<Partial<Goal>>(); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [due, setDue] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function changeStatus(goal: Goal, status: Goal['status']) { setError(''); try { await write(`/goals/${goal.id}`, { ...goal, status }, 'PUT'); await onRefresh(); } catch (e) { setError(messageOf(e)); } }
  const constraints = data.facts.filter(f => f.kind === 'constraint' && f.status === 'confirmed');
  return <>
    <PageHeading title="现在的生活" description="正在推进的事，以及计划需要考虑的现实条件。" action={<Button color="secondary" variant="outline" onClick={() => { setEditing({}); setTitle(''); setDescription(''); setDue(''); }}>添加目标</Button>} />
    <ErrorNotice error={!editing ? error : ''} />
    <div className="cog-life-layout"><section className="cog-goals"><div className="cog-section-heading"><div><h2>当前目标<span>{data.goals.filter(g => g.status === 'active').length} 项进行中</span></h2></div></div>
      {data.goals.map(goal => <article key={goal.id} className={`cog-goal is-${goal.status}`}>
        <div className="cog-fact-heading"><Badge color="secondary" size="sm">{{ active: '在进行', paused: '已暂停', done: '已完成' }[goal.status]}</Badge>{goal.dueDate && <span className="cog-muted">期待完成于 {goal.dueDate}</span>}</div>
        <h2>{goal.title}</h2><p>{goal.description}</p>{refs(goal.sourceIds)}
        <div className="cog-goal-actions"><Button color="primary" variant="soft" onClick={() => onCreateTask(`请结合我的时间、偏好和约束，推进这个目标：${goal.title}。${goal.description}`)}>一起推进<ArrowRight aria-hidden="true" /></Button><div className="cog-actions"><Button color="secondary" variant="ghost" onClick={() => { setEditing(goal); setTitle(goal.title); setDescription(goal.description); setDue(goal.dueDate || ''); }}>编辑</Button><Button color="secondary" variant="ghost" onClick={() => void changeStatus(goal, goal.status === 'done' ? 'active' : 'done')}>{goal.status === 'done' ? '重新开始' : '标记完成'}</Button>{goal.status !== 'done' && <Button color="secondary" variant="ghost" onClick={() => void changeStatus(goal, goal.status === 'paused' ? 'active' : 'paused')}>{goal.status === 'paused' ? '继续' : '暂停'}</Button>}</div></div>
      </article>)}{!data.goals.length && <Empty title="还没有目标" description="记下想推进的事，让助理帮你拆出下一步。" />}
    </section><aside className="cog-constraints"><div className="cog-section-heading"><div><h2>需要考虑的条件</h2><p>来自你已确认的个人背景</p></div></div>{constraints.map(f => <article key={f.id}><p>{f.statement}</p>{refs(f.sourceIds)}</article>)}{!constraints.length && <p className="cog-muted">还没有已确认的约束。</p>}</aside></div>{editing && <Dialog title={editing.id ? '编辑目标' : '添加目标'} onClose={() => setEditing(undefined)}><form className="cog-stack" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await write(editing.id ? `/goals/${editing.id}` : '/goals', { ...editing, title, description, dueDate: due || undefined, status: editing.status || 'active', sourceIds: editing.sourceIds || [] }, editing.id ? 'PUT' : 'POST'); await onRefresh(); setEditing(undefined); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><Field label="想完成什么"><Input aria-label="目标标题" value={title} required onChange={e => setTitle(e.target.value)} /></Field><Field label="背景与期待"><Textarea aria-label="目标描述" value={description} required onChange={e => setDescription(e.target.value)} /></Field><Field label="期待日期（可选）"><Input aria-label="目标日期" type="date" value={due} onChange={e => setDue(e.target.value)} /></Field><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存目标</Button></form></Dialog>}</>;
}

function Sources({ data, onRefresh, onSelect }: { data: Bootstrap; onRefresh: () => Promise<void>; onSelect: (id: string) => void }) {
  const [adding, setAdding] = useState(false); const [candidate, setCandidate] = useState<Source>(); const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [kind, setKind] = useState<Source['kind']>('note'); const [factKind, setFactKind] = useState<FactKind>('preference'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <><PageHeading title="资料与来源" description="每一种理解都应有来处。导入的文字先保留为资料，由你决定哪些进入个人认知。" action={<Button color="primary" onClick={() => { setAdding(true); setTitle(''); setText(''); setError(''); }}>导入文字</Button>} /><div className="cog-sources">{data.sources.map(s => <article key={s.id}><div><Badge color="secondary">{s.demo ? '示例' : '本机资料'}</Badge><h2><button onClick={() => onSelect(s.id)}>{s.title}</button></h2><p>{s.text.slice(0, 150)}{s.text.length > 150 ? '…' : ''}</p><small className="cog-muted">{when(s.createdAt)} · {data.facts.filter(f => f.sourceIds.includes(s.id)).length} 条相关理解</small></div><div className="cog-tabs"><Button color="secondary" variant="ghost" onClick={() => onSelect(s.id)}>查看原文</Button><Button color="secondary" variant="ghost" onClick={() => { setCandidate(s); setText(''); setError(''); }}>补充一条理解</Button></div></article>)}</div>
    {adding && <Dialog title="导入文字资料" onClose={() => setAdding(false)}><form className="cog-stack" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await write('/sources', { title, text, kind }); await onRefresh(); setAdding(false); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><Field label="资料标题"><Input aria-label="资料标题" required value={title} onChange={e => setTitle(e.target.value)} /></Field><Field label="资料类型"><Select value={kind} options={[{ value: 'note', label: '笔记' }, { value: 'conversation', label: '对话记录' }, { value: 'document', label: '文档' }, { value: 'feedback', label: '我的反馈' }]} onChange={o => setKind(o.value as Source['kind'])} /></Field><Field label="原始文字"><Textarea aria-label="原始文字" required rows={9} value={text} onChange={e => setText(e.target.value)} /></Field><p className="cog-muted">资料保存在这台电脑。导入不会自动生成已确认的事实。</p><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存资料</Button></form></Dialog>}
    {candidate && <Dialog title="补充一条待确认的理解" onClose={() => setCandidate(undefined)}><form className="cog-stack" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await write('/facts', { kind: factKind, statement: text, sourceIds: [candidate.id], status: 'candidate' }); await onRefresh(); setCandidate(undefined); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><p className="cog-muted">来源：{candidate.title}</p><Select value={factKind} options={factOptions} onChange={o => setFactKind(o.value as FactKind)} /><Textarea aria-label="新的理解" required rows={4} placeholder="这份资料说明了什么？" value={text} onChange={e => setText(e.target.value)} /><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存为待确认</Button></form></Dialog>}
  </>;
}

function Agents({ data, onRefresh, onCreateTask }: Pick<Props, 'data'|'onRefresh'|'onCreateTask'>) {
  const [editing, setEditing] = useState<Partial<AgentProfile>>(); const [name, setName] = useState(''); const [role, setRole] = useState(''); const [instructions, setInstructions] = useState('');
  const [sharing, setSharing] = useState<AgentProfile>(); const [qr, setQR] = useState(''); const [importing, setImporting] = useState(false); const [pasted, setPasted] = useState(''); const [preview, setPreview] = useState<AgentCard>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; setQR(''); if (sharing) QRCode.toDataURL(encodeCard({ name: sharing.name, role: sharing.role, instructions: sharing.instructions }), { width: 320, margin: 2 }).then(url => { if (active) setQR(url); }).catch(e => { if (active) setError(messageOf(e)); }); return () => { active = false; }; }, [sharing]);
  const edit = (agent: Partial<AgentProfile>) => { setEditing(agent); setName(agent.name || ''); setRole(agent.role || ''); setInstructions(agent.instructions || ''); setError(''); };
  async function scan(file?: File) { if (!file) return; setError(''); setBusy(true); try { if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的二维码图片。'); const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); const pixels = context.getImageData(0, 0, canvas.width, canvas.height); const decoded = jsQR(pixels.data, pixels.width, pixels.height); if (!decoded) throw new Error('没有识别出二维码，请选择更清晰的图片或粘贴名片。'); setPasted(decoded.data); setPreview(decodeCard(decoded.data)); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }
  return <>
    <PageHeading title="我的助理" description="每个角色负责一类工作，共享任务的背景和成果。" action={<div className="cog-actions"><Button color="secondary" variant="outline" onClick={() => { setImporting(true); setPasted(''); setPreview(undefined); setError(''); }}>扫码创建</Button><Button color="primary" onClick={() => edit({})}>创建助理</Button></div>} />
    <div className="cog-agent-heading"><span>{data.agents.length} 位助理</span><span>由你设定职责和工作方式</span></div>
    <div className="cog-agents">{data.agents.map(a => <article key={a.id}>
      <div className="cog-avatar large">{a.name[0]}</div><div className="cog-agent-body"><div className="cog-agent-title"><div><h2>{a.name}</h2><p>{a.role}</p></div><Button color="primary" variant="soft" onClick={() => onCreateTask(`请作为${a.name}，帮我推进当前最重要的目标。`, undefined, [a.id])}>开始合作<ArrowRight aria-hidden="true" /></Button></div><p className="cog-agent-instructions">{a.instructions}</p><div className="cog-actions"><Button color="secondary" variant="ghost" size="sm" onClick={() => edit(a)}>编辑</Button><Button color="secondary" variant="ghost" size="sm" onClick={() => { setSharing(a); setError(''); }}>分享名片</Button></div></div>
    </article>)}</div>{!data.agents.length && <Empty title="还没有助理" description="为一项常做的工作，创建第一个角色。" />}
    {data.agents.length > 1 && <section className="cog-collaboration"><div className="cog-collaboration-copy"><Group aria-hidden="true" /><div><h3>让助理一起工作</h3><p>各角色按顺序工作，共享同一任务中的背景、过程与成果。</p></div></div><Button color="secondary" variant="outline" onClick={() => onCreateTask('请一起为社区声音展制定一份符合我的时间和预算的计划，并复核遗漏。', undefined, data.agents.map(a => a.id))}>创建协作任务<ArrowRight aria-hidden="true" /></Button></section>}
    {editing && <Dialog title={editing.id ? '编辑助理' : '创建助理'} onClose={() => setEditing(undefined)}><form className="cog-stack" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await write(editing.id ? `/agents/${editing.id}` : '/agents', { name, role, instructions }, editing.id ? 'PUT' : 'POST'); await onRefresh(); setEditing(undefined); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><Field label="名字"><Input aria-label="助理名字" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="职责"><Input aria-label="助理职责" required maxLength={200} value={role} onChange={e => setRole(e.target.value)} /></Field><Field label="工作说明"><Textarea aria-label="助理工作说明" required rows={6} maxLength={3000} value={instructions} onChange={e => setInstructions(e.target.value)} /></Field><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存助理</Button></form></Dialog>}
    {sharing && <Dialog title="助理名片" onClose={() => setSharing(undefined)}><div className="cog-stack"><h3>{sharing.name}</h3>{qr && <img className="agent-qr" src={qr} alt={`${sharing.name}的导入二维码`} />}<p>包含角色和工作说明，不包含你的资料、任务或模型密钥。</p><Textarea aria-label="助理名片内容" rows={3} readOnly value={encodeCard({ name: sharing.name, role: sharing.role, instructions: sharing.instructions })} />{qr && <a className="cog-download" href={qr} download={`${sharing.name}-agent.png`}>下载二维码</a>}<ErrorNotice error={error} /></div></Dialog>}
    {importing && <Dialog title="扫码创建助理" onClose={() => setImporting(false)}><div className="cog-stack"><p>桌面端可读取二维码图片，或粘贴助理名片。识别后先查看内容，再创建。</p><label className="qr-upload">选择二维码图片<input aria-label="二维码图片" type="file" accept="image/*" disabled={busy} onChange={e => void scan(e.target.files?.[0])} /></label><Textarea aria-label="粘贴助理名片" rows={3} placeholder="hither://agent/v1?data=…" value={pasted} onChange={e => { setPasted(e.target.value); setPreview(undefined); }} /><Button color="secondary" variant="outline" disabled={!pasted.trim()} onClick={() => { setError(''); try { setPreview(decodeCard(pasted)); } catch (err) { setError(messageOf(err)); } }}>读取名片</Button>{preview && <div className="cog-import-preview"><Badge color="secondary">待确认的外部角色</Badge><h3>{preview.name}</h3><p>{preview.role}</p><pre className="source-text">{preview.instructions}</pre><Alert color="info" variant="soft" title="创建后才能参与工作" description="读取名片不会运行指令、访问链接或授予电脑权限。" /><Button color="primary" loading={busy} onClick={async () => { setBusy(true); setError(''); try { await write('/agents', preview); await onRefresh(); setImporting(false); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}>确认创建助理</Button></div>}<ErrorNotice error={error} /></div></Dialog>}
  </>;
}
