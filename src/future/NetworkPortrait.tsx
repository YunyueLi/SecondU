import type { CSSProperties } from 'react';

export function NetworkPortrait({ index, name, className = '' }: { index: number; name: string; className?: string }) {
  return <span className={`network-portrait ${className}`} role="img" aria-label={name} style={{ '--portrait-x': `${(index % 3) * 50}%`, '--portrait-y': `${Math.floor(index / 3) * 100}%` } as CSSProperties} />;
}
