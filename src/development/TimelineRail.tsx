import {useLayoutEffect, useRef} from 'react';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import './timeline-rail.css';

export type TimelineNode = {id: string; title: string; date: string; time: string; at: string};

/** Both surfaces use whole-node widths, including the final scroll position. */
export function TimelineRail({nodes, selectedId, onSelect, label, previousLabel, nextLabel, detailId}: {
  nodes: TimelineNode[]; selectedId: string; onSelect: (id: string) => void;
  label: string; previousLabel: string; nextLabel: string; detailId: string;
}) {
  const rail = useRef<HTMLOListElement>(null);
  const active = Math.max(0, nodes.findIndex(node => node.id === selectedId));
  useLayoutEffect(() => {
    const element = rail.current;
    if (!element || !nodes.length) return;
    const align = () => {
      const width = element.clientWidth;
      if (!width) return;
      const columns = Math.min(nodes.length, Math.max(1, Math.floor(width / 200)));
      element.style.setProperty('--timeline-columns', String(columns));
      const nodeWidth = width / columns;
      const first = Math.round(element.scrollLeft / nodeWidth);
      const visibleFirst = active < first ? active : active >= first + columns ? active - columns + 1 : first;
      element.scrollTo({left: Math.max(0, Math.min(nodes.length - columns, visibleFirst)) * nodeWidth, behavior: 'instant'});
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, nodes.length]);
  const move = (index: number, focus = false) => {
    const target = Math.max(0, Math.min(nodes.length - 1, index));
    onSelect(nodes[target].id);
    if (focus) rail.current?.querySelectorAll<HTMLButtonElement>('button')[target]?.focus({preventScroll: true});
  };
  return <div className="development-rail">
    <div className="development-rail-bar"><span>{label}</span><div>
      <button type="button" className="development-rail-previous" disabled={active === 0} aria-label={previousLabel} onClick={() => move(active - 1)}><ArrowRight/></button>
      <button type="button" disabled={active === nodes.length - 1} aria-label={nextLabel} onClick={() => move(active + 1)}><ArrowRight/></button>
    </div></div>
    <ol ref={rail} aria-label={label} onKeyDown={event => {
      const focused = Array.from(event.currentTarget.querySelectorAll('button')).indexOf((event.target as HTMLElement).closest('button') as HTMLButtonElement);
      const origin = focused < 0 ? active : focused;
      const index = event.key === 'ArrowLeft' ? origin - 1 : event.key === 'ArrowRight' ? origin + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : null;
      if (index === null) return;
      event.preventDefault(); move(index, true);
    }}>
      {nodes.map(node => <li key={node.id}><button type="button" aria-pressed={node.id === selectedId} aria-controls={detailId} onClick={() => onSelect(node.id)}>
        <time dateTime={node.at}><span>{node.date}</span><span>{node.time}</span></time><i aria-hidden="true"/><strong>{node.title}</strong>
      </button></li>)}
    </ol>
  </div>;
}
