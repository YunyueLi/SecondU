import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ChevronLeft, ChevronRight, Minus, Plus } from '@openai/apps-sdk-ui/components/Icon';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { t } from '../i18n';

GlobalWorkerOptions.workerSrc = workerUrl;
const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;

function errorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return name === 'PasswordException'
    ? t('这份 PDF 已加密，请下载后使用密码打开。', 'This PDF is encrypted. Download it and open it with its password.')
    : name === 'InvalidPDFException'
      ? t('PDF 文件不完整或已损坏，请检查原文件。', 'This PDF is incomplete or damaged. Check the original file.')
      : t('这份 PDF 暂时无法渲染。可以重试或下载原文件。', 'This PDF could not be rendered. Retry or download the original file.');
}

function PdfPage({ pdf, number, width, zoom, name, onScale }: {
  pdf: PDFDocumentProxy; number: number; width: number; zoom: number | 'fit'; name: string; onScale: (scale: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const container = host.current;
    if (!container || width <= 0) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;
    // A fresh canvas prevents a cancelled render from racing a new page or zoom.
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', t(`${name}，第 ${number} 页`, `${name}, page ${number}`));
    canvas.style.visibility = 'hidden';
    container.replaceChildren(canvas);
    setStatus('loading'); setText('');
    void (async () => {
      page = await pdf.getPage(number);
      if (cancelled) { page.cleanup(); return; }
      const natural = page.getViewport({ scale: 1 });
      const scale = zoom === 'fit' ? Math.max(0.05, width / natural.width) : zoom;
      const viewport = page.getViewport({ scale });
      // Bound a single page to 16 MP, including HiDPI, without changing its CSS size.
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)), 8192 / Math.max(viewport.width, viewport.height));
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      onScale(scale);
      renderTask = page.render({ canvas, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      await renderTask.promise;
      if (cancelled) return;
      canvas.style.visibility = 'visible'; setStatus('ready');
      // Selected-page text remains available to assistive technology.
      // Missing extractable text must not discard a successfully rendered scan.
      void page.getTextContent().then(content => {
        if (!cancelled) setText(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      }).catch(() => {});
    })().catch(error => {
      if (cancelled || error?.name === 'RenderingCancelledException') return;
      canvas.remove(); setError(errorMessage(error)); setStatus('error');
    });
    return () => {
      cancelled = true; renderTask?.cancel(); canvas.remove();
      // Cleanup waits for rendering cancellation; the document owner destroys its worker.
      if (renderTask) void renderTask.promise.catch(() => {}).finally(() => page?.cleanup());
      else page?.cleanup();
    };
  }, [pdf, number, width, zoom, name, onScale, attempt]);
  return <div className="artifact-pdf-page" aria-busy={status === 'loading'}>
    <div ref={host} className="artifact-pdf-canvas" />
    {status === 'loading' && <p className="artifact-pdf-status" role="status">{t(`正在绘制第 ${number} 页…`, `Rendering page ${number}…`)}</p>}
    {status === 'error' && <div className="artifact-pdf-error" role="alert"><p>{error}</p><Button color="secondary" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{t('重试', 'Retry')}</Button></div>}
    {text && <p className="sr-only">{text}</p>}
  </div>;
}

export default function PdfPreview({ bytes, name }: { bytes: Uint8Array<ArrayBuffer>; name: string }) {
  const [loaded, setLoaded] = useState<{ bytes: Uint8Array<ArrayBuffer>; pdf: PDFDocumentProxy }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [number, setNumber] = useState(1);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const pdf = loaded?.bytes === bytes ? loaded.pdf : undefined;
  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined); setError(''); setNumber(1); setZoom('fit');
    // PDF.js transfers its input to the worker. Keep the source bytes intact for downloads.
    const task = getDocument({ data: bytes.slice(), cMapUrl: `${assetBase}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assetBase}standard_fonts/`, wasmUrl: `${assetBase}wasm/`, iccUrl: `${assetBase}iccs/`, enableXfa: false, canvasMaxAreaInBytes: 64_000_000 });
    void task.promise.then(pdf => { if (!cancelled) setLoaded({ bytes, pdf }); }).catch(error => { if (!cancelled) setError(errorMessage(error)); });
    return () => { cancelled = true; void task.destroy().catch(() => {}); };
  }, [bytes, attempt]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(0, Math.floor(element.clientWidth - 32)));
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  const changePage = (next: number) => { if (pdf) { setNumber(Math.max(1, Math.min(pdf.numPages, next))); stage.current?.scrollTo(0, 0); } };
  const changeZoom = (delta: number) => setZoom(Math.max(0.25, Math.min(3, Math.round(((zoom === 'fit' ? scale : zoom) + delta) * 100) / 100)));
  return <section className="artifact-pdf-viewer" aria-label={t('PDF 阅读器', 'PDF reader')}>
    <div className="artifact-preview-toolbar artifact-pdf-toolbar">
      <div role="group" aria-label={t('翻页', 'Page navigation')}><Button color="secondary" variant="ghost" size="sm" uniform disabled={!pdf || number <= 1} onClick={() => changePage(number - 1)} aria-label={t('上一页', 'Previous page')}><ChevronLeft /></Button><span className="artifact-pdf-page-count" aria-live="polite">{pdf ? t(`${number} / ${pdf.numPages} 页`, `Page ${number} / ${pdf.numPages}`) : 'PDF'}</span><Button color="secondary" variant="ghost" size="sm" uniform disabled={!pdf || number >= pdf.numPages} onClick={() => changePage(number + 1)} aria-label={t('下一页', 'Next page')}><ChevronRight /></Button></div>
      <div role="group" aria-label={t('缩放', 'Zoom')}><Button color="secondary" variant="ghost" size="sm" uniform disabled={!pdf || scale <= 0.25} onClick={() => changeZoom(-0.25)} aria-label={t('缩小', 'Zoom out')}><Minus /></Button><span className="artifact-pdf-scale">{Math.round(scale * 100)}%</span><Button color="secondary" variant="ghost" size="sm" uniform disabled={!pdf || scale >= 3} onClick={() => changeZoom(0.25)} aria-label={t('放大', 'Zoom in')}><Plus /></Button><Button color="secondary" variant="ghost" size="xs" disabled={!pdf} selected={zoom === 'fit'} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>{t('适宽', 'Fit width')}</Button></div>
    </div>
    <div className="artifact-pdf-stage" ref={stage} tabIndex={0} aria-label={t('PDF 页面，可滚动查看', 'PDF page, scroll to explore')} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changePage(number + (event.key === 'ArrowLeft' ? -1 : 1)); } }}>
      {error ? <div className="artifact-pdf-error" role="alert"><p>{error}</p><Button color="secondary" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{t('重试', 'Retry')}</Button></div>
        : pdf ? <PdfPage pdf={pdf} number={number} width={width} zoom={zoom} name={name} onScale={setScale} />
          : <p className="artifact-pdf-status" role="status">{t('正在载入 PDF…', 'Loading PDF…')}</p>}
    </div>
  </section>;
}
