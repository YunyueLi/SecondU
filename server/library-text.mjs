// Search representation is deliberately separate from the immutable quotation.
// Han bigrams support Chinese substrings without a language-model dependency.
export function searchTokens(value, { indexing = false } = {}) {
  const normalized = String(value ?? '').normalize('NFKC').toLowerCase();
  const terms = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.flatMap(term => {
    if (!/\p{Script=Han}/u.test(term)) return [term];
    return (term.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) ?? []).flatMap(run => {
      if (!/\p{Script=Han}/u.test(run)) return [run];
      const chars = [...run];
      return chars.length === 1 ? chars : [...(indexing ? chars : []), ...chars.slice(0, -1).map((char, index) => char + chars[index + 1])];
    });
  });
}

export function matchQuery(value) {
  const tokens = [...new Set(searchTokens(String(value).slice(0, 300)))].slice(0, 48);
  return tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(' OR ');
}

export function textChunks(sections, { size = 2400, overlap = 160 } = {}) {
  const chunks = [];
  for (const section of sections) {
    const text = section.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    if (!text.trim()) continue;
    let line = 1, previousStart = 0;
    for (let start = 0; start < text.length;) {
      const end = Math.min(start + size, text.length);
      line += text.slice(previousStart, start).match(/\n/g)?.length ?? 0;
      chunks.push({ text: text.slice(start, end), location: section.location, start, end,
        line });
      if (end === text.length) break;
      previousStart = start;
      start = end - overlap;
    }
  }
  return chunks;
}
