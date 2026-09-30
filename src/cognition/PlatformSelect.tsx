import { Select } from '@openai/apps-sdk-ui/components/Select';
import type { ChatImportPlatform } from '../../shared/contracts';
import { t } from '../i18n';
import { PlatformOption } from './PlatformIcon';

export const platformLabels = (): Record<ChatImportPlatform, string> => ({ wechat:t('微信','WeChat'),wecom:t('企业微信','WeCom'),qq:'QQ',feishu:t('飞书','Feishu / Lark'),dingtalk:t('钉钉','DingTalk'),slack:'Slack',teams:'Microsoft Teams',telegram:'Telegram',discord:'Discord',signal:'Signal',line:'LINE',messenger:'Messenger',imessage:'iMessage',instagram:'Instagram',whatsapp:'WhatsApp',email:t('电子邮件','Email'),sms:t('短信','SMS'),generic:t('通用记录','General records') });
export const importPlatformOptions = () => Object.entries(platformLabels()).map(([value, label]) => ({ value, label }));

type Props = {
  value: string;
  options?: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
};

/** Shared branded, searchable platform field for imports and messaging connections. */
export function PlatformSelect({ value, options = importPlatformOptions(), onChange, disabled, 'aria-label': label }: Props) {
  return <Select size="md" block={false} align="start" listWidth="auto" listMinWidth={180} listMaxWidth={240}
    OptionView={PlatformOption} TriggerView={PlatformOption} value={value} options={options}
    disabled={disabled} aria-label={label || t('选择通信平台', 'Select platform')}
    onChange={option => onChange(option.value)} />;
}
