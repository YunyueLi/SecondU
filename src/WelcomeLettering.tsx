import type { CSSProperties } from 'react';
import { lettering, letteringWidth } from './welcomeLetteringData';

/** Fixed lettering stays vector sharp and does not depend on a network font. */
export function WelcomeLettering({ preview = false }: { preview?: boolean }) {
  return <svg className={`welcome-lettering ${preview ? 'is-preview' : ''}`} viewBox={`-110 -1750 ${letteringWidth + 220} 2100`} role="img" aria-label="Hi, SecondU">
    <g transform="scale(1,-1)">{lettering.map((glyph, index) => <path key={index} d={glyph.d} transform={`translate(${glyph.x},0)`} pathLength="1" style={{ '--ink-delay': `${120 + index * 180 + (index > 2 ? 180 : 0)}ms` } as CSSProperties} />)}</g>
  </svg>;
}
