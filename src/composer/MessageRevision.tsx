import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { ArrowLeft, Edit } from '@openai/apps-sdk-ui/components/Icon';
import type { AgentRoom, Task, TaskRevisionResult } from '../../shared/contracts';
import { APIError, messageOf, write } from '../api';
import { t } from '../i18n';
import './message-revision.css';

type RevisionControls = { editor: ReactNode; editAction: ReactNode };
type Props = {
  task?: Task;
  messageId?: string;
  content: string;
  busy?: boolean;
  roomBusy?: boolean;
  example?: boolean;
  onRefresh: () => Promise<void>;
  onNavigate?: (result: TaskRevisionResult) => void;
  children: (controls: RevisionControls) => ReactNode;
};

function unavailableReason(task: Task | undefined, messageId: string | undefined, busy: boolean, roomBusy: boolean) {
  if (!task || !messageId || !task.messages.some(message => message.id === messageId && message.role === 'user')) return t('这条历史消息没有可编辑的任务记录。', 'This historical message has no editable task record.');
  if (task.remoteExecution) return t('远端任务请新建消息并选择执行电脑。', 'For a remote task, start a new message and choose its computer.');
  if (roomBusy || ['running', 'awaiting_approval'].includes(task.status)) return t('先停止当前执行，再编辑消息。', 'Stop the current run before editing a message.');
  if (busy) return t('正在保存其他操作，请稍后编辑。', 'Another change is being saved. Try again shortly.');
  return '';
}

function revisionError(error: unknown) {
  if (!(error instanceof APIError)) return messageOf(error);
  if (error.status === 404) return t('原消息或任务已不可用，请刷新会话。', 'The original message or task is unavailable. Refresh this conversation.');
  const messages: Record<string, [string, string]> = {
    revision_task_active: ['先停止当前执行，再编辑消息。', 'Stop the current run before editing a message.'],
    revision_room_active: ['会话仍有任务在执行，请先停止。', 'This conversation still has a running task. Stop it first.'],
    revision_remote_unsupported: ['远端任务请新建消息并选择执行电脑。', 'For a remote task, start a new message and choose its computer.'],
    revision_message_scope: ['这条消息已不在当前任务中，请刷新后重试。', 'This message is no longer in the task. Refresh and try again.'],
    revision_room_message_missing: ['原会话中的消息已不可用，尚未创建修改版本。', 'The original chat message is unavailable. No revised version was created.'],
    revision_request_conflict: ['这次保存的内容已变化，请取消后重新编辑。', 'The saved request no longer matches. Cancel and edit again.'],
    revision_sensitive_content: ['消息或历史中含有凭据，无法复制到修改版本。', 'The message or history contains credentials and cannot be copied into a revised version.'],
    revision_demo_read_only: ['示例仅保存修改预览，请在个人空间实际执行。', 'Examples save a revision preview. Use your personal space to run it.'],
  };
  const translated = error.code && messages[error.code];
  return translated ? t(...translated) : messageOf(error);
}

export function revisionHref(task: Task, room?: AgentRoom) {
  return room ? `#agents/${room.id}` : task.roomId ? `#agents/${task.roomId}` : `#task/${task.id}`;
}

/** The request receipt is reused after transport or refresh failures. Originals stay immutable. */
export function MessageRevision({ task, messageId, content, busy = false, roomBusy = false, example = false, onRefresh, onNavigate, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedResult, setSavedResult] = useState<TaskRevisionResult>();
  const attempt = useRef<{ requestId: string; content: string; run: boolean } | undefined>(undefined);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const reason = unavailableReason(task, messageId, busy, roomBusy);
  const previewOnly = example || task?.mode === 'demo';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  function cancel() {
    if (inFlight.current) return;
    // A known saved result can be closed without deleting its durable branch.
    // Keep an uncertain transport attempt so an identical retry stays idempotent.
    if (savedResult) { setSavedResult(undefined); attempt.current = undefined; }
    setEditing(false); setDraft(content); setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function submit() {
    if (!task || !messageId || inFlight.current || (!savedResult && (reason || draft.trim() === content.trim() || (!draft.trim() && !task.messages.find(message => message.id === messageId)?.attachmentIds?.length)))) return;
    inFlight.current = true; setSaving(true); setError('');
    const originHash = location.hash;
    let result = savedResult;
    try {
      if (!result) {
        const run = !previewOnly;
        if (!attempt.current || attempt.current.content !== draft || attempt.current.run !== run) attempt.current = { requestId: crypto.randomUUID(), content: draft, run };
        result = await write<TaskRevisionResult>(`/tasks/${task.id}/revise`, { ...attempt.current, messageId });
        if (mounted.current) setSavedResult(result);
      }
      await onRefresh();
      // A completed background request must not pull the user out of another chat.
      if (!mounted.current || location.hash !== originHash) return;
      if (onNavigate) onNavigate(result);
      else location.hash = revisionHref(result.task, result.room);
      setEditing(false);
    } catch (failure) {
      if (mounted.current) setError(result ? t('修改版本已保存，会话列表尚未刷新。重试打开即可。', 'The revision is saved, but the conversation list has not refreshed. Retry opening it.') : revisionError(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const editor = editing ? <form className="message-revision-editor" onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => {
    if (event.key === 'Escape' && !saving) { event.preventDefault(); event.stopPropagation(); cancel(); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
  }}>
    <Textarea ref={input} className="message-revision-input" variant="soft" value={draft} rows={2} maxRows={10} autoResize maxLength={200000} disabled={saving || !!savedResult} onChange={event => {setDraft(event.target.value);setError('');}} aria-label={t('编辑已发送的消息', 'Edit sent message')} />
    {reason && !savedResult && <p className="message-revision-note" role="status">{reason}</p>}
    {error && <p className="message-revision-error" role="alert">{error}</p>}
    <div className="message-revision-footer"><p className="message-revision-note">{previewOnly ? t('示例预览，不执行', 'Example preview only') : t('原对话与成果保留', 'Original chat and files kept')}</p><div className="message-revision-actions"><Button type="button" color="secondary" variant="ghost" size="sm" disabled={saving} onClick={cancel}>{savedResult ? t('关闭', 'Close') : t('取消', 'Cancel')}</Button><Button type="submit" color="primary" size="sm" loading={saving} disabled={saving || !savedResult && (!!reason || draft.trim() === content.trim() || !draft.trim() && !task?.messages.find(message => message.id === messageId)?.attachmentIds?.length)}>{savedResult ? t('打开修改版本', 'Open revision') : previewOnly ? t('保存修改预览', 'Save revision preview') : t('保存并重新发送', 'Save and resend')}</Button></div></div>
  </form> : null;
  const editAction = editing ? null : <Button ref={trigger} type="button" color="secondary" variant="ghost" size="sm" uniform disabled={!!reason} title={reason || t('编辑消息', 'Edit message')} aria-label={reason ? t(`编辑消息：${reason}`, `Edit message: ${reason}`) : t('编辑消息', 'Edit message')} onClick={() => { setDraft(savedResult ? attempt.current?.content || content : content); setEditing(true); setError(''); }}><Edit /></Button>;
  return <div className="message-revision" data-editing={editing}>{children({ editor, editAction })}</div>;
}

/** Durable lineage navigation uses current bootstrap records, not browser history. */
export function RevisionNavigation({ task, room, tasks, rooms }: { task?: Task; room?: AgentRoom; tasks: Task[]; rooms: AgentRoom[] }) {
  const parentId = room?.forkedFrom?.roomId || task?.forkedFrom?.taskId;
  const baseRoom = room?.forkedFrom ? rooms.find(item => item.id === parentId) : room;
  const baseTask = !room ? task?.forkedFrom ? tasks.find(item => item.id === parentId) : task : undefined;
  const revisions = !baseRoom && !baseTask ? [] : room ? rooms.filter(item => item.forkedFrom?.roomId === baseRoom?.id) : tasks.filter(item => item.forkedFrom?.taskId === baseTask?.id);
  const base = baseRoom || baseTask;
  if (!parentId && !revisions.length) return null;
  const baseHref = baseRoom ? `#agents/${baseRoom.id}` : baseTask ? revisionHref(baseTask) : undefined;
  const currentId = room?.id || task?.id;
  return <nav className="revision-navigation" aria-label={t('消息修改版本', 'Message revisions')}>
    {parentId ? baseHref ? <ButtonLink as="a" href={baseHref} color="secondary" variant="ghost" size="sm"><ArrowLeft />{t('返回原版本', 'Original version')}</ButtonLink> : <span>{t('原版本已不可用', 'Original version unavailable')}</span> : <span>{t('原版本', 'Original version')}</span>}
    {revisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((revision, index) => <ButtonLink as="a" key={revision.id} href={room ? `#agents/${revision.id}` : revisionHref(revision as Task)} color="secondary" variant="ghost" size="sm" selected={revision.id === currentId} aria-current={revision.id === currentId ? 'page' : undefined}>{t(`修改 ${index + 1}`, `Revision ${index + 1}`)}</ButtonLink>)}
    {!!parentId && !base && <span>{t('当前为修改版本', 'Viewing a revised version')}</span>}
  </nav>;
}
