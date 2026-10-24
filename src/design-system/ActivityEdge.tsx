import { useEffect, useRef, type CSSProperties } from 'react';
import { observeActivityEdgeVisibility } from './activity-edge-visibility';
import { activityPaletteOptions } from '../../shared/appearance-options.mjs';
import './activity-edge.css';

export type ActivityEdgeProps = {
  active?: boolean;
  /** Uses the host surface's radius; the existing border remains stationary. */
  radius?: number | string;
  /** Omitted values follow appearance settings; quiet remains a compatibility alias. */
  intensity?: 'quiet' | 'subtle' | 'expressive';
  /** Catalogue-only color studies. Production follows the global accent. */
  palette?: 'theme' | 'graphite' | 'violet' | 'teal' | 'amber' | 'spectrum';
  /** Pauses the local visual preview; does not change task state. */
  paused?: boolean;
};

const defaultRadius = 'var(--hither-radius-panel, 12px)';

/** Soft light within and around a surface. The caller owns actual activity state. */
export function ActivityEdge({ active = false, radius = defaultRadius, intensity, palette, paused = false }: ActivityEdgeProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    return observeActivityEdgeVisibility(ref.current);
  }, [active]);
  if (!active) return null;
  const resolvedRadius = typeof radius === 'number'
    ? Number.isFinite(radius) ? `${Math.max(0, radius)}px` : defaultRadius
    : radius;

  return <span ref={ref} className="activity-edge" data-activity-edge=""
    data-intensity={intensity === 'quiet' ? 'subtle' : intensity} data-palette={palette}
    data-paused={String(paused)} data-visible="false" aria-hidden="true"
    style={{ '--activity-edge-radius': resolvedRadius,
      ...Object.fromEntries(activityPaletteOptions.filter(option => !['theme', 'spectrum'].includes(option.id)).map(option => [`--activity-edge-palette-${option.id}`, option.color])),
    } as CSSProperties}>
    <span className="activity-edge__light activity-edge__light--one" />
    <span className="activity-edge__light activity-edge__light--two" />
    <span className="activity-edge__light activity-edge__light--three" />
    <span className="activity-edge__accessible-outline" />
  </span>;
}
