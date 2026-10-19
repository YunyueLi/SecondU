const SCROLL_EPSILON = 1;
const MAX_DELTA = 1200;

/** Only explicit local HTTP(S) review hosts can receive this bridge's deltas. */
export function parseParentOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Convert vertical wheel input to CSS pixels without taking over zoom or pan. */
export function wheelDeltaPixels(event, { lineHeight = 16, pageHeight = 800 } = {}) {
  const { deltaY, deltaX = 0, deltaMode = 0 } = event;
  if (event.ctrlKey || event.metaKey || event.shiftKey
    || !Number.isFinite(deltaY) || !Number.isFinite(deltaX)
    || Math.abs(deltaY) <= Math.abs(deltaX) || ![0, 1, 2].includes(deltaMode)) return 0;
  const unit = deltaMode === 1 ? lineHeight : deltaMode === 2 ? pageHeight : 1;
  if (!Number.isFinite(unit) || unit <= 0) return 0;
  const pixels = deltaY * unit;
  return Number.isFinite(pixels) ? Math.max(-MAX_DELTA, Math.min(MAX_DELTA, pixels)) : 0;
}

/** Follow the browser's inner scroll chain, including containment boundaries. */
export function canScrollVertically(path, deltaY, getStyle) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return false;
  for (const node of path) {
    if (!node || ![node.scrollTop, node.scrollHeight, node.clientHeight].every(Number.isFinite)) continue;
    const style = getStyle(node);
    if (!/^(auto|scroll|overlay)$/.test(style.overflowY || style.overflow || '')) continue;
    const maximum = Math.max(0, node.scrollHeight - node.clientHeight);
    const current = Math.max(0, Math.min(maximum, node.scrollTop));
    if (deltaY > 0 ? current < maximum - SCROLL_EPSILON : current > SCROLL_EPSILON) return true;
    const boundary = style.overscrollBehaviorY || style.overscrollBehavior?.split(' ').at(-1);
    if (boundary === 'contain' || boundary === 'none') return false;
  }
  return false;
}

export function installScrollBridge(view) {
  const parentOrigin = parseParentOrigin(new URLSearchParams(view.location.search).get('parentOrigin'));
  if (view.parent === view || !parentOrigin) return () => {};
  const getStyle = node => view.getComputedStyle(node);
  const pathOf = event => typeof event.composedPath === 'function' ? event.composedPath() : [];
  const forward = (event, deltaY, path) => {
    if (event.defaultPrevented || !Number.isFinite(deltaY) || !deltaY
      || canScrollVertically(path, deltaY, getStyle)) return;
    if (event.cancelable) event.preventDefault();
    view.parent.postMessage({
      type: 'secondu-embed-scroll',
      deltaY: Math.max(-MAX_DELTA, Math.min(MAX_DELTA, deltaY)),
    }, parentOrigin);
  };
  const wheel = event => {
    if (event.defaultPrevented) return;
    const path = pathOf(event);
    // Focused native value controls keep their ordinary wheel interaction.
    if (path.some(node => node?.matches?.('input[type="number"]:focus,input[type="range"]:focus,select:focus'))) return;
    const target = path.find(node => node?.nodeType === 1);
    const lineHeight = target ? Number.parseFloat(getStyle(target).lineHeight) : 16;
    const delta = wheelDeltaPixels(event, {
      lineHeight: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 16,
      pageHeight: view.document.documentElement.clientHeight || view.innerHeight,
    });
    forward(event, delta, path);
  };

  let touch = null;
  const touchStart = event => {
    if (event.touches.length !== 1) { touch = null; return; }
    const point = event.touches[0];
    touch = { id: point.identifier, startX: point.clientX, startY: point.clientY, x: point.clientX, y: point.clientY, axis: null };
  };
  const touchMove = event => {
    if (!touch || event.touches.length !== 1) { touch = null; return; }
    const point = event.touches[0];
    if (point.identifier !== touch.id || ![point.clientX, point.clientY].every(Number.isFinite)) { touch = null; return; }
    const deltaY = touch.y - point.clientY;
    touch.x = point.clientX; touch.y = point.clientY;
    if (!touch.axis) {
      const dx = Math.abs(point.clientX - touch.startX), dy = Math.abs(point.clientY - touch.startY);
      if (Math.max(dx, dy) < 4) return;
      touch.axis = dy > dx ? 'vertical' : 'horizontal';
    }
    if (touch.axis === 'vertical') forward(event, deltaY, pathOf(event));
  };
  const touchEnd = () => { touch = null; };

  // Bubble phase lets product controls and graph zoom consume their own events.
  view.addEventListener('wheel', wheel, { passive: false });
  view.addEventListener('touchstart', touchStart, { passive: true });
  view.addEventListener('touchmove', touchMove, { passive: false });
  view.addEventListener('touchend', touchEnd, { passive: true });
  view.addEventListener('touchcancel', touchEnd, { passive: true });
  return () => {
    view.removeEventListener('wheel', wheel);
    view.removeEventListener('touchstart', touchStart);
    view.removeEventListener('touchmove', touchMove);
    view.removeEventListener('touchend', touchEnd);
    view.removeEventListener('touchcancel', touchEnd);
  };
}
