/// <reference path="../../../src/desktop.d.ts" />
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { App } from '../../../src/App';
import { ErrorBoundary } from '../../../src/components';
import { setLocale } from '../../../src/i18n';
import { syncExampleLanguage, exampleDownloadName } from './api';
import '../../../src/styles.css';
import '../../../src/desktop-refinement.css';
import '../../../src/composer/conversation-composer.css';
import '../../../src/agents/conversation-bubbles.css';
import '../../../src/design-system/page-layout.css';

const query = new URLSearchParams(location.search);
let expanded = false;
let activeTheme = query.get('theme') === 'dark' ? 'dark' : 'light';
function applyTheme() {
  if (document.documentElement.dataset.theme !== activeTheme) document.documentElement.dataset.theme = activeTheme;
  document.documentElement.style.colorScheme = activeTheme;
}
function applyLanguage(value: 'zh' | 'en') { syncExampleLanguage(value); setLocale(value === 'en' ? 'en' : 'zh-CN'); }
applyTheme(); applyLanguage(query.get('lang') === 'en' ? 'en' : 'zh');
// The product's appearance effect remains intact; the website owns this frame's theme.
const themeObserver = new MutationObserver(applyTheme);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'secondu-website-example') return;
  const value = event.data;
  if (typeof value.expanded === 'boolean') expanded = value.expanded;
  if (value.theme === 'light' || value.theme === 'dark') { activeTheme = value.theme; applyTheme(); }
  if (value.language === 'zh' || value.language === 'en') applyLanguage(value.language);
  if (['assistant', 'self', 'agents', 'artifacts', 'task/website-weekend'].includes(value.route)) location.hash = value.route;
});
addEventListener('click', event => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  const name = link && exampleDownloadName(link.href);
  if (link && name) link.download = name;
}, { capture: true });
addEventListener('keydown', event => {
  // Product dialogs and workbench panels receive Escape first (document phase).
  if (expanded && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault();
    parent.postMessage({ type: 'secondu-example-collapse' }, location.origin);
  }
});
let interacted = false;
addEventListener('pointerdown', () => { interacted = true; }, { once: true });
addEventListener('keydown', () => { interacted = true; }, { once: true });
addEventListener('wheel', event => {
  // Before takeover, scrolling continues the landing page. After a click or
  // keyboard action, the real app owns scrolling so documents remain readable.
  if (expanded || interacted || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  parent.postMessage({ type: 'secondu-example-scroll', deltaY: Math.max(-1000, Math.min(1000, event.deltaY)) }, location.origin);
}, { passive: false });
// Open the first real artifact button once the actual conversation is mounted.
const opening = new MutationObserver(() => {
  const button = document.querySelector<HTMLButtonElement>('.artifact-message-card');
  if (!button || interacted) return;
  opening.disconnect(); button.click();
});
opening.observe(document.getElementById('root')!, { childList: true, subtree: true });
setTimeout(() => opening.disconnect(), 12000);
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppsSDKUIProvider linkComponent="a"><ErrorBoundary><App /></ErrorBoundary></AppsSDKUIProvider></React.StrictMode>);
parent.postMessage({ type: 'secondu-example-ready' }, location.origin);
