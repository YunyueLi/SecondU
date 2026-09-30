/// <reference path="../../../src/desktop.d.ts" />
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { App } from '../../../src/App';
import { ErrorBoundary } from '../../../src/components';
import { setLocale, getLocale, subscribeLocale } from '../../../src/i18n';
import { syncExampleLanguage, exampleDownloadName, exampleChatRoute, setWebsiteThemePreference } from './api';
import { isProductRoute } from '../product-navigation';
import { replaceExampleRoute } from './navigation.mjs';
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
function syncLanguage(value: 'zh' | 'en') {
  const nextSpace = value === 'en' ? 'demo-us-v1' : 'demo-cn-v1';
  const url = new URL(location.href), previous = url.searchParams.get('space');
  url.searchParams.set('space', nextSpace); url.searchParams.set('lang', value);
  history.replaceState(null, '', url);
  syncExampleLanguage(value);
  if (location.hash === '#example-chat' || !location.hash || previous !== nextSpace && /^#(?:task|agents|projects|artifacts)\//.test(location.hash)) replaceExampleRoute(window, exampleChatRoute(value));
}
function applyLanguage(value: 'zh' | 'en') { syncLanguage(value); setLocale(value === 'en' ? 'en' : 'zh-CN'); }
applyTheme(); applyLanguage(query.get('lang') === 'en' ? 'en' : 'zh');
subscribeLocale(() => syncLanguage(getLocale() === 'en' ? 'en' : 'zh'));
// The product's appearance effect remains intact; the website owns this frame's theme.
const themeObserver = new MutationObserver(applyTheme);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
let started = false;
function startProduct() {
  if (started) return;
  started = true;
  createRoot(document.getElementById('root')!).render(<React.StrictMode><AppsSDKUIProvider linkComponent="a"><ErrorBoundary><App /></ErrorBoundary></AppsSDKUIProvider></React.StrictMode>);
}
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'secondu-website-example') return;
  const value = event.data;
  if (typeof value.expanded === 'boolean') expanded = value.expanded;
  if (['light', 'dark', 'system'].includes(value.themePreference)) setWebsiteThemePreference(value.themePreference);
  if (value.theme === 'light' || value.theme === 'dark') { activeTheme = value.theme; applyTheme(); }
  if (value.language === 'zh' || value.language === 'en') applyLanguage(value.language);
  if (isProductRoute(value.route)) replaceExampleRoute(window, value.route === 'example-chat' ? exampleChatRoute() : value.route);
  // The first API read must see the host's preference, not the product's
  // default system theme. Later messages update this same mounted instance.
  startProduct();
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
// Files open on user input. Opening one on load would focus the real workbench
// and scroll the host page away from its hero before the visitor takes over.
if (parent === window) {
  setWebsiteThemePreference(query.get('theme') === 'dark' ? 'dark' : 'light');
  startProduct();
}
parent.postMessage({ type: 'secondu-example-ready' }, location.origin);
