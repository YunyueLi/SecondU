import {t} from '../i18n';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AllocationGroup } from './AllocationDonut';
import './AssetFlow.css';

type Props = {
  groups: readonly AllocationGroup[];
  currency: string;
  assets: bigint;
  debt: bigint | null;
  hidden: boolean;
  compact?: boolean;
  renderInstitution: (group: AllocationGroup, summaryOnly: boolean) => ReactNode;
  renderAmount: (value: string, currency: string) => ReactNode;
};
type Band = { key: string; path: string; color: string; x: number; y: number; height: number };
type Geometry = { width: number; height: number; bands: Band[]; sources: Band[]; trunk: { x: number; y: number; height: number } };

const positive = (value: bigint) => value > 0n ? value : 0n;
const ratio = (value: bigint, total: bigint) => total > 0n ? Number(positive(value) * 1_000_000n / total) / 1_000_000 : 0;
const decimal = (value: bigint) => {
  const amount = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
};
const percentage = (value: bigint, total: bigint) => {
  if (value <= 0n || total <= 0n) return '0%';
  const tenths = (value * 1000n + total / 2n) / total;
  return tenths === 0n ? '<0.1%' : `${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ''}%`;
};
const ribbon = (x1: number, y1: number, x2: number, y2: number, width: number) => {
  const half = width / 2, bend = (x2 - x1) * .5;
  return `M ${x1} ${y1 - half} C ${x1 + bend} ${y1 - half}, ${x2 - bend} ${y2 - half}, ${x2} ${y2 - half} L ${x2} ${y2 + half} C ${x2 - bend} ${y2 + half}, ${x1 + bend} ${y1 + half}, ${x1} ${y1 + half} Z`;
};

/** Content stays in normal flow; SVG connections follow the measured content. */
export function AssetFlow({ groups, currency, assets, debt, hidden, compact = false, renderInstitution, renderAmount }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const trunkRef = useRef<HTMLDivElement>(null);
  const netRef = useRef<HTMLDivElement>(null);
  const debtRef = useRef<HTMLDivElement>(null);
  const institutionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const total = groups.reduce((sum: bigint, group: AllocationGroup) => sum + positive(group.amount), 0n);
  const net = debt === null ? null : assets - debt;
  const hasFunding = debt !== null && net !== null && (hidden || net >= 0n);

  useLayoutEffect(() => {
    const canvas = canvasRef.current, trunk = trunkRef.current;
    if (!canvas || !trunk) return;
    let frame = 0, disposed = false;
    const measure = () => {
      frame = 0;
      if (disposed) return;
      if (hidden || getComputedStyle(canvas).getPropertyValue('--asset-flow-stacked').trim() === '1') {
        setGeometry(previous => previous === null ? previous : null);
        return;
      }
      const bounds = canvas.getBoundingClientRect(), anchor = trunk.getBoundingClientRect();
      if (!bounds.width || !anchor.height) return;
      const rows = groups.map((group, index) => ({ group, bounds: institutionRefs.current[index]?.getBoundingClientRect(), fraction: ratio(group.amount, total) }));
      const fundingTotal = hasFunding ? positive(net!) + positive(debt!) : 0n;
      const funding = hasFunding ? [{ key: 'net', value: net!, element: netRef.current, color: 'var(--green-600)' }, { key: 'debt', value: debt!, element: debtRef.current, color: 'var(--orange-500)' }] : [];
      // Keep proportional bands inside the measured row, with a four-pixel inset at each edge.
      const thickness = Math.max(0, Math.min(anchor.height,
        ...rows.filter(row => row.bounds && row.fraction > 0).map(row => Math.max(0, row.bounds!.height - 8) / row.fraction),
        ...funding.filter(source => source.element && source.value > 0n).map(source => Math.max(0, source.element!.getBoundingClientRect().height - 8) / ratio(source.value, fundingTotal))));
      const x = anchor.left - bounds.left, center = anchor.top - bounds.top + anchor.height / 2;
      const top = center - thickness / 2;
      let cursor = top;
      const bands = rows.flatMap(({ group, bounds: row, fraction }, index) => {
        if (!row || fraction <= 0) return [];
        const height = fraction * thickness, y = row.top - bounds.top + row.height / 2, targetX = row.left - bounds.left - 8;
        const band = { key: `${group.id}-${index}`, path: ribbon(x + anchor.width, cursor + height / 2, targetX, y, height), color: group.color || 'var(--blue-500)', x: targetX, y: y - height / 2, height };
        cursor += height;
        return [band];
      });
      const sources: Band[] = [];
      if (hasFunding && debt !== null && net !== null) {
        let sourceCursor = top;
        for (const source of funding) {
          if (!source.element || source.value <= 0n) continue;
          const sourceBounds = source.element.getBoundingClientRect(), height = ratio(source.value, fundingTotal) * thickness;
          const startX = sourceBounds.right - bounds.left + 8, y = sourceBounds.top - bounds.top + sourceBounds.height / 2;
          sources.push({ key: source.key, path: ribbon(startX, y, x, sourceCursor + height / 2, height), color: source.color, x: startX - 4, y: y - height / 2, height });
          sourceCursor += height;
        }
      }
      const next = { width: bounds.width, height: bounds.height, bands, sources, trunk: { x, y: top, height: thickness } };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    [canvas, trunk, netRef.current, debtRef.current, ...institutionRefs.current].forEach(element => { if (element) observer.observe(element); });
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    void document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    measure();
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
    };
  }, [groups, total, net, debt, hasFunding, hidden, compact]);

  return <div className={`asset-flow${compact ? ' asset-flow-compact' : ''}${hidden ? ' asset-flow-hidden' : ''}`}>
    <div className="asset-flow-total-summary"><span>{t("总资产","Total assets")}</span>{renderAmount(decimal(assets), currency)}</div>
    <div ref={canvasRef} className={`asset-flow-canvas${hasFunding ? '' : ' asset-flow-without-funding'}`}>
      {geometry && <svg className="asset-flow-svg" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true" focusable="false">
        {geometry.sources.map(band => <g key={band.key}><path d={band.path} fill={band.color} fillOpacity=".23" /><rect x={band.x} y={band.y} width="4" height={band.height} rx="2" fill={band.color} fillOpacity=".7" /></g>)}
        {geometry.bands.map(band => <g key={band.key}><path d={band.path} fill={band.color} fillOpacity=".25" /><rect x={band.x} y={band.y} width="4" height={band.height} rx="2" fill={band.color} fillOpacity=".8" /></g>)}
        <rect x={geometry.trunk.x} y={geometry.trunk.y} width="8" height={geometry.trunk.height} rx="3" fill="var(--color-text-secondary)" />
      </svg>}
      <div className="asset-flow-origins">
        {hasFunding && debt !== null && <div className="asset-flow-funding">
          <div className="asset-flow-funding-node" ref={netRef}><span>{t("净资产","Net assets")}</span>{renderAmount(decimal(net!), currency)}</div>
          <div className="asset-flow-funding-node" ref={debtRef}><span>{t("负债","Liabilities")}</span>{renderAmount(decimal(debt), currency)}</div>
        </div>}
        <div className="asset-flow-total">
          <div className="asset-flow-trunk-anchor" ref={trunkRef} aria-hidden="true" />
        </div>
      </div>
      <div className="asset-flow-institutions">
        {groups.map((group, index) => <div className="asset-flow-institution" data-account-count={group.accounts?.length} key={`${group.id}-${index}`} ref={element => { institutionRefs.current[index] = element; }}>
          {renderInstitution(group, compact)}
          {!hidden && <div className="asset-flow-share" aria-label={t(`占当前总资产 ${percentage(positive(group.amount), total)}`, `${percentage(positive(group.amount), total)} of current assets`)}>
            <span className="asset-flow-share-track" aria-hidden="true"><span style={{ width: `${ratio(group.amount, total) * 100}%`, background: group.color || 'var(--blue-500)' } as CSSProperties} /></span>
            <span>{percentage(positive(group.amount), total)}</span>
          </div>}
        </div>)}
      </div>
    </div>
    {!hidden && net !== null && net < 0n && <p className="panorama-note">{t("净资产为负，图中展示现有资产分布。","Net assets are negative. The chart shows the distribution of current assets.")}</p>}
  </div>;
}
