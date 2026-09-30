import { spaceStorageKey } from './space';
import { useEffect, useRef, useState } from 'react';
import { api, write, messageOf } from './api';
import { getLocale, setLocale, subscribeLocale, type Locale } from './i18n';
import { appearanceAfterPatch, reconcileAppearanceLoad } from './appearanceState';
export type Appearance = { theme:'light'|'dark'|'system'; atmosphere: 'plain'|'pencil'|'tidal'|'night'|'custom'; accent: 'graphite'|'blue'|'violet'|'green'; opacity: number; fontSize: number; motion: 'system'|'reduced'; sendKey: 'enter'|'modifier'; language:Locale };
export const defaultAppearance: Appearance = { theme:'system', atmosphere:'plain', accent:'blue', opacity:96, fontSize:14, motion:'system', sendKey:'enter', language:'zh-CN' };
export type AppearanceStatus = {saving:boolean;error:string};
const key=spaceStorageKey('hither.appearance.v2');
function read(): Appearance {
  try {const saved=JSON.parse(localStorage.getItem(key)||'{}');const theme=saved.theme||localStorage.getItem('hither.theme');return {
    theme:['light','dark'].includes(theme)?theme:'system',
    atmosphere:['plain','pencil','tidal','night','custom'].includes(saved.atmosphere)?saved.atmosphere:'plain',
    accent:['graphite','blue','violet','green'].includes(saved.accent)?saved.accent:'blue',
    opacity:Math.max(70,Math.min(100,Number(saved.opacity)||96)),fontSize:Math.max(12,Math.min(18,Number(saved.fontSize)||14)),
    motion:saved.motion==='reduced'?'reduced':'system',sendKey:saved.sendKey==='modifier'?'modifier':'enter',
    language:getLocale(),
  };}catch{return {...defaultAppearance,language:getLocale()};}
}
export function useAppearance() {
  const [appearance,setAppearance]=useState<Appearance>(read);const current=useRef(appearance);const changed=useRef<Partial<Appearance>>({});
  const localeChanged=useRef(false);
  const [status,setStatus]=useState<AppearanceStatus>({saving:false,error:''});const ready=useRef(false);const queue=useRef(Promise.resolve());const revision=useRef(0);
  function persist(value:Partial<Appearance>) {const version=++revision.current;setStatus({saving:true,error:''});queue.current=queue.current.catch(()=>{}).then(async()=>{try{const patch={...value};if(patch.language&&patch.language!==getLocale())delete patch.language;if(Object.keys(patch).length)await write('/settings/appearance',patch,'PUT');if(version===revision.current)setStatus({saving:false,error:''});}catch(error){if(version===revision.current)setStatus({saving:false,error:messageOf(error)});}});}
  useEffect(()=>subscribeLocale(()=>{
    const language=getLocale();
    if(current.current.language===language)return;
    localeChanged.current=true;
    current.current=appearanceAfterPatch(current.current,{},language);
    setAppearance(current.current);
  }),[]);
  useEffect(()=>{let disposed=false;api<Appearance|null>('/settings/appearance').then(saved=>{if(disposed)return;const result=reconcileAppearanceLoad(defaultAppearance,saved,current.current,changed.current,getLocale(),localeChanged.current);current.current=result.appearance;setAppearance(result.appearance);setLocale(result.appearance.language);ready.current=true;changed.current={};if(Object.keys(result.patch).length)persist(result.patch);}).catch(error=>{if(!disposed){ready.current=true;setStatus({saving:false,error:messageOf(error)});}});return()=>{disposed=true;};},[]);
  useEffect(()=>{
    // Cache accelerates first paint; the local service is the durable source across desktop ports.
    try{localStorage.setItem(key,JSON.stringify(appearance));}catch{}
    const root=document.documentElement;root.dataset.atmosphere=appearance.atmosphere;root.dataset.accent=appearance.accent;root.dataset.motion=appearance.motion;root.dataset.sendKey=appearance.sendKey;
    root.style.setProperty('--hither-panel-opacity',`${appearance.opacity}%`);
    for(const [name,offset] of [['body',0],['label',0],['caption',-1],['meta',-2]] as const)root.style.setProperty(`--hither-font-${name}`,`${Math.max(12,appearance.fontSize+offset)}px`);
    root.style.setProperty('--hither-user-font-size',`${appearance.fontSize}px`);
  },[appearance]);
  return [appearance,(update:Partial<Appearance>)=>{changed.current={...changed.current,...update};const next=appearanceAfterPatch(current.current,update,getLocale());current.current=next;setAppearance(next);if(update.language)setLocale(update.language);if(ready.current){const patch=changed.current;changed.current={};persist(patch);}},status] as const;
}
export function shouldSend(event: {key:string;shiftKey:boolean;metaKey:boolean;ctrlKey:boolean;nativeEvent:{isComposing:boolean}}) {return event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&(document.documentElement.dataset.sendKey!=='modifier'||event.metaKey||event.ctrlKey);}
