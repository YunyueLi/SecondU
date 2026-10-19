import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {useSiteTheme} from './site-theme';
import {mobileExampleUrl,openProductRoute} from './product-navigation';
import './twin-building-story.css';

/** A live view of the public product build; the presentation changes only the gallery selection. */
function TwinBuildingPreview(){
 const {language,t}=useSiteLanguage(),{theme,preference}=useSiteTheme();
 const host=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
 const [near,setNear]=useState(false),[visible,setVisible]=useState(false),[ready,setReady]=useState(false),[paused,setPaused]=useState(false),[hidden,setHidden]=useState(()=>document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [attempt,setAttempt]=useState(0),[slow,setSlow]=useState(false);
 const [source]=useState(()=>`${import.meta.env.BASE_URL}product/embed.html?space=${language==='zh'?'demo-cn-v1':'demo-us-v1'}&lang=${language}&theme=${theme}&presentation=building#building`);
 const current=useRef({language,theme,preference});current.current={language,theme,preference};
 const playing=ready&&visible&&!hidden&&!paused&&!reduced;
 const send=(initialise=false)=>frame.current?.contentWindow?.postMessage({type:'secondu-website-example',language:current.current.language,theme:current.current.theme,themePreference:current.current.preference,expanded:false,...(initialise?{route:'building',requestReady:true}:{})},location.origin);
 useEffect(()=>{
  const query=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(query.matches),visibility=()=>setHidden(document.hidden);
  query.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.2)),{threshold:.2});
  const lazy=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);lazy.disconnect();}},{rootMargin:'500px'});
  if(host.current){observer.observe(host.current);lazy.observe(host.current);}
  const fit=()=>viewport.current?.style.setProperty('--twin-preview-scale',String((viewport.current?.clientWidth||1160)/1160));fit();const resize=new ResizeObserver(fit);if(viewport.current)resize.observe(viewport.current);
  return()=>{observer.disconnect();lazy.disconnect();resize.disconnect();query.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{if(event.origin===location.origin&&event.source===frame.current?.contentWindow&&event.data?.type==='secondu-example-ready'){setReady(true);send();}};
  addEventListener('message',receive);return()=>removeEventListener('message',receive);
 },[]);
 useEffect(()=>{if(ready)send();},[language,theme,preference,ready]);
 useEffect(()=>{if(!near||ready)return;const timer=setTimeout(()=>setSlow(true),20000);return()=>clearTimeout(timer);},[near,ready,attempt]);
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'secondu-building-preview',playing},location.origin);},[playing,language]);
 return <div ref={host} className="cap-story-visual twin-building-visual" data-load-state={ready?'ready':slow?'slow':'loading'} data-demonstration={playing?'playing':'paused'}>
  <div ref={viewport} className="twin-building-preview-viewport">
   {near&&<iframe key={attempt} ref={frame} src={source} title={t('分身建设真实界面演示','Live twin-building interface demonstration')} tabIndex={-1} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-forms" loading="eager" onLoad={()=>send(true)}/>}
   {!ready&&<div className="twin-building-preview-loading" role="status">{slow?t('演示仍在载入，可点击进入完整体验。','The preview is still loading. Open the full workspace to explore.'):t('正在打开分身建设……','Opening twin building…')}</div>}
  </div>
  <button type="button" className="twin-building-preview-open" onClick={event=>openProductRoute('building',event.currentTarget)} aria-label={t('打开分身建设，探索七类材料入口','Open twin building and explore seven ways to bring material')}><span className="product-preview-enter">{t('进入体验','Explore the workspace')}</span></button>
  {ready&&!reduced&&<button type="button" className="product-preview-motion" onClick={()=>setPaused(value=>!value)} aria-label={paused?t('播放分身建设演示','Play twin-building demonstration'):t('暂停分身建设演示','Pause twin-building demonstration')} aria-pressed={paused}>{paused?<Play/>:<Pause/>}</button>}
  {!ready&&slow&&<button className="twin-building-preview-retry" type="button" onClick={()=>{setSlow(false);setAttempt(value=>value+1);}}>{t('重新载入','Reload')}</button>}
 </div>;
}

export default function TwinBuildingStory(){
 const {language,t}=useSiteLanguage();
 return <article className="cap-story twin-building-story" aria-labelledby="twin-building-title">
  <div className="cap-story-intro"><h2 id="twin-building-title">{t('从一段经历，\n慢慢成为你。','A little of your life.\nA little more you.')}</h2><p>{t('一段笔记、一次聊天，或一张照片，都可以成为了解你的起点。把已有材料带给 SecondU，看着分身逐渐形成；每条新的理解，先由你确认、补充和纠正，再参与之后的判断与行动。','A note, a conversation or a photo can be a starting point. Bring your existing materials to SecondU and watch your twin take shape. Review, add to and correct each new understanding before it informs future decisions and actions.')}</p><button className="cap-story-action" onClick={event=>openProductRoute('building',event.currentTarget)}>{t('开始建设分身','Start building your twin')}</button><div className="cap-story-links"><button onClick={event=>openProductRoute('building',event.currentTarget)}>{t('探索七类材料入口','Explore seven source types')}</button><a href={mobileExampleUrl(language).replace('#new','#building')} target="_blank" rel="noreferrer">{t('在手机界面中查看','Explore the mobile interface')}</a></div></div>
  <TwinBuildingPreview/>
 </article>;
}
