import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { RadioGroup } from '@openai/apps-sdk-ui/components/RadioGroup';
import { Slider } from '@openai/apps-sdk-ui/components/Slider';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { Avatar } from '@openai/apps-sdk-ui/components/Avatar';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown';
import { TextLink } from '@openai/apps-sdk-ui/components/TextLink';
import { LoadingIndicator, LoadingDots } from '@openai/apps-sdk-ui/components/Indicator';
import { Search, Check, Plus, ArrowUp, ArrowRight, Document, Agent, Clock, User, Settings, DotsHorizontalMoreMenu, ChevronDown, History } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, Field, PageHeading, TaskBadge } from './components';
import type { TaskStatus } from '../shared/contracts';
import { TaskApproval } from './design-system/TaskApproval';
import { ArtifactCard } from './design-system/ArtifactCard';
import { SourcePill } from './design-system/SourcePill';
import './catalogue.css';

const groups = [
  { id: 'foundations', title: '基础规范', description: '以文字、空间和语义色建立清晰层级，明暗主题共用同一套规则。' },
  { id: 'controls', title: '输入与选择', description: '标签说明要做什么，状态说明现在能做什么。先操作，再观察变化。' },
  { id: 'navigation', title: '导航与浮层', description: '切换、补充信息和需要专注的操作，采用不同的交互层级。' },
  { id: 'feedback', title: '反馈与状态', description: '让进行、等待、完成和失败可区分；有问题时给出具体的下一步。' },
  { id: 'patterns', title: '业务组合', description: '将基础控件用于任务、个人认知和成果。以下均为页面内演示，不执行真实任务。' },
] as const;
type GroupId = typeof groups[number]['id'];
const specs = [
  ['type', 'foundations', '文字层级', 'Typography', '页面标题 28px，正文 14px，来源与说明 12px。加粗表达层级，不用颜色堆叠重要性。'],
  ['spacing', 'foundations', '空间与形状', 'Spacing', '相关内容靠近，区块之间留白。面板圆角 12px，常规操作高度 36px。'],
  ['color', 'foundations', '语义颜色', 'Tokens', '白灰表面与细分隔组织内容；状态色只用于确有含义的反馈。'],
  ['identity', 'foundations', '图标与身份', 'Icon · Avatar', '使用官方图标和头像组件。图标操作需有文字标签或可访问名称。'],
  ['button', 'controls', '操作按钮', 'Button', '主要操作保持单一，次要操作降一级。加载与禁用状态明确阻止重复操作。'],
  ['input', 'controls', '单行输入', 'Input', '保留可见标签，提示文字提供例子，错误信息说明如何改正。'],
  ['textarea', 'controls', '长文本', 'Textarea', '多行内容随输入增长。说明与字数保持在输入区域附近。'],
  ['select', 'controls', '下拉选择', 'Select', '选项较多或空间有限时使用。选择后的值直接留在控件里。'],
  ['checkbox', 'controls', '复选与授权', 'Checkbox', '每一项可独立选择；不能用一个勾选框代表含糊的长期授权。'],
  ['switch', 'controls', '开关', 'Switch', '表达即时生效的二元状态，旁边用文字说明当前状态。'],
  ['radio', 'controls', '互斥选择', 'RadioGroup', '少量选项完整展开，方便对比。只允许选中一项。'],
  ['slider', 'controls', '连续范围', 'Slider', '用数值和单位解释滑块。支持方向键调整与恢复默认值。'],
  ['segments', 'navigation', '同一对象的视图', 'SegmentedControl', '切换预览、编辑与版本，始终围绕同一个对象。'],
  ['menu', 'navigation', '操作菜单', 'Menu', '收纳次要操作。可用项、选中项与禁用项保持清晰。'],
  ['popover', 'navigation', '就地查看依据', 'Popover', '简短来源与补充设置就地展开，避免把每次查看都变成中断。'],
  ['tooltip', 'navigation', '悬停与焦点提示', 'Tooltip · CopyButton', '鼠标悬停或键盘聚焦时出现。重要说明不能只存在于提示中。'],
  ['dialog', 'navigation', '专注对话框', '应用对话框组合', '用于需要完整输入的操作。支持 Escape、焦点约束和关闭后返回触发点。'],
  ['badges', 'feedback', '状态标签', 'Badge · TaskBadge', '文字是状态的主要载体，颜色只辅助识别。标签本身不冒充按钮。'],
  ['alert', 'feedback', '就地反馈', 'Alert', '标题先说明结果，正文说明影响。可以恢复时，将动作放在同一处。'],
  ['loading', 'feedback', '加载与等待', 'Indicator', '有真实等待才显示加载；未知进度不展示虚构百分比。此处可手动切换示例。'],
  ['recovery', 'feedback', '错误与恢复', 'Input · Alert', '保留用户输入，指出具体问题。这里仅校验地址格式，不连接服务。'],
  ['empty', 'feedback', '空白与无匹配', 'EmptyMessage', '区分尚无内容和没有搜索结果，给出对应的下一步。'],
  ['task', 'patterns', '任务与活动', '任务状态组合', '结果、活动与等待原因同屏可见。展开细节时保持主线简洁。'],
  ['approval', 'patterns', '单次审批', '授权组合', '写清动作、对象和范围。批准与拒绝都留下明确状态。'],
  ['cognition', 'patterns', '认知与证据', '认知组合', '事实、推断、候选分开；来源与修订历史始终可以回看。'],
  ['artifact', 'patterns', '成果与版本', '编辑器组合', '预览与编辑共用内容。保存创建新版本，历史版本可以查看。'],
] as const;
type SpecId = typeof specs[number][0];
const CatalogueQuery = createContext('');
const matches = (spec: typeof specs[number], query: string) => !query || spec.join(' ').toLowerCase().includes(query.toLowerCase());

function Spec({ id, children, note }: { id: SpecId; children: ReactNode; note?: ReactNode }) {
  const query = useContext(CatalogueQuery);
  const spec = specs.find(item => item[0] === id)!;
  if (!matches(spec, query)) return null;
  return <article className="ui-spec" id={`ui-${id}`}><div className="ui-spec-label"><h3>{spec[2]}</h3><span>{spec[3]}</span><p>{spec[4]}</p></div><div className="ui-spec-example">{children}{note && <p className="ui-example-note">{note}</p>}</div></article>;
}
function CatalogueSection({ id, children }: { id: GroupId; children: ReactNode }) {
  const query = useContext(CatalogueQuery);
  const group = groups.find(item => item.id === id)!;
  const count = specs.filter(spec => spec[1] === id && matches(spec, query)).length;
  if (!count) return null;
  return <section className="ui-catalogue-section" id={`ui-section-${id}`} aria-labelledby={`ui-heading-${id}`}><header><div><h2 id={`ui-heading-${id}`} tabIndex={-1}>{group.title}</h2><p>{group.description}</p></div><span>{count} 项</span></header>{children}</section>;
}
function DemoBadge() { return <Badge color="secondary" variant="outline" size="sm">演示</Badge>; }

export function ComponentCatalogue() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<GroupId>('foundations');
  const [revision, setRevision] = useState(0);
  const resultCount = specs.filter(spec => matches(spec, query)).length;
  function jump(id: GroupId) {
    setActive(id);
    const heading = document.getElementById(`ui-heading-${id}`);
    heading?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    heading?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const visible = groups.filter(group => specs.some(spec => spec[1] === group.id && matches(spec, query)));
    if (!visible.some(group => group.id === active) && visible[0]) setActive(visible[0].id);
  }, [query, active]);
  return <div className="page-content ui-catalogue">
    <PageHeading title="界面规范" description="一套让理解、操作与反馈保持一致的界面语言。" action={<Button color="secondary" variant="outline" size="lg" onClick={() => { setRevision(value => value + 1); setQuery(''); }}>重置演示</Button>} />
    <div className="ui-catalogue-intro"><DemoBadge /><p>26 种基础与业务模式，直接使用官方 Apps SDK UI。所有交互只改变本页示例，不保存个人资料、不创建任务。</p></div>
    <CatalogueQuery value={query}><div className="ui-catalogue-layout"><aside className="ui-catalogue-nav" aria-label="界面规范分类">
      <Input aria-label="查找组件或模式" size="lg" variant="soft" startAdornment={<Search />} placeholder="查找组件" value={query} onChange={event => setQuery(event.target.value)} />
      <nav>{groups.map(group => { const count = specs.filter(spec => spec[1] === group.id && matches(spec, query)).length; return <TextLink key={group.id} as="a" href={`#catalogue/${group.id}`} underline={false} className={active === group.id ? 'is-active' : ''} aria-current={active === group.id ? 'location' : undefined} aria-disabled={!count} onClick={event => { event.preventDefault(); if (count) jump(group.id); }}><span>{group.title}</span><small>{count}</small></TextLink>; })}</nav>
      <p className="ui-nav-help">悬停查看反馈，按 <kbd>Tab</kbd> 检查焦点。明暗主题跟随应用设置。</p>
    </aside><div className="ui-catalogue-content" key={revision}>
      {query && <div className="ui-search-result" role="status">找到 {resultCount} 项匹配<Button color="secondary" variant="ghost" size="sm" onClick={() => setQuery('')}>清除搜索</Button></div>}
      {resultCount ? <><Foundations /><Controls /><Navigation /><Feedback /><BusinessPatterns /></> : <EmptyMessage fill="none"><EmptyMessage.Icon><Search /></EmptyMessage.Icon><EmptyMessage.Title>没有找到对应模式</EmptyMessage.Title><EmptyMessage.Description>试试“输入”“审批”或组件英文名。</EmptyMessage.Description><EmptyMessage.ActionRow><Button color="secondary" variant="outline" onClick={() => setQuery('')}>查看全部</Button></EmptyMessage.ActionRow></EmptyMessage>}
    </div></div></CatalogueQuery>
  </div>;
}

function Foundations() {
  const icons = [{ label: '搜索', Icon: Search }, { label: '新建', Icon: Plus }, { label: '任务', Icon: Agent }, { label: '成果', Icon: Document }, { label: '时间', Icon: Clock }, { label: '个人', Icon: User }, { label: '设置', Icon: Settings }, { label: '历史', Icon: History }];
  return <CatalogueSection id="foundations">
    <Spec id="type"><div className="ui-type-scale"><div><span>页面标题</span><strong className="ui-type-title">把想法变成下一步</strong><small>28 / 36 · 600</small></div><div><span>区块标题</span><strong className="ui-type-section">当前正在推进的事情</strong><small>18 / 27 · 550</small></div><div><span>正文</span><p>给内容足够的阅读空间，让重点和下一步自然出现。</p><small>14 / 24 · 400</small></div><div><span>辅助信息</span><p className="ui-muted">来源、版本和时间留在内容附近。</p><small>12 / 18 · 400</small></div></div></Spec>
    <Spec id="spacing"><div className="ui-space-scale">{[4,8,12,16,24,32].map(value => <div key={value}><span style={{ width: value }} /><small>{value}px</small></div>)}</div><div className="ui-dimensions"><span>控件间距 <strong>8px</strong></span><span>内容间距 <strong>16px</strong></span><span>区块间距 <strong>32px</strong></span></div></Spec>
    <Spec id="color"><div className="ui-color-grid">{[{ name: '主表面', token: 'surface' }, { name: '次级表面', token: 'surface-secondary' }, { name: '悬停表面', token: 'surface-tertiary' }, { name: '主文字', token: 'text' }, { name: '次级文字', token: 'text-secondary' }, { name: '细分隔', token: 'border-subtle' }].map(item => <div key={item.token}><span className="ui-color-swatch" style={{ background: `var(--color-${item.token})` }} /><strong>{item.name}</strong><small>{item.token}</small></div>)}</div></Spec>
    <Spec id="identity"><div className="ui-icon-grid">{icons.map(({ label, Icon }) => <div key={label}><Icon aria-hidden="true" /><span>{label}</span></div>)}</div><div className="ui-identity-row"><Avatar name="示例人物" size={36} /><div><strong>示例人物</strong><p className="ui-muted">没有图片时使用姓名首字</p></div><Avatar Icon={Agent} size={36} /><div><strong>资料助理</strong><p className="ui-muted">角色与个人使用不同标识</p></div></div></Spec>
  </CatalogueSection>;
}

function Controls() {
  const [state, setState] = useState('default');
  const [title, setTitle] = useState('周末活动计划');
  const [body, setBody] = useState('把需要确认的事项列出来，先从最重要的一件开始。');
  const [choice, setChoice] = useState('balanced');
  const [checks, setChecks] = useState([true, false]);
  const [enabled, setEnabled] = useState(false);
  const [scope, setScope] = useState('once');
  const [range, setRange] = useState(30);
  const [clicks, setClicks] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = state === 'disabled';
  return <CatalogueSection id="controls"><div className="ui-demo-toolbar"><span>切换控件状态</span><SegmentedControl value={state} onChange={setState} aria-label="控件演示状态" size="md"><SegmentedControl.Option value="default">默认</SegmentedControl.Option><SegmentedControl.Option value="disabled">禁用</SegmentedControl.Option><SegmentedControl.Option value="loading">加载</SegmentedControl.Option><SegmentedControl.Option value="error">错误</SegmentedControl.Option></SegmentedControl></div>
    <Spec id="button" note="悬停和键盘焦点使用官方状态；加载示例不会触发后台工作。"><div className="ui-inline"><Button color="primary" size="lg" loading={state === 'loading'} disabled={disabled} onClick={() => setClicks(value => value + 1)}><Plus />主要操作</Button><Button color="secondary" variant="outline" size="lg" disabled={disabled} onClick={() => setClicks(value => value + 1)}>次要操作</Button><Button color="secondary" variant="ghost" size="lg" disabled={disabled} onClick={() => setClicks(value => value + 1)}>轻量操作</Button><Button color="primary" size="lg" uniform aria-label="示例发送" disabled={disabled} onClick={() => setClicks(value => value + 1)}><ArrowUp /></Button></div><p className="ui-result" aria-live="polite">本页操作计数：{clicks}</p></Spec>
    <Spec id="input"><Field label="计划名称" hint={state === 'error' ? undefined : '名称只用于这个组件示例。'}><Input ref={inputRef} size="lg" value={title} disabled={disabled} invalid={state === 'error'} aria-describedby={state === 'error' ? 'ui-input-error' : undefined} onChange={event => setTitle(event.target.value)} placeholder="例如：周末活动计划" /></Field>{state === 'error' && <p id="ui-input-error" className="ui-field-error">错误状态示例：请填写一个能辨认的名称。</p>}<Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={() => inputRef.current?.focus()}>查看输入焦点</Button></Spec>
    <Spec id="textarea"><Field label="补充背景"><Textarea size="lg" value={body} onChange={event => setBody(event.target.value)} rows={3} autoResize maxRows={6} disabled={disabled} invalid={state === 'error'} /></Field><p className="ui-muted">{body.length} 字 · 内容仅留在当前页面</p></Spec>
    <Spec id="select"><Field label="回答深度"><Select value={choice} options={[{value:'brief',label:'简短',description:'只保留结论与下一步'},{value:'balanced',label:'均衡',description:'说明重点及必要依据'},{value:'deep',label:'深入',description:'展开背景、取舍与依据'}]} onChange={option => setChoice(option.value)} disabled={disabled} /></Field><p className="ui-muted">当前选择：{{brief:'简短',balanced:'均衡',deep:'深入'}[choice]}</p></Spec>
    <Spec id="checkbox"><div className="ui-stack"><Checkbox checked={checks[0]} disabled={disabled} label="这条理解符合我的情况" onCheckedChange={value => setChecks([value, checks[1]])} /><Checkbox checked={checks[1]} disabled={disabled} label="在本次任务中使用这条背景" onCheckedChange={value => setChecks([checks[0], value])} /></div><p className="ui-muted">已选 {checks.filter(Boolean).length} 项，彼此独立。</p></Spec>
    <Spec id="switch"><div className="ui-setting-row"><div><strong>示例提醒</strong><p>只切换显示状态，不设置真实提醒。</p></div><Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} label={enabled ? '已开启' : '已关闭'} /></div></Spec>
    <Spec id="radio"><RadioGroup value={scope} onChange={setScope} aria-label="演示使用范围" disabled={disabled} direction="col"><RadioGroup.Item value="once">仅这一次</RadioGroup.Item><RadioGroup.Item value="session">当前演示会话</RadioGroup.Item><RadioGroup.Item value="permanent" disabled>长期授权（此例不可用）</RadioGroup.Item></RadioGroup></Spec>
    <Spec id="slider"><Slider label="计划时长" value={range} min={15} max={120} step={15} resetValue={30} resetTooltip="恢复 30 分钟" unit="分钟" disabled={disabled} onChange={setRange} /><p className="ui-muted">当前 {range} 分钟 · 每步 15 分钟</p></Spec>
  </CatalogueSection>;
}

function Navigation() {
  const [view, setView] = useState('preview');
  const [viewText, setViewText] = useState('先确认时间，再安排需要协作的工作。');
  const [sort, setSort] = useState('recent');
  const [pinned, setPinned] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState('周末计划');
  const [savedName, setSavedName] = useState('周末计划');
  return <CatalogueSection id="navigation">
    <Spec id="segments"><SegmentedControl value={view} onChange={setView} aria-label="示例对象视图"><SegmentedControl.Option value="preview">预览</SegmentedControl.Option><SegmentedControl.Option value="edit">编辑</SegmentedControl.Option><SegmentedControl.Option value="history">版本</SegmentedControl.Option></SegmentedControl><div className="ui-inset">{view === 'preview' ? <p>{viewText}</p> : view === 'edit' ? <Textarea aria-label="分段控件编辑示例" value={viewText} onChange={event => setViewText(event.target.value)} rows={2} /> : <p><Badge color="secondary" size="sm">第 1 版</Badge> 初始示例内容</p>}</div></Spec>
    <Spec id="menu"><div className="ui-inline"><Menu><Menu.Trigger><Button color="secondary" variant="outline" size="lg">整理视图<ChevronDown /></Button></Menu.Trigger><Menu.Content minWidth={210} align="start"><Menu.CheckboxItem checked={pinned} onCheckedChange={value => setPinned(value === true)}>固定在顶部</Menu.CheckboxItem><Menu.Separator /><Menu.RadioGroup value={sort} onChange={setSort}><Menu.RadioItem value="recent">按最近更新</Menu.RadioItem><Menu.RadioItem value="name">按名称</Menu.RadioItem></Menu.RadioGroup><Menu.Separator /><Menu.Item disabled>删除受保护示例</Menu.Item></Menu.Content></Menu><span className="ui-muted">{pinned ? '已固定' : '未固定'} · {sort === 'recent' ? '最近更新' : '名称排序'}</span></div></Spec>
    <Spec id="popover"><Popover open={sourceOpen} onOpenChange={setSourceOpen}><Popover.Trigger><Button color="secondary" variant="outline" size="lg"><Document />查看示例来源</Button></Popover.Trigger><Popover.Content width={310} minWidth="auto" align="start"><div className="ui-popover-content"><div className="ui-inline ui-spread"><strong>周末筹备笔记</strong><DemoBadge /></div><p>“我更希望先确定所有参与人的时间，再安排后面的工作。”</p><span>虚构笔记 · 仅用于组件展示</span><Button color="secondary" variant="ghost" size="sm" onClick={() => setSourceOpen(false)}>收起来源</Button></div></Popover.Content></Popover></Spec>
    <Spec id="tooltip" note="也可以用 Tab 聚焦按钮。复制的是固定示例文字，不是用户资料。"><div className="ui-inline"><Tooltip content="复制示例名称" compact><CopyButton copyValue="周末计划（组件示例）" color="secondary" variant="outline" size="lg">复制名称</CopyButton></Tooltip><Tooltip content="更多操作通常放在靠近对象的位置。"><Button color="secondary" variant="ghost" size="lg" uniform aria-label="查看更多操作提示"><DotsHorizontalMoreMenu /></Button></Tooltip></div></Spec>
    <Spec id="dialog"><div className="ui-inline"><Button color="secondary" variant="outline" size="lg" onClick={() => { setName(savedName); setDialog(true); }}>打开编辑对话框</Button><span className="ui-muted" aria-live="polite">示例名称：{savedName}</span></div>{dialog && <Dialog title="编辑示例名称" onClose={() => setDialog(false)}><form className="ui-dialog-form" onSubmit={event => { event.preventDefault(); setSavedName(name.trim()); setDialog(false); }}><p>这是界面演示，确认后只更新本页名称。</p><Field label="名称"><Input required value={name} maxLength={40} onChange={event => setName(event.target.value)} size="lg" /></Field><div className="ui-inline ui-end"><Button color="secondary" variant="ghost" size="lg" onClick={() => setDialog(false)}>取消</Button><Button color="primary" size="lg" type="submit" disabled={!name.trim()}>确认修改</Button></div></form></Dialog>}</Spec>
  </CatalogueSection>;
}

function Feedback() {
  const [message, setMessage] = useState('info');
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('请输入服务地址');
  const [validation, setValidation] = useState<'idle'|'error'|'valid'>('idle');
  const [empty, setEmpty] = useState('first');
  const alerts = {info:{color:'info',title:'示例提示',description:'补充信息不会中断当前操作。'},success:{color:'success',title:'示例：更改已保存',description:'成功消息应对应已经完成的动作，此处只切换消息样式。'},warning:{color:'warning',title:'示例：需要你确认',description:'说明需要决定的事情，以及确认后会发生什么。'},danger:{color:'danger',title:'示例：操作未完成',description:'保留已有内容，提供可行的恢复动作。'}} as const;
  const alert = alerts[message as keyof typeof alerts];
  function validate() { try { const url = new URL(address); setValidation(url.protocol === 'https:' || url.protocol === 'http:' ? 'valid' : 'error'); } catch { setValidation('error'); } }
  return <CatalogueSection id="feedback">
    <Spec id="badges"><div className="ui-inline"><Badge color="secondary" size="sm">已确认</Badge><Badge color="secondary" variant="outline" size="sm">推断</Badge><Badge color="warning" size="sm">待确认</Badge></div><div className="ui-inline">{(['queued','running','awaiting_approval','completed','failed','cancelled','interrupted'] as TaskStatus[]).map(status => <TaskBadge key={status} status={status} />)}</div></Spec>
    <Spec id="alert"><Select aria-label="反馈样式" value={message} options={[{value:'info',label:'提示'},{value:'success',label:'成功'},{value:'warning',label:'等待确认'},{value:'danger',label:'错误'}]} onChange={option => setMessage(option.value)} /><Alert color={alert.color} variant="soft" title={alert.title} description={alert.description} /></Spec>
    <Spec id="loading"><div className="ui-inline ui-spread"><span className="ui-muted">手动控制演示状态</span><Switch label="显示等待" checked={loading} onCheckedChange={setLoading} /></div><div className="ui-loading-demo" aria-live="polite">{loading ? <><LoadingIndicator /><span>等待示例内容</span><LoadingDots /></> : <><Check /><span>已切换到内容状态</span></>}</div></Spec>
    <Spec id="recovery"><form className="ui-stack" onSubmit={event => { event.preventDefault(); validate(); }}><Field label="服务地址"><Input size="lg" value={address} invalid={validation === 'error'} onChange={event => { setAddress(event.target.value); setValidation('idle'); }} /></Field>{validation === 'error' && <Alert color="danger" variant="soft" title="地址格式不完整" description="填写以 https:// 或 http:// 开头的地址。本示例不会连接服务。" />}{validation === 'valid' && <Alert color="success" variant="soft" title="地址格式正确" description="仅通过本地格式校验，未测试连接。" />}<div className="ui-inline"><Button color="secondary" variant="outline" size="lg" type="submit">检查格式</Button><Button color="secondary" variant="ghost" size="lg" onClick={() => { setAddress('https://example.test'); setValidation('idle'); }}>填入有效示例</Button></div></form></Spec>
    <Spec id="empty"><SegmentedControl value={empty} onChange={setEmpty} aria-label="空状态场景"><SegmentedControl.Option value="first">首次使用</SegmentedControl.Option><SegmentedControl.Option value="search">无匹配</SegmentedControl.Option></SegmentedControl><div className="ui-empty-demo"><EmptyMessage fill="none"><EmptyMessage.Icon>{empty === 'first' ? <Document /> : <Search />}</EmptyMessage.Icon><EmptyMessage.Title>{empty === 'first' ? '还没有成果' : '没有匹配的结果'}</EmptyMessage.Title><EmptyMessage.Description>{empty === 'first' ? '完成一件具体的事，成果会保存在这里。' : '缩短关键词，或者清除筛选后重新查看。'}</EmptyMessage.Description><EmptyMessage.ActionRow><Button color="secondary" variant="outline" size="lg" onClick={() => setEmpty(empty === 'first' ? 'search' : 'first')}>切换另一种空态</Button></EmptyMessage.ActionRow></EmptyMessage></div></Spec>
  </CatalogueSection>;
}

function BusinessPatterns() {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState(false);
  const [approval, setApproval] = useState<'pending'|'approved'|'rejected'>('pending');
  const [factState, setFactState] = useState('candidate');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [factHistory, setFactHistory] = useState(false);
  const [artifactView, setArtifactView] = useState('preview');
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [draft, setDraft] = useState('## 周末计划\n\n先确认参与人的时间，再安排后续工作。');
  const [versions, setVersions] = useState(['## 周末计划\n\n先确认参与人的时间，再安排后续工作。']);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const stages: {label:string;status:TaskStatus;description:string}[] = [{label:'准备任务',status:'queued',description:'确认背景与期望成果。'},{label:'检查现有资料',status:'running',description:'这里展示活动记录的组织方式，没有真实执行。'},{label:'等待写入确认',status:'awaiting_approval',description:'具体的写入范围与审批放在同一条任务中。'},{label:'示例完成',status:'completed',description:'这是手动切换的末状态，不会生成实际文件。'}];
  const current = stages[step];
  const latest = versions.at(-1)!;
  return <CatalogueSection id="patterns">
    <Spec id="task"><div className="ui-business-panel"><header><div><DemoBadge /><h4>整理一份周末计划</h4></div><TaskBadge status={current.status} /></header><ol className="ui-activity-list">{stages.slice(0, step + 1).map((stage,index) => <li key={stage.label}><span className={`ui-activity-dot ${index === step ? 'is-current' : ''}`} /><div><strong>{stage.label}</strong>{index === step && <p>{stage.description}</p>}</div></li>)}</ol><Button color="secondary" variant="ghost" size="sm" onClick={() => setDetails(value => !value)}>{details ? '收起活动细节' : '查看活动细节'}<ChevronDown /></Button>{details && <div className="ui-detail-note">执行方式：手动状态演示<br />外部请求：无<br />真实文件：未创建</div>}<footer><span className="ui-muted">第 {step + 1} / {stages.length} 步演示</span><Button color="secondary" variant="outline" onClick={() => setStep((step + 1) % stages.length)}>{step === stages.length - 1 ? '重新演示' : '下一个状态'}<ArrowRight /></Button></footer></div></Spec>
    <Spec id="approval"><div className="ui-inline ui-spread"><DemoBadge /><Button color="secondary" variant="ghost" size="sm" onClick={() => setApproval('pending')}>重置审批</Button></div><TaskApproval approval={{ id: 'catalogue-approval', title: '保存周末计划', description: '将内容写入当前任务的一份本地文档。此处仅为组件演示，不访问电脑或创建文件。', status: approval, details: '对象：周末计划.md\n范围：仅本次写入\n实际执行：无' }} onDecision={decision => setApproval(decision === 'approve' ? 'approved' : 'rejected')} /></Spec>
    <Spec id="cognition"><div className="ui-business-panel"><header><div><span className="ui-muted">偏好 · 第 1 版</span><h4>先确认参与人的时间，再安排协作任务。</h4></div><Badge color={factState === 'candidate' ? 'warning' : 'secondary'} size="sm">{{candidate:'待确认',inferred:'推断',confirmed:'已确认'}[factState]}</Badge></header><SourcePill title="周末筹备笔记（虚构示例来源）" onOpen={() => setSourceOpen(value => !value)} />{sourceOpen && <blockquote className="ui-source-quote">“我希望先知道大家什么时候有空，再一起确定日期。”<small>虚构原文 · 组件演示资料</small></blockquote>}<footer><Select aria-label="认知状态演示" value={factState} options={[{value:'candidate',label:'待确认'},{value:'inferred',label:'推断'},{value:'confirmed',label:'已确认'}]} onChange={option => setFactState(option.value)} /><Button color="secondary" variant="ghost" size="sm" onClick={() => setFactHistory(value => !value)}>修订记录</Button></footer>{factHistory && <div className="ui-detail-note">第 1 版：初始示例。上方切换仅展示状态外观，不生成真实修订。</div>}</div></Spec>
    <Spec id="artifact"><ArtifactCard artifact={{name:'周末计划.md（演示）',version:versions.length}} onOpen={() => {setArtifactOpen(value => !value); setArtifactView('preview');}} />{artifactOpen && <div className="ui-business-panel"><header><div><DemoBadge /><h4>周末计划.md</h4></div><Badge color="secondary" size="sm">第 {versions.length} 版</Badge></header><SegmentedControl value={artifactView} onChange={setArtifactView} aria-label="成果示例视图"><SegmentedControl.Option value="preview">预览</SegmentedControl.Option><SegmentedControl.Option value="edit">编辑</SegmentedControl.Option><SegmentedControl.Option value="history">版本</SegmentedControl.Option></SegmentedControl><div className="ui-artifact-content">{artifactView === 'edit' ? <Textarea aria-label="成果示例正文" rows={5} value={draft} onChange={event => setDraft(event.target.value)} /> : artifactView === 'history' ? <><Select aria-label="查看成果版本" value={String(selectedVersion)} options={versions.map((_, index) => ({value:String(index),label:`第 ${index + 1} 版${index === versions.length - 1 ? ' · 最新' : ''}`}))} onChange={option => setSelectedVersion(Number(option.value))} /><Markdown>{versions[selectedVersion]}</Markdown></> : <Markdown>{latest}</Markdown>}</div><footer><span className="ui-muted">{draft === latest ? '页面内示例 · 已同步' : '有未保存的示例修改'}</span><Button color="primary" disabled={draft === latest} onClick={() => { setVersions([...versions, draft]); setSelectedVersion(versions.length); }}>保存示例版本</Button></footer></div>}</Spec>
  </CatalogueSection>;
}
