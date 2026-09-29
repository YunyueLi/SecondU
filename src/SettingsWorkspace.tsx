import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Bootstrap, ProviderSettings } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Download, Check, ArrowRotateCw, ApiKey, Sun, Moon, MoonSunSystem, User, Desktop, Folder } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice, Field, when } from './components';
import { write, messageOf } from './api';
import './settings.css';

export type Theme = 'light' | 'dark' | 'system';
type SettingsCategory = 'personal' | 'model' | 'computer' | 'appearance' | 'data';
const categories = [
  { id: 'personal', label: '个人空间', Icon: User },
  { id: 'model', label: '模型连接', Icon: ApiKey },
  { id: 'computer', label: '当前电脑', Icon: Desktop },
  { id: 'appearance', label: '外观', Icon: MoonSunSystem },
  { id: 'data', label: '资料', Icon: Folder },
] as const;

function PanelHeading({ id, title, description, status }: { id: string; title: string; description: string; status?: ReactNode }) {
  return <header className="settings-panel-heading">
    <div className="settings-title-row"><h2 id={id}>{title}</h2>{status}</div>
    <p>{description}</p>
  </header>;
}

function PersonalSpace({ data, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState(data.profile.name);
  const [description, setDescription] = useState(data.profile.description);
  const [personal, setPersonal] = useState(!data.profile.demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = name !== data.profile.name || description !== data.profile.description || personal !== !data.profile.demo;

  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      await write('/profile', { name: name.trim(), description: description.trim(), demo: personal ? false : data.profile.demo }, 'PUT');
      await onRefresh();
      setName(name.trim()); setDescription(description.trim()); setSaved(true);
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  return <>
    <PanelHeading id="settings-personal-title" title="个人空间" description="设置你的称呼和介绍，让这个空间从你开始。" status={<Badge color="secondary" variant="outline" size="sm">{data.profile.demo ? '演示空间' : '个人空间'}</Badge>} />
    <div className="settings-form">
      <Field label="怎么称呼你"><Input size="xl" aria-label="我的称呼" value={name} disabled={busy} onChange={event => { setName(event.target.value); setSaved(false); }} placeholder="你的名字或习惯的称呼" /></Field>
      <Field label="简单介绍自己" hint="写下你正在做的事，以及目前对你重要的事。"><Textarea size="xl" aria-label="个人介绍" value={description} disabled={busy} onChange={event => { setDescription(event.target.value); setSaved(false); }} rows={4} placeholder="你正在做什么，什么对你比较重要…" /></Field>
    </div>
    {data.profile.demo && <div className="settings-preference-row">
      <div><h3>开始使用个人空间</h3><p>保留现有示例，保存后使用你的个人信息。演示来源和人物仍需分别检查、纠正。</p></div>
      <Switch label="作为我的个人空间" checked={personal} disabled={busy} onCheckedChange={value => { setPersonal(value); setSaved(false); }} className="settings-personal-switch" />
    </div>}
    <ErrorNotice error={error} />
    <div className="settings-save-row">
      <Button color="primary" size="lg" disabled={busy || !name.trim()} loading={busy} onClick={save}>保存个人信息</Button>
      <span className="settings-save-status" role="status">{saved ? <><Check />个人信息已保存</> : dirty ? '有未保存的修改' : '修改后保存'}</span>
    </div>
  </>;
}

export function SettingsWorkspace({ data, onRefresh, theme, onTheme }: { data: Bootstrap; onRefresh: () => Promise<void>; theme: Theme; onTheme: (theme: Theme) => void }) {
  const [category, setCategory] = useState<SettingsCategory>('personal');
  const [settings, setSettings] = useState(data.settings);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  useEffect(() => { setSettings(data.settings); }, [data.settings.hasKey, data.settings.model, data.settings.baseUrl, data.settings.provider, data.settings.reasoningEffort]);

  const dirty = !!key.trim() || settings.provider !== data.settings.provider || settings.model !== data.settings.model || settings.baseUrl !== data.settings.baseUrl || settings.reasoningEffort !== data.settings.reasoningEffort;
  const validConnection = !!settings.model.trim() && !!settings.baseUrl.trim();
  const hasUsableKey = !!key.trim() || data.settings.hasKey;
  function changeSettings(update: Partial<ProviderSettings>) {
    setSettings(current => ({ ...current, ...update })); setNotice(''); setTestResult(null);
  }
  async function save(test = false, clearKey = false) {
    setBusy(true); setError(''); setNotice(''); setTestResult(null);
    try {
      await write<ProviderSettings>('/settings/provider', {
        provider: settings.provider, model: settings.model.trim(), baseUrl: settings.baseUrl.trim(), api: 'responses', reasoningEffort: settings.reasoningEffort,
        ...(key.trim() && !clearKey ? { apiKey: key.trim() } : {}), ...(clearKey ? { clearKey: true } : {}),
      }, 'PUT');
      setKey('');
      await onRefresh();
      if (test) {
        const result = await write<{ ok: boolean; message: string; latencyMs?: number }>('/settings/provider/test');
        setTestResult(result); await onRefresh();
      } else setNotice(clearKey ? '已移除本机保存的密钥。' : '模型设置已保存。');
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  return <div className="settings-workspace">
    <header className="settings-workspace-heading"><h1>设置</h1><p>管理你的空间、模型与本地偏好。</p></header>
    <div className="settings-layout">
      <aside className="settings-navigation">
        <nav aria-label="设置分类">
          {categories.map(({ id, label, Icon }) => <Button key={id} color="secondary" variant="ghost" size="xl" pill={false} className="settings-category" selected={category === id} aria-current={category === id ? 'page' : undefined} aria-controls={`settings-${id}`} onClick={() => setCategory(id)}><Icon /><span>{label}</span></Button>)}
        </nav>
        <div className="settings-space-note"><span>{data.profile.demo ? '演示空间' : '个人空间'}</span><strong>{data.profile.name}</strong><p>资料保存在当前电脑</p></div>
      </aside>
      <div className="settings-detail">
        {/* Keep forms mounted so switching categories preserves unsaved input. */}
        <section id="settings-personal" className="settings-panel" hidden={category !== 'personal'} aria-labelledby="settings-personal-title"><PersonalSpace data={data} onRefresh={onRefresh} /></section>

        <section id="settings-model" className="settings-panel" hidden={category !== 'model'} aria-labelledby="settings-model-title">
          <PanelHeading id="settings-model-title" title="模型连接" description="连接你选择的服务，使用自己的 API 密钥运行任务。" status={<Badge color="secondary" variant="outline" size="sm">{data.settings.hasKey ? '密钥已保存' : '待添加密钥'}</Badge>} />
          <div className="settings-form">
            <div className="settings-form-columns">
              <Field label="服务提供方"><Select size="xl" value={settings.provider} disabled={busy} onChange={option => changeSettings({ provider: option.value as ProviderSettings['provider'] })} options={[{ value: 'deepseek', label: 'DeepSeek' }, { value: 'openai', label: 'OpenAI' }, { value: 'custom', label: '其他兼容服务' }]} /></Field>
              <Field label="模型名称"><Input size="xl" aria-label="模型名称" value={settings.model} disabled={busy} onChange={event => changeSettings({ model: event.target.value })} placeholder="服务提供方的模型 ID" /></Field>
            </div>
            <Field label="服务地址" hint="填写支持 Responses 接口的地址；可通过连接测试确认兼容情况。"><Input size="xl" aria-label="模型服务地址" type="url" value={settings.baseUrl} disabled={busy} onChange={event => changeSettings({ baseUrl: event.target.value })} placeholder="https://…/v1" autoComplete="off" /></Field>
            <Field label="API 密钥" hint={data.settings.hasKey ? `本机已保存 ${data.settings.keyHint || '一个密钥'}。留空会继续使用它。` : '密钥仅保存在本机运行目录，不随个人资料导出。'}><Input size="xl" aria-label="API 密钥" type="password" value={key} disabled={busy} onChange={event => { setKey(event.target.value); setNotice(''); setTestResult(null); }} placeholder={data.settings.hasKey ? '输入新密钥以替换' : '由你输入密钥'} autoComplete="new-password" startAdornment={<ApiKey />} /></Field>
            <div className="settings-limited-field"><Field label="思考深度"><Select size="xl" value={settings.reasoningEffort} disabled={busy} onChange={option => changeSettings({ reasoningEffort: option.value as ProviderSettings['reasoningEffort'] })} options={[{ value: 'low', label: '简短' }, { value: 'medium', label: '均衡' }, { value: 'high', label: '深入' }]} /></Field></div>
          </div>
          <p className="settings-context-note">只有选择“我的模型”运行任务时，才会把该任务及所选上下文交给服务提供方。连接测试会向该服务发送测试请求。</p>
          <div className="settings-feedback" aria-live="polite">
            <ErrorNotice error={error} />
            {testResult && <Alert color={testResult.ok ? 'primary' : 'danger'} variant="soft" title={testResult.ok ? '连接测试通过' : '连接测试未通过'} description={`${testResult.message}${testResult.latencyMs ? `（${testResult.latencyMs} ms）` : ''}`} />}
          </div>
          <div className="settings-save-row">
            <Button color="primary" size="lg" loading={busy} disabled={busy || !validConnection} onClick={() => save()}>保存设置</Button>
            <Button color="secondary" variant="outline" size="lg" disabled={busy || !validConnection || !hasUsableKey} onClick={() => save(true)}><ArrowRotateCw />保存并测试</Button>
            <span className="settings-save-status" role="status">{notice ? <><Check />{notice}</> : dirty ? '有未保存的修改' : null}</span>
          </div>
          {!hasUsableKey && <p className="settings-action-hint">输入密钥后可测试连接；模型参数可先保存。</p>}
          {data.settings.lastTest && !testResult && <div className="settings-test-history"><span>上次测试</span><p>{data.settings.lastTest.ok ? '通过' : '未通过'} · {when(data.settings.lastTest.at)}</p><small>{data.settings.lastTest.message}{dirty ? ' 当前有未保存的修改，需保存后重新测试。' : ''}</small></div>}
          {data.settings.hasKey && <div className="settings-key-management"><p>移除已保存的密钥后，需要重新输入才能使用模型。</p><Button color="danger" variant="ghost" size="sm" disabled={busy} onClick={() => { if (confirm('移除本机保存的模型密钥？之后需要重新输入。')) void save(false, true); }}>移除密钥</Button></div>}
        </section>

        <section id="settings-computer" className="settings-panel" hidden={category !== 'computer'} aria-labelledby="settings-computer-title">
          <PanelHeading id="settings-computer-title" title="当前电脑" description="任务与自动化在这台电脑上执行。" status={<Badge color="secondary" variant="outline" size="sm">{data.computer.status === 'online' ? '在线' : '离线'}</Badge>} />
          <dl className="settings-detail-list">
            <div><dt>执行设备</dt><dd>{data.computer.name}</dd></div>
            <div><dt>系统</dt><dd>{data.computer.platform}</dd></div>
            <div><dt>执行环境</dt><dd>{data.computer.codexAvailable ? `Codex ${data.computer.codexVersion || '已就绪'}` : '尚未检测到 Codex'}</dd></div>
            <div><dt>工作目录</dt><dd className="settings-path">{data.computer.workspace}</dd></div>
          </dl>
          <p className="settings-context-note">保持本机服务运行、电脑处于唤醒状态，任务与自动化才能继续执行。</p>
        </section>

        <section id="settings-appearance" className="settings-panel" hidden={category !== 'appearance'} aria-labelledby="settings-appearance-title">
          <PanelHeading id="settings-appearance-title" title="外观" description="选择适合你的界面主题，更改立即生效。" />
          <div className="settings-theme-control"><h3>界面主题</h3><SegmentedControl value={theme} onChange={onTheme} size="xl" aria-label="外观主题"><SegmentedControl.Option value="light"><Sun />浅色</SegmentedControl.Option><SegmentedControl.Option value="dark"><Moon />深色</SegmentedControl.Option><SegmentedControl.Option value="system"><MoonSunSystem />跟随系统</SegmentedControl.Option></SegmentedControl></div>
          <p className="settings-theme-description">{theme === 'system' ? '跟随当前电脑的浅色或深色外观自动切换。' : theme === 'dark' ? '所有页面使用深色外观。' : '所有页面使用浅色外观。'}</p>
          <div className="settings-appearance-sample" aria-hidden="true"><div className="settings-sample-sidebar"><span /><span /><span /></div><div className="settings-sample-content"><p>从你的想法开始</p><div className="settings-sample-composer">描述你想一起完成的事…<span /></div></div></div>
          <p className="settings-action-hint" role="status">已应用 · {theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色' : '浅色'}</p>
        </section>

        <section id="settings-data" className="settings-panel" hidden={category !== 'data'} aria-labelledby="settings-data-title">
          <PanelHeading id="settings-data-title" title="你的资料" description="查看当前空间的资料概况，随时导出一份副本。" status={<Badge color="secondary" variant="outline" size="sm">本地保存</Badge>} />
          <dl className="settings-detail-list">
            <div><dt>当前空间</dt><dd>{data.profile.demo ? '虚构演示资料' : data.profile.name}</dd></div>
            <div><dt>来源与认识</dt><dd>{data.sources.length} 份来源 · {data.facts.length} 条认识</dd></div>
            <div><dt>人物与关系</dt><dd>{data.people.length} 位人物 · {data.relationships.length} 条关系</dd></div>
            <div><dt>任务与成果</dt><dd>{data.tasks.length} 个任务 · {data.artifacts.length} 份成果</dd></div>
          </dl>
          <div className="settings-export"><div><h3>导出个人资料</h3><p>包含来源、认识、关系、任务与成果，模型密钥不包含在内。</p></div><ButtonLink as="a" color="secondary" variant="outline" size="lg" href="/api/export"><Download />导出资料</ButtonLink></div>
          <p className="settings-product-note">Hither 为暂用名称。</p>
        </section>
      </div>
    </div>
  </div>;
}
