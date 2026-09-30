import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Button, CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { CodeBlockBase } from '@openai/apps-sdk-ui/components/CodeBlock';
import { Code, Document, FileImage, FileSpreadsheet, Globe } from '@openai/apps-sdk-ui/components/Icon';
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown';
import type { Artifact } from '../../shared/contracts';
import { t } from '../i18n';
import { artifactFormat, embeddedFile, embeddedFileByteLength, fileSizeLabel, parseDelimited, type ArtifactFormat } from './format.mjs';
import { staticDocument } from './staticDocument';
import { OfficePreview } from './OfficePreview';
import './artifacts.css';

type ArtifactInput = Pick<Artifact, 'name'> & Partial<Pick<Artifact, 'id' | 'version' | 'type' | 'content'>>;
const PdfPreview = lazy(() => import('./PdfPreview'));

export function ArtifactIcon({ format }: { format: ArtifactFormat }) {
  const Icon = format.kind === 'table' || format.label === 'XLSX' || format.label === 'XLS' ? FileSpreadsheet : ['image', 'svg'].includes(format.kind) ? FileImage : format.kind === 'html' ? Globe : format.kind === 'code' ? Code : Document;
  return <Icon />;
}

export function ArtifactThumbnail({ artifact, large = false }: { artifact: ArtifactInput; large?: boolean }) {
  const format = artifactFormat(artifact);
  const content = artifact.content || '';
  const hasImage = useMemo(() => format.kind === 'image' && embeddedFileByteLength(content, format.mime) !== undefined, [content, format.kind, format.mime]);
  return <span className={`artifact-thumbnail ${large ? 'is-large' : ''}`} data-kind={format.kind} aria-hidden="true">
    {hasImage ? <img src={content.trim()} alt="" loading="lazy" /> : <><ArtifactIcon format={format} />{large && <span className="artifact-thumbnail-lines">{format.editable ? content.replace(/<[^>]*>/g, '').replace(/[#*>`]/g, '').slice(0, 240) : format.label}</span>}</>}
    {large && <span className="artifact-thumbnail-format">{format.label}</span>}
  </span>;
}

export function ArtifactCode({ content, language, label }: { content: string; language: string; label: string }) {
  const [wrap, setWrap] = useState(false);
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  // Large files stay readable without blocking the UI on synchronous tokenization.
  const highlight = content.length <= 200_000;
  return <CodeBlockBase className="artifact-code">
    <div className="artifact-preview-toolbar"><span>{label}<span className="artifact-stat">{t(`${lines.length} 行`, `${lines.length} lines`)}</span></span><div><Button color="secondary" variant="ghost" size="xs" selected={wrap} aria-pressed={wrap} onClick={() => setWrap(!wrap)}>{t('自动换行', 'Wrap lines')}</Button><CopyButton copyValue={content} color="secondary" variant="ghost" size="sm" uniform aria-label={t('复制全部代码', 'Copy all code')} /></div></div>
    <div className="artifact-code-scroll" data-wrap={wrap} tabIndex={0} aria-label={t('源代码，可横向滚动', 'Source code, scroll horizontally')}>
      <pre className="artifact-line-numbers" aria-hidden="true">{lines.map((_, index) => index + 1).join('\n')}</pre>
      {highlight ? <CodeBlockBase.Code className="artifact-code-source" language={language}>{content}</CodeBlockBase.Code> : <pre className="artifact-code-source"><code>{content}</code></pre>}
    </div>
  </CodeBlockBase>;
}

function columnName(index: number) {
  let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function TablePreview({ content, delimiter }: { content: string; delimiter: string }) {
  const result = useMemo(() => { try { return { ...parseDelimited(content, delimiter), error: '' }; } catch { return { rows: [], truncated: false, error: t('表格的引号或列数不符合格式，请在源码中检查。', 'The table has malformed quotes or too many columns. Check its source.') }; } }, [content, delimiter]);
  if (result.error) return <p className="artifact-preview-notice" role="alert">{result.error}</p>;
  if (!result.rows.length) return <p className="artifact-preview-notice">{t('这张表格还没有内容。', 'This table is empty.')}</p>;
  const columns = Math.max(...result.rows.map(row => row.length));
  return <div className="artifact-table-preview"><div className="artifact-table-scroll" tabIndex={0}><table aria-label={t('表格内容', 'Table contents')}><thead><tr><th aria-label={t('行号', 'Row number')} />{Array.from({ length: columns }, (_, i) => <th key={i} scope="col">{columnName(i)}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={index}><th scope="row">{index + 1}</th>{Array.from({ length: columns }, (_, i) => <td key={i}>{row[i] ?? ''}</td>)}</tr>)}</tbody></table></div><p className="artifact-preview-caption">{t(`${result.rows.length} 行，${columns} 列`, `${result.rows.length} rows, ${columns} columns`)}{result.truncated && t('。显示前 500 行，下载查看完整文件。', '. First 500 rows shown; download the complete file.')}</p></div>;
}

function BinaryPreview({ artifact, content, format, fileBytes, version }: { artifact: ArtifactInput; content: string; format: ArtifactFormat; fileBytes?: Uint8Array<ArrayBuffer> | null; version?: number }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const bytes = useMemo(() => fileBytes ?? embeddedFile(content, format.mime), [content, format.mime, fileBytes]);
  useEffect(() => {
    setFailed(false);
    if (!bytes || format.kind !== 'image') { setUrl(undefined); return; }
    const next = URL.createObjectURL(new Blob([bytes], { type: format.mime }));
    setUrl(next); return () => URL.revokeObjectURL(next);
  }, [bytes, format.kind, format.mime]);
  if (format.kind === 'office') return <OfficePreview id={artifact.id} version={version ?? artifact.version} name={artifact.name} available={!!bytes} />;
  if (format.kind === 'legacy-office') return <div className="artifact-unavailable"><ArtifactIcon format={format} /><strong>{t(`暂不支持 ${format.label} 预览`, `${format.label} preview is not supported`)}</strong><p>{bytes ? t('旧版 Office 格式请下载原件，在本机应用中打开。', 'Download this legacy Office file and open it in a local app.') : t('这条记录没有完整的原文件数据。请使用原件，或另存为 DOCX、XLSX、PPTX 后生成新的产物。', 'This record has no complete original bytes. Use the original file, or save it as DOCX, XLSX or PPTX to create a new artifact.')}</p></div>;
  if (!bytes || failed) return <div className="artifact-unavailable"><ArtifactIcon format={format} /><strong>{t('还没有可预览的文件内容', 'No previewable file content')}</strong><p>{t('当前记录没有完整的文件数据。文件名或文字说明无法还原图片和 PDF。', 'This record does not contain the complete file data. A filename or description cannot recreate an image or PDF.')}</p></div>;
  if (format.kind === 'pdf') return <Suspense fallback={<p className="artifact-preview-notice" role="status">{t('正在载入 PDF 阅读器…', 'Loading PDF reader…')}</p>}><PdfPreview bytes={bytes} name={artifact.name} /></Suspense>;
  if (format.kind === 'image' && !url) return <p className="artifact-preview-notice" role="status">{t('正在载入图片…', 'Loading image…')}</p>;
  if (format.kind === 'image') return <div className="artifact-image-preview"><img src={url} alt={artifact.name} onError={() => setFailed(true)} /><p className="artifact-preview-caption">{artifact.name}</p></div>;
  return <p className="artifact-preview-notice">{t('此格式请下载后打开。', 'Download this file to open it.')}</p>;
}

export function ArtifactPreview({ artifact, content, fileBytes, version, embedded = false }: { embedded?: boolean; artifact: ArtifactInput; content: string; fileBytes?: Uint8Array<ArrayBuffer> | null; version?: number }) {
  const format = artifactFormat(artifact);
  const [source, setSource] = useState(false);
  useEffect(() => setSource(false), [artifact.name]);
  const html = useMemo(() => ['html', 'svg'].includes(format.kind) ? staticDocument(content) : '', [content, format.kind]);
  const visual = ['html', 'svg', 'markdown', 'table'].includes(format.kind);
  const bytes = visual ? new TextEncoder().encode(content).length : 0;
  return <div className={`artifact-preview artifact-preview-${format.kind}`}>
    {visual && !(embedded && format.kind === 'markdown') && <div className="artifact-preview-toolbar"><span>{format.label}<span className="artifact-stat">{fileSizeLabel(bytes)}</span></span><div role="group" aria-label={t('内容显示方式', 'Content display')}><Button color="secondary" variant="ghost" size="xs" selected={!source} aria-pressed={!source} onClick={() => setSource(false)}>{t('预览', 'Preview')}</Button><Button color="secondary" variant="ghost" size="xs" selected={source} aria-pressed={source} onClick={() => setSource(true)}>{t('源码', 'Source')}</Button></div></div>}
    {source || format.kind === 'code' || format.kind === 'text' ? <ArtifactCode content={content} language={format.language} label={format.label} />
      : format.kind === 'markdown' ? <Markdown className="document-markdown artifact-markdown">{content}</Markdown>
      : format.kind === 'table' ? <TablePreview content={content} delimiter={format.label === 'TSV' ? '\t' : ','} />
      : format.kind === 'html' || format.kind === 'svg' ? <><iframe className="artifact-html-preview" title={artifact.name} sandbox="" referrerPolicy="no-referrer" srcDoc={html} /><p className="artifact-preview-caption">{t('静态预览，未加载外部资源与脚本。', 'Static preview. External resources and scripts are not loaded.')}</p></>
      : <BinaryPreview artifact={artifact} content={content} format={format} fileBytes={fileBytes} version={version} />}
  </div>;
}
