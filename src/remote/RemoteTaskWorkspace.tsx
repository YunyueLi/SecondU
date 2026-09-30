import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Desktop, ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import type { Task } from '../../shared/contracts';
import type { RemoteRun } from '../../shared/remote-computer-types';
import { api, messageOf } from '../api';
import { ErrorNotice } from '../components';
import { TaskChatActions } from '../TaskResourceMenu';
import { t } from '../i18n';
import { RemoteRunContent } from './RemoteRunDetail';
import './remote-task.css';

export function RemoteTaskWorkspace({ task, navigation, onRefresh }: { task: Task; navigation?: ReactNode; onRefresh: () => Promise<void> }) {
  const [run, setRun] = useState<RemoteRun>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lastUpdated = useRef('');
  useEffect(() => {
    const controller = new AbortController(); setRun(undefined); setError('');
    api<{ run: RemoteRun }>(`/tasks/${task.id}/remote`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setRun(result.run);
    }).catch(error => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [task.id, attempt]);
  function updated(next: RemoteRun) {
    setRun(next);
    const fingerprint = `${next.status}:${next.sequence}:${next.observation.status}:${next.cancelRequested}`;
    if (lastUpdated.current !== fingerprint) { lastUpdated.current = fingerprint; void onRefresh().catch(error => setError(messageOf(error))); }
  }
  return <div className="remote-task-workspace">
    <header className="conversation-header">{navigation}<h1 title={task.title}>{task.title}</h1><div className="conversation-header-actions"><TaskChatActions task={task} onRefresh={onRefresh} /></div></header>
    <div className="remote-task-scroll"><div className="remote-task-reading">
      <div className="remote-task-location"><Desktop /><span>{task.remoteExecution?.computerName || t('远程电脑', 'Remote computer')}</span><ButtonLink href="#settings/computer" color="secondary" variant="ghost" size="sm">{t('管理电脑', 'Manage computers')}<ArrowRight /></ButtonLink></div>
      <div className="remote-task-request"><p>{task.prompt}</p></div>
      <ErrorNotice error={error} />{error && <Button color="secondary" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{t('重新读取', 'Retry')}</Button>}
      {run ? <RemoteRunContent key={run.id} run={run} onUpdate={updated} /> : !error && <p role="status" className="remote-support">{t('正在读取任务记录…', 'Loading the task…')}</p>}
    </div></div>
    <footer className="remote-task-footer"><span>{t('新任务会重新确认电脑、模型和所需文件。', 'A new task asks you to confirm its computer, model and files.')}</span><ButtonLink href="#settings/computer" color="secondary" variant="outline" size="sm">{t('创建远程任务', 'New remote task')}<ArrowRight /></ButtonLink></footer>
  </div>;
}
