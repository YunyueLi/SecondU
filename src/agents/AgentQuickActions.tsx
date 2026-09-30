import { useEffect, useState } from 'react';
import { ConnectApps, CreditCard, Desktop, Globe, Mail, Phone } from '@openai/apps-sdk-ui/components/Icon';
import type { AgentProfile, Bootstrap } from '../../shared/contracts';
import type { AgentResource, AgentResourceKind } from '../../shared/agent-resources';
import { api } from '../api';
import { t } from '../i18n';
import { isSelfAgent } from './agentProfiles';
import type { AgentPanelView } from './AgentWorkPanel';

export type OpenAgentDetails = (agent: AgentProfile, view?: AgentPanelView, kind?: AgentResourceKind) => void;

/** Compact shortcuts keep the full badge intact; every editor has one surface. */
export function AgentQuickActions({ agent, data, onOpen }: { agent: AgentProfile; data: Bootstrap; onOpen: OpenAgentDetails }) {
  const subject = isSelfAgent(agent) ? 'hither' : agent.id;
  const [snapshot, setSnapshot] = useState<{ subject: string; resources: AgentResource[]; failed?: boolean }>();
  useEffect(() => {
    let cancelled = false;
    api<AgentResource[]>(`/agent-resources?agentId=${encodeURIComponent(subject)}`).then(resources => {
      if (!cancelled) setSnapshot({ subject, resources });
    }).catch(() => { if (!cancelled) setSnapshot({ subject, resources: [], failed: true }); });
    return () => { cancelled = true; };
  }, [subject, data]);
  const connection = data.modelConnections.find(item => item.id === (agent.connectionId || data.defaultConnectionId));
  function status(kind: AgentResourceKind) {
    if (!snapshot || snapshot.subject !== subject) return t('正在读取', 'Loading');
    if (snapshot.failed) return t('无法读取账号', 'Could not load accounts');
    const found = snapshot.resources.filter(item => item.kind === kind);
    if (!found.length) return t('未绑定', 'Not bound');
    if (found.length > 1) return t(`${found.length} 个账号`, `${found.length} accounts`);
    return ({ pending: t('待接通', 'Not connected'), ready: t('检查通过', 'Verified'), simulated: t('模拟检查', 'Simulated'), unavailable: t('暂不可用', 'Unavailable'), error: t('检查失败', 'Check failed'), disabled: t('已停用', 'Disabled') })[found[0].status];
  }
  return <nav className="agent-quick-actions" aria-label={t('模型与账号', 'Model and accounts')}>
    <button type="button" title={`${t('模型：', 'Model: ')}${connection?.model || t('未设置', 'Not configured')}`} onClick={() => onOpen(agent, 'model')}><Globe /><span>{t('模型', 'Model')}</span></button>
    {([{ kind: 'email', label: t('邮箱', 'Email'), Icon: Mail }, { kind: 'phone', label: t('电话', 'Phone'), Icon: Phone }, { kind: 'payment', label: t('支付', 'Pay'), Icon: CreditCard }] as const).map(item => <button type="button" key={item.kind} title={`${item.label}${t('：', ': ')}${status(item.kind)}`} onClick={() => onOpen(agent, 'resources', item.kind)}><item.Icon /><span>{item.label}</span></button>)}
    <button type="button" title={t(`当前电脑：${data.computer.name}`, `This computer: ${data.computer.name}`)} onClick={() => { location.hash = 'settings/computer'; }}><Desktop /><span>{t('电脑', 'Computer')}</span></button>
    <button type="button" title={t(`已配置 ${data.connectors?.length || 0} 个连接器`, `${data.connectors?.length || 0} connectors configured`)} onClick={() => { location.hash = 'settings/connectors'; }}><ConnectApps /><span>{t('连接器', 'Apps')}</span></button>
  </nav>;
}
