import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { t } from './i18n';
import './sidebarResize.css';

const STORAGE_KEY = 'hither.sidebarWidth';
export const DEFAULT_SIDEBAR_WIDTH = 232;
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 360;
export const clampSidebarWidth = (width: number) => Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Number.isFinite(width) ? width : DEFAULT_SIDEBAR_WIDTH)));

export function useSidebarWidth() {
  const [width, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? DEFAULT_SIDEBAR_WIDTH : clampSidebarWidth(Number(saved));
    } catch { return DEFAULT_SIDEBAR_WIDTH; }
  });
  const setWidth = useCallback((next: number) => {
    const value = clampSidebarWidth(next);
    setValue(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* Resizing remains usable when storage is unavailable. */ }
  }, []);
  return { width, setWidth, style: { '--hither-sidebar-width': `${width}px` } as CSSProperties };
}

export function SidebarResizeHandle({ width, onChange }: { width: number; onChange: (width: number) => void }) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="sidebar-resize-handle" role="separator" tabIndex={0}
    aria-label={t('调整导航栏宽度', 'Resize sidebar')} aria-orientation="vertical"
    aria-valuemin={MIN_SIDEBAR_WIDTH} aria-valuemax={MAX_SIDEBAR_WIDTH} aria-valuenow={width}
    aria-valuetext={t(`${width} 像素`, `${width} pixels`)}
    title={t('拖动调整宽度，双击恢复默认；也可用左右方向键或 Home 键', 'Drag to resize, double-click to reset; or use Left, Right, and Home')}
    data-resizing={resizing}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
      setResizing(true);
    }}
    onPointerMove={event => {
      if (drag.current?.pointerId === event.pointerId) onChange(drag.current.width + event.clientX - drag.current.x);
    }}
    onPointerUp={finish} onPointerCancel={finish}
    onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
    onDoubleClick={() => onChange(DEFAULT_SIDEBAR_WIDTH)}
    onKeyDown={event => {
      const step = event.shiftKey ? 20 : 10;
      const next = event.key === 'ArrowLeft' ? width - step : event.key === 'ArrowRight' ? width + step : event.key === 'Home' ? DEFAULT_SIDEBAR_WIDTH : event.key === 'End' ? MAX_SIDEBAR_WIDTH : null;
      if (next !== null) { event.preventDefault(); onChange(next); }
    }} />;
}
