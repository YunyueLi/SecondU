import { createContext, useContext, useState, type CSSProperties } from 'react';
import { Users } from '@openai/apps-sdk-ui/components/Icon';
import './user-avatar.css';
import { apiUrl } from './space';

export const UserAvatarContext = createContext<string | undefined>(undefined);

/** A decorative avatar beside an already visible name. Explicit images take precedence. */
export function UserAvatar({ src, size, className = '' }: { src?: string; size?: number; className?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  const profileImage = useContext(UserAvatarContext);
  const source = src === undefined ? profileImage : src;
  const custom = !!source && source !== failedSource;
  const image = custom ? (source.startsWith('/api/') ? apiUrl(source) : source) : undefined;
  return <span className={`user-avatar ${custom ? 'has-custom-image' : ''} ${className}`} style={size ? { '--user-avatar-size': `${size}px` } as CSSProperties : undefined} aria-hidden="true">
    {custom ? <img src={image} alt="" draggable={false} onError={() => setFailedSource(source)} /> : <Users className="user-avatar-symbol" />}
  </span>;
}
