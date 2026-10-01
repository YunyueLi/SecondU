import {useCallback,useEffect,useRef,useState} from 'react';
import {Code,Nodes} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {useSiteTheme} from './site-theme';
import {connectArchifyCanvas,type ArchifyCanvasConnection} from './archify-canvas';
import './understanding-system.css';

export default function UnderstandingSystem(){
 const {language,t}=useSiteLanguage();
 const {theme}=useSiteTheme();
 const base=`${import.meta.env.BASE_URL}architecture`;
 const frame=useRef<HTMLIFrameElement>(null),surface=useRef<HTMLDivElement>(null);
 const connection=useRef<ArchifyCanvasConnection|null>(null);
 const preferences=useRef({theme,visible:false});preferences.current.theme=theme;
 const [mounted,setMounted]=useState(false),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[live,setLive]=useState(true),[reducedMotion,setReducedMotion]=useState(false);
 // Preserve the viewer (selection, pan and zoom) on theme changes. Locale selects
 // the corresponding checked artifact; diagram semantics are identical.
 const initialTheme=useRef(theme);
 const sync=useCallback(()=>{if(connection.current)setLive(connection.current.isLive());},[]);
 useEffect(()=>{
  const element=surface.current;if(!element)return;
  const observer=new IntersectionObserver(([entry])=>{
   preferences.current.visible=entry.isIntersecting;
   if(entry.isIntersecting)setMounted(true);
   connection.current?.setVisible(entry.isIntersecting);
  },{threshold:0.08});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReducedMotion(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{connection.current?.setTheme(theme);},[theme]);
 useEffect(()=>{setReady(false);setFailed(false);return()=>{connection.current?.dispose();connection.current=null;};},[language]);
 function loaded(){
  try{
   connection.current?.dispose();
   connection.current=connectArchifyCanvas(frame.current!,sync);
   connection.current.setTheme(preferences.current.theme);
   connection.current.setVisible(preferences.current.visible);
   sync();setReady(true);setFailed(false);
  }catch{setFailed(true);setReady(false);}
 }
 return <section className="site-section understanding-system" aria-labelledby="understanding-system-title">
  <div className="site-section-head"><h2 id="understanding-system-title">{t('看看 SecondU 如何理解并行动。','See how understanding becomes action.')}</h2><p>{t('点选节点，沿着流程查看个人上下文如何参与行动，以及一次纠正如何经确认后延续。','Explore each step: how personal context shapes an action, and how a correction carries forward after your confirmation.')}</p></div>
  <div className="understanding-system-toolbar">
   <a className="understanding-system-credit" href="https://github.com/tt-a1i/archify" target="_blank" rel="noopener noreferrer"><Nodes aria-hidden="true"/><span>Made with <strong>Archify</strong></span></a>
   <div className="understanding-system-controls" aria-label={t('交互流程控制','Interactive flow controls')}>
    <button type="button" disabled={!ready} onClick={()=>connection.current?.trace()}>{t('追踪反馈流程','Trace the feedback flow')}</button>
    <button type="button" disabled={!ready||reducedMotion} title={reducedMotion?t('已按系统设置关闭动效','Motion is disabled by your system preference'):undefined} aria-pressed={!live} onClick={()=>connection.current?.setMotion(!live)}>{live?t('暂停动效','Pause motion'):t('开启动效','Enable motion')}</button>
    <button type="button" className="understanding-system-zoom" disabled={!ready} aria-label={t('缩小流程图','Zoom out')} onClick={()=>connection.current?.zoomOut()}>−</button>
    <button type="button" className="understanding-system-zoom" disabled={!ready} aria-label={t('放大流程图','Zoom in')} onClick={()=>connection.current?.zoomIn()}>+</button>
    <button type="button" disabled={!ready} onClick={()=>connection.current?.reset()}>{t('查看全图','Fit diagram')}</button>
   </div>
  </div>
  <div ref={surface} className="understanding-system-figure" aria-busy={mounted&&!ready&&!failed}>
   {mounted&&<iframe ref={frame} key={language} src={`${base}/understanding-loop-${language}.html?present=1&theme=${initialTheme.current}`} title={t('个人理解与行动的交互流程图','Interactive personal understanding and action workflow')} onLoad={loaded} onError={()=>setFailed(true)} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/>}
   {!ready&&<div className="understanding-system-loading">{failed?<a href={`${base}/understanding-loop-${language}.html?theme=${theme}`} target="_blank" rel="noopener noreferrer">{t('打开交互流程图','Open the interactive workflow')}</a>:t('正在载入交互流程…','Loading the interactive flow…')}</div>}
  </div>
  <div className="understanding-system-links"><a href={`${base}/understanding-loop-${language}.html?theme=${theme}`} target="_blank" rel="noopener noreferrer">{t('独立打开流程','Open the flow separately')}</a><a href={`${base}/harness-${language}.html?theme=${theme}`} target="_blank" rel="noopener noreferrer"><Nodes/>{t('查看完整架构','Explore the full architecture')}</a><a href="#benchmark"><Code/>{t('查看上下文评测','Review the context benchmark')}</a></div>
 </section>;
}
