import { financeRequest } from './api';
import { money } from './model';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { ArrowRight, ArrowRotateCw, ChevronDown, Eye, EyeOff } from '@openai/apps-sdk-ui/components/Icon';
import { Field } from '../components';
import { BrandIcon } from './BrandIcon';
import '../connectors/connectors.css';
import './Connections.css';

type ConnectionStatus = {
  provider: string;
  connected: boolean;
  status: 'disconnected' | 'awaiting_authorization' | 'refresh_required' | 'connected';
  readOnly: boolean;
  scopes?: string[];
  accountSuffixes?: string[];
  expiresAt?: string | null;
  pendingExpiresAt?: string | null;
  lastError?: { code: string; message: string } | null;
  available?: boolean;
  canSync?: boolean;
  lastSyncedAt?: string | null;
  syncStatus?: 'not_synced' | 'current' | 'stale';
  lastSyncError?: { code: string; message: string } | null;
};
type AppKeyStatus = { provider: 'moomoo'; method: 'appkey'; configured: boolean; connected: boolean; status: 'disconnected' | 'configured' | 'connected'; readOnly: true; scopeVerified: false; algorithm: string | null; lastVerifiedAt: string | null; accountSuffixes: string[]; lastSyncedAt?: string | null; syncStatus?: 'not_synced' | 'current' | 'stale'; lastSyncError?: { code: string; message: string } | null; syncedPositionCount?: number; available?: boolean };
type Authorization = { authorizationUrl: string; expiresAt: string; scopeSelectionRequired: boolean };
type Value = string | number | null | undefined;
type PreviewPosition = { code: string; name: string; currency: string | null; quantity: Value; marketPrice: Value; marketValue: Value; costPrice: Value; holdingPnl: Value; holdingPnlPct: Value };
type PreviewAccount = { accountRef: string; accountSuffix: string; cardSuffix?: string | null; unifiedCardSuffix?: string | null; securityFirm: string | null; accountType: string | null; funds: Record<string, Value>; positions: PreviewPosition[] };
type Preview = { provider: string; mode: 'preview'; readOnly: boolean; persisted: boolean; fetchedAt: string; accounts: PreviewAccount[] };
type SyncResult = { synced: true; persisted: true; readOnly: true; fetchedAt: string; accountId: string | null; unifiedCardSuffix: string | null; cardSuffix: string | null; positionCount: number; readStatus: 'current'; stateRevision: number | string };

async function connectionRequest<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  return financeRequest<T>(`/connections/moomoo/${path}`, body, body ? 'POST' : 'GET', signal);
}
const isSyncResult = (value: SyncResult) => value?.synced === true && value.persisted === true && value.readOnly === true && Number.isInteger(value.positionCount) && value.positionCount >= 0 && Number.isFinite(new Date(value.fetchedAt).getTime());
function authorizationLink(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'webapi.moomoo.com' && !url.username && !url.password && (!url.port || url.port === '443') ? url.href : null;
  } catch { return null; }
}
function displayTime(value?: string | null) {
  if (!value) return '时间未提供';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '时间未提供';
}
function amount(value: Value, hidden: boolean, currency?: Value, quantity = false) {
  if (hidden) return '••••';
  if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) return '—';
  const raw = String(value);
  const [integer, fraction] = raw.split('.');
  const formatted = quantity ? `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}` : money(value);
  return `${formatted}${currency ? ` ${currency}` : ''}`;
}
function PreviewAccounts({ preview, hidden }: { preview: Preview; hidden: boolean }) {
  const headingId = useId();
  return <section className="connections-preview" aria-labelledby={headingId}>
    <div className="connections-preview-heading"><h4 id={headingId}>本次读取</h4><time dateTime={preview.fetchedAt} title="北京时间">{displayTime(preview.fetchedAt)}</time></div>
    <p className="connector-form-help">预览不写入工作台。价格与金额按本次接口返回展示。</p>
    {preview.accounts.length === 0 ? <p className="connections-empty">本次没有读取到账户，请检查连接允许查询的具体账户。</p> : preview.accounts.map(account => <article className="connections-preview-account" key={account.accountRef}>
      <header><strong>{account.unifiedCardSuffix ? `综合账户 ${hidden ? '••••' : account.unifiedCardSuffix}` : account.cardSuffix ? `业务账户 ${hidden ? '••••' : account.cardSuffix}` : '账户预览'}</strong>{account.unifiedCardSuffix && account.cardSuffix && <span>业务账户 {hidden ? '••••' : account.cardSuffix}</span>}{account.securityFirm && <span>{account.securityFirm}</span>}</header>
      <dl className="connector-detail-facts connections-funds">
        <div><dt>账户净资产</dt><dd>{amount(account.funds.total_assets, hidden, account.funds.currency)}</dd></div>
        <div><dt>现金</dt><dd>{amount(account.funds.cash, hidden, account.funds.currency)}</dd></div>
        <div><dt>证券资产</dt><dd>{amount(account.funds.securities_assets, hidden, account.funds.currency)}</dd></div>
        <div><dt>基金资产</dt><dd>{amount(account.funds.funds_assets, hidden, account.funds.currency)}</dd></div>
      </dl>
      <div className="connections-positions-heading"><strong>持仓</strong><span>{account.positions.length} 项</span></div>
      {account.positions.length === 0 ? <p className="connector-form-help">本次未返回持仓。</p> : <div className="connections-positions">{account.positions.map((position, index) => <details className="connections-position" key={`${position.code}-${index}`}>
        <summary><span className="connections-position-name"><strong>{position.code}</strong><span>{position.name}</span></span><span className="connections-position-value"><strong>{amount(position.marketValue, hidden, position.currency)}</strong><span>数量 {amount(position.quantity, hidden, undefined, true)}</span></span><ChevronDown aria-hidden="true" /></summary>
        <dl className="connector-detail-facts connections-position-details">
          <div><dt>现价</dt><dd>{amount(position.marketPrice, hidden, position.currency)}</dd></div>
          <div><dt>成本价</dt><dd>{amount(position.costPrice, hidden, position.currency)}</dd></div>
          <div><dt>持仓盈亏</dt><dd>{amount(position.holdingPnl, hidden, position.currency)}</dd></div>
          <div><dt>盈亏比例</dt><dd>{amount(position.holdingPnlPct, hidden)}{!hidden && position.holdingPnlPct != null ? '%' : ''}</dd></div>
        </dl>
      </details>)}</div>}
    </article>)}
  </section>;
}

function isPreview(value: Preview) {
  return value?.mode === 'preview' && value.readOnly === true && value.persisted === false && Array.isArray(value.accounts);
}

type ConnectionActions = { hidden: boolean; onBack: () => void; onToggleAmounts: () => void };
function AppKeyConnection({ hidden, onBack, onToggleAmounts }: ConnectionActions) {
  const [status, setStatus] = useState<AppKeyStatus | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [appKeyId, setAppKeyId] = useState(''), [hasFile, setHasFile] = useState(false), [replaceOpen, setReplaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false), [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<'configure' | 'preview' | 'sync' | null>(null);
  const [error, setError] = useState(''), [statusError, setStatusError] = useState('');
  const alive = useRef(false), locked = useRef(false), file = useRef<File | null>(null), fileInput = useRef<HTMLInputElement>(null);
  const statusController = useRef<AbortController | null>(null), actionController = useRef<AbortController | null>(null);
  const lastAction = useRef<'configure' | 'preview' | 'sync' | null>(null);
  const loadStatus = useCallback(async () => {
    statusController.current?.abort();
    const controller = new AbortController(); statusController.current = controller;
    setLoading(true);
    try {
      const next = await connectionRequest<AppKeyStatus>('appkey/status', undefined, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      if (next.method !== 'appkey' || typeof next.configured !== 'boolean' || typeof next.connected !== 'boolean') throw new Error('连接状态返回不完整，请稍后重试。');
      setStatus(next); setStatusError('');
      if (!next.connected) setPreview(null);
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) setStatusError(failure instanceof Error ? failure.message : '连接状态暂不可用。');
    } finally { if (alive.current && !controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void loadStatus();
    const onFocus = () => { if (!locked.current && document.visibilityState === 'visible') void loadStatus(); };
    window.addEventListener('focus', onFocus);
    return () => {
      alive.current = false; statusController.current?.abort(); actionController.current?.abort(); file.current = null;
      if (fileInput.current) fileInput.current.value = '';
      window.removeEventListener('focus', onFocus);
    };
  }, [loadStatus]);
  const clearCredentials = () => { file.current = null; if (fileInput.current) fileInput.current.value = ''; if (alive.current) { setAppKeyId(''); setHasFile(false); } };
  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    file.current = null; setHasFile(false); setError('');
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.size || selected.size > 16 * 1024) { event.target.value = ''; setError('请选择不超过 16 KiB 的非空私钥文件。'); return; }
    file.current = selected; setHasFile(true);
  };
  const fetchPreview = async (controller: AbortController) => {
    const next = await connectionRequest<Preview>('appkey/preview', { currency: 'USD' }, controller.signal);
    if (!isPreview(next)) throw new Error('账户预览返回不完整，请重新读取。');
    if (!alive.current || controller.signal.aborted) return;
    setPreview(next);
    setStatus(current => current ? { ...current, connected: true, status: 'connected', lastVerifiedAt: next.fetchedAt, accountSuffixes: next.accounts.map(account => account.accountSuffix) } : current);
    await loadStatus();
  };
  const beginAction = (kind: 'configure' | 'preview' | 'sync') => {
    lastAction.current = kind;
    locked.current = true; statusController.current?.abort(); setLoading(false); setBusy(kind); setError('');
    if (kind === 'preview') { setPreview(null); setStatus(current => current ? { ...current, connected: false, status: current.configured ? 'configured' : 'disconnected' } : current); }
    const controller = new AbortController(); actionController.current = controller;
    return controller;
  };
  const finishAction = () => { locked.current = false; actionController.current = null; if (alive.current) setBusy(null); };
  const configure = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    lastAction.current = 'configure';
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(appKeyId.trim())) { setError('请输入有效的 AppKey ID。'); return; }
    const selected = file.current;
    if (!selected || selected.size > 16 * 1024) { setError('请选择不超过 16 KiB 的私钥文件。'); return; }
    const controller = beginAction('configure');
    let privateKeyPem = '';
    try {
      privateKeyPem = await selected.text();
      if (!alive.current || controller.signal.aborted) return;
      if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\r?\n/.test(privateKeyPem)) throw new Error('请选择 PEM 格式的私钥文件。');
      let next: AppKeyStatus;
      try { next = await connectionRequest<AppKeyStatus>('appkey/configure', { appKeyId: appKeyId.trim(), privateKeyPem }, controller.signal); }
      finally { privateKeyPem = ''; clearCredentials(); }
      if (!alive.current || controller.signal.aborted) return;
      if (next.method !== 'appkey' || next.configured !== true) throw new Error('配置结果暂无法确认，请检查连接状态。');
      setStatus(next); setStatusError(''); setPreview(null); setReplaceOpen(false); setBusy('preview');
      lastAction.current = 'preview';
      await fetchPreview(controller);
      if (alive.current && !controller.signal.aborted) setSettingsOpen(false);
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) { setError(failure instanceof Error ? failure.message : '配置或预览未完成，请重试。'); await loadStatus(); }
    } finally { privateKeyPem = ''; clearCredentials(); finishAction(); }
  };
  const readPreview = async () => {
    if (locked.current) return;
    const controller = beginAction('preview');
    try { await fetchPreview(controller); }
    catch (failure) { if (alive.current && !controller.signal.aborted) { setError(failure instanceof Error ? failure.message : '账户预览读取失败，请重试。'); await loadStatus(); } }
    finally { finishAction(); }
  };
  const sync = async () => {
    if (locked.current) return;
    const controller = beginAction('sync');
    try {
      const next = await connectionRequest<SyncResult>('appkey/sync', {}, controller.signal);
      if (!isSyncResult(next)) throw new Error('更新结果暂无法确认，请检查连接状态。');
      if (!alive.current || controller.signal.aborted) return;
      setStatus(current => current ? { ...current, connected: true, status: 'connected', lastSyncedAt: next.fetchedAt, syncStatus: 'current', lastSyncError: null, syncedPositionCount: next.positionCount } : current);
      window.dispatchEvent(new Event('finance:changed'));
      await loadStatus();
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) { setError(failure instanceof Error ? failure.message : '工作台更新未完成，请重试。'); await loadStatus(); }
    } finally { finishAction(); }
  };
  const connected = status?.connected === true;
  const unavailable = status?.available === false;
  const stale = status?.syncStatus === 'stale';
  const statusLabel = unavailable ? '示例空间' : busy === 'configure' ? '正在连接' : busy === 'sync' ? '正在更新' : busy === 'preview' ? '正在读取' : loading && !status ? '正在检查' : statusError ? '状态待检查' : stale ? '更新未完成' : connected ? '已连接' : status?.configured ? '待验证' : status ? '未配置' : '状态待检查';
  const visibleError = error || statusError || (stale ? status?.lastSyncError?.message || '本次更新未完成，已保留上次数据。' : '');
  const accountCount = status?.accountSuffixes?.length;
  const openSettings = () => { setSettingsOpen(true); if (status?.configured) setReplaceOpen(true); };
  const retryKind = error ? lastAction.current : statusError ? 'status' : stale ? 'sync' : null;
  const retry = () => {
    if (retryKind === 'configure') openSettings();
    else if (retryKind === 'preview') void readPreview();
    else if (retryKind === 'sync') void sync();
    else { setError(''); void loadStatus(); }
  };
  const form = <div className="connector-form-dialog connections-form"><form onSubmit={configure} autoComplete="off">
    <Field label="AppKey ID"><Input id="connections-appkey-id" value={appKeyId} onChange={event => { setAppKeyId(event.target.value); setError(''); }} placeholder="输入 AppKey ID" maxLength={200} autoComplete="off" spellCheck={false} disabled={Boolean(busy)} required /></Field>
    <div className="form-field"><label className="field-label" htmlFor="connections-appkey-file">私钥文件</label><input ref={fileInput} id="connections-appkey-file" className="connections-file-input" type="file" accept=".pem,.key,.txt,text/plain,application/x-pem-file" onChange={chooseFile} disabled={Boolean(busy)} aria-describedby="connections-appkey-file-note" required /><p id="connections-appkey-file-note" className="connector-form-help">PEM 格式，最大 16 KiB。</p></div>
    <div className="dialog-actions">{!status?.configured && <Button color="secondary" variant="ghost" disabled={Boolean(busy)} onClick={onBack}>返回</Button>}<Button type="submit" color="primary" loading={busy === 'configure' || busy === 'preview'} disabled={!hasFile || !appKeyId.trim() || loading || busy === 'sync'}>保存并验证</Button></div>
  </form></div>;
  if (status && !status.configured && !unavailable) return <>
    {form}
    {visibleError && <Alert color="danger" variant="soft" title="连接需要处理" description={visibleError} />}
  </>;
  return <>
    <p className="connector-form-help" role="status">AppKey：{statusLabel}</p>
    <dl className="connector-detail-facts" aria-label="Moomoo 连接概况">
      <div><dt>上次更新</dt><dd>{status?.lastSyncedAt ? <time dateTime={status.lastSyncedAt} title="北京时间">{displayTime(status.lastSyncedAt)}</time> : status ? '尚未更新' : '—'}</dd></div>
      <div><dt>账户</dt><dd>{accountCount ? `${accountCount} 个` : status?.lastVerifiedAt ? '0 个' : '—'}</dd></div>
      <div><dt>持仓</dt><dd>{status?.lastSyncedAt && typeof status.syncedPositionCount === 'number' ? `${status.syncedPositionCount} 项` : '—'}</dd></div>
    </dl>
    <div className="dialog-actions">
      <Button color="secondary" variant="ghost" disabled={Boolean(busy)} onClick={onBack}>返回</Button>
      {(connected || preview) && <Button color="secondary" variant="ghost" onClick={onToggleAmounts}>{hidden ? <EyeOff /> : <Eye />}{hidden ? '显示金额' : '隐藏金额'}</Button>}
      {status?.configured ? <Button color="primary" loading={Boolean(busy)} disabled={unavailable || loading && !busy} onClick={() => connected || stale ? void sync() : void readPreview()}><ArrowRotateCw />{connected || stale ? '更新账户' : '验证连接'}</Button> : status ? <Button color="primary" disabled={unavailable || Boolean(busy) || loading} onClick={openSettings}>配置连接<ArrowRight /></Button> : <Button color="secondary" variant="outline" loading={loading} onClick={() => void loadStatus()}><ArrowRotateCw />检查连接</Button>}
    </div>
    {visibleError && <div className="connections-error"><Alert color="danger" variant="soft" title="连接需要处理" description={visibleError} /><Button color="secondary" variant="outline" loading={loading || Boolean(busy)} onClick={retry}>{retryKind === 'configure' ? '重新填写配置' : retryKind === 'preview' ? '重新读取' : retryKind === 'sync' ? '重新更新' : '重新检查'}</Button></div>}
    <details className="connector-oauth-config connections-settings" open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)}>
      <summary><span>连接设置</span><ChevronDown aria-hidden="true" /></summary>
      <div>
        {unavailable ? <p className="connector-form-help">进入个人空间后，可以连接自己的账户。</p> : status?.configured ? <>
          <div className="connector-form-service"><span className="connector-service-icon"><BrandIcon id="moomoo" /></span><p>AppKey：{status.lastVerifiedAt ? `最近验证 ${displayTime(status.lastVerifiedAt)}` : '已保存配置，等待验证。'}</p></div>
          <div className="dialog-actions"><Button color="secondary" variant="ghost" loading={loading} disabled={Boolean(busy)} onClick={() => { setError(''); void loadStatus(); }}>检查状态</Button><Button color="secondary" variant="outline" loading={busy === 'preview'} disabled={Boolean(busy && busy !== 'preview')} onClick={() => { setPreviewOpen(true); void readPreview(); }}>读取账户预览</Button><Button color="secondary" variant="ghost" disabled={Boolean(busy)} aria-expanded={replaceOpen} aria-controls="connections-replace-form" onClick={() => { clearCredentials(); setReplaceOpen(value => !value); }}>更换 AppKey</Button></div>
          {replaceOpen && <div id="connections-replace-form">{form}</div>}
        </> : status ? form : <p className="connector-form-help">先检查连接状态，再配置 AppKey。</p>}
      </div>
    </details>
    {preview && <details className="connector-oauth-config" open={previewOpen} onToggle={event => setPreviewOpen(event.currentTarget.open)}><summary><span>账户预览<span className="connections-summary-meta">{preview.accounts.length} 个账户</span></span><ChevronDown aria-hidden="true" /></summary><div><PreviewAccounts preview={preview} hidden={hidden} /></div></details>}
  </>;
}

function OAuthConnection({ hidden, onToggleAmounts }: Pick<ConnectionActions, 'hidden' | 'onToggleAmounts'>) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'preview' | 'sync' | null>(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const alive = useRef(false), statusController = useRef<AbortController | null>(null);
  const loadStatus = useCallback(async () => {
    statusController.current?.abort();
    const controller = new AbortController();
    statusController.current = controller;
    setLoading(true);
    try {
      const next = await connectionRequest<ConnectionStatus>('status', undefined, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      setStatus(next); setStatusError('');
      if (next.status === 'connected') setAuthorization(null);
      if (!next.connected) setPreview(null);
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) setStatusError(failure instanceof Error ? failure.message : '连接状态暂不可用。');
    } finally { if (alive.current && !controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void loadStatus();
    const onFocus = () => { if (document.visibilityState === 'visible') void loadStatus(); };
    window.addEventListener('focus', onFocus);
    return () => { alive.current = false; statusController.current?.abort(); window.removeEventListener('focus', onFocus); };
  }, [loadStatus]);
  useEffect(() => {
    if (!authorization) return;
    const remaining = new Date(authorization.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) { setAuthorization(null); return; }
    const timer = window.setTimeout(() => { setAuthorization(null); void loadStatus(); }, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [authorization, loadStatus]);
  const start = async () => {
    setBusy('start'); setError(''); setAuthorization(null);
    try {
      const next = await connectionRequest<Authorization>('start', {});
      if (!authorizationLink(next.authorizationUrl)) throw new Error('未取得有效的 Moomoo 官方授权链接，请重试。');
      if (!Number.isFinite(new Date(next.expiresAt).getTime()) || new Date(next.expiresAt).getTime() <= Date.now()) throw new Error('授权链接已过期，请重新准备连接。');
      if (alive.current) { setAuthorization(next); setPreview(null); await loadStatus(); }
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '未能准备连接，请重试。'); }
    finally { if (alive.current) setBusy(null); }
  };
  const readPreview = async () => {
    setBusy('preview'); setError('');
    try {
      const next = await connectionRequest<Preview>('preview', { currency: 'USD' });
      if (next.mode !== 'preview' || next.readOnly !== true || next.persisted !== false || !Array.isArray(next.accounts)) throw new Error('账户预览返回不完整，请重新读取。');
      if (alive.current) setPreview(next);
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : '账户预览读取失败，请重试。'); await loadStatus(); } }
    finally { if (alive.current) setBusy(null); }
  };
  const sync = async () => {
    if (busy) return;
    setBusy('sync'); setError('');
    try {
      const next = await connectionRequest<SyncResult>('sync', {});
      if (!isSyncResult(next)) throw new Error('更新结果暂无法确认，请检查连接状态。');
      if (!alive.current) return;
      setStatus(current => current ? { ...current, connected: true, status: 'connected', lastSyncedAt: next.fetchedAt, syncStatus: 'current', lastSyncError: null } : current);
      window.dispatchEvent(new Event('finance:changed'));
      await loadStatus();
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : '账户更新未完成，请重试。'); await loadStatus(); } }
    finally { if (alive.current) setBusy(null); }
  };
  const awaiting = status?.status === 'awaiting_authorization';
  const connected = status?.connected === true && status.readOnly === true && !awaiting;
  const unavailable = status?.available === false;
  const href = authorization && authorizationLink(authorization.authorizationUrl);
  const canSync = status?.canSync === true;
  const statusLabel = unavailable ? '示例空间' : busy === 'sync' ? '正在更新' : loading && !status ? '正在检查' : statusError ? '状态待检查' : status?.syncStatus === 'stale' ? '更新未完成' : awaiting || authorization ? '等待授权' : status?.status === 'refresh_required' ? '需重新授权' : connected ? '已授权' : status ? '未授权' : '状态待检查';
  const visibleError = error || statusError || status?.lastSyncError?.message || status?.lastError?.message;
  return <>
    <div className="connector-form-service"><span className="connector-service-icon"><BrandIcon id="moomoo" /></span><p>网页登录授权：<span role="status">{statusLabel}</span></p></div>
    <p className="connector-form-help">{status?.lastSyncedAt ? `上次更新 ${displayTime(status.lastSyncedAt)}` : canSync ? '授权后可预览并更新账户与持仓。' : '当前连接支持账户预览，更新账户请使用 AppKey。'}</p>
    {unavailable ? <p className="connector-form-help">进入个人空间后，可以连接自己的账户。</p> : !connected && <p className="connector-form-help connections-scope">授权时选择具体账户和 <code>trade:read</code>，<code>quote:read</code> 可选；取消交易、写入和“全部账户”权限。</p>}
    {connected && Boolean(status?.accountSuffixes?.length) && <p className="connector-form-help">已授权 {status?.accountSuffixes?.length} 个账户</p>}
    <div className="dialog-actions">
      {(connected || preview) && <Button color="secondary" variant="ghost" onClick={onToggleAmounts}>{hidden ? <EyeOff /> : <Eye />}{hidden ? '显示金额' : '隐藏金额'}</Button>}
      {connected && canSync && <Button color="primary" loading={busy === 'sync'} disabled={Boolean(busy && busy !== 'sync')} onClick={() => void sync()}><ArrowRotateCw />更新账户</Button>}
      {connected ? <Button color="secondary" variant="outline" loading={busy === 'preview'} disabled={Boolean(busy && busy !== 'preview')} onClick={() => void readPreview()}>{preview ? '重新读取预览' : '读取账户预览'}</Button> : href ? <ButtonLink color="secondary" variant="outline" href={href} target="_blank" rel="noopener noreferrer" external>前往 Moomoo 授权<ArrowRight /></ButtonLink> : <Button color="secondary" variant="outline" loading={busy === 'start'} disabled={unavailable || loading || Boolean(busy && busy !== 'start')} onClick={() => void start()}>{awaiting || status?.status === 'refresh_required' ? '重新授权' : '准备授权'}</Button>}
      <Button color="secondary" variant="ghost" loading={loading} disabled={Boolean(busy)} onClick={() => { setError(''); void loadStatus(); }}><ArrowRotateCw />检查授权</Button>
    </div>
    {authorization && <p className="connector-form-help">链接有效至 {displayTime(authorization.expiresAt)}。授权后返回读取预览。</p>}
    {awaiting && !authorization && <p className="connector-form-help">完成授权后点击“检查授权”；链接失效时可重新授权。</p>}
    {visibleError && <div className="connections-error"><Alert color="danger" variant="soft" title="预览连接未完成" description={visibleError} /><Button color="secondary" variant="outline" loading={loading || Boolean(busy)} onClick={() => { if (statusError) { setError(''); void loadStatus(); } else if (connected) void readPreview(); else void start(); }}>{statusError ? '重新检查' : connected ? '重新读取' : '重新授权'}</Button></div>}
    {preview && <PreviewAccounts preview={preview} hidden={hidden} />}
  </>;
}

export function MoomooConnection({ hidden, onBack, onToggleAmounts }: ConnectionActions) {
  const [oauthOpen, setOauthOpen] = useState(false);
  return <>
      <AppKeyConnection hidden={hidden} onBack={onBack} onToggleAmounts={onToggleAmounts} />
      <details className="connector-oauth-config" open={oauthOpen} onToggle={event => setOauthOpen(event.currentTarget.open)}><summary><span>其他连接方式<span className="connections-summary-meta">网页登录授权</span></span><ChevronDown aria-hidden="true" /></summary><div>{oauthOpen && <OAuthConnection hidden={hidden} onToggleAmounts={onToggleAmounts} />}</div></details>
  </>;
}
