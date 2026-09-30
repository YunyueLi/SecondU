import authored from './fixtures/demo-zh-content-v1.json' with { type: 'json' };

function materialize(value, stamp) {
  if (value === '__DEMO_STAMP__') return stamp;
  if (Array.isArray(value)) return value.map(item => materialize(item, stamp));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, stamp)]));
  return value;
}

/** Chinese authored biography and daily life; the US space uses its own fixture. */
export function chineseDemoPart(part, stamp = new Date().toISOString()) {
  if (!Object.hasOwn(authored, part)) throw new Error(`Unknown Chinese demo section: ${part}`);
  return materialize(authored[part], stamp);
}
