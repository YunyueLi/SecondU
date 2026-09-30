import { t } from '../i18n';
import { useEffect, useState } from 'react';
import type { AgentProfile, Bootstrap, ModelConnection } from '../../shared/contracts';
import { AgentAvatar } from '../agents/AgentIdentity';
import { ErrorNotice } from '../components';
import { write, messageOf } from '../api';
import { ConnectionSelect } from './ConnectionSelect';

export function AgentModelAssignments({ data, connections, defaultId, onRefresh }: { data: Bootstrap; connections: ModelConnection[]; defaultId: string; onRefresh: () => Promise<void> }) {
  const [agents, setAgents] = useState(data.agents);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => setAgents(data.agents), [data.agents]);
  const defaultConnection = connections.find(connection => connection.id === defaultId);
  async function assign(agent: AgentProfile, value: string) {
    if (busy) return;
    setBusy(agent.id); setError(''); setNotice('');
    try {
      const saved = await write<AgentProfile>(`/agents/${agent.id}`, { connectionId: value === 'inherit' ? '' : value }, 'PUT');
      setAgents(current => current.map(item => item.id === saved.id ? saved : item));
      setNotice(t(`${agent.name}的模型选择已保存。`, `Model selection saved for ${agent.name}.`));
      try { await onRefresh(); } catch (err) { setError(t(`已保存，但刷新未完成：${messageOf(err)}`, `Saved, but refresh failed: ${messageOf(err)}`)); }
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(''); }
  }
  if (!agents.length) return null;
  return <section className="model-agent-assignments" aria-labelledby="agent-model-assignments-title"><div className="model-assignment-heading"><h3 id="agent-model-assignments-title">{t("每位助理的模型", "Models for your assistants")}</h3><p>{t("选择独立连接，或跟随全局默认。", "Choose a separate connection or use the global default.")}</p></div><div className="model-assignment-list">{agents.map(agent => <div className="model-assignment-row" key={agent.id}><AgentAvatar agent={agent} size={32} /><label htmlFor={`agent-model-${agent.id}`}><strong>{agent.name}</strong><small>{agent.role}</small></label><ConnectionSelect id={`agent-model-${agent.id}`} value={agent.connectionId || 'inherit'} connections={connections} defaultConnection={defaultConnection} onChange={value => void assign(agent, value)} disabled={!!busy} loading={busy === agent.id} /></div>)}</div><div className="model-assignment-feedback" aria-live="polite"><ErrorNotice error={error} />{notice && <p>{notice}</p>}</div></section>;
}
