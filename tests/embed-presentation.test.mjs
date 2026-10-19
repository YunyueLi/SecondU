import test from 'node:test';
import assert from 'node:assert/strict';
import { installPresentation } from '../src/embed/presentation.mjs';

function fixture(path = '/embed.html?space=demo-cn-v1&presentation=assistant&parentOrigin=http%3A%2F%2F127.0.0.1%3A58621') {
  class Storage {
    data = new Map([['hither.locale', 'en'], ['hither.sidebarCollapsed', 'false']]);
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) { this.data.set(String(key), String(value)); }
    removeItem(key) { this.data.delete(key); }
    clear() { this.data.clear(); }
  }
  const listeners = new Map(), documentListeners = new Map(), timers = new Map();
  const posts = [], network = [], clicks = [], focusCalls = [];
  class HTMLElement {
    focus(options) { focusCalls.push({element: this, options}); }
  }
  const element = {disabled: false, getClientRects: () => [1], closest: () => null, getAttribute: () => '', click: () => clicks.push('twin')};
  const parent = {postMessage: (data, origin) => posts.push({data, origin})};
  const view = {
    location: new URL(path, 'http://127.0.0.1:58644'), Storage, localStorage: new Storage(), parent, Response, HTMLElement,
    document: {hidden: false, querySelectorAll: selector => selector === '.composer-twin-trigger' ? [element] : [], addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: name => documentListeners.delete(name), body: {dispatchEvent() {}}},
    matchMedia: () => ({matches: false}),
    getComputedStyle: element => ({overflowY: element.overflowY || 'visible'}),
    fetch: async (...args) => { network.push(args); return new Response('{}', {status: 200}); },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    KeyboardEvent: class { constructor(type, values) { Object.assign(this, {type}, values); } },
  };
  const control = (data, origin = 'http://127.0.0.1:58621', source = parent) => listeners.get('message')?.({origin, source, data: {type: 'secondu-presentation-control', ...data}});
  return {view, posts, network, clicks, timers, documentListeners, control, focusCalls};
}

test('ordinary product and non-presentation embeds install nothing', () => {
  for (const path of ['/?space=demo-cn-v1&presentation=assistant', '/embed.html?space=demo-cn-v1']) {
    const {view} = fixture(path), original = view.fetch, originalFocus = view.HTMLElement.prototype.focus;
    const dispose = installPresentation(view);
    assert.equal(view.fetch, original);
    assert.equal(view.localStorage.getItem('hither.locale'), 'en');
    assert.equal(view.HTMLElement.prototype.focus, originalFocus);
    dispose();
  }
});

test('unknown presentations and personal space are excluded', () => {
  for (const path of ['/embed.html?space=personal&presentation=assistant', '/embed.html?space=demo-cn-v1&presentation=save']) {
    const {view} = fixture(path), original = view.fetch;
    installPresentation(view)();
    assert.equal(view.fetch, original);
  }
});

test('all API mutation methods are denied before reaching the server', async () => {
  const {view, network} = fixture(), dispose = installPresentation(view);
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await view.fetch('/api/spaces/demo-cn-v1/automations', {method})).status, 403);
    assert.equal((await view.fetch(new Request('http://127.0.0.1:58644/api/spaces/demo-cn-v1/tasks', {method: 'POST'}))).status, 403);
    assert.equal(network.length, 0);
  } finally { dispose(); }
});

test('read-only requests retain real responses', async () => {
  const {view, network} = fixture(), dispose = installPresentation(view);
  try {
    assert.equal((await view.fetch('/api/spaces/demo-cn-v1/bootstrap')).status, 200);
    assert.equal((await view.fetch('/api/spaces/demo-cn-v1/bootstrap', {method: 'HEAD'})).status, 200);
    assert.equal(network.length, 2);
  } finally { dispose(); }
});

test('view preferences stay in memory and cleanup restores original storage', () => {
  const {view} = fixture(), original = view.fetch, dispose = installPresentation(view);
  view.localStorage.setItem('hither.sidebarCollapsed', 'true');
  assert.equal(view.localStorage.getItem('hither.sidebarCollapsed'), 'true');
  assert.equal(view.localStorage.data.get('hither.sidebarCollapsed'), 'false');
  view.localStorage.removeItem('hither.locale');
  assert.equal(view.localStorage.getItem('hither.locale'), null);
  dispose();
  assert.equal(view.fetch, original);
  assert.equal(view.localStorage.getItem('hither.sidebarCollapsed'), 'false');
  assert.equal(view.localStorage.getItem('hither.locale'), 'en');
});

test('only matching parent origin and window can start visible playback', () => {
  const {view, control, clicks, timers} = fixture(), dispose = installPresentation(view);
  try {
    assert.equal(timers.size, 0);
    control({visible: true, playing: true}, 'https://example.com');
    control({visible: true, playing: true}, 'http://127.0.0.1:58621', {});
    assert.equal(clicks.length, 0);
    control({visible: true, playing: true});
    assert.deepEqual(clicks, ['twin']);
    control({visible: false});
    assert.equal(timers.size, 0);
  } finally { dispose(); }
});

test('trusted interaction pauses, and input or submission cannot mutate data', () => {
  const {view, control, documentListeners, timers, posts} = fixture(), dispose = installPresentation(view);
  try {
    control({visible: true, playing: true});
    documentListeners.get('pointerdown')({isTrusted: true, type: 'pointerdown', pointerType: 'mouse', target: {closest: () => ({})}});
    assert.equal(timers.size, 0);
    assert.equal(posts.at(-1).data.playing, false);
    let prevented = 0, stopped = 0;
    documentListeners.get('beforeinput')({isTrusted: true, preventDefault: () => prevented++});
    documentListeners.get('submit')({preventDefault: () => prevented++, stopImmediatePropagation: () => stopped++});
    assert.equal(prevented, 2); assert.equal(stopped, 1);
  } finally { dispose(); }
});

test('ordinary wheel, page touch and blank-area pointer input preserve autoplay', () => {
  const {view, control, documentListeners, timers, posts} = fixture(), dispose = installPresentation(view);
  try {
    control({visible: true, playing: true});
    assert.equal(documentListeners.has('wheel'), false);
    assert.equal(documentListeners.has('touchstart'), false);
    documentListeners.get('pointerdown')({isTrusted: true, type: 'pointerdown', pointerType: 'mouse', target: {closest: () => null}});
    documentListeners.get('pointerdown')({isTrusted: true, type: 'pointerdown', pointerType: 'touch', target: {closest: () => ({})}});
    assert.equal(timers.size, 1);
    assert.equal(posts.at(-1).data.playing, true);
  } finally { dispose(); }
});

test('presentation input focus preserves options but cannot scroll the host, and cleanup restores focus', () => {
  const {view, focusCalls} = fixture(), originalFocus = view.HTMLElement.prototype.focus;
  const input = new view.HTMLElement(), dispose = installPresentation(view);
  input.focus();
  input.focus({preventScroll: false, focusVisible: true});
  assert.deepEqual(focusCalls.map(call => call.options), [{preventScroll: true}, {preventScroll: true, focusVisible: true}]);
  assert.equal(focusCalls[0].element, input);
  dispose();
  assert.equal(view.HTMLElement.prototype.focus, originalFocus);
  input.focus({preventScroll: false});
  assert.equal(focusCalls.at(-1).options.preventScroll, false);
});

function materialScrollFixture() {
  const context = fixture('/embed.html?space=demo-cn-v1&presentation=materials&parentOrigin=http%3A%2F%2F127.0.0.1%3A58621');
  const positions = [];
  const root = {scrollHeight: 1500, clientHeight: 600, scrollTop: 120, parentElement: null, scrollTo: options => positions.push({target: 'root', ...options})};
  const element = {disabled: false, closest: () => null, getClientRects: () => [1], getAttribute: () => '', getBoundingClientRect: () => ({top: 450, height: 300}), scrollIntoView: () => assert.fail('scrollIntoView would scroll the host report'), parentElement: root};
  context.view.document.scrollingElement = root;
  context.view.document.querySelectorAll = selector => selector === '.twin-building-stage' ? [element] : [];
  return {...context, root, element, positions};
}

test('material presentation scrolls only the nearest vertical container inside its document', () => {
  const {view, control, root, element, positions} = materialScrollFixture();
  const container = {overflowY: 'auto', scrollHeight: 1200, clientHeight: 400, clientTop: 2, scrollTop: 80, parentElement: root, getBoundingClientRect: () => ({top: 30}), scrollTo: options => positions.push({target: 'inner', ...options})};
  element.parentElement = {overflowY: 'auto', scrollHeight: 300, clientHeight: 300, parentElement: container};
  const dispose = installPresentation(view);
  try {
    control({visible: true, playing: true});
    assert.deepEqual(positions, [{target: 'inner', top: 498, behavior: 'smooth'}]);
  } finally { dispose(); }
});

test('material presentation uses its own document root and clamps scrolling within it', () => {
  const {view, control, element, positions} = materialScrollFixture();
  element.getBoundingClientRect = () => ({top: 1600, height: 300});
  const dispose = installPresentation(view);
  try {
    control({visible: true, playing: true});
    assert.deepEqual(positions, [{target: 'root', top: 900, behavior: 'smooth'}]);
  } finally { dispose(); }
});
