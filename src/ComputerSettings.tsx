import { useState } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ChevronDown, Desktop, Reload } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap } from '../shared/contracts';
import { ErrorNotice, when } from './components';
import { messageOf, write } from './api';
import { t } from './i18n';
import { RemoteComputers } from './remote/RemoteComputers';
import './computer-settings.css';

export function ComputerSettings({ data, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> }) {
  const [tab, setTab] = useState('local');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const computer = data.computer;
  const platform = ({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[computer.platform] || computer.platform;
  const configuredModels = data.modelConnections.filter(connection => connection.hasKey).length;
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true); setError('');
    try { await write('/computer/probe', {}); await onRefresh(); } catch (err) { setError(messageOf(err)); } finally { setRefreshing(false); }
  }
  return <div className="computer-settings">
    <header className="settings-panel-heading computer-heading">
      <h2 id="settings-computer-title">{t('电脑', 'Computers')}</h2>
      <div className="computer-tabs"><SegmentedControl value={tab} onChange={setTab} size="md" aria-label={t('电脑类型', 'Computer type')}><SegmentedControl.Option value="local">{t('这台电脑', 'This computer')}</SegmentedControl.Option><SegmentedControl.Option value="ssh">SSH</SegmentedControl.Option></SegmentedControl></div>
    </header>
    <div className="computer-local" hidden={tab !== 'local'}>
      <div className="computer-device-row">
        <span className="computer-device-icon" aria-hidden="true"><Desktop /></span>
        <div className="computer-device-identity"><strong title={computer.name}>{computer.name}</strong><small>{platform}<span aria-hidden="true"> · </span>{computer.status === 'online' ? t('在线', 'Online') : t('离线', 'Offline')}</small></div>
      </div>
      <div className="computer-local-body">
        <div className="computer-runtime">
          <div className="computer-runtime-row">
            <p className={`computer-runtime-status${computer.codexAvailable ? '' : ' is-unavailable'}`} role="status"><span aria-hidden="true" />{computer.codexAvailable ? t('运行组件已就绪', 'Local runtime is ready') : t('未检测到 Codex 运行组件', 'Codex runtime not detected')}</p>
            <Button type="button" color="secondary" variant="ghost" size="sm" className="computer-refresh" aria-label={t('重新检测本机状态', 'Check this computer again')} loading={refreshing} disabled={refreshing} onClick={() => void refresh()}><Reload />{t('重新检测', 'Check again')}</Button>
          </div>
          {computer.checkedAt && <p className="computer-check-time">{t('最近检测：', 'Last checked: ')}<time dateTime={computer.checkedAt}>{when(computer.checkedAt)}</time></p>}
        </div>
        <ErrorNotice error={error} />
        {!configuredModels && <div className="computer-model-needed"><p>{t('添加模型连接后，即可开始任务。', 'Add a model connection to start a task.')}</p><ButtonLink as="a" href="#settings/model" color="primary" size="sm">{t('添加模型', 'Add model')}</ButtonLink></div>}
        <details className="computer-technical"><summary>{t('运行详情', 'Runtime details')}<ChevronDown /></summary><dl>
          <div><dt>{t('工作目录', 'Workspace')}</dt><dd className="computer-path">{computer.workspace}</dd></div>
          <div><dt>{t('运行组件', 'Runtime')}</dt><dd>{computer.codexVersion || t('暂无版本信息', 'Version unavailable')}</dd></div>
        </dl></details>
        <p className="computer-footnote">{t('运行任务时，请保持电脑唤醒和 SecondU 开启。', 'Keep this computer awake and SecondU open while tasks run.')}</p>
      </div>
    </div>
    <div hidden={tab !== 'ssh'}><RemoteComputers data={data} onRefresh={onRefresh} /></div>
  </div>;
}
