import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Plus, ChevronLeft, ChevronRight, Edit, Reload, Desktop, DotsHorizontalMoreMenu, Trash } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap } from '../../shared/contracts';
import type { RemoteComputer, RemoteComputersResponse, RemoteRun } from '../../shared/remote-computer-types';
import { api, write, messageOf } from '../api';
import { Dialog, ErrorNotice, Field, when } from '../components';
import { t } from '../i18n';
import { useUnsavedChanges } from '../useUnsavedChanges';
import { RemoteRunDialog } from './RemoteRunDialog';
import { RemoteRunDetail, remoteRunLabel } from './RemoteRunDetail';
import '../design-system/settings-type-scale.css';
import './remote-computers.css';

export { RemoteRunDialog } from './RemoteRunDialog';
export { RemoteRunDetail } from './RemoteRunDetail';

function statusLabel(computer: RemoteComputer) {
  if (computer.archivedAt) return t('已移除', 'Removed');
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
  const [removing, setRemoving] = useState<RemoteComputer>();
  const [starting, setStarting] = useState<RemoteComputer>();
  const [run, setRun] = useState<RemoteRun>();
  const [runs, setRuns] = useState<RemoteRun[]>([]);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [notice, setNotice] = useState('');
  const [runsError, setRunsError] = useState('');
  // A completed mutation is newer than any list request already in flight,
  // even when a connection check keeps the same configuration revision.
  const computerReadVersion = useRef(0);
  const runsReadVersion = useRef(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useUnsavedChanges({ unsaved: false, busy: !!busy });
  const archived = data?.archivedComputers || [];
  const selected = [...(data?.computers || []), ...archived].find(computer => computer.id === selectedId);
  const modelVersions = JSON.stringify(bootstrap?.modelConnections?.map(connection => [connection.id, connection.updatedAt]));
  const refresh = useCallback(async () => {
    const version = ++computerReadVersion.current;
    const result = await api<RemoteComputersResponse>('/computers');
    if (version === computerReadVersion.current) setData(result);
    return result;
  }, []);
  useEffect(() => {
    let disposed = false; const version = ++computerReadVersion.current;
    api<RemoteComputersResponse>('/computers').then(result => { if (!disposed && version === computerReadVersion.current) setData(result); }).catch(err => { if (!disposed && version === computerReadVersion.current) setError(messageOf(err)); }).finally(() => { if (!disposed && version === computerReadVersion.current) setLoading(false); });
    return () => { disposed = true; };
  }, [modelVersions]);
  useEffect(() => {
    const version = ++runsReadVersion.current;
    setRuns([]); setRunsError('');
    if (!selectedId) return;
    let disposed = false; setRunsLoading(true);
    api<{ runs: RemoteRun[] }>(`/computers/${selectedId}/runs`).then(result => { if (!disposed && version === runsReadVersion.current) setRuns(result.runs); }).catch(err => { if (!disposed && version === runsReadVersion.current) setRunsError(messageOf(err)); }).finally(() => { if (!disposed && version === runsReadVersion.current) setRunsLoading(false); });
    return () => { disposed = true; };
  }, [selectedId]);
  function select(computer: RemoteComputer) { setSelectedId(computer.id); setError(''); setNotice(''); }
  function replaceComputer(computer: RemoteComputer) {
    computerReadVersion.current++; setLoading(false);
    setData(current => current && { ...current,
      computers: computer.archivedAt ? current.computers.filter(item => item.id !== computer.id) : current.computers.some(item => item.id === computer.id) ? current.computers.map(item => item.id === computer.id ? computer : item) : [...current.computers, computer],
      archivedComputers: [...(current.archivedComputers || []).filter(item => item.id !== computer.id), ...(computer.archivedAt ? [computer] : [])],
    });
  }
  async function reload() {
    if (busy) return; setBusy('refresh'); setError(''); setNotice('');
    try { await refresh(); } catch (err) { setError(messageOf(err)); } finally { setBusy(''); setLoading(false); }
  }
  async function reloadRuns(computerId: string) {
    const version = ++runsReadVersion.current;
    setRunsLoading(true); setRunsError('');
    const current = () => selectedIdRef.current === computerId && version === runsReadVersion.current;
    try { const result = await api<{ runs: RemoteRun[] }>(`/computers/${computerId}/runs`); if (current()) setRuns(result.runs); } catch (err) { if (current()) setRunsError(messageOf(err)); } finally { if (current()) setRunsLoading(false); }
  }
  async function check(computer: RemoteComputer) {
    if (busy || data?.readOnly || computer.archivedAt) return; setBusy(`probe:${computer.id}`); setError(''); setNotice('');
    try { const result = await write<{ computer: RemoteComputer }>(`/computers/${computer.id}/probe`, {}); replaceComputer(result.computer); setNotice(t(`“${computer.name}”连接检查已通过。`, `“${computer.name}” passed its connection check.`)); }
    catch (err) { setError(messageOf(err)); try { await refresh(); } catch { /* Preserve the connection error. */ } }
    finally { setBusy(''); }
  }
  async function prepare() {
    if (!preparing || busy || data?.readOnly) return; setBusy(`prepare:${preparing.id}`); setDialogError('');
    try { const result = await write<{ computer: RemoteComputer }>(`/computers/${preparing.id}/prepare`, { installRuntime: true }); replaceComputer(result.computer); setPreparing(undefined); setNotice(t('运行组件已准备好，可以开始任务。', 'The runtime is ready. You can start a task.')); }
    catch (err) { setDialogError(messageOf(err)); }
    finally { setBusy(''); }
  }
  async function remove() {
    if (!removing || busy || data?.readOnly) return; setBusy(`remove:${removing.id}`); setDialogError('');
    try { const result = await write<{ computer: RemoteComputer }>(`/computers/${removing.id}`, { expectedRevision: removing.revision }, 'DELETE'); replaceComputer(result.computer); setRemoving(undefined); setSelectedId(''); setNotice(t('连接已移除。历史任务保留在“已移除的连接”中，可随时恢复。', 'Connection removed. Its task history is kept under Removed connections, where you can restore it.')); }
    catch (err) { setDialogError(messageOf(err)); }
    finally { setBusy(''); }
  }
  async function restore(computer: RemoteComputer) {
    if (busy || data?.readOnly) return; setBusy(`restore:${computer.id}`); setError(''); setNotice('');
    try { const result = await write<{ computer: RemoteComputer }>(`/computers/${computer.id}/restore`, { expectedRevision: computer.revision }); replaceComputer(result.computer); setSelectedId(computer.id); setNotice(t('连接已恢复，请重新检查连接并准备运行组件。', 'Connection restored. Check it again and prepare its runtime.')); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(''); }
  }
  async function saved(computer: RemoteComputer) {
    replaceComputer(computer); setEditing(undefined); setSelectedId(computer.id); setNotice(t('配置已保存。请检查连接，确认工作目录与运行条件。', 'Configuration saved. Check the connection, workspace and runtime requirements.'));
    try { await onRefresh?.(); } catch { /* The saved connection is already reflected in this view. */ }
  }
  function updateRun(value: RemoteRun) {
    if (value.computerId !== selectedIdRef.current) return;
    runsReadVersion.current++; setRunsLoading(false); setRunsError('');
    setRuns(current => current.some(item => item.id === value.id) ? current.map(item => item.id === value.id ? value : item) : [value, ...current]);
  }
  function menu(computer: RemoteComputer) {
    return <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" uniform disabled={!!busy || data?.readOnly} aria-label={t(`管理 ${computer.name}`, `Manage ${computer.name}`)}><DotsHorizontalMoreMenu /></Button></Menu.Trigger><Menu.Content align="end" minWidth={190}>
      <Menu.Item onSelect={() => { setError(''); setEditing({ computer }); }}><Edit />{t('编辑连接', 'Edit connection')}</Menu.Item>
      <Menu.Item onSelect={() => void check(computer)}><Reload />{t('检查连接', 'Check connection')}</Menu.Item>
      {computer.probe && computer.status !== 'unavailable' && <Menu.Item onSelect={() => { setDialogError(''); setPreparing(computer); }}>{t('准备运行组件', 'Prepare runtime')}</Menu.Item>}
      <Menu.Separator /><Menu.Item onSelect={() => { setDialogError(''); setRemoving(computer); }}><Trash />{t('移除连接', 'Remove connection')}</Menu.Item>
    </Menu.Content></Menu>;
  }
  function row(computer: RemoteComputer) {
    return <div className="remote-computer-row" key={computer.id}><span className="remote-device-icon"><Desktop /></span><Button className="remote-computer-main" color="secondary" variant="ghost" pill={false} onClick={() => select(computer)}><span><strong>{computer.name}</strong><small>{address(computer)}</small></span><ChevronRight /></Button><span className={`remote-state is-${computer.archivedAt ? 'archived' : computer.status}`}><i aria-hidden="true" />{busy === `probe:${computer.id}` ? t('正在检查', 'Checking') : statusLabel(computer)}</span>{computer.archivedAt ? <Button color="secondary" variant="ghost" size="sm" disabled={!!busy || data?.readOnly} loading={busy === `restore:${computer.id}`} onClick={() => void restore(computer)}>{t('恢复', 'Restore')}</Button> : menu(computer)}</div>;
  }
  const needsCheck = selected && (!selected.probe || selected.status === 'unavailable' || selected.status === 'checking');
  const hasModel = !!data?.connections.some(connection => connection.hasKey);
  const hasComputers = !!data?.computers.length;
  return <div className="remote-computers settings-type-scale">
    {selected && <Button className="remote-back" color="secondary" variant="ghost" size="sm" onClick={() => { setSelectedId(''); setError(''); setNotice(''); }}><ChevronLeft />{t('所有 SSH 连接', 'All SSH connections')}</Button>}
    {(selected || hasComputers) && <header className="remote-heading"><div><h3 id="settings-computers-title">{selected ? selected.name : t('已添加的电脑', 'Connected computers')}</h3>{selected && <p>{address(selected)}</p>}</div><div className="remote-heading-actions">{selected ? selected.archivedAt ? <Button color="secondary" variant="outline" size="sm" disabled={!!busy || data?.readOnly} loading={busy === `restore:${selected.id}`} onClick={() => void restore(selected)}>{t('恢复连接', 'Restore connection')}</Button> : menu(selected) : <><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t('刷新 SSH 连接列表', 'Refresh SSH connections')} disabled={!!busy} loading={busy === 'refresh'} onClick={() => void reload()}><Reload /></Button><Button color="secondary" variant="outline" size="sm" disabled={loading || !data || data.readOnly || !!busy} onClick={() => setEditing({})}><Plus />{t('添加连接', 'Add connection')}</Button></>}</div></header>}

    {data?.readOnly && <p className="remote-support" role="status">{t('示例空间仅供查看。切换到个人空间后可添加 SSH 连接。', 'The example space is read only. Switch to your personal space to add SSH connections.')}</p>}
    <div className="remote-feedback" aria-live="polite"><ErrorNotice error={error} />{notice && <p>{notice}</p>}</div>
    {loading ? <p className="remote-support" role="status">{t('正在读取连接…', 'Loading connections…')}</p> : !data ? <Button color="secondary" variant="outline" loading={busy === 'refresh'} onClick={() => void reload()}><Reload />{t('重新加载', 'Reload')}</Button> : selected ? <>
      <dl className="remote-facts"><div><dt>{t('状态', 'Status')}</dt><dd><span className={`remote-state is-${selected.archivedAt ? 'archived' : selected.status}`}><i aria-hidden="true" />{busy === `probe:${selected.id}` ? t('正在检查', 'Checking') : statusLabel(selected)}</span></dd></div><div><dt>{t('工作目录', 'Workspace')}</dt><dd>{selected.probe?.workspaceRoot || selected.workspaceRoot}</dd></div>{selected.probe && <div><dt>{t('最近检查', 'Last checked')}</dt><dd>{when(selected.probe.checkedAt)}</dd></div>}</dl>
      {selected.lastError && !error && <ErrorNotice error={selected.lastError.message} />}
      {selected.archivedAt ? <p className="remote-support">{t('连接已移除，历史任务与产物仍可查看。恢复连接后可以重新检查并运行新任务。', 'This connection was removed. Its task history and files remain available. Restore it to check the connection and run new tasks.')}</p> : <div className="remote-next-step"><div><strong>{needsCheck ? t('检查连接与工作目录', 'Check the connection and workspace') : selected.status !== 'ready' ? t('准备任务运行组件', 'Prepare the task runtime') : hasModel ? t('已具备任务运行条件', 'Ready for a task') : t('添加模型连接', 'Add a model connection')}</strong><p>{needsCheck ? t('通过 SSH 检查工作目录、Node.js 和 Codex。', 'Check the workspace, Node.js and Codex over SSH.') : selected.status !== 'ready' ? t('安装 SecondU 运行组件后，即可在这台电脑上执行任务。', 'Install the SecondU runtime to run tasks on this computer.') : hasModel ? t('选择模型、描述任务，再确认这次远程使用。', 'Choose a model, describe the task and confirm this remote session.') : t('为模型配置密钥后，即可开始远程任务。', 'Configure model credentials to start a remote task.')}</p></div>{needsCheck ? <Button color="primary" size="sm" loading={busy === `probe:${selected.id}`} disabled={data.readOnly || !!busy} onClick={() => void check(selected)}>{t('检查连接', 'Check connection')}</Button> : selected.status !== 'ready' ? <Button color="primary" size="sm" disabled={data.readOnly || !!busy} onClick={() => { setDialogError(''); setPreparing(selected); }}>{t('准备运行组件', 'Prepare runtime')}</Button> : hasModel ? <Button color="primary" size="sm" disabled={data.readOnly || !!busy} onClick={() => setStarting(selected)}><Plus />{t('新建任务', 'New task')}</Button> : <ButtonLink as="a" href="#settings/model" color="primary" size="sm">{t('添加模型', 'Add model')}</ButtonLink>}</div>}
      {selected.probe && <details className="remote-runtime-details"><summary>{t('运行详情', 'Runtime details')}</summary><dl className="remote-facts"><div><dt>{t('系统', 'System')}</dt><dd>{selected.probe.platform === 'darwin' ? 'macOS' : 'Linux'}</dd></div><div><dt>Node.js</dt><dd>{selected.probe.node}</dd></div><div><dt>Codex</dt><dd>{selected.probe.codex}</dd></div><div><dt>{t('运行组件', 'Runtime')}</dt><dd>{selected.runtime ? t(`已于 ${when(selected.runtime.installedAt)} 安装`, `Installed ${when(selected.runtime.installedAt)}`) : t('尚未安装', 'Not installed')}</dd></div></dl></details>}
      <section className="remote-runs" aria-labelledby="remote-runs-title"><header><h3 id="remote-runs-title">{t('任务记录', 'Task history')}</h3><Button color="secondary" variant="ghost" size="sm" disabled={runsLoading} loading={runsLoading} onClick={() => void reloadRuns(selected.id)}><Reload />{t('刷新', 'Refresh')}</Button></header><ErrorNotice error={runsError} />{runsLoading && !runs.length ? <p className="remote-support">{t('正在读取任务…', 'Loading tasks…')}</p> : runs.length ? <div className="remote-run-list">{runs.map(item => <Button color="secondary" variant="ghost" pill={false} key={item.id} onClick={() => setRun(item)}><span><strong>{item.prompt}</strong><small><span className="inline-metadata"><span>{item.model.name}</span><span>{when(item.createdAt)}</span></span></small></span><span className="remote-run-state">{remoteRunLabel(item)}</span><ChevronRight /></Button>)}</div> : !runsError && <p className="remote-support">{t('暂无任务记录', 'No tasks yet')}</p>}</section>
    </> : <>{hasComputers ? <div className="remote-computer-list">{data.computers.map(row)}</div> : <div className="remote-empty"><h3>{t('连接另一台电脑', 'Connect another computer')}</h3><p>{t('通过 SSH，在 Mac 或 Linux 电脑上运行任务。', 'Run tasks on a Mac or Linux computer over SSH.')}</p><Button color="primary" size="md" disabled={data.readOnly || !!busy} onClick={() => setEditing({})}><Plus />{t('添加连接', 'Add connection')}</Button></div>}{!!archived.length && <details className="remote-archived"><summary>{t(`已移除的连接（${archived.length}）`, `Removed connections (${archived.length})`)}</summary><div className="remote-computer-list">{archived.map(row)}</div></details>}</>}

    {editing && <ComputerForm computer={editing.computer} onClose={() => setEditing(undefined)} onSaved={saved} />}
    {preparing && <Dialog title={t('准备运行组件', 'Prepare runtime')} className="remote-dialog settings-type-scale" onClose={() => { if (!busy) setPreparing(undefined); }}><div className="remote-form"><p>{t(`将在“${preparing.name}”的用户目录中安装 SecondU 运行组件，用于执行你发起的远程任务。`, `Install the SecondU runtime in the user directory on “${preparing.name}” to execute your remote tasks.`)}</p><ErrorNotice error={dialogError} /><div className="remote-form-actions"><Button color="secondary" variant="ghost" disabled={!!busy} onClick={() => setPreparing(undefined)}>{t('取消', 'Cancel')}</Button><Button color="primary" loading={!!busy} disabled={!!busy} onClick={() => void prepare()}>{t('安装运行组件', 'Install runtime')}</Button></div></div></Dialog>}
    {removing && <Dialog title={t('移除 SSH 连接', 'Remove SSH connection')} className="remote-dialog settings-type-scale" onClose={() => { if (!busy) setRemoving(undefined); }}><div className="remote-form"><p>{t(`将“${removing.name}”移出可用连接。历史任务与产物会保留，之后可以恢复连接。`, `Remove “${removing.name}” from available connections. Its task history and files will remain available, and you can restore the connection later.`)}</p><p className="remote-support">{t('仅更改 SecondU 中的连接记录，不会删除远程文件或关闭 SSH。正在运行或状态未确认的任务需先处理完成。', 'This only changes the connection record in SecondU. Remote files and SSH stay in place. Active tasks or unconfirmed task states must be resolved first.')}</p><ErrorNotice error={dialogError} /><div className="remote-form-actions"><Button color="secondary" variant="ghost" disabled={!!busy} onClick={() => setRemoving(undefined)}>{t('取消', 'Cancel')}</Button><Button color="danger" loading={!!busy} disabled={!!busy} onClick={() => void remove()}>{t('移除连接', 'Remove connection')}</Button></div></div></Dialog>}
    {starting && <RemoteRunDialog computer={starting} connections={data?.connections || []} onClose={() => setStarting(undefined)} onStarted={value => { updateRun(value); setStarting(undefined); setRun(value); }} />}
    {run && <RemoteRunDetail run={run} readOnly={data?.readOnly} onClose={() => setRun(undefined)} onUpdate={updateRun} />}
  </div>;
}

function ComputerForm({ computer, onClose, onSaved }: { computer?: RemoteComputer; onClose: () => void; onSaved: (value: RemoteComputer) => Promise<void> }) {
  const [name, setName] = useState(computer?.name || ''), [host, setHost] = useState(computer?.host || ''), [user, setUser] = useState(computer?.user || ''), [port, setPort] = useState(String(computer?.port || 22)), [workspace, setWorkspace] = useState(computer?.workspaceRoot || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const draft = JSON.stringify([name, host, user, port, workspace]);
  const baseline = useRef(draft);
  useUnsavedChanges(() => ({ unsaved: draft !== baseline.current, busy }));
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try { const result = await write<{ computer: RemoteComputer }>(computer ? `/computers/${computer.id}` : '/computers', { name: name.trim(), host: host.trim(), user: user.trim(), port: Number(port), workspaceRoot: workspace.trim(), ...(computer ? { expectedRevision: computer.revision } : {}) }, computer ? 'PUT' : 'POST'); baseline.current = draft; await onSaved(result.computer); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  return <Dialog title={computer ? t('编辑 SSH 连接', 'Edit SSH connection') : t('添加 SSH 连接', 'Add SSH connection')} className="remote-dialog settings-type-scale" onClose={() => { if (!busy) onClose(); }}><form className="remote-form" onSubmit={event => { event.preventDefault(); void save(); }}><p className="remote-support">{t('使用本机 SSH 密钥和已信任的主机；远程电脑需已安装 Node.js 与 Codex。', 'Uses this computer’s SSH keys and trusted hosts. The remote computer needs Node.js and Codex.')}</p><Field label={t('电脑名称', 'Computer name')}><Input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder={t('例如：家里的 Mac', 'For example: Home Mac')} disabled={busy} required /></Field><Field label={t('SSH 地址', 'SSH host')} hint={t('填写主机地址，或本机 SSH 配置中的别名。', 'Enter a host address or an alias from your local SSH configuration.')}><Input value={host} onChange={event => setHost(event.target.value)} maxLength={253} placeholder="my-computer.local" disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></Field><div className="remote-form-columns"><Field label={t('用户名', 'Username')} hint={t('留空使用 SSH 配置。', 'Leave blank to use SSH settings.')}><Input value={user} onChange={event => setUser(event.target.value)} maxLength={64} disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field><Field label={t('端口', 'Port')}><Input type="number" min={1} max={65535} value={port} onChange={event => setPort(event.target.value)} disabled={busy} required /></Field></div><Field label={t('远程工作目录', 'Remote workspace')} hint={t('任务将在这个目录中读写文件。填写已存在的项目目录完整路径。', 'Tasks read and write files in this folder. Enter the full path of an existing project folder.')}><Input value={workspace} onChange={event => setWorkspace(event.target.value)} placeholder="/Users/you/projects/my-project" disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></Field>{computer && <p className="remote-support">{t('修改后需要重新检查连接并准备运行组件。已有任务保留原来的执行配置。', 'After editing, check the connection and prepare the runtime again. Existing tasks keep their original execution configuration.')}</p>}<ErrorNotice error={error} /><div className="remote-form-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('取消', 'Cancel')}</Button><Button type="submit" color="primary" loading={busy} disabled={busy || !name.trim() || !host.trim() || !workspace.trim() || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535}>{t('保存连接', 'Save connection')}</Button></div></form></Dialog>;
}
