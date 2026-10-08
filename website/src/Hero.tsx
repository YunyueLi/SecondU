import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {Pause, Play} from '@openai/apps-sdk-ui/components/Icon';
import type {HeroParticleScene} from './hero-particles';
import './hero-particles.css';
import {useSiteLanguage} from './site-language';
import {useSiteTheme} from './site-theme';
import {useSiteMotion} from './site-motion';
import {productExampleUrl} from './product-navigation';
import particleArtwork from '../../public/art/twin-badge-v1.png';

export default function Hero(){
 const {language,t}=useSiteLanguage();
 const {theme}=useSiteTheme();
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
 return <section className="site-hero site-hero-portrait" aria-labelledby="hero-title"><div className="site-hero-copy"><h1 id="hero-title">{t('你的数字分身。','Your digital twin.')}<br/><span>{t('从懂你，到为你行动。','From understanding to action.')}</span></h1><p className="site-hero-position"><strong>{t('SecondU 持续理解你的背景、经历、偏好、关系和目标，','SecondU learns your background, experiences, preferences, relationships and goals, ')}</strong>{t('在不同任务、场景和设备之间延续这些理解。','and carries that understanding across tasks, situations and devices.')}</p><p className="site-hero-description">{t('结合前沿模型的推理能力，为人生的重要选择提供更懂你的参考，陪你比较方案、推敲取舍；也能组织信息，调度专家与工具，推进想法与事务。','Advanced reasoning, grounded in who you are. Explore life’s important choices and think through trade-offs, with the decision in your hands. Bring together context, experts and tools to move forward.')}</p><div className="site-hero-actions"><a className="site-pill is-primary" href={productExampleUrl(language,theme)} target="_blank" rel="noopener noreferrer">{t('体验 SecondU','Try SecondU')}</a><a className="site-pill" href="#open">{t('下载桌面版','Download for desktop')}</a></div>{!reduced&&<div className="hero-motion-controls"><button type="button" className="hero-motion-toggle" onClick={()=>setPaused(value=>!value)} aria-label={paused?t('恢复首页动效','Resume hero motion'):t('暂停首页动效','Pause hero motion')}>{paused?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}<span>{paused?t('恢复动效','Resume motion'):t('暂停动效','Pause motion')}</span></button></div>}</div><div className="site-hero-object"><div ref={host} className="hero-canvas hero-portrait-field" data-ready={ready} data-motion={reduced?'reduced':paused?'paused':'playing'}><img className="hero-fallback hero-portrait-fallback" src={artwork} alt={t('奶油色与淡紫色的两个油画侧脸，彼此相伴','Two painted profiles in ivory and pale lavender, side by side')} decoding="async" fetchPriority="high"/></div></div></section>;
}
