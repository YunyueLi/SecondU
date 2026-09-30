import { useCallback, useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Plus, ChevronLeft, ChevronRight, Edit, Reload, Desktop } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap } from '../../shared/contracts';
import type { RemoteComputer, RemoteComputersResponse, RemoteRun } from '../../shared/remote-computer-types';
import { api, write, messageOf } from '../api';
import { Dialog, ErrorNotice, Field, when } from '../components';
import { t } from '../i18n';
import { RemoteRunDialog } from './RemoteRunDialog';
import { RemoteRunDetail, remoteRunLabel } from './RemoteRunDetail';
import '../design-system/settings-type-scale.css';
import './remote-computers.css';

export { RemoteRunDialog } from './RemoteRunDialog';
export { RemoteRunDetail } from './RemoteRunDetail';

function statusLabel(computer: RemoteComputer) {
  if (computer.status === 'ready') return t('可以运行', 'Ready');
  if (computer.status === 'checking') return t('正在检查', 'Checking');
  if (computer.status === 'unavailable') return t('连接未通过', 'Connection failed');
  return computer.probe ? t('待准备运行组件', 'Setup needed') : t('尚未检查', 'Not checked');
}
function address(computer: RemoteComputer) { return `${computer.user ? `${computer.user}@` : ''}${computer.host}${computer.port === 22 ? '' : `:${computer.port}`}`; }

export function RemoteComputers({ data: bootstrap, onRefresh }: { data?: Bootstrap; onRefresh?: () => Promise<void> }) {
  const [data, setData] = useState<RemoteComputersResponse>();
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState<{ computer?: RemoteComputer }>();
  const [preparing, setPreparing] = useState<RemoteComputer>();
  const [starting, setStarting] = useState<RemoteComputer>();
  const [run, setRun] = useState<RemoteRun>();
  const [runs, setRuns] = useState<RemoteRun[]>([]);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = data?.computers.find(computer => computer.id === selectedId);
  const modelVersions = JSON.stringify(bootstrap?.modelConnections?.map(connection => [connection.id, connection.updatedAt]));
  const refresh = useCallback(async () => { const result = await api<RemoteComputersResponse>('/computers'); setData(result); return result; }, []);
  useEffect(() => { let disposed = false; api<RemoteComputersResponse>('/computers').then(result => { if (!disposed) setData(result); }).catch(err => { if (!disposed) setError(messageOf(err)); }).finally(() => { if (!disposed) setLoading(false); }); return () => { disposed = true; }; }, [modelVersions]);
  useEffect(() => {
    setRuns([]); if (!selectedId) return;
    let disposed = false; setRunsLoading(true);
    api<{ runs: RemoteRun[] }>(`/computers/${selectedId}/runs`).then(result => { if (!disposed) setRuns(result.runs); }).catch(err => { if (!disposed) setError(messageOf(err)); }).finally(() => { if (!disposed) setRunsLoading(false); });
    return () => { disposed = true; };
  }, [selectedId]);
  async function check(computer: RemoteComputer) {
    if (busy || data?.readOnly) return; setBusy(`probe:${computer.id}`); setError(''); setNotice('');
    try { const result = await write<{ computer: RemoteComputer }>(`/computers/${computer.id}/probe`, {}); setData(current => current && { ...current, computers: current.computers.map(item => item.id === result.computer.id ? result.computer : item) }); setNotice(t('连接和运行条件已检查。', 'Connection and requirements checked.')); }
    catch (err) { setError(messageOf(err)); try { await refresh(); } catch { /* Keep the original check error visible. */ } }
    finally { setBusy(''); }
  }
  async function prepare() {
    if (!preparing || busy || data?.readOnly) return; setBusy(`prepare:${preparing.id}`); setError('');
    try { const result = await write<{ computer: RemoteComputer }>(`/computers/${preparing.id}/prepare`, { installRuntime: true }); setData(current => current && { ...current, computers: current.computers.map(item => item.id === result.computer.id ? result.computer : item) }); setPreparing(undefined); setNotice(t('运行组件已准备好。', 'The runtime is ready.')); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(''); }
  }
  async function saved(computer: RemoteComputer) {
    setData(current => current && { ...current, computers: current.computers.some(item => item.id === computer.id) ? current.computers.map(item => item.id === computer.id ? computer : item) : [...current.computers, computer] });
    setEditing(undefined); setSelectedId(computer.id); setNotice(t('已保存，检查连接后即可准备运行组件。', 'Saved. Check the connection to prepare the runtime.'));
    try { await onRefresh?.(); } catch { setNotice(t('电脑已保存，其他设置稍后刷新。', 'Computer saved. Other settings will refresh later.')); }
  }
  function updateRun(value: RemoteRun) { setRuns(current => current.some(item => item.id === value.id) ? current.map(item => item.id === value.id ? value : item) : [value, ...current]); }
  const header = selected ? selected.name : t('远程电脑', 'Remote computers');
  return <div className="remote-computers settings-type-scale">
    {selected && <Button className="remote-back" color="secondary" variant="ghost" size="sm" onClick={() => { setSelectedId(''); setError(''); setNotice(''); }}><ChevronLeft />{t('所有电脑', 'All computers')}</Button>}
    <header className="remote-heading"><div><h2 id="settings-computers-title">{header}</h2><p>{selected ? address(selected) : t('把任务交给另一台电脑，随时查看进展和产物。', 'Run tasks on another computer and follow their progress and files.')}</p></div>{selected ? <Button color="secondary" variant="ghost" size="sm" disabled={data?.readOnly || !!busy} onClick={() => setEditing({ computer: selected })}><Edit />{t('编辑', 'Edit')}</Button> : <Button color="secondary" variant="outline" size="sm" disabled={loading || !data || data.readOnly || !!busy} onClick={() => setEditing({})}><Plus />{t('添加电脑', 'Add computer')}</Button>}</header>
    {data?.readOnly && <p className="remote-support" role="status">{t('示例空间仅供查看。切换到真实空间后可连接电脑。', 'The example space is read only. Switch to your personal space to connect a computer.')}</p>}
    <div className="remote-feedback" aria-live="polite"><ErrorNotice error={error} />{notice && <p>{notice}</p>}</div>
    {loading ? <p className="remote-support" role="status">{t('正在读取电脑列表…', 'Loading computers…')}</p> : !data ? <Button color="secondary" variant="outline" onClick={() => { setLoading(true); setError(''); void refresh().catch(err => setError(messageOf(err))).finally(() => setLoading(false)); }}><Reload />{t('重新加载', 'Reload')}</Button> : selected ? <>
      <dl className="remote-facts"><div><dt>{t('状态', 'Status')}</dt><dd><span className={`remote-state is-${selected.status}`}><i />{statusLabel(selected)}</span></dd></div><div><dt>{t('工作目录', 'Workspace')}</dt><dd>{selected.probe?.workspaceRoot || selected.workspaceRoot}</dd></div>{selected.probe && <><div><dt>{t('运行环境', 'Runtime')}</dt><dd><span className="inline-metadata"><span>{selected.probe.platform === 'darwin' ? 'macOS' : 'Linux'}</span><span>Node {selected.probe.node}</span><span>{selected.probe.codex}</span></span></dd></div><div><dt>{t('最近检查', 'Last checked')}</dt><dd>{when(selected.probe.checkedAt)}</dd></div></>}{selected.runtime && <div><dt>{t('运行组件', 'Components')}</dt><dd>{t(`已于 ${when(selected.runtime.installedAt)} 安装`, `Installed ${when(selected.runtime.installedAt)}`)}</dd></div>}</dl>
      {selected.lastError && <ErrorNotice error={selected.lastError.message} />}
      <div className="remote-inline-actions"><Button color="secondary" variant="outline" disabled={data.readOnly || !!busy} loading={busy === `probe:${selected.id}`} onClick={() => void check(selected)}>{t('检查连接', 'Check connection')}</Button><Button color="secondary" variant="outline" disabled={data.readOnly || !!busy || !selected.probe} onClick={() => { setError(''); setPreparing(selected); }}>{selected.runtime ? t('更新运行组件', 'Update runtime') : t('准备运行组件', 'Prepare runtime')}</Button><Button color="primary" disabled={data.readOnly || !!busy || selected.status !== 'ready'} onClick={() => setStarting(selected)}>{t('新建远程任务', 'New remote task')}</Button></div>
      <section className="remote-runs" aria-labelledby="remote-runs-title"><header><h3 id="remote-runs-title">{t('这台电脑的任务', 'Tasks on this computer')}</h3><Button color="secondary" variant="ghost" size="sm" disabled={runsLoading} onClick={() => { setRunsLoading(true); void api<{ runs: RemoteRun[] }>(`/computers/${selected.id}/runs`).then(result => setRuns(result.runs)).catch(err => setError(messageOf(err))).finally(() => setRunsLoading(false)); }}><Reload />{t('刷新', 'Refresh')}</Button></header>{runsLoading && !runs.length ? <p className="remote-support">{t('正在读取任务…', 'Loading tasks…')}</p> : runs.length ? <div className="remote-run-list">{runs.map(item => <button type="button" key={item.id} onClick={() => setRun(item)}><span><strong>{item.prompt}</strong><small><span className="inline-metadata"><span>{item.model.name}</span><span>{when(item.createdAt)}</span></span></small></span><span className="remote-run-state">{remoteRunLabel(item)}</span><ChevronRight /></button>)}</div> : <p className="remote-support">{t('还没有远程任务。运行后，可在这里查看进展和下载文件。', 'No remote tasks yet. Their progress and downloadable files appear here.')}</p>}</section>
    </> : data.computers.length ? <div className="remote-computer-list">{data.computers.map(computer => <div className="remote-computer-row" key={computer.id}><Desktop /><button className="remote-computer-main" type="button" onClick={() => { setSelectedId(computer.id); setError(''); setNotice(''); }}><strong>{computer.name}</strong><small>{address(computer)}</small></button><span className={`remote-state is-${computer.status}`}><i />{statusLabel(computer)}</span><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t(`查看 ${computer.name}`, `View ${computer.name}`)} onClick={() => setSelectedId(computer.id)}><ChevronRight /></Button></div>)}</div> : <div className="remote-empty"><Desktop /><h3>{t('连接另一台电脑', 'Connect another computer')}</h3><p>{t('添加已有的 SSH 连接，再选择用于任务的工作目录。', 'Add an existing SSH connection and choose its task workspace.')}</p><Button color="secondary" variant="outline" disabled={data.readOnly} onClick={() => setEditing({})}><Plus />{t('添加电脑', 'Add computer')}</Button></div>}
    {editing && <ComputerForm computer={editing.computer} onClose={() => setEditing(undefined)} onSaved={saved} />}
    {preparing && <Dialog title={t('准备运行组件', 'Prepare runtime')} className="remote-dialog settings-type-scale" onClose={() => { if (!busy) setPreparing(undefined); }}><div className="remote-form"><p>{t(`将在“${preparing.name}”上安装 SecondU 运行组件，供你发起远程任务。`, `Install the SecondU runtime on “${preparing.name}” for your remote tasks.`)}</p><p className="remote-support">{t('组件保存在该电脑的用户目录中。完成后即可选择模型并开始任务。', 'Components are saved in that computer’s user directory. Then choose a model to start a task.')}</p><ErrorNotice error={error} /><div className="remote-form-actions"><Button color="secondary" variant="ghost" disabled={!!busy} onClick={() => setPreparing(undefined)}>{t('取消', 'Cancel')}</Button><Button color="primary" loading={!!busy} disabled={!!busy} onClick={() => void prepare()}>{t('安装运行组件', 'Install runtime')}</Button></div></div></Dialog>}
    {starting && <RemoteRunDialog computer={starting} connections={data?.connections || []} onClose={() => setStarting(undefined)} onStarted={value => { updateRun(value); setStarting(undefined); setRun(value); }} />}
    {run && <RemoteRunDetail run={run} readOnly={data?.readOnly} onClose={() => setRun(undefined)} onUpdate={updateRun} />}
  </div>;
}

function ComputerForm({ computer, onClose, onSaved }: { computer?: RemoteComputer; onClose: () => void; onSaved: (value: RemoteComputer) => Promise<void> }) {
  const [name, setName] = useState(computer?.name || ''), [host, setHost] = useState(computer?.host || ''), [user, setUser] = useState(computer?.user || ''), [port, setPort] = useState(String(computer?.port || 22)), [workspace, setWorkspace] = useState(computer?.workspaceRoot || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try { const result = await write<{ computer: RemoteComputer }>(computer ? `/computers/${computer.id}` : '/computers', { name: name.trim(), host: host.trim(), ...(user.trim() ? { user: user.trim() } : {}), port: Number(port), workspaceRoot: workspace.trim(), ...(computer ? { expectedRevision: computer.revision } : {}) }, computer ? 'PUT' : 'POST'); await onSaved(result.computer); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  return <Dialog title={computer ? t('编辑电脑', 'Edit computer') : t('添加电脑', 'Add computer')} className="remote-dialog settings-type-scale" onClose={() => { if (!busy) onClose(); }}><form className="remote-form" onSubmit={event => { event.preventDefault(); void save(); }}><Field label={t('电脑名称', 'Computer name')}><Input value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder={t('例如：家里的 Mac', 'For example: Home Mac')} disabled={busy} required /></Field><Field label={t('连接地址', 'Host')} hint={t('使用已配置的 SSH 主机名或别名。', 'Use a host or alias from your existing SSH setup.')}><Input value={host} onChange={event => setHost(event.target.value)} maxLength={253} placeholder="my-computer.local" disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></Field><div className="remote-form-columns"><Field label={t('用户名', 'Username')} hint={t('留空时使用 SSH 配置。', 'Leave blank to use SSH settings.')}><Input value={user} onChange={event => setUser(event.target.value)} maxLength={64} disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field><Field label={t('端口', 'Port')}><Input type="number" min={1} max={65535} value={port} onChange={event => setPort(event.target.value)} disabled={busy} required /></Field></div><Field label={t('远程工作目录', 'Remote workspace')} hint={t('填写远程电脑上已存在的项目目录完整路径。', 'Enter the full path of an existing project folder on that computer.')}><Input value={workspace} onChange={event => setWorkspace(event.target.value)} placeholder="/Users/you/projects/my-project" disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></Field><ErrorNotice error={error} /><div className="remote-form-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('取消', 'Cancel')}</Button><Button type="submit" color="primary" loading={busy} disabled={busy || !name.trim() || !host.trim() || !workspace.trim() || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535}>{t('保存电脑', 'Save computer')}</Button></div></form></Dialog>;
}
