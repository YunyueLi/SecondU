import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineYearGroups, readTimelineYearState, timelineYearIsOpen } from '../src/cognition/timelineGrouping.mjs';

test('year overview includes old years beyond the initial 60-record page', () => {
  const items = [...Array.from({ length: 80 }, (_, index) => ({ id: `recent-${index}`, date: '2026-09-30', title: `Recent ${index}`, scope: 'note' })), { id: 'old', date: '2019', title: 'First job', scope: 'milestone' }];
  const groups = timelineYearGroups(items);
  assert.deepEqual(groups.map(group => [group.year, group.items.length]), [['2026', 80], ['2019', 1]]);
  assert.equal(groups[1].items[0], items.at(-1));
  assert.equal(groups[1].items[0].date, '2019');
});

test('year labels and previews preserve partial dates and existing milestone titles', () => {
  const items = [{ date: '2024-06', title: 'A saved note', scope: 'note' }, { date: '2024', title: 'Moved home', scope: 'milestone' }, { date: '2024-01-03', title: 'First project', scope: 'milestone' }, { date: '', title: 'Undated note', scope: 'note' }];
  const before = JSON.stringify(items), groups = timelineYearGroups(items);
  assert.deepEqual(groups.map(group => group.year), ['2024', 'undated']);
  assert.deepEqual(groups[0].titles, ['Moved home', 'First project']);
  assert.equal(JSON.stringify(items), before);
});

test('only the current year opens by default and saved choices override the default', () => {
  assert.equal(timelineYearIsOpen('2026', {}, '2026'), true);
  assert.equal(timelineYearIsOpen('2025', {}, '2026'), false);
  assert.equal(timelineYearIsOpen('undated', {}, '2026'), false);
  const saved = readTimelineYearState(JSON.stringify({ '2026': false, '2025': true }));
  assert.equal(timelineYearIsOpen('2026', saved, '2026'), false);
  assert.equal(timelineYearIsOpen('2025', saved, '2026'), true);
});

test('malformed display preferences do not open years or accept unrelated fields', () => {
  assert.deepEqual(readTimelineYearState('broken'), {});
  assert.deepEqual(readTimelineYearState('null'), {});
  assert.deepEqual(readTimelineYearState('[true]'), {});
  assert.deepEqual(readTimelineYearState('{"2026":false,"2025":"true","other":true,"undated":true}'), { '2026': false, undated: true });
});
