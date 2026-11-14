import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { createRequire } from 'node:module';
import { validateOfficeArchive } from './office-content.mjs';
import { textChunks } from './library-text.mjs';

export const PARSER_VERSION = 'library-text-1';
export const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.log']);
export const PARSE_EXTENSIONS = new Set([...TEXT_EXTENSIONS, '.pdf', '.docx']);
const MAX_TEXT = 24 * 1024 * 1024;
const pdfResources = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const orderedXml = new XMLParser({ preserveOrder: true, ignoreAttributes: true, processEntities: true, trimValues: false });

function wordText(nodes) {
  let text = '';
  for (const node of nodes ?? []) for (const [tag, children] of Object.entries(node)) {
    if (tag === 'w:t') text += children.map(child => child['#text'] ?? '').join('');
    else if (tag === 'w:tab') text += '\t';
    else if (tag === 'w:br' || tag === 'w:cr') text += '\n';
    else if (Array.isArray(children) && tag !== 'w:instrText' && tag !== 'w:del') {
      text += wordText(children);
      if (tag === 'w:p' || tag === 'w:tr') text += '\n';
      if (tag === 'w:tc') text += '\t';
    }
  }
  return text;
}

export async function parseLibraryFile(name, bytes) {
  const extension = path.extname(name).toLowerCase();
  if (!PARSE_EXTENSIONS.has(extension)) return { status: 'original_only', chunks: [], detail: '原件已登记；此格式尚未提取正文。' };
  const sections = []; let detail = '', pages;
  if (TEXT_EXTENSIONS.has(extension)) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return { status: 'needs_attention', chunks: [], detail: '文字编码不是 UTF-8，请转换后重试；原件未修改。' }; }
    if (text.includes('\0')) throw new Error('文件含二进制数据，未作为文字索引。');
    sections.push({ text, location: '正文' });
  } else if (extension === '.docx') {
    const { xml } = validateOfficeArchive(name, Buffer.from(bytes), { maxBytes: 64 * 1024 * 1024 });
    const main = wordText(orderedXml.parse(xml.get('word/document.xml')));
    sections.push({ text: main, location: '文档正文（段落顺序；不推测页码）' });
    for (const [part, source] of xml) if (/^word\/(?:footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(part)) {
      sections.push({ text: wordText(orderedXml.parse(source)), location: part });
    }
  } else {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0, cMapUrl: path.join(pdfResources, 'cmaps') + path.sep, cMapPacked: true, standardFontDataUrl: path.join(pdfResources, 'standard_fonts') + path.sep, wasmUrl: path.join(pdfResources, 'wasm') + path.sep });
    let doc;
    try {
      doc = await loading.promise; pages = doc.numPages;
      if (pages > 10000) throw new Error('PDF 超过 10000 页，已保留原件登记；请拆分后重试。');
      let characters = 0, emptyPages = 0;
      for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str === undefined ? '' : item.str + (item.hasEOL ? '\n' : ' ')).join('');
        characters += text.length;
        if (characters > MAX_TEXT) throw new Error('提取文字超过本次单文件处理上限，未保存不完整索引。');
        if (!text.trim()) emptyPages++;
        sections.push({ text, location: `第 ${pageNumber} 页`, page: pageNumber });
        page.cleanup();
      }
      detail = `共 ${pages} 页` + (emptyPages ? `；${emptyPages} 页未提取到文字，可能需要文字识别。` : '；已逐页提取文字。');
      if (emptyPages === pages) return { status: 'needs_ocr', chunks: [], detail, pages };
      if (emptyPages) detail += '搜索仅覆盖有文字的页面。';
    } finally { await loading.destroy(); }
  }
  if (sections.reduce((sum, section) => sum + section.text.length, 0) > MAX_TEXT) throw new Error('提取文字超过单文件上限，未保存不完整索引。');
  const chunks = textChunks(sections);
  return { status: chunks.length ? 'ready' : 'empty', chunks, detail: detail || (chunks.length ? '正文已索引。' : '文件未提取到文字。'), ...(pages ? { pages } : {}) };
}
