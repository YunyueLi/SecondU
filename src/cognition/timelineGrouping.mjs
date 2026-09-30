/** Group the existing feed; titles are excerpts, never generated summaries. */
export function timelineYearGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const year = /^(\d{4})(?:-|$)/.exec(item.date)?.[1] || 'undated';
    if (!groups.has(year)) groups.set(year, { year, items: [], titles: [] });
    groups.get(year).items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.year === 'undated' ? 1 : b.year === 'undated' ? -1 : b.year.localeCompare(a.year)).map(group => {
    const milestones = group.items.filter(item => item.scope === 'milestone');
    const candidates = milestones.length ? milestones : group.items;
    return { ...group, titles: [...new Set(candidates.map(item => item.title).filter(Boolean))].slice(0, 2) };
  });
}

export function readTimelineYearState(serialized) {
  try {
    const value = JSON.parse(serialized || '{}');
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter(([year, open]) => /^(\d{4}|undated)$/.test(year) && typeof open === 'boolean'));
  } catch { return {}; }
}

export function timelineYearIsOpen(year, overrides, currentYear) {
  return overrides[year] ?? year === currentYear;
}
