import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Download } from '@openai/apps-sdk-ui/components/Icon';
import { CircularProgress, LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator';
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { desktopUpdates, downloadPercent, hasSessionDrafts, prepareDesktopQuit, unavailableUpdateState, unsavedChanges, updateAction, updateIndicatorVisible, type UpdateState } from './desktop-updates';
import { t, getLocale } from './i18n';
import './updates.css';

export function useDesktopUpdates() {
  return useSyncExternalStore(desktopUpdates.subscribe, desktopUpdates.getSnapshot, () => unavailableUpdateState);
}
function phaseLabel(state: UpdateState) {
  const labels = {
    idle: t('尚未检查更新', 'Updates have not been checked'),
    checking: t('正在检查更新…', 'Checking for updates…'),
    available: t('有新版本可用', 'A new version is available'),
    downloading: t('正在下载更新…', 'Downloading the update…'),
    downloaded: t('更新已下载', 'The update has been downloaded'),
    extracting: t('正在准备更新…', 'Preparing the update…'),
    ready: t('更新已就绪，重启后生效', 'The update is ready. Restart to apply it'),
    'awaiting-relaunch': t('更新已就绪，等待重启', 'The update is ready and waiting to restart'),
    installing: t('正在安装更新…', 'Installing the update…'),
    'up-to-date': t('已是最新版本', 'You are up to date'),
    'no-update': noUpdateLabel(state),
    error: t('更新未完成', 'The update could not be completed'),
    unavailable: t('当前环境不支持应用内更新', 'In-app updates are unavailable here'),
  };
  return labels[state.phase];
}
function noUpdateLabel(state: UpdateState) {
  switch (state.noUpdateReason) {
    case 'latest': return t('已是最新版本', 'You are up to date');
    case 'newer-than-feed': return t('当前版本比更新渠道中的版本新', 'This version is newer than the update channel');
    case 'system-too-old': return t('新版本需要更新的 macOS', 'The new version requires a newer macOS');
    case 'system-too-new': return t('新版本暂不支持当前 macOS', 'The new version does not support this macOS yet');
    case 'unsupported-architecture': return t('没有适用于这台 Mac 的更新', 'No update is available for this Mac');
    default: return t('未找到可安装的更新', 'No installable update was found');
  }
}
function errorLabel(state: UpdateState) {
  switch (state.errorReason) {
    case 'network': return t('无法连接更新服务，请检查网络后重试。', 'Unable to reach the update service. Check your connection and retry.');
    case 'signature': return t('更新未通过完整性验证，已停止安装。请重新检查更新。', 'The update could not be verified. Installation has stopped. Check for updates again.');
    case 'configuration': return t('此版本尚未配置更新服务。', 'This build does not have an update service configured.');
    case 'install-location': return t('请将 SecondU 移到“应用程序”后重试。', 'Move SecondU to Applications and retry.');
    case 'permission': return t('没有替换应用的权限。请在系统更新窗口中查看详情。', 'Permission to replace the app was denied. See the native update window for details.');
    case 'installation': return t('更新安装未完成，请重试。', 'Installation did not finish. Please retry.');
    case 'updater-unavailable': return t('更新服务暂不可用，请稍后重试。', 'The update service is unavailable. Please retry later.');
    case 'invalid-state': return t('当前更新状态无法继续，请重新检查更新。', 'This update cannot continue in its current state. Check for updates again.');
    case 'relaunch': return t('重启未完成。请保存修改，并等待当前操作结束后重试。', 'Restart did not finish. Save your changes and wait for current operations to finish before retrying.');
    default: return t('更新未完成，请重试。', 'The update could not be completed. Please retry.');
  }
}
const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} MB`;
function DownloadStatus({ state, compact = false }: { state: UpdateState; compact?: boolean }) {
  const percent = downloadPercent(state);
  const bytes = state.downloadedBytes;
  return <span className="update-download-progress">
    {percent === undefined ? <LoadingIndicator size={compact ? 17 : 20} aria-hidden /> : <CircularProgress progress={percent} size={compact ? 19 : 22} trackActiveColor="var(--color-background-info-solid)" aria-hidden />}
    {!compact && <span>{percent !== undefined ? `${percent}%` : t('下载中', 'Downloading')}{typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 && <small>{formatBytes(bytes)}{state.totalBytes && state.totalBytes > 0 ? ` / ${formatBytes(state.totalBytes)}` : ''}</small>}</span>}
  </span>;
}

export function UpdateSettings() {
  const state = useDesktopUpdates();
  const [pending, setPending] = useState(false);
  const action = updateAction(state);
  const restarting = ['ready', 'awaiting-relaunch'].includes(state.phase);
  const actionLabel = action === 'show' ? restarting ? t('重启并更新…', 'Restart and update…') : t('查看更新', 'View update') : action === 'refresh' ? t('重新读取', 'Reload status') : action === 'check' ? state.phase === 'error' ? t('重试', 'Retry') : t('检查更新', 'Check for updates') : state.phase === 'checking' ? t('正在检查…', 'Checking…') : state.phase === 'downloading' ? t('正在下载…', 'Downloading…') : state.phase === 'installing' ? t('正在安装…', 'Installing…') : t('正在准备…', 'Preparing…');
  const lastChecked = state.lastCheckedAt && new Date(state.lastCheckedAt);
  async function act() {
    if (!action || pending) return;
    setPending(true);
    try { await (action === 'check' ? desktopUpdates.check() : action === 'show' ? desktopUpdates.show() : desktopUpdates.refresh()); }
    finally { setPending(false); }
  }
  return <section id="settings-updates" className="update-settings" aria-labelledby="settings-updates-title" tabIndex={-1}>
    <div className="update-settings-heading"><div><h3 id="settings-updates-title">{t('应用更新', 'App updates')}</h3><p>SecondU{state.currentVersion && ` ${state.currentVersion}`}</p></div>
      {state.supported && <Button color={restarting ? 'primary' : 'secondary'} variant={restarting ? 'solid' : 'outline'} size="sm" disabled={!action || pending} loading={pending} onClick={() => void act()}>{actionLabel}</Button>}
    </div>
    {!state.supported ? <p className="update-settings-note">{t('请在 SecondU 桌面正式包中检查和安装更新。', 'Check and install updates in a packaged SecondU desktop app.')}</p> : <>
      <div className="update-settings-state" role="status" aria-live="polite"><span>{phaseLabel(state)}{state.updateVersion && !['idle', 'checking', 'up-to-date', 'no-update', 'error', 'unavailable'].includes(state.phase) && <span className="update-target-version">{state.updateVersion}</span>}</span>{state.phase === 'downloading' && <DownloadStatus state={state} />}</div>
      {lastChecked && Number.isFinite(lastChecked.getTime()) && <p className="update-settings-note">{t('上次检查：', 'Last checked: ')}{lastChecked.toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      {state.phase === 'error' && <div className="update-settings-error" role="alert"><Alert color="danger" variant="soft" description={errorLabel(state)} /></div>}
      <p className="update-settings-note">{restarting ? t('重启前会检查未保存的修改和正在执行的任务。', 'Unsaved changes and running tasks are checked before restarting.') : ['downloading', 'downloaded', 'extracting', 'installing'].includes(state.phase) ? t('下载、取消和安装在更新窗口中进行。', 'Download, cancellation and installation take place in the update window.') : t('自动检查新版本，下载与重启由你确认。', 'New versions are checked automatically. You confirm downloading and restarting.')}</p>
    </>}
  </section>;
}

export function UpdateIndicator({ compact = false }: { compact?: boolean }) {
  const state = useDesktopUpdates();
  const [pending, setPending] = useState(false);
  if (!updateIndicatorVisible(state)) return null;
  const restarting = ['ready', 'awaiting-relaunch'].includes(state.phase);
  const percent = downloadPercent(state);
  const downloading = state.phase === 'downloading';
  const preparing = ['downloaded', 'extracting', 'installing'].includes(state.phase);
  const label = restarting ? t('重启完成更新', 'Restart to finish updating') : downloading ? t(`正在下载更新${percent === undefined ? '' : `，${percent}%`}`, `Downloading update${percent === undefined ? '' : `, ${percent}%`}`) : preparing ? phaseLabel(state) : t('有可用更新', 'Update available');
  const show = async () => { if (!state.canShow || pending) return; setPending(true); try { await desktopUpdates.show(); } finally { setPending(false); } };
  return <Tooltip content={compact ? label : null} side="right"><Button color="info" variant="solid" size="2xs" iconSize="sm" className={`sidebar-update-indicator ${compact ? 'is-compact' : ''}`} data-progress={downloading && percent !== undefined ? '' : undefined} disabled={!state.canShow || state.phase === 'installing' || pending} aria-label={label} onClick={() => void show()}><span className="sidebar-update-contents"><span className="sidebar-update-symbol" aria-hidden>{downloading ? percent === undefined ? <LoadingIndicator size={16} /> : <CircularProgress progress={percent} size={16} strokeWidth={2} trackActiveColor="currentColor" trackColor="color-mix(in srgb, currentColor 25%, transparent)" /> : preparing ? <LoadingIndicator size={16} /> : <Download width={16} height={16} />}</span>{!compact && <span className="sidebar-update-label" aria-hidden><span>{downloading && percent !== undefined ? `${percent}%` : t('更新', 'Update')}</span></span>}</span></Button></Tooltip>;
}

/** One root-level guard survives startup, workspace changes and error screens. */
export function DesktopQuitGuard() {
  const [frozen, setFrozen] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bridge = window.hitherDesktop?.updates;
    if (!bridge) return;
    let blocked = false;
    let focus: HTMLElement | null = null;
    let inert: Array<[HTMLElement, boolean]> = [];
    const blockInput = (event: Event) => { if (blocked) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const inputEvents = ['keydown', 'pointerdown', 'click', 'submit', 'beforeinput'];
    for (const name of inputEvents) document.addEventListener(name, blockInput, true);
    const release = () => {
      blocked = false;
      for (const [element, wasInert] of inert) element.inert = wasInert;
      inert = [];
      flushSync(() => setFrozen(false));
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
    const unprepare = bridge.onPrepareToQuit(() => prepareDesktopQuit(() => {
      const state = unsavedChanges.read();
      return { unsaved: state.unsaved || hasSessionDrafts(sessionStorage), busy: state.busy };
    }, () => {
      if (blocked) return;
      blocked = true;
      focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      inert = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement).map(element => [element, element.inert]);
      for (const [element] of inert) element.inert = true;
      flushSync(() => setFrozen(true));
      overlay.current?.focus({ preventScroll: true });
    }));
    const uncancel = bridge.onQuitCancelled(release);
    return () => { unprepare(); uncancel(); for (const name of inputEvents) document.removeEventListener(name, blockInput, true); for (const [element, wasInert] of inert) element.inert = wasInert; };
  }, []);
  return frozen ? createPortal(<div className="desktop-quit-overlay"><div ref={overlay} tabIndex={-1} role="status" aria-live="polite"><LoadingIndicator size={24} /><strong>{t('正在准备关闭应用…', 'Preparing to close the app…')}</strong><p>{t('正在保存状态并停止本机服务。', 'Finishing local work and stopping the local service.')}</p></div></div>, document.body) : null;
}
