import {useEffect,useRef,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowRight,Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import {t} from '../i18n';
import type {HeroParticleScene} from '../shared/hero-particles';
import artwork from '../../public/art/twin-badge-v1.png';

export interface PortraitEvidence {sources:number;confirmed:number;processing:boolean;eventKey:string;formation?:number}
export function TwinPortrait({evidence,caption,progress,onProgressClick}:{evidence:PortraitEvidence;caption:string;progress?:'empty'|'connected'|'processing'|'review'|'confirmed';onProgressClick?:()=>void}) {
  const host=useRef<HTMLDivElement>(null),scene=useRef<HeroParticleScene|null>(null);
  const formation=evidence.formation??Math.min(.94,.2+Math.log1p(evidence.sources)*.12+Math.log1p(evidence.confirmed)*.1);
  const latest=useRef(formation);latest.current=formation;
  const [ready,setReady]=useState(false),[paused,setPaused]=useState(false);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pausePreference=useRef(paused||reduced);pausePreference.current=paused||reduced;
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{
    const controller=new AbortController();setReady(false);
    if(host.current)void import('../shared/hero-particles').then(module=>controller.signal.aborted||!host.current?null:module.createHeroParticles(host.current,artwork,{signal:controller.signal,paused:pausePreference.current,formation:latest.current,onReady:()=>{if(!controller.signal.aborted)setReady(true);},onError:()=>{if(!controller.signal.aborted)setReady(false);}})).then(value=>{if(controller.signal.aborted){value?.dispose();return;}scene.current=value;value?.setFormation(latest.current);value?.setPaused(pausePreference.current);}).catch(()=>{if(!controller.signal.aborted)setReady(false);});
    return()=>{controller.abort();scene.current?.dispose();scene.current=null;};
  },[]);
  useEffect(()=>{scene.current?.setFormation(formation);},[formation,evidence.eventKey]);
  useEffect(()=>{scene.current?.setPaused(paused||reduced);},[paused,reduced]);
  return <figure className="twin-portrait" data-ready={ready}>
    <div ref={host} className="twin-portrait-art hero-portrait-field" role="img" aria-label={t('奶油色与淡紫色的双侧脸，随保存的资料与已确认理解逐步形成。','Ivory and lavender profiles shaped by saved sources and confirmed understanding.')}>
      <img className="hero-portrait-fallback" src={artwork} alt="" aria-hidden="true" decoding="async"/>
    </div>
    <figcaption><span className={`twin-portrait-progress is-${progress||'connected'}`} role="status" aria-live="polite" aria-atomic="true">{progress==='processing'&&<i aria-hidden="true"/>}{onProgressClick?<button type="button" onClick={onProgressClick}>{caption}<ArrowRight/></button>:<span>{caption}</span>}</span>{!reduced&&<Button color="secondary" variant="ghost" uniform size="sm" aria-label={paused?t('恢复分身动效','Resume portrait motion'):t('暂停分身动效','Pause portrait motion')} onClick={()=>setPaused(value=>!value)}>{paused?<Play/>:<Pause/>}</Button>}</figcaption>
  </figure>;
}
