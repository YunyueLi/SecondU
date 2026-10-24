import { parseParentOrigin } from './scroll-bridge.mjs';
import { proactiveExampleTaskId, withProactiveExample } from './proactive-example.mjs';

const presentations = new Set(['materials', 'sources', 'proactive', 'assistant', 'assets', 'automations', 'decision', 'specialists']);

/** The report uses the real product in a separate, read-only example window. */
export function installPresentation(view) {
  const url = new URL(view.location.href);
  const mode = url.searchParams.get('presentation');
  if (!url.pathname.endsWith('/embed.html') || !presentations.has(mode) || url.searchParams.get('space') !== 'demo-cn-v1') return () => {};
  const doc = view.document;
  const previousPresentation = doc.documentElement?.getAttribute('data-secondu-presentation');
  doc.documentElement?.setAttribute('data-secondu-presentation', mode);
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
    const response = originalFetch.call(view, input, init);
    if (mode === 'proactive' && method === 'GET' && target.origin === url.origin && target.pathname === '/api/spaces/demo-cn-v1/bootstrap') {
      return response.then(async result => {
        if (!result.ok) return result;
        return new view.Response(JSON.stringify(withProactiveExample(await result.json())), {
          status: result.status, headers: {'Content-Type': 'application/json'},
        });
      });
    }
    return response;
  };

  let visible = !embedded, playing = !view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer, index = 0, misses = 0, disposed = false;
  const announce = (reason = '') => {
    if (embedded && parentOrigin) view.parent.postMessage({type: 'secondu-presentation-state', mode, playing, step: index, reason, ...(mode === 'proactive' ? {scene: view.location.hash === `#task/${proactiveExampleTaskId}` ? 'reminder' : 'connections'} : {})}, parentOrigin);
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
  const route = (hash, ready) => () => {
    if (view.location.hash !== `#${hash}`) { view.location.hash = hash; return false; }
    return !!find(ready);
  };
  const steps = {
    materials: [
      scroll('.twin-building-stage', 'start'),
      ...Array.from({length: 7}, (_, item) => click('.material-gallery-navigation button', `第 ${item + 1} 项`)),
      click('.material-gallery-cover.is-write.is-current'), scroll('.twin-entry-panel', 'start'),
      click('.twin-capture-purpose button', '只用于这次'), click('.twin-capture-purpose button', '用于了解我'),
      click('button[aria-label="收起接入面板"]'), scroll('.twin-building-stage', 'start'),
    ],
    sources: Array.from({length: 7}, (_, item) => click('.material-gallery-navigation button', `第 ${item + 1} 项`)),
    proactive: [
      route('settings/connectors', '.connector-service-grid'),
      click('.connector-service-card', '查看 GitHub 连接方式'),
      click('.connector-detail-dialog > header button', '关闭'),
      route(`task/${proactiveExampleTaskId}`, '.task-thread'),
    ],
    assistant: [click('.composer-twin-trigger'), escape, click('.project-picker'), escape, click('.composer-approval-picker'), escape],
    assets: [click('.library-tabs button', '成果'), click('.library-tabs button', '来源'), click('.library-tools button[aria-label="列表视图"]'), click('.library-tools button[aria-label="网格视图"]'), click('.library-tools button', '新建'), escape, click('.library-tabs button', '全部')],
    automations: [click('.automations-workspace button', '新建自动化'), click('.automation-form [role="button"][aria-haspopup="dialog"]', '每天固定时间'), escape, click('.automation-form-actions button', '取消')],
    // The local product uses this task's real route, not the website alias:
    // #task/demo-decision-task-zh. Only view tabs change; no draft is entered.
    decision: [
      click('.task-artifacts .artifact-message-card', '打开文件 职业方向讨论提纲.md'),
      click('.artifact-toolbar button', '预览'),
      click('.artifact-toolbar button', '编辑'),
      click('.artifact-toolbar button', '版本'),
      click('.artifact-toolbar button', '预览'),
      click('.workbench-panel button[data-close-workbench]'),
    ],
    // Saved-agent badges expose a role face; work history lives in the real
    // settings panel. Account and model controls are viewed, never changed.
    specialists: ['agent-writer', 'agent-planner'].flatMap(id => [
      click(`.saved-agent-browser [data-saved-agent-id$="${id}"]`),
      click('.saved-agent-browser button[aria-label="角色说明"]'),
      click('.saved-agent-browser button[aria-label="翻回工牌正面"]'),
      click('.saved-agent-actions button', '设置与记录'),
      click('.ag-agent-details-dialog .agent-work-tabs button', '账号与权限'),
      () => !!find('.ag-agent-details-dialog .agent-resources') && !find('.ag-agent-details-dialog .agent-resource-hint[role="status"]'),
      click('.ag-agent-details-dialog .agent-work-tabs button', '工作记录'),
      click('.ag-agent-details-dialog .agent-work-tabs button', '模型'),
      click('.ag-agent-details-dialog > header button[aria-label="关闭"]'),
    ]),
  }[mode];
  const stopTimer = () => { view.clearTimeout(timer); timer = undefined; };
  const tick = () => {
    stopTimer();
    if (disposed || !playing || !visible || doc.hidden) return;
    const sidebar = find('button[aria-label="收起导航"]');
    if (sidebar && sidebar.getAttribute('aria-expanded') === 'true') sidebar.click();
    if (steps[index]()) {
      misses = 0; index = (index + 1) % steps.length; announce();
      timer = view.setTimeout(tick, mode === 'proactive' ? index === 0 ? 7000 : 3000 : index === 0 ? 3200 : 1800);
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
    const sceneRoutes = {connections: 'settings/connectors', reminder: `task/${proactiveExampleTaskId}`};
    if (mode === 'proactive' && Object.hasOwn(sceneRoutes, event.data.scene)) {
      playing = false; stopTimer();
      view.location.hash = sceneRoutes[event.data.scene];
      index = event.data.scene === 'reminder' ? 0 : 1;
      announce('已暂停，可直接操作界面');
      return;
    }
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
    if (previousPresentation == null) doc.documentElement?.removeAttribute('data-secondu-presentation');
    else doc.documentElement?.setAttribute('data-secondu-presentation', previousPresentation);
    if (elementPrototype.focus === presentationFocus) elementPrototype.focus = originalFocus;
    for (const name of Object.keys(originalStorage)) prototype[name] = originalStorage[name];
    for (const type of ['pointerdown', 'keydown', 'click']) doc.removeEventListener(type, pauseForUser, true);
    doc.removeEventListener('beforeinput', preventInput, true); doc.removeEventListener('submit', preventSubmit, true); doc.removeEventListener('click', keepExample, true);
    doc.removeEventListener('visibilitychange', visibility); view.removeEventListener('message', message);
  };
}
