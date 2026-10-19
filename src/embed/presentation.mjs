import { parseParentOrigin } from './scroll-bridge.mjs';

const presentations = new Set(['materials', 'assistant', 'assets', 'automations']);

/** The report uses the real product in a separate, read-only example window. */
export function installPresentation(view) {
  const url = new URL(view.location.href);
  const mode = url.searchParams.get('presentation');
  if (!url.pathname.endsWith('/embed.html') || !presentations.has(mode) || url.searchParams.get('space') !== 'demo-cn-v1') return () => {};
  const doc = view.document;
  const parentOrigin = parseParentOrigin(url.searchParams.get('parentOrigin'));
  const embedded = view.parent !== view;
  // Product panels may focus their input on the next animation frame. In this
  // read-only iframe that focus must never scroll the surrounding report.
  const elementPrototype = view.HTMLElement.prototype;
  const originalFocus = elementPrototype.focus;
  const presentationFocus = function(options) { return originalFocus.call(this, {...options, preventScroll: true}); };
  elementPrototype.focus = presentationFocus;
  const storage = view.localStorage;
  const prototype = view.Storage.prototype;
  const originalStorage = {getItem: prototype.getItem, setItem: prototype.setItem, removeItem: prototype.removeItem, clear: prototype.clear};
  const ephemeral = new Map([['hither.locale', 'zh-CN']]);
  let cleared = false;
  // UI view preferences and drafts must remain inside this presentation iframe.
  prototype.getItem = function(key) { return this === storage ? ephemeral.has(String(key)) ? ephemeral.get(String(key)) : cleared ? null : originalStorage.getItem.call(this, key) : originalStorage.getItem.call(this, key); };
  prototype.setItem = function(key, value) { if (this === storage) ephemeral.set(String(key), String(value)); else originalStorage.setItem.call(this, key, value); };
  prototype.removeItem = function(key) { if (this === storage) ephemeral.set(String(key), null); else originalStorage.removeItem.call(this, key); };
  prototype.clear = function() { if (this === storage) { ephemeral.clear(); cleared = true; } else originalStorage.clear.call(this); };
  const originalFetch = view.fetch;
  view.fetch = (input, init) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, view.location.href);
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (target.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(method)) {
      return Promise.resolve(new view.Response(JSON.stringify({error: '演示仅用于查看，不保存更改。'}), {status: 403, headers: {'Content-Type': 'application/json'}}));
    }
    return originalFetch.call(view, input, init);
  };

  let visible = !embedded, playing = !view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer, index = 0, misses = 0, disposed = false;
  const announce = (reason = '') => {
    if (embedded && parentOrigin) view.parent.postMessage({type: 'secondu-presentation-state', mode, playing, step: index, reason}, parentOrigin);
  };
  const shown = element => element && !element.closest('[hidden],[inert]') && element.getClientRects().length && !element.disabled;
  const find = (selector, text) => [...doc.querySelectorAll(selector)].find(element => shown(element) && (!text || (element.getAttribute('aria-label') || element.textContent || '').trim().includes(text)));
  const click = (selector, text) => () => {
    const element = find(selector, text);
    if (!element) return false;
    // SDK menus open from a pointer or keyboard event, not a synthetic click.
    // Use their existing keyboard interaction so the real menu is presented.
    if (element.getAttribute('aria-haspopup') === 'menu') {
      element.focus({preventScroll: true});
      element.dispatchEvent(new view.KeyboardEvent('keydown', {key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true}));
    } else element.click();
    return true;
  };
  const scroll = (selector, block = 'center') => () => {
    const element = find(selector);
    if (!element) return false;
    // scrollIntoView can scroll ancestors outside the iframe. Move only a
    // scrollable element in this document, leaving the host's reading position.
    const root = doc.scrollingElement;
    let container = element.parentElement;
    while (container && container !== root) {
      if (/^(auto|scroll|overlay)$/.test(view.getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight) break;
      container = container.parentElement;
    }
    container ||= root;
    if (!container || container.scrollHeight <= container.clientHeight) return true;
    const bounds = element.getBoundingClientRect();
    const top = container === root ? 0 : container.getBoundingClientRect().top + container.clientTop;
    const offset = block === 'center' ? (container.clientHeight - bounds.height) / 2 : 0;
    const destination = container.scrollTop + bounds.top - top - offset;
    container.scrollTo({top: Math.max(0, Math.min(destination, container.scrollHeight - container.clientHeight)), behavior: 'smooth'});
    return true;
  };
  const escape = () => { (doc.activeElement || doc.body).dispatchEvent(new view.KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true, cancelable: true})); return true; };
  const steps = {
    materials: [
      scroll('.twin-building-stage', 'start'),
      ...Array.from({length: 7}, (_, item) => click('.material-gallery-navigation button', `第 ${item + 1} 项`)),
      click('.material-gallery-cover.is-write.is-current'), scroll('.twin-entry-panel', 'start'),
      click('.twin-capture-purpose button', '只用于这次'), click('.twin-capture-purpose button', '用于了解我'),
      click('button[aria-label="收起接入面板"]'), scroll('.twin-building-stage', 'start'),
    ],
    assistant: [click('.composer-twin-trigger'), escape, click('.project-picker'), escape, click('.composer-approval-picker'), escape],
    assets: [click('.library-tabs button', '成果'), click('.library-tabs button', '来源'), click('.library-tools button[aria-label="列表视图"]'), click('.library-tools button[aria-label="网格视图"]'), click('.library-tools button', '新建'), escape, click('.library-tabs button', '全部')],
    automations: [click('.automations-workspace button', '新建自动化'), click('.automation-form [role="button"][aria-haspopup="dialog"]', '每天固定时间'), escape, click('.automation-form-actions button', '取消')],
  }[mode];
  const stopTimer = () => { view.clearTimeout(timer); timer = undefined; };
  const tick = () => {
    stopTimer();
    if (disposed || !playing || !visible || doc.hidden) return;
    const sidebar = find('button[aria-label="收起导航"]');
    if (sidebar && sidebar.getAttribute('aria-expanded') === 'true') sidebar.click();
    if (steps[index]()) {
      misses = 0; index = (index + 1) % steps.length; announce();
      timer = view.setTimeout(tick, index === 0 ? 3200 : 1800);
    } else if (++misses < 40) timer = view.setTimeout(tick, 250);
    else { playing = false; announce('当前步骤暂不可用'); }
  };
  const pauseForUser = event => {
    // Scrolling through the report must not turn autoplay into a manual player.
    // Touch pointerdown can begin a vertical swipe; pause only on its final click.
    if (!event.isTrusted || event.type === 'pointerdown' && event.pointerType === 'touch') return;
    if (!event.target?.closest?.('button,a[href],input,textarea,select,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="radio"],[role="tab"],[role="switch"],[role="checkbox"],[contenteditable="true"]')) return;
    playing = false; stopTimer(); announce('已暂停，可直接操作界面');
  };
  const preventInput = event => { if (event.isTrusted) event.preventDefault(); };
  const preventSubmit = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const keepExample = event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const target = new URL(anchor.href, view.location.href);
    if (target.origin !== view.location.origin || target.pathname !== url.pathname || target.search !== url.search) event.preventDefault();
  };
  const message = event => {
    if (!parentOrigin || event.origin !== parentOrigin || event.source !== view.parent || event.data?.type !== 'secondu-presentation-control') return;
    if (typeof event.data.visible === 'boolean') visible = event.data.visible;
    if (typeof event.data.playing === 'boolean') playing = event.data.playing;
    announce(); tick();
  };
  const visibility = () => { if (doc.hidden) stopTimer(); else tick(); };
  for (const type of ['pointerdown', 'keydown', 'click']) doc.addEventListener(type, pauseForUser, {capture: true, passive: true});
  doc.addEventListener('beforeinput', preventInput, true);
  doc.addEventListener('submit', preventSubmit, true);
  doc.addEventListener('click', keepExample, true);
  doc.addEventListener('visibilitychange', visibility);
  view.addEventListener('message', message);
  announce('ready');
  if (!embedded) timer = view.setTimeout(tick, 1000);
  return () => {
    disposed = true; stopTimer(); view.fetch = originalFetch;
    if (elementPrototype.focus === presentationFocus) elementPrototype.focus = originalFocus;
    for (const name of Object.keys(originalStorage)) prototype[name] = originalStorage[name];
    for (const type of ['pointerdown', 'keydown', 'click']) doc.removeEventListener(type, pauseForUser, true);
    doc.removeEventListener('beforeinput', preventInput, true); doc.removeEventListener('submit', preventSubmit, true); doc.removeEventListener('click', keepExample, true);
    doc.removeEventListener('visibilitychange', visibility); view.removeEventListener('message', message);
  };
}
