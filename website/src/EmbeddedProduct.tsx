import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSiteLanguage } from './site-language';
import { useSiteTheme } from './site-theme';
import './embedded-product.css';
import {isProductRoute,productNavigationEvent,type ProductRoute} from './product-navigation';
import {Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import {StartupScreen} from '../../src/StartupScreen';

const WIDTH = 1440, HEIGHT = 900;
const demonstrationRoutes:ProductRoute[]=['example-chat','self','finance','agents','artifacts'];
export default function EmbeddedProduct() {
  const { language, setLanguage, t } = useSiteLanguage();
  const { preference, theme, setPreference } = useSiteTheme();
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const readingPosition = useRef({left:0,top:0});
  const stageHeight = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const readyState = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [slow, setSlow] = useState(false);
  const loadStarted = useRef(0);
  const [readyMs, setReadyMs] = useState<number>();
  const [attempt, setAttempt] = useState(0);
  const [route, setRoute] = useState<ProductRoute>('example-chat');
  const [inView,setInView]=useState(false),[scrolled,setScrolled]=useState(false),[paused,setPaused]=useState(false);
  const [hidden,setHidden]=useState(()=>document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Theme/language updates use a message, preserving the frame and its drafts.
  const [source] = useState(() => `${import.meta.env.BASE_URL}product/embed.html?space=${language==='zh'?'demo-cn-v1':'demo-us-v1'}&lang=${language}&theme=${theme}#example-chat`);
  const state = useRef({ language, theme, preference, expanded, route }); state.current = { language, theme, preference, expanded, route };
  const send = (next?: string, requestReady=false) => frame.current?.contentWindow?.postMessage({ type: 'secondu-website-example', language:state.current.language,theme:state.current.theme,themePreference:state.current.preference,expanded:state.current.expanded,requestReady,...(next ? { route: next } : {}) }, location.origin);
  const expandWorkspace = (trigger?: HTMLElement) => {
    if(!state.current.expanded){
      opener.current=trigger??(document.activeElement instanceof HTMLElement?document.activeElement:null);
      readingPosition.current={left:window.scrollX,top:window.scrollY};
      // Finish any in-flight smooth section scroll before locking the page.
      window.scrollTo({...readingPosition.current,behavior:'instant'});
      stageHeight.current=stage.current?.getBoundingClientRect().height||0;
    }
    // Keep the mounted frame and pause its scroll bridge before React commits.
    state.current.expanded=true;
    setPaused(true);setNear(true);setExpanded(true);
  };
  const retry = () => {readyState.current=false;setReady(false);setLoadError(false);setSlow(false);setReadyMs(undefined);setNear(true);setAttempt(value=>value+1);};
  const playing=ready&&scrolled&&inView&&!paused&&!expanded&&!hidden&&!reduced;
  useEffect(()=>{
    const initialY=window.scrollY;
    const onScroll=()=>{if(window.scrollY>initialY+12)setScrolled(true);};
    const onVisibility=()=>setHidden(document.hidden);
    const query=matchMedia('(prefers-reduced-motion: reduce)'),onMotion=()=>setReduced(query.matches);
    addEventListener('scroll',onScroll,{passive:true});document.addEventListener('visibilitychange',onVisibility);query.addEventListener('change',onMotion);
    const observer=new IntersectionObserver(entries=>setInView(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.35)),{threshold:[0,.35]});
    if(viewport.current)observer.observe(viewport.current);
    return()=>{removeEventListener('scroll',onScroll);document.removeEventListener('visibilitychange',onVisibility);query.removeEventListener('change',onMotion);observer.disconnect();};
  },[]);
  useEffect(()=>{
    if(!playing)return;
    const timer=window.setTimeout(()=>{const next=demonstrationRoutes[(demonstrationRoutes.indexOf(state.current.route)+1)%demonstrationRoutes.length];setRoute(next);state.current.route=next;send(next);},6000);
    return()=>clearTimeout(timer);
  },[playing,route]);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const fit = () => {if(!state.current.expanded)element.style.setProperty('--product-scale', String(element.clientWidth / WIDTH));};
    fit(); const resize = new ResizeObserver(fit); resize.observe(element);
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: '500px' });
    observer.observe(element);
    return () => { resize.disconnect(); observer.disconnect(); };
  }, []);
  useEffect(() => { if (ready) send(); }, [language, theme, preference, ready, expanded]);
  useEffect(() => {
    if(!near||ready)return;
    loadStarted.current=performance.now();
    // Elapsed time is not a failed request: the browser may still be downloading
    // the workspace. Keep that attempt alive and allow a manual retry.
    const timer=window.setTimeout(()=>setSlow(true),20000);
    return()=>clearTimeout(timer);
  },[near,ready,attempt]);
  useEffect(() => {
    const navigate = (event:Event) => {
      const navigation=(event as CustomEvent).detail;
      const next=navigation?.route;
      if(!isProductRoute(next))return;
      setRoute(next);state.current.route=next;
      expandWorkspace(navigation?.trigger instanceof HTMLElement?navigation.trigger:undefined);
      if(ready)send(next);
    };
    addEventListener(productNavigationEvent,navigate);addEventListener('secondu:explore',navigate);
    return()=>{removeEventListener(productNavigationEvent,navigate);removeEventListener('secondu:explore',navigate);};
  },[ready]);
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
    const root=document.documentElement,body=document.body;
    const previous={rootOverflow:root.style.overflow,rootOverscroll:root.style.overscrollBehavior,bodyOverflow:body.style.overflow,bodyPadding:body.style.paddingRight,bodyPosition:body.style.position,bodyTop:body.style.top,bodyLeft:body.style.left,bodyWidth:body.style.width};
    const scrollbarWidth=window.innerWidth-root.clientWidth;
    if(scrollbarWidth>0)body.style.paddingRight=`${parseFloat(getComputedStyle(body).paddingRight)+scrollbarWidth}px`;
    root.style.overflow='hidden';root.style.overscrollBehavior='none';body.style.overflow='hidden';
    body.style.position='fixed';body.style.top=`-${readingPosition.current.top}px`;body.style.left=`-${readingPosition.current.left}px`;body.style.width='100%';
    closeButton.current?.focus({preventScroll:true});
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setExpanded(false); }
    };
    addEventListener('keydown', escape);
    return () => {
      removeEventListener('keydown', escape);
      for (const item of muted) item.element.inert = item.inert;
      root.style.overflow=previous.rootOverflow;root.style.overscrollBehavior=previous.rootOverscroll;
      body.style.overflow=previous.bodyOverflow;body.style.paddingRight=previous.bodyPadding;
      body.style.position=previous.bodyPosition;body.style.top=previous.bodyTop;body.style.left=previous.bodyLeft;body.style.width=previous.bodyWidth;
      if(viewport.current)viewport.current.style.setProperty('--product-scale',String(viewport.current.clientWidth/WIDTH));
      const returnTo=opener.current?.isConnected?opener.current:expandButton.current;
      returnTo?.focus({ preventScroll: true });
      window.scrollTo({...readingPosition.current,behavior:'instant'});
      opener.current=null;
    };
  }, [expanded]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'secondu-example-ready'&&!readyState.current) { readyState.current=true;setReady(true);setLoadError(false);setSlow(false);setReadyMs(Math.round(performance.now()-loadStarted.current));send(state.current.route); }
      if (event.data?.type === 'secondu-example-collapse') setExpanded(false);
      if (event.data?.type === 'secondu-example-interaction') setPaused(true);
      if (event.data?.type === 'secondu-example-preferences') {
        const { theme: nextTheme, language: nextLanguage } = event.data;
        if (nextTheme === 'light' || nextTheme === 'dark' || nextTheme === 'system') setPreference(nextTheme);
        if (nextLanguage === 'zh' || nextLanguage === 'en') setLanguage(nextLanguage);
      }
      if (!state.current.expanded && event.data?.type === 'secondu-example-scroll' && Number.isFinite(event.data.deltaY)) window.scrollBy({ top: Math.max(-1000, Math.min(1000, event.data.deltaY)), behavior: 'auto' });
    };
    addEventListener('message', receive); return () => removeEventListener('message', receive);
  }, []);
  return <section id="product-window" data-ready={ready} data-ready-ms={readyMs} data-load-state={ready?'ready':loadError?'error':slow?'slow':'loading'} data-demonstration={playing?'playing':'paused'} data-route={route} className={`embedded-product${expanded ? ' is-expanded' : ''}`} aria-label={t('可操作的 SecondU 产品界面', 'Interactive SecondU product workspace')}>
    <div ref={stage} className="embedded-product-stage" style={{ minHeight: expanded ? stageHeight.current : undefined, backgroundImage: `url(${import.meta.env.BASE_URL}assets/pencil-garden.png)` }}>
      <div ref={workspace} className="embedded-product-window" tabIndex={-1} role={expanded ? 'dialog' : 'region'} aria-modal={expanded || undefined} aria-label={expanded ? t('完整产品体验', 'Expanded product workspace') : t('可操作的产品示例', 'Interactive product example')}>
        {expanded && <span className="embedded-product-focus-guard" tabIndex={0} onFocus={() => frame.current?.focus()} />}
        <div className="embedded-product-chrome"><span className="embedded-product-dots" aria-hidden="true"><i /><i /><i /></span><span>SecondU</span><span className="embedded-product-badge">{expanded ? <button type="button" ref={closeButton} className="embedded-product-close" onClick={() => setExpanded(false)} aria-label={t('收起产品体验', 'Close expanded workspace')}>{t('收起', 'Close')} <span aria-hidden="true">×</span></button> : t('虚构示例', 'Fictional example')}</span></div>
        <div className="embedded-product-viewport" ref={viewport} style={{ '--product-height': `${HEIGHT}px` } as React.CSSProperties}>
          {/* Forms dispatch their local submit handlers; the embed CSP blocks native form destinations. */}
          {near && <iframe key={attempt} ref={frame} src={source} title={t('SecondU 完整工作区：导航、对话与可编辑成果', 'Full SecondU workspace: navigation, conversation and editable results')} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-forms" loading="eager" onLoad={()=>send(state.current.route,true)} onError={()=>setLoadError(true)} className="embedded-product-frame" width={WIDTH} height={HEIGHT} />}
          {!ready && <div className={`embedded-product-loading${loadError?' is-error':''}${slow?' is-slow':''}`}><StartupScreen contained state={loadError?'error':'loading'} message={slow&&!loadError?t('示例仍在加载，请稍候','The example is still loading. Please wait.'):undefined} error={loadError?t('未能载入示例页面，请重新尝试。','The example page could not be loaded. Please try again.'):undefined} onRetry={retry} appearance={{theme,language:language==='zh'?'zh-CN':'en',motion:reduced?'reduced':'system',fontSize:14}}/>{slow&&!loadError&&<button type="button" className="embedded-product-slow-retry" onClick={retry}>{t('重新加载','Reload example')}</button>}</div>}
        </div>
        {expanded && <span className="embedded-product-focus-guard" tabIndex={0} onFocus={() => closeButton.current?.focus()} />}
      </div>
    </div>
    <div className="embedded-product-caption"><div role="group" aria-label={t('切换产品示例页面', 'Choose a product example page')}>{[
      ['example-chat', t('对话与成果', 'Chat and results')], ['self', t('数字分身', 'Digital twin')], ['finance', t('财务', 'Finance')], ['agents', t('专家团队', 'Expert team')], ['artifacts', t('资料库', 'Library')],
    ].map(([id, label]) => <button type="button" key={id} disabled={!ready} aria-pressed={route === id} onClick={() => { if(isProductRoute(id)){setPaused(true);setRoute(id);state.current.route=id;send(id);} }}>{label}</button>)}{!reduced&&<button type="button" className="embedded-product-motion" disabled={!ready} aria-label={playing?t('暂停自动演示','Pause automatic demonstration'):t('播放自动演示','Play automatic demonstration')} onClick={()=>{setPaused(playing);setScrolled(true);}}>{playing?<Pause/>:<Play/>}</button>}<button type="button" ref={expandButton} className="embedded-product-expand" aria-haspopup="dialog" onClick={event=>expandWorkspace(event.currentTarget)}>{t('展开体验', 'Expand workspace')}</button></div><p>{t('体验对话、数字分身、财务与成果编辑。虚构内容仅保存在当前页面。', 'Explore conversations, your digital twin, finances and artifact editing. Fictional content stays in this page only.')}</p></div>
  </section>;
}
