import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Dialog, ErrorNotice, Field } from '../components';
import { write, messageOf } from '../api';
import type { FactKind, Source, Task } from '../../shared/contracts';

export function TaskFeedback({ task, feedback, onRefresh, onClose }: { task: Task; feedback: string; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [statement, setStatement] = useState(feedback); const [kind, setKind] = useState<FactKind>('preference'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [source, setSource] = useState<Source>();
  return <Dialog title="让助理从这次反馈中学习" onClose={onClose}><form className="cog-stack" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try {
    const evidence = source || await write<Source>('/sources', { title: `任务反馈：${task.title}`, kind: 'feedback', text: `任务 ID：${task.id}\n用户反馈原文：\n${feedback}` }); setSource(evidence);
    await write('/facts', { statement, kind, status: 'candidate', sourceIds: [evidence.id] }); await onRefresh(); onClose(); location.hash = 'self';
  } catch (error) { setError(messageOf(error)); } finally { setBusy(false); } }}><p className="cog-muted">这次补充可能只针对当前任务。请只保留你希望用于以后任务的理解，先存为待确认，不自动变成长期事实。</p><Field label="以后应该记住什么"><Textarea aria-label="从任务中学到的理解" required rows={4} value={statement} onChange={event => setStatement(event.target.value)} /></Field><Field label="理解类型"><Select value={kind} options={[{ value: 'preference', label: '偏好' }, { value: 'constraint', label: '约束' }, { value: 'decision', label: '决定' }, { value: 'value', label: '价值取向' }]} onChange={option => setKind(option.value as FactKind)} /></Field><ErrorNotice error={error} /><Button color="primary" type="submit" loading={busy}>保存为待确认的理解</Button></form></Dialog>;
}
