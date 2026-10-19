import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Desktop, Stop } from '@openai/apps-sdk-ui/components/Icon';
import type { Task } from '../shared/contracts';
import { ErrorNotice } from './components';
import { api, messageOf } from './api';
import { uploadAttachment } from './composer/attachments';
import { t } from './i18n';
import './screen-context.css';

/** Capture is an explicit attachment to the existing task. The established
 * Codex app-server runner owns the conversation, execution and permissions. */
export function ScreenContextPanel({ task, onRefresh }: { task: Task; onRefresh: () => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const upload = useRef<AbortController | null>(null);
  const [sharing, setSharing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sending, setSending] = useState(false);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [sentAt, setSentAt] = useState('');
  const available = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const canSend = task.mode === 'live' && !task.remoteExecution && !['running', 'queued', 'awaiting_approval'].includes(task.status);

  function stop() {
    generation.current += 1;
    upload.current?.abort();
    upload.current = null;
    const current = stream.current;
    stream.current = null;
    current?.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
    if (mounted.current) { setSharing(false); setChoosing(false); setSending(false); }
  }
  useEffect(() => {
    mounted.current = true;
    setQuestion(''); setSentAt(''); setError('');
    return () => { mounted.current = false; stop(); };
  }, [task.id]);

  async function start() {
    if (choosing || sharing || !available) return;
    const request = ++generation.current;
    setChoosing(true); setError('');
    try {
      const selected = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!mounted.current || generation.current !== request) { selected.getTracks().forEach(track => track.stop()); return; }
      stream.current = selected;
      selected.getVideoTracks().forEach(track => track.addEventListener('ended', stop, { once: true }));
      if (!selected.getVideoTracks().some(track => track.readyState === 'live')) { stop(); return; }
      if (video.current) { video.current.srcObject = selected; await video.current.play(); }
      if (mounted.current && generation.current === request) setSharing(true);
    } catch (cause) {
      if (mounted.current && generation.current === request) {
        stop();
        setError(cause instanceof Error && cause.name === 'NotAllowedError'
          ? t('没有开始共享。可以重新选择窗口，或检查系统的屏幕录制权限。', 'Sharing did not start. Choose a window again or check screen recording permissions.')
          : t('画面暂时无法打开，请重试或使用桌面应用。', 'Could not open the preview. Try again or use the desktop app.'));
      }
    } finally { if (mounted.current && generation.current === request) setChoosing(false); }
  }

  async function sendFrame() {
    const current = video.current;
    if (!sharing || sending || !canSend || !current) return;
    const request = generation.current, controller = new AbortController();
    upload.current = controller; setSending(true); setError('');
    try {
      if (!current.videoWidth || !current.videoHeight) throw new Error(t('画面尚未准备好，请稍后再发送。', 'The frame is not ready yet. Try again shortly.'));
      const scale = Math.min(1, 1800 / Math.max(current.videoWidth, current.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(current.videoWidth * scale); canvas.height = Math.round(current.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error(t('无法读取画面。', 'Could not capture the frame.'));
      context.drawImage(current, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(t('画面保存失败，请重试。', 'Could not save the frame. Try again.'))), 'image/jpeg', 0.9));
      if (!mounted.current || generation.current !== request) return;
      const stamp = new Date(), attachment = await uploadAttachment(new File([blob], `screen-${stamp.toISOString().replaceAll(':', '-')}.jpg`, { type: 'image/jpeg' }), controller.signal);
      if (!mounted.current || generation.current !== request || controller.signal.aborted) return;
      const content = `${question.trim() || t('请结合当前任务，帮我理解这张画面并建议下一步。', 'Use this frame and our current task to help me understand what to do next.')}\n\n${t('这是我主动分享的单帧画面，采集时间：', 'I explicitly shared this single frame at: ')}${stamp.toISOString()}${t('。仅作为当前对话材料，不据此建立长期个人事实。', '. Use it for this conversation; do not infer lasting personal facts from it.')}`;
      // Once submitted, the task message is the durable record. Do not abort its
      // response and silently resend: an interrupted observation is not failure.
      await api(`/tasks/${task.id}/message`, { method: 'POST', body: JSON.stringify({ content, attachmentIds: [attachment.id] }) });
      if (mounted.current) { setSentAt(stamp.toLocaleTimeString()); setQuestion(''); }
      try { await onRefresh(); }
      catch {
        if (mounted.current && generation.current === request) setError(t('画面已加入对话，但状态刷新失败。请刷新查看，不必重复发送。', 'The frame was added, but the status could not refresh. Refresh to check; do not send it again.'));
      }
    } catch (cause) {
      if (mounted.current && generation.current === request && !controller.signal.aborted) setError(messageOf(cause));
    } finally { if (mounted.current && generation.current === request) setSending(false); if (upload.current === controller) upload.current = null; }
  }

  return <div className="screen-preview">
    <div className={`screen-preview-stage ${sharing ? 'is-sharing' : ''}`}>
      <video ref={video} autoPlay muted playsInline aria-label={t('所选窗口的实时画面', 'Live preview of the selected window')} />
      {!sharing && <div className="screen-preview-placeholder"><Desktop /><strong>{t('一起看看眼前的事', 'Look at it together')}</strong><p>{t('选择窗口，再把需要帮助的画面交给分身。', 'Choose a window, then share the frame you want help with.')}</p></div>}
    </div>
    <div className="screen-preview-controls">{sharing ? <><span role="status">{t('窗口正在共享', 'Window sharing is on')}</span><Button color="secondary" variant="outline" size="sm" onClick={stop}><Stop />{t('停止共享', 'Stop sharing')}</Button></> : <Button color="primary" size="sm" disabled={!available || choosing} loading={choosing} onClick={() => void start()}><Desktop />{t('选择窗口或屏幕', 'Choose a window or screen')}</Button>}</div>
    {sharing && <div className="screen-context-question"><Textarea aria-label={t('关于这张画面的问题', 'Question about this frame')} rows={3} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('哪里需要一起想一想？', 'What would you like help with?')} /><Button color="primary" disabled={!canSend || sending} loading={sending} onClick={() => void sendFrame()}>{t('把当前画面发给分身', 'Send this frame to your twin')}</Button>{!canSend && <p>{task.mode === 'demo' ? t('在真实任务中可发送画面。', 'Share frames from a live task.') : t('等当前执行结束后，即可继续看这张画面。', 'You can share the next frame when this run finishes.')}</p>}</div>}
    {sentAt && <p className="workbench-note" role="status">{t(`${sentAt} 的画面已加入当前对话。`, `The frame captured at ${sentAt} was added to this conversation.`)}</p>}
    <ErrorNotice error={error} />
    <p className="workbench-note">{available ? t('点击发送时，只有当下这一帧和你的问题会交给本轮模型。停止共享后不再采集；已发送画面保留在这段对话中。', 'Only the frame you send and your question go to this task’s model. Stopping ends capture; previously sent frames remain in this conversation.') : t('当前浏览器不支持画面共享，请在 SecondU 桌面应用中打开。', 'This browser does not support screen sharing. Open SecondU desktop to use it.')}</p>
  </div>;
}
