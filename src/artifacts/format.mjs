const codeLanguages = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  py: 'python', css: 'css', scss: 'scss', json: 'json', jsonc: 'jsonc', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql', go: 'go', java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cpp: 'clike', hpp: 'clike', rs: 'text', rb: 'ruby', php: 'php', xml: 'markup', diff: 'diff', patch: 'diff',
};
const rasterExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico']);
const binaryExtensions = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'mp3', 'wav', 'mp4', 'mov', ...rasterExtensions]);
const officeFormats = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', part: 'word/document.xml' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', part: 'xl/workbook.xml' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', part: 'ppt/presentation.xml' },
};
const legacyOfficeMimes = { doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint' };

/** Extension wins over a broad runtime text/code classification. Never execute JSX/TSX. */
export function artifactFormat(artifact) {
  const name = artifact.name.toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  const extension = name.split('.').at(-1) || '';
  if (extension === 'svg') return { kind: 'svg', label: 'SVG', language: 'markup', mime: 'image/svg+xml', editable: true };
  if (rasterExtensions.has(extension)) return { kind: 'image', label: extension.toUpperCase(), language: 'text', mime: `image/${extension === 'jpg' ? 'jpeg' : extension}`, editable: false };
  if (officeFormats[extension]) return { kind: 'office', label: extension.toUpperCase(), language: 'text', mime: officeFormats[extension].mime, editable: false };
  if (legacyOfficeMimes[extension]) return { kind: 'legacy-office', label: extension.toUpperCase(), language: 'text', mime: legacyOfficeMimes[extension], editable: false };
  if (binaryExtensions.has(extension)) return { kind: extension === 'pdf' ? 'pdf' : 'binary', label: extension.toUpperCase(), language: 'text', mime: extension === 'pdf' ? 'application/pdf' : 'application/octet-stream', editable: false };
  if (extension === 'csv' || extension === 'tsv') return { kind: 'table', label: extension.toUpperCase(), language: 'text', mime: extension === 'csv' ? 'text/csv' : 'text/tab-separated-values', editable: true };
  if (['html', 'htm'].includes(extension) || artifact.type === 'html') return { kind: 'html', label: 'HTML', language: 'markup', mime: 'text/html', editable: true };
  if (['md', 'markdown', 'mdx'].includes(extension) || artifact.type === 'markdown') return { kind: 'markdown', label: extension === 'mdx' ? 'MDX' : 'Markdown', language: 'markdown', mime: 'text/markdown', editable: true };
  const language = name === 'dockerfile' ? 'docker' : codeLanguages[extension];
  if (language || artifact.type === 'code') return { kind: 'code', label: language === 'text' ? extension.toUpperCase() : (language || 'Code'), language: language || 'text', mime: extension === 'json' ? 'application/json' : 'text/plain', editable: true };
  return { kind: 'text', label: 'TXT', language: 'text', mime: 'text/plain', editable: true };
}

/** Bounded RFC 4180-style parsing; cells stay literal and the first row remains data. */
export function parseDelimited(content, delimiter = ',', maxRows = 500, maxColumns = 100) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  const input = content.replace(/^\uFEFF/, '');
  const cell = () => { if (row.length >= maxColumns) throw new Error('columns'); row.push(field); field = ''; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error('quotes');
      quoted = true;
    } else if (char === delimiter) cell();
    else if (char === '\r' || char === '\n') {
      cell(); rows.push(row); row = [];
      if (char === '\r' && input[i + 1] === '\n') i++;
      if (rows.length >= maxRows && i < input.length - 1) return { rows, truncated: true };
    } else { if (closed) throw new Error('quotes'); field += char; }
  }
  if (quoted) throw new Error('quotes');
  if (field || row.length || closed) { cell(); rows.push(row); }
  return { rows, truncated: false };
}

export function fileSizeLabel(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Binary metadata describes decoded bytes; text sizes follow the current UTF-8 content. */
export function artifactContentSize(artifact) {
  const format = artifactFormat(artifact);
  if (!format.editable || artifact.encoding === 'data-url') {
    if (Number.isSafeInteger(artifact.size) && artifact.size >= 0) return artifact.size;
    return typeof artifact.content === 'string' ? embeddedFileByteLength(artifact.content, artifact.mime || format.mime) : undefined;
  }
  return typeof artifact.content === 'string' ? new TextEncoder().encode(artifact.content).length : undefined;
}

const fileSignatures = {
  'application/pdf': raw => raw.startsWith('%PDF-'),
  'image/png': raw => raw.startsWith('\x89PNG\r\n\x1a\n'),
  'image/jpeg': raw => raw.startsWith('\xff\xd8\xff'),
  'image/gif': raw => /^GIF8[79]a/.test(raw),
  'image/webp': raw => raw.startsWith('RIFF') && raw.slice(8, 12) === 'WEBP',
  'image/avif': raw => raw.slice(4, 8) === 'ftyp' && /avi[fs]/.test(raw.slice(8, 32)),
  'image/bmp': raw => raw.startsWith('BM'),
  'image/ico': raw => raw.startsWith('\0\0\x01\0'),
  ...Object.fromEntries(Object.values(officeFormats).map(({ mime }) => [mime, raw => raw.length >= 30 && raw.startsWith('PK\x03\x04')])),
  ...Object.fromEntries(Object.values(legacyOfficeMimes).map(mime => [mime, raw => raw.startsWith('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1')])),
};

/** Confirm the ZIP directory identifies this OOXML package; the server validates its content. */
function officeContainerMatches(bytes, mime) {
  const format = Object.values(officeFormats).find(format => format.mime === mime);
  if (!format) return true;
  if (bytes.length < 52) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 65557) || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return false;
  const entries = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true);
  if (!entries || entries > 4096 || view.getUint16(end + 8, true) !== entries || cursor + size !== end) return false;
  const names = new Set();
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50 || view.getUint16(cursor + 8, true) & 1) return false;
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || next > end) return false;
    names.add(new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    cursor = next;
  }
  return cursor === end && names.has('[Content_Types].xml') && names.has(format.part);
}

/** Validate the full encoding but decode only a small signature for lists and metadata. */
function embeddedFileInfo(content, mime) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/\s]*={0,2})$/.exec(content.trim());
  if (!match || match[1].toLowerCase() !== mime) return null;
  const data = match[2].replace(/\s/g, '');
  if (!data.length || data.length % 4) return null;
  try {
    const head = atob(data.slice(0, 64));
    if (!fileSignatures[mime]?.(head)) return null;
    return { data, size: data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0) };
  } catch { return null; }
}

export function embeddedFileByteLength(content, mime) {
  return embeddedFileInfo(content, mime)?.size;
}

/** Decode once at the actual viewer/download boundary, never while laying out a card. */
export function embeddedFile(content, mime) {
  const info = embeddedFileInfo(content, mime);
  if (!info) return null;
  try {
    const raw = atob(info.data), bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    return officeContainerMatches(bytes, mime) ? bytes : null;
  }
  catch { return null; }
}
