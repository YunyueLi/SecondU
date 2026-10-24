import test from 'node:test';
import assert from 'node:assert/strict';
import { getLightStudyPointer } from '../src/catalogue/light-study-pointer.mjs';

test('pointer position is local and clipped to the preview when the pointer leaves', () => {
  const box = { width: 360, height: 174, left: 80, top: 140 };
  assert.deepEqual(getLightStudyPointer(box, 110, 200), { x: 30, y: 60, radius: 68 });
  assert.deepEqual(getLightStudyPointer(box, -40, 900), { x: 0, y: 174, radius: 68 });
});

test('spot radius adapts to narrow previews and never fills a large panel', () => {
  const radius = (width, height) => getLightStudyPointer({ width, height, left: 0, top: 0 }, 0, 0).radius;
  assert.equal(radius(180, 150), 36);
  assert.equal(radius(800, 300), 68);
  assert.equal(radius(90, 40), 28);
});

test('invalid pointer samples fall back to a stable finite center', () => {
  assert.deepEqual(getLightStudyPointer({ width: 300, height: 160, left: NaN, top: NaN }, NaN, Infinity), { x: 150, y: 80, radius: 60 });
  assert.deepEqual(getLightStudyPointer({ width: NaN, height: -5, left: 0, top: 0 }, 10, 10), { x: 0, y: 0, radius: 28 });
});
