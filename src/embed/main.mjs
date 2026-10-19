import { installScrollBridge } from './scroll-bridge.mjs';
import { installPresentation } from './presentation.mjs';

// This separate local entry leaves existing product tabs and their drafts mounted.
// Both surfaces import the real application and use the existing local API.
const entry = new URL(window.location.href);
if (!entry.searchParams.has('space')) {
  entry.searchParams.set('space', 'demo-cn-v1');
  window.history.replaceState(null, '', entry.pathname + entry.search + entry.hash);
}
const dispose = installScrollBridge(window);
const disposePresentation = installPresentation(window);
if (import.meta.hot) import.meta.hot.dispose(() => { dispose(); disposePresentation(); });

if (entry.searchParams.get('surface') === 'mobile') {
  await import('../mobile/main.tsx');
} else {
  await import('../main.tsx');
}
