/** Pauses only the decorative drawing. Task execution is owned by the caller. */
export function observeActivityEdgeVisibility(element: HTMLElement): () => void {
  const document = element.ownerDocument;
  const IntersectionObserver = document.defaultView?.IntersectionObserver;
  let intersecting = !IntersectionObserver;
  let disposed = false;

  const update = () => {
    if (!disposed) element.dataset.visible = String(intersecting && !document.hidden);
  };
  const observer = IntersectionObserver ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      // With threshold 0, an edge-touch callback can have ratio 0. Requiring a
      // positive ratio can strand it paused because entry need not fire again.
      if (entry.target === element) intersecting = entry.isIntersecting;
    }
    update();
  }, { threshold: 0 }) : undefined;

  // Start paused until the first intersection result, including hidden mounts.
  update();
  observer?.observe(element);
  document.addEventListener('visibilitychange', update);

  return () => {
    disposed = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', update);
    element.dataset.visible = 'false';
  };
}
