import type { CSSProperties } from 'react';
import './theme-decoration.css';

export const decorationKinds = ['profile', 'now', 'conversations', 'timeline', 'relationships', 'sources', 'agents', 'library', 'automations'] as const;
export type ThemeDecorationKind = typeof decorationKinds[number];

const legacyDecorations: Record<string, ThemeDecorationKind> = {
  '/art/page-timeline-v1.png': 'timeline',
  '/art/page-timeline-v2.png': 'timeline',
  '/art/page-connections-v1.png': 'relationships',
  '/art/page-connections-v2.png': 'relationships',
  '/art/page-sources-v1.png': 'sources',
  '/art/page-sources-v2.png': 'sources',
  '/art/page-agents-v1.png': 'agents',
  '/art/page-agents-v2.png': 'agents',
  '/art/page-library-v1.png': 'library',
  '/art/paper-archive.png': 'library',
  '/art/paper-rhythm.png': 'automations',
};

export function decorationForIllustration(illustration?: string) {
  return illustration ? legacyDecorations[illustration] : undefined;
}

/** One cached atlas per atmosphere. CSS selects the image and preserves its generated alpha. */
export function ThemeDecoration({ kind, className = '' }: { kind: ThemeDecorationKind; className?: string }) {
  const index = decorationKinds.indexOf(kind);
  const style = { '--decoration-x': `${(index % 3) * 50}%`, '--decoration-y': `${Math.floor(index / 3) * 50}%` } as CSSProperties;
  return <span className={`theme-decoration ${className}`} data-decoration={kind} style={style} aria-hidden="true" />;
}
