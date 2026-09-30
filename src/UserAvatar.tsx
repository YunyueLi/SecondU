import { createContext, useContext, useState, type CSSProperties } from 'react';
import './user-avatar.css';
import { apiUrl } from './space';

export const UserAvatarContext = createContext<string | undefined>(undefined);

export const DEFAULT_USER_AVATAR = '/art/twin-badge-v1.png';

/** A decorative avatar beside an already visible name. Explicit images take precedence. */
export function UserAvatar({ src, size, className = '' }: { src?: string; size?: number; className?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  const profileImage = useContext(UserAvatarContext);
  const source = src === undefined ? profileImage : src;
  const custom = !!source && source !== failedSource;
  const image = custom ? (source.startsWith('/api/') ? apiUrl(source) : source) : DEFAULT_USER_AVATAR;
  return <span className={`user-avatar ${custom ? 'has-custom-image' : ''} ${className}`} style={size ? { '--user-avatar-size': `${size}px` } as CSSProperties : undefined} aria-hidden="true">
    <img src={image} alt="" draggable={false} onError={custom ? () => setFailedSource(source) : undefined} />
  </span>;
}
