import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParentOrigin, wheelDeltaPixels, canScrollVertically, installScrollBridge } from '../src/embed/scroll-bridge.mjs';

const reviewOrigin = 'http://127.0.0.1:58623';
const node = (scrollTop = 0, overrides = {}) => ({
  nodeType: 1, scrollTop, scrollHeight: 600, clientHeight: 200,
  style: { overflowY: 'auto', overscrollBehaviorY: 'auto', lineHeight: '24px' },
  ...overrides,
});
const style = element => element.style;

function harness(parentOrigin = reviewOrigin) {
  const listeners = new Map(), messages = [];
  const view = {
    location: { search: `?parentOrigin=${encodeURIComponent(parentOrigin)}` },
    parent: { postMessage: (data, targetOrigin) => messages.push({ data, targetOrigin }) },
    document: { documentElement: { clientHeight: 760 } }, innerHeight: 760,
    getComputedStyle: style,
    addEventListener: (name, callback, options) => listeners.set(name, { callback, options }),
    removeEventListener: name => listeners.delete(name),
  };
  const dispatch = (name, fields = {}, path = []) => {
    const event = {
      deltaX: 0, deltaY: 80, deltaMode: 0, cancelable: true, defaultPrevented: false,
      composedPath: () => path,
      preventDefault() { this.defaultPrevented = true; },
      ...fields,
    };
    listeners.get(name)?.callback(event);
    return event;
  };
  return { view, listeners, messages, dispatch };
}
const point = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });

test('parent origins are explicit HTTP(S) loopback origins without credentials or paths', () => {
  for (const value of [reviewOrigin, 'https://localhost:443', 'http://[::1]:58623/']) assert.ok(parseParentOrigin(value));
  for (const value of [null, undefined, {}, '', 'null', '*', 'file:///tmp/review.html', 'https://example.com', 'http://127.0.0.1.evil.test', 'http://user@localhost:80', `${reviewOrigin}/review`, `${reviewOrigin}?x=1`, `${reviewOrigin}#x`]) assert.equal(parseParentOrigin(value), null);
  assert.equal(parseParentOrigin('https://localhost:443'), 'https://localhost');
});

test('wheel units are pixels, lines or pages, with finite bounded output', () => {
  assert.equal(wheelDeltaPixels({ deltaY: 12, deltaMode: 0 }), 12);
  assert.equal(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 }, { lineHeight: 24 }), 72);
  assert.equal(wheelDeltaPixels({ deltaY: -1, deltaMode: 2 }, { pageHeight: 760 }), -760);
  assert.equal(wheelDeltaPixels({ deltaY: 99999 }), 1200);
  for (const deltaY of [NaN, Infinity, -Infinity, '80', null, undefined]) assert.equal(wheelDeltaPixels({ deltaY }), 0);
  assert.equal(wheelDeltaPixels({ deltaY: 80, deltaX: NaN }), 0);
  assert.equal(wheelDeltaPixels({ deltaY: 80, deltaMode: 9 }), 0);
  assert.equal(wheelDeltaPixels({ deltaY: Number.MAX_VALUE, deltaMode: 1 }), 0);
});

test('horizontal wheel, shift-pan and browser zoom remain native', () => {
  for (const extra of [{ deltaX: 100 }, { deltaX: -80 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) assert.equal(wheelDeltaPixels({ deltaY: 80, ...extra }), 0);
});

test('inner scrolling wins until the top or bottom boundary, with fractional tolerance', () => {
  assert.equal(canScrollVertically([node(100)], 80, style), true);
  assert.equal(canScrollVertically([node(100)], -80, style), true);
  assert.equal(canScrollVertically([node(0)], -80, style), false);
  assert.equal(canScrollVertically([node(400)], 80, style), false);
  assert.equal(canScrollVertically([node(399.75)], 80, style), false);
  assert.equal(canScrollVertically([node(-5)], -80, style), false);
  assert.equal(canScrollVertically([node(0, { style: { overflowY: 'hidden' } })], 80, style), false);
});

test('nested native scroll chains continue unless their overscroll boundary contains them', () => {
  const child = node(400), ancestor = node(100);
  assert.equal(canScrollVertically([{}, child, ancestor], 80, style), true);
  child.style.overscrollBehaviorY = 'contain';
  assert.equal(canScrollVertically([child, ancestor], 80, style), false);
  child.scrollTop = 100;
  assert.equal(canScrollVertically([child, ancestor], 80, style), true);
});

test('wheel transfers only at a boundary and only sends bounded deltas to the declared origin', () => {
  const h = harness(); installScrollBridge(h.view);
  const pane = node(100);
  assert.equal(h.dispatch('wheel', {}, [pane]).defaultPrevented, false);
  assert.equal(h.messages.length, 0);
  pane.scrollTop = 400;
  assert.equal(h.dispatch('wheel', {}, [pane]).defaultPrevented, true);
  assert.deepEqual(h.messages, [{ data: { type: 'secondu-embed-scroll', deltaY: 80 }, targetOrigin: reviewOrigin }]);
  assert.equal(h.dispatch('wheel', { deltaY: -80 }, [pane]).defaultPrevented, false);
  pane.scrollTop = 0;
  h.dispatch('wheel', { deltaY: -2, deltaMode: 2 }, [pane]);
  assert.equal(h.messages.at(-1).data.deltaY, -1200);
});

test('product-handled events and focused native value controls are preserved', () => {
  const h = harness(); installScrollBridge(h.view);
  h.dispatch('wheel', { defaultPrevented: true }, [node(400)]);
  h.dispatch('wheel', {}, [node(400, { matches: () => true })]);
  h.dispatch('wheel', { ctrlKey: true }, [node(400)]);
  h.dispatch('wheel', { deltaX: 200 }, [node(400)]);
  assert.equal(h.messages.length, 0);
});

test('single-finger vertical touch keeps inner scrolling, then transfers at its boundary', () => {
  const h = harness(); installScrollBridge(h.view);
  const pane = node(100);
  h.dispatch('touchstart', { touches: [point(100, 200)] });
  assert.equal(h.dispatch('touchmove', { touches: [point(100, 170)] }, [pane]).defaultPrevented, false);
  assert.equal(h.messages.length, 0);
  pane.scrollTop = 400;
  assert.equal(h.dispatch('touchmove', { touches: [point(100, 130)] }, [pane]).defaultPrevented, true);
  assert.equal(h.messages.at(-1).data.deltaY, 40);
  h.dispatch('touchend');
  h.dispatch('touchmove', { touches: [point(100, 100)] }, [pane]);
  assert.equal(h.messages.length, 1);
});

test('horizontal gallery gestures and multi-touch pinch never transfer to the parent', () => {
  const h = harness(); installScrollBridge(h.view);
  const boundary = node(400);
  h.dispatch('touchstart', { touches: [point(100, 200)] });
  h.dispatch('touchmove', { touches: [point(50, 190)] }, [boundary]);
  h.dispatch('touchmove', { touches: [point(45, 100)] }, [boundary]);
  h.dispatch('touchend');
  h.dispatch('touchstart', { touches: [point(100, 200), point(120, 200, 2)] });
  h.dispatch('touchmove', { touches: [point(100, 150), point(140, 180, 2)] }, [boundary]);
  h.dispatch('touchmove', { touches: [point(100, 100)] }, [boundary]);
  assert.equal(h.messages.length, 0);
});

test('the bridge is opt-in for frames and cleans up all listeners', () => {
  const h = harness(); const dispose = installScrollBridge(h.view);
  assert.equal(h.listeners.size, 5);
  assert.equal(h.listeners.get('wheel').options.passive, false);
  assert.equal(h.listeners.get('touchmove').options.passive, false);
  dispose(); assert.equal(h.listeners.size, 0);
  h.view.parent = h.view; installScrollBridge(h.view); assert.equal(h.listeners.size, 0);
  const remote = harness('https://example.com'); installScrollBridge(remote.view); assert.equal(remote.listeners.size, 0);
});
