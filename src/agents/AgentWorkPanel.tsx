import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import type { AgentProfile, Bootstrap } from '../../shared/contracts';
import type { AgentResourceKind } from '../../shared/agent-resources';
import { messageOf, write } from '../api';
import { ErrorNotice, Field, TaskBadge } from '../components';
import { t } from '../i18n';
import { ConnectionSelect } from '../models/ConnectionSelect';
import { ProviderMark } from '../models/providers';
import { AgentResources } from './AgentResources';
import { isSelfAgent } from './agentProfiles';
import './agent-work-panel.css';

export type AgentPanelState = { dirty: boolean; busy: boolean };
export type AgentPanelView = 'model' | 'resources' | 'history';
export function canLeaveAgentPanel(state: AgentPanelState) {
  return !state.busy && (!state.dirty || window.confirm(t('还有未保存的修改，仍然切换？', 'You have unsaved changes. Switch anyway?')));
}

/** One detail surface; account forms and model changes never open another modal. */
export function AgentWorkPanel({ agent, data, initialView = 'model', resourceKind, onTask, onSettings, onRefresh, onStateChange }: {
  agent: AgentProfile; data: Bootstrap; initialView?: AgentPanelView; resourceKind?: AgentResourceKind;
  onTask: (id: string) => void; onSettings: () => void;
  onRefresh: () => Promise<void>; onStateChange: (state: AgentPanelState) => void;
}) {
  const self = isSelfAgent(agent), subject = self ? 'hither' : agent.id;
  const [view, setView] = useState<AgentPanelView>(initialView);
  const [modelState, setModelState] = useState<AgentPanelState>({ dirty: false, busy: false });
  const [resourceDirty, setResourceDirty] = useState(false), [resourceBusy, setResourceBusy] = useState(false);
  const [resourceVisit, setResourceVisit] = useState(initialView === 'resources' ? subject : '');
  const state = { dirty: modelState.dirty || resourceDirty, busy: modelState.busy || resourceBusy };
  const stateRef = useRef(state); stateRef.current = state;
  const content = useRef<HTMLDivElement>(null);
  const tasks = data.tasks.filter(task => self ? !task.agentIds.length : task.agentIds.includes(agent.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  useEffect(() => { onStateChange(state); }, [modelState.dirty, modelState.busy, resourceDirty, resourceBusy, onStateChange]);
  useEffect(() => {
    setModelState({ dirty: false, busy: false }); setResourceDirty(false); setResourceBusy(false);
    setView(initialView); setResourceVisit(initialView === 'resources' ? subject : ''); content.current?.scrollTo({ top: 0 });
  }, [subject, initialView]);
  useEffect(() => {
    if (!state.dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent);
  }, [state.dirty]);
  function show(next: AgentPanelView) { setView(next); if (next === 'resources') setResourceVisit(subject); content.current?.scrollTo({ top: 0 }); }
  function act(action: () => void) { if (canLeaveAgentPanel(stateRef.current)) action(); }
  return <div className="agent-work-panel">
    <SegmentedControl value={view} onChange={show} size="md" block aria-label={t('Agent 设置内容', 'Agent settings')} className="agent-work-tabs">
      <SegmentedControl.Option value="model">{t('模型', 'Model')}</SegmentedControl.Option>
      <SegmentedControl.Option value="resources">{t('账号与权限', 'Accounts')}</SegmentedControl.Option>
      <SegmentedControl.Option value="history">{t('工作记录', 'Activity')}</SegmentedControl.Option>
    </SegmentedControl>
    <div className="agent-work-content" ref={content}>
      <div className="agent-work-section" hidden={view !== 'model'}><AgentModelPanel key={subject} agent={agent} data={data} onRefresh={onRefresh} onStateChange={setModelState} onSettings={() => act(onSettings)} /></div>
      <div className="agent-work-section agent-work-resources" hidden={view !== 'resources'}>{resourceVisit === subject && <AgentResources key={subject} data={data} agentId={subject} isSelf={self} embedded onRefresh={onRefresh} onDirtyChange={setResourceDirty} onBusyChange={setResourceBusy} requestedKind={resourceKind ? { kind: resourceKind, sequence: 1 } : undefined} />}</div>
      <div className="agent-work-section" hidden={view !== 'history'}><div className="agent-work-history">{tasks.length ? tasks.map(task => <button key={task.id} type="button" onClick={() => act(() => onTask(task.id))}><span><strong>{task.title}</strong><small>{new Date(task.updatedAt).toLocaleDateString()}</small></span><TaskBadge status={task.status} /><ArrowRight /></button>) : <p className="agent-work-empty">{t('还没有工作记录', 'No work yet')}</p>}</div></div>
    </div>
  </div>;
}

function AgentModelPanel({ agent, data, onRefresh, onStateChange, onSettings }: { agent: AgentProfile; data: Bootstrap; onRefresh: () => Promise<void>; onStateChange: (state: AgentPanelState) => void; onSettings: () => void }) {
  const self = isSelfAgent(agent), baseline = self ? data.defaultConnectionId : agent.connectionId || 'default';
  const [value, setValue] = useState(baseline), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const baselineRef = useRef(baseline), dirty = value !== baseline;
  useEffect(() => { if (baselineRef.current !== baseline) { baselineRef.current = baseline; setValue(baseline); } }, [baseline]);
  useEffect(() => onStateChange({ dirty, busy }), [dirty, busy, onStateChange]);
  const defaultConnection = data.modelConnections.find(item => item.id === data.defaultConnectionId);
  const current = data.modelConnections.find(item => item.id === (value === 'default' ? data.defaultConnectionId : value));
  async function save() {
    if (busy || !dirty) return; setBusy(true); setError(''); setNotice('');
    try {
      if (self) await write(`/model-connections/${value}/default`);
      else await write(`/agents/${agent.id}`, { connectionId: value === 'default' ? null : value }, 'PUT');
      await onRefresh(); setNotice(t('已保存，下一轮对话生效', 'Saved. Applies on the next turn.'));
    } catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); }
  }
  return <form className="agent-model-panel" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="agent-model-selection"><div>
    <Field label={self ? t('默认模型连接', 'Default model connection') : t('使用的模型连接', 'Model connection')}><ConnectionSelect value={value} onChange={next => { setValue(next); setNotice(''); setError(''); }} connections={data.modelConnections} defaultConnection={defaultConnection} inheritValue="default" includeInherit={!self} disabled={busy} /></Field>
    <p>{self ? t('数字分身和选择“跟随默认连接”的 Agent 使用此模型。', 'Your digital twin and agents using the default connection share this model.') : value === 'default' ? t('默认连接改变后，这位 Agent 也会随之更新。', 'This agent follows changes to the default connection.') : t('这位 Agent 单独使用此连接，其他 Agent 保持原设置。', 'This connection applies only to this agent.')}</p>
    </div>
    {current && <div className="agent-model-current"><ProviderMark provider={current.provider} /><span><strong>{current.model}</strong><small>{current.name}</small></span>{!current.hasKey && <small>{t('尚未接入', 'Not connected')}</small>}</div>}
    </div>
    <ErrorNotice error={error} />{notice && <p role="status">{notice}</p>}
    <div className="agent-model-actions"><Button type="button" size="md" color="secondary" variant="ghost" onClick={onSettings} disabled={busy}>{t('管理模型连接', 'Manage connections')}</Button><span /><Button type="button" size="md" color="secondary" variant="ghost" disabled={busy || !dirty} onClick={() => { setValue(baseline); setError(''); setNotice(''); }}>{t('取消修改', 'Discard')}</Button><Button type="submit" size="md" color="primary" loading={busy} disabled={busy || !dirty}>{t('保存', 'Save')}</Button></div>
  </form>;
}
