/** Scroll only the real conversation viewport, never an iframe ancestor. */
export function scrollConversationEnd(target, options = {}) {
  const viewport = target?.closest('.conversation-scroll');
  viewport?.scrollTo({ top: viewport.scrollHeight, behavior: options.behavior || 'auto' });
}
