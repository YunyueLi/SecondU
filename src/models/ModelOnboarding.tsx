import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select, type Option } from '@openai/apps-sdk-ui/components/Select';
import { ArrowLeft, Check, ArrowRotateCw } from '@openai/apps-sdk-ui/components/Icon';
import type { ModelConnection, ProviderSettings } from '../../shared/contracts';
import { api, write, messageOf } from '../api';
import { Field, ErrorNotice } from '../components';
import { compactSelectProps } from '../compactSelect';
import { t } from '../i18n';
import { getProviders, ProviderMark, type Provider } from './providers';
import { accountModels, completeConnectionSetup, draftForProvider, type AccountModel, type ModelSetupDraft as Draft } from './modelSetup';
import { modelIdIssue } from '../../shared/model-validation.mjs';
import { usesDefaultReasoning } from '../../shared/provider-presets.mjs';
import './model-onboarding.css';

type TestResult = { ok: boolean; at: string; message: string; latencyMs?: number };
const blankDraft: Draft = { provider: '', name: '', baseUrl: '', api: 'responses', reasoningEffort: 'medium', model: '', apiKey: '', appTitle: '' };
const normalizedAddress = (value: string) => value.trim().replace(/\/+$/, '');
type BrandedOption = Option<string> & { provider?: Provider; modelId?: string };
function ModelChoiceView(option: BrandedOption) {
  return <span className="model-connection-option"><span className="model-option-logo">{option.provider && <ProviderMark provider={option.provider} size={18} />}</span><span><strong>{option.label}</strong>{option.modelId && <small>{option.modelId}</small>}</span></span>;
}
function ModelTriggerView(option: BrandedOption) {
  return <span className="model-provider-choice" title={option.label}>{option.provider && <ProviderMark provider={option.provider} size={19} />}<span>{option.label}</span></span>;
}

export function ModelOnboarding({ onSaved, onDone, initialConnection }: { onSaved: (connection: ModelConnection) => Promise<void>; onDone: () => void; initialConnection?: ModelConnection }) {
  const providers = getProviders();
  const [stored, setStored] = useState(initialConnection);
  const storedRef = useRef(stored); storedRef.current = stored;
  const [draft, setDraft] = useState<Draft>(initialConnection ? { provider: initialConnection.provider, name: initialConnection.name, baseUrl: initialConnection.baseUrl, api: initialConnection.api, reasoningEffort: initialConnection.reasoningEffort, model: initialConnection.model, apiKey: '', appTitle: initialConnection.appTitle || '' } : blankDraft);
  const [models, setModels] = useState<AccountModel[]>([]);
  const [catalogueState, setCatalogueState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const [manual, setManual] = useState(false);
  const [advanced, setAdvanced] = useState(initialConnection?.provider === 'custom');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const mounted = useRef(true);
  const requestSequence = useRef(0);
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;
  const preset = providers.find(provider => provider.id === draft.provider);
  const sameEndpoint = !!stored && stored.provider === draft.provider && normalizedAddress(stored.baseUrl) === normalizedAddress(draft.baseUrl);
  const hasCredential = !!draft.apiKey.trim() || !!stored?.hasKey && sameEndpoint;
  const modelIssue = draft.provider && draft.model ? modelIdIssue(draft.provider, draft.model) : '';
  const modelChosen = manual || catalogueState === 'loaded' && models.some(model => model.id === draft.model);
  const ready = !!draft.provider && !!draft.model.trim() && !!draft.baseUrl.trim() && !!draft.name.trim() && !modelIssue && hasCredential && modelChosen;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestSequence.current++; };
  }, []);

  async function loadModels(connection?: ModelConnection) {
    const request = ++requestSequence.current;
    setCatalogueState('loading'); setError(''); setNotice(''); setSuccess(false);
    try {
      const response = connection ? await api(`/model-connections/${connection.id}/models`) : await write('/model-catalogue', { provider: draft.provider, apiKey: draft.apiKey.trim(), baseUrl: draft.baseUrl.trim() });
      if (!mounted.current || request !== requestSequence.current) return;
      const available = accountModels(response);
      setModels(available); setCatalogueState('loaded'); setManual(false);
      setDraft(previous => ({ ...previous, model: available.some(model => model.id === previous.model) ? previous.model : '' }));
      if (!available.length) setNotice(t('服务方没有返回模型。可以重试，或按服务方文档填写模型 ID。', 'The provider returned no models. Retry, or enter a model ID from its documentation.'));
    } catch (err) {
      if (!mounted.current || request !== requestSequence.current) return;
      setCatalogueState('failed'); setError(messageOf(err));
    }
  }

  useEffect(() => { if (initialConnection?.hasKey) void loadModels(initialConnection); }, [initialConnection?.id]);

  function chooseProvider(provider: Provider) {
    const selected = providers.find(item => item.id === provider)!;
    const next = draftForProvider(draft, selected);
    if (next === draft) return;
    requestSequence.current++; setModels([]); setCatalogueState('idle'); setManual(false); setError(''); setNotice(''); setSuccess(false);
    setDraft(next);
    setAdvanced(provider === 'custom');
  }

  function updateAccess(update: Partial<Draft>) {
    requestSequence.current++; setModels([]); setCatalogueState('idle'); setManual(false); setError(''); setNotice(''); setSuccess(false);
    setDraft(previous => ({ ...previous, ...update, model: '' }));
  }

  async function finish(makeDefault: boolean) {
    if (busy || !ready) return;
    setBusy(makeDefault ? 'test' : 'save'); setError(''); setNotice(''); setSuccess(false);
    let persisted: ModelConnection | undefined;
    try {
      const result = await completeConnectionSetup<ModelConnection, TestResult>({
        persist: () => write<ModelConnection>(storedRef.current ? `/model-connections/${storedRef.current.id}` : '/model-connections', {
          name: draft.name.trim(), provider: draft.provider, model: draft.model.trim(), baseUrl: draft.baseUrl.trim(), api: draft.api, reasoningEffort: draft.reasoningEffort, appTitle: draft.appTitle.trim(),
          ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
        }, storedRef.current ? 'PUT' : 'POST'),
        onPersisted: async connection => { persisted = connection; storedRef.current = connection; setStored(connection); await onSavedRef.current(connection); },
        test: makeDefault ? connection => write<TestResult>(`/model-connections/${connection.id}/test`) : undefined,
        setDefault: makeDefault ? connection => write(`/model-connections/${connection.id}/default`) : undefined,
      });
      if (result.result && !result.result.ok) { setError(result.result.message); setNotice(t('连接已保存，测试未通过。填写内容已保留。', 'The connection was saved, but its test failed. Your input has been kept.')); await onSavedRef.current({ ...result.connection, lastTest: result.result }); return; }
      setDraft(previous => ({ ...previous, apiKey: '' })); setSuccess(true);
      setNotice(result.defaultSet ? t('连接测试通过，已设为默认模型。', 'Connection test passed and set as the default model.') : t('连接已保存，尚未测试。', 'Connection saved. It has not been tested yet.'));
      await onSavedRef.current(result.result ? { ...result.connection, lastTest: result.result } : result.connection);
    } catch (err) { setError(messageOf(err)); if (persisted) setNotice(t('连接已保存，后续步骤未完成。填写内容已保留，可重试。', 'The connection was saved, but setup did not finish. Your input has been kept so you can retry.')); }
    finally { setBusy(''); }
  }

  function leave() {
    const changed = stored ? draft.model !== stored.model || draft.name !== stored.name || draft.reasoningEffort !== stored.reasoningEffort || normalizedAddress(draft.baseUrl) !== normalizedAddress(stored.baseUrl) || draft.api !== stored.api || draft.apiKey : draft.apiKey || draft.model;
    if (changed && !success) setConfirmLeave(true); else onDone();
  }

  return <div className="model-onboarding">
    <Button className="model-back" color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={leave}><ArrowLeft />{t('所有连接', 'All connections')}</Button>
    <header className="model-onboarding-heading"><h2 id="settings-model-title">{t('连接模型', 'Connect a model')}</h2><p>{t('选择服务商，填入 API Key，再选择要使用的模型。', 'Choose a provider, enter your API key, then choose a model.')}</p></header>
    {confirmLeave && <div className="model-confirm" role="alert"><strong>{t('放弃尚未保存的内容？', 'Discard unsaved input?')}</strong><div><Button color="secondary" variant="ghost" onClick={() => setConfirmLeave(false)}>{t('继续填写', 'Keep editing')}</Button><Button color="secondary" variant="outline" onClick={onDone}>{t('放弃', 'Discard')}</Button></div></div>}
    <form onSubmit={event => { event.preventDefault(); void finish(true); }}>
      <div className="model-onboarding-access"><fieldset className="model-onboarding-providers"><legend>{t('模型服务商', 'Provider')}</legend><div className="model-onboarding-provider-grid">{providers.map(provider=><Button key={provider.id} type="button" color="secondary" variant={draft.provider===provider.id?'soft':'outline'} className="model-onboarding-provider" aria-pressed={draft.provider===provider.id} disabled={!!busy} onClick={()=>chooseProvider(provider.id)}><span className="model-onboarding-provider-content"><ProviderMark provider={provider.id} size={22}/><span>{provider.name}</span></span>{draft.provider===provider.id&&<Check className="model-onboarding-provider-check" aria-hidden="true"/>}</Button>)}</div></fieldset>
        {draft.provider && <Field label="API Key" hint={stored?.hasKey && sameEndpoint ? t('密钥已保存在本机。留空继续使用，填写新密钥可替换。', 'Your key is saved on this computer. Leave empty to keep it, or enter a replacement.') : t('密钥保存在当前电脑，用于连接你选择的模型服务。', 'The key stays on this computer and is used with your chosen provider.')}><Input size="lg" type="password" autoComplete="new-password" value={draft.apiKey} disabled={!!busy} placeholder={stored?.hasKey && sameEndpoint ? t('密钥已保存', 'Key saved') : t('粘贴你的 API Key', 'Paste your API key')} onChange={event => updateAccess({ apiKey: event.target.value })} /></Field>}
        {draft.provider && <Button color="secondary" variant="outline" disabled={!!busy || catalogueState === 'loading' || !hasCredential || !draft.baseUrl.trim()} loading={catalogueState === 'loading'} onClick={() => void loadModels(!draft.apiKey.trim() && sameEndpoint ? stored : undefined)}><ArrowRotateCw />{catalogueState === 'loaded' ? t('刷新模型列表', 'Refresh models') : t('加载模型列表', 'Load models')}</Button>}
      </div>
      {(catalogueState !== 'idle' || manual) && <div className="model-onboarding-model"><Field label={t('模型', 'Model')}>{manual ? <Input size="lg" value={draft.model} disabled={!!busy} onChange={event => { setDraft(previous => ({ ...previous, model: event.target.value })); setSuccess(false); }} placeholder={t('服务方提供的具体模型 ID', 'Exact model ID from your provider')} /> : <Select<BrandedOption> size="lg" {...compactSelectProps} block optionClassName="compact-select-option model-onboarding-option" triggerClassName="model-onboarding-select" searchPlaceholder={t('搜索模型', 'Search models')} searchEmptyMessage={t('未找到模型', 'No models found')} placeholder={catalogueState === 'loading' ? t('正在加载模型…', 'Loading models…') : t('选择模型', 'Choose a model')} value={draft.model} disabled={!!busy || !models.length || catalogueState === 'loading'} options={models.map(model => ({ value: model.id, label: model.name, modelId: model.id === model.name ? undefined : model.id, provider: draft.provider || undefined }))} OptionView={ModelChoiceView} TriggerView={ModelTriggerView} onChange={option => { setDraft(previous => ({ ...previous, model: option.value })); setSuccess(false); }} />}</Field>
        {catalogueState === 'loaded' && models.length > 0 && <p className="model-testing-note">{t('列表来自服务方目录；测试通过后可确认这把密钥能使用所选模型。', 'The list comes from the provider. A successful test confirms that your key can use the selected model.')}</p>}
        {(catalogueState === 'failed' || catalogueState === 'loaded' && !models.length || manual) && <Button color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={() => { setManual(!manual); setDraft(previous => ({ ...previous, model: '' })); }}>{manual ? t('返回模型列表', 'Back to model list') : t('手动填写模型 ID', 'Enter a model ID manually')}</Button>}
        {modelIssue && <p className="model-inline-error">{t('请填写具体模型 ID，不能使用服务商名称。', 'Enter a specific model ID rather than a provider name.')}</p>}
      </div>}
      {draft.provider && <details className="model-onboarding-advanced" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary>{t('高级设置', 'Advanced settings')}</summary><div><Field label={t('连接名称', 'Connection name')}><Input size="md" value={draft.name} disabled={!!busy} maxLength={100} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} /></Field><Field label={t('服务地址', 'Endpoint URL')} hint={preset?.hint}><Input size="md" type="url" value={draft.baseUrl} disabled={!!busy} onChange={event => updateAccess({ baseUrl: event.target.value })} /></Field><Field label={t('API 协议', 'API protocol')}><Select<Option<string>> {...compactSelectProps} value={draft.api} disabled={!!busy || draft.provider === 'anthropic'} options={draft.provider === 'anthropic' ? [{ value: 'messages', label: 'Messages' }] : [{ value: 'responses', label: 'Responses' }, { value: 'chat_completions', label: 'Chat Completions' }]} onChange={option => setDraft(previous => ({ ...previous, api: option.value as ProviderSettings['api'] }))} /></Field>{draft.provider !== 'anthropic' && !usesDefaultReasoning(draft.provider) && <Field label={t('思考深度', 'Reasoning effort')}><Select<Option<string>> {...compactSelectProps} value={draft.reasoningEffort} disabled={!!busy} options={draft.provider === 'moonshot' ? [{value:'low',label:t('简短','Low')},{value:'high',label:t('深入','High')},{value:'max',label:t('充分思考','Maximum')}] : [{value:'low',label:t('简短','Low')},{value:'medium',label:t('均衡','Medium')},{value:'high',label:t('深入','High')},{value:'max',label:t('充分思考','Maximum')}]} onChange={option => setDraft(previous => ({ ...previous, reasoningEffort: option.value as Draft['reasoningEffort'] }))}/></Field>}{draft.provider === 'openrouter' && <Field label={t('应用名称（可选）', 'App name (optional)')}><Input size="md" value={draft.appTitle} disabled={!!busy} maxLength={100} onChange={event => setDraft(previous => ({ ...previous, appTitle: event.target.value }))} placeholder="SecondU" /></Field>}{preset?.docsUrl && <a href={preset.docsUrl} target="_blank" rel="noreferrer">{t('服务方接入说明', 'Provider setup guide')}</a>}</div></details>}
      <div className="model-feedback" aria-live="polite"><ErrorNotice error={error} />{notice && <p className="model-saved">{success && <Check />}{notice}</p>}</div>
      {draft.provider && <div className="model-onboarding-actions"><Button color="primary" type="submit" disabled={!!busy || !ready} loading={busy === 'test'}>{t('测试并使用', 'Test and use')}</Button><Button color="secondary" variant="ghost" disabled={!!busy || !ready} loading={busy === 'save'} onClick={() => void finish(false)}>{t('只保存连接', 'Save connection only')}</Button>{success && <Button color="secondary" variant="outline" onClick={onDone}>{t('完成', 'Done')}</Button>}</div>}
      {draft.provider && <p className="model-testing-note">{t('测试会发送一条简短请求，不包含个人资料。通过后将设为默认模型。', 'Testing sends a short request without personal data, then sets this model as the default if it succeeds.')}</p>}
    </form>
  </div>;
}
