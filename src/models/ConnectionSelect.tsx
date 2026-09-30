import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Globe } from '@openai/apps-sdk-ui/components/Icon';
import type { ModelConnection } from '../../shared/contracts';
import { t } from '../i18n';
import { ProviderMark, type Provider } from './providers';
import './models.css';

type ConnectionOption = { value: string; label: string; model?: string; provider?: Provider };

function ConnectionOptionView(option: ConnectionOption) {
  return <span className="model-connection-option"><span className="model-option-logo">{option.provider ? <ProviderMark provider={option.provider} size={18} /> : <Globe />}</span><span><strong>{option.label}</strong><small>{option.model}</small></span></span>;
}

function ConnectionTriggerView(option: ConnectionOption) {
  return <span className="model-connection-trigger" title={[option.label, option.model].filter(Boolean).join(', ')}>{option.provider ? <ProviderMark provider={option.provider} size={16} /> : <Globe />}<span>{option.label}</span></span>;
}

/** Shared by settings and the assistant editor; the inherited value stays caller-owned. */
export function ConnectionSelect({ id, value, onChange, connections, defaultConnection, inheritValue = 'inherit', disabled, loading }: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  connections: ModelConnection[];
  defaultConnection?: ModelConnection;
  inheritValue?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const options: ConnectionOption[] = [
    { value: inheritValue, label: t('跟随默认连接', 'Use default connection'), model: defaultConnection?.model || t('尚未设置默认连接', 'No default connection') },
    ...connections.map(connection => ({ value: connection.id, label: connection.name, provider: connection.provider, model: `${connection.model}${connection.hasKey ? '' : t('（需添加密钥）', ' (key required)')}` })),
  ];
  return <Select<ConnectionOption> id={id} value={value} options={options} onChange={option => onChange(option.value)} disabled={disabled} loading={loading} size="md" block={false} align="start" alignOffset={0} triggerClassName="model-compact-select model-connection-select" listWidth="auto" listMinWidth={220} listMaxWidth={300} OptionView={ConnectionOptionView} TriggerView={ConnectionTriggerView} searchPlaceholder={t('查找连接', 'Find a connection')} />;
}
