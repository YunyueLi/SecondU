import { Chat, Document, Mail, Mobile } from '@openai/apps-sdk-ui/components/Icon';
import './platform-icons.css';

const colorIcons = import.meta.glob<string>('./platform-icons/*.svg', { eager: true, query: '?url', import: 'default' });

export function PlatformIcon({ platform }: { platform: string }) {
  const aliases:Record<string,string>={msteams:'teams',qqbot:'qq',lark:'feishu','google-chat':'googlechat'};
  const iconName = aliases[platform]??platform;
  const colorIcon = colorIcons[`./platform-icons/${iconName}.svg`];
  return <i className={`platform-icon platform-${platform}`} aria-hidden="true">{colorIcon ? <img src={colorIcon} alt="" draggable={false} /> : ['instagram','messenger'].includes(platform)
    ? <i className="platform-icon-mask" style={{maskImage:`url('/icons/platforms/${platform}.svg')`}} />
    : platform === 'email' ? <Mail /> : platform === 'sms' ? <Mobile /> : platform === 'all' ? <Chat /> : <Document />}</i>;
}

export function PlatformOption({ value, label }: { value: string; label: string }) {
  return <span className="platform-option"><PlatformIcon platform={value}/><span className="platform-option-label">{label}</span></span>;
}
