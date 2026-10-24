import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function loadSource(name, links = {}) {
  let source = await readFile(new URL(`../src/design-system/${name}`, import.meta.url), 'utf8');
  source = source.replace(/^import ['"].*\.css['"];?$/gm, '');
  for (const [specifier, url] of Object.entries({ react: import.meta.resolve('react'), ...links })) {
    source = source.replaceAll(`'${specifier}'`, JSON.stringify(url));
  }
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  return moduleUrl(outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime'))));
}

const visibilityUrl = await loadSource('activity-edge-visibility.ts');
const { observeActivityEdgeVisibility } = await import(visibilityUrl);
const { ActivityEdge } = await import(await loadSource('ActivityEdge.tsx', {
  './activity-edge-visibility': visibilityUrl,
  '../../shared/appearance-options.mjs': new URL('../shared/appearance-options.mjs', import.meta.url).href,
}));

function harness({ hidden = false, observer = true } = {}) {
  const observers = [];
  class Observer {
    disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    emit(visible, ratio = visible ? 1 : 0) {
      this.callback([{ target: this.target, isIntersecting: visible, intersectionRatio: ratio }]);
    }
  }
  class Document extends EventTarget {
    hidden = hidden;
    defaultView = observer ? { IntersectionObserver: Observer } : {};
    listeners = new Set();
    addEventListener(type, callback) { super.addEventListener(type, callback); this.listeners.add(callback); }
    removeEventListener(type, callback) { super.removeEventListener(type, callback); this.listeners.delete(callback); }
  }
  const document = new Document();
  const element = { ownerDocument: document, dataset: {} };
  const dispose = observeActivityEdgeVisibility(element);
  return { element, document, observers, dispose,
    intersect(visible, ratio) { observers[0].emit(visible, ratio); },
    hide(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('inactive activity emits no drawing, including paused previews', () => {
  assert.equal(renderToStaticMarkup(createElement(ActivityEdge)), '');
  assert.equal(renderToStaticMarkup(createElement(ActivityEdge, { active: false, paused: true })), '');
});

test('active drawing is decorative, starts paused pending visibility, and accepts shared radius tokens', () => {
  const markup = renderToStaticMarkup(createElement(ActivityEdge, {
    active: true, paused: true, intensity: 'expressive', radius: 'var(--hither-radius-composer)',
  }));
  assert.match(markup, /^<span /);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /data-paused="true"/);
  assert.match(markup, /data-visible="false"/);
  assert.match(markup, /data-intensity="expressive"/);
  assert.match(markup, /--activity-edge-radius:var\(--hither-radius-composer\)/);
  assert.doesNotMatch(markup, /role=|aria-value|tabindex=|<svg|<rect/);
});

test('numeric radius is expressed in CSS pixels without negative or invalid geometry', () => {
  const render = radius => renderToStaticMarkup(createElement(ActivityEdge, { active: true, radius }));
  assert.match(render(24), /--activity-edge-radius:24px/);
  assert.match(render(0), /--activity-edge-radius:0px/);
  assert.match(render(-4), /--activity-edge-radius:0px/);
  assert.match(render(Number.NaN), /--activity-edge-radius:var\(--hither-radius-panel, 12px\)/);
});

test('production drawing inherits appearance, while explicit previews remain independent', () => {
  const inherited = renderToStaticMarkup(createElement(ActivityEdge, { active: true }));
  assert.doesNotMatch(inherited, /data-intensity=|data-palette=/);
  assert.doesNotMatch(inherited, /url\(#|activity-edge-palette-theme:/);
  const preview = renderToStaticMarkup(createElement(ActivityEdge, { active: true, intensity: 'quiet', palette: 'spectrum' }));
  assert.match(preview, /data-intensity="subtle"/);
  assert.match(preview, /data-palette="spectrum"/);
});

test('an offscreen mount stays paused until it enters, and pauses again on exit', () => {
  const h = harness();
  assert.equal(h.element.dataset.visible, 'false');
  h.intersect(false);
  assert.equal(h.element.dataset.visible, 'false');
  h.intersect(true);
  assert.equal(h.element.dataset.visible, 'true');
  h.intersect(false);
  assert.equal(h.element.dataset.visible, 'false');
  h.intersect(true);
  assert.equal(h.element.dataset.visible, 'true');
  h.dispose();
});

test('a hidden mount can intersect without running and resumes only when the document reappears', () => {
  const h = harness({ hidden: true });
  h.intersect(true);
  assert.equal(h.element.dataset.visible, 'false');
  h.hide(false);
  assert.equal(h.element.dataset.visible, 'true');
  h.hide(true);
  assert.equal(h.element.dataset.visible, 'false');
  h.intersect(false);
  h.hide(false);
  assert.equal(h.element.dataset.visible, 'false');
  h.dispose();
});

test('this drawing starts on edge intersection without waiting for a second threshold-zero callback', () => {
  const h = harness();
  h.observers[0].callback([{ target: {}, isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(h.element.dataset.visible, 'false');
  h.intersect(true, 0);
  assert.equal(h.element.dataset.visible, 'true');
  h.intersect(true, .01);
  assert.equal(h.element.dataset.visible, 'true');
  h.dispose();
});

test('cleanup pauses the drawing and removes observers and document listeners', () => {
  const h = harness();
  h.intersect(true);
  assert.equal(h.document.listeners.size, 1);
  h.dispose();
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.element.dataset.visible, 'false');
  // A callback queued before disconnect must not revive an unmounted drawing.
  h.intersect(true);
  h.hide(false);
  assert.equal(h.element.dataset.visible, 'false');
});

test('without IntersectionObserver, document visibility still controls drawing and cleanup', () => {
  const h = harness({ observer: false, hidden: true });
  assert.equal(h.element.dataset.visible, 'false');
  h.hide(false);
  assert.equal(h.element.dataset.visible, 'true');
  h.hide(true);
  assert.equal(h.element.dataset.visible, 'false');
  h.dispose();
  assert.equal(h.document.listeners.size, 0);
});
