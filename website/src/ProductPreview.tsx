import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {useSiteTheme} from './site-theme';
import {openProductRoute,type ProductRoute} from './product-navigation';
import captureManifest from '../../docs/readme-assets/manifest.json';
import './product-preview.css';

const media=import.meta.glob<string>('../../docs/readme-assets/*.{jpg,png,mp4,webm}',{eager:true,query:'?url',import:'default'});
export type ProductPreviewKind='personal-context'|'decision-support'|'task-workspace'|'specialists';
function resource(kind:ProductPreviewKind,language:string,theme:string,extension:string){return media[`../../docs/readme-assets/${kind}-${language}${theme==='dark'?'-dark':''}.${extension}`];}
export function useProductPreview(kind:ProductPreviewKind){const {language}=useSiteLanguage();const {theme}=useSiteTheme();const stem=`${kind}-${language}${theme==='dark'?'-dark':''}`;const capture=captureManifest.assets.find(asset=>asset.file===`${stem}.jpg`||asset.file===`${stem}.png`);return {poster:resource(kind,language,theme,'jpg')??resource(kind,language,theme,'png'),video:resource(kind,language,theme,'mp4')??resource(kind,language,theme,'webm'),width:capture?.width,height:capture?.height};}

/** Captures of the canonical product. Every locale and theme has its own recording. */
export default function ProductPreview({kind,route,alt,action,className}:{kind:ProductPreviewKind;route:ProductRoute;alt:string;action:string;className:string}){
 const {t}=useSiteLanguage();
 const {poster,video,width,height}=useProductPreview(kind);
 const host=useRef<HTMLDivElement>(null),player=useRef<HTMLVideoElement>(null);
 const [visible,setVisible]=useState(false),[paused,setPaused]=useState(false),[hidden,setHidden]=useState(()=>document.hidden);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(query.matches);const visibility=()=>setHidden(document.hidden);query.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);return()=>{query.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(!host.current)return;const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.2)),{threshold:.2});observer.observe(host.current);return()=>observer.disconnect();},[poster,video]);
 useEffect(()=>{const element=player.current;if(!element)return;if(visible&&!hidden&&!paused&&!reduced)void element.play().catch(()=>setPaused(true));else element.pause();},[visible,hidden,paused,reduced,video]);
 if(!poster)return null;
 return <div ref={host} className={`${className} product-preview`}>
  <button className="product-preview-open" type="button" onClick={()=>openProductRoute(route)} aria-label={action}>
   {video&&!reduced?<video width={width} height={height} ref={player} src={video} poster={poster} muted loop playsInline preload="metadata" aria-label={alt}/>:<img width={width} height={height} src={poster} alt={alt} loading="lazy" decoding="async"/>}
   <span className="product-preview-enter">{t('进入体验','Explore the workspace')}</span>
  </button>
  {video&&!reduced&&<button className="product-preview-motion" type="button" onClick={()=>setPaused(value=>!value)} aria-label={paused?t('播放产品演示','Play product demonstration'):t('暂停产品演示','Pause product demonstration')} aria-pressed={paused}>{paused?<Play/>:<Pause/>}</button>}
 </div>;
}
