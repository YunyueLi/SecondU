import { t } from '../i18n';
import { modelIdIssue } from '../../shared/model-validation.mjs';
import { usesDefaultReasoning } from '../../shared/provider-presets.mjs';
import { saveConnectionForm } from './connectionSave';
import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, ModelConnection, ModelConnectionList, ProviderSettings } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Plus, ArrowLeft, ArrowRotateCw, ApiKey, Check, Edit, Trash, DotsHorizontalMoreMenu } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field, when } from '../components';
import { api, write, messageOf } from '../api';
import { ProviderLogo, ProviderMark, getProviders, protocolName, type Provider } from './providers';
import { AgentModelAssignments } from './AgentModelAssignments';
import './models.css';

type Draft = Pick<ModelConnection, 'name' | 'provider' | 'model' | 'baseUrl' | 'api' | 'reasoningEffort'> & { appTitle: string };
type TestResult = { ok: boolean; at: string; message: string; latencyMs?: number };
function draftOf(connection?: ModelConnection, initialProvider: Provider = 'moonshot'): Draft {
  const preset = getProviders().find(provider => provider.id === initialProvider)!;
  return connection ? { name: connection.name, provider: connection.provider, model: connection.model, baseUrl: connection.baseUrl, api: connection.api, reasoningEffort: connection.reasoningEffort, appTitle: connection.appTitle || '' } : { name: '', provider: initialProvider, model: preset.model || '', baseUrl: preset.baseUrl, api: preset.api, reasoningEffort: preset.reasoningEffort || 'medium', appTitle: '' };
}
function modelIssueMessage(provider: ProviderSettings['provider'], model: string) {
  const issue = modelIdIssue(provider, model);
  return issue === 'provider_name' ? t('这里需要具体模型 ID，不能填写服务商名称。连接名称可以使用服务商名称。', 'Enter a specific model ID, not the provider name. You can use the provider name as the connection name.') : issue === 'openrouter_format' ? t('请从 OpenRouter 模型目录复制完整 ID，格式通常为提供方/模型。', 'Copy a complete ID from the OpenRouter model catalogue, usually provider/model.') : '';
}
function normalizedAddress(address: string) { return address.trim().replace(/\/+$/, ''); }
function sameDraft(a: Draft, b: Draft) { return (Object.keys(a) as Array<keyof Draft>).every(key => key === 'baseUrl' ? normalizedAddress(a[key]) === normalizedAddress(b[key]) : a[key].trim() === b[key].trim()); }

function ConnectionEditor({ connection, initialProvider, defaultId, usedBy, refreshError, onSaved, onDeleted, onDone }: { connection?: ModelConnection; initialProvider?: Provider; defaultId: string; usedBy: string[]; refreshError: string; onSaved: (connection: ModelConnection) => Promise<void>; onDeleted: (id: string) => Promise<void>; onDone: () => void }) {
  const providers = getProviders();
  const [stored, setStored] = useState(connection);
  const [draft, setDraft] = useState(() => draftOf(connection, initialProvider));
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<TestResult>();
  const [confirmation, setConfirmation] = useState<'delete' | 'key' | 'discard'>();
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirmation) { confirmationRef.current?.scrollIntoView({ block: 'nearest' }); confirmationRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); } }, [confirmation]);
  const start = draftOf(stored, initialProvider);
  const dirty = (!!key && !keySaved) || !sameDraft(draft, start);
  const addressChanged = !!stored && normalizedAddress(draft.baseUrl) !== normalizedAddress(stored.baseUrl);
  const hasKey = !!key.trim() || (!!stored?.hasKey && !addressChanged);
  const modelError = draft.model.trim() ? modelIssueMessage(draft.provider, draft.model) : '';
  const valid = !!draft.name.trim() && !!draft.model.trim() && !!draft.baseUrl.trim() && !modelError;
  const lastTest = result || stored?.lastTest;
  const preset=providers.find(provider=>provider.id===draft.provider);

  function change(update: Partial<Draft>) { setDraft(previous => ({ ...previous, ...update })); setResult(undefined); setNotice(''); setConfirmation(undefined); }
  function chooseProvider(provider: Provider) {
    const preset = providers.find(item => item.id === provider)!;
    change({ provider, baseUrl: preset.baseUrl, api: preset.api, model: preset.model || '', reasoningEffort: preset.reasoningEffort || 'medium' });
    setKey(''); setKeySaved(false);
  }
  function leave() { if (dirty) setConfirmation('discard'); else onDone(); }
  async function save(test = false) {
    if (busy || !valid || (test && !hasKey)) return;
    setBusy(test ? 'test' : 'save'); setError(''); setNotice(''); setResult(undefined); setConfirmation(undefined);
    let persisted = false;
    try {
      const body = { ...draft, name: draft.name.trim(), model: draft.model.trim(), baseUrl: draft.baseUrl.trim(), appTitle: draft.appTitle.trim(), ...(key.trim() ? { apiKey: key.trim() } : addressChanged ? { clearKey: true } : {}) };
      const outcome = await saveConnectionForm<ModelConnection, TestResult>({
        persist: () => write<ModelConnection>(stored ? `/model-connections/${stored.id}` : '/model-connections', body, stored ? 'PUT' : 'POST'),
        onPersisted: async saved => { persisted = true; setKeySaved(!!key.trim()); setStored(saved); await onSaved(saved); },
        test: test ? saved => write<TestResult>(`/model-connections/${saved.id}/test`) : undefined,
        acceptInput: saved => { setDraft(draftOf(saved)); setKey(''); setKeySaved(false); },
      });
      if (outcome.result) {
        const tested = outcome.result;
        const saved = { ...outcome.connection, lastTest: { ok: tested.ok, at: tested.at, message: tested.message } };
        setStored(saved); setResult(tested); await onSaved(saved);
        if (!tested.ok) setNotice(t('连接设置已保存；测试未通过，填写内容已保留。', 'Connection settings were saved. The test failed, and your input has been kept.'));
      } else setNotice(key.trim() ? t('连接和密钥已保存。', 'Connection and API key saved.') : t('连接已保存。', 'Connection saved.'));
    } catch (err) { setError(messageOf(err)); if (persisted) setNotice(test ? t('连接设置已保存；测试未完成，填写内容已保留。', 'Connection settings were saved. The test did not finish, and your input has been kept.') : t('连接设置已保存；刷新未完成，填写内容已保留。', 'Connection settings were saved. Refresh did not finish, and your input has been kept.')); }
    finally { setBusy(''); }
  }
  async function remove(kind: 'delete' | 'key') {
    if (!stored || busy) return;
    setBusy(kind); setError(''); setNotice('');
    try {
      if (kind === 'delete') { await write(`/model-connections/${stored.id}`, {}, 'DELETE'); await onDeleted(stored.id); }
      else {
        const saved = await write<ModelConnection>(`/model-connections/${stored.id}`, { clearKey: true }, 'PUT');
        setStored(saved); setDraft(draftOf(saved)); setKey(''); setKeySaved(false); setResult(undefined); await onSaved(saved); setNotice(t("这条连接的密钥已移除。", "The key for this connection has been removed."));
      }
      setConfirmation(undefined);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(''); }
  }

  return <div className="model-editor">
    <Button color="secondary" variant="ghost" size="sm" className="model-back" disabled={!!busy} onClick={leave}><ArrowLeft />{t("所有连接", "All connections")}</Button>
    {confirmation && <div ref={confirmationRef} className="model-confirm" role="alert"><strong>{confirmation === 'discard' ? t("放弃尚未保存的更改？", "Discard unsaved changes?") : confirmation === 'key' ? t("移除这条连接的密钥？", "Remove the key for this connection?") : t(`删除“${stored?.name}”？`, `Delete “${stored?.name}”?`)}</strong><p>{confirmation === 'discard' ? t("已保存的连接不会改变。", "Your saved connection will not change.") : confirmation === 'key' ? t("模型配置保留，实际运行前需要重新输入密钥。", "The model settings will remain. Add a key again before running tasks.") : t("模型配置和这条连接的密钥将一并移除。", "The model settings and this connection’s key will be removed.")}</p><div><Button color="secondary" variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirmation(undefined)}>{t("取消", "Cancel")}</Button><Button color="danger" size="sm" loading={busy === confirmation} disabled={!!busy} onClick={() => confirmation === 'discard' ? onDone() : void remove(confirmation)}>{confirmation === 'discard' ? t("放弃更改", "Discard changes") : confirmation === 'key' ? t("移除密钥", "Remove key") : t("删除连接", "Delete connection")}</Button></div></div>}
    <header className="model-editor-heading"><div><h2 id="settings-model-title">{stored ? t("编辑模型连接", "Edit connection") : t("添加模型连接", "Add a connection")}</h2><p>{stored ? t("修改这条连接的模型和访问方式。", "Update this connection’s model and access settings.") : t("选择服务提供方，填写你要使用的模型。", "Choose a provider and enter the model you want to use.")}</p></div>{stored && <ProviderLogo provider={stored.provider} compact />}</header>
    {!stored && <div className="model-provider-grid" aria-label={t("选择模型服务提供方", "Choose a model provider")}>{providers.map(provider => <Button key={provider.id} type="button" color="secondary" variant="outline" pill={false} className={`model-provider-option ${draft.provider === provider.id ? 'is-selected' : ''}`} aria-label={provider.name} aria-pressed={draft.provider === provider.id} disabled={!!busy} onClick={() => chooseProvider(provider.id)}><ProviderLogo provider={provider.id} /><span className="model-provider-caption">{provider.description}</span>{draft.provider === provider.id && <Check className="model-provider-check" />}</Button>)}</div>}
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="model-form-grid">
        <Field label={t("连接名称", "Connection name")}><Input size="md" value={draft.name} disabled={!!busy} onChange={event => change({ name: event.target.value })} placeholder={t("例如：日常助理、深入研究", "For example: Daily assistant or Research")} maxLength={100} required /></Field>
        <Field label={t("模型 ID", "Model ID")} hint={modelError || (draft.provider === 'openrouter' ? t('填写模型目录中的完整 ID，与上方连接名称不同。', 'Use the full model ID from the catalogue, separate from the connection name.') : undefined)}><Input size="md" aria-invalid={!!modelError} value={draft.model} disabled={!!busy} onChange={event => change({ model: event.target.value })} placeholder={draft.provider === 'openrouter' ? t("提供方/模型 ID", "provider/model ID") : t("服务提供方的模型 ID", "Model ID from your provider")} maxLength={200} required /></Field>
        {draft.provider === 'openrouter' && <div className="model-form-full model-catalogue-help"><p>{t('从官方目录选择要使用的模型。也可明确选择免费路由，实际模型与可用额度由 OpenRouter 决定。', 'Choose a model from the official catalogue, or select the free router. OpenRouter determines the routed model and availability.')}</p><div><Button color="secondary" variant="outline" size="sm" type="button" disabled={!!busy} onClick={() => change({ model: 'openrouter/free' })}>{t('选用 openrouter/free', 'Use openrouter/free')}</Button><a href="https://openrouter.ai/models" target="_blank" rel="noreferrer">{t('查看官方模型目录', 'View official model catalogue')}</a></div></div>}
        {preset?.docsUrl&&<div className="model-form-full model-catalogue-help"><p>{preset.hint}</p><a href={preset.docsUrl} target="_blank" rel="noreferrer">{t('查看官方接入文档与模型说明','View official API and model documentation')}</a></div>}
        <div className="model-form-full"><Field label={t("API 密钥", "API key")} hint={addressChanged ? t("服务地址已改变，请重新输入密钥。留空保存会移除这条连接的旧密钥。", "The endpoint has changed. Enter a key for the new address; saving with an empty field removes its current key.") : stored?.hasKey ? t('密钥已保存。留空继续使用；输入新密钥可替换。', 'API key saved. Leave this empty to keep it, or enter a replacement.') : t("密钥仅保存在当前电脑，不随个人资料导出。", "Keys stay on this computer and are not included in data exports.")}><Input size="md" type="password" value={key} disabled={!!busy} onChange={event => { setKey(event.target.value); setKeySaved(false); setNotice(''); setResult(undefined); setConfirmation(undefined); }} autoComplete="new-password" placeholder={stored?.hasKey && !addressChanged ? t("密钥已保存", "Key saved") : t("由你输入密钥", "Enter your API key")} startAdornment={<ApiKey />} /></Field></div>
        <div className="model-form-full"><Field label={t("服务地址", "Endpoint URL")}><Input size="md" type="url" value={draft.baseUrl} disabled={!!busy} onChange={event => change({ baseUrl: event.target.value })} placeholder="https://api.example.com/v1" autoComplete="off" required /></Field></div>
        <Field label={t("API 协议", "API protocol")}><Select size="md" block={false} align="start" alignOffset={0} triggerClassName="model-compact-select" listWidth="auto" listMinWidth={180} listMaxWidth={220} value={draft.api} disabled={!!busy || draft.provider === 'anthropic'} onChange={option => change({ api: option.value as ProviderSettings['api'] })} options={draft.provider === 'anthropic' ? [{value:'messages',label:'Messages'}] : [{ value: 'responses', label: 'Responses' }, { value: 'chat_completions', label: 'Chat Completions' }]} /></Field>
        {draft.provider === 'anthropic'||usesDefaultReasoning(draft.provider) ? <div className="model-default-reasoning"><span>{t('思考设置','Thinking')}</span><p>{t('使用模型默认设置','Uses the model’s default settings')}</p></div> : <Field label={t("思考深度", "Reasoning effort")}><Select size="md" block={false} align="start" alignOffset={0} triggerClassName="model-compact-select" listWidth="auto" listMinWidth={180} listMaxWidth={220} value={draft.reasoningEffort} disabled={!!busy} onChange={option => change({ reasoningEffort: option.value as ProviderSettings['reasoningEffort'] })} options={draft.provider === 'moonshot' ? [{value:'low',label:t('简短','Low')},{value:'high',label:t('深入','High')},{value:'max',label:t('充分思考','Maximum')}] : [{value:'low',label:t('简短','Low')},{value:'medium',label:t('均衡','Medium')},{value:'high',label:t('深入','High')},{value:'max',label:t('充分思考','Maximum')}]} /></Field>}
        {draft.provider === 'openrouter' && <div className="model-form-full"><Field label={t("应用名称（可选）", "App name (optional)")} hint={t("用英文填写产品名称，会显示在 OpenRouter 的请求归属中。", "Enter an English product name for OpenRouter request attribution.")}><Input size="md" value={draft.appTitle} disabled={!!busy} maxLength={100} onChange={event => change({ appTitle: event.target.value })} placeholder="Hither" /></Field></div>}
      </div>
      <p className="model-protocol-note">{draft.provider === 'anthropic' ? t('通过原生 Messages API 连接 Claude，支持文本、本机图片和工具；实际能力取决于所选模型。','Connects to Claude through its native Messages API, with text, local images and tools. Actual support depends on the selected model. ') : draft.provider === 'openrouter' ? t("Claude 等模型可通过 OpenRouter 使用。", "Claude and other models are available through OpenRouter. ") : ''}{draft.api === 'chat_completions' ? t("Chat Completions 可传递文本、本机图片和工具请求，实际支持取决于所选模型；回复完成后统一显示。", "Chat Completions carries text, local images and tool requests when the selected model supports them. Replies appear when complete. ") : ''}{t("文本测试通过后，实际任务仍需验证工具兼容性。", "A successful text test does not establish tool compatibility for real tasks.")}</p>
      <div className="model-feedback" aria-live="polite"><ErrorNotice error={error || refreshError} />{result && <Alert color={result.ok ? 'primary' : 'danger'} variant="soft" title={result.ok ? t("文本连接测试通过", "Text connection test passed") : t("连接测试未通过", "Connection test failed")} description={`${result.message}${result.latencyMs !== undefined ? ` (${result.latencyMs} ms)` : ''}`} />}{notice && <p className="model-saved"><Check />{notice}</p>}</div>
      <div className="model-editor-actions"><Button color="primary" size="md" type="submit" loading={busy === 'save'} disabled={!!busy || !valid}>{t("保存连接", "Save connection")}</Button><Button color="secondary" variant="outline" size="md" type="button" loading={busy === 'test'} disabled={!!busy || !valid || !hasKey} onClick={() => void save(true)}><ArrowRotateCw />{t("保存并测试", "Save and test")}</Button><span>{dirty ? t("有未保存的修改", "Unsaved changes") : !hasKey ? t("可先保存，输入密钥后再测试", "Save now; add a key to test later") : ''}</span></div>
      <p className="model-testing-note">{t("测试会向这条连接发送一条简短请求，不包含个人资料。", "Testing sends a short request through this connection, without personal data.")}</p>
    </form>
    {lastTest && !result && <div className="model-last-test"><span>{t("上次文本测试", "Last text test")}</span><strong>{lastTest.ok ? t("通过", "Passed") : t("未通过", "Failed")}</strong><time>{when(lastTest.at)}</time><p>{lastTest.message}{dirty ? t(" 当前修改尚未保存，测试结果对应此前配置。", " Changes are not saved; this result applies to the previous configuration.") : ''}</p></div>}
    {stored && <div className="model-management"><div><Button color="secondary" variant="ghost" size="sm" disabled={!!busy || dirty || !stored.hasKey} onClick={() => setConfirmation('key')}><ApiKey />{t("移除密钥", "Remove key")}</Button><Button color="danger" variant="ghost" size="sm" disabled={!!busy || stored.id === defaultId || usedBy.length > 0} onClick={() => setConfirmation('delete')}><Trash />{t("删除连接", "Delete connection")}</Button></div>{stored.id === defaultId ? <p>{t("默认连接不能删除，请先设置其他默认连接。", "Choose another default before deleting this connection.")}</p> : usedBy.length > 0 ? <p>{usedBy.join(t('、', ', '))}{t("正在使用这条连接，切换后才能删除。", " use this connection. Reassign them before deleting it.")}</p> : null}</div>}

  </div>;
}

export function ModelSettings({ data, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> }) {
  const providers = getProviders();
  const [connections, setConnections] = useState<ModelConnection[]>(data.modelConnections || []);
  const [defaultId, setDefaultId] = useState(data.defaultConnectionId || '');
  const [editor, setEditor] = useState<{ connection?: ModelConnection; provider?: Provider; key: number }>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const [management, setManagement] = useState<{ connection: ModelConnection; kind: 'key' | 'delete' }>();
  useEffect(() => { if (data.modelConnections) { setConnections(data.modelConnections); setDefaultId(data.defaultConnectionId); } }, [data.modelConnections, data.defaultConnectionId]);
  useEffect(() => { let disposed = false; if (!data.modelConnections) api<ModelConnectionList>('/model-connections').then(value => { if (!disposed) { setConnections(value.connections); setDefaultId(value.defaultConnectionId); } }).catch(err => { if (!disposed) setError(messageOf(err)); }); return () => { disposed = true; }; }, [!!data.modelConnections]);
  async function refresh() {
    try { const result = await api<ModelConnectionList>('/model-connections'); setConnections(result.connections); setDefaultId(result.defaultConnectionId); await onRefresh(); }
    catch (err) { setError(t(`更改已保存，但刷新未完成：${messageOf(err)}`, `Changes were saved, but refresh failed: ${messageOf(err)}`)); }
  }
  async function saved(connection: ModelConnection) { setError(''); setEditor(current => current ? { ...current, connection } : current); setConnections(current => current.some(item => item.id === connection.id) ? current.map(item => item.id === connection.id ? connection : item) : [...current, connection]); await refresh(); }
  async function action(connection: ModelConnection, kind: 'test' | 'default') {
    if (busy) return;
    const invalidModel = kind === 'test' ? modelIssueMessage(connection.provider, connection.model) : '';
    if (invalidModel) { setError(invalidModel); return; }
    setBusy(`${connection.id}:${kind}`); setError(''); setNotice('');
    try {
      if (kind === 'default') { const result = await write<{ connection: ModelConnection; defaultConnectionId: string }>(`/model-connections/${connection.id}/default`); setDefaultId(result.defaultConnectionId); setNotice(t(`已将“${connection.name}”设为默认连接。`, `“${connection.name}” is now the default connection.`)); }
      else { const result = await write<TestResult>(`/model-connections/${connection.id}/test`); setConnections(current => current.map(item => item.id === connection.id ? { ...item, lastTest: result } : item)); if (result.ok) setNotice(t(`“${connection.name}”的文本测试通过。`, `The text test passed for “${connection.name}”.`)); else setError(result.message); }
      await refresh();
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(''); }
  }
  function edit(connection?: ModelConnection, provider?: Provider) { setError(''); setNotice(''); setEditor({ connection, provider, key: ++sequence.current }); }
  async function manage() {
    if (!management || busy) return;
    const {connection,kind}=management;setBusy(`${connection.id}:${kind}`);setError('');setNotice('');
    try {
      if(kind==='delete'){await write(`/model-connections/${connection.id}`,{},'DELETE');setConnections(current=>current.filter(item=>item.id!==connection.id));setNotice(t('连接已删除。','Connection deleted.'));}
      else {const updated=await write<ModelConnection>(`/model-connections/${connection.id}`,{clearKey:true},'PUT');setConnections(current=>current.map(item=>item.id===updated.id?updated:item));setNotice(t('密钥已移除，模型配置已保留。','The key was removed. Model settings are unchanged.'));}
      setManagement(undefined);await refresh();
    } catch(err){setError(messageOf(err));} finally {setBusy('');}
  }

  if (editor) return <ConnectionEditor key={editor.key} connection={editor.connection} initialProvider={editor.provider} defaultId={defaultId} refreshError={error} usedBy={data.agents.filter(agent => editor.connection && agent.connectionId === editor.connection.id).map(agent => agent.name)} onSaved={saved} onDeleted={async id => { setConnections(current => current.filter(item => item.id !== id)); setEditor(undefined); setNotice(t("连接已删除。", "Connection deleted.")); await refresh(); }} onDone={() => setEditor(undefined)} />;
  return <div className="model-settings">
    <header className="model-overview-heading"><div><h2 id="settings-model-title">{t("模型连接", "Model connections")}</h2><p>{t("保存常用模型，为不同的助理选择合适的连接。", "Save your models and choose a connection for each assistant.")}</p></div><Button color="secondary" variant="outline" size="md" disabled={!!busy} onClick={() => edit()}><Plus />{t("添加连接", "Add connection")}</Button></header>
    <div className="model-feedback" aria-live="polite"><ErrorNotice error={error} />{notice && <p className="model-saved"><Check />{notice}</p>}</div>
    <div className="model-connections">{connections.map(connection => {
      const inUse=connection.id===defaultId||data.agents.some(agent=>agent.connectionId===connection.id)||data.tasks.some(task=>task.connectionId===connection.id);
      const status=modelIdIssue(connection.provider,connection.model)?t('请检查模型 ID','Check model ID'):!connection.hasKey?t('待填写密钥','Key required'):!connection.lastTest?t('尚未测试','Not tested'):connection.lastTest.ok?t('文本测试通过','Text test passed'):t('测试未通过','Test failed');
      return <article key={connection.id} className="model-connection">
        <span className="model-connection-mark"><ProviderMark provider={connection.provider} size={25}/></span>
        <div className="model-connection-copy"><div className="model-connection-name"><Button color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={()=>edit(connection)} aria-label={t(`编辑连接 ${connection.name}`,`Edit connection ${connection.name}`)}><h3>{connection.name}</h3></Button>{connection.id===defaultId&&<Badge color="secondary" variant="soft" size="sm">{t('默认','Default')}</Badge>}</div><p className="model-connection-model" title={`${connection.model} (${protocolName(connection.api)})`}>{connection.model}</p></div>
        <span className={`model-connection-state ${!connection.hasKey?'needs-key':connection.lastTest?.ok?'is-passed':''}`} title={connection.lastTest?`${status} (${when(connection.lastTest.at)})`:status}><i aria-hidden="true"/>{status}</span>
        <div className="model-connection-actions"><Button color="secondary" variant="ghost" size="sm" disabled={!!busy||!connection.hasKey} loading={busy===`${connection.id}:test`} onClick={()=>void action(connection,'test')}>{t('测试','Test')}</Button><Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" uniform disabled={!!busy} aria-label={t(`管理连接 ${connection.name}`,`Manage connection ${connection.name}`)}><DotsHorizontalMoreMenu/></Button></Menu.Trigger><Menu.Content align="end" width={210} minWidth="auto"><Menu.Item onSelect={()=>edit(connection)}><Edit/>{t('编辑连接','Edit connection')}</Menu.Item><Menu.Item disabled={connection.id===defaultId} onSelect={()=>void action(connection,'default')}><Check/>{t('设为默认','Set as default')}</Menu.Item><Menu.Separator/><Menu.Item disabled={!connection.hasKey} onSelect={()=>{setError('');setManagement({connection,kind:'key'});}}><ApiKey/>{t('移除密钥','Remove key')}</Menu.Item><Menu.Item disabled={inUse} onSelect={()=>{setError('');setManagement({connection,kind:'delete'});}}><Trash/>{t('删除连接','Delete connection')}</Menu.Item></Menu.Content></Menu></div>
      </article>;
    })}</div>
    {!connections.length && <div className="model-empty"><ApiKey /><h3>{t("连接你常用的模型", "Connect your models")}</h3><p>{t("添加连接后，可设为全局默认，也可分配给单独的助理。", "Use a connection as your global default or assign it to an assistant.")}</p><Button color="primary" onClick={() => edit()}>{t("添加第一个连接", "Add your first connection")}</Button></div>}
    <AgentModelAssignments data={data} connections={connections} defaultId={defaultId} onRefresh={onRefresh} />
    <div className="model-provider-availability"><h3>{t("添加其他服务", "Add another provider")}</h3><div>{providers.map(provider => <Button key={provider.id} color="secondary" variant="ghost" size="sm" disabled={!!busy} aria-label={t(`添加 ${provider.name} 连接`, `Add a ${provider.name} connection`)} onClick={() => edit(undefined, provider.id)}><ProviderLogo provider={provider.id} compact /></Button>)}</div></div>
    <p className="model-local-note">{t("密钥只保存在当前电脑。设置默认连接会应用于未单独指定模型的助理。", "Keys stay on this computer. Assistants without a separate connection use the default.")}</p>
    {management&&<Dialog title={management.kind==='key'?t('移除密钥','Remove key'):t('删除连接','Delete connection')} onClose={()=>{if(!busy)setManagement(undefined);}}><div className="model-management-dialog"><p>{management.kind==='key'?t(`移除“${management.connection.name}”的密钥？模型设置会保留，使用前需重新填写。`,`Remove the key for “${management.connection.name}”? Its model settings remain; add a key again before using it.`):t(`删除“${management.connection.name}”及其本机密钥？`,`Delete “${management.connection.name}” and its locally saved key?`)}</p><ErrorNotice error={error}/><div><Button color="secondary" variant="ghost" disabled={!!busy} onClick={()=>setManagement(undefined)}>{t('取消','Cancel')}</Button><Button color="danger" disabled={!!busy} loading={!!busy} onClick={()=>void manage()}>{management.kind==='key'?t('移除密钥','Remove key'):t('删除连接','Delete connection')}</Button></div></div></Dialog>}
  </div>;
}
