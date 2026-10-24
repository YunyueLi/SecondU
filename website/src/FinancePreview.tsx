import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {useSiteTheme} from './site-theme';
import {openProductRoute} from './product-navigation';
import {financePreviewViews as views,type FinancePreviewView} from './embed/finance-presentation';
import './finance-story.css';

const WIDTH=1160,HEIGHT=850;

/** The real website product, with its native Finance views selected for this preview. */
export default function FinancePreview(){
 const {language,t}=useSiteLanguage(),{theme,preference}=useSiteTheme();
 const host=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
 const [near,setNear]=useState(false),[visible,setVisible]=useState(false),[ready,setReady]=useState(false);
 const [view,setView]=useState<FinancePreviewView>('overview'),[settledView,setSettledView]=useState<FinancePreviewView|null>(null),[paused,setPaused]=useState(false);
 const [hidden,setHidden]=useState(()=>document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [attempt,setAttempt]=useState(0),[slow,setSlow]=useState(false);
 const [source]=useState(()=>`${import.meta.env.BASE_URL}product/embed.html?space=${language==='zh'?'demo-cn-v1':'demo-us-v1'}&lang=${language}&theme=${theme}&presentation=finance#finance`);
 const current=useRef({language,theme,preference,view});current.current={language,theme,preference,view};
 const playing=ready&&settledView===view&&visible&&!hidden&&!paused&&!reduced;
 const send=(initialise=false)=>{
  const target=frame.current?.contentWindow;if(!target)return;
  target.postMessage({type:'secondu-website-example',language:current.current.language,theme:current.current.theme,themePreference:current.current.preference,expanded:false,...(initialise?{route:'finance',requestReady:true}:{})},location.origin);
  target.postMessage({type:'secondu-finance-preview',view:current.current.view},location.origin);
 };
 useEffect(()=>{
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(motionQuery.matches),visibility=()=>setHidden(document.hidden);
  motionQuery.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.2)),{threshold:.2});
  const lazy=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);lazy.disconnect();}},{rootMargin:'500px'});
  if(host.current){observer.observe(host.current);lazy.observe(host.current);}
  const fit=()=>viewport.current?.style.setProperty('--finance-preview-scale',String((viewport.current?.clientWidth||WIDTH)/WIDTH));
  fit();const resize=new ResizeObserver(fit);if(viewport.current)resize.observe(viewport.current);
  return()=>{observer.disconnect();lazy.disconnect();resize.disconnect();motionQuery.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
   if(event.data?.type==='secondu-example-ready')send();
   if(event.data?.type==='secondu-finance-preview-ready'&&event.data.view===current.current.view){setReady(true);setSettledView(event.data.view);setSlow(false);}
  };
  addEventListener('message',receive);return()=>removeEventListener('message',receive);
 },[]);
 useEffect(()=>{if(near)send();},[language,theme,preference,view,near]);
 useEffect(()=>{if(!near||ready)return;const timer=setTimeout(()=>setSlow(true),20000);return()=>clearTimeout(timer);},[near,ready,attempt]);
 useEffect(()=>{
  if(!playing)return;
  const timer=setTimeout(()=>setView(value=>views[(views.indexOf(value)+1)%views.length]),6200);
  return()=>clearTimeout(timer);
 },[playing,view]);
 const labels={overview:t('概览','Overview'),portfolio:t('投资','Portfolio'),structure:t('结构','Structure'),allocation:t('占比','Allocation'),details:t('明细','Details'),holdings:t('持仓','Holdings')};
 return <div ref={host} className="cap-story-visual finance-story-visual" data-load-state={ready?'ready':slow?'slow':'loading'} data-demonstration={playing?'playing':'paused'} data-view={view}>
  <div ref={viewport} className="finance-preview-viewport">
   {near&&<iframe key={attempt} ref={frame} src={source} title={t('SecondU 真实资产管理界面，使用虚构示例','The real SecondU asset-management interface with fictional examples')} width={WIDTH} height={HEIGHT} tabIndex={-1} aria-hidden="true" sandbox="allow-scripts allow-same-origin" loading="eager" onLoad={()=>send(true)}/>}
   {!ready&&<div className="finance-preview-loading" role="status">{slow?t('示例仍在载入，可进入完整工作区查看。','The preview is still loading. Open the full workspace to explore.'):t('正在打开财务概览……','Opening the finance overview…')}</div>}
   <button type="button" className="finance-preview-open" onClick={event=>openProductRoute(view==='holdings'?'finance/holdings':'finance',event.currentTarget)} aria-label={t('打开完整资产管理工作区','Open the full asset-management workspace')}><span className="product-preview-enter">{t('进入体验','Explore the workspace')}</span></button>
  </div>
  <div className="finance-preview-caption">
   <div className="finance-preview-views" role="group" aria-label={t('切换资产管理展示','Choose an asset-management view')}>{views.map(item=><button type="button" key={item} disabled={!ready} aria-pressed={view===item} onClick={()=>{setPaused(true);setView(item);}}>{labels[item]}</button>)}</div>
   {ready&&!reduced&&<button type="button" className="finance-preview-motion" aria-label={paused?t('播放资产管理演示','Play asset-management demonstration'):t('暂停资产管理演示','Pause asset-management demonstration')} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play/>:<Pause/>}</button>}
   {!ready&&slow&&<button className="finance-preview-retry" type="button" onClick={()=>{setReady(false);setSettledView(null);setSlow(false);setAttempt(value=>value+1);}}>{t('重新载入','Reload')}</button>}
  </div>
 </div>;
}
