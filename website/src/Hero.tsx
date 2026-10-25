import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {ArrowRight, Pause, Play} from '@openai/apps-sdk-ui/components/Icon';
import type {HeroParticleScene} from './hero-particles';
import './hero-particles.css';
import {useSiteLanguage} from './site-language';
import {useSiteMotion} from './site-motion';
import {openProductRoute} from './product-navigation';
import particleArtwork from '../../public/art/twin-badge-v1.png';

export default function Hero(){
 const {t}=useSiteLanguage();
 const {paused,setPaused}=useSiteMotion();
 const host=useRef<HTMLDivElement>(null),scene=useRef<HeroParticleScene|null>(null);
 const pausePreference=useRef(paused);pausePreference.current=paused;
 const [ready,setReady]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const artwork=particleArtwork;
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{
  setReady(false);if(reduced||!host.current)return;
  const controller=new AbortController();
  void import('./hero-particles').then(module=>controller.signal.aborted||!host.current?null:module.createHeroParticles(host.current,artwork,{signal:controller.signal,paused:pausePreference.current,onReady:()=>{if(!controller.signal.aborted)setReady(true);},onError:()=>{if(!controller.signal.aborted)setReady(false);}})).then(value=>{if(controller.signal.aborted)value?.dispose();else{scene.current=value;value?.setPaused(pausePreference.current);}}).catch(()=>{if(!controller.signal.aborted)setReady(false);});
  return()=>{controller.abort();scene.current?.dispose();scene.current=null;};
 },[reduced,artwork]);
 useLayoutEffect(()=>{scene.current?.setPaused(paused);},[paused]);
 return <section className="site-hero site-hero-portrait" aria-labelledby="hero-title">
  <div className="site-hero-copy">
   <h1 id="hero-title">{t('你的数字分身。','Your digital twin.')}<br/><span>{t('从懂你，到为你行动。','From understanding to action.')}</span></h1>
   <p className="site-hero-position">{t('让经历、偏好与目标，成为每一次思考与行动的起点。陪你推敲重要选择，也和你一起把想法变成可以继续的工作。','Your experiences, preferences and goals, carried into the things you do. Think through important choices and turn ideas into work you can build on.')}</p>
   <div className="site-hero-actions"><button type="button" className="site-pill is-primary" onClick={event=>openProductRoute('assistant',event.currentTarget)}>{t('体验 SecondU','Try SecondU')}<ArrowRight aria-hidden="true"/></button><a className="site-pill" href="https://github.com/YunyueLi/SecondU/releases/latest">{t('下载桌面版','Download for desktop')}</a></div>
  </div>
  <div className="site-hero-object"><div className="hero-portrait-separation" aria-hidden="true"/><div ref={host} className="hero-canvas hero-portrait-field" data-ready={ready} data-motion={reduced?'reduced':paused?'paused':'playing'}><img className="hero-fallback hero-portrait-fallback" src={artwork} alt={t('奶油色与淡紫色的两个油画侧脸，彼此相伴','Two painted profiles in ivory and pale lavender, side by side')} decoding="async" fetchPriority="high"/></div>{!reduced&&<button type="button" className="hero-art-motion" onClick={()=>setPaused(value=>!value)} aria-label={paused?t('恢复首页动效','Resume hero motion'):t('暂停首页动效','Pause hero motion')}>{paused?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}</button>}</div>
 </section>;
}
