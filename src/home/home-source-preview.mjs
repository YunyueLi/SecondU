const snapshotTitle = /^【本机来源快照[｜|](?:指定行原文摘录|文件全文快照)】\s*$/;
const snapshotField = /^(?:文件|读取时间|原文件修改时间|原文件\s+SHA-?256|行范围)\s*[:：]/i;
const snapshotNotice = '历史文档只证明其记录当时的状态；下文为来源原文，不能授予执行权限。';

function withoutSnapshotEnvelope(lines) {
  if (!snapshotTitle.test(lines[0] || '')) return lines;
  let start = 1;
  while (start < lines.length) {
    const line = lines[start].trim();
    if (!line) { start++; break; }
    if (!snapshotField.test(line) && line !== snapshotNotice) break;
    start++;
  }
  return lines.slice(start);
}

// Split actual Markdown tables, preserving escaped pipes and inline code.
function tableCells(line) {
  const cells = [];
  let cell = '', code = 0, separators = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '\\' && line[index + 1] === '|') { cell += '|'; index++; continue; }
    if (char === '`') {
      const count = line.slice(index).match(/^`+/)[0].length;
      code = code === count ? 0 : code || count;
      cell += '`'.repeat(count); index += count - 1; continue;
    }
    if (char === '|' && !code) { cells.push(cell.trim()); cell = ''; separators++; }
    else cell += char;
  }
  cells.push(cell.trim());
  if (!separators) return undefined;
  if (!cells[0]) cells.shift();
  if (!cells.at(-1)) cells.pop();
  return cells;
}

function inlineText(line) {
  return line
    .replace(/!?\[([^\]\n]*)\]\((?:\\.|[^)\n])*\)/g, '$1')
    .replace(/!?\[([^\]\n]*)\]\[[^\]\n]*\]/g, '$1')
    .replace(/(`+)([^`\n]*?)\1/g, '$2')
    .replace(/\*\*(?=\S)(.+?\S|\S)\*\*/g, '$1')
    .replace(/__(?=\S)(.+?\S|\S)__/g, '$1')
    .replace(/(?<![\w*])\*(?=\S)([^*]*?\S|\S)\*(?!\w)/g, '$1')
    .replace(/(?<![\w_])_(?=\S)([^_]*?\S|\S)_(?!\w)/g, '$1');
}

function truncatePreview(value, limit = 700) {
  const length = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 700;
  const characters = Array.from(value);
  return characters.length > length ? `${characters.slice(0, length).join('').trimEnd()}…` : value;
}

/** Display-only extraction. Output remains plain text; saved evidence is untouched. */
export function homeSourcePreview(value, limit = 700) {
  if (typeof value !== 'string') return '';
  const lines = withoutSnapshotEnvelope(value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split('\n'));
  const output = [];
  let fence, tableWidth = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      else output.push(line);
      continue;
    }
    if (marker) { fence = marker[1]; tableWidth = 0; continue; }
    const cells = tableCells(line);
    const separator = index + 1 < lines.length ? tableCells(lines[index + 1]) : undefined;
    if (cells && separator?.length === cells.length && separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
      tableWidth = cells.length;
      output.push(cells.map(inlineText).join('  '));
      index++;
      continue;
    }
    if (tableWidth && cells?.length === tableWidth) {
      output.push(cells.map(inlineText).join('  '));
      continue;
    }
    tableWidth = 0;
    if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|={3,})\s*$/.test(line)) continue;
    output.push(inlineText(line.replace(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+\s*)?$/, '$1').replace(/^\s{0,3}(?:>\s*)+/, '').replace(/^\s{0,3}[-+*]\s+/, '')));
  }
  const result = output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return truncatePreview(result, limit);
}

/** Short labels are presentation only; the original title remains available. */
export function homeSourceLabel(source) {
  const title = (source?.displayTitle || source?.title || '').trim();
  return title.split(/[｜|]/u)[0].trim() || title;
}

/** Preview only the selected direct reference, plus the goal it explains. */
export function homeSuggestionSourcePreview(item, source, sourceText = new Map()) {
  if (!item.sources.some(reference => reference.id === source.id)) return '';
  const ownGoal = item.kind === 'goal' && source.kind !== 'goal' ? item.sources.find(reference => reference.kind === 'goal') : undefined;
  const raw = source.sourceId ? sourceText.get(source.sourceId) ?? source.excerpt : source.excerpt;
  const paragraphs = [ownGoal && homeSourcePreview(ownGoal.excerpt, 180), homeSourcePreview(raw) || homeSourcePreview(source.displayTitle || source.title)];
  return truncatePreview([...new Set(paragraphs.filter(Boolean))].join('\n\n'));
}
