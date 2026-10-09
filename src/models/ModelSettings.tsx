import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, ModelConnection, ModelConnectionList, ProviderSettings } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Plus, ApiKey, Check, Edit, Trash, DotsHorizontalMoreMenu } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, when } from '../components';
import { api, write, messageOf } from '../api';
import { t } from '../i18n';
import { useUnsavedChanges } from '../useUnsavedChanges';
import { modelIdIssue } from '../../shared/model-validation.mjs';
import { ProviderMark, protocolName } from './providers';
import { ModelOnboarding } from './ModelOnboarding';
import './models.css';

type TestResult = { ok: boolean; at: string; message: string; latencyMs?: number };
function modelIssueMessage(provider: ProviderSettings['provider'], model: string) {
  const issue = modelIdIssue(provider, model);
  return issue === 'provider_name' ? t('请填写具体模型 ID，不能填写服务商名称。', 'Enter a specific model ID, not the provider name.') : issue === 'openrouter_format' ? t('请填写 OpenRouter 完整模型 ID，格式通常为提供方/模型。', 'Enter a complete OpenRouter model ID, usually provider/model.') : '';
}

export function ModelSettings({ data, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> }) {
  const [connections, setConnections] = useState<ModelConnection[]>(data.modelConnections || []);
  const [defaultId, setDefaultId] = useState(data.defaultConnectionId || '');
  const [onboarding, setOnboarding] = useState<{ connection?: ModelConnection; key: number } | undefined>(() => data.modelConnections?.some(connection => connection.hasKey) ? undefined : { key: 0 });
  const [busy, setBusy] = useState('');
  useUnsavedChanges({ unsaved: false, busy: !!busy });
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
  async function saved(connection: ModelConnection) { setError(''); setConnections(current => current.some(item => item.id === connection.id) ? current.map(item => item.id === connection.id ? connection : item) : [...current, connection]); await refresh(); }
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
  function edit(connection?: ModelConnection) { setError(''); setNotice(''); setOnboarding({ connection, key: ++sequence.current }); }
  async function manage() {
    if (!management || busy) return;
    const {connection,kind}=management;setBusy(`${connection.id}:${kind}`);setError('');setNotice('');
    try {
      if(kind==='delete'){await write(`/model-connections/${connection.id}`,{},'DELETE');setConnections(current=>current.filter(item=>item.id!==connection.id));setNotice(t('连接已删除。','Connection deleted.'));}
      else {const updated=await write<ModelConnection>(`/model-connections/${connection.id}`,{clearKey:true},'PUT');setConnections(current=>current.map(item=>item.id===updated.id?updated:item));setNotice(t('密钥已移除，模型配置已保留。','The key was removed. Model settings are unchanged.'));}
      setManagement(undefined);await refresh();
    } catch(err){setError(messageOf(err));} finally {setBusy('');}
  }

  if (onboarding) return <ModelOnboarding key={onboarding.key} initialConnection={onboarding.connection} onSaved={saved} onDone={() => setOnboarding(undefined)} />;
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
    <p className="model-local-note">{t('Agent 默认使用全局设置，也可在其模型页单独指定。', 'Agents use the global default unless you choose a connection on their Model page.')}</p>
    <p className="model-local-note">{t('密钥只保存在当前电脑。', 'Keys stay on this computer.')}</p>
    {management&&<Dialog title={management.kind==='key'?t('移除密钥','Remove key'):t('删除连接','Delete connection')} onClose={()=>{if(!busy)setManagement(undefined);}}><div className="model-management-dialog"><p>{management.kind==='key'?t(`移除“${management.connection.name}”的密钥？模型设置会保留，使用前需重新填写。`,`Remove the key for “${management.connection.name}”? Its model settings remain; add a key again before using it.`):t(`删除“${management.connection.name}”及其本机密钥？`,`Delete “${management.connection.name}” and its locally saved key?`)}</p><ErrorNotice error={error}/><div><Button color="secondary" variant="ghost" disabled={!!busy} onClick={()=>setManagement(undefined)}>{t('取消','Cancel')}</Button><Button color="danger" disabled={!!busy} loading={!!busy} onClick={()=>void manage()}>{management.kind==='key'?t('移除密钥','Remove key'):t('删除连接','Delete connection')}</Button></div></div></Dialog>}
  </div>;
}
