import {Button} from '@openai/apps-sdk-ui/components/Button';
import {HitherMark} from './HitherMark';
import {HitherWordmark} from './HitherWordmark';
import {useState,type CSSProperties} from 'react';
import {getLocale} from './i18n';
import type {Appearance} from './appearance';
import {spaceStorageKey} from './space';
import '../shared/startup.css';
export function cachedStartupAppearance():Partial<Appearance>{
 try { const search=new URLSearchParams(location.search).has('space')?location.search:'?space=personal';return JSON.parse(localStorage.getItem(spaceStorageKey('hither.appearance.v2',search))||'{}'); } catch {return {};}
}
export interface StartupScreenProps {state?:'loading'|'error';message?:string;error?:string;retrying?:boolean;onRetry?:()=>void;contained?:boolean;desktop?:boolean;appearance?:Partial<Appearance>;phase?:'bootstrap'|'example-space'|'personal-space'}
/** The same state surface is used before workspace selection, during bootstrap and in the catalogue. */
export function StartupScreen({state='loading',message,error,retrying=false,onRetry,contained=false,desktop=false,appearance,phase}:StartupScreenProps){
 const [cached]=useState(cachedStartupAppearance),chosen=appearance||cached;
 const theme=['light','dark'].includes(chosen.theme||'')?chosen.theme:'system',fontSize=Math.max(12,Math.min(18,Number(chosen.fontSize)||14));
 const artwork='/art/paper-rhythm.png';
 const en=(chosen.language||getLocale())==='en',t=(zh:string,enText:string)=>en?enText:zh;
 const style={'--startup-font-size':`${fontSize}px`} as CSSProperties;
 const Container=contained?'section':'main',failed=state==='error'&&!retrying;
 return <Container className={`startup-screen ${failed?'is-error':'is-loading'} ${retrying?'is-retrying':''}`} data-startup-phase={phase} data-contained={contained||undefined} data-theme={theme} data-accent={chosen.accent||'blue'} data-motion={chosen.motion||'system'} style={style} aria-busy={!failed} aria-label={t('启动 SecondU','Starting SecondU')}>
  {desktop&&<div className="startup-drag-region" aria-hidden="true"/>}
  <div className="startup-content"><div className="startup-illustration" aria-hidden="true"><img src={artwork} alt="" width="190" height="190" fetchPriority="high" onError={event=>{event.currentTarget.src='/art/paper-rhythm.png';}}/><span className="startup-seal"><HitherMark/></span></div>
   <div className="startup-brand"><HitherWordmark className="startup-wordmark"/></div>
   <p className="startup-status" role={failed?'alert':'status'}>{!failed&&<span className="startup-dots" aria-hidden="true"><i/><i/><i/></span>}<span>{retrying?t('正在重新连接','Reconnecting'):message||(failed?t('暂时无法打开空间','Could not open your workspace'):t('正在打开你的空间','Opening your workspace'))}</span></p>
   {state==='error'&&onRetry&&<div className="startup-actions"><Button className="startup-retry" color="primary" size="sm" loading={retrying} disabled={retrying} onClick={onRetry}>{t('重新尝试','Try again')}</Button></div>}
   {state==='error'&&error&&<details className="startup-error-details"><summary>{t('查看原因','View details')}</summary><p>{error}</p></details>}
  </div>
 </Container>;
}
