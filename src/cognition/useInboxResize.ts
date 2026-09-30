import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const STORAGE_KEY = 'hither-inbox-list-width-v1';
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

function savedWidth() {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
  } catch { return DEFAULT_WIDTH; }
}

export function useInboxResize(containerWidth: number, hasInlineDetails: boolean) {
  const [preferredWidth, setPreferredWidth] = useState(savedWidth);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ pointer: number; startX: number; startWidth: number; current: number } | undefined>(undefined);
  const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, containerWidth - (hasInlineDetails ? 250 : 0) - 320));
  const width = Math.max(MIN_WIDTH, Math.min(preferredWidth, maxWidth));
  const clamp = (value: number) => Math.round(Math.max(MIN_WIDTH, Math.min(value, maxWidth)));

  function commit(value: number) {
    const next = clamp(value);
    setPreferredWidth(next);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* Resizing still works without storage. */ }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    commit(gesture.current.current);
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    gesture.current = { pointer: event.pointerId, startX: event.clientX, startWidth: width, current: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    active.current = clamp(active.startWidth + event.clientX - active.startX);
    setPreferredWidth(active.current);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 16;
    const next = event.key === 'ArrowLeft' ? width - step : event.key === 'ArrowRight' ? width + step
      : event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? maxWidth
      : event.key === 'Enter' ? DEFAULT_WIDTH : undefined;
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  }
  return {
    width, minWidth: MIN_WIDTH, maxWidth, dragging,
    separatorProps: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish,
      onLostPointerCapture: finish, onDoubleClick: () => commit(DEFAULT_WIDTH), onKeyDown },
  };
}
