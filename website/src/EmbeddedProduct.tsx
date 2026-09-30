import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSiteLanguage } from './site-language';
import { useSiteTheme } from './site-theme';
import './embedded-product.css';

const WIDTH = 1440, HEIGHT = 900;
export default function EmbeddedProduct() {
  const { language, t } = useSiteLanguage();
  const { theme } = useSiteTheme();
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const stageHeight = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState('task/website-weekend');
  // Theme/language updates use a message, preserving the frame and its drafts.
  const [source] = useState(() => `${import.meta.env.BASE_URL}product/embed.html?space=demo-cn-v1&lang=${language}&theme=${theme}#task/website-weekend`);
  const state = useRef({ language, theme, expanded }); state.current = { language, theme, expanded };
  const send = (next?: string) => frame.current?.contentWindow?.postMessage({ type: 'secondu-website-example', ...state.current, ...(next ? { route: next } : {}) }, location.origin);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const fit = () => element.style.setProperty('--product-scale', String(element.clientWidth / WIDTH));
    fit(); const resize = new ResizeObserver(fit); resize.observe(element);
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: '500px' });
    observer.observe(element);
    return () => { resize.disconnect(); observer.disconnect(); };
  }, []);
  useEffect(() => { if (ready) send(); }, [language, theme, ready, expanded]);
  useLayoutEffect(() => {
    if (!expanded || !workspace.current) return;
    const muted: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = workspace.current;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) if (sibling !== branch && sibling instanceof HTMLElement) {
        muted.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
      }
      if (parent === document.body) break;
      branch = parent;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setExpanded(false); }
    };
    addEventListener('keydown', escape);
    return () => {
      removeEventListener('keydown', escape);
      for (const item of muted) item.element.inert = item.inert;
      document.body.style.overflow = overflow;
      expandButton.current?.focus({ preventScroll: true });
    };
  }, [expanded]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'secondu-example-ready') { setReady(true); send(); }
      if (event.data?.type === 'secondu-example-collapse') setExpanded(false);
      if (!state.current.expanded && event.data?.type === 'secondu-example-scroll' && Number.isFinite(event.data.deltaY)) window.scrollBy({ top: Math.max(-1000, Math.min(1000, event.data.deltaY)), behavior: 'auto' });
    };
    addEventListener('message', receive); return () => removeEventListener('message', receive);
  }, []);
  return <section id="product-window" className={`embedded-product${expanded ? ' is-expanded' : ''}`} aria-label={t('可操作的 SecondU 产品界面', 'Interactive SecondU product workspace')}>
    <div ref={stage} className="embedded-product-stage" style={{ minHeight: expanded ? stageHeight.current : undefined, backgroundImage: `url(${import.meta.env.BASE_URL}assets/pencil-garden.png)` }}>
      <div ref={workspace} className="embedded-product-window" role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? t('完整产品体验', 'Expanded product workspace') : undefined}>
        {expanded && <span className="embedded-product-focus-guard" tabIndex={0} onFocus={() => frame.current?.focus()} />}
        <div className="embedded-product-chrome"><span className="embedded-product-dots" aria-hidden="true"><i /><i /><i /></span><span>SecondU</span><span className="embedded-product-badge">{expanded ? <button type="button" ref={closeButton} className="embedded-product-close" onClick={() => setExpanded(false)} aria-label={t('收起产品体验', 'Close expanded workspace')}>{t('收起', 'Close')} <span aria-hidden="true">×</span></button> : t('虚构示例', 'Fictional example')}</span></div>
        <div className="embedded-product-viewport" ref={viewport} style={{ '--product-height': `${HEIGHT}px` } as React.CSSProperties}>
          {near && <iframe ref={frame} src={source} title={t('SecondU 完整工作区：导航、对话与可编辑成果', 'Full SecondU workspace: navigation, conversation and editable results')} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" loading="lazy" className="embedded-product-frame" width={WIDTH} height={HEIGHT} />}
          {!ready && <div className="embedded-product-loading" role="status">{t('正在打开产品示例…', 'Opening the product example…')}</div>}
        </div>
        {expanded && <span className="embedded-product-focus-guard" tabIndex={0} onFocus={() => closeButton.current?.focus()} />}
      </div>
    </div>
    <div className="embedded-product-caption"><div role="group" aria-label={t('切换产品示例页面', 'Choose a product example page')}>{[
      ['task/website-weekend', t('对话与成果', 'Chat and results')], ['self', t('数字分身', 'Digital twin')], ['agents', t('专家团队', 'Expert team')], ['artifacts', t('资料库', 'Library')],
    ].map(([id, label]) => <button type="button" key={id} disabled={!ready} aria-pressed={route === id} onClick={() => { setRoute(id); send(id); }}>{label}</button>)}<button type="button" ref={expandButton} className="embedded-product-expand" aria-haspopup="dialog" onClick={() => { stageHeight.current = stage.current?.getBoundingClientRect().height || 0; setExpanded(true); }}>{t('展开体验', 'Expand workspace')} <span aria-hidden="true">↗</span></button></div><p>{t('体验对话、数字分身与成果编辑。示例内容仅保存在当前页面。', 'Explore conversations, your digital twin and artifact editing. Fictional example content stays in this page only.')}</p></div>
  </section>;
}
