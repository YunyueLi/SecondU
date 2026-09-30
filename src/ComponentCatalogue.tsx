import { t, getLocale } from './i18n';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ButtonLink, CopyButton } from '@openai/apps-sdk-ui/components/Button';
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
import type { Task, TaskStatus } from '../shared/contracts';
import { TaskActivity } from './design-system/TaskActivity';
import { TaskApproval } from './design-system/TaskApproval';
import { ArtifactCard } from './design-system/ArtifactCard';
import { SourcePill } from './design-system/SourcePill';
import {BadgeExample,ComposerExample,PlatformFilterExample,IllustrationExample,StartupExample} from './catalogue/ProductExamples';
import {GraphExample} from './catalogue/GraphExample';
import type {Appearance} from './appearance';
import './catalogue.css';

const getGroups = () => [
  { id: 'foundations', title: t("基础规范", "Foundations"), description: t("以文字、空间和语义色建立清晰层级，明暗主题共用同一套规则。", "Type, spacing, and semantic colors provide a consistent hierarchy in light and dark themes.") },
  { id: 'controls', title: t("输入与选择", "Input and selection"), description: t("标签说明要做什么，状态说明现在能做什么。先操作，再观察变化。", "Labels explain the action. States show what is available. Try the controls to see their behavior.") },
  { id: 'navigation', title: t("导航与浮层", "Navigation and overlays"), description: t("切换、补充信息和需要专注的操作，采用不同的交互层级。", "Switch views, reveal context, and focus on a task at the appropriate interaction level.") },
  { id: 'feedback', title: t("反馈与状态", "Feedback and states"), description: t("让进行、等待、完成和失败可区分；有问题时给出具体的下一步。", "Distinguish progress, waiting, completion, and failure. Provide a clear next step when something goes wrong.") },
  { id: 'patterns', title: t("业务组合", "Product patterns"), description: t("将基础控件用于任务、个人认知和成果。以下均为页面内演示，不执行真实任务。", "Combine controls for tasks, personal context, and artifacts. These examples stay on this page and run no real tasks.") },
] as const;
type GroupId = ReturnType<typeof getGroups>[number]['id'];
const getSpecs = () => [
  ['type', 'foundations', t("文字层级", "Type hierarchy"), 'Typography', t("默认页面标题 24px，区块标题 16px，正文 14px，控件与辅助文字 13px，元信息 12px。字号随外观设置调整。", "Default sizes are 24px for page titles, 16px for sections, 14px for body text, 13px for controls and supporting text, and 12px for metadata. Appearance settings adjust the scale.")],
  ['spacing', 'foundations', t("空间与形状", "Spacing and shape"), 'Spacing', t("相关内容靠近，区块之间留白。面板圆角 12px，常规操作高度 36px。", "Group related content and separate sections with space. Panels use 12px corners; standard controls are 36px tall.")],
  ['color', 'foundations', t("语义颜色", "Semantic colors"), 'Tokens', t("白灰表面与细分隔组织内容；状态色只用于确有含义的反馈。", "Neutral surfaces and subtle borders organize content. Status colors communicate specific meaning.")],
  ['identity', 'foundations', t("图标与身份", "Icons and identity"), 'Icon，Avatar', t("使用官方图标和头像组件。图标操作需有文字标签或可访问名称。", "Use official icons and avatars. Icon actions need a visible label or accessible name.")],
  ['button', 'controls', t("操作按钮", "Buttons"), 'Button', t("主要操作保持单一，次要操作降一级。加载与禁用状态明确阻止重复操作。", "Give one action primary emphasis. Loading and disabled states prevent duplicate actions.")],
  ['input', 'controls', t("单行输入", "Text input"), 'Input', t("保留可见标签，提示文字提供例子，错误信息说明如何改正。", "Keep a visible label, show examples in placeholders, and explain how to fix errors.")],
  ['textarea', 'controls', t("长文本", "Long text"), 'Textarea', t("多行内容随输入增长。说明与字数保持在输入区域附近。", "Multiline fields grow with content. Keep guidance and character counts nearby.")],
  ['select', 'controls', t("下拉选择", "Select"), 'Select', t("选项较多或空间有限时使用。选择后的值直接留在控件里。", "Use for longer option lists or limited space. The selected value stays visible.")],
  ['checkbox', 'controls', t("复选与授权", "Checkboxes and consent"), 'Checkbox', t("每一项可独立选择；不能用一个勾选框代表含糊的长期授权。", "Each option is independent. A checkbox should not imply vague ongoing permission.")],
  ['switch', 'controls', t("开关", "Switches"), 'Switch', t("表达即时生效的二元状态，旁边用文字说明当前状态。", "Use for an immediate binary setting, with text describing its current state.")],
  ['radio', 'controls', t("互斥选择", "Radio selection"), 'RadioGroup', t("少量选项完整展开，方便对比。只允许选中一项。", "Show a short list in full for comparison. Only one option can be selected.")],
  ['slider', 'controls', t("连续范围", "Range slider"), 'Slider', t("用数值和单位解释滑块。支持方向键调整与恢复默认值。", "Show values and units. Support arrow keys and resetting to a default.")],
  ['segments', 'navigation', t("同一对象的视图", "Object views"), 'SegmentedControl', t("切换预览、编辑与版本，始终围绕同一个对象。", "Switch between preview, editing, and versions of the same object.")],
  ['menu', 'navigation', t("操作菜单", "Action menus"), 'Menu', t("收纳次要操作。可用项、选中项与禁用项保持清晰。", "Group secondary actions. Make available, selected, and disabled options distinct.")],
  ['popover', 'navigation', t("就地查看依据", "Inline context"), 'Popover', t("简短来源与补充设置就地展开，避免把每次查看都变成中断。", "Reveal short sources and settings in place without interrupting the main task.")],
  ['tooltip', 'navigation', t("悬停与焦点提示", "Hover and focus hints"), 'Tooltip，CopyButton', t("鼠标悬停或键盘聚焦时出现。重要说明不能只存在于提示中。", "Appear on hover or keyboard focus. Essential instructions must also be visible elsewhere.")],
  ['dialog', 'navigation', t("专注对话框", "Focused dialogs"), t("应用对话框组合", "App dialog pattern"), t("用于需要完整输入的操作。支持 Escape、焦点约束和关闭后返回触发点。", "Use for focused input. Support Escape, focus containment, and returning focus on close.")],
  ['badges', 'feedback', t("状态标签", "Status badges"), 'Badge，TaskBadge', t("文字是状态的主要载体，颜色只辅助识别。标签本身不冒充按钮。", "Text carries the status; color helps recognition. Badges should not look interactive.")],
  ['alert', 'feedback', t("就地反馈", "Inline feedback"), 'Alert', t("标题先说明结果，正文说明影响。可以恢复时，将动作放在同一处。", "State the result in the title and its impact below. Keep recovery actions nearby.")],
  ['loading', 'feedback', t("加载与等待", "Loading and waiting"), 'Indicator', t("有真实等待才显示加载；未知进度不展示虚构百分比。此处可手动切换示例。", "Show loading only during real waits. Never invent progress percentages. Toggle this example manually.")],
  ['recovery', 'feedback', t("错误与恢复", "Errors and recovery"), 'Input，Alert', t("保留用户输入，指出具体问题。这里仅校验地址格式，不连接服务。", "Preserve input and identify the problem. This example checks URL format without connecting to a service.")],
  ['empty', 'feedback', t("空白与无匹配", "Empty and no results"), 'EmptyMessage', t("区分尚无内容和没有搜索结果，给出对应的下一步。", "Distinguish missing content from empty search results and offer an appropriate next step.")],
  ['agent-badge', 'patterns', t('Agent 工牌','Agent badges'), 'AgentBadgeStage', t('与我的 Agents、角色发现共用工牌。切换单行与两行介绍，头像、名称和底栏位置保持固定。','The badge shared by My Agents and role discovery. One- and two-line roles keep the avatar, name, and footer in place.')],
  ['composer', 'patterns', t('对话输入框','Conversation composer'), 'ComposerSurface', t('新对话和已有对话使用同一输入、模型、工具与背景组件。示例草稿不会发送。','New and existing chats share the input, model, tool, and context components. Example drafts are never sent.')],
  ['platform-filter', 'patterns', t('平台筛选','Platform filters'), 'PlatformFilter', t('与聊天记录和时间轴使用相同的平台菜单；选中状态与显示内容同步。','The same platform menu used by conversations and the timeline, with a visible selected state.')],
  ['illustrations', 'patterns', t('局部插画','Spot illustrations'), 'SpotIllustration', t('原始透明插画用于交流、项目、人生记录与自动任务的局部引导。','Original transparent illustrations for conversations, projects, moments, and routines.')],
  ['startup', 'patterns', t('启动与重试','Startup and retry'), 'StartupScreen', t('与应用启动共用加载和错误界面，重试在本页切换状态。','The loading and error surface shared with app startup. Retry changes this local example only.')],
  ['graph', 'patterns', t('关系图谱','Relationship graph'), 'RelationshipGraph', t('真实图谱组件，包含常规、空白与 800 人虚构样本；支持筛选、搜索与缩放。','The real graph with standard, empty, and 800-person fictional samples, including filters, search, and zoom.')],
  ['task', 'patterns', t("任务与活动", "Tasks and activity"), t("任务状态组合", "Task state pattern"), t("结果、活动与等待原因同屏可见。展开细节时保持主线简洁。", "Keep results, activity, and waiting reasons together. Reveal details without obscuring the main flow.")],
  ['approval', 'patterns', t("单次审批", "One-time approval"), t("授权组合", "Approval pattern"), t("写清动作、对象和范围。批准与拒绝都留下明确状态。", "State the action, target, and scope. Record both approval and rejection clearly.")],
  ['cognition', 'patterns', t("认知与证据", "Understanding and evidence"), t("认知组合", "Understanding pattern"), t("事实、推断、候选分开；来源与修订历史始终可以回看。", "Distinguish confirmed, inferred, and candidate information. Keep sources and revision history accessible.")],
  ['artifact', 'patterns', t("成果与版本", "Artifacts and versions"), t("编辑器组合", "Editor pattern"), t("预览与编辑共用内容。保存创建新版本，历史版本可以查看。", "Preview and edit the same content. Saving creates a version; earlier versions remain available.")],
] as const;
type SpecId = ReturnType<typeof getSpecs>[number][0];
const CatalogueQuery = createContext('');
const matches = (spec: ReturnType<typeof getSpecs>[number], query: string) => !query || spec.join(' ').toLowerCase().includes(query.toLowerCase());

function Spec({ id, children, note }: { id: SpecId; children: ReactNode; note?: ReactNode }) {
  const query = useContext(CatalogueQuery);
  const spec = getSpecs().find(item => item[0] === id)!;
  if (!matches(spec, query)) return null;
  return <article className="ui-spec" id={`ui-${id}`}><div className="ui-spec-label"><h3>{spec[2]}</h3><span>{spec[3]}</span><p>{spec[4]}</p></div><div className="ui-spec-example">{children}{note && <p className="ui-example-note">{note}</p>}</div></article>;
}
function CatalogueSection({ id, children }: { id: GroupId; children: ReactNode }) {
  const query = useContext(CatalogueQuery);
  const groups = getGroups(), specs = getSpecs();
  const group = groups.find(item => item.id === id)!;
  const count = specs.filter(spec => spec[1] === id && matches(spec, query)).length;
  if (!count) return null;
  return <section className="ui-catalogue-section" id={`ui-section-${id}`} aria-labelledby={`ui-heading-${id}`}><header><div><h2 id={`ui-heading-${id}`} tabIndex={-1}>{group.title}</h2><p>{group.description}</p></div><span>{t(`${count} 项`, `${count} patterns`)}</span></header>{children}</section>;
}
function DemoBadge() { return <Badge color="secondary" variant="outline" size="sm">{t("演示", "Demo")}</Badge>; }

export function ComponentCatalogue({appearance}:{appearance?:Partial<Appearance>}) {
  const groups = getGroups(), specs = getSpecs();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<GroupId>('foundations');
  const [revision, setRevision] = useState(0);
  const resultCount = specs.filter(spec => matches(spec, query)).length;
  function jump(id: GroupId) {
    setActive(id);
    const heading = document.getElementById(`ui-heading-${id}`);
    heading?.scrollIntoView({ block: 'start', behavior: document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    heading?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const visible = groups.filter(group => specs.some(spec => spec[1] === group.id && matches(spec, query)));
    if (!visible.some(group => group.id === active) && visible[0]) setActive(visible[0].id);
  }, [query, active]);
  return <div className="page-content ui-catalogue">
    <PageHeading title={t("界面规范", "UI guidelines")} description={t("一套让理解、操作与反馈保持一致的界面语言。", "A consistent language for content, controls, and feedback.")} action={<Button color="secondary" variant="outline" size="lg" onClick={() => { setRevision(value => value + 1); setQuery(''); }}>{t("重置演示", "Reset demos")}</Button>} />
    <div className="ui-catalogue-intro"><DemoBadge /><ButtonLink as="a" href="#graph-lab" color="secondary" variant="outline" size="sm">{t("体验大型关系图", "Explore the relationship graph")}</ButtonLink><p>{t(`${specs.length} 种基础与业务模式，复用应用实际组件与官方 Apps SDK UI。示例不保存个人资料、不创建任务。`, `${specs.length} foundation and product patterns reusing live app components and the official Apps SDK UI. Examples save no personal data and create no tasks.`)}</p></div>
    <CatalogueQuery value={query}><div className="ui-catalogue-layout"><aside className="ui-catalogue-nav" aria-label={t("界面规范分类", "UI guideline categories")}>
      <Input aria-label={t("查找组件或模式", "Find a component or pattern")} size="lg" variant="soft" startAdornment={<Search />} placeholder={t("查找组件", "Find components")} value={query} onChange={event => setQuery(event.target.value)} />
      <nav>{groups.map(group => { const count = specs.filter(spec => spec[1] === group.id && matches(spec, query)).length; return <TextLink key={group.id} as="a" href={`#catalogue/${group.id}`} underline={false} className={active === group.id ? 'is-active' : ''} aria-current={active === group.id ? 'location' : undefined} aria-disabled={!count} onClick={event => { event.preventDefault(); if (count) jump(group.id); }}><span>{group.title}</span><small>{count}</small></TextLink>; })}</nav>
      <p className="ui-nav-help">{t("悬停查看反馈，按", "Hover to see feedback. Press")} <kbd>Tab</kbd> {t("检查焦点。明暗主题跟随应用设置。", "to inspect focus. The theme follows app settings.")}</p>
    </aside><div className="ui-catalogue-content" key={`${revision}-${getLocale()}`}>
      {query && <div className="ui-search-result" role="status">{t(`找到 ${resultCount} 项匹配`, `${resultCount} matches`)}<Button color="secondary" variant="ghost" size="sm" onClick={() => setQuery('')}>{t("清除搜索", "Clear search")}</Button></div>}
      {resultCount ? <><Foundations /><Controls /><Navigation /><Feedback /><BusinessPatterns appearance={appearance}/></> : <EmptyMessage fill="none"><EmptyMessage.Icon><Search /></EmptyMessage.Icon><EmptyMessage.Title>{t("没有找到对应模式", "No matching patterns")}</EmptyMessage.Title><EmptyMessage.Description>{t("试试“输入”“审批”或组件英文名。", "Try “input”, “approval”, or a component name.")}</EmptyMessage.Description><EmptyMessage.ActionRow><Button color="secondary" variant="outline" onClick={() => setQuery('')}>{t("查看全部", "View all")}</Button></EmptyMessage.ActionRow></EmptyMessage>}
    </div></div></CatalogueQuery>
  </div>;
}

function Foundations() {
  const icons = [{ label: t("搜索", "Search"), Icon: Search }, { label: t("新建", "New"), Icon: Plus }, { label: t("任务", "Tasks"), Icon: Agent }, { label: t("成果", "Artifacts"), Icon: Document }, { label: t("时间", "Time"), Icon: Clock }, { label: t("个人", "Personal"), Icon: User }, { label: t("设置", "Settings"), Icon: Settings }, { label: t("历史", "History"), Icon: History }];
  return <CatalogueSection id="foundations">
    <Spec id="type"><div className="ui-type-scale"><div><span>{t("页面标题", "Page title")}</span><strong className="ui-type-title">{t("把想法变成下一步", "Turn an idea into a next step")}</strong><small>24 / 32，600</small></div><div><span>{t("区块标题", "Section title")}</span><strong className="ui-type-section">{t("当前正在推进的事情", "What is in progress")}</strong><small>16 / 24，550</small></div><div><span>{t("正文", "Body")}</span><p>{t("给内容足够的阅读空间，让重点和下一步自然出现。", "Give content room to breathe so priorities and next steps are clear.")}</p><small>14 / 24，400</small></div><div><span>{t("控件与辅助文字", "Controls and supporting text")}</span><p className="ui-type-caption">{t("操作名称和说明保持清楚、紧凑。", "Keep controls and supporting text clear and compact.")}</p><small>13 / 20，400</small></div><div><span>{t("元信息", "Metadata")}</span><p className="ui-muted">{t("来源、版本和时间留在内容附近。", "Keep sources, versions, and times close to the content.")}</p><small>12 / 18，400</small></div></div></Spec>
    <Spec id="spacing"><div className="ui-space-scale">{[4,8,12,16,24,32].map(value => <div key={value}><span style={{ width: value }} /><small>{value}px</small></div>)}</div><div className="ui-dimensions"><span>{t("控件间距", "Control gap")} <strong>8px</strong></span><span>{t("内容间距", "Content gap")} <strong>16px</strong></span><span>{t("区块间距", "Section gap")} <strong>32px</strong></span></div></Spec>
    <Spec id="color"><div className="ui-color-grid">{[{ name: t("主表面", "Primary surface"), token: 'surface' }, { name: t("次级表面", "Secondary surface"), token: 'surface-secondary' }, { name: t("悬停表面", "Hover surface"), token: 'surface-tertiary' }, { name: t("主文字", "Primary text"), token: 'text' }, { name: t("次级文字", "Secondary text"), token: 'text-secondary' }, { name: t("细分隔", "Subtle border"), token: 'border-subtle' }].map(item => <div key={item.token}><span className="ui-color-swatch" style={{ background: `var(--color-${item.token})` }} /><strong>{item.name}</strong><small>{item.token}</small></div>)}</div></Spec>
    <Spec id="identity"><div className="ui-icon-grid">{icons.map(({ label, Icon }) => <div key={label}><Icon aria-hidden="true" /><span>{label}</span></div>)}</div><div className="ui-identity-row"><Avatar name={t("示例人物", "Example person")} size={36} /><div><strong>{t("示例人物", "Example person")}</strong><p className="ui-muted">{t("没有图片时使用姓名首字", "Use initials when no image is available")}</p></div><Avatar Icon={Agent} size={36} /><div><strong>{t("资料助理", "Research agent")}</strong><p className="ui-muted">{t("角色与个人使用不同标识", "Distinguish agents from people")}</p></div></div></Spec>
  </CatalogueSection>;
}

function Controls() {
  const [state, setState] = useState('default');
  const [title, setTitle] = useState(t("周末活动计划", "Weekend activity plan"));
  const [body, setBody] = useState(t("把需要确认的事项列出来，先从最重要的一件开始。", "List what needs confirmation, starting with the most important item."));
  const [choice, setChoice] = useState('balanced');
  const [checks, setChecks] = useState([true, false]);
  const [enabled, setEnabled] = useState(false);
  const [scope, setScope] = useState('once');
  const [range, setRange] = useState(30);
  const [clicks, setClicks] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = state === 'disabled';
  return <CatalogueSection id="controls"><div className="ui-demo-toolbar"><span>{t("切换控件状态", "Change control state")}</span><SegmentedControl value={state} onChange={setState} aria-label={t("控件演示状态", "Control demo state")} size="md"><SegmentedControl.Option value="default">{t("默认", "Default")}</SegmentedControl.Option><SegmentedControl.Option value="disabled">{t("禁用", "Disabled")}</SegmentedControl.Option><SegmentedControl.Option value="loading">{t("加载", "Loading")}</SegmentedControl.Option><SegmentedControl.Option value="error">{t("错误", "Error")}</SegmentedControl.Option></SegmentedControl></div>
    <Spec id="button" note={t("悬停和键盘焦点使用官方状态；加载示例不会触发后台工作。", "Hover and focus use official component states. The loading example does not start background work.")}><div className="ui-inline"><Button color="primary" size="lg" loading={state === 'loading'} disabled={disabled} onClick={() => setClicks(value => value + 1)}><Plus />{t("主要操作", "Primary action")}</Button><Button color="secondary" variant="outline" size="lg" disabled={disabled} onClick={() => setClicks(value => value + 1)}>{t("次要操作", "Secondary action")}</Button><Button color="secondary" variant="ghost" size="lg" disabled={disabled} onClick={() => setClicks(value => value + 1)}>{t("轻量操作", "Quiet action")}</Button><Button color="primary" size="lg" uniform aria-label={t("示例发送", "Demo send")} disabled={disabled} onClick={() => setClicks(value => value + 1)}><ArrowUp /></Button></div><p className="ui-result" aria-live="polite">{t("本页操作计数：", "Actions on this page: ")}{clicks}</p></Spec>
    <Spec id="input"><Field label={t("计划名称", "Plan name")} hint={state === 'error' ? undefined : t("名称只用于这个组件示例。", "This name is only used in the component example.")}><Input ref={inputRef} size="lg" value={title} disabled={disabled} invalid={state === 'error'} aria-describedby={state === 'error' ? 'ui-input-error' : undefined} onChange={event => setTitle(event.target.value)} placeholder={t("例如：周末活动计划", "For example: weekend activity plan")} /></Field>{state === 'error' && <p id="ui-input-error" className="ui-field-error">{t("错误状态示例：请填写一个能辨认的名称。", "Example error: enter a recognizable name.")}</p>}<Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={() => inputRef.current?.focus()}>{t("查看输入焦点", "Focus the input")}</Button></Spec>
    <Spec id="textarea"><Field label={t("补充背景", "Additional context")}><Textarea size="lg" value={body} onChange={event => setBody(event.target.value)} rows={3} autoResize maxRows={6} disabled={disabled} invalid={state === 'error'} /></Field><p className="ui-muted">{t(`${body.length} 字，内容仅留在当前页面`, `${body.length} characters, kept on this page only`)}</p></Spec>
    <Spec id="select"><Field label={t("回答深度", "Response depth")}><Select value={choice} options={[{value:'brief',label:t("简短", "Brief"),description:t("只保留结论与下一步", "Conclusions and next steps only")},{value:'balanced',label:t("均衡", "Balanced"),description:t("说明重点及必要依据", "Key points with supporting evidence")},{value:'deep',label:t("深入", "Detailed"),description:t("展开背景、取舍与依据", "Context, trade-offs, and evidence")}]} onChange={option => setChoice(option.value)} disabled={disabled} /></Field><p className="ui-muted">{t("当前选择：", "Selected: ")}{{brief:t("简短", "Brief"),balanced:t("均衡", "Balanced"),deep:t("深入", "Detailed")}[choice]}</p></Spec>
    <Spec id="checkbox"><div className="ui-stack"><Checkbox checked={checks[0]} disabled={disabled} label={t("这条理解符合我的情况", "This understanding fits my situation")} onCheckedChange={value => setChecks([value, checks[1]])} /><Checkbox checked={checks[1]} disabled={disabled} label={t("在本次任务中使用这条背景", "Use this context for this task")} onCheckedChange={value => setChecks([checks[0], value])} /></div><p className="ui-muted">{t(`已选 ${checks.filter(Boolean).length} 项，彼此独立。`, `${checks.filter(Boolean).length} independent options selected.`)}</p></Spec>
    <Spec id="switch"><div className="ui-setting-row"><div><strong>{t("示例提醒", "Demo reminder")}</strong><p>{t("只切换显示状态，不设置真实提醒。", "Changes the displayed state only. No reminder is created.")}</p></div><Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} label={enabled ? t("已开启", "On") : t("已关闭", "Off")} /></div></Spec>
    <Spec id="radio"><RadioGroup value={scope} onChange={setScope} aria-label={t("演示使用范围", "Demo permission scope")} disabled={disabled} direction="col"><RadioGroup.Item value="once">{t("仅这一次", "Only this once")}</RadioGroup.Item><RadioGroup.Item value="session">{t("当前演示会话", "This demo session")}</RadioGroup.Item><RadioGroup.Item value="permanent" disabled>{t("长期授权（此例不可用）", "Ongoing permission (unavailable here)")}</RadioGroup.Item></RadioGroup></Spec>
    <Spec id="slider"><Slider label={t("计划时长", "Planned duration")} value={range} min={15} max={120} step={15} resetValue={30} resetTooltip={t("恢复 30 分钟", "Reset to 30 minutes")} unit={t("分钟", "min")} disabled={disabled} onChange={setRange} /><p className="ui-muted">{t(`当前 ${range} 分钟，每步 15 分钟`, `${range} minutes, in 15-minute steps`)}</p></Spec>
  </CatalogueSection>;
}

function Navigation() {
  const [view, setView] = useState('preview');
  const [viewText, setViewText] = useState(t("先确认时间，再安排需要协作的工作。", "Confirm availability before planning collaborative work."));
  const [sort, setSort] = useState('recent');
  const [pinned, setPinned] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState(t("周末计划", "Weekend plan"));
  const [savedName, setSavedName] = useState(t("周末计划", "Weekend plan"));
  return <CatalogueSection id="navigation">
    <Spec id="segments"><SegmentedControl value={view} onChange={setView} aria-label={t("示例对象视图", "Example object view")}><SegmentedControl.Option value="preview">{t("预览", "Preview")}</SegmentedControl.Option><SegmentedControl.Option value="edit">{t("编辑", "Edit")}</SegmentedControl.Option><SegmentedControl.Option value="history">{t("版本", "Versions")}</SegmentedControl.Option></SegmentedControl><div className="ui-inset">{view === 'preview' ? <p>{viewText}</p> : view === 'edit' ? <Textarea aria-label={t("分段控件编辑示例", "Segmented control editing example")} value={viewText} onChange={event => setViewText(event.target.value)} rows={2} /> : <p><Badge color="secondary" size="sm">{t("第 1 版", "Version 1")}</Badge> {t("初始示例内容", "Initial example content")}</p>}</div></Spec>
    <Spec id="menu"><div className="ui-inline"><Menu><Menu.Trigger><Button color="secondary" variant="outline" size="lg">{t("整理视图", "Organize view")}<ChevronDown /></Button></Menu.Trigger><Menu.Content minWidth={210} align="start"><Menu.CheckboxItem checked={pinned} onCheckedChange={value => setPinned(value === true)}>{t("固定在顶部", "Pin to top")}</Menu.CheckboxItem><Menu.Separator /><Menu.RadioGroup value={sort} onChange={setSort}><Menu.RadioItem value="recent">{t("按最近更新", "By latest update")}</Menu.RadioItem><Menu.RadioItem value="name">{t("按名称", "By name")}</Menu.RadioItem></Menu.RadioGroup><Menu.Separator /><Menu.Item disabled>{t("删除受保护示例", "Delete protected example")}</Menu.Item></Menu.Content></Menu><span className="ui-muted">{pinned ? t("已固定", "Pinned") : t("未固定", "Not pinned")}{t('，', ', ')}{sort === 'recent' ? t("最近更新", "Latest update") : t("名称排序", "Name order")}</span></div></Spec>
    <Spec id="popover"><Popover open={sourceOpen} onOpenChange={setSourceOpen}><Popover.Trigger><Button color="secondary" variant="outline" size="lg"><Document />{t("查看示例来源", "View example source")}</Button></Popover.Trigger><Popover.Content width={310} minWidth="auto" align="start"><div className="ui-popover-content"><div className="ui-inline ui-spread"><strong>{t("周末筹备笔记", "Weekend planning notes")}</strong><DemoBadge /></div><p>{t("“我更希望先确定所有参与人的时间，再安排后面的工作。”", "“I would rather confirm everyone’s availability before planning the rest.”")}</p><span>{t("虚构笔记，仅用于组件展示", "Fictional notes for this component example")}</span><Button color="secondary" variant="ghost" size="sm" onClick={() => setSourceOpen(false)}>{t("收起来源", "Hide source")}</Button></div></Popover.Content></Popover></Spec>
    <Spec id="tooltip" note={t("也可以用 Tab 聚焦按钮。复制的是固定示例文字，不是用户资料。", "You can also focus the button with Tab. It copies fixed demo text, not personal data.")}><div className="ui-inline"><Tooltip content={t("复制示例名称", "Copy example name")} compact><CopyButton copyValue={t("周末计划（组件示例）", "Weekend plan (component demo)")} color="secondary" variant="outline" size="lg">{t("复制名称", "Copy name")}</CopyButton></Tooltip><Tooltip content={t("更多操作通常放在靠近对象的位置。", "Keep additional actions near the relevant object.")}><Button color="secondary" variant="ghost" size="lg" uniform aria-label={t("查看更多操作提示", "More actions hint")}><DotsHorizontalMoreMenu /></Button></Tooltip></div></Spec>
    <Spec id="dialog"><div className="ui-inline"><Button color="secondary" variant="outline" size="lg" onClick={() => { setName(savedName); setDialog(true); }}>{t("打开编辑对话框", "Open edit dialog")}</Button><span className="ui-muted" aria-live="polite">{t("示例名称：", "Example name: ")}{savedName}</span></div>{dialog && <Dialog title={t("编辑示例名称", "Edit example name")} onClose={() => setDialog(false)}><form className="ui-dialog-form" onSubmit={event => { event.preventDefault(); setSavedName(name.trim()); setDialog(false); }}><p>{t("这是界面演示，确认后只更新本页名称。", "This UI demo updates the name on this page only.")}</p><Field label={t("名称", "Name")}><Input required value={name} maxLength={40} onChange={event => setName(event.target.value)} size="lg" /></Field><div className="ui-inline ui-end"><Button color="secondary" variant="ghost" size="lg" onClick={() => setDialog(false)}>{t("取消", "Cancel")}</Button><Button color="primary" size="lg" type="submit" disabled={!name.trim()}>{t("确认修改", "Confirm changes")}</Button></div></form></Dialog>}</Spec>
  </CatalogueSection>;
}

function Feedback() {
  const [message, setMessage] = useState('info');
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState(t("请输入服务地址", "Enter a service URL"));
  const [validation, setValidation] = useState<'idle'|'error'|'valid'>('idle');
  const [empty, setEmpty] = useState('first');
  const alerts = {info:{color:'info',title:t("示例提示", "Example notice"),description:t("补充信息不会中断当前操作。", "Supporting information does not interrupt the current action.")},success:{color:'success',title:t("示例：更改已保存", "Example: changes saved"),description:t("成功消息应对应已经完成的动作，此处只切换消息样式。", "Success should describe a completed action. This example changes the message style only.")},warning:{color:'warning',title:t("示例：需要你确认", "Example: confirmation needed"),description:t("说明需要决定的事情，以及确认后会发生什么。", "Explain the decision and what happens after confirmation.")},danger:{color:'danger',title:t("示例：操作未完成", "Example: action incomplete"),description:t("保留已有内容，提供可行的恢复动作。", "Preserve existing content and offer a way to recover.")}} as const;
  const alert = alerts[message as keyof typeof alerts];
  function validate() { try { const url = new URL(address); setValidation(url.protocol === 'https:' || url.protocol === 'http:' ? 'valid' : 'error'); } catch { setValidation('error'); } }
  return <CatalogueSection id="feedback">
    <Spec id="badges"><div className="ui-inline"><Badge color="secondary" size="sm">{t("已确认", "Confirmed")}</Badge><Badge color="secondary" variant="outline" size="sm">{t("推断", "Inferred")}</Badge><Badge color="warning" size="sm">{t("待确认", "Needs confirmation")}</Badge></div><div className="ui-inline">{(['queued','running','awaiting_approval','completed','failed','cancelled','interrupted'] as TaskStatus[]).map(status => <TaskBadge key={status} status={status} />)}</div></Spec>
    <Spec id="alert"><Select aria-label={t("反馈样式", "Feedback style")} value={message} options={[{value:'info',label:t("提示", "Information")},{value:'success',label:t("成功", "Success")},{value:'warning',label:t("等待确认", "Awaiting confirmation")},{value:'danger',label:t("错误", "Error")}]} onChange={option => setMessage(option.value)} /><Alert color={alert.color} variant="soft" title={alert.title} description={alert.description} /></Spec>
    <Spec id="loading"><div className="ui-inline ui-spread"><span className="ui-muted">{t("手动控制演示状态", "Manually control the demo state")}</span><Switch label={t("显示等待", "Show waiting")} checked={loading} onCheckedChange={setLoading} /></div><div className="ui-loading-demo" aria-live="polite">{loading ? <><LoadingIndicator /><span>{t("等待示例内容", "Waiting for example content")}</span><LoadingDots /></> : <><Check /><span>{t("已切换到内容状态", "Content state selected")}</span></>}</div></Spec>
    <Spec id="recovery"><form className="ui-stack" onSubmit={event => { event.preventDefault(); validate(); }}><Field label={t("服务地址", "Service URL")}><Input size="lg" value={address} invalid={validation === 'error'} onChange={event => { setAddress(event.target.value); setValidation('idle'); }} /></Field>{validation === 'error' && <Alert color="danger" variant="soft" title={t("地址格式不完整", "Invalid URL format")} description={t("填写以 https:// 或 http:// 开头的地址。本示例不会连接服务。", "Enter a URL starting with https:// or http://. This example does not connect to the service.")} />}{validation === 'valid' && <Alert color="success" variant="soft" title={t("地址格式正确", "Valid URL format")} description={t("仅通过本地格式校验，未测试连接。", "Local format check passed. The connection has not been tested.")} />}<div className="ui-inline"><Button color="secondary" variant="outline" size="lg" type="submit">{t("检查格式", "Check format")}</Button><Button color="secondary" variant="ghost" size="lg" onClick={() => { setAddress('https://example.test'); setValidation('idle'); }}>{t("填入有效示例", "Use a valid example")}</Button></div></form></Spec>
    <Spec id="empty"><SegmentedControl value={empty} onChange={setEmpty} aria-label={t("空状态场景", "Empty state example")}><SegmentedControl.Option value="first">{t("首次使用", "First use")}</SegmentedControl.Option><SegmentedControl.Option value="search">{t("无匹配", "No results")}</SegmentedControl.Option></SegmentedControl><div className="ui-empty-demo"><EmptyMessage fill="none"><EmptyMessage.Icon>{empty === 'first' ? <Document /> : <Search />}</EmptyMessage.Icon><EmptyMessage.Title>{empty === 'first' ? t("还没有成果", "No artifacts yet") : t("没有匹配的结果", "No matching results")}</EmptyMessage.Title><EmptyMessage.Description>{empty === 'first' ? t("完成一件具体的事，成果会保存在这里。", "Finish a task and its artifacts will appear here.") : t("缩短关键词，或者清除筛选后重新查看。", "Try a shorter search or clear the filters.")}</EmptyMessage.Description><EmptyMessage.ActionRow><Button color="secondary" variant="outline" size="lg" onClick={() => setEmpty(empty === 'first' ? 'search' : 'first')}>{t("切换另一种空态", "Switch empty state")}</Button></EmptyMessage.ActionRow></EmptyMessage></div></Spec>
  </CatalogueSection>;
}

function BusinessPatterns({appearance}:{appearance?:Partial<Appearance>}) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState(false);
  const [approval, setApproval] = useState<'pending'|'approved'|'rejected'>('pending');
  const [factState, setFactState] = useState('candidate');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [factHistory, setFactHistory] = useState(false);
  const [artifactView, setArtifactView] = useState('preview');
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [draft, setDraft] = useState(t("## 周末计划\n\n先确认参与人的时间，再安排后续工作。", "## Weekend plan\n\nConfirm everyone’s availability before planning the remaining work."));
  const [versions, setVersions] = useState([t("## 周末计划\n\n先确认参与人的时间，再安排后续工作。", "## Weekend plan\n\nConfirm everyone’s availability before planning the remaining work.")]);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const stages: {label:string;status:TaskStatus;description:string}[] = [{label:t("准备任务", "Prepare task"),status:'queued',description:t("确认背景与期望成果。", "Confirm the context and expected result.")},{label:t("检查现有资料", "Review available context"),status:'running',description:t("这里展示活动记录的组织方式，没有真实执行。", "This illustrates an activity record. Nothing is actually executed.")},{label:t("等待写入确认", "Awaiting write approval"),status:'awaiting_approval',description:t("具体的写入范围与审批放在同一条任务中。", "The write scope and its approval belong to the same task.")},{label:t("示例完成", "Demo complete"),status:'completed',description:t("这是手动切换的末状态，不会生成实际文件。", "This state is selected manually. No file is created.")}];
  const current = stages[step];
  const latest = versions.at(-1)!;
  const demoTime = '2026-09-29T09:00:00.000Z';
  const activityEvents: Task['events'] = [
    {id:'example-context',type:'context',label:t('查看演示背景','Review example context'),detail:JSON.stringify([{id:'example-fact',statement:t('先确认参与人的时间，再安排协作任务。','Confirm availability before arranging collaborative tasks.'),status:'confirmed'}]),createdAt:demoTime},
    {id:'example-summary',type:'runtime.reasoning_summary',label:t('公开思考摘要（演示）','Public reasoning summary (demo)'),detail:t('先整理已确认的时间，再标出还需要询问的事项。以下工具活动用于演示，未读取文件或调用模型。','First organize confirmed availability, then identify open questions. The tool activity below is a demo. No files were read and no model was called.'),createdAt:'2026-09-29T09:00:01.000Z'},
    {id:'example-tool',type:'runtime.action.completed',label:t('读取计划文件（演示）','Read planning file (demo)'),detail:t('工具：read_file\n路径：demo/weekend-plan.md\n结果：展示虚构的两行笔记。未访问文件系统。','Tool: read_file\nPath: demo/weekend-plan.md\nResult: two fictional note lines. No file system access occurred.'),createdAt:'2026-09-29T09:00:02.000Z'},
    {id:'example-approval',type:'approval.requested',label:t('等待单次写入批准（演示）','Awaiting one-time write approval (demo)'),detail:t('这里只展示审批状态。没有文件写入请求。','This only demonstrates the approval state. No file write was requested.'),createdAt:'2026-09-29T09:00:03.000Z'},
    {id:'example-complete',type:'artifact.created',label:t('展示成果入口（演示）','Show artifact entry (demo)'),detail:t('下方的成果组件使用页面内示例内容。未创建真实文件。','The artifact component below uses on-page example content. No real file was created.'),createdAt:'2026-09-29T09:00:04.000Z'},
  ];
  const demoTask: Task = {id:'catalogue-task',title:t('整理一份周末计划','Draft a weekend plan'),prompt:'',agentIds:[],contextFactIds:[],mode:'demo',status:current.status,createdAt:demoTime,updatedAt:demoTime,messages:[],events:activityEvents.slice(0,[1,3,4,5][step]),artifactIds:[],approvals:[]};

  return <CatalogueSection id="patterns">
    <Spec id="agent-badge"><BadgeExample/></Spec>
    <Spec id="composer"><ComposerExample/></Spec>
    <Spec id="platform-filter"><PlatformFilterExample/></Spec>
    <Spec id="illustrations"><IllustrationExample/></Spec>
    <Spec id="startup"><StartupExample appearance={appearance}/></Spec>
    <Spec id="graph"><GraphExample/></Spec>
    <Spec id="task"><div className="ui-business-panel"><header><div><DemoBadge /><h4>{t("整理一份周末计划", "Draft a weekend plan")}</h4></div><TaskBadge status={current.status} /></header><TaskActivity task={demoTask}/><Button color="secondary" variant="ghost" size="sm" onClick={() => setDetails(value => !value)}>{details ? t("收起活动细节", "Hide activity details") : t("查看活动细节", "View activity details")}<ChevronDown /></Button>{details && <div className="ui-detail-note">{t("执行方式：手动状态演示", "Execution: manual state demo")}<br />{t("外部请求：无", "External requests: none")}<br />{t("真实文件：未创建", "Files created: none")}</div>}<footer><span className="ui-muted">{t(`第 ${step + 1} / ${stages.length} 步演示`, `Demo step ${step + 1} of ${stages.length}`)}</span><Button color="secondary" variant="outline" onClick={() => setStep((step + 1) % stages.length)}>{step === stages.length - 1 ? t("重新演示", "Restart demo") : t("下一个状态", "Next state")}<ArrowRight /></Button></footer></div></Spec>
    <Spec id="approval"><div className="ui-inline ui-spread"><DemoBadge /><Button color="secondary" variant="ghost" size="sm" onClick={() => setApproval('pending')}>{t("重置审批", "Reset approval")}</Button></div><TaskApproval approval={{ id: 'catalogue-approval', title: t("保存周末计划", "Save weekend plan"), description: t("将内容写入当前任务的一份本地文档。此处仅为组件演示，不访问电脑或创建文件。", "Write the content to a local document for this task. This component demo does not access the computer or create files."), status: approval, details: t("对象：周末计划.md\n范围：仅本次写入\n实际执行：无", "Target: Weekend plan.md\nScope: this write only\nActual execution: none") }} onDecision={decision => setApproval(decision === 'approve' ? 'approved' : 'rejected')} /></Spec>
    <Spec id="cognition"><div className="ui-business-panel"><header><div><span className="ui-muted">{t("偏好，第 1 版", "Preference, version 1")}</span><h4>{t("先确认参与人的时间，再安排协作任务。", "Confirm everyone’s availability before planning collaborative tasks.")}</h4></div><Badge color={factState === 'candidate' ? 'warning' : 'secondary'} size="sm">{{candidate:t("待确认", "Needs confirmation"),inferred:t("推断", "Inferred"),confirmed:t("已确认", "Confirmed")}[factState]}</Badge></header><SourcePill title={t("周末筹备笔记（虚构示例来源）", "Weekend planning notes (fictional source)")} onOpen={() => setSourceOpen(value => !value)} />{sourceOpen && <blockquote className="ui-source-quote">{t("“我希望先知道大家什么时候有空，再一起确定日期。”", "“I want to know when everyone is free before we pick a date together.”")}<small>{t("虚构原文，组件演示资料", "Fictional source text for this component demo")}</small></blockquote>}<footer><Select aria-label={t("认知状态演示", "Understanding state demo")} value={factState} options={[{value:'candidate',label:t("待确认", "Needs confirmation")},{value:'inferred',label:t("推断", "Inferred")},{value:'confirmed',label:t("已确认", "Confirmed")}]} onChange={option => setFactState(option.value)} /><Button color="secondary" variant="ghost" size="sm" onClick={() => setFactHistory(value => !value)}>{t("修订记录", "Revision history")}</Button></footer>{factHistory && <div className="ui-detail-note">{t("第 1 版：初始示例。上方切换仅展示状态外观，不生成真实修订。", "Version 1: initial example. Changing the state above only demonstrates its appearance and creates no revision.")}</div>}</div></Spec>
    <Spec id="artifact"><ArtifactCard artifact={{name:t("周末计划.md（演示）", "Weekend plan.md (demo)"),version:versions.length}} onOpen={() => {setArtifactOpen(value => !value); setArtifactView('preview');}} />{artifactOpen && <div className="ui-business-panel"><header><div><DemoBadge /><h4>{t("周末计划.md", "Weekend plan.md")}</h4></div><Badge color="secondary" size="sm">{t(`第 ${versions.length} 版`, `Version ${versions.length}`)}</Badge></header><SegmentedControl value={artifactView} onChange={setArtifactView} aria-label={t("成果示例视图", "Artifact example view")}><SegmentedControl.Option value="preview">{t("预览", "Preview")}</SegmentedControl.Option><SegmentedControl.Option value="edit">{t("编辑", "Edit")}</SegmentedControl.Option><SegmentedControl.Option value="history">{t("版本", "Versions")}</SegmentedControl.Option></SegmentedControl><div className="ui-artifact-content">{artifactView === 'edit' ? <Textarea aria-label={t("成果示例正文", "Artifact example content")} rows={5} value={draft} onChange={event => setDraft(event.target.value)} /> : artifactView === 'history' ? <><Select aria-label={t("查看成果版本", "View artifact version")} value={String(selectedVersion)} options={versions.map((_, index) => ({value:String(index),label:t(`第 ${index + 1} 版${index === versions.length - 1 ? '，最新' : ''}`, `Version ${index + 1}${index === versions.length - 1 ? ', latest' : ''}`)}))} onChange={option => setSelectedVersion(Number(option.value))} /><Markdown>{versions[selectedVersion]}</Markdown></> : <Markdown>{latest}</Markdown>}</div><footer><span className="ui-muted">{draft === latest ? t("页面内示例，已同步", "On-page example, up to date") : t("有未保存的示例修改", "Unsaved example changes")}</span><Button color="primary" disabled={draft === latest} onClick={() => { setVersions([...versions, draft]); setSelectedVersion(versions.length); }}>{t("保存示例版本", "Save example version")}</Button></footer></div>}</Spec>
  </CatalogueSection>;
}
