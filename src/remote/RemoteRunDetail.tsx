import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Download, Reload, Stop } from '@openai/apps-sdk-ui/components/Icon';
import type { RemoteFileResponse, RemotePollResponse, RemoteRun } from '../../shared/remote-computer-types';
import { write, messageOf } from '../api';
import { Dialog, ErrorNotice, RichText, when } from '../components';
import { t } from '../i18n';
import { remoteFileSize } from './RemoteRunDialog';
import '../design-system/settings-type-scale.css';
import './remote-computers.css';

const finished = (run: RemoteRun) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status);
export function remoteRunLabel(run: RemoteRun) {
  if (run.cancelRequested && !finished(run)) return t('正在请求停止', 'Stop requested');
  return ({ starting: t('正在启动', 'Starting'), running: t('正在运行', 'Running'), awaiting_approval: t('等待你确认', 'Needs your approval'), completed: t('已完成', 'Completed'), failed: t('运行失败', 'Failed'), cancelled: t('已取消', 'Cancelled'), interrupted: t('执行中断', 'Interrupted') })[run.status];
}

export function RemoteRunDetail({ run, readOnly, onUpdate, onClose }: { run: RemoteRun; readOnly?: boolean; onUpdate?: (run: RemoteRun) => void; onClose: () => void }) {
  return <Dialog title={t('远程任务', 'Remote task')} className="remote-dialog remote-detail-dialog settings-type-scale" onClose={onClose}><div className="remote-detail-prompt"><p>{run.prompt}</p><small><span className="inline-metadata"><span>{run.computer.name}</span><span>{run.model.name}</span><span>{when(run.createdAt)}</span></span></small></div><RemoteRunContent key={run.id} run={run} readOnly={readOnly} onUpdate={onUpdate} /></Dialog>;
}

/** Observing a run never starts, resumes or cancels it. Closing this view only
 * stops its local polling; the remote process keeps its existing lifecycle. */
export function RemoteRunContent({ run: initialRun, readOnly = false, onUpdate }: { run: RemoteRun; readOnly?: boolean; onUpdate?: (run: RemoteRun) => void }) {
  const [run, setRun] = useState(initialRun), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [polling, setPolling] = useState(false), [notice, setNotice] = useState('');
  const current = useRef(initialRun), updateRef = useRef(onUpdate), mounted = useRef(true), inFlight = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  updateRef.current = onUpdate;
  const route = `/computers/${initialRun.computerId}/runs/${initialRun.id}`;
  const publish = useCallback((value: RemoteRun) => { if (!mounted.current) return; current.current = value; setRun(value); if (value.cancelRequested && finished(value)) setNotice(value.status === 'cancelled' ? t('远程电脑已确认停止。', 'The remote computer confirmed the task stopped.') : t('远程电脑已返回最终状态。', 'The remote computer returned its final task status.')); updateRef.current?.(value); }, []);
  const poll = useCallback(async function observe() {
    if (readOnly || inFlight.current || !mounted.current) return;
    clearTimeout(timeout.current); inFlight.current = true; setPolling(true);
    try {
      const result = await write<RemotePollResponse>(`${route}/poll`, { cursor: current.current.cursor });
      if (!mounted.current) return; publish(result.run); setError('');
      if (result.run.observation.status !== 'disconnected' && (result.hasMore || !finished(result.run) || result.run.executorUnconfirmed)) timeout.current = setTimeout(() => void observe(), result.hasMore ? 200 : 2500);
    } catch (err) { if (mounted.current) setError(messageOf(err)); }
    finally { inFlight.current = false; if (mounted.current) setPolling(false); }
  }, [publish, readOnly, route]);
  useEffect(() => { mounted.current = true; void poll(); return () => { mounted.current = false; clearTimeout(timeout.current); }; }, [poll]);
  async function control(action: 'cancel' | 'approval', approvalId?: string, decision?: 'approve' | 'reject') {
    if (busy || readOnly) return; setBusy(approvalId || action); setError(''); setNotice('');
    try {
      const result = await write<{ run: RemoteRun; accepted: boolean }>(`${route}/${action}`, action === 'cancel' ? {} : { approvalId, decision });
      publish(result.run);
      if (result.accepted) setNotice(action === 'cancel' ? finished(result.run) ? t('远程电脑已返回最终状态。', 'The remote computer returned its final task status.') : t('停止请求已送达，正在等待远程电脑确认。', 'The stop request was delivered. Waiting for the remote computer to confirm.') : decision === 'approve' ? t('已批准这项操作。', 'This operation was approved.') : t('已拒绝这项操作。', 'This operation was rejected.'));
      else setNotice(t('远程电脑未接受这项操作，请刷新查看最新状态。', 'The remote computer did not accept this action. Refresh for the latest status.'));
      void poll();
    } catch (err) { setError(messageOf(err)); void poll(); } finally { setBusy(''); }
  }
  async function download(filePath: string) {
    if (busy || readOnly) return; setBusy(`file:${filePath}`); setError('');
    try {
      const file = await write<RemoteFileResponse>(`${route}/file`, { path: filePath });
      const bytes = Uint8Array.from(atob(file.dataBase64), value => value.charCodeAt(0));
      if (bytes.byteLength !== file.size) throw new Error(t('文件传输不完整，请重新下载。', 'The file transfer is incomplete. Download it again.'));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = document.createElement('a'); link.href = url; link.download = file.path.split('/').at(-1) || 'remote-file'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(t('文件已交给浏览器保存。', 'The file was sent to the browser for saving.'));
    } catch (err) { setError(messageOf(err)); } finally { setBusy(''); }
  }
  const disconnected = run.observation.status === 'disconnected';
  return <div className="remote-run-content settings-type-scale">
    <div className="remote-run-toolbar"><div><strong>{remoteRunLabel(run)}</strong><small>{run.observation.checkedAt ? t(`最后确认：${when(run.observation.checkedAt)}`, `Last checked: ${when(run.observation.checkedAt)}`) : t('等待首次确认', 'Waiting for the first confirmation')}</small></div><div><Button color="secondary" variant="ghost" size="sm" disabled={readOnly || polling || !!busy} loading={polling} onClick={() => void poll()}><Reload />{disconnected ? t('重新连接', 'Reconnect') : t('刷新', 'Refresh')}</Button>{!finished(run) && <Button color="secondary" variant="outline" size="sm" disabled={readOnly || !!busy || run.cancelRequested} loading={busy === 'cancel'} onClick={() => void control('cancel')}><Stop />{t('停止', 'Stop')}</Button>}</div></div>
    {disconnected && <div className="remote-observation" role="status"><strong>{t('暂时无法连接远程电脑', 'Remote computer disconnected')}</strong><p>{t('上方保留最后确认的任务状态。任务可能仍在运行，重新连接后可继续查看。', 'The last confirmed task status is shown above. The task may still be running; reconnect to check it.')}</p>{run.observation.error && <p>{run.observation.error.message}</p>}</div>}
    {run.dispatch === 'uncertain' && <p className="remote-support" role="status">{t('启动请求的响应尚未确认。重新连接会核对原任务，不会重新启动。', 'The start response is unconfirmed. Reconnecting checks the original task without starting it again.')}</p>}
    {run.executorUnconfirmed && <p className="remote-observation" role="status">{t('执行器状态尚未核对，工作目录仍被保护。重新连接后再确认是否可以开始新任务。', 'The executor state is unconfirmed, so the workspace remains protected. Reconnect before starting another task.')}</p>}
    <div aria-live="polite"><ErrorNotice error={error || run.error?.message} />{notice && <p className="remote-support">{notice}</p>}</div>
    {!!run.approvals.length && <section className="remote-approvals" aria-label={t('待确认操作', 'Operations awaiting approval')}>{run.approvals.map(approval => <div className="remote-approval" key={approval.id}><h3>{approval.title}</h3><p>{approval.description}</p>{approval.details && <pre>{approval.details}</pre>}<div className="remote-inline-actions"><Button color="secondary" variant="outline" disabled={readOnly || !!busy || disconnected} onClick={() => void control('approval', approval.id, 'reject')}>{t('拒绝', 'Reject')}</Button><Button color="primary" disabled={readOnly || !!busy || disconnected} loading={busy === approval.id} onClick={() => void control('approval', approval.id, 'approve')}>{t('批准这次操作', 'Approve this operation')}</Button></div></div>)}</section>}
    {run.result && <section className="remote-result"><h3>{t('执行结果', 'Result')}</h3><RichText>{run.result}</RichText></section>}
    <section className="remote-files"><h3>{t('产物文件', 'Files')}</h3>{run.files.length ? <div>{run.files.map(file => <div className="remote-file-row" key={file.path}><span><strong>{file.path}</strong><small><span className="inline-metadata"><span>{remoteFileSize(file.size)}</span><span>{when(file.modifiedAt)}</span></span></small></span><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t(`下载 ${file.path}`, `Download ${file.path}`)} disabled={readOnly || !!busy} loading={busy === `file:${file.path}`} onClick={() => void download(file.path)}><Download /></Button></div>)}</div> : <p className="remote-support">{finished(run) ? t('这次任务没有可下载的产物。', 'This task has no downloadable files.') : t('任务结束后，可下载的文件会显示在这里。', 'Downloadable files appear here when the task ends.')}</p>}{run.filesTruncated && <p className="remote-support">{t('部分文件未包含在下载清单中，请到远程工作目录查看。', 'Some files are not in this download list. Check the remote workspace for them.')}</p>}</section>
    {!!run.events.length && <details className="remote-events"><summary>{t('执行记录', 'Activity')} <span>{run.events.length}</span></summary><ol>{run.events.map(event => <li key={event.sequence}><time>{when(event.at)}</time><div><strong>{event.label}</strong>{event.detail && <pre>{event.detail}</pre>}</div></li>)}</ol>{run.eventsTruncated && <p className="remote-support">{t('这里只显示最近的执行记录。', 'Only recent activity is shown here.')}</p>}</details>}
  </div>;
}
