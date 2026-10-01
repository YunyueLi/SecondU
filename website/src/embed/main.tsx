/// <reference path="../../../src/desktop.d.ts" />
import React,{useSyncExternalStore} from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { App } from '../../../src/App';
import { ErrorBoundary } from '../../../src/components';
import { setLocale, getLocale, subscribeLocale } from '../../../src/i18n';
import { syncExampleLanguage, exampleDownloadName, exampleChatRoute, exampleDecisionRoute, setWebsiteThemePreference } from './api';
import { isDecisionExampleTask } from '../../../shared/demo-decision.mjs';
import { isProductRoute } from '../product-navigation';
import { replaceExampleRoute } from './navigation.mjs';
import '../../../src/styles.css';
import '../../../src/desktop-refinement.css';
import '../../../src/composer/conversation-composer.css';
import '../../../src/agents/conversation-bubbles.css';
import '../../../src/design-system/page-layout.css';
import './standalone.css';

const query = new URLSearchParams(location.search);
const standalone = parent === window;
let expanded = standalone;
let standalonePreference: 'light'|'dark'|'system' = query.get('theme') === 'dark' ? 'dark' : query.get('theme') === 'light' ? 'light' : 'system';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let activeTheme = standalonePreference === 'system' ? systemTheme.matches ? 'dark' : 'light' : standalonePreference;
systemTheme.addEventListener('change',()=>{if(standalone&&standalonePreference==='system'){activeTheme=systemTheme.matches?'dark':'light';applyTheme();}});
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
  if (location.hash === '#example-decision' || isDecisionExampleTask(location.hash.replace(/^#task\//,''))) replaceExampleRoute(window, exampleDecisionRoute(value));
  else if (location.hash === '#example-chat' || !location.hash || previous !== nextSpace && /^#(?:task|agents|projects|artifacts)\//.test(location.hash)) replaceExampleRoute(window, exampleChatRoute(value));
}
function applyLanguage(value: 'zh' | 'en') { syncLanguage(value); setLocale(value === 'en' ? 'en' : 'zh-CN'); }
applyTheme(); applyLanguage(query.get('lang') === 'en' ? 'en' : 'zh');
subscribeLocale(() => syncLanguage(getLocale() === 'en' ? 'en' : 'zh'));
// The product's appearance effect remains intact; the website owns this frame's theme.
const themeObserver = new MutationObserver(applyTheme);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function StandaloneExample() {
 const locale=useSyncExternalStore(subscribeLocale,getLocale),english=locale==='en';
 return <div className="website-standalone-example"><nav className="website-example-navigation" aria-label={english?'Example navigation':'示例导航'}><a href={`../?lang=${english?'en':'zh'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg>{english?'SecondU home':'返回官网'}</a><span>{english?'Explore the example workspace':'探索示例空间'}</span><a href="https://github.com/YunyueLi/SecondU/releases/latest" target="_blank" rel="noopener noreferrer">{english?'Download for desktop':'下载桌面版'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></svg></a></nav><div className="website-standalone-product"><App/></div></div>;
}
let started = false;
function startProduct() {
  if (started) return;
  started = true;
  createRoot(document.getElementById('root')!).render(<React.StrictMode><AppsSDKUIProvider linkComponent="a"><ErrorBoundary>{standalone?<StandaloneExample/>:<App />}</ErrorBoundary></AppsSDKUIProvider></React.StrictMode>);
}
window.addEventListener('message', event => {
  if (standalone && event.source===window && event.origin===location.origin && event.data?.type==='secondu-example-preferences') {
    const value=event.data;
    if(value.theme==='dark'||value.theme==='light'||value.theme==='system') {standalonePreference=value.theme;setWebsiteThemePreference(value.theme);activeTheme=value.theme==='system'?(systemTheme.matches?'dark':'light'):value.theme;applyTheme();}
    if(value.language==='zh'||value.language==='en')applyLanguage(value.language);
    return;
  }
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'secondu-website-example') return;
  const value = event.data;
  if (typeof value.expanded === 'boolean') expanded = value.expanded;
  if (['light', 'dark', 'system'].includes(value.themePreference)) setWebsiteThemePreference(value.themePreference);
  if (value.theme === 'light' || value.theme === 'dark') { activeTheme = value.theme; applyTheme(); }
  if (value.language === 'zh' || value.language === 'en') applyLanguage(value.language);
  if (isProductRoute(value.route)) replaceExampleRoute(window, value.route === 'example-chat' ? exampleChatRoute() : value.route === 'example-decision' ? exampleDecisionRoute() : value.route);
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
  if (!standalone && expanded && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault();
    parent.postMessage({ type: 'secondu-example-collapse' }, location.origin);
  }
});
let interacted = false;
function takeOverExample(){interacted=true;if(!standalone)parent.postMessage({type:'secondu-example-interaction'},location.origin);}
addEventListener('pointerdown',takeOverExample);
addEventListener('keydown',takeOverExample);
addEventListener('wheel', event => {
  // Before takeover, scrolling continues the landing page. After a click or
  // keyboard action, the real app owns scrolling so documents remain readable.
  if (expanded || interacted || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  parent.postMessage({ type: 'secondu-example-scroll', deltaY: Math.max(-1000, Math.min(1000, event.deltaY)) }, location.origin);
}, { passive: false });
// Files open on user input. Opening one on load would focus the real workbench
// and scroll the host page away from its hero before the visitor takes over.
if (standalone) {
  setWebsiteThemePreference(standalonePreference);
  startProduct();
}
parent.postMessage({ type: 'secondu-example-ready' }, location.origin);
