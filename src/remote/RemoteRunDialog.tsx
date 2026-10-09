import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Paperclip } from '@openai/apps-sdk-ui/components/Icon';
import type { RemoteComputer, RemoteComputersResponse, RemoteRun, RemoteRunStart } from '../../shared/remote-computer-types';
import { api, apiUrl, APIError, write, messageOf } from '../api';
import { Dialog, ErrorNotice, Field } from '../components';
import { useAttachments, AttachmentDrafts } from '../composer/attachments';
import { ConnectionSelect } from '../models/ConnectionSelect';
import { t } from '../i18n';
import { useUnsavedChanges } from '../useUnsavedChanges';
import '../design-system/settings-type-scale.css';
import './remote-computers.css';

type PendingStart = { body: RemoteRunStart; computerName: string; modelName: string; modelHost: string; workspace: string; fileNames: Array<{ attachmentId: string; name: string; size: number }> };
function pendingKey(computerId: string) { return `secondu.remote.pending:${apiUrl(`/computers/${computerId}/runs`)}`; }
function readPending(computerId: string): PendingStart | undefined {
  try { const pending = JSON.parse(sessionStorage.getItem(pendingKey(computerId)) || 'null'); return pending?.body?.requestId && pending.body.credentialConsent === true ? pending : undefined; } catch { return undefined; }
}
export function remoteFileSize(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function filePathIssue(value: string) { return !value || value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..'); }

export function RemoteRunDialog({ computer, connections, initialPrompt = '', onClose, onStarted }: { computer: RemoteComputer; connections: RemoteComputersResponse['connections']; initialPrompt?: string; onClose: () => void; onStarted: (run: RemoteRun) => void }) {
  const [attempt, setAttempt] = useState<PendingStart | undefined>(() => readPending(computer.id));
  const [prompt, setPrompt] = useState(attempt?.body.prompt || initialPrompt);
  const [connectionId, setConnectionId] = useState(attempt?.body.modelConnectionId || connections.find(connection => connection.hasKey)?.id || connections[0]?.id || '');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [paths, setPaths] = useState<Record<string, string>>({});
  const attemptRef = useRef(attempt), busyRef = useRef(false);
  const draft = JSON.stringify([prompt, connectionId, consent, paths]);
  const baseline = useRef(draft);
  useUnsavedChanges(() => ({ unsaved: !!attemptRef.current || draft !== baseline.current, busy: busyRef.current }));
  const attachments = useAttachments({ maxFiles: 6, maxBytes: 8 * 1024 * 1024, contextKey: `remote:${computer.id}` });
  const connection = connections.find(item => item.id === connectionId);
  const totalBytes = attachments.readyAttachments.reduce((total, attachment) => total + attachment.size, 0);
  const files = attachments.readyAttachments.map(attachment => ({ attachmentId: attachment.id, path: paths[attachment.id] ?? `inputs/${attachment.name.replace(/[\\/]/g, '_')}` }));
  const invalidFiles = files.some(file => filePathIssue(file.path)) || new Set(files.map(file => file.path)).size !== files.length;
  const pending = !!attempt;
  const modelHost = attempt?.modelHost || connection?.baseUrl || '';
  const fileSignature = JSON.stringify(files);
  useEffect(() => { setConsent(false); }, [computer.revision, connection?.revision, fileSignature]);
  function resetConsent() { setConsent(false); setError(''); }
  function clearAttempt() { try { sessionStorage.removeItem(pendingKey(computer.id)); } catch { /* The in-memory request remains authoritative for this dialog. */ } attemptRef.current = undefined; setAttempt(undefined); setConsent(false); }
  function accepted(run: RemoteRun) { baseline.current = JSON.stringify([prompt, connectionId, false, paths]); attachments.clear(); clearAttempt(); onStarted(run); }
  async function checkSubmission() {
    if (busyRef.current || !attemptRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try { const result = await api<{ runs: RemoteRun[] }>(`/computers/${computer.id}/runs`); const found = result.runs.find(run => run.requestId === attemptRef.current?.body.requestId); if (found) accepted(found); else setError(t('本机还没有收到这次任务的确认。可用同一请求重试；内容保持不变。', 'This submission has not been confirmed locally. You can retry the same request with its unchanged contents.')); }
    catch (err) { setError(messageOf(err)); } finally { busyRef.current = false; setBusy(false); }
  }
  async function submit() {
    if (busyRef.current || (!attemptRef.current && (!consent || !prompt.trim() || !connection?.hasKey || attachments.busy || attachments.hasErrors || invalidFiles || totalBytes > 8 * 1024 * 1024))) return;
    busyRef.current = true; setBusy(true); setError('');
    let request = attemptRef.current;
    if (!request && connection) {
      request = { body: { requestId: crypto.randomUUID(), prompt: prompt.trim(), modelConnectionId: connection.id, modelRevision: connection.revision, computerRevision: computer.revision, credentialConsent: true, files }, computerName: computer.name, modelName: connection.name, modelHost: connection.baseUrl || '', workspace: computer.probe?.workspaceRoot || computer.workspaceRoot, fileNames: attachments.readyAttachments.map(file => ({ attachmentId: file.id, name: file.name, size: file.size })) };
      try { sessionStorage.setItem(pendingKey(computer.id), JSON.stringify(request)); }
      catch { setError(t('无法保存这次请求的恢复记录，尚未发起远程任务。请恢复本机存储后重试。', 'The submission recovery record could not be saved. No remote task was started. Restore local storage and retry.')); busyRef.current = false; setBusy(false); return; }
      attemptRef.current = request; setAttempt(request);
    }
    try { const result = await write<{ run: RemoteRun }>(`/computers/${computer.id}/runs`, request!.body); accepted(result.run); }
    catch (err) {
      // A lost response can follow an accepted start. Keep its exact ID and
      // payload until the user checks or explicitly retries this same request.
      if (err instanceof APIError && err.status >= 400 && err.status < 500 && ![408, 429].includes(err.status)) {
        try {
          const observed = await api<{ runs: RemoteRun[] }>(`/computers/${computer.id}/runs`);
          const existing = observed.runs.find(run => run.requestId === request!.body.requestId);
          if (existing) { accepted(existing); return; }
          clearAttempt();
        } catch { /* An inconclusive status check must retain the request ID. */ }
      }
      setError(messageOf(err));
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <Dialog title={t('新建远程任务', 'New remote task')} className="remote-dialog remote-start-dialog settings-type-scale" onClose={() => { if (!busy) onClose(); }}><form className="remote-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <dl className="remote-run-destination"><div><dt>{t('运行电脑', 'Computer')}</dt><dd>{attempt?.computerName || computer.name}</dd></div><div><dt>{t('工作目录', 'Workspace')}</dt><dd>{attempt?.workspace || computer.probe?.workspaceRoot || computer.workspaceRoot}</dd></div></dl>
    <Field label={t('任务要求', 'Instructions')}><Textarea value={prompt} onChange={event => { setPrompt(event.target.value); resetConsent(); }} rows={5} maxLength={100000} disabled={busy || pending} required placeholder={t('描述要完成的工作和需要返回的结果。', 'Describe the work and the result you need.')} /></Field>
    {pending ? <Field label={t('使用的模型', 'Model')}><Input value={attempt.modelName} readOnly disabled /></Field> : <Field label={t('使用的模型', 'Model')}>{connections.length ? <ConnectionSelect value={connectionId} connections={connections} includeInherit={false} onChange={value => { setConnectionId(value); resetConsent(); }} disabled={busy} /> : <Input value={t('尚未添加模型连接', 'No model connections yet')} readOnly disabled />}</Field>}
    {!connections.some(item => item.hasKey) && !pending && <p className="remote-support">{t('先在模型设置中保存一条带有 API Key 的连接。', 'Save a model connection with an API key in model settings first.')} <a href="#settings/model" onClick={onClose}>{t('打开模型设置', 'Open model settings')}</a></p>}
    {modelHost && <p className="remote-model-endpoint">{t('模型服务', 'Model service')} <span>{modelHost}</span></p>}
    <section className="remote-input-files" aria-label={t('随任务发送的文件', 'Files sent with this task')}><header><h3>{t('任务文件', 'Task files')}</h3>{!pending && <Button type="button" color="secondary" variant="ghost" size="sm" disabled={busy || attachments.items.length >= 6} onClick={() => { resetConsent(); attachments.inputRef.current?.click(); }}><Paperclip />{t('添加文件', 'Add files')}</Button>}</header>
      {!pending && <AttachmentDrafts controller={attachments} disabled={busy} />}
      {pending ? (attempt.body.files || []).map(file => { const metadata = attempt.fileNames.find(item => item.attachmentId === file.attachmentId); return <div className="remote-manifest-row" key={file.attachmentId}><span>{metadata?.name || file.path}<small>{metadata ? remoteFileSize(metadata.size) : ''}</small></span><span>{file.path}</span></div>; }) : attachments.readyAttachments.map(file => <div className="remote-manifest-row" key={file.id}><span>{file.name}<small>{remoteFileSize(file.size)}</small></span><Input aria-label={t(`${file.name} 的远程路径`, `Remote path for ${file.name}`)} value={paths[file.id] ?? `inputs/${file.name.replace(/[\\/]/g, '_')}`} onChange={event => { setPaths(current => ({ ...current, [file.id]: event.target.value })); resetConsent(); }} disabled={busy} /></div>)}
      <p className="remote-support">{(pending ? attempt.body.files?.length : files.length) ? t('文件只写入以上相对路径；遇到已有文件时会停止并提示。', 'Files go to the relative paths above. An existing file stops the transfer for review.') : t('仅发送你在这里选择的文件，最多 6 个、合计 8 MiB。', 'Only files selected here are sent: up to 6 files and 8 MiB total.')}</p>
      {!pending && (invalidFiles || totalBytes > 8 * 1024 * 1024) && <ErrorNotice error={invalidFiles ? t('文件路径需为不重复的相对路径，不能包含“..”。', 'Use unique relative paths without “..”.') : t('所选文件合计超过 8 MiB，请移除部分文件。', 'Selected files exceed 8 MiB in total. Remove some files.')} />}
    </section>
    {pending ? <p className="remote-pending-note" role="status">{t('这次请求已记录。先核对提交状态，重试也只使用同一请求。', 'This submission is recorded. Check its status; any retry uses the same request.')}</p> : <Checkbox checked={consent} onCheckedChange={value => setConsent(value === true)} disabled={busy || !connection?.hasKey} label={t(`允许“${computer.name}”在这次任务中使用“${connection?.name || '所选模型'}”的 API Key。`, `Allow “${computer.name}” to use the API key for “${connection?.name || 'the selected model'}” for this task.`)} />}
    <ErrorNotice error={error} /><div className="remote-form-actions"><Button type="button" color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('关闭', 'Close')}</Button>{pending && <Button type="button" color="secondary" variant="outline" disabled={busy} onClick={() => void checkSubmission()}>{t('核对提交状态', 'Check submission')}</Button>}<Button type="submit" color="primary" loading={busy} disabled={busy || (!pending && (!consent || !prompt.trim() || !connection?.hasKey || attachments.busy || attachments.hasErrors || invalidFiles || totalBytes > 8 * 1024 * 1024))}>{pending ? t('用同一请求重试', 'Retry same request') : t('开始远程任务', 'Start remote task')}</Button></div>
  </form></Dialog>;
}
