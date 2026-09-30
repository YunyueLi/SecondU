import { Chat, Document } from '@openai/apps-sdk-ui/components/Icon';
import './platform-icons.css';

const colorIcons = import.meta.glob<string>('./platform-icons/*.svg', { eager: true, query: '?url', import: 'default' });

export function PlatformIcon({ platform }: { platform: string }) {
  const colorIcon = colorIcons[`./platform-icons/${platform}.svg`];
  return <i className={`platform-icon platform-${platform}`} aria-hidden="true">{colorIcon ? <img src={colorIcon} alt="" draggable={false} /> : ['instagram','signal','messenger'].includes(platform)
    ? <i className="platform-icon-mask" style={{maskImage:`url('/icons/platforms/${platform}.svg')`}} />
    : platform === 'all' ? <Chat /> : <Document />}</i>;
}

export function PlatformOption({ value, label }: { value: string; label: string }) {
  return <span className="platform-option"><PlatformIcon platform={value}/><span className="platform-option-label">{label}</span></span>;
}
