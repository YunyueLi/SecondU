import { useEffect, useRef, useState } from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import type {HeroParticleScene} from './hero-particles';
import './hero-particles.css';
import {useSiteLanguage} from './site-language';

export default function Hero(){
 const {t}=useSiteLanguage();
 const host=useRef<HTMLDivElement>(null),scene=useRef<HeroParticleScene|null>(null);
 const [ready,setReady]=useState(false),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const latest=useRef(paused);latest.current=paused;
 const artwork=`${import.meta.env.BASE_URL}art/twin-badge-v1.png`;
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{scene.current?.setPaused(paused);},[paused]);
 useEffect(()=>{
  setReady(false);if(reduced||!host.current)return;
  const controller=new AbortController();
  void import('./hero-particles').then(module=>module.createHeroParticles(host.current!,artwork,{signal:controller.signal,onReady:()=>setReady(true),onError:()=>setReady(false)})).then(value=>{if(controller.signal.aborted)value?.dispose();else{scene.current=value;value?.setPaused(latest.current);}}).catch(()=>{if(!controller.signal.aborted)setReady(false);});
  return()=>{controller.abort();scene.current?.dispose();scene.current=null;};
 },[reduced,artwork]);
 return <section className="site-hero site-hero-portrait" aria-labelledby="hero-title"><div className="site-hero-copy"><h1 id="hero-title">{t('让 AI 成为','An AI that becomes')}<br/>{t('另一个你。','a second you.')}</h1><p className="site-hero-position">{t('SecondU 是以个人数字分身为核心的智能体产品。','SecondU is an agent product built around your personal digital twin.')}</p><p className="site-hero-description">{t('它持续理解一个人的背景、经历、偏好、目标、关系与现实处境，在不同任务、应用和设备之间延续这些理解，主动帮助用户处理工作与生活中的事务，并支持协作、社交和专业服务。','It continually learns about your background, experiences, preferences, goals, relationships and real circumstances. It carries that understanding across tasks, applications and devices, proactively helping with work and everyday life while supporting collaboration, social connections and professional services.')}</p><p className="site-hero-description site-hero-secondary">{t('专业智能体、工具与执行环境根据具体需要，在用户授权范围内参与。','Specialist agents, tools and execution environments take part as needed, within the scope you authorize.')}</p><div className="site-hero-actions"><a className="site-pill is-primary" href="#experience">{t('体验产品','Try SecondU')} <span aria-hidden="true">↗</span></a><a className="site-pill" href="#open">{t('下载桌面版','Download for desktop')} <span aria-hidden="true">↓</span></a></div><p className="site-hero-footnote">{t('开源开发中，个人资料由你掌握。','Open source and in active development. Your personal data stays yours.')}</p></div><div className="site-hero-object"><div ref={host} className="hero-canvas hero-portrait-field" data-ready={ready} data-motion={reduced?'reduced':paused?'paused':'playing'}><img className="hero-fallback hero-portrait-fallback" src={artwork} alt={t('奶油色与淡紫色的两个油画侧脸，彼此相伴','Two painted profiles in ivory and pale lavender, side by side')} decoding="async" fetchPriority="high"/></div>{ready&&!reduced&&<Button uniform size="md" pill color="secondary" variant="ghost" className="hero-pause-button" onClick={()=>setPaused(value=>!value)} aria-pressed={paused} aria-label={paused?t('播放动态','Play animation'):t('暂停动态','Pause animation')} title={paused?t('播放动态','Play animation'):t('暂停动态','Pause animation')}>{paused?<Play/>:<Pause/>}</Button>}</div></section>;
}
